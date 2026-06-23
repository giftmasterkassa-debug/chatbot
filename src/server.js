const express = require("express");
const config = require("./config");
const { verifySignature, sendMessage, markSeen, sendImage } = require("./messenger");
const { detectLang } = require("./lang");
const orderFlow = require("./orderFlow");

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

app.get("/", (_req, res) => res.send("Bot ishlamoqda..."));

app.post("/webhook", async (req, res) => {
  if (!verifySignature(req.rawBody, req.get("x-hub-signature-256"))) return res.sendStatus(403);
  res.sendStatus(200);

  for (const entry of req.body.entry || []) {
    for (const event of entry.messaging || []) {
      const senderId = event.sender.id;
      if (!event.message || event.message.is_echo) continue;
      
      await markSeen(senderId);
      const text = event.message.text;
      if (!text) continue;

      // Operator testi
      if (text.toLowerCase().includes("operator")) {
        orderFlow.cancel(senderId);
        await sendMessage(senderId, "Sizni operatorga ulayapman.");
        continue;
      }

      const lang = detectLang(text);
      let result;

      if (!orderFlow.isActive(senderId)) {
        result = await orderFlow.startWithText(senderId, lang, text);
      } else {
        result = await orderFlow.handleMessage(senderId, text, lang);
      }

      if (result) {
        if (result.image) await sendImage(senderId, result.image);
        if (result.text) await sendMessage(senderId, result.text);
      }
    }
  }
});

app.listen(config.port, () => console.log(`🤖 Bot ishga tushdi!`));
