// AI (OpenAI API) integratsiyasi - YANGI ARXITEKTURA.
//
// Eski tizimda har bir "qadam" (ism, soni, muddat...) uchun alohida tor AI so'rovi bo'lgan
// va suhbat tarixi qadamlar orasida tozalanardi. Endi BUTUN suhbat tarixi saqlanadi va
// har bir mijoz xabari uchun IKKI bosqichli AI chaqirig'i ishlatiladi:
//
//   1) extractTurn  - mijoz xabaridan FAKTLARNI ajratib oladi (ism, mahsulot/kategoriya,
//                      soni, tanlangan narx, telefon, muddat, bekor/operator/tasdiqlash niyati,
//                      mavzudan tashqari savol). Bu funksiya hech narsa "to'qib chiqarmaydi" -
//                      faqat mijoz nima degani haqida struktura qaytaradi.
//   2) composeReply - orderFlow.js JS orqali ANIQ hisoblagan faktlarni (narxlar, mahsulot
//                      ro'yxati va h.k.) tabiiy, suhbatdosh tilda javobga aylantiradi. Bu
//                      funksiya RAQAMLARNI O'ZI HISOBLAMAYDI - faqat berilgan faktlarni
//                      chiroyli jumla qilib beradi (shu sabab narx xato bo'lib qolmaydi).
//
// OPENAI_API_KEY sozlanmagan bo'lsa, ikkisi ham null qaytaradi - orderFlow.js o'zining
// oddiy (AI'siz) zaxira matnlariga o'tadi.

const config = require("./config");

const API_URL = "https://api.openai.com/v1/responses";

function langName(lang) {
  return lang === "ru" ? "rus" : "o'zbek";
}

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

async function extractTurn(senderId, history, lang, state, categories) {
  state = state || {};
  const instructions = [
    "Sen Instagram do'koni uchun mijozlar bilan suhbatlashadigan sotuv yordamchisisan.",
    "Vazifang JAVOB YOZISH EMAS - faqat mijozning SO'NGGI xabaridan (oldingi suhbat kontekstini hisobga olib) quyidagi faktlarni ajratib olish:",
    "- language: mijoz qaysi tilda yozayotgani - 'uz' (o'zbek, lotin yoki kirill) yoki 'ru' (rus). Butun suhbat kontekstidan kelib chiq, faqat oxirgi xabardan emas - agar mijoz avval \"o'zbekcha gaplasha olasizmi\" kabi aniq aytgan bo'lsa, shuni hisobga ol va keyingi xabarlarda ham 'uz' deb belgilashda davom et.",
    "- script: agar til 'uz' bo'lsa - mijoz lotin ('latin') yoki kirill ('cyrillic') alifbosida yozayapti. Til 'ru' bo'lsa - har doim 'cyrillic'.",
    "- customer_name: agar mijoz ismini aytgan bo'lsa (oldin aytilmagan bo'lsa).",
    "- likely_gender: agar ism aytilgan bo'lsa, shu ism odatda erkak ('male') yoki ayolga ('female') tegishli ekanini taxmin qil; aniq bo'lmasa null.",
    "- category: agar mijoz quyidagi kategoriyalardan biriga ishora qilsa (to'g'ridan-to'g'ri yoki tabiiy so'z bilan) - ANIQ shu ro'yxatdagi nomni yoz: " + categories.join(", ") + ". Mos kelmasa null.",
    "- product_text: agar mijoz aniq mahsulot nomini aytsa (masalan 'ruchka', 'futbolka') - shu matnni yoz (xato/qisqa yozilgan bo'lsa ham, tushunarli holatda). Aks holda null.",
    "- quantity: agar mijoz miqdor aytsa (masalan '10 ta', '50 dona') - shu sondagi BUTUN SON (integer). Aks holda null.",
    "- selected_price: agar mijoz avval taklif qilingan narx variantlaridan birini tanlasa (masalan '30 minglik bo'lsin', 'ikkinchisi') - shu narxni SON sifatida yoz (masalan 30000). Aniq bo'lmasa null.",
    "- phone: agar mijoz telefon raqam yozsa - shuni yoz. Aks holda null.",
    "- deadline: agar mijoz mahsulot qachongacha kerakligini aytsa (masalan 'ertaga', '3 kun ichida') - shuni yoz. Aks holda null.",
    "- wants_cancel: mijoz suhbatni/buyurtmani bekor qilishni, to'xtatishni xohlasa true.",
    "- wants_operator: mijoz jonli odam/operator bilan gaplashishni xohlasa, yoki buyurtmasini hozir RASMIYLASHTIRISHGA (yakuniy tasdiqlashga) tayyor bo'lsa true.",
    "- objection_text: agar mijoz e'tiroz/shubha bildirsa - narx qimmat deb o'ylasa, boshqa joyda arzonroq borligini aytsa, ishonchsizlik bildirsa, ikkilansa - shu e'tirozni qisqacha yoz (masalan 'narx qimmat'). Aks holda null.",
    "- off_topic_question: FAQAT agar mijoz ANIQ, TUSHUNARLI va sotuvga aloqasi yo'q haqiqiy savol bersa (masalan 'ish vaqtingiz qachongacha', 'qayerda joylashgansiz') - shu savolni qisqacha yoz. MUHIM: agar xabar tushunarsiz/ma'nosiz bo'lsa, buni off_topic_question deb belgilama (hatto unda tanish so'z - masalan 'kiber', 'internet' kabi - uchragan taqdirda ham) - bunday holda buni is_unclear=true qilib belgilash kerak, off_topic_question esa null qoladi.",
    "- is_unclear: mijoz xabari tushunarsiz, ma'nosiz so'zlar to'plami, yoki aniq mantiqsiz bo'lsa true. Bunday holda boshqa hech qaysi maydonni (off_topic_question ham) to'ldirma - faqat is_unclear=true qil.",
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
        objection_text: { type: ["string", "null"] },
        off_topic_question: { type: ["string", "null"] },
        is_unclear: { type: "boolean" },
      },
      required: [
        "language", "script", "customer_name", "likely_gender", "category", "product_text", "quantity",
        "selected_price", "phone", "deadline", "wants_cancel", "wants_operator", "objection_text",
        "off_topic_question", "is_unclear",
      ],
      additionalProperties: false,
    },
  };

  return callTool(senderId, instructions, history, tool);
}

async function composeReply(senderId, history, lang, situation, addressName, factsBlock, script) {
  const scriptNote =
    lang === "uz"
      ? script === "cyrillic"
        ? "Mijoz o'zbek tilida KIRILL alifbosida yozayapti - sen ham albatta KIRILL alifbosida yoz (lotin emas)."
        : "Mijoz o'zbek tilida LOTIN alifbosida yozayapti - sen ham lotin alifbosida yoz."
      : "Javobni rus tilida yoz.";

  const guardrail =
    "QATTIQ QOIDA: Sen FAQAT \"" + (config.business.shopName || "Gift Master") + "\" do'koni va uning mahsulotlari haqida gaplashasan. " +
    "Agar mijoz butunlay aloqasiz, tushunarsiz yoki boshqa sohaga oid (texnik, ilmiy, umumiy bilim va h.k.) narsa so'rasa - " +
    "O'ZINGNING UMUMIY BILIMINGDAN FOYDALANIB JAVOB BERMA. Faqat: mavzuga aloqasi yo'qligini muloyimlik bilan ayt va sotuvga qaytar. " +
    "Sen hech qachon do'kon mavzusidan tashqari (masalan texnologiya, sog'liq, umumiy maslahat) ekspert sifatida javob bermaysan.";

  const behaviorRules = 
    "SOTUV PSIXOLOGIYASI VA E'TIROZLAR: Agar mijoz e'tiroz bildirsa (masalan 'qimmat', 'boshqa joyda arzon'), darhol himoyalanma yoki uzr so'rama. Mahsulot/xizmat sifatiga, korporativ yondashuvga urg'u berib, professional qisqa argument keltir.\n" +
    "TAQIQLANGAN SO'ZLAR: Suhbat yakuniy bosqichga yetmagunicha (mijoz aniq xaridni rad etmagunicha yoki to'liq tugatmagunicha) HECH QACHON 'Yana qanday yordam bera olaman?', 'Boshqa savollaringiz bormi?' kabi standart shablonlarni ishlatma. Faqat ayni paytdagi mavzu bo'yicha keyingi mantiqiy qadamga yetakla.";

  const instructions = factsBlock
    ? [
        "Sen \"" + (config.business.shopName || "Gift Master") + "\" do'koni uchun Instagram'da mijozlar bilan suhbatlashadigan, juda muloyim va tabiiy gapiruvchi sotuv yordamchisisan.",
        guardrail,
        behaviorRules,
        "Quyida JS tizimi tomonidan TAYYORLANGAN holat tasviri berilgan:",
        "--- HOLAT ---",
        situation,
        "--- HOLAT TUGADI ---",
        "MUHIM QOIDA: Mijozga ANIQ NARX/RAQAMLAR ko'rsatiladigan alohida blok BOR - bu blokni SEN YOZMAYSAN, tizim avtomat qo'yadi. Sening vazifang FAQAT ikkita qisqa matn yozish:",
        "  1) intro - shu narx blokidan OLDIN aytiladigan 1 jumlali kirish (masalan \"Albatta, mana narxlarimiz:\"). Bu yerda HECH QANDAY RAQAM/NARX YOZMA - chunki ular sendan KEYIN avtomat qo'shiladi, sen ularni hali bilmaysan deb hisobla.",
        "  2) closing - narx blokidan KEYIN aytiladigan qisqa savol/yopilish jumlasi (masalan \"Qaysi biri sizga mos keladi?\"). Bu yerda ham raqam yozma va UMUMIY yordam taklif qiluvchi so'zlarni ishlatma.",
        addressName ? ("Mijozga murojaat qilishda \"" + addressName + "\" dan foydalan (har xabarda emas, tabiiy joyda).") : "Mijozning ismi hali noma'lum.",
        scriptNote,
        "Qisqa va samimiy ohangda yoz.",
        "Faqat compose_reply_with_facts tool orqali javob ber.",
      ].join("\n")
    : [
        "Sen \"" + (config.business.shopName || "Gift Master") + "\" do'koni uchun Instagram'da mijozlar bilan suhbatlashadigan, juda muloyim va tabiiy gapiruvchi sotuv yordamchisisan.",
        guardrail,
        behaviorRules,
        "Quyida JS tizimi tomonidan TAYYORLANGAN holat tasviri berilgan - shu asosida tabiiy javob yoz (faktlarni o'zgartirma, to'qima):",
        "--- HOLAT ---",
        situation,
        "--- HOLAT TUGADI ---",
        addressName ? ("Mijozga murojaat qilishda \"" + addressName + "\" dan foydalan (har xabarda emas, tabiiy joyda).") : "Mijozning ismi hali noma'lum - hali murojaat shaklini ishlatma.",
        scriptNote,
        "Qisqa va samimiy (lekin professional) ohangda yoz. Ortiqcha emodzi ishlatma (kerak bo'lsa 1 tadan oshmasin).",
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
            intro: { type: "string", description: "Narx blokidan OLDIN keladigan qisqa kirish jumlasi. Raqam yozma." },
            closing: { type: "string", description: "Narx blokidan KEYIN keladigan qisqa savol/yopilish jumlasi. Raqam yozma." },
          },
          required: ["intro", "closing"],
          additionalProperties: false,
        },
      }
    : {
        type: "function",
        name: "compose_reply",
        description: "Berilgan holat tasvirini tabiiy, suhbatdosh javobga aylantiradi.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            reply: { type: "string", description: "Mijozga yuboriladigan yakuniy javob matni" },
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
