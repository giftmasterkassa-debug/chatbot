// AI (OpenAI API) integratsiyasi.
// Buyurtma jarayonida mijoz erkin yozgan matndan ism, mahsulot, soni va muddatni
// ajratib oladi; agar noaniq/xato yozilgan bo'lsa, aniqlashtiruvchi savol qaytaradi.
// Faqat korporativ sovg'alar doirasida ishlaydi (B2B savdo menejeri logikasi).

const config = require("./config");

// OpenAI Responses API
const API_URL = "https://api.openai.com/v1/responses";

function langName(lang) {
  return lang === "ru" ? "rus" : "o'zbek";
}

// --- Oddiy himoya (Rate Limit) ---
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 12;
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
    console.warn("AI so'rov chegarasi oshdi: " + senderId);
    return true;
  }
  return false;
}

// AI API ulanish qismi
async function callTool(senderId, instructions, history, tool) {
  if (!config.ai.apiKey || isRateLimited(senderId)) return null;

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

// Asosiy B2B System Prompt (Menejer xarakteri)
const BASE_SYSTEM_PROMPT = `
[ROLE]
Sen "Gift Master" kompaniyasining B2B korporativ sovg'alar bo'yicha katta savdo menejerisan. Suhbatdoshing asosan tadbirkorlar va menejerlar. Muomala professional va hurmat bilan bo'lishi shart.

[STRICT CONSTRAINTS]
1. Sening YAGONA maqsading — mijoz so'rovidan buyurtma detallarini (mahsulot, soni, byudjet, muddat) aniqlab olish.
2. Agar mijoz siyosat, dasturlash, havo rayi yoki sovg'alarga aloqador bo'lmagan MA'NOSIZ gap yozsa:
   - needs_clarification=true qil.
   - clarification_question ichiga faqat shunday yoz: "Kechirasiz, men faqat korporativ sovg'alar va mahsulotlar bo'yicha yordam bera olaman. Sizga katalogimizdan nima kerak?"
3. Sun'iy identifikatorlar (Menejer:, Bot:) ishlatma. Mijoz bilan qisqa va aniq gaplash.
`;

async function extractNameAndProduct(senderId, history, lang, current) {
  current = current || {};
  const catalogNames = [...new Set(config.catalog.map(p => p.name))];
  
  const productsHint = catalogNames.length
    ? `Do'konda sotiladigan mahsulotlar: ${catalogNames.join(", ")}. ` +
      `Agar mijoz aytgan mahsulot shu ro'yxatga umuman tushmasa, needs_clarification=true qil va ro'yxatdagi mahsulotlarni taklif qil. ` +
      `Agar ro'yxatdagi biror mahsulotga xato yozilgan bo'lsa ham aynan to'g'ri nomini product maydoniga yoz.`
    : `Mijoz aytgan mahsulot nomini aniqlang.`;

  const instructions = [
    BASE_SYSTEM_PROMPT,
    productsHint,
    `Hozircha ma'lum: ism = ${current.name || "noma'lum"}, mahsulot = ${current.product || "noma'lum"}.`,
    `Agar ism yoki mahsulot aniq bo'lmasa, needs_clarification=true qil va clarification_question ichida ${langName(lang)} tilida qisqa savol ber.`
  ].join("\n");

  const tool = {
    type: "function",
    name: "extract_order_info",
    description: "Mijozdan ism va mahsulotni ajratib oladi.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        product: { type: ["string", "null"] },
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
    BASE_SYSTEM_PROMPT,
    `Vazifang: mijozdan kerakli mahsulot sonini ajratib olish.`,
    `Hozircha ma'lum: soni = ${current.quantity || "noma'lum"}.`,
    `Agar soni noma'lum bo'lsa, needs_clarification=true qil va savol ber.`
  ].join("\n");

  const tool = {
    type: "function",
    name: "extract_quantity",
    description: "Mijozdan mahsulot sonini so'raydi.",
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

async function extractQuantityAndBudget(senderId, history, lang, current) {
  current = current || {};
  
  const instructions = [
    BASE_SYSTEM_PROMPT,
    `Vazifang: mijozdan soni va taxminiy narx/byudjetni ajratib olish.`,
    `Hozircha ma'lum: soni = ${current.quantity || "noma'lum"}, byudjet = ${current.budget || "noma'lum"}.`
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

async function extractDeadline(senderId, history, lang) {
  const instructions = [
    BASE_SYSTEM_PROMPT,
    `Vazifang: mijozdan muddatni (qachongacha tayyor bo'lishini) ajratib olish.`
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
