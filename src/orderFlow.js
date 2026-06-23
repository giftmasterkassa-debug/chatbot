// Buyurtma jarayoni: AI yordamida bosqichma-bosqich ma'lumot yig'ish.
// XOTIRA (MEMORY) TIZIMI QO'SHILDI.

const config = require("./config");
const buildResponses = require("./responses");
const aiModule = require("./ai");
const extractNameAndProduct = aiModule.extractNameAndProduct;
const extractQuantityOnly = aiModule.extractQuantityOnly;
const extractQuantityAndBudget = aiModule.extractQuantityAndBudget;
const extractDeadline = aiModule.extractDeadline;

const responses = buildResponses(config.business);
const sessions = new Map();
const customerProfiles = new Map();

const SESSION_TTL_MS = 30 * 60 * 1000;
setInterval(function () {
  const now = Date.now();
  for (const entry of sessions) {
    const id = entry[0];
    const s = entry[1];
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 5 * 60 * 1000);

const MAX_CLARIFY_ATTEMPTS = 10; 

const T = {
  uz: {
    askNameProduct: "Assalomu alaykum! Ismingizni va qaysi mahsulotga qiziqayotganingizni yozib yuboring 😊\n(Yoki shunchaki nima izlayotganingizni yozing)",
    askProductOnly: function (name) { return "Yana xush kelibsiz, " + name + "! 😊 Bu safar qaysi mahsulotga qiziqyapsiz?"; },
    askAnotherProduct: "Yana qaysi mahsulotni ko'ramiz? 😊",
    askQuantitySingle: function (product) { return "\"" + product + "\" dan taxminan nechta dona kerak bo'ladi? 📦"; },
    askQuantityBudget: function (name) {
      return "\"" + name + "\" dan bizda bir nechta xili bor, narxlari ham har xil 🙂\n" +
        "Nechta dona kerak va taxminan byudjetingiz qanday?\n" +
        "(Masalan: \"100 dona, 10000 so'mgacha\" yoki \"50 dona, eng sifatlisidan\")";
    },
    recommend: function (variant, price, overBudget) {
      let line = price
        ? "Sizga mos variant topdim: \"" + variant.name + " (" + variant.code + ")\" — " + formatMoney(price.unitPrice) + " so'm/dona."
        : "\"" + variant.name + " (" + variant.code + ")\" mos keladi, lekin bu mahsulot uchun eng kam buyurtma - " + Math.min.apply(null, variant.tiers.map(function (t) { return t.minQty; })) + " dona, narxni operator aniqlashtiradi.";
      if (overBudget) line += "\n⚠️ Eslatma: bu aytgan byudjetingizdan biroz yuqoriroq.";
      return line + "\nMos kelmasa \"boshqa\" deb yozing, yoki davom etish uchun tasdiqlang 👇";
    },
    altBtn: "Boshqa variant",
    continueBtn: "Davom etish",
    noMoreAlternatives: "Afsuski, boshqa variant qolmadi - shu eng yaqin keladigani. Davom etamiz.",
    askAddMore: "Yana biror mahsulot qo'shmoqchimisiz?",
    addMoreBtn: "Ha, yana qo'shaman",
    noMoreBtn: "Yo'q, tamom",
    askDeadline: "Butun buyurtma qachongacha tayyor bo'lishi kerak? ⏰\n(Masalan: \"ertaga\" yoki \"3 kun ichida\")",
    askPhone: "Aloqa uchun telefon raqamingizni yuboring 📱\n(Masalan: +998 90 123 45 67)",
    invalidPhone: "Telefon raqami noto'g'ri ko'rinmoqda 🤔 Iltimos, qaytadan yuboring (masalan: +998 90 123 45 67)",
    needMoreNameProduct: "Iltimos, aniqroq yozing: qaysi mahsulot kerak?",
    needMoreQty: "Iltimos, nechta dona kerakligini aniqroq yozing.",
    needMoreQtyBudget: "Iltimos, kamida nechta dona kerakligini yozing.",
    cancelled: "Suhbat bekor qilindi. Yordam kerak bo'lsa, istalgan vaqtda yozishingiz mumkin 😊",
    cancelBtn: "Bekor qilish",
    confirmBtn: "Tasdiqlash",
    confirmOrder: function (summary, total) {
      return "Keling, buyurtmangizni tekshirib chiqamiz 📋\n\n" + summary + "\n" + (total ? "\n💰 Jami: " + formatMoney(total) + " so'm\n" : "") + "\nHammasi to'g'rimi? Tasdiqlasangiz, telefon raqamingizni so'rayman.";
    },
    confirmRejected: "Mayli, agar biror narsani o'zgartirish kerak bo'lsa, qaytadan yozishingiz mumkin 😊",
    escalateNote: "Kechirasiz, menimcha sizga inson yordami kerak bo'ladi 🙏 Sizni operatorga ulayapman.",
    done: function (d) {
      const summary = summarizeItems(d.items, "uz");
      const total = calcGrandTotal(d.items);
      let line = "Rahmat, " + (d.name || "mijoz") + "! Buyurtmangiz qabul qilindi va operatorimizga yuborildi ✅\n\n" +
        "🆔 Buyurtma raqami: " + d.orderId + "\n\n" + summary + "\n";
      if (total) line += "\n💰 Jami: " + formatMoney(total) + " so'm\n";
      line += "⏰ Muddat: " + d.deadline + "\n📱 Telefon: " + d.phone + "\n\nOperatorimiz tez orada siz bilan bog'lanadi 🙏";
      if (!isWithinWorkHours()) {
        line += "\n\n🌙 Diqqat: hozir ish vaqtimizdan tashqari (" + config.business.workHours + "), shuning uchun ertalab birinchi bo'lib javob beramiz.";
      }
      return line;
    },
  },
  ru: {
    askNameProduct: "Напишите своё имя и какой товар вас интересует 😊",
    askProductOnly: function (name) { return "Снова рады видеть вас, " + name + "! 😊 Какой товар вас интересует?"; },
    askAnotherProduct: "Какой ещё товар нужен? 😊",
    askQuantitySingle: function (product) { return "Сколько штук \"" + product + "\" нужно? 📦"; },
    askQuantityBudget: function (name) { return "У нас есть несколько видов \"" + name + "\". Сколько штук нужно и примерный бюджет?"; },
    recommend: function (variant, price, overBudget) { return "Нашёл вариант: " + variant.name + ". Подходит?"; },
    altBtn: "Другой вариант",
    continueBtn: "Продолжить",
    noMoreAlternatives: "Больше вариантов нет. Продолжаем.",
    askAddMore: "Хотите добавить ещё товар?",
    addMoreBtn: "Да",
    noMoreBtn: "Нет",
    askDeadline: "К какому сроку нужен заказ? ⏰",
    askPhone: "Отправьте номер телефона 📱",
    invalidPhone: "Номер неверен 🤔",
    needMoreNameProduct: "Уточните, какой товар нужен?",
    needMoreQty: "Уточните количество.",
    needMoreQtyBudget: "Уточните количество штук.",
    cancelled: "Отменено 😊",
    cancelBtn: "Отмена",
    confirmBtn: "Подтвердить",
    confirmOrder: function (summary, total) { return "Проверьте заказ 📋\n\n" + summary; },
    confirmRejected: "Хорошо, начните заново 😊",
    escalateNote: "Извините, подключаю оператора 🙏",
    done: function (d) { return "Спасибо! Заказ принят ✅"; }
  },
};

// --- XOTIRANI SAQLOVCHI FUNKSIYA ---
// Bot qanday javob bersa ham, shu funksiya orqali o'tadi va xotiraga "assistant" sifatida yoziladi.
function botReply(session, text, quickReplies, opts = {}) {
  if (session && text) {
    session.history.push({ role: "assistant", content: text });
    // Xotira to'lib ketib xato bermasligi uchun faqat oxirgi 20 ta xabarni saqlaymiz
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }
  }
  return { text: text, quickReplies: quickReplies || [], ...opts };
}

function findVariants(name) {
  if (!name) return [];
  const norm = name.toLowerCase().trim();
  let list = config.catalog.filter(function (p) { return p.name.toLowerCase().trim() === norm; });
  if (!list.length) {
    list = config.catalog.filter(function (p) {
      const pn = p.name.toLowerCase().trim();
      return pn.includes(norm) || norm.includes(pn);
    });
  }
  return list;
}

function calcPrice(product, qty) {
  if (!product || !product.tiers || !product.tiers.length || !qty) return null;
  const tiers = product.tiers.slice().sort(function (a, b) { return a.minQty - b.minQty; });
  let chosen = null;
  for (const t of tiers) {
    if (qty >= t.minQty) chosen = t;
  }
  if (!chosen) return null;
  return { unitPrice: chosen.price, total: chosen.price * qty, minQty: chosen.minQty };
}

function recommendVariant(variants, qty, budgetText, excludeCodes) {
  excludeCodes = excludeCodes || [];
  const pool = variants.filter(function (v) { return excludeCodes.indexOf(v.code) === -1; });
  if (!pool.length) return null;

  const priced = pool.map(function (v) { return { v: v, price: calcPrice(v, qty) }; }).filter(function (x) { return x.price; });

  if (!priced.length) {
    const fallback = pool.reduce(function (a, b) {
      const aMin = Math.min.apply(null, a.tiers.map(function (t) { return t.minQty; }));
      const bMin = Math.min.apply(null, b.tiers.map(function (t) { return t.minQty; }));
      return aMin <= bMin ? a : b;
    });
    return { variant: fallback, price: null, overBudget: false };
  }

  const budgetNum = parseMoneyNumber(budgetText);
  const wantsExpensive = /qimmat|sifatli|premium|дорог|качествен/i.test(budgetText || "");

  let best;
  if (budgetNum) {
    best = priced.reduce(function (a, b) { return Math.abs(a.price.unitPrice - budgetNum) <= Math.abs(b.price.unitPrice - budgetNum) ? a : b; });
  } else if (wantsExpensive) {
    best = priced.reduce(function (a, b) { return a.price.unitPrice >= b.price.unitPrice ? a : b; });
  } else {
    best = priced.reduce(function (a, b) { return a.price.unitPrice <= b.price.unitPrice ? a : b; });
  }

  const overBudget = !!(budgetNum && best.price.unitPrice > budgetNum * 1.1);
  return { variant: best.v, price: best.price, overBudget: overBudget };
}

function parseMoneyNumber(text) {
  const m = (text || "").replace(/\s/g, "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function formatMoney(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function summarizeItems(items, lang) {
  return items.map(function (it, i) {
    let line = (i + 1) + ". " + it.product + " — " + it.quantity;
    if (it.price) {
      line += lang === "ru" ? (", " + formatMoney(it.price.unitPrice) + " сум/шт = " + formatMoney(it.price.total) + " сум") : (", " + formatMoney(it.price.unitPrice) + " so'm/dona = " + formatMoney(it.price.total) + " so'm");
    } else if (it.minQtyRequired) {
      line += lang === "ru" ? (" (мин. " + it.minQtyRequired + " шт, цену уточнит оператор)") : (" (eng kam buyurtma " + it.minQtyRequired + " dona, narxni operator aytadi)");
    }
    return line;
  }).join("\n");
}

function calcGrandTotal(items) {
  return items.reduce(function (sum, it) { return sum + (it.price ? it.price.total : 0); }, 0);
}

function generateOrderId() {
  return "GM-" + Date.now().toString(36).toUpperCase().slice(-6);
}

function isWithinWorkHours() {
  const m = (config.business.workHours || "").match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return true;
  try {
    const tashkentStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Tashkent", hour12: false });
    const tashkent = new Date(tashkentStr);
    const minutesNow = tashkent.getHours() * 60 + tashkent.getMinutes();
    const start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const end = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
    return minutesNow >= start && minutesNow <= end;
  } catch (e) {
    return true;
  }
}

function cancelBtn(lang) { return { title: T[lang].cancelBtn, payload: "CANCEL|" + lang }; }
function addMoreBtn(lang) { return { title: T[lang].addMoreBtn, payload: "ADDMORE|" + lang }; }
function noMoreBtn(lang) { return { title: T[lang].noMoreBtn, payload: "NOMORE|" + lang }; }
function altBtn(lang) { return { title: T[lang].altBtn, payload: "ALTVARIANT|" + lang }; }
function continueBtn(lang) { return { title: T[lang].continueBtn, payload: "CONTVARIANT|" + lang }; }
function confirmBtn(lang) { return { title: T[lang].confirmBtn, payload: "CONFIRMORDER|" + lang }; }

function isActive(senderId) { return sessions.has(senderId); }
function cancel(senderId) { sessions.delete(senderId); }
function cancelText(lang) { return { text: T[lang].cancelled, quickReplies: [] }; }

function normalizePhone(text) {
  const digits = (text || "").replace(/[^\d]/g, "");
  const m = digits.match(/^(998)?(\d{9})$/);
  if (!m) return null;
  return "+998" + m[2];
}

function escalateToOperator(senderId, lang, session) {
  sessions.delete(senderId);
  const r = responses.operator[lang] || responses.operator.uz;
  const note = T[lang].escalateNote + "\n\n" + r.text;
  return botReply(session, note, r.quickReplies);
}

function start(senderId, lang) {
  if (!config.ai.apiKey) {
    const r = responses.order[lang] || responses.order.uz;
    return { text: r.text, quickReplies: r.quickReplies };
  }
  const profile = customerProfiles.get(senderId);
  const data = { items: [] };
  if (profile && profile.name) data.name = profile.name;
  
  const session = { step: "name_product", lang: lang, data: data, history: [], variants: [], clarifyCount: 0, updatedAt: Date.now() };
  sessions.set(senderId, session);
  
  const text = data.name ? T[lang].askProductOnly(data.name) : T[lang].askNameProduct;
  return botReply(session, text, [cancelBtn(lang)]);
}

async function startWithText(senderId, lang, text) {
  if (!config.ai.apiKey) return null;
  const profile = customerProfiles.get(senderId);
  const data = { items: [] };
  if (profile && profile.name) data.name = profile.name;
  const session = { step: "name_product", lang: lang, data: data, history: [], variants: [], clarifyCount: 0, updatedAt: Date.now() };
  sessions.set(senderId, session);
  return processNameProduct(senderId, session, text, lang);
}

async function processNameProduct(senderId, session, text, lang) {
  session.history.push({ role: "user", content: text });

  const result = await extractNameAndProduct(senderId, session.history, lang, session.data);
  
  if (!result) {
    if (!session.data.name) session.data.name = text;
    if (!session.data.product) session.data.product = text;
  } else {
    if (result.name) session.data.name = result.name;
    if (result.product) session.data.product = result.product;
    
    if (result.needs_clarification && result.clarification_question) {
      session.clarifyCount += 1;
      if (session.clarifyCount >= MAX_CLARIFY_ATTEMPTS) return escalateToOperator(senderId, lang, session);
      return botReply(session, result.clarification_question, [cancelBtn(lang)]);
    }
  }

  if (!session.data.product) {
    return botReply(session, T[lang].needMoreNameProduct, [cancelBtn(lang)]);
  }

  if (session.data.name) customerProfiles.set(senderId, { name: session.data.name });

  const variants = findVariants(session.data.product);
  session.clarifyCount = 0; 

  if (variants.length > 1) {
    session.variants = variants;
    session.data.rejectedCodes = [];
    session.step = "quantity_budget";
    return botReply(session, T[lang].askQuantityBudget(session.data.product), [cancelBtn(lang)]);
  }

  session.variants = variants;
  session.step = "quantity_single";
  const resp = botReply(session, T[lang].askQuantitySingle(session.data.product), [cancelBtn(lang)]);
  if (variants[0] && variants[0].image) resp.image = variants[0].image;
  return resp;
}

function pushCurrentItem(session) {
  const r = session.data.pendingRecommendation;
  const item = { product: r.variant.name + " (" + r.variant.code + ")", quantity: session.data.quantity };
  if (r.price) {
    item.price = r.price;
  } else {
    item.minQtyRequired = Math.min.apply(null, r.variant.tiers.map(function (t) { return t.minQty; }));
  }
  session.data.items.push(item);
  delete session.data.product;
  delete session.data.quantity;
  delete session.data.budget;
  delete session.data.pendingRecommendation;
  delete session.data.pendingQty;
  delete session.data.rejectedCodes;
}

async function handleMessage(senderId, text, lang) {
  const session = sessions.get(senderId);
  if (!session) return null;

  lang = session.lang || "uz";
  session.updatedAt = Date.now();

  if (session.step === "name_product") {
    return processNameProduct(senderId, session, text, lang);
  }

  if (session.step === "quantity_single") {
    session.history.push({ role: "user", content: text });
    const result = await extractQuantityOnly(senderId, session.history, lang, session.data);

    let quantity;
    if (!result) {
      quantity = text;
    } else if (result.needs_clarification) {
      session.clarifyCount += 1;
      if (session.clarifyCount >= MAX_CLARIFY_ATTEMPTS) return escalateToOperator(senderId, lang, session);
      const q = result.clarification_question || T[lang].needMoreQty;
      return botReply(session, q, [cancelBtn(lang)]);
    } else {
      quantity = result.quantity;
    }

    session.clarifyCount = 0;
    const qtyNum = parseMoneyNumber(quantity);
    const variant = session.variants[0];
    const item = { product: variant ? (variant.name + " (" + variant.code + ")") : session.data.product, quantity: quantity };
    if (variant && variant.tiers && variant.tiers.length && qtyNum) {
      const priceInfo = calcPrice(variant, qtyNum);
      if (priceInfo) item.price = priceInfo;
      else item.minQtyRequired = Math.min.apply(null, variant.tiers.map(function (t) { return t.minQty; }));
    }
    session.data.items.push(item);
    session.step = "add_more";
    return botReply(session, T[lang].askAddMore, [addMoreBtn(lang), noMoreBtn(lang)]);
  }

  if (session.step === "quantity_budget") {
    session.history.push({ role: "user", content: text });
    const result = await extractQuantityAndBudget(senderId, session.history, lang, session.data);

    if (!result) {
      if (!session.data.quantity) session.data.quantity = text;
    } else {
      if (result.quantity) session.data.quantity = result.quantity;
      if (result.budget) session.data.budget = result.budget;
      if (result.needs_clarification && result.clarification_question) {
        session.clarifyCount += 1;
        if (session.clarifyCount >= MAX_CLARIFY_ATTEMPTS) return escalateToOperator(senderId, lang, session);
        return botReply(session, result.clarification_question, [cancelBtn(lang)]);
      }
    }

    if (!session.data.quantity) {
      return botReply(session, T[lang].needMoreQtyBudget, [cancelBtn(lang)]);
    }

    session.clarifyCount = 0;
    const qtyNum = parseMoneyNumber(session.data.quantity);
    let rec = recommendVariant(session.variants, qtyNum, session.data.budget, session.data.rejectedCodes);
    if (!rec) {
      const fallbackVariant = session.variants[0];
      rec = { variant: fallbackVariant, price: calcPrice(fallbackVariant, qtyNum), overBudget: false };
    }
    session.data.pendingRecommendation = rec;
    session.data.pendingQty = qtyNum;
    session.step = "confirm_variant";
    
    const resp = botReply(session, T[lang].recommend(rec.variant, rec.price, rec.overBudget), [altBtn(lang), continueBtn(lang)]);
    if (rec.variant.image) resp.image = rec.variant.image;
    return resp;
  }

  if (session.step === "confirm_variant") {
    session.history.push({ role: "user", content: text });
    const wantsAlternative = /boshqa|другой/i.test(text || "");

    if (wantsAlternative) {
      session.data.rejectedCodes.push(session.data.pendingRecommendation.variant.code);
      const rec = recommendVariant(session.variants, session.data.pendingQty, session.data.budget, session.data.rejectedCodes);
      if (!rec) {
        pushCurrentItem(session);
        session.step = "add_more";
        return botReply(session, T[lang].noMoreAlternatives + "\n\n" + T[lang].askAddMore, [addMoreBtn(lang), noMoreBtn(lang)]);
      }
      session.data.pendingRecommendation = rec;
      const resp = botReply(session, T[lang].recommend(rec.variant, rec.price, rec.overBudget), [altBtn(lang), continueBtn(lang)]);
      if (rec.variant.image) resp.image = rec.variant.image;
      return resp;
    }

    pushCurrentItem(session);
    session.step = "add_more";
    return botReply(session, T[lang].askAddMore, [addMoreBtn(lang), noMoreBtn(lang)]);
  }

  if (session.step === "add_more") {
    session.history.push({ role: "user", content: text });
    const trimmed = (text || "").trim();
    const wantsMore = /^(ha\b|xa\b|yana|qo'sh|qosh|да)/i.test(trimmed);

    if (wantsMore) {
      session.step = "name_product";
      session.clarifyCount = 0;
      delete session.data.product;
      return botReply(session, T[lang].askAnotherProduct, [cancelBtn(lang)]);
    }

    session.step = "deadline";
    session.clarifyCount = 0;
    return botReply(session, T[lang].askDeadline, [cancelBtn(lang)]);
  }

  if (session.step === "deadline") {
    session.history.push({ role: "user", content: text });
    const result = await extractDeadline(senderId, session.history, lang);

    if (!result) {
      session.data.deadline = (text || "").trim() || "aniqlanmagan";
    } else if (result.needs_clarification) {
      session.clarifyCount += 1;
      if (session.clarifyCount >= MAX_CLARIFY_ATTEMPTS) return escalateToOperator(senderId, lang, session);
      const q = result.clarification_question || T[lang].askDeadline;
      return botReply(session, q, [cancelBtn(lang)]);
    } else {
      session.data.deadline = result.deadline;
    }

    session.clarifyCount = 0;
    session.step = "confirm_order";
    const summary = summarizeItems(session.data.items, lang);
    const total = calcGrandTotal(session.data.items);
    return botReply(session, T[lang].confirmOrder(summary, total), [confirmBtn(lang), cancelBtn(lang)]);
  }

  if (session.step === "confirm_order") {
    session.history.push({ role: "user", content: text });
    const rejected = /^(yo'?q|нет)/i.test((text || "").trim());
    if (rejected) {
      sessions.delete(senderId);
      return { text: T[lang].confirmRejected, quickReplies: [] };
    }
    session.step = "phone";
    return botReply(session, T[lang].askPhone, [cancelBtn(lang)]);
  }

  if (session.step === "phone") {
    session.history.push({ role: "user", content: text });
    const phone = normalizePhone(text);
    if (!phone) {
      return botReply(session, T[lang].invalidPhone, [cancelBtn(lang)]);
    }
    session.data.phone = phone;
    session.data.orderId = generateOrderId();
    const data = session.data;
    
    const finalMsg = T[lang].done(data);
    sessions.delete(senderId); // Xarid tugadi, sessiyani o'chiramiz
    return { text: finalMsg, quickReplies: [], finished: true, order: data };
  }

  sessions.delete(senderId);
  return null;
}

const BUTTON_TEXT_MAP = {
  addmore: "ha",
  nomore: "yo'q",
  altvariant: "boshqa",
  contvariant: "davom etish",
  confirmorder: "ha",
};

module.exports = { isActive: isActive, start: start, startWithText: startWithText, cancel: cancel, cancelText: cancelText, handleMessage: handleMessage, BUTTON_TEXT_MAP: BUTTON_TEXT_MAP };
