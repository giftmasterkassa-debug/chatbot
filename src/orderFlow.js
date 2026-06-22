// Buyurtma jarayoni: AI yordamida bosqichma-bosqich ma'lumot yig'ish.
//   1) Ism + mahsulot   (AI orqali aniqlashtiriladi, xato/qisqa nomlar tushuniladi)
//   2) Soni + kerak bo'lish muddati
//   3) Telefon raqami
//   4) Tasdiqlash - "Buyurtmangiz qabul qilindi"
//
// Har bir mijoz (senderId) uchun xotirada session saqlanadi. Sessiya bo'lmasa,
// chaqiruvchi (server.js) oddiy router orqali javob berishi kerak.

const config = require("./config");
const buildResponses = require("./responses");
const { extractNameAndProduct, extractQuantityAndDeadline } = require("./ai");

const responses = buildResponses(config.business);
const sessions = new Map(); // senderId -> { step, lang, data, history, updatedAt }

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
    askPhone: `Aloqa uchun telefon raqamingizni yuboring 📱\n(Masalan: +998 90 123 45 67)`,
    invalidPhone: `Telefon raqami noto'g'ri ko'rinmoqda 🤔 Iltimos, qaytadan yuboring (masalan: +998 90 123 45 67)`,
    needMoreNameProduct: `Iltimos, aniqroq yozing: ismingiz va qaysi mahsulot kerak?`,
    needMoreQty: `Iltimos, aniqroq yozing: nechta dona va qachongacha kerak?`,
    cancelled: `Buyurtma bekor qilindi. Yordam kerak bo'lsa, yana yozing 😊`,
    cancelBtn: "Bekor qilish",
    done: (d) =>
      `Rahmat, ${d.name}! Buyurtmangiz qabul qilindi ✅\n\n` +
      `🎁 Mahsulot: ${d.product}\n` +
      `🔢 Soni: ${d.quantity}\n` +
      `⏰ Kerak bo'lish vaqti: ${d.deadline}\n` +
      `📱 Telefon: ${d.phone}\n\n` +
      `Operatorimiz tez orada siz bilan bog'lanib, buyurtmani tasdiqlaydi 🙏`,
  },
  ru: {
    askNameProduct:
      `Напишите своё имя и какой товар вас интересует 😊\n` +
      `(Например: "Я Азиз, хочу купить ручку")`,
    askQuantityDeadline: (product) =>
      `Отлично! Сколько штук "${product}" нужно и к какому сроку? 📦\n` +
      `(Например: "3 штуки, нужно к завтрашнему дню")`,
    askPhone: `Отправьте номер телефона для связи 📱\n(Например: +998 90 123 45 67)`,
    invalidPhone: `Номер телефона выглядит неверным 🤔 Пожалуйста, отправьте ещё раз (например: +998 90 123 45 67)`,
    needMoreNameProduct: `Уточните, пожалуйста: как вас зовут и какой товар вам нужен?`,
    needMoreQty: `Уточните: сколько штук нужно и к какому сроку?`,
    cancelled: `Заказ отменён. Если нужна помощь, напишите снова 😊`,
    cancelBtn: "Отмена",
    done: (d) =>
      `Спасибо, ${d.name}! Ваш заказ принят ✅\n\n` +
      `🎁 Товар: ${d.product}\n` +
      `🔢 Количество: ${d.quantity}\n` +
      `⏰ Срок: ${d.deadline}\n` +
      `📱 Телефон: ${d.phone}\n\n` +
      `Наш оператор свяжется с вами для подтверждения заказа 🙏`,
  },
};

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
  sessions.set(senderId, { step: "name_product", lang, data: {}, history: [], updatedAt: Date.now() });
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

async function handleMessage(senderId, text, lang) {
  const session = sessions.get(senderId);
  if (!session) return null; // sessiya yo'q - chaqiruvchi normal routerga qaytsin

  session.lang = lang;
  session.updatedAt = Date.now();

  // --- 1-qadam: ism + mahsulot ---
  if (session.step === "name_product") {
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

    session.step = "quantity_deadline";
    session.history = [];
    return { text: T[lang].askQuantityDeadline(session.data.product), quickReplies: [cancelBtn(lang)] };
  }

  // --- 2-qadam: soni + muddat ---
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

module.exports = { isActive, start, cancel, cancelText, handleMessage };
