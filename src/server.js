// Asosiy server: Instagram webhook'ini qabul qiladi va avtomat javob beradi.
// FULL AI VERSION: Barcha xabarlar erkin suhbat (AI) orqali boshqariladi.

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

  // Meta'ga darhol 200 qaytaramiz
  res.sendStatus(200);

  for (const entry of body.entry || []) {
    const events = entry.messaging || entry.standby || [];
    for (const event of events) {
      const senderId = event.sender && event.sender.id;
      handleEvent(event).catch(async (e) => {
        console.error("Hodisani qayta ishlashda xato:", e);
        if (senderId) {
          try {
            await sendMessage(senderId, {
              text: "Kechirasiz, texnik nosozlik yuz berdi 🙏 Birozdan keyin qayta urinib ko'ring yoki \"operator\" deb yozing.",
            });
          } catch (_) {}
        }
      });
    }
  }
});

// Operatorga (do'kon egasiga) yangi buyurtma haqida xabar tayyorlaydi.
function buildAdminNotice(senderId, order) {
  const lines = (order.items || []).map((it, i) => {
    let l = `${i + 1}. ${it.product} — ${it.quantity}`;
    if (it.price) l += `, ${it.price.unitPrice.toLocaleString("en-US").replace(/,/g, " ")} so'm/dona = ${it.price.total.toLocaleString("en-US").replace(/,/g, " ")} so'm`;
    else if (it.minQtyRequired) l += ` (min. ${it.minQtyRequired} dona, narxni o'zingiz belgilang)`;
    return l;
  });
  const total = (order.items || []).reduce((s, it) => s + (it.price ? it.price.total : 0), 0);

  return {
    text:
      `🆕 Yangi buyurtma! (${order.orderId})\n` +
      `👤 Ism: ${order.name}\n\n` +
      lines.join("\n") +
      (total ? `\n\n💰 Jami: ${total.toLocaleString("en-US").replace(/,/g, " ")} so'm` : "") +
      `\n⏰ Muddat: ${order.deadline}\n` +
      `📱 Telefon: ${order.phone}\n` +
      `🆔 Instagram ID: ${senderId}`
  };
}

// AI'dan kelgan natijani mijozga yuborish
async function deliverOrderFlowResult(senderId, result) {
  if (!result) return false;
  if (result.image) await sendImage(senderId, result.image);
  await sendMessage(senderId, result);
  
  if (result.finished && result.order && config.adminRecipientId) {
    await sendMessage(config.adminRecipientId, buildAdminNotice(senderId, result.order));
  }
  console.log(`→ AI Javobi yuborildi: ${senderId}`);
  return true;
}

// Asosiy hodisalarni boshqaruvchi funksiya
async function handleEvent(event) {
  const senderId = event.sender && event.sender.id;
  if (!senderId) return;

  if (event.postback) {
    orderFlow.cancel(senderId);
    await sendMessage(senderId, responses.welcome.uz);
    return;
  }

  if (!event.message) return; 
  if (event.message.is_echo) return; 
  if (alreadyHandled(event.message.mid)) return;

  await markSeen(senderId);

  const msg = event.message;
  const text = msg.text;

  // Stiker yoki Rasm kelsa
  if (!text) {
    if (msg.attachments && msg.attachments.length) {
      await sendMessage(senderId, {
        text: "Buni ko'rdim 😊 Iltimos, savolingizni yoki nima kerakligini matn bilan yozib yuborsangiz, tezroq yordam beraman.",
      });
      console.log(`→ Rasm/stikerga eslatma yuborildi: ${senderId}`);
    }
    return;
  }

  const lang = detectLang(text);

  // === ASOSIY O'ZGARISH: TO'LIQ AI NAZORATI ===
  // Agar mijozda faol sessiya yo'q bo'lsa (yangi suhbat bo'lsa), to'g'ridan-to'g'ri AI sessiyasini boshlaymiz.
  if (!orderFlow.isActive(senderId)) {
    console.log(`→ Yangi suhbat (AI) boshlandi: ${senderId}`);
    const r = await orderFlow.startWithText(senderId, lang, text);
    if (await deliverOrderFlowResult(senderId, r)) return;
  } else {
    // Agar mijoz faol sessiyada bo'lsa, xabarni AI ga jo'natamiz
    const result = await orderFlow.handleMessage(senderId, text, lang);
    if (await deliverOrderFlowResult(senderId, result)) return;
  }

  // Agar AI nimagadir ishlamay qolsa (zaxira varianti)
  const { response } = route(event);
  await sendMessage(senderId, response);
  console.log(`→ Zaxira (Oddiy) javob yuborildi: ${senderId}`);
}

app.listen(config.port, () => {
  console.log(`🤖 Bot ishga tushdi: http://localhost:${config.port}`);
  if (config.dryRun) console.log("⚠️ DRY_RUN yoqilgan - haqiqiy xabar yuborilmaydi.");
  if (!config.appSecret) console.log("⚠️ APP_SECRET sozlanmagan - imzo tekshiruvi o'chiq.");
  if (!config.pageAccessToken && !config.dryRun)
    console.log("⚠️ PAGE_ACCESS_TOKEN sozlanmagan - xabar yuborib bo'lmaydi.");
  if (!config.ai.apiKey)
    console.log("⚠️ OPENAI_API_KEY sozlanmagan - bot AI rejimida ishlamaydi.");
});

module.exports = app;
