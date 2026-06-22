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

// OpenAI Responses API'ga so'rov yuborib, majburiy ("strict") tool chaqirig'idan
// natijani olamiz. history - [{role:"user"|"assistant", content:"..."}] ko'rinishida.
async function callTool(instructions, history, tool) {
  if (!config.ai.apiKey) return null;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        instructions,
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

// 1-qadam: ism va mahsulotni ajratib olish (kerak bo'lsa aniqlashtirib so'raydi).
// history: shu bosqichdagi suhbat tarixi. current: { name, product } - ma'lum qiymatlar.
async function extractNameAndProduct(history, lang, current = {}) {
  const productsHint = config.ai.products.length
    ? `Do'konda mavjud mahsulotlar ro'yxati: ${config.ai.products.join(", ")}. ` +
      `Mijoz mahsulot nomini xato, qisqartirib yoki boshqacha yozgan bo'lsa ham, ` +
      `shu ro'yxatdagi eng mos nomga moslab, savol orqali tasdiqlashni so'ra.`
    : `Do'konning aniq mahsulotlar ro'yxati berilmagan. Mijoz aytgan mahsulot nomini ` +
      `tabiiy tilda tushunib oling; agar imlosi yoki ma'nosi noaniq/chala bo'lsa, ` +
      `qaysi mahsulotni nazarda tutganini qisqa savol bilan aniqlashtiring.`;

  const instructions = [
    "Sen Instagram do'koni uchun avtomat buyurtma yordamchisisan.",
    "Vazifang: mijoz xabar(lar)idan uning ismini va qaysi mahsulotga qiziqayotganini ajratib olish.",
    productsHint,
    `Hozircha ma'lum bo'lgan ma'lumot: ism = ${current.name || "noma'lum"}, mahsulot = ${current.product || "noma'lum"}.`,
    `Agar ism yoki mahsulot hali noma'lum yoki noaniq bo'lsa, needs_clarification ni true qil va ` +
      `clarification_question maydoniga ${langName(lang)} tilida qisqa, do'stona savol yoz.`,
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

  return callTool(instructions, history, tool);
}

// 2-qadam: mahsulot soni va kerak bo'lish muddatini ajratib olish.
async function extractQuantityAndDeadline(history, lang, current = {}) {
  const instructions = [
    "Sen Instagram do'koni uchun avtomat buyurtma yordamchisisan.",
    "Vazifang: mijoz xabar(lar)idan kerakli mahsulot sonini (necha dona) va qachongacha tayyor bo'lishi kerakligini (muddat) ajratib olish.",
    `Hozircha ma'lum bo'lgan ma'lumot: soni = ${current.quantity || "noma'lum"}, muddat = ${current.deadline || "noma'lum"}.`,
    `Agar soni yoki muddat hali noma'lum/noaniq bo'lsa, needs_clarification ni true qil va ` +
      `clarification_question maydoniga ${langName(lang)} tilida qisqa savol yoz.`,
    "Agar ikkisi ham aniq bo'lsa, needs_clarification ni false qil. Soni va muddatni mijoz tushunarli " +
      "yozgandek qisqa matn sifatida qaytar (masalan soni: '5 dona', muddat: 'ertaga').",
    "Faqat extract_order_qty tool orqali javob ber, undan tashqari hech qanday matn yozma.",
  ].join(" ");

  const tool = {
    type: "function",
    name: "extract_order_qty",
    description: "Mijoz xabaridan soni va muddatni ajratib oladi, kerak bo'lsa aniqlashtiruvchi savol qaytaradi.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        quantity: { type: ["string", "null"], description: "Kerakli mahsulot soni, masalan '5 dona'" },
        deadline: { type: ["string", "null"], description: "Mahsulot qachongacha tayyor bo'lishi kerak, masalan 'ertaga' yoki '3 kun ichida'" },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: ["string", "null"] },
      },
      required: ["quantity", "deadline", "needs_clarification", "clarification_question"],
      additionalProperties: false,
    },
  };

  return callTool(instructions, history, tool);
}

module.exports = { extractNameAndProduct, extractQuantityAndDeadline };
