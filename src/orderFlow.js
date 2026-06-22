// Buyurtma jarayoni: AI yordamida bosqichma-bosqich ma'lumot yig'ish.
//   1) Ism + mahsulot turi   (AI orqali aniqlashtiriladi, xato/qisqa nomlar tushuniladi)
//      - Agar shu nomda faqat bitta variant bo'lsa: to'g'ridan-to'g'ri 2a-qadamga.
//      - Agar bir nechta narxdagi variant bo'lsa (masalan 17 xil "Ruchka"): 2b-qadamga -
//        mijozdan soni va taxminiy narx so'raladi, shularga eng mos variant tavsiya qilinadi.
//   2a) Soni + kerak bo'lish muddati (bitta variant uchun)
//   2b) Soni + taxminiy narx -> eng mos variant tanlanadi -> keyin muddat so'raladi
//   3) Telefon raqami
//   4) Tasdiqlash - "Buyurtmangiz qabul qilindi"
//
// Har bir mijoz (senderId) uchun xotirada session saqlanadi. Sessiya bo'lmasa,
// chaqiruvchi (server.js) oddiy router orqali javob berishi kerak.

const config = require("./config");
const buildResponses = require("./responses");
const { extractNameAndProduct, extractQuantityAndDeadline, extractQuantityAndBudget } = require("./ai");

const responses = buildResponses(config.business);
const sessions = new Map(); // senderId -> { step, lang, data, history, variants, updatedAt }

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 daqiqadan beri yangilanmagan sessiyalar tozalanadi
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 5 * 60 * 1000);

const T = {
  uz: {
    askNameProduct:
      `Ismingizni va qaysi mahsulotga qiziqayotganingizni yozib yuboring 😊\n` +
      `(Masalan: "Men Aziz, ruchka sotib olmoqchiman")`,
    askQuantityDeadline: (product) =>
      `Ajoyib! "${product}" dan nechta dona kerak va qachongacha tayyor bo'lishi kerak? 📦\n` +
      `(Masalan: "3 dona, ertangi kunga kerak")`,
    askQuantityBudget: (name) =>
      `"${name}" dan bizda bir nechta xili bor, narxlari ham har xil 🙂\n` +
      `Nechta dona kerak va taxminan qancha narxga (1 donasi necha so'mga) mos kelishi kerak?\n` +
      `(Masalan: "100 dona, 10000 so'mgacha" yoki "50 dona, eng arzonidan")`,
    askDeadline: `Qachongacha tayyor bo'lishi kerak? ⏰\n(Masalan: "ertaga" yoki "3 kun ichida")`,
    askPhone: `Aloqa uchun telefon raqamingizni yuboring 📱\n(Masalan: +998 90 123 45 67)`,
    invalidPhone: `Telefon raqami noto'g'ri ko'rinmoqda 🤔 Iltimos, qaytadan yuboring (masalan: +998 90 123 45 67)`,
    needMoreNameProduct: `Iltimos, aniqroq yozing: ismingiz va qaysi mahsulot kerak?`,
    needMoreQty: `Iltimos, aniqroq yozing: nechta dona va qachongacha kerak?`,
    needMoreQtyBudget: `Iltimos, kamida nechta dona kerakligini yozing (narx ixtiyoriy).`,
    cancelled: `Buyurtma bekor qilindi. Yordam kerak bo'lsa, yana yozing 😊`,
    cancelBtn: "Bekor qilish",
    recommend: (variant, price) =>
      price
        ? `Sizga mos variant topdim: "${variant.name} (${variant.code})" — ${formatMoney(price.unitPrice)} so'm/dona. 👍\n`
        : `"${variant.name} (${variant.code})" mos keladi, lekin bu mahsulot uchun eng kam buyurtma - ${Math.min(...variant.tiers.map((t) => t.minQty))} dona, narxni operator aniqlashtiradi. 👍\n`,
    done: (d) => {
      let priceLine = "";
      if (d.price) {
        priceLine = `💰 Narxi: ${formatMoney(d.price.unitPrice)} so'm/dona x ${d.quantity} = ${formatMoney(d.price.total)} so'm\n`;
      } else if (d.minQtyRequired) {
        priceLine = `💰 Narxi: operator tasdiqlaydi (bu mahsulot uchun eng kam buyurtma - ${d.minQtyRequired} dona)\n`;
      }
      return (
        `Rahmat, ${d.name}! Buyurtmangiz qabul qilindi ✅\n\n` +
        `🎁 Mahsulot: ${d.product}\n` +
        `🔢 Soni: ${d.quantity}\n` +
        priceLine +
        `⏰ Kerak bo'lish vaqti: ${d.deadline}\n` +
        `📱 Telefon: ${d.phone}\n\n` +
        `Operatorimiz tez orada siz bilan bog'lanib, buyurtmani tasdiqlaydi 🙏`
      );
    },
  },
  ru: {
    askNameProduct:
      `Напишите своё имя и какой товар вас интересует 😊\n` +
      `(Например: "Я Азиз, хочу купить ручку")`,
    askQuantityDeadline: (product) =>
      `Отлично! Сколько штук "${product}" нужно и к какому сроку? 📦\n` +
      `(Например: "3 штуки, нужно к завтрашнему дню")`,
    askQuantityBudget: (name) =>
      `У нас есть несколько видов "${name}", цены разные 🙂\n` +
      `Сколько штук нужно и примерно по какой цене (за 1 шт)?\n` +
      `(Например: "100 штук, до 10000 сум" или "50 штук, подешевле")`,
    askDeadline: `К какому сроку нужно? ⏰\n(Например: "завтра" или "в течение 3 дней")`,
    askPhone: `Отправьте номер телефона для связи 📱\n(Например: +998 90 123 45 67)`,
    invalidPhone: `Номер телефона выглядит неверным 🤔 Пожалуйста, отправьте ещё раз (например: +998 90 123 45 67)`,
    needMoreNameProduct: `Уточните, пожалуйста: как вас зовут и какой товар вам нужен?`,
    needMoreQty: `Уточните: сколько штук нужно и к какому сроку?`,
    needMoreQtyBudget: `Уточните, пожалуйста, сколько штук нужно (цена не обязательна).`,
    cancelled: `Заказ отменён. Если нужна помощь, напишите снова 😊`,
    cancelBtn: "Отмена",
    recommend: (variant, price) =>
      price
        ? `Нашёл подходящий вариант: "${variant.name} (${variant.code})" — ${formatMoney(price.unitPrice)} сум/шт. 👍\n`
        : `"${variant.name} (${variant.code})" подходит, но для этого товара минимальный заказ - ${Math.min(...variant.tiers.map((t) => t.minQty))} шт, цену уточнит оператор. 👍\n`,
    done: (d) => {
      let priceLine = "";
      if (d.price) {
        priceLine = `💰 Цена: ${formatMoney(d.price.unitPrice)} сум/шт x ${d.quantity} = ${formatMoney(d.price.total)} сум\n`;
      } else if (d.minQtyRequired) {
        priceLine = `💰 Цена: уточнит оператор (минимальный заказ для этого товара - ${d.minQtyRequired} шт)\n`;
      }
      return (
        `Спасибо, ${d.name}! Ваш заказ принят ✅\n\n` +
        `🎁 Товар: ${d.product}\n` +
        `🔢 Количество: ${d.quantity}\n` +
        priceLine +
        `⏰ Срок: ${d.deadline}\n` +
        `📱 Телефон: ${d.phone}\n\n` +
        `Наш оператор свяжется с вами для подтверждения заказа 🙏`
      );
    },
  },
};

// Berilgan nomga mos KATALOG yozuvlarini (bitta yoki bir nechta variant) topadi.
function findVariants(name) {
  if (!name) return [];
  const norm = name.toLowerCase().trim();
  let list = config.catalog.filter((p) => p.name.toLowerCase().trim() === norm);
  if (!list.length) {
    list = config.catalog.filter((p) => {
      const pn = p.name.toLowerCase().trim();
      return pn.includes(norm) || norm.includes(pn);
    });
  }
  return list;
}

// Mahsulot narx pog'onalaridan, kerakli songa mos keladiganini topib, umumiy narxni hisoblaydi.
function calcPrice(product, qty) {
  if (!product || !product.tiers || !product.tiers.length || !qty) return null;
  const tiers = [...product.tiers].sort((a, b) => a.minQty - b.minQty);
  let chosen = null;
  for (const t of tiers) {
    if (qty >= t.minQty) chosen = t;
  }
  if (!chosen) return null; // miqdor eng kichik pog'onadan kam
  return { unitPrice: chosen.price, total: chosen.price * qty, minQty: chosen.minQty };
}

// Bir nechta variant orasidan, mijoz aytgan songa va byudjetga eng mos kelganini tanlaydi.
function recommendVariant(variants, qty, budgetText) {
  const priced = variants.map((v) => ({ v, price: calcPrice(v, qty) })).filter((x) => x.price);

  if (!priced.length) {
    // Qty hech bir variantning minimal chegarasiga to'g'ri kelmadi - eng kichik chegara talab
    // qiladigan variantni tavsiya qilamiz (operator narxni keyin aniqlashtiradi).
    const fallback = variants.reduce((a, b) => (Math.min(...a.tiers.map((t) => t.minQty)) <= Math.min(...b.tiers.map((t) => t.minQty)) ? a : b));
    return { variant: fallback, price: null };
  }

  const budgetNum = parseMoneyNumber(budgetText);
  const wantsExpensive = /qimmat|sifatli|premium|дорог|качествен/i.test(budgetText || "");

  let best;
  if (budgetNum) {
    best = priced.reduce((a, b) => (Math.abs(a.price.unitPrice - budgetNum) <= Math.abs(b.price.unitPrice - budgetNum) ? a : b));
  } else if (wantsExpensive) {
    best = priced.reduce((a, b) => (a.price.unitPrice >= b.price.unitPrice ? a : b));
  } else {
    // standart: byudjet aytilmagan yoki "arzon" deyilgan bo'lsa - eng arzonini tavsiya qilamiz
    best = priced.reduce((a, b) => (a.price.unitPrice <= b.price.unitPrice ? a : b));
  }
  return { variant: best.v, price: best.price };
}

// Matndan birinchi butun sonni ajratib oladi (masalan "5 dona" -> 5, "10000 so'm" -> 10000).
function parseMoneyNumber(text) {
  const m = (text || "").replace(/\s/g, "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// Sonni "100 000" ko'rinishida formatlaydi.
function formatMoney(n) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function cancelBtn(lang) {
  return { title: T[lang].cancelBtn, payload: `CANCEL|${lang}` };
}

function isActive(senderId) {
  return sessions.has(senderId);
}

// AI sozlanmagan bo'lsa, eski (statik) buyurtma matnini qaytaramiz va session ochmaymiz -
// shunda bot AI'siz ham avvalgidek ishlayveradi.
function start(senderId, lang) {
  if (!config.ai.apiKey) {
    const r = responses.order[lang] || responses.order.uz;
    return { text: r.text, quickReplies: r.quickReplies };
  }
  sessions.set(senderId, { step: "name_product", lang, data: {}, history: [], variants: [], updatedAt: Date.now() });
  return { text: T[lang].askNameProduct, quickReplies: [cancelBtn(lang)] };
}

function cancel(senderId) {
  sessions.delete(senderId);
}

function cancelText(lang) {
  return { text: T[lang].cancelled, quickReplies: [] };
}

function normalizePhone(text) {
  const digits = (text || "").replace(/[^\d]/g, "");
  // +998901234567 / 998901234567 / 901234567 (9 raqam) formatlarini qabul qilamiz.
  const m = digits.match(/^(998)?(\d{9})$/);
  if (!m) return null;
  return "+998" + m[2];
}

async function processNameProduct(session, text, lang) {
  session.history.push({ role: "user", content: text });

  const result = await extractNameAndProduct(session.history, lang, session.data);
  if (!result) {
    // AI javob bermadi (key yo'q / xato) - mijoz yozganini xom holatda qabul qilamiz.
    if (!session.data.name) session.data.name = text;
    if (!session.data.product) session.data.product = text;
  } else {
    if (result.name) session.data.name = result.name;
    if (result.product) session.data.product = result.product;
    if (result.needs_clarification && result.clarification_question) {
      session.history.push({ role: "assistant", content: result.clarification_question });
      return { text: result.clarification_question, quickReplies: [cancelBtn(lang)] };
    }
  }

  if (!session.data.name || !session.data.product) {
    return { text: T[lang].needMoreNameProduct, quickReplies: [cancelBtn(lang)] };
  }

  const variants = findVariants(session.data.product);

  if (variants.length > 1) {
    // Bir nomda bir nechta narxdagi variant bor - soni+byudjet so'raymiz, keyin tavsiya qilamiz.
    session.variants = variants;
    session.step = "quantity_budget";
    session.history = [];
    return { text: T[lang].askQuantityBudget(session.data.product), quickReplies: [cancelBtn(lang)] };
  }

  // Bitta variant (yoki katalogda umuman yo'q, erkin mahsulot) - oddiy yo'l bilan davom etamiz.
  session.step = "quantity_deadline";
  session.history = [];
  const resp = { text: T[lang].askQuantityDeadline(session.data.product), quickReplies: [cancelBtn(lang)] };
  if (variants[0] && variants[0].image) resp.image = variants[0].image;
  return resp;
}

// Mijoz "buyurtma" demasdan, to'g'ridan-to'g'ri mahsulot/narx haqida yozsa
// (masalan "ruchka nechpul"), shu matn bilan sessiyani ochib, darhol AI orqali javob beramiz.
// AI sozlanmagan bo'lsa null qaytaradi - chaqiruvchi (server.js) oddiy fallbackka qaytsin.
async function startWithText(senderId, lang, text) {
  if (!config.ai.apiKey) return null;
  const session = { step: "name_product", lang, data: {}, history: [], variants: [], updatedAt: Date.now() };
  sessions.set(senderId, session);
  return processNameProduct(session, text, lang);
}

async function handleMessage(senderId, text, lang) {
  const session = sessions.get(senderId);
  if (!session) return null; // sessiya yo'q - chaqiruvchi normal routerga qaytsin

  session.lang = lang;
  session.updatedAt = Date.now();

  // --- 1-qadam: ism + mahsulot turi ---
  if (session.step === "name_product") {
    return processNameProduct(session, text, lang);
  }

  // --- 2a-qadam: soni + muddat (bitta variantli mahsulot uchun) ---
  if (session.step === "quantity_deadline") {
    session.history.push({ role: "user", content: text });

    const result = await extractQuantityAndDeadline(session.history, lang, session.data);
    if (!result) {
      if (!session.data.quantity) session.data.quantity = text;
      if (!session.data.deadline) session.data.deadline = text;
    } else {
      if (result.quantity) session.data.quantity = result.quantity;
      if (result.deadline) session.data.deadline = result.deadline;
      if (result.needs_clarification && result.clarification_question) {
        session.history.push({ role: "assistant", content: result.clarification_question });
        return { text: result.clarification_question, quickReplies: [cancelBtn(lang)] };
      }
    }

    if (!session.data.quantity || !session.data.deadline) {
      return { text: T[lang].needMoreQty, quickReplies: [cancelBtn(lang)] };
    }

    const qtyNum = parseMoneyNumber(session.data.quantity);
    const variants = findVariants(session.data.product);
    if (variants.length === 1 && variants[0].tiers && variants[0].tiers.length && qtyNum) {
      const priceInfo = calcPrice(variants[0], qtyNum);
      if (priceInfo) {
        session.data.price = priceInfo;
      } else {
        session.data.minQtyRequired = Math.min(...variants[0].tiers.map((t) => t.minQty));
      }
    }

    session.step = "phone";
    return { text: T[lang].askPhone, quickReplies: [cancelBtn(lang)] };
  }

  // --- 2b-qadam: soni + byudjet (bir nechta variantli mahsulot uchun) ---
  if (session.step === "quantity_budget") {
    session.history.push({ role: "user", content: text });

    const result = await extractQuantityAndBudget(session.history, lang, session.data);
    if (!result) {
      if (!session.data.quantity) session.data.quantity = text;
    } else {
      if (result.quantity) session.data.quantity = result.quantity;
      if (result.budget) session.data.budget = result.budget;
      if (result.needs_clarification && result.clarification_question) {
        session.history.push({ role: "assistant", content: result.clarification_question });
        return { text: result.clarification_question, quickReplies: [cancelBtn(lang)] };
      }
    }

    if (!session.data.quantity) {
      return { text: T[lang].needMoreQtyBudget, quickReplies: [cancelBtn(lang)] };
    }

    const qtyNum = parseMoneyNumber(session.data.quantity);
    const { variant, price } = recommendVariant(session.variants, qtyNum, session.data.budget);

    session.data.product = `${variant.name} (${variant.code})`;
    if (price) session.data.price = price;
    else session.data.minQtyRequired = Math.min(...variant.tiers.map((t) => t.minQty));

    session.step = "deadline";
    const resp = { text: T[lang].recommend(variant, price) + T[lang].askDeadline, quickReplies: [cancelBtn(lang)] };
    if (variant.image) resp.image = variant.image;
    return resp;
  }

  // --- 2c-qadam: muddat (2b-qadamdan keyin, variant aniqlangandan so'ng) ---
  if (session.step === "deadline") {
    const deadline = (text || "").trim();
    if (!deadline) {
      return { text: T[lang].askDeadline, quickReplies: [cancelBtn(lang)] };
    }
    session.data.deadline = deadline;
    session.step = "phone";
    return { text: T[lang].askPhone, quickReplies: [cancelBtn(lang)] };
  }

  // --- 3-qadam: telefon raqami ---
  if (session.step === "phone") {
    const phone = normalizePhone(text);
    if (!phone) {
      return { text: T[lang].invalidPhone, quickReplies: [cancelBtn(lang)] };
    }
    session.data.phone = phone;
    const data = session.data;
    sessions.delete(senderId);
    return { text: T[lang].done(data), quickReplies: [], finished: true, order: data };
  }

  // Kutilmagan holat - xavfsizlik uchun sessionni tozalaymiz.
  sessions.delete(senderId);
  return null;
}

module.exports = { isActive, start, startWithText, cancel, cancelText, handleMessage };
