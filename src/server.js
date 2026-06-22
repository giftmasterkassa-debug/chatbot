// Asosiy server: Instagram webhook'ini qabul qiladi va avtomat javob beradi.
const express = require("express");
const config = require("./config");
const buildResponses = require("./responses");
const { buildRouter } = require("./router");
const { verifySignature, sendMessage, markSeen, sendImage } = require("./messenger");
const { detectLang } = require("./lang");
const orderFlow = require("./orderFlow");

const responses = buildResponses(config.business);
const { route } = buildRouter(responses);

const app = express();
// rawBody ni saqlaymiz - imzoni tekshirish uchun kerak.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Bir xil xabarga ikki marta javob bermaslik uchun (Meta ba'zan qayta yuboradi).
const processed = new Set();
function alreadyHandled(mid) {
  if (!mid) return false;
  if (processed.has(mid)) return true;
  processed.add(mid);
  if (processed.size > 5000) processed.clear();
  return false;
}

// Sog'liqni tekshirish
app.get("/", (_req, res) => res.send("Instagram bot ishlayapti ✅"));

// 1) Webhook verifikatsiyasi (Meta GET so'rovi)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === config.verifyToken) {
    console.log("✅ Webhook tasdiqlandi");
    return res.status(200).send(challenge);
  }
  console.warn("❌ Webhook verify token noto'g'ri");
  return res.sendStatus(403);
});

// 2) Webhook hodisalari (Meta POST so'rovi)
app.post("/webhook", (req, res) => {
  if (!verifySignature(req.rawBody, req.get("x-hub-signature-256"))) {
    console.warn("❌ Imzo noto'g'ri - so'rov rad etildi");
    return res.sendStatus(403);
  }

  const body = req.body;
  if (body.object !== "instagram" && body.object !== "page") {
    return res.sendStatus(404);
  }

  // Meta'ga darhol 200 qaytaramiz, javoblarni keyin yuboramiz.
  res.sendStatus(200);

  for (const entry of body.entry || []) {
    const events = entry.messaging || entry.standby || [];
    for (const event of events) {
      handleEvent(event).catch((e) => console.error("Hodisani qayta ishlashda xato:", e));
    }
  }
});

// Operatorga (do'kon egasiga) yangi buyurtma haqida qisqa xabar tayyorlaydi.
function buildAdminNotice(senderId, order) {
  let priceLine = "";
  if (order.price) {
    priceLine = `💰 Narxi: ${order.price.unitPrice.toLocaleString("en-US").replace(/,/g, " ")} so'm/dona x ${order.quantity} = ${order.price.total.toLocaleString("en-US").replace(/,/g, " ")} so'm\n`;
  } else if (order.minQtyRequired) {
    priceLine = `💰 Diqqat: mijoz so'ragan miqdor eng kam buyurtma chegarasidan (${order.minQtyRequired} dona) kam - narxni o'zingiz belgilang\n`;
  }
  return {
    text:
      `🆕 Yangi buyurtma!\n` +
      `👤 Ism: ${order.name}\n` +
      `🎁 Mahsulot: ${order.product}\n` +
      `🔢 Soni: ${order.quantity}\n` +
      priceLine +
      `⏰ Muddat: ${order.deadline}\n` +
      `📱 Telefon: ${order.phone}\n` +
      `🆔 Instagram ID: ${senderId}`,
    quickReplies: [],
  };
}

// Kalit so'z topilmagan xabar mahsulot/narx haqida so'rov bo'lishi mumkinligini taxmin qiladi
// (masalan "ruchka nechpul", "qalam bormi"). Faqat shunday holatda AI'ni ishga tushiramiz -
// shunda "rahmat", "zor" kabi mavzusiz xabarlar behuda buyurtma jarayonini boshlamaydi.
function looksLikeProductInquiry(text) {
  const t = (text || "").toLowerCase();
  if (/\d/.test(t)) return true; // raqam bor - narx/son so'ralayotgan bo'lishi mumkin
  if (/nech|narx|qancha|qiymat|bormi|mavjud|сколько|сум|цена/.test(t)) return true;
  return config.catalog.some((p) => t.includes(p.name.toLowerCase()));
}

async function handleEvent(event) {
  const senderId = event.sender && event.sender.id;
  if (!senderId) return;

  // "Get Started" yoki postback tugmasi - har doim yangidan boshlanadi.
  if (event.postback) {
    orderFlow.cancel(senderId);
    await sendMessage(senderId, responses.welcome.uz);
    return;
  }

  if (!event.message) return; // delivery/read kabi hodisalarni e'tiborsiz qoldiramiz
  if (event.message.is_echo) return; // o'zimiz yuborgan xabar
  if (alreadyHandled(event.message.mid)) return;

  await markSeen(senderId);

  const msg = event.message;
  const payload = msg.quick_reply && msg.quick_reply.payload;

  // 1) Quick reply tugma bosilgan
  if (payload) {
    const [intentRaw, langRaw] = String(payload).split("|");
    const intent = (intentRaw || "").toLowerCase();
    const lang = langRaw === "ru" ? "ru" : "uz";

    if (intent === "cancel") {
      orderFlow.cancel(senderId);
      await sendMessage(senderId, orderFlow.cancelText(lang));
      console.log(`→ Buyurtma bekor qilindi: ${senderId}`);
      return;
    }

    // Boshqa har qanday tugma bosilishi = navigatsiya, faol buyurtma sessiyasi bekor qilinadi.
    orderFlow.cancel(senderId);

    if (intent === "order") {
      const r = orderFlow.start(senderId, lang);
      await sendMessage(senderId, r);
      console.log(`→ Buyurtma boshlandi: ${senderId}`);
      return;
    }

    const { response } = route(event);
    await sendMessage(senderId, response);
    console.log(`→ Javob yuborildi: ${senderId}`);
    return;
  }

  // 2) Matn yo'q (stiker/rasm) - salomlashish bilan javob beramiz
  const text = msg.text;
  if (!text) {
    await sendMessage(senderId, responses.welcome.uz);
    return;
  }

  // 3) Mijoz faol buyurtma jarayonida bo'lsa - xabarni o'sha jarayonga yo'naltiramiz.
  if (orderFlow.isActive(senderId)) {
    const lang = detectLang(text);
    const result = await orderFlow.handleMessage(senderId, text, lang);
    if (result) {
      if (result.image) await sendImage(senderId, result.image);
      await sendMessage(senderId, result);
      if (result.finished && result.order && config.adminRecipientId) {
        await sendMessage(config.adminRecipientId, buildAdminNotice(senderId, result.order));
      }
      console.log(`→ Javob yuborildi (buyurtma): ${senderId}`);
      return;
    }
  }

  // 4) Oddiy matn - kalit so'z bo'yicha javob beramiz
  const { intent, lang, response } = route(event);

  if (intent === "order") {
    const r = orderFlow.start(senderId, lang);
    await sendMessage(senderId, r);
    console.log(`→ Buyurtma boshlandi: ${senderId}`);
    return;
  }

  // Hech qanday kalit so'z topilmadi ("buyurtma" deyilmadi) - lekin bu mahsulot/narx haqida
  // savol bo'lishi mumkin (masalan "ruchka nechpul"). AI sozlangan bo'lsa, shu matn bilan
  // to'g'ridan-to'g'ri buyurtma jarayonini boshlab ko'ramiz.
  if (intent === "fallback" && looksLikeProductInquiry(text)) {
    const r = await orderFlow.startWithText(senderId, lang, text);
    if (r) {
      if (r.image) await sendImage(senderId, r.image);
      await sendMessage(senderId, r);
      console.log(`→ Buyurtma boshlandi (AI, kalit so'zsiz): ${senderId}`);
      return;
    }
  }

  await sendMessage(senderId, response);
  console.log(`→ Javob yuborildi: ${senderId}`);
}

app.listen(config.port, () => {
  console.log(`🤖 Bot ishga tushdi: http://localhost:${config.port}`);
  if (config.dryRun) console.log("⚠️  DRY_RUN yoqilgan - haqiqiy xabar yuborilmaydi.");
  if (!config.appSecret) console.log("⚠️  APP_SECRET sozlanmagan - imzo tekshiruvi o'chiq.");
  if (!config.pageAccessToken && !config.dryRun)
    console.log("⚠️  PAGE_ACCESS_TOKEN sozlanmagan - xabar yuborib bo'lmaydi.");
  if (!config.ai.apiKey)
    console.log("⚠️  OPENAI_API_KEY sozlanmagan - buyurtma bosqichma-bosqich AI rejimida ishlamaydi (statik rejim).");
});

module.exports = app;
