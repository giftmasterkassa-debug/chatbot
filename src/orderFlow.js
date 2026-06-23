const config = require("./config");
const aiModule = require("./ai");
const { extractNameAndProduct, extractQuantityOnly, extractQuantityAndBudget, extractDeadline } = aiModule;

const sessions = new Map();

const SESSION_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 5 * 60 * 1000);

function botReply(session, text, imageUrl = null) {
  if (session && text) {
    session.history.push({ role: "assistant", content: text });
    if (session.history.length > 20) session.history = session.history.slice(-20);
  }
  return { text: text, image: imageUrl };
}

function findImageByKeyword(keyword) {
  if (!keyword) return null;
  const norm = keyword.toLowerCase().trim();
  const found = config.catalog.find(p => p.name.toLowerCase().includes(norm));
  return found ? found.image : null;
}

function calculateRecommendation(productKeyword, qtyStr, budgetStr) {
  const norm = (productKeyword || "").toLowerCase().trim();
  const qty = parseInt((qtyStr || "").replace(/\D/g, "")) || 0;
  const product = config.catalog.find(p => p.name.toLowerCase().includes(norm));
  if (!product) return null;

  let availableTiers = product.tiers || (product.options && product.options[0].tiers) || [];
  let bestTier = availableTiers.reduce((prev, curr) => (qty >= curr.minQty ? curr : prev), availableTiers[0]);

  return {
    name: product.name,
    unitPrice: bestTier ? bestTier.price : "Narx operator tomonidan belgilanadi",
    minQty: bestTier ? bestTier.minQty : 1,
    image: product.image
  };
}

function isActive(senderId) { return sessions.has(senderId); }
function cancel(senderId) { sessions.delete(senderId); }

async function startWithText(senderId, lang, text) {
  const session = { step: "name_product", lang: lang, data: {}, history: [], updatedAt: Date.now() };
  sessions.set(senderId, session);
  return handleMessage(senderId, text, lang);
}

async function handleMessage(senderId, text, lang) {
  const session = sessions.get(senderId);
  if (!session) return null;
  session.updatedAt = Date.now();
  session.history.push({ role: "user", content: text });

  if (session.step === "name_product") {
    const aiResult = await extractNameAndProduct(senderId, session.history, lang, session.data);
    if (!aiResult) return botReply(session, "Savolingizni tushunmadim. Qanday mahsulot qidiryapsiz?");
    if (aiResult.name) session.data.name = aiResult.name;
    if (aiResult.product) session.data.product = aiResult.product;
    if (aiResult.needs_clarification) return botReply(session, aiResult.clarification_question, findImageByKeyword(aiResult.image_keyword));
    session.step = "quantity_budget";
    return botReply(session, "Ajoyib! Nechta dona kerak va byudjetingiz qancha?");
  }

  if (session.step === "quantity_budget") {
    const aiResult = await extractQuantityAndBudget(senderId, session.history, lang, session.data);
    if (!aiResult || !aiResult.quantity) return botReply(session, "Miqdorni aniqroq ayta olasizmi?");
    session.data.quantity = aiResult.quantity;
    const rec = calculateRecommendation(session.data.product, session.data.quantity, session.data.budget);
    session.data.recommendation = rec;
    session.step = "deadline";
    return botReply(session, `Sizga "${rec.name}" mos keladi. Buyurtma qachongacha tayyor bo'lishi kerak?`, rec.image);
  }

  if (session.step === "deadline") {
    const aiResult = await extractDeadline(senderId, session.history, lang);
    session.data.deadline = aiResult ? aiResult.deadline : text;
    session.step = "phone";
    return botReply(session, "Tushundim. Operatorimiz bog'lanishi uchun telefon raqamingizni yozing (+998...).");
  }

  if (session.step === "phone") {
    session.data.phone = text;
    const finalData = { ...session.data };
    sessions.delete(senderId);
    return { text: `Rahmat, ${finalData.name || "mijoz"}! Ariza qabul qilindi.`, finished: true, order: finalData };
  }
}

module.exports = { isActive, startWithText, handleMessage, cancel };
