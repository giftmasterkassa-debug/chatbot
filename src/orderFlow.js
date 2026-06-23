// Buyurtma jarayoni: Suhbat to'liq AI orqali boshqariladi.
// DIQQAT: Hech qanday tugmalar (Quick Replies) yo'q.

const config = require("./config");
const aiModule = require("./ai");

// AI funksiyalarini chaqiramiz
const { extractNameAndProduct, extractQuantityOnly, extractQuantityAndBudget, extractDeadline } = aiModule;

const sessions = new Map();

// Sessiyani tozalash (30 daqiqa)
const SESSION_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 5 * 60 * 1000);

// Xabarni tarixga yozish va qaytarish formati
function botReply(session, text, imageUrl = null) {
  if (session && text) {
    session.history.push({ role: "assistant", content: text });
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }
  }
  return { text: text, image: imageUrl };
}

// JSON bazadan rasm topish
function findImageByKeyword(keyword) {
  if (!keyword) return null;
  const norm = keyword.toLowerCase().trim();
  const found = config.catalog.find(p => p.category.toLowerCase().includes(norm) || p.name.toLowerCase().includes(norm));
  return found ? found.image : null;
}

// JSON bazadan narx qidirish va hisoblash
function calculateRecommendation(productKeyword, qtyStr, budgetStr) {
  const norm = (productKeyword || "").toLowerCase().trim();
  const qty = parseInt((qtyStr || "").replace(/\D/g, "")) || 0;
  
  // Mahsulotni topish
  const product = config.catalog.find(p => p.name.toLowerCase().includes(norm) || p.category.toLowerCase().includes(norm));
  if (!product) return null;

  let bestTier = null;
  if (product.price_tiers && product.price_tiers.length) {
    // Eng mos narxni miqdorga qarab olish
    bestTier = product.price_tiers.reduce((prev, curr) => (qty >= curr.minQty ? curr : prev), product.price_tiers[0]);
  }

  return {
    name: product.name,
    unitPrice: bestTier ? bestTier.price : "Narx operator tomonidan belgilanadi",
    minQty: bestTier ? bestTier.minQty : 1,
    image: product.image
  };
}

// Tizimga kirish (Birinchi xabar kelganda)
async function startWithText(senderId, lang, text) {
  if (!config.ai.apiKey) return { text: "Tizimda nosozlik. AI ulanmagan." };

  const session = { 
    step: "name_product", 
    lang: lang, 
    data: {}, 
    history: [], 
    updatedAt: Date.now() 
  };
  sessions.set(senderId, session);

  return handleMessage(senderId, text, lang);
}

// Asosiy muloqot zanjiri
async function handleMessage(senderId, text, lang) {
  const session = sessions.get(senderId);
  if (!session) return startWithText(senderId, lang, text);

  session.updatedAt = Date.now();
  session.history.push({ role: "user", content: text });

  // 1-BOSQICH: Ism va Mahsulot toifasini aniqlash
  if (session.step === "name_product") {
    const aiResult = await extractNameAndProduct(senderId, session.history, lang, session.data);
    if (!aiResult) return botReply(session, "Kechirasiz, fikringizni biroz tushunmadim. Qanday mahsulot qidiryapsiz?");

    if (aiResult.name) session.data.name = aiResult.name;
    if (aiResult.product) session.data.product = aiResult.product;

    // Agar AI'ga yana ma'lumot kerak bo'lsa (Mijoz ismini aytmagan yoki o'zi savol bergan bo'lsa)
    if (aiResult.needs_clarification) {
      let imageUrl = findImageByKeyword(aiResult.image_keyword);
      return botReply(session, aiResult.clarification_question, imageUrl);
    }

    // Ism va mahsulot aniqlandi, keyingi bosqichga o'tamiz
    session.step = "quantity_budget";
    // AI o'zi natural o'tish qilishi uchun history ni ozgina o'zgartirmaymiz, silliq davom etadi.
    const budgetPrompt = await extractQuantityAndBudget(senderId, session.history, lang, session.data);
    return botReply(session, budgetPrompt ? budgetPrompt.clarification_question : "Ajoyib! Endi taxminan nechta kerakligi va byudjetingizni aytsangiz, shunga mos eng yaxshi variantni tavsiya qilaman.");
  }

  // 2-BOSQICH: Miqdor va Byudjet
  if (session.step === "quantity_budget") {
    const aiResult = await extractQuantityAndBudget(senderId, session.history, lang, session.data);
    if (!aiResult) return botReply(session, "Kechirasiz, tushunmadim. Nechta dona kerak?");

    if (aiResult.quantity) session.data.quantity = aiResult.quantity;
    if (aiResult.budget) session.data.budget = aiResult.budget;

    if (aiResult.needs_clarification) {
      let imageUrl = findImageByKeyword(aiResult.image_keyword);
      return botReply(session, aiResult.clarification_question, imageUrl);
    }

    // Miqdor va byudjet aniq, tavsiya tayyorlaymiz
    const rec = calculateRecommendation(session.data.product, session.data.quantity, session.data.budget);
    session.data.recommendation = rec;
    session.step = "deadline";

    let textResp = "";
    if (rec && typeof rec.unitPrice === "number") {
      textResp = `Siz aytgan talablarga ko'ra quyidagi variant eng mos keladi: "${rec.name}". \n\n💰 Donasiga narxi: ${rec.unitPrice} so'm.\n📦 Eng kam buyurtma: ${rec.minQty} dona.\n\nTasdiqlaysizmi yoki boshqa mahsulot ham qo'shamizmi?`;
    } else if (rec) {
      textResp = `Sizga "${rec.name}" mos keladi. Aniq narxini chiqarish uchun arizangizni mutaxassisga yo'naltiraman.\n\nZakaz qachongacha tayyor bo'lishi kerak?`;
    } else {
      textResp = `Afsuski, aynan siz so'ragan narxda bazada tayyor tovar topolmadim, lekin mutaxassisimiz sizga maxsus variant qilib beradi. \n\nBuyurtma qachongacha tayyor bo'lishi kerak?`;
    }

    return botReply(session, textResp, rec ? rec.image : null);
  }

  // 3-BOSQICH: Muddat va Yakunlash
  if (session.step === "deadline") {
    // Agar mijoz "boshqasi kerak", "yana qo'sh" desa, boshiga qaytaramiz
    if (/boshqa|yana|qo'sh|qosh|yo'q/i.test(text)) {
      session.step = "name_product";
      return handleMessage(senderId, text, lang); // Recurse
    }

    const aiResult = await extractDeadline(senderId, session.history, lang);
    if (aiResult && !aiResult.needs_clarification) {
      session.data.deadline = aiResult.deadline;
    }

    session.step = "phone";
    return botReply(session, "Juda yaxshi! Operatorimiz siz bilan tezda bog'lanib barcha detallarni kelishib olishi uchun aloqa raqamingizni qoldiring (Masalan: +998901234567).");
  }

  // 4-BOSQICH: Telefon va Ariza yopilishi
  if (session.step === "phone") {
    const phoneMatch = text.match(/\+?\d{9,12}/);
    if (!phoneMatch) {
      return botReply(session, "Telefon raqamingizni to'g'ri formatda yozing (Masalan: +998901234567).");
    }

    session.data.phone = phoneMatch[0];
    const finalData = { ...session.data };
    sessions.delete(senderId);

    const finishText = `Rahmat, ${finalData.name || "mijoz"}! 🎉\n\nSizning so'rovingiz bo'yicha ariza qabul qilindi va mutaxassisimiz tez orada ${finalData.phone} raqamiga aloqaga chiqadi.`;
    return { text: finishText, finished: true, order: finalData };
  }

  return null;
}

function isActive(senderId) { return sessions.has(senderId); }
function cancel(senderId) { sessions.delete(senderId); }

module.exports = { isActive, startWithText, handleMessage, cancel };
