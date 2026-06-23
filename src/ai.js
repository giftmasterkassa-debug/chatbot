// AI (OpenAI API) integratsiyasi - "Gift Master" B2B Sotuv Mantiqiy Markazi
const config = require("./config");

const API_URL = "https://api.openai.com/v1/chat/completions";

async function callTool(senderId, instructions, history, toolDefinition) {
  if (!config.ai.apiKey) return null;

  const messages = [
    { role: "system", content: instructions },
    ...(Array.isArray(history) ? history : [{ role: "user", content: String(history) }])
  ];

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.ai.apiKey,
      },
      body: JSON.stringify({
        model: config.ai.model || "gpt-4o-mini",
        messages: messages,
        // OpenAI talab qiladigan to'g'ri tuzilma:
        tools: [{ type: "function", function: toolDefinition }],
        tool_choice: { type: "function", function: { name: toolDefinition.name } },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("AI API xatosi (400/500):", res.status, errText);
      return null;
    }

    const data = await res.json();
    const message = data.choices[0].message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      const call = message.tool_calls[0];
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
// FUNKSIYALAR TA'RIFI (Tools definitions)
// ==========================================

async function extractNameAndProduct(senderId, history, lang, current) {
  const toolDef = {
    name: "extract_order_info",
    description: "Mijozning ismi va qiziqqan mahsulotini aniqlaydi.",
    parameters: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        product: { type: ["string", "null"] },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: "string" },
        image_keyword: { type: ["string", "null"] }
      },
      required: ["name", "product", "needs_clarification", "clarification_question"]
    }
  };
  return callTool(senderId, "Siz 'Gift Master' menejerisiz. Mijoz ismini va mahsulotini aniqlang.", history, toolDef);
}

async function extractQuantityOnly(senderId, history, lang, current) {
  const toolDef = {
    name: "extract_quantity",
    description: "Mijozdan mahsulot sonini aniqlaydi.",
    parameters: {
      type: "object",
      properties: {
        quantity: { type: ["string", "null"] },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: "string" }
      },
      required: ["quantity", "needs_clarification", "clarification_question"]
    }
  };
  return callTool(senderId, "Mijozdan kerakli miqdorni so'rang.", history, toolDef);
}

async function extractQuantityAndBudget(senderId, history, lang, current) {
  const toolDef = {
    name: "extract_order_budget",
    description: "Mijozdan soni va byudjetini aniqlaydi.",
    parameters: {
      type: "object",
      properties: {
        quantity: { type: ["string", "null"] },
        budget: { type: ["string", "null"] },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: "string" }
      },
      required: ["quantity", "budget", "needs_clarification", "clarification_question"]
    }
  };
  return callTool(senderId, "Mijozdan soni va byudjetni aniqlang.", history, toolDef);
}

async function extractDeadline(senderId, history, lang) {
  const toolDef = {
    name: "extract_deadline",
    description: "Buyurtma muddatini aniqlaydi.",
    parameters: {
      type: "object",
      properties: {
        deadline: { type: "string" },
        needs_clarification: { type: "boolean" },
        clarification_question: { type: "string" }
      },
      required: ["deadline", "needs_clarification", "clarification_question"]
    }
  };
  return callTool(senderId, "Buyurtma qachongacha tayyor bo'lishi kerakligini so'rang.", history, toolDef);
}

module.exports = { extractNameAndProduct, extractQuantityOnly, extractQuantityAndBudget, extractDeadline };
