// Asosiy server: Instagram webhook'ini qabul qiladi va avtomat javob beradi.
const express = require("express");
const config = require("./config");
const buildResponses = require("./responses");
const { buildRouter } = require("./router");
const { verifySignature, sendMessage, markSeen } = require("./messenger");

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

async function handleEvent(event) {
  const senderId = event.sender && event.sender.id;
  if (!senderId) return;

  // "Get Started" yoki postback tugmasi
  if (event.postback) {
    await sendMessage(senderId, responses.welcome.uz);
    return;
  }

  if (!event.message) return; // delivery/read kabi hodisalarni e'tiborsiz qoldiramiz
  if (event.message.is_echo) return; // o'zimiz yuborgan xabar
  if (alreadyHandled(event.message.mid)) return;

  const { response } = route(event);
  await markSeen(senderId);
  await sendMessage(senderId, response);
  console.log(`→ Javob yuborildi: ${senderId}`);
}

app.listen(config.port, () => {
  console.log(`🤖 Bot ishga tushdi: http://localhost:${config.port}`);
  if (config.dryRun) console.log("⚠️  DRY_RUN yoqilgan - haqiqiy xabar yuborilmaydi.");
  if (!config.appSecret) console.log("⚠️  APP_SECRET sozlanmagan - imzo tekshiruvi o'chiq.");
  if (!config.pageAccessToken && !config.dryRun)
    console.log("⚠️  PAGE_ACCESS_TOKEN sozlanmagan - xabar yuborib bo'lmaydi.");
});

module.exports = app;
