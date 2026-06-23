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
      const senderId = event.sender && event.sender.id;
      handleEvent(event).catch(async (e) => {
        console.error("Hodisani qayta ishlashda xato:", e);
        // Mijozga sukut emas, kechirim so'rovchi qisqa xabar yuboramiz - aks holda
        // ichki xatolik bo'lganda mijoz hech qanday javob olmay qoladi.
        if (senderId) {
          try {
            await sendMessage(senderId, {
              text: "Kechirasiz, texnik nosozlik yuz berdi 🙏 Birozdan keyin qayta urinib ko'ring yoki \"operator\" deb yozing.",
              quickReplies: [],
            });
          } catch (_) {
            /* bu yerda ham xato chiqsa, qila oladigan ishimiz yo'q */
          }
        }
      });
    }
  }
});

// Operatorga (do'kon egasiga) yangi buyurtma haqida qisqa xabar tayyorlaydi.
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
      `🆔 Instagram ID: ${senderId}`,
    quickReplies: [],
  };
}

// Kalit so'z topilmagan xabar mahsulot/narx haqida so'rov bo'lishi mumkinligini taxmin qiladi
// (masalan "ruchka nechpul", "qalam bormi"). Faqat shunday holatda AI'ni ishga tushiramiz -
// shunda "rahmat", "zor" kabi mavzusiz xabarlar behuda buyurtma jarayonini boshlamaydi.
function looksLikeProductInquiry(text) {
  const t = (text || "").toLowerCase();
  if (/\d/.test(t)) return true;
  if (/nech|narx|qancha|qiymat|bormi|mavjud|сколько|сум|цена/.test(t)) return true;
  return config.catalog.some((p) => t.includes(p.name.toLowerCase()));
}

// Buyurtma jarayonidagi natijani mijozga (va kerak bo'lsa operatorga) yuborish - bir nechta
// joyda (matn, tugma) takrorlanadigan kodni shu yerga jamladik.
async function deliverOrderFlowResult(senderId, result) {
  if (!result) return false;
  if (result.image) await sendImage(senderId, result.image);
  await sendMessage(senderId, result);
  if (result.finished && result.order && config.adminRecipientId) {
    await sendMessage(config.adminRecipientId, buildAdminNotice(senderId, result.order));
  }
  console.log(`→ Javob yuborildi (buyurtma): ${senderId}`);
  return true;
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
    const parts = String(payload).split("|");
    const intent = (parts[0] || "").toLowerCase();
    const lang = parts[1] === "ru" ? "ru" : "uz";

    if (intent === "cancel") {
      orderFlow.cancel(senderId);
      await sendMessage(senderId, orderFlow.cancelText(lang));
      console.log(`→ Buyurtma bekor qilindi: ${senderId}`);
      return;
    }

    // Buyurtma jarayonidagi tugmalar (yana qo'shish / yo'q / boshqa variant / davom etish / tasdiqlash) -
    // bular shunchaki tegishli matnni "yozilgandek" orderFlow ichiga yuboradi.
    if (orderFlow.BUTTON_TEXT_MAP[intent] && orderFlow.isActive(senderId)) {
      const result = await orderFlow.handleMessage(senderId, orderFlow.BUTTON_TEXT_MAP[intent], lang);
      if (await deliverOrderFlowResult(senderId, result)) return;
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

  const text = msg.text;

  // 2) Matn yo'q - stiker/rasm/reaksiya. Reaksiyalarga (haqiqiy matn yo'q, attachments ham yo'q)
  // umuman javob bermaymiz. Lekin haqiqiy rasm/stiker yuborilgan bo'lsa, qisqa eslatma beramiz -
  // shunda mijoz bot "o'lik" deb o'ylamaydi, lekin to'liq qayta salomlashish ham bo'lmaydi.
  if (!text) {
    if (msg.attachments && msg.attachments.length) {
      await sendMessage(senderId, {
        text: "Buni ko'rdim 😊 Iltimos, savolingizni matn bilan yozib yuborsangiz, tezroq yordam beraman.",
        quickReplies: [],
      });
      console.log(`→ Rasm/stikerga eslatma yuborildi: ${senderId}`);
    }
    return;
  }

  // 3) Mijoz faol buyurtma jarayonida bo'lsa - xabarni o'sha jarayonga yo'naltiramiz.
  if (orderFlow.isActive(senderId)) {
    const lang = detectLang(text);
    const result = await orderFlow.handleMessage(senderId, text, lang);
    if (await deliverOrderFlowResult(senderId, result)) return;
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
    if (await deliverOrderFlowResult(senderId, r)) {
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
