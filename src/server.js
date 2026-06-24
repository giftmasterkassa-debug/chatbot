// Asosiy server: Instagram webhook'ini qabul qiladi va avtomat javob beradi.
// YANGI ARXITEKTURA: tugmalar yo'q, hammasi erkin matn + to'liq kontekstli AI suhbat orqali.
const express = require("express");
const config = require("./config");
const buildResponses = require("./responses");
const { verifySignature, sendMessage, markSeen, sendImage } = require("./messenger");
const { detectLang } = require("./lang");
const orderFlow = require("./orderFlow");

const responses = buildResponses(config.business);

const app = express();
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

app.get("/", (_req, res) => res.send("Instagram bot ishlayapti ✅"));

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

app.post("/webhook", (req, res) => {
  if (!verifySignature(req.rawBody, req.get("x-hub-signature-256"))) {
    console.warn("❌ Imzo noto'g'ri - so'rov rad etildi");
    return res.sendStatus(403);
  }

  const body = req.body;
  if (body.object !== "instagram" && body.object !== "page") {
    return res.sendStatus(404);
  }

  res.sendStatus(200);

  for (const entry of body.entry || []) {
    const events = entry.messaging || entry.standby || [];
    for (const event of events) {
      const senderId = event.sender && event.sender.id;
      enqueueForSender(senderId, () =>
        handleEvent(event).catch(async (e) => {
          console.error("Hodisani qayta ishlashda xato:", e);
          if (senderId) {
            try {
              await sendMessage(senderId, {
                text: "Kechirasiz, texnik nosozlik yuz berdi 🙏 Birozdan keyin qayta urinib ko'ring.",
              });
            } catch (_) {
              /* qila oladigan ishimiz yo'q */
            }
          }
        })
      );
    }
  }
});

// Bir xil mijozdan ketma-ket kelgan xabarlarni navbat bilan (poyga holatisiz) qayta ishlaymiz.
const senderQueues = new Map();
function enqueueForSender(senderId, task) {
  if (!senderId) return task();
  const prev = senderQueues.get(senderId) || Promise.resolve();
  const next = prev.then(task, task).finally(() => {
    if (senderQueues.get(senderId) === next) senderQueues.delete(senderId);
  });
  senderQueues.set(senderId, next);
  return next;
}

// Operatorga (do'kon egasiga) xabar tayyorlaydi: mijozning Instagram profili (ID) va,
// agar mavjud bo'lsa, tasdiqlangan buyurtma tafsilotlari.
function buildAdminNotice(notice) {
  const lines = [
    "\ud83d\udfe2 Mijoz operator bilan bog'lanishni so'radi (yoki buyurtma yakunlandi)",
    "\ud83c\udd94 Instagram ID: " + notice.senderId,
    "\ud83d\udc64 Ism: " + (notice.customerName || "noma'lum"),
  ];

  const order = notice.order;
  if (order) {
    lines.push("");
    lines.push("\ud83c\udd95 Buyurtma raqami: " + order.id);
    for (const it of order.items || []) {
      let l = "\u2022 " + it.product + " \u2014 " + it.quantity;
      if (it.price) l += ", " + it.price.unitPrice.toLocaleString("en-US").replace(/,/g, " ") + " so'm/dona = " + it.price.total.toLocaleString("en-US").replace(/,/g, " ") + " so'm";
      lines.push(l);
    }
    if (order.total) lines.push("\ud83d\udcb0 Jami: " + order.total.toLocaleString("en-US").replace(/,/g, " ") + " so'm");
    lines.push("\u23f0 Muddat: " + (order.deadline || "kelishiladi"));
    lines.push("\ud83d\udcf1 Telefon: " + order.phone);
  } else {
    lines.push("(Hali buyurtma yakunlanmagan - mijoz bilan to'g'ridan-to'g'ri bog'laning.)");
  }

  return { text: lines.join("\n") };
}

async function handleEvent(event) {
  const senderId = event.sender && event.sender.id;
  if (!senderId) return;

  // "Get Started" / birinchi marta ochilishi - statik salomlashish (AI chaqirilmaydi, tugmasiz).
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

  // Matn yo'q (stiker/rasm/reaksiya). Haqiqiy attachment (rasm va h.k.) bo'lsa qisqa eslatma
  // beramiz; faqat reaksiya (hech narsa yo'q) bo'lsa - sukut.
  if (!text) {
    if (msg.attachments && msg.attachments.length) {
      await sendMessage(senderId, {
        text: "Buni ko'rdim \ud83d\ude0a Iltimos, savolingizni matn bilan yozib yuborsangiz, tezroq yordam beraman.",
      });
    }
    return;
  }

  const lang = detectLang(text);
  const result = await orderFlow.processMessage(senderId, text, lang);

  if (result.image) await sendImage(senderId, result.image);
  await sendMessage(senderId, { text: result.text });

  if (result.adminNotice && config.adminRecipientId) {
    await sendMessage(config.adminRecipientId, buildAdminNotice(result.adminNotice));
  } else if (result.adminNotice && !config.adminRecipientId) {
    console.log("\u2139\ufe0f  Operator xabari (ADMIN_RECIPIENT_ID sozlanmagan, faqat konsolga):", JSON.stringify(result.adminNotice));
  }

  console.log(`→ Javob yuborildi: ${senderId}`);
}

app.listen(config.port, () => {
  console.log(`🤖 Bot ishga tushdi: http://localhost:${config.port}`);
  if (config.dryRun) console.log("⚠️  DRY_RUN yoqilgan - haqiqiy xabar yuborilmaydi.");
  if (!config.appSecret) console.log("⚠️  APP_SECRET sozlanmagan - imzo tekshiruvi o'chiq.");
  if (!config.pageAccessToken && !config.dryRun)
    console.log("⚠️  PAGE_ACCESS_TOKEN sozlanmagan - xabar yuborib bo'lmaydi.");
  if (!config.ai.apiKey)
    console.log("⚠️  OPENAI_API_KEY sozlanmagan - bot statik (AI'siz) rejimda ishlaydi.");
  if (!config.adminRecipientId)
    console.log("⚠️  ADMIN_RECIPIENT_ID sozlanmagan - operator xabarlari faqat konsolga yoziladi.");
});

module.exports = app;
