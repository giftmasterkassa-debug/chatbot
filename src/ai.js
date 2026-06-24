// AI (OpenAI API) integratsiyasi - PROFESSIONAL SOTUVCHI SHAXSIYATI (yangilangan).
//
// 1) extractTurn  - mijoz xabaridan FAKTLARNI ajratib oladi.
// 2) composeReply - JS hisoblagan ANIQ faktlarni professional, jonli sotuvchi ohangida
//                   javobga aylantiradi.
//
// YANGI QOIDALAR (sizning talablaringizga mos):
//   - Salomlashish qisqa va tabiiiy, mijoz matniga mos
//   - Katalog so'ralganda JSON dagi barcha kategoriyalar raqamlangan ro'yxat sifatida
//   - E'tirozlarga: "fikringiz to'g'ri, lekin..." uslubida (8 yillik tajriba, sifat, kafolat)
//   - "Yana yordam kerakmi?" kabi umumiy savollar TAQIQLANGAN
//   - Mijoz olmaydi desa - sabab aniqlansin, yechim taklif qilinsin
//   - Haqiqiy sotuvchidek ehtiyoj aniqlansin, bosim qilmasdan sotuvga olib borilsin

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
    "- language: mijoz qaysi tilda yozayotgani - 'uz' (o'zbek, lotin yoki kirill) yoki 'ru' (rus). Butun suhbat kontekstidan kelib chiq.",
    "- script: agar til 'uz' bo'lsa - mijoz lotin ('latin') yoki kirill ('cyrillic') alifbosida yozayapti. Til 'ru' bo'lsa - har doim 'cyrillic'.",
    "- customer_name: agar mijoz ismini aytgan bo'lsa (oldin aytilmagan bo'lsa).",
    "- likely_gender: agar ism aytilgan bo'lsa, shu ism odatda erkak ('male') yoki ayolga ('female') tegishli ekanini taxmin qil; aniq bo'lmasa null.",
    "- category: agar mijoz quyidagi kategoriyalardan biriga ishora qilsa - ANIQ shu ro'yxatdagi nomni yoz: " + categories.join(", ") + ". Mos kelmasa null.",
    "- product_text: agar mijoz aniq mahsulot nomini aytsa - shu matnni yoz. Aks holda null.",
    "- quantity: agar mijoz miqdor aytsa - shu sondagi BUTUN SON (integer). Aks holda null.",
    "- selected_price: agar mijoz avval taklif qilingan narx variantlaridan birini ANIQ XARID QILISH NIYATIDA TANLASA - shu narxni SON sifatida yoz. Savol ko'rinishida bo'lsa yoki arzonrog'ini so'rasa - null.",
    "- phone: agar mijoz telefon raqam yozsa - shuni yoz. Aks holda null.",
    "- deadline: agar mijoz mahsulot qachongacha kerakligini aytsa - shuni yoz. Aks holda null.",
    "- wants_cancel: mijoz suhbatni/buyurtmani bekor qilishni xohlasa true.",
    "- wants_operator: mijoz jonli odam/operator bilan gaplashishni xohlasa, yoki buyurtmasini hozir rasmiylashtirishga tayyor bo'lsa true.",
    "- wants_catalog: mijoz umumiy 'nima bor', 'mahsulotlaringiz', 'katalog', 'assortiment' kabi so'rasa TRUE. Bu alohida belgi - product_text dan farqli.",
    "- objection_type: mijoz e'tiroz/ikkilanish bildirsa TURINI tanla: 'price' (narx qimmat/arzonrog'i bormi), 'trust' (ishonmaslik, sifat shubhasi), 'timing' (hozir kerak emas), 'competitor' (boshqa joyda arzon topgan), 'refusal' (olmaydi/kerak emas desa - SABABI noma'lum), 'hesitation' (o'ylab ko'raman, ikkilanish). E'tiroz bo'lmasa null.",
    "- objection_text: agar objection_type berilgan bo'lsa, mijozning aynan nima degani qisqa matn sifatida. Aks holda null.",
    "- off_topic_question: FAQAT agar mijoz ANIQ, TUSHUNARLI va sotuvga aloqasi yo'q haqiqiy savol bersa (masalan 'ish vaqtingiz qachongacha') - shu savolni qisqacha yoz.",
    "- is_unclear: mijoz xabari tushunarsiz, ma'nosiz so'zlar to'plami bo'lsa true.",
    "Hozircha ma'lum holat: ism=" + (state.name || "noma'lum") + ", joriy kategoriya=" + (state.category || "yo'q") + ", joriy mahsulot=" + (state.focusProduct || "yo'q") + ", savatda mahsulot bor=" + (state.hasItems ? "ha" : "yo'q") + ", telefon bor=" + (state.hasPhone ? "ha" : "yo'q") + ".",
    "Faqat extract_turn tool orqali javob ber.",
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
        wants_catalog: { type: "boolean" },
        objection_type: {
          type: ["string", "null"],
          enum: ["price", "trust", "timing", "competitor", "refusal", "hesitation", null],
        },
        objection_text: { type: ["string", "null"] },
        off_topic_question: { type: ["string", "null"] },
        is_unclear: { type: "boolean" },
      },
      required: [
        "language", "script", "customer_name", "likely_gender", "category", "product_text",
        "quantity", "selected_price", "phone", "deadline", "wants_cancel", "wants_operator",
        "wants_catalog", "objection_type", "objection_text", "off_topic_question", "is_unclear",
      ],
      additionalProperties: false,
    },
  };

  return callTool(senderId, instructions, history, tool);
}

// ============================================================================
// E'tiroz turiga mos sotuv taktikalari
// ============================================================================
const OBJECTION_TACTICS = {
  price:
    "TAKTIKA - NARX E'TIROZI: Avval mijoz fikrini tasdiqla: \"Fikringiz to'g'ri, narx muhim\". " +
    "Keyin qiymatga o'tkaz: biz 8 yildan beri ishlaymiz, haqiqiy ustalar jamoasi, sifatga kafolat beramiz - " +
    "shuning uchun narx sifatga yarasha. Agar holatda arzonroq variant bo'lsa - shuni aniq taklif qil. " +
    "Agar miqdorni oshirsa narx tushishini ayt. Bosim qilma.",

  trust:
    "TAKTIKA - ISHONCH E'TIROZI: Mijozning xavotirini qabul qil, himoyalanma. " +
    "8 yillik ish tajriba, yuzlab korporativ mijozlar, namuna ko'rsatish imkoniyati, bosqichma-bosqich to'lov - " +
    "shulardan birini tabiiy tarzda eslatib o't. Shoshiltirma.",

  timing:
    "TAKTIKA - VAQT E'TIROZI: Bosim qilma. Tushun va qabul qil. " +
    "Lekin eshikni ochiq qoldir - masalan narxlar o'zgarishi yoki muddatga ulgurib bo'lmaslik xavfini " +
    "muloyim tarzda eslatib, qulay vaqtda qaytishini so'ra.",

  competitor:
    "TAKTIKA - RAQOBATCHI E'TIROZI: Raqobatchini hech qachon yomonlama. " +
    "O'zingning aniq afzalliklaringga (sifat nazorati, muddat kafolati, 8 yillik tajriba, haqiqiy ustalar) " +
    "urg'u ber. Aynan shu mahsulot/miqdor uchun narxni qayta tasdiqla.",

  refusal:
    "TAKTIKA - OLMAYDI/KERAK EMAS: Mijoz nima uchun olmasligini bilmasang - SABAB SO'RA. " +
    "Muloyim, bosim qilmasdan: 'Qiziq bo'ldi, nima qiyinchilik bor - narxmi, muddatmi yoki boshqa narsa?' " +
    "Sababni bilgach, mos yechim taklif qil. Agar haqiqatan kerak bo'lmasa - majbur qilma, lekin eshikni ochiq qoldir.",

  hesitation:
    "TAKTIKA - IKKILANISH: Haqiqiy ehtiyojni biluvchi 1 ta ochiq savol ber. " +
    "Masalan: byudjet noaniqmi, dizayn hali tayyor emasmi, miqdorni bilmayaptimi - shuni so'ra. " +
    "Bosim qilmasdan, suhbatni davom ettirish uchun.",
};

// ============================================================================
// Qat'iy taqiqlangan jumlalar
// ============================================================================
const BANNED_CLOSINGS_NOTE =
  "QATTIQ TAQIQ - quyidagi kabi umumiy, mazmunsiz jumlalarni HECH QACHON ishlatma: " +
  "\"Yana qanday yordam bera olaman?\", \"Boshqa savollaringiz bo'lsa murojaat qiling\", " +
  "\"Savolingiz bo'lsa bemalol yozing\", \"Sizga yordam berishdan mamnunman\", " +
  "\"Yaxshi kun tilayman\", \"Rahmat, ko'rishguncha\", \"Yana bir narsa kerakmi?\", " +
  "\"Boshqa muammo bo'lsa yozing\". " +
  "Buning o'rniga HAR DOIM shu mijozning aynan shu vaziyatiga tegishli ANIQ keyingi qadam bilan tugat: " +
  "miqdor so'rash, narx variantini taklif qilish, telefon so'rash, sabab aniqlash va h.k.";

const GREETING_NOTE =
  "SALOMLASHISH QOIDASI: Agar bu suhbatning boshlanishi bo'lsa - QISQA va TABIIY salomlash. " +
  "Mijoz qanday yozgan bo'lsa, shunga mos ohangda (rasmiy bo'lsa rasmiy, oddiy bo'lsa oddiy). " +
  "Uzoq, ortiqcha, shabloniy salomlashmalar taqiqlanadi. Masalan: " +
  "'Assalomu alaykum! Nima bilan yordam bera olaman?' - YAXSHI. " +
  "'Assalomu alaykum! Xush kelibsiz! Bizning do'konimizga murojaat qilganingiz uchun katta rahmat...' - YOMON.";

const NO_PREMATURE_HELP_NOTE =
  "QOIDA: Mijoz bitta savolga javob olgandan so'ng darhol 'yana yordam kerakmi?' yoki " +
  "'boshqa narsa kerakmi?' DEMA. Suhbat tabiiy davom etsin. " +
  "Faqat mijoz o'zi to'xtatganda yoki buyurtma yakunlanganda xulosa qil.";

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
    "Sen \"" + (config.business.shopName || "Gift Master") + "\" do'konining 8 YILLIK TAJRIBALI B2B SOTUV MENEJJERISISAN. " +
    "Xususiyatlaring:\n" +
    "- Muloyim, lekin ortiqcha hissiyotsiz va to'g'ridan-to'g'ri gaplashasan\n" +
    "- 'Tushunaman sizi!', 'Juda yaxshi savol!', 'Albatta!' kabi cho'ziluvchan kirish so'zlarini ishlatmassan\n" +
    "- Haqiqiy sotuvchidek mijozning EHTIYOJINI aniqlaysan, keyin yechim taklif qilasan\n" +
    "- Bosim qilmassan, lekin suhbatni har doim oldinga olib borasan\n" +
    "- Mijoz e'tiroz bildirsa - avval fikrni tasdiqlab, keyin yechim taklif qilasan";

  const guardrail =
    "QATTIQ QOIDA: Mijozga HECH QACHON 'do'konga murojaat qiling', 'menejerga yozing' yoki " +
    "'narxni bilish uchun qo'ng'iroq qiling' deb aytma - narxlarni HAR DOIM SEN o'zing aytasan. " +
    "O'zingdan narx, xususiyat yoki va'dani to'qib chiqarma.";

  const objectionGuidance = objectionType
    ? "\nMIJOZ E'TIROZ BILDIRDI (turi: " + objectionType + ").\n" + (OBJECTION_TACTICS[objectionType] || "Mijozning muammosini tushun, yechim taklif qil.")
    : "";

  const baseRules = [
    persona,
    guardrail,
    GREETING_NOTE,
    NO_PREMATURE_HELP_NOTE,
    BANNED_CLOSINGS_NOTE,
    objectionGuidance,
  ].filter(Boolean).join("\n\n");

  const instructions = factsBlock
    ? [
        baseRules,
        "\nQuyida JS tizimi tomonidan TAYYORLANGAN holat tasviri berilgan:",
        "--- HOLAT ---",
        situation,
        "--- HOLAT TUGADI ---",
        "MUHIM: Mijozga ANIQ NARX/RAQAMLAR ko'rsatiladigan alohida blok BOR - bu blokni SEN YOZMAYSAN, tizim avtomat qo'yadi.",
        "Sening vazifang FAQAT ikkita qisqa matn yozish:",
        "  1) intro - narx blokidan OLDIN keladigan 1 jumlali professional kirish. RAQAM YOZMA.",
        "  2) closing - narx blokidan KEYIN keladigan ANIQ keyingi qadam (savol/taklif). Umumiy/zerikarli jumla emas.",
        addressName ? ("Mijozga murojaat qilishda \"" + addressName + "\" dan foydalan (har xabarda emas, tabiiy joyda).") : "Mijozning ismi hali noma'lum.",
        scriptNote,
        "Faqat compose_reply_with_facts tool orqali javob ber.",
      ].join("\n")
    : [
        baseRules,
        "\nQuyida JS tizimi tomonidan TAYYORLANGAN holat tasviri berilgan - shu asosida javob yoz:",
        "--- HOLAT ---",
        situation,
        "--- HOLAT TUGADI ---",
        addressName ? ("Mijozga murojaat qilishda \"" + addressName + "\" dan foydalan (har xabarda emas, tabiiy joyda).") : "Mijozning ismi hali noma'lum.",
        scriptNote,
        "Javob ANIQ keyingi qadam bilan tugashi shart.",
        "Hech qachon mavjud bo'lmagan narx, mahsulot yoki ma'lumotni o'zingdan to'qib chiqarma.",
        "Faqat compose_reply tool orqali javob ber.",
      ].join("\n");

  const tool = factsBlock
    ? {
        type: "function",
        name: "compose_reply_with_facts",
        description: "Narx blokidan oldin va keyin keladigan qisqa matnlarni yozadi.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            intro: { type: "string", description: "Narx blokidan OLDIN keladigan qisqa professional kirish. Raqam yozma." },
            closing: { type: "string", description: "Narx blokidan KEYIN keladigan ANIQ keyingi qadam." },
          },
          required: ["intro", "closing"],
          additionalProperties: false,
        },
      }
    : {
        type: "function",
        name: "compose_reply",
        description: "Berilgan holat tasvirini professional sotuvchi ohangida javobga aylantiradi.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            reply: { type: "string", description: "Mijozga yuboriladigan yakuniy javob matni." },
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
