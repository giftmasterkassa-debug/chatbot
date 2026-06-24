// AI (OpenAI API) integratsiyasi - YANGI ARXITEKTURA + PROFESSIONAL SOTUVCHI SHAXSIYATI.
//
// 1) extractTurn  - mijoz xabaridan FAKTLARNI ajratib oladi (ism, mahsulot/kategoriya, soni,
//                    tanlangan narx, telefon, e'tiroz TURI, bekor/operator niyati, mavzudan
//                    tashqari savol). Hech narsa "to'qib chiqarmaydi" - faqat struktura beradi.
// 2) composeReply - JS hisoblagan ANIQ faktlarni (narxlar va h.k.) professional, tajribali
//                    B2B sotuvchi ohangida javobga aylantiradi. Raqamlarni o'zi yozmaydi -
//                    shu sabab narx hech qachon xato bo'lib qolmaydi. Bundan tashqari:
//                    - umumiy/zerikarli yopilish jumlalarini (masalan "yana qanday yordam
//                      bera olaman?") ISHLATMASLIKKA majburlanadi - har javob ANIQ keyingi
//                      qadam (savol/taklif/CTA) bilan tugaydi.
//                    - e'tirozlarga TURI bo'yicha (narx/ishonch/vaqt/raqobatchi/ikkilanish)
//                      mos sotuv taktikasi bilan javob beradi.
//
// OPENAI_API_KEY sozlanmagan bo'lsa, ikkisi ham null qaytaradi - orderFlow.js o'zining
// oddiy (AI'siz) zaxira matnlariga o'tadi.

const config = require("./config");

const API_URL = "https://api.openai.com/v1/responses";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 24;
const rateMap = new Map();

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

async function callTool(senderId, instructions, history, tool) {
  if (!config.ai.apiKey) return null;
  if (isRateLimited(senderId)) return null;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.ai.apiKey },
      body: JSON.stringify({
        model: config.ai.model,
        instructions: instructions,
        input: history,
        tools: [tool],
        tool_choice: { type: "function", name: tool.name },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(function () { return ""; });
      console.error("AI API xatosi:", res.status, errText);
      return null;
    }

    const data = await res.json();
    const call = (data.output || []).find(function (o) { return o.type === "function_call" && o.name === tool.name; });
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

// ============================================================================
// 1-BOSQICH: extractTurn
// ============================================================================
async function extractTurn(senderId, history, lang, state, categories) {
  state = state || {};
  const instructions = [
    "Sen Instagram do'koni uchun mijozlar bilan suhbatlashadigan sotuv yordamchisisan.",
    "Vazifang JAVOB YOZISH EMAS - faqat mijozning SO'NGGI xabaridan (oldingi suhbat kontekstini hisobga olib) quyidagi faktlarni ajratib olish:",
    "- language: mijoz qaysi tilda yozayotgani - 'uz' (o'zbek, lotin yoki kirill) yoki 'ru' (rus). Butun suhbat kontekstidan kelib chiq - agar mijoz avval \"o'zbekcha gaplasha olasizmi\" kabi aniq aytgan bo'lsa, shuni hisobga ol va keyingi xabarlarda ham shu tilda davom et.",
    "- script: agar til 'uz' bo'lsa - mijoz lotin ('latin') yoki kirill ('cyrillic') alifbosida yozayapti. Til 'ru' bo'lsa - har doim 'cyrillic'.",
    "- customer_name: agar mijoz ismini aytgan bo'lsa (oldin aytilmagan bo'lsa).",
    "- likely_gender: agar ism aytilgan bo'lsa, shu ism odatda erkak ('male') yoki ayolga ('female') tegishli ekanini taxmin qil; aniq bo'lmasa null.",
    "- category: agar mijoz quyidagi kategoriyalardan biriga ishora qilsa - ANIQ shu ro'yxatdagi nomni yoz: " + categories.join(", ") + ". Mos kelmasa null.",
    "- product_text: agar mijoz aniq mahsulot nomini aytsa (masalan 'ruchka', 'futbolka', 'kalendar') - shu matnni yoz (xato/qisqa yozilgan bo'lsa ham, tushunarli holatda). Aks holda null.",
    "- quantity: agar mijoz miqdor aytsa (masalan '10 ta', '50 dona') - shu sondagi BUTUN SON (integer). Aks holda null.",
    "- selected_price: agar mijoz avval taklif qilingan narx variantlaridan birini ANIQ XARID QILISH NIYATIDA TANLASA (masalan '30 minglik bo'lsin', 'shu 55 mingligidan olaman') - shu narxni SON sifatida yoz. QAT'IY QOIDA: agar mijoz narxni SAVOL ko'rinishida ishlatsa yoki arzonrog'ini so'rasa (masalan '55 mingdan arzoni bormi?') - bu TANLASH EMAS, null qaytar.",
    "- phone: agar mijoz telefon raqam yozsa - shuni yoz. Aks holda null.",
    "- deadline: agar mijoz mahsulot qachongacha kerakligini aytsa - shuni yoz. Aks holda null.",
    "- wants_cancel: mijoz suhbatni/buyurtmani bekor qilishni xohlasa true.",
    "- wants_operator: mijoz jonli odam/operator bilan gaplashishni xohlasa, yoki buyurtmasini hozir RASMIYLASHTIRISHGA tayyor bo'lsa true.",
    "- objection_type: mijoz e'tiroz/ikkilanish bildirsa, TURINI tanla: 'price' (narx qimmat/arzonrog'i bormi), 'trust' (ishonmaslik, kompaniya/sifat haqida shubha), 'timing' (hozir kerak emas, keyinroq), 'competitor' (boshqa joyda ko'rgan/arzon topgan), 'hesitation' (o'ylab ko'raman, ikkilanish, sababsiz sukut), 'other'. E'tiroz bo'lmasa null.",
    "- objection_text: agar objection_type berilgan bo'lsa, mijozning aynan nima degani qisqa matn sifatida. Aks holda null.",
    "- off_topic_question: FAQAT agar mijoz ANIQ, TUSHUNARLI va sotuvga aloqasi yo'q haqiqiy savol bersa (masalan 'ish vaqtingiz qachongacha') - shu savolni qisqacha yoz. Tushunarsiz/ma'nosiz xabarni BUNGA KIRITMA (is_unclear ishlatilsin).",
    "- is_unclear: mijoz xabari tushunarsiz, ma'nosiz so'zlar to'plami, yoki aniq mantiqsiz bo'lsa true.",
    "Hozircha ma'lum holat: ism=" + (state.name || "noma'lum") + ", joriy kategoriya=" + (state.category || "yo'q") + ", joriy mahsulot=" + (state.focusProduct || "yo'q") + ", savatda mahsulot bor=" + (state.hasItems ? "ha" : "yo'q") + ", telefon bor=" + (state.hasPhone ? "ha" : "yo'q") + ".",
    "Bir xabarda bir nechta fakt birga kelishi mumkin - hammasini ajratib ol.",
    "Faqat extract_turn tool orqali javob ber, undan tashqari hech qanday matn yozma.",
  ].join(" ");

  const tool = {
    type: "function",
    name: "extract_turn",
    description: "Mijoz xabaridan suhbat uchun kerakli faktlarni ajratib oladi.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["uz", "ru"] },
        script: { type: "string", enum: ["latin", "cyrillic"] },
        customer_name: { type: ["string", "null"] },
        likely_gender: { type: ["string", "null"], enum: ["male", "female", null] },
        category: { type: ["string", "null"] },
        product_text: { type: ["string", "null"] },
        quantity: { type: ["integer", "null"] },
        selected_price: { type: ["integer", "null"] },
        phone: { type: ["string", "null"] },
        deadline: { type: ["string", "null"] },
        wants_cancel: { type: "boolean" },
        wants_operator: { type: "boolean" },
        objection_type: { type: ["string", "null"], enum: ["price", "trust", "timing", "competitor", "hesitation", "other", null] },
        objection_text: { type: ["string", "null"] },
        off_topic_question: { type: ["string", "null"] },
        is_unclear: { type: "boolean" },
      },
      required: [
        "language", "script", "customer_name", "likely_gender", "category", "product_text", "quantity",
        "selected_price", "phone", "deadline", "wants_cancel", "wants_operator",
        "objection_type", "objection_text", "off_topic_question", "is_unclear",
      ],
      additionalProperties: false,
    },
  };

  return callTool(senderId, instructions, history, tool);
}

// ============================================================================
// Sotuv taktikasi: e'tiroz turi bo'yicha aniq yo'riqnoma (AI'ga "qanaqa javob ber" deb
// emas, "qaysi TAKTIKANI ishlat" deb ko'rsatiladi - bu yuzaki javoblarning oldini oladi).
// ============================================================================
const OBJECTION_TACTICS = {
  price: "TAKTIKA - NARX E'TIROZI: 'Nima qoniqtirmadi?' kabi savol BERMA. Buning o'rniga QIYMATGA o'tkaz: sifat, kafolat, o'z vaqtida bajarish, ulgurji miqdorda narx tushishi haqida 1 jumla ayt. Agar holatda arzonroq variant ko'rsatilgan bo'lsa - shuni aniq taklif qil. Agar yo'q bo'lsa - miqdorni oshirsa narx tushishini ayt.",
  trust: "TAKTIKA - ISHONCH E'TIROZI: Mijozning xavotirini tabiiy qabul qil (himoyalanma, bahslashma). Kompaniyaning ishlash tartibi (oldindan namuna ko'rsatish, bosqichma-bosqich to'lov, aniq muddat) haqida ishonch beruvchi 1-2 jumla ayt. Bosim qilma.",
  timing: "TAKTIKA - VAQT E'TIROZI ('hozir kerak emas'): Bosim qilma, lekin eshikni ochiq qoldir - masalan keyinroq narxlar o'zgarishi mumkinligini yoki shu kunlarda chegirma borligini (agar haqiqatan bo'lsa) eslatib, kelishilgan vaqtda yana murojaat qilishini so'ra.",
  competitor: "TAKTIKA - RAQOBATCHI E'TIROZI: Raqobatchini yomonlama va narxini taxmin qilma. O'zingning aniq afzalliklaringizga (sifat nazorati, muddat kafolati, ulgurji shartlar) urg'u ber, va aynan shu mahsulot/miqdor uchun ANIQ narxni qayta tasdiqla.",
  hesitation: "TAKTIKA - IKKILANISH: Haqiqiy ehtiyojni biluvchi 1 ta ochiq, hurmatli savol ber (masalan byudjet, dizayn yoki miqdor noaniqligi sabab bo'lganini so'ra) - bosim qilmasdan, suhbatni davom ettirish uchun.",
  other: "Mijozning aynan nima dema xohlaganini tushunib, qisqa, halol va yordam beruvchi tarzda javob ber.",
};

const BANNED_CLOSINGS_NOTE =
  "QATTIQ TAQIQ: quyidagi kabi umumiy, mazmunsiz yopilish jumlalarini HECH QACHON ishlatma (yoki ularning ma'nodosh variantlarini): " +
  "\"Yana qanday yordam bera olaman?\", \"Boshqa savollaringiz bo'lsa murojaat qiling\", \"Savolingiz bo'lsa bemalol yozing\", " +
  "\"Sizga yordam berishdan mamnunman\", \"Yaxshi kun tilayman\", \"Rahmat, ko'rishguncha\". " +
  "Buning o'rniga HAR DOIM holatda ko'rsatilgan ANIQ keyingi qadam (masalan miqdorni so'rash, narx variantini taklif qilish, telefon so'rash, " +
  "ulgurji takliflarni eslatish) bilan tugat - bu CTA (Call-to-Action) konkret va shu mijozning aynan shu vaziyatiga tegishli bo'lishi shart.";

// ============================================================================
// 2-BOSQICH: composeReply
// ============================================================================
async function composeReply(senderId, history, lang, situation, addressName, factsBlock, script, objectionType) {
  const scriptNote =
    lang === "uz"
      ? script === "cyrillic"
        ? "Mijoz o'zbek tilida KIRILL alifbosida yozayapti - sen ham albatta KIRILL alifbosida yoz (lotin emas)."
        : "Mijoz o'zbek tilida LOTIN alifbosida yozayapti - sen ham lotin alifbosida yoz."
      : "Javobni rus tilida yoz.";

  const persona =
    "Sen \"" + (config.business.shopName || "Gift Master") + "\" do'konining KO'P YILLIK TAJRIBALI, XALQARO DARAJADAGI B2B SOTUV EKSPERTISAN. " +
    "Muloyim, lekin 'suvsiz' (ortiqcha hissiyotsiz, londa, faktlarga asoslangan) va to'g'ridan-to'g'ri gaplashasan. " +
    "'Tushunaman', 'Juda yaxshi savol', 'Albatta!' kabi cho'ziluvchan kirish so'zlaridan saqlan - to'g'ridan-to'g'ri mazmunga o't.";

  const guardrail =
    "QATTIQ QOIDA: Mijozga HECH QACHON \"do'konga murojaat qiling\", \"menejerga yozing\" yoki \"narxni bilish uchun qo'ng'iroq qiling\" deb aytma - " +
    "narxlarni HAR DOIM SEN o'zing aytasan (tizim bergan tayyor raqamlar orqali). O'zingdan narx, xususiyat yoki va'dani to'qib chiqarma.";

  const upsell =
    "IMKONIYAT BO'LSA (faqat tabiiy mos kelganda, har safar emas): mijoz ma'lum mahsulot/miqdor so'rasa, " +
    "quruq narx aytib to'xtama - agar holatda \"qo'shimcha taklif\" ko'rsatilgan bo'lsa, shuni tabiiy ravishda (bosim qilmasdan) taklif qil " +
    "(masalan ulgurji chegirma yoki birga olinadigan mahsulot).";

  const objectionGuidance = objectionType
    ? "MIJOZ E'TIROZ BILDIRDI (turi: " + objectionType + "). " + (OBJECTION_TACTICS[objectionType] || OBJECTION_TACTICS.other)
    : "";

  const baseRules = [persona, guardrail, upsell, objectionGuidance, BANNED_CLOSINGS_NOTE].filter(Boolean).join("\n");

  const instructions = factsBlock
    ? [
        baseRules,
        "Quyida JS tizimi tomonidan TAYYORLANGAN holat tasviri berilgan:",
        "--- HOLAT ---",
        situation,
        "--- HOLAT TUGADI ---",
        "MUHIM: Mijozga ANIQ NARX/RAQAMLAR ko'rsatiladigan alohida blok BOR - bu blokni SEN YOZMAYSAN, tizim avtomat qo'yadi. Sening vazifang FAQAT ikkita qisqa matn yozish:",
        "  1) intro - narx blokidan OLDIN keladigan 1 jumlali professional kirish. RAQAM YOZMA.",
        "  2) closing - narx blokidan KEYIN keladigan ANIQ keyingi qadam (savol/taklif). RAQAM YOZMA. Yuqoridagi taqiqlangan jumlalardan foydalanma.",
        addressName ? ("Mijozga murojaat qilishda \"" + addressName + "\" dan foydalan (har xabarda emas, tabiiy joyda).") : "Mijozning ismi hali noma'lum.",
        scriptNote,
        "Faqat compose_reply_with_facts tool orqali javob ber.",
      ].join("\n")
    : [
        baseRules,
        "Quyida JS tizimi tomonidan TAYYORLANGAN holat tasviri berilgan - shu asosida javob yoz (faktlarni o'zgartirma, to'qima):",
        "--- HOLAT ---",
        situation,
        "--- HOLAT TUGADI ---",
        addressName ? ("Mijozga murojaat qilishda \"" + addressName + "\" dan foydalan (har xabarda emas, tabiiy joyda).") : "Mijozning ismi hali noma'lum - hali murojaat shaklini ishlatma.",
        scriptNote,
        "Javob ANIQ keyingi qadam bilan tugashi shart (yuqoridagi taqiqlangan jumlalardan foydalanma).",
        "Hech qachon mavjud bo'lmagan narx, mahsulot yoki ma'lumotni o'zingdan to'qib chiqarma.",
        "Faqat compose_reply tool orqali javob ber.",
      ].join("\n");

  const tool = factsBlock
    ? {
        type: "function",
        name: "compose_reply_with_facts",
        description: "Narx blokidan oldin va keyin keladigan qisqa matnlarni yozadi. Raqam/narx yozmaydi - buni tizim avtomat qo'shadi.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            intro: { type: "string", description: "Narx blokidan OLDIN keladigan qisqa professional kirish. Raqam yozma." },
            closing: { type: "string", description: "Narx blokidan KEYIN keladigan ANIQ keyingi qadam (savol/taklif). Umumiy/zerikarli jumla emas." },
          },
          required: ["intro", "closing"],
          additionalProperties: false,
        },
      }
    : {
        type: "function",
        name: "compose_reply",
        description: "Berilgan holat tasvirini professional sotuvchi ohangida, ANIQ keyingi qadam bilan tugaydigan javobga aylantiradi.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            reply: { type: "string", description: "Mijozga yuboriladigan yakuniy javob matni - ANIQ keyingi qadam bilan tugashi shart" },
          },
          required: ["reply"],
          additionalProperties: false,
        },
      };

  const result = await callTool(senderId, instructions, history, tool);
  if (!result) return null;

  if (factsBlock) {
    const intro = (result.intro || "").trim();
    const closing = (result.closing || "").trim();
    return [intro, factsBlock, closing].filter(Boolean).join("\n\n");
  }
  return result.reply;
}

module.exports = { extractTurn: extractTurn, composeReply: composeReply };
