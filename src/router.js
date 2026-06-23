// Router: Kelgan xabarni tahlil qiladi va AI'ga yo'naltiradi.
// DIQQAT: Tugmalar (Quick Replies) to'liq olib tashlandi!

const { detectLang } = require("./lang");

// Kalit so'zlar qisqartirildi. 
// Barcha suhbat mantig'ini (salomlashish, narx, mahsulot) endi AI hal qiladi.
// Bu yerda faqat "Favqulodda (Escape)" buyruqlar qoldirildi.
const KEYWORDS = [
  { 
    intent: "operator", 
    uz: ["operator", "menejer", "jonli", "administrator", "odam bilan", "xodimga", "mutaxassis"], 
    ru: ["оператор", "менеджер", "живой", "человек", "админ", "сотрудник", "специалист"] 
  }
];

// Matnni tozalash va bir xil formatga keltirish
function normalize(t) {
  return (t || "").toLowerCase().replace(/[’`ʻ]/g, "'").trim();
}

// Matn bo'yicha qat'iy intent (mavzu) topish
function matchIntent(text) {
  const t = normalize(text);
  if (!t) return null;
  
  for (const k of KEYWORDS) {
    const words = [...k.uz, ...k.ru];
    if (words.some((w) => t.includes(w))) {
      return k.intent;
    }
  }
  // Agar maxsus buyruq bo'lmasa, null qaytadi va xabar AI'ga (orderFlow) o'tadi
  return null; 
}

function buildRouter(responses) {
  function getResponse(intent, lang) {
    const node = responses[intent] || responses.fallback;
    return node[lang] || node.uz;
  }

  // event -> { lang, intent, text, response }
  function route(event) {
    const msg = event.message || {};
    const text = msg.text;

    // Tugmalar (quick_reply) mantiqi to'liq o'chirildi. Faqat erkin matn bilan ishlaymiz.
    if (text) {
      const lang = detectLang(text);
      const intent = matchIntent(text);
      
      // Agar intent topilsa (masalan, "operator"), statik javob qaytadi. 
      // Aks holda intent null bo'ladi va asosiy fayl (bot.js) uni AI'ga beradi.
      return { 
        lang: lang, 
        intent: intent, 
        text: text,
        response: intent ? getResponse(intent, lang) : null 
      };
    }

    // Matn bo'lmagan holatlar (rasm, stiker yuborilganda)
    return { 
      lang: "uz", 
      intent: null, 
      text: "", 
      response: null 
    };
  }

  return { route, matchIntent, getResponse, normalize, KEYWORDS };
}

module.exports = { buildRouter, matchIntent, normalize, KEYWORDS };
