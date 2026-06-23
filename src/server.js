// Asosiy server: Instagram webhook'ini qabul qiladi va jarayonlarni AI'ga uzatadi.

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

// Webhook imzosini tekshirish uchun rawBody ni saqlaymiz.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Bir xil xabarga ikki marta javob bermaslik uchun xotira (Meta takrorlashi mumkin).
const processed = new Set();
function alreadyHandled(mid) {
  if (!mid) return false;
  if (processed.has(mid)) return true;
  processed.add(mid);
  if (processed.size > 5000) processed.clear();
  return false;
}

// Server holatini tekshirish
app.get("/", (_req, res) => res.send("Gift Master AI boti faol ishlamoqda ✅"));

// 1) Webhook verifikatsiyasi (Meta GET so'rovi)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === config.verifyToken) {
    console.log("✅ Webhook muvaffaqiyatli tasdiqlandi");
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

  // Meta'ga darhol 200 qaytaramiz (timeout bo'lmasligi uchun)
  res.sendStatus(200);

  for (const entry of body.entry || []) {
    const events = entry.messaging || entry.standby || [];
    for (const event of events) {
      const senderId = event.sender && event.sender.id;
      handleEvent(event).catch(async (e) => {
        console.error("Hodisani qayta ishlashda xato:", e);
        if (senderId) {
          try {
            await sendMessage(senderId, "Kechirasiz, texnik nosozlik yuz berdi 🙏 Birozdan keyin qayta urinib ko'ring yoki 'operator' deb yozing.");
          } catch (_) {}
        }
      });
    }
  }
});

// Admin (do'kon egasi) uchun yangi buyurtma matnini tayyorlash
function buildAdminNotice(senderId, order) {
  let text = `🆕 Yangi buyurtma!\n👤 Ism: ${order.name || "Mijoz"}\n📱 Telefon: ${order.phone}\n⏰ Muddat: ${order.deadline || "Noma'lum"}\n\n📦 Mahsulot: ${order.product}\n🔢 Soni: ${order.quantity}\n💰 Byudjet (agar aytilgan bo'lsa): ${order.budget || "Aytilmadi"}\n`;

  if (order.recommendation) {
    text += `\n✅ Taklif qilingan tovar: ${order.recommendation.name}`;
    text += typeof order.recommendation.unitPrice === "number" 
      ? `\n💵 Narxi: ${order.recommendation.unitPrice} so'm` 
      : `\n⚠️ Narx aytilmadi, admin hisoblashi kerak.`;
  }
  text += `\n\n🆔 Instagram ID: ${senderId}`;
  return text;
}

// AI natijalarini mijozga (va kerak bo'lsa adminga) jo'natish
async function deliverOrderFlowResult(senderId, result) {
  if (!result) return false;

  // 1. Agar rasm bo'lsa yuboramiz
  if (result.image) {
    await sendImage(senderId, result.image);
  }

  // 2. Matnni yuboramiz
  if (result.text) {
    await sendMessage(senderId, result.text);
  }

  // 3. Ariza to'ldirilgan bo'lsa adminga tashlaymiz
  if (result.finished && result.order && config.adminRecipientId) {
    const adminText = buildAdminNotice(senderId, result.order);
    await sendMessage(config.adminRecipientId, adminText);
  }

  console.log(`→ AI Javobi yuborildi: ${senderId}`);
  return true;
}

// Asosiy voqealarni (event) boshqaruvchi funksiya
async function handleEvent(event) {
  const senderId = event.sender && event.sender.id;
  if (!senderId) return;

  if (event.postback) {
    orderFlow.cancel(senderId);
    await sendMessage(senderId, responses.welcome.uz.text);
    return;
  }

  if (!event.message) return; 
  if (event.message.is_echo) return; 
  if (alreadyHandled(event.message.mid)) return;

  await markSeen(senderId);

  const msg = event.message;
  const text = msg.text;

  // Stiker yoki rasm (matnsiz xabar) kelsa
  if (!text) {
    if (msg.attachments && msg.attachments.length) {
      await sendMessage(senderId, "Buni ko'rdim 😊 Iltimos, savolingizni yoki nima kerakligini matn bilan yozib yuborsangiz, tezroq yordam beraman.");
      console.log(`→ Rasm/stikerga eslatma yuborildi: ${senderId}`);
    }
    return;
  }

  const lang = detectLang(text);

  // 1-QADAM: Favqulodda kalit so'zlarni tekshiramiz (Masalan: Operator)
  const routeResult = route(event);
  if (routeResult.intent === "operator") {
    orderFlow.cancel(senderId); // AI xotirasini tozalaymiz
    await sendMessage(senderId, routeResult.response.text);
    console.log(`→ Operatorga ulandi: ${senderId}`);
    return;
  }

  // 2-QADAM: Barcha qolgan xabarlarni AI ga yo'naltiramiz
  if (!orderFlow.isActive(senderId)) {
    console.log(`→ Yangi suhbat (AI) boshlandi: ${senderId}`);
    const r = await orderFlow.startWithText(senderId, lang, text);
    if (await deliverOrderFlowResult(senderId, r)) return;
  } else {
    const result = await orderFlow.handleMessage(senderId, text, lang);
    if (await deliverOrderFlowResult(senderId, result)) return;
  }

  // Zaxira varianti (agar AI ishlamay qolsa)
  if (routeResult.response) {
    await sendMessage(senderId, routeResult.response.text);
    console.log(`→ Zaxira (Oddiy) javob yuborildi: ${senderId}`);
  }
}

app.listen(config.port, () => {
  console.log(`🤖 Bot ishga tushdi: http://localhost:${config.port}`);
  if (config.dryRun) console.log("⚠️ DRY_RUN yoqilgan - haqiqiy xabar yuborilmaydi.");
  if (!config.appSecret) console.log("⚠️ APP_SECRET sozlanmagan - imzo tekshiruvi o'chiq.");
  if (!config.pageAccessToken && !config.dryRun) console.log("⚠️ PAGE_ACCESS_TOKEN sozlanmagan - xabar yuborib bo'lmaydi.");
  if (!config.ai.apiKey) console.log("⚠️ OPENAI_API_KEY sozlanmagan - bot AI rejimida ishlamaydi.");
});

module.exports = app;
