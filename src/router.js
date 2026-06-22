// Router: kelgan xabarni tahlil qilib, qaysi javob berishni hal qiladi.
const { detectLang } = require("./lang");

// Kalit so'zlar. Tartib = ustuvorlik (yuqoridagilar oldin tekshiriladi).
const KEYWORDS = [
  { intent: "operator", uz: ["operator", "menejer", "jonli", "administrator", "odam bilan", "xodim"], ru: ["оператор", "менеджер", "живой", "человек", "админ", "сотрудник"] },
  { intent: "order", uz: ["buyurtma", "zakaz", "olmoqchi", "sotib ol", "band qil", "olaman"], ru: ["заказ", "купить", "оформ", "хочу взять", "хочу купить", "беру"] },
  { intent: "delivery", uz: ["yetkaz", "dostavka", "pochta", "kuryer", "manzilga", "olib kel"], ru: ["доставк", "доставля", "привоз", "курьер", "отправ"] },
  { intent: "payment", uz: ["to'lov", "tolov", "karta", "naqd", "payme", "click", "plastik"], ru: ["оплат", "карт", "наличн", "плати", "перевод"] },
  { intent: "price", uz: ["narx", "narxi", "qancha", "necha pul", "price", "pochom", "pochcha"], ru: ["цена", "цены", "сколько", "стоит", "почем", "почём"] },
  { intent: "contact", uz: ["aloqa", "ish vaqti", "telefon", "raqam", "qachon ishlay", "manzilingiz"], ru: ["контакт", "время работы", "телефон", "номер", "когда работа", "где наход"] },
  { intent: "greeting", uz: ["salom", "assalom", "hayrli", "hi", "hello"], ru: ["привет", "здравств", "добрый", "салам", "здарова"] },
];

function normalize(t) {
  return (t || "").toLowerCase().replace(/[’`ʻ]/g, "'").trim();
}

// Matn bo'yicha intent (mavzu) topish
function matchIntent(text) {
  const t = normalize(text);
  if (!t) return null;
  for (const k of KEYWORDS) {
    const words = [...k.uz, ...k.ru];
    if (words.some((w) => t.includes(w))) {
      return k.intent === "greeting" ? "welcome" : k.intent;
    }
  }
  return null;
}

function buildRouter(responses) {
  function getResponse(intent, lang) {
    const node = responses[intent] || responses.fallback;
    return node[lang] || node.uz;
  }

  // event -> { lang, intent, response }
  function route(event) {
    const msg = event.message || {};

    // 1) Quick reply tugma bosilgan bo'lsa, payload'dan intent va tilni olamiz
    const payload = msg.quick_reply && msg.quick_reply.payload;
    if (payload) {
      const [intentRaw, langRaw] = String(payload).split("|");
      const intent = (intentRaw || "").toLowerCase();
      const lang = langRaw === "ru" ? "ru" : "uz";
      return { lang, intent, response: getResponse(intent, lang) };
    }

    // 2) Oddiy matn bo'lsa, tilni aniqlab, kalit so'z bo'yicha javob beramiz
    const text = msg.text;
    if (text) {
      const lang = detectLang(text);
      const intent = matchIntent(text) || "fallback";
      return { lang, intent, response: getResponse(intent, lang) };
    }

    // 3) Matn yo'q (stiker/rasm) - salomlashish bilan javob beramiz
    return { lang: "uz", intent: "welcome", response: responses.welcome.uz };
  }

  return { route, matchIntent, getResponse };
}

module.exports = { buildRouter, matchIntent, normalize, KEYWORDS };
