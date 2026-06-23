// AI (OpenAI API) integratsiyasi.
// Buyurtma jarayonida mijoz erkin yozgan matndan ism, mahsulot, soni va muddatni
// ajratib oladi; agar noaniq/xato yozilgan bo'lsa, aniqlashtiruvchi savol qaytaradi.
//
// OPENAI_API_KEY .env faylida sozlanmagan bo'lsa, bu funksiyalar null qaytaradi
// va orderFlow.js o'zining oddiy (AI'siz) zaxira mantiqiga o'tadi.

const config = require("./config");

// OpenAI Responses API - https://platform.openai.com/docs/api-reference/responses
const API_URL = "https://api.openai.com/v1/responses";

function langName(lang) {
  return lang === "ru" ? "rus" : "o'zbek";
}

// --- Oddiy himoya: bir mijoz juda ko'p AI so'rovi yubormasligi uchun (xato/spam holatlarida
// hisobni keraksiz oshirib yubormaslik). Bir mijoz uchun 5 daqiqada 12 tadan ortiq AI chaqirig'i
// bo'lsa, vaqtincha AI o'chiriladi (chaqiruvchi - orderFlow.js - o'zining zaxira mantiqiga o'tadi).
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 12;
const rateMap = new Map(); // senderId -> { count, windowStart }

function isRateLimited(senderId) {
  if (!senderId) return false;
  const now = Date.now();
  const entry = rateMap.get(senderId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateMap.set(senderId, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    console.warn("AI so'rov chegarasi (rate limit) oshib ketdi: " + senderId);
    return true;
  }
  return false;
}

// OpenAI Responses API'ga so'rov yuborib, majburiy ("strict") tool chaqirig'idan
// natijani olamiz. history - [{role:"user"|"assistant", content:"..."}] ko'rinishida.
async function callTool(senderId, instructions, history, tool) {
  if (!config.ai.apiKey) return null;
  if (isRateLimited(senderId)) return null;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.ai.apiKey,
      },
      body: JSON.stringify({
        model: config.ai.model,
        instructions: instructions,
        input: history,
        tools: [tool],
        tool_choice: { type: "function", name: tool.name },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("AI API xatosi:", res.status, errText);
      return null;
    }

    const data = await res.json();
    const call = (data.output || []).find((o) => o.type === "function_call" && o.name === tool.name);
    if (!call) return null;

    try {
      return JSON.parse(call.arguments);
    } catch (e) {
      console.error("AI javobini o'qishda xato:", e.message);
      return null;
    }
  } catch (e) {
    console.error("AI API ulanish xatosi:", e.message);
    return null;
  }
}

async function extractNameAndProduct(senderId, history, lang, current) {
  current = current || {};
  const catalogNames = [...new Set(config.catalog.map(function (p) { return p.name; }))];
  const productsHint = catalogNames.length
    ? "Do'konda sotiladigan mahsulotlar FAQAT shu ro'yxatdagilar: " + catalogNames.join(", ") + ". " +
      "Mijoz so'ragan narsani shu ro'yxat bilan solishtir: " +
      "1) Agar mijoz ro'yxatdagi biror mahsulotni xato, qisqartirib, imlo xatosi bilan yoki boshqacha nom bilan yozgan bo'lsa (lekin aslida shu mahsulotni nazarda tutgani aniq bo'lsa) - product maydoniga ro'yxatdagi nomni AYNAN, harfma-harf, o'zgartirmasdan yoz, va qisqa savol bilan tasdiqlashni so'ra. " +
      "2) Agar mijoz so'ragan narsa ro'yxatdagi HECH BIR mahsulotga mos kelmasa (ya'ni haqiqatan do'konda mavjud bo'lmagan, butunlay boshqa narsa) - bu holda product maydonini null qoldir, needs_clarification=true qil, va clarification_question ichida: avval so'ralgan narsa hozircha mavjud emasligini muloyim ayt, so'ng do'kondagi mavjud mahsulotlar ro'yxatini sanab o't va ulardan birini tanlashni so'ra."
    : "Do'konning aniq mahsulotlar ro'yxati berilmagan. Mijoz aytgan mahsulot nomini tabiiy tilda tushunib oling; " +
      "agar imlosi yoki ma'nosi noaniq/chala bo'lsa, qaysi mahsulotni nazarda tutganini qisqa savol bilan aniqlashtiring.";

  const instructions = [
    "Sen Instagram do'koni uchun avtomat buyurtma yordamchisisan.",
    "Vazifang: mijoz xabar(lar)idan uning ismini va qaysi mahsulotga qiziqayotganini ajratib olish.",
    productsHint,
    "Hozircha ma'lum bo'lgan ma'lumot: ism = " + (current.name || "noma'lum") + ", mahsulot = " + (current.product || "noma'lum") + ".",
    "Agar ism yoki mahsulot hali noma'lum yoki noaniq bo'lsa, needs_clarification ni true qil va clarification_question maydoniga " + langName(lang) + " tilida qisqa, do'stona savol yoz.",
    "Agar ism va mahsulot ikkisi ham yetarlicha aniq bo'lsa, needs_clarification ni false qil.",
    "Faqat extract_order_info tool orqali javob ber, undan tashqari hech qanday matn yozma.",
  ].join(" ");

  const tool = {
    type: "function",
    name: "extract_order_info",
    description: "Mijoz xabaridan ism va mahsulotni ajratib oladi, kerak bo'lsa aniqlashtiruvchi savol qaytaradi.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        name: { type: ["string", "null"], description: "Mijozning ismi, agar aytilgan bo'lsa" },
        product: { type: ["string", "null"], description: "Mijoz qiziqayotgan mahsulot nomi, aniqlangan/to'g'rilangan holatda" },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: ["string", "null"] },
      },
      required: ["name", "product", "needs_clarification", "clarification_question"],
      additionalProperties: false,
    },
  };

  return callTool(senderId, instructions, history, tool);
}

async function extractQuantityOnly(senderId, history, lang, current) {
  current = current || {};
  const instructions = [
    "Sen Instagram do'koni uchun avtomat buyurtma yordamchisisan.",
    "Vazifang: mijoz xabar(lar)idan kerakli mahsulot sonini (necha dona) ajratib olish.",
    "Hozircha ma'lum bo'lgan ma'lumot: soni = " + (current.quantity || "noma'lum") + ".",
    "Agar soni hali noma'lum/noaniq bo'lsa, yoki mijoz javob o'rniga savol bersa, needs_clarification ni true qil va clarification_question maydoniga " + langName(lang) + " tilida qisqa savol yoz.",
    "Agar soni aniq bo'lsa, needs_clarification ni false qil. Sonni mijoz tushunarli yozgandek qisqa matn sifatida qaytar (masalan '5 dona').",
    "Faqat extract_quantity tool orqali javob ber, undan tashqari hech qanday matn yozma.",
  ].join(" ");

  const tool = {
    type: "function",
    name: "extract_quantity",
    description: "Mijoz xabaridan kerakli mahsulot sonini ajratib oladi, kerak bo'lsa aniqlashtiruvchi savol qaytaradi.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        quantity: { type: ["string", "null"], description: "Kerakli mahsulot soni, masalan '5 dona'" },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: ["string", "null"] },
      },
      required: ["quantity", "needs_clarification", "clarification_question"],
      additionalProperties: false,
    },
  };

  return callTool(senderId, instructions, history, tool);
}

async function extractQuantityAndBudget(senderId, history, lang, current) {
  current = current || {};
  const instructions = [
    "Sen Instagram do'koni uchun avtomat buyurtma yordamchisisan.",
    "Vazifang: mijoz xabar(lar)idan kerakli mahsulot sonini (necha dona) va u rozi bo'lgan taxminiy narxni (1 donaga necha so'm, yoki 'arzon'/'qimmat' kabi tabiiy ifodani) ajratib olish.",
    "Hozircha ma'lum bo'lgan ma'lumot: soni = " + (current.quantity || "noma'lum") + ", narx/byudjet = " + (current.budget || "noma'lum") + ".",
    "Agar soni hali noma'lum bo'lsa, needs_clarification ni true qil va clarification_question maydoniga " + langName(lang) + " tilida qisqa savol yoz.",
    "Narx/byudjet haqida mijoz aniq raqam aytmasa ham bo'ladi (masalan 'arzonrog'i', 'sifatlisi') - buni ham qabul qil, faqat soni albatta kerak.",
    "Agar soni aniq bo'lsa, needs_clarification ni false qil (narx aniq aytilmagan bo'lsa ham). Soni va narx/byudjetni mijoz tushunarli yozgandek qisqa matn sifatida qaytar.",
    "Faqat extract_order_budget tool orqali javob ber, undan tashqari hech qanday matn yozma.",
  ].join(" ");

  const tool = {
    type: "function",
    name: "extract_order_budget",
    description: "Mijoz xabaridan soni va taxminiy narx/byudjetni ajratib oladi, kerak bo'lsa aniqlashtiruvchi savol qaytaradi.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        quantity: { type: ["string", "null"], description: "Kerakli mahsulot soni, masalan '100 dona'" },
        budget: { type: ["string", "null"], description: "Mijoz rozi bo'lgan taxminiy narx, masalan '10000 so'mgacha', 'arzonrog'i', '5000 atrofida'" },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: ["string", "null"] },
      },
      required: ["quantity", "budget", "needs_clarification", "clarification_question"],
      additionalProperties: false,
    },
  };

  return callTool(senderId, instructions, history, tool);
}

async function extractDeadline(senderId, history, lang) {
  const instructions = [
    "Sen Instagram do'koni uchun avtomat buyurtma yordamchisisan.",
    "Mijozdan butun buyurtma qachongacha tayyor/yetkazib berilishi kerakligini (muddatni) so'rading.",
    "Mijozning so'nggi xabarini tahlil qil: agar u haqiqatan muddat haqida javob bo'lsa (masalan 'ertaga', '3 kun ichida', 'tezroq kerak'), deadline maydoniga shu javobni qisqa matn sifatida yoz va needs_clarification ni false qil.",
    "Agar mijoz javob o'rniga SAVOL bersa (masalan 'odatda qancha vaqt ketadi?', 'tez tayyor bo'ladimi?') yoki muddatga aloqasi yo'q narsa yozsa - needs_clarification ni true qil. clarification_question maydoniga, agar mijoz savol bergan bo'lsa, avval shu savolga umumiy/qisqa javob ber (aniq raqam to'qib chiqarma, masalan 'bu odatda mahsulot va miqdorga bog'liq, operatorimiz aniq aytadi' kabi), so'ng mijozdan o'ziga qachongacha kerak ekanini qayta so'ra.",
    "Javobni " + langName(lang) + " tilida yoz. Faqat extract_deadline tool orqali javob ber, undan tashqari hech qanday matn yozma.",
  ].join(" ");

  const tool = {
    type: "function",
    name: "extract_deadline",
    description: "Mijoz xabaridan muddatni ajratib oladi, javob o'rniga savol bergan bo'lsa aniqlashtiradi.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        deadline: { type: ["string", "null"], description: "Mijoz aytgan muddat, masalan 'ertaga' yoki '3 kun ichida'" },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: ["string", "null"] },
      },
      required: ["deadline", "needs_clarification", "clarification_question"],
      additionalProperties: false,
    },
  };

  return callTool(senderId, instructions, history, tool);
}

module.exports = { extractNameAndProduct, extractQuantityOnly, extractQuantityAndBudget, extractDeadline };
