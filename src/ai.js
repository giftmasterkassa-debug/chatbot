// AI (OpenAI API) integratsiyasi - "Aqlli Sotuvchi" versiyasi.
// Mijoz bilan tabiiy suhbatlashadi, savollarga javob beradi va ehtiyotkorlik bilan xaridga yetaklaydi.

const config = require("./config");

// OpenAI Responses API
const API_URL = "https://api.openai.com/v1/responses";

function langName(lang) {
  return lang === "ru" ? "rus" : "o'zbek";
}

async function callTool(senderId, instructions, history, tool) {
  if (!config.ai.apiKey) return null;

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

// ==========================================
// ASOSIY "AQL" VA XARAKTER SOZLAMASI (SYSTEM PROMPT)
// ==========================================
const BASE_SYSTEM_PROMPT = `
[ROLE]
Sen "Gift Master" kompaniyasining B2B korporativ sovg'alar bo'yicha malakali, xushmuomala va tirik savdo menejerisan. Maqsading — mijoz bilan huddi haqiqiy insondek tabiiy suhbatlashish, ularni qiziqtirish va ehtiyojini aniqlab, xaridgacha olib borish.

[CATALOG & CATEGORIES]
Bizda asosan quyidagi mahsulotlar bor:
1. Ryukzaklar va Shopperlar
2. Sovg'abop to'plamlar (VIP va Eko naborlar)
3. Biznes aksessuarlar (Kartxolder, vizitnitsa, portmone)
4. Breloklar va Fleshkalar
5. Soyabonlar (Zontik)
6. Bayroqlar (Stol usti va ko'cha)
7. Plaketkalar, Statuyetkalar va Tarelka mukofotlari
8. Znachoklar va Beydjiklar
9. Poligrafiya va Paketlar (Kalendar, buklet, ruchka, kubarik)

[SALES LOGIC - MUHIM]
- Agar mijoz "Sizlarda nimalar bor?" deb so'rasa, toifalarni sanab ber: "Bizda ruchka, ejednevnik, zontik, kepka va turli to'plamlar bor. Sizni aynan qaysi mahsulotimiz qiziqtiryapti?".
- Mijoz aniq mahsulot so'rasa, uning tavsifini va narxini ayt. Narxlar miqdorga (tirajga) qarab arzonlashishini tushuntirib o't.
- Hamma mijoz ham nima xohlashini bilmaydi, ularga savol berib (Budjet qancha? Kimga sovg'a qilyapsiz?) yo'l ko'rsat.

[VALIDATION (XATOLARNING OLDINI OLISH)]
- Agar sen mijozdan "Ismingiz nima?" yoki "Nechta kerak?" deb so'rasang, lekin mijoz BOSHQA SAVOL bersa (Masalan: "Ruchka ham bormi?"), bu savolni uning ismi yoki soni deb qabul qilib ketma! 
- Bunday paytda ism/soni maydonini bo'sh (null) qoldirib, needs_clarification=true qil va oldin uning savoliga javob ber. Keyin sekin yana ismini yoki miqdorini so'ra.

[OFF-TOPIC HANDLING (BOSHQA MAVZULAR)]
- Agar mijoz umuman boshqa mavzuda savol bersa (ob-havo, dasturlash va h.k.), dastlabki 2-3 ta savoliga qisqa va mantiqiy javob beraver. Lekin javob oxirida har doim "Aytgancha, sovg'alar bo'yicha..." deb mavzuni savdoga burishga harakat qil.
- Agar mijoz qatorasiga 4 martadan ortiq umuman boshqa mavzuda gapiraversa, shunday deb javob ber: "Uzr, men asosan korporativ sovg'alar bo'yicha mutaxassisman. Keling, yaxshisi sizga sovg'alarimiz haqida ma'lumot beray."
`;

// 1. Ism va Mahsulotni aniqlash
async function extractNameAndProduct(senderId, history, lang, current) {
  current = current || {};
  const catalogNames = [...new Set(config.catalog.map(p => p.name))];
  
  const productsHint = catalogNames.length
    ? `Do'kon bazasi: ${catalogNames.join(", ")}. Mijoz qaysi birini nazarda tutganini aniqla.`
    : `Mijoz aytgan mahsulot nomini aniqlang.`;

  const instructions = [
    BASE_SYSTEM_PROMPT,
    productsHint,
    `Hozircha ma'lum: ism = ${current.name || "noma'lum"}, mahsulot = ${current.product || "noma'lum"}.`,
    `DIQQAT: Agar mijoz sening savolingga javob bermay, o'zi savol bersa, uni ism/mahsulot deb o'ylama. needs_clarification=true qil va savoliga javob ber.`
  ].join("\n");

  const tool = {
    type: "function",
    name: "extract_order_info",
    description: "Mijozdan ism va mahsulotni ajratadi yoki mijozning savollariga tabiiy javob beradi.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        product: { type: ["string", "null"] },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: ["string", "null"], description: "Mijozning savoliga javob va keyingi mantiqiy savol." },
      },
      required: ["name", "product", "needs_clarification", "clarification_question"],
      additionalProperties: false,
    },
  };

  return callTool(senderId, instructions, history, tool);
}

// 2. Miqdorni aniqlash
async function extractQuantityOnly(senderId, history, lang, current) {
  current = current || {};
  
  const instructions = [
    BASE_SYSTEM_PROMPT,
    `Hozircha ma'lum: soni = ${current.quantity || "noma'lum"}.`,
    `DIQQAT: Agar mijoz "100 ta" desa, needs_clarification=false qil. Agar u "Narxi qancha?" yoki shunga o'xshash savol bersa, quantity maydonini null qilib, needs_clarification=true qil va savoliga javob ber!`
  ].join("\n");

  const tool = {
    type: "function",
    name: "extract_quantity",
    description: "Mijozdan mahsulot sonini aniqlaydi.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        quantity: { type: ["string", "null"] },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: ["string", "null"] },
      },
      required: ["quantity", "needs_clarification", "clarification_question"],
      additionalProperties: false,
    },
  };

  return callTool(senderId, instructions, history, tool);
}

// 3. Byudjet va Soni
async function extractQuantityAndBudget(senderId, history, lang, current) {
  current = current || {};
  
  const instructions = [
    BASE_SYSTEM_PROMPT,
    `Hozircha ma'lum: soni = ${current.quantity || "noma'lum"}, byudjet = ${current.budget || "noma'lum"}.`,
  ].join("\n");

  const tool = {
    type: "function",
    name: "extract_order_budget",
    description: "Mijozdan soni va byudjetini ajratib oladi.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        quantity: { type: ["string", "null"] },
        budget: { type: ["string", "null"] },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: ["string", "null"] },
      },
      required: ["quantity", "budget", "needs_clarification", "clarification_question"],
      additionalProperties: false,
    },
  };

  return callTool(senderId, instructions, history, tool);
}

// 4. Muddatni aniqlash
async function extractDeadline(senderId, history, lang) {
  const instructions = [
    BASE_SYSTEM_PROMPT,
    `Vazifang: mijozdan muddatni (qachongacha tayyor bo'lishini) ajratib olish.`,
    `Agar mijoz "Qancha vaqtda qilasizlar?" deb so'rasa, "Miqdorga qarab 2 kundan 7 kungacha" deb javob ber (needs_clarification=true).`
  ].join("\n");

  const tool = {
    type: "function",
    name: "extract_deadline",
    description: "Muddatni ajratadi.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        deadline: { type: ["string", "null"] },
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
