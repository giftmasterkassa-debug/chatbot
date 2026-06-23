// AI (OpenAI API) integratsiyasi - "Gift Master" B2B Sotuv Mantiqiy Markazi
const config = require("./config");

// OpenAI API To'g'ri manzili
const API_URL = "https://api.openai.com/v1/chat/completions";

async function callTool(senderId, instructions, history, tool) {
  if (!config.ai.apiKey) return null;

  // Tarix formatini tekshirish (agar matn bo'lsa, massivga o'tkazamiz)
  const messages = [
    { role: "system", content: instructions }
  ];
  
  if (Array.isArray(history)) {
    messages.push(...history);
  } else {
    messages.push({ role: "user", content: String(history) });
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.ai.apiKey,
      },
      body: JSON.stringify({
        model: config.ai.model || "gpt-4o-mini",
        messages: messages,
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
    const message = data.choices[0].message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      const call = message.tool_calls.find(c => c.function.name === tool.name);
      if (!call) return null;
      try {
        return JSON.parse(call.function.arguments);
      } catch (e) {
        console.error("AI JSON javobini o'qishda xato:", e.message);
        return null;
      }
    }
    return null;
  } catch (e) {
    console.error("AI API ulanish xatosi:", e.message);
    return null;
  }
}

// ==========================================
// ASOSIY BIZNES MANTIQ VA QAT'IY PROMPT
// ==========================================
const BASE_SYSTEM_PROMPT = `
Siz "Gift Master" kompaniyasining B2B korporativ sovg'alar bo'yicha ishonchli, malakali va qat'iy savdo menejerisiz. 
Ortiqcha so'zlar va "suv" ishlatmang. Qisqa, aniq va biznes mantiq asosida javob bering. O'zingizni "Bot" yoki "AI" deb tanishtirmang. Javobingizda "Menejer:", "Javob:" kabi so'zlarni ishlatmang, faqat toza matn bering.

[XUSUSIY MUROJAAT]
Suhbat davomida mijozning ismini bilsangiz, UNGA FAQAT "Ism aka" yoki "Ism opa" deb murojaat qiling (masalan, "Aziz aka", "Malika opa"). 

[SHEVA VA XATOLARNI TUSHUNISH]
Mijoz o'zbek tilining turli shevalarida, chala, imlo xatolari bilan (masalan: "nech pul", "ruchqa", "qanchadab", "kerek") yozishi mumkin. So'zlarning asosiy mantig'ini tushunib, adekvat va professional javob bering.

[MAHSULOT VA TOIFALAR]
Katalog: Ruchkalar, Ejednevniklar, Ryukzak/Shopper, VIP/Eko naborlar, Biznes aksessuarlar, Brelok/Fleshka, Zontik, Znachok/Beydjik.
- Mijoz "Nimalar bor?" desa, barchasini sanab, "Aynan qaysi biri sizni qiziqtiryapti?" deb so'rang. U tanlagan toifa bo'yicha chuqurlashib ma'lumot bering.

[NARX VA BYUDJET MANTIG'I]
- Mijoz narx so'rasa, to'g'ridan-to'g'ri narx aytmang! "Eng to'g'ri va hamyonbop variantni tavsiya qilishim uchun, taxminan nechta kerakligi va byudjetingizni ayta olasizmi?" deb so'rang.
- Mijoz byudjetini aytgach, unga eng mosini tavsiya qiling. Agar arzonroq yoki qimmatroq variant so'rasa, o'rinbosar (muqobil) tovarlarni taklif qiling.

[OFF-TOPIC (MAVZUDAN TASHQARI MANTIQ)]
Mijoz boshqa mavzuda yozsa, 1 ta qisqa javob qaytaring va darhol: "Keling, mavzuga qaytamiz. Qanday korporativ sovg'a qidiryapsiz?" deb sotuv jarayoniga burib oling.
`;

// 1. Ism va Mahsulotni aniqlash
async function extractNameAndProduct(senderId, history, lang, current) {
  current = current || {};
  const instructions = [
    BASE_SYSTEM_PROMPT,
    `Hozirgi holat: ism = ${current.name || "noma'lum"}, mahsulot = ${current.product || "noma'lum"}.`,
    `Vazifa: Mijoz xabaridan ism va mahsulotni aniqlang. Mijozning savoliga to'liq javob bering.`
  ].join("\n");

  const tool = {
    name: "extract_order_info",
    description: "Mijozdan ism va mahsulotni ajratadi va suhbatni davom ettiradi.",
    parameters: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        product: { type: ["string", "null"] },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: ["string", "null"], description: "Mijozga yuboriladigan yakuniy matnli javob va keyingi savol." },
        image_keyword: { type: ["string", "null"], description: "Agar mijozga ma'lum mahsulot rasmini ko'rsatish mantiqan to'g'ri bo'lsa, o'sha toifa nomini (masalan 'ruchka', 'nabor') yozing. Yo'qsa null." }
      },
      required: ["name", "product", "needs_clarification", "clarification_question", "image_keyword"],
    },
  };

  return callTool(senderId, instructions, history, tool);
}

// 2. Miqdorni aniqlash
async function extractQuantityOnly(senderId, history, lang, current) {
  current = current || {};
  const instructions = [
    BASE_SYSTEM_PROMPT,
    `Hozirgi holat: soni = ${current.quantity || "noma'lum"}.`,
    `Vazifa: Mijozdan miqdorni aniqlang. Narx so'rasa byudjetni ham so'rang.`
  ].join("\n");

  const tool = {
    name: "extract_quantity",
    description: "Mijozdan mahsulot sonini aniqlaydi.",
    parameters: {
      type: "object",
      properties: {
        quantity: { type: ["string", "null"] },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: ["string", "null"] },
        image_keyword: { type: ["string", "null"] }
      },
      required: ["quantity", "needs_clarification", "clarification_question", "image_keyword"],
    },
  };

  return callTool(senderId, instructions, history, tool);
}

// 3. Byudjet va Soni
async function extractQuantityAndBudget(senderId, history, lang, current) {
  current = current || {};
  const instructions = [
    BASE_SYSTEM_PROMPT,
    `Hozirgi holat: soni = ${current.quantity || "noma'lum"}, byudjet = ${current.budget || "noma'lum"}.`,
    `Vazifa: Soni va byudjetni ajratib oling, shunga mos tovar tavsiya qiling.`
  ].join("\n");

  const tool = {
    name: "extract_order_budget",
    description: "Mijozdan soni va byudjetini ajratib oladi.",
    parameters: {
      type: "object",
      properties: {
        quantity: { type: ["string", "null"] },
        budget: { type: ["string", "null"] },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: ["string", "null"] },
        image_keyword: { type: ["string", "null"] }
      },
      required: ["quantity", "budget", "needs_clarification", "clarification_question", "image_keyword"],
    },
  };

  return callTool(senderId, instructions, history, tool);
}

// 4. Muddatni aniqlash
async function extractDeadline(senderId, history, lang) {
  const instructions = [
    BASE_SYSTEM_PROMPT,
    `Vazifa: Mijozdan buyurtma muddatini ajratib olish.`
  ].join("\n");

  const tool = {
    name: "extract_deadline",
    description: "Muddatni ajratadi.",
    parameters: {
      type: "object",
      properties: {
        deadline: { type: ["string", "null"] },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: ["string", "null"] }
      },
      required: ["deadline", "needs_clarification", "clarification_question"],
    },
  };

  return callTool(senderId, instructions, history, tool);
}

module.exports = { extractNameAndProduct, extractQuantityOnly, extractQuantityAndBudget, extractDeadline };
