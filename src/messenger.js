// Instagram Send API bilan ishlash + webhook imzosini tekshirish.
const crypto = require("crypto");
const config = require("./config");

// Meta yuborgan X-Hub-Signature-256 ni APP_SECRET bilan tekshiramiz.
function verifySignature(rawBody, signatureHeader) {
  if (!config.appSecret) {
    // APP_SECRET sozlanmagan bo'lsa, tekshirib bo'lmaydi (faqat test uchun).
    return true;
  }
  if (!signatureHeader) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", config.appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function apiUrl() {
  return `https://${config.graphHost}/${config.graphVersion}/me/messages?access_token=${encodeURIComponent(
    config.pageAccessToken
  )}`;
}

// Mijozga javob xabarini yuborish (matn + ixtiyoriy quick reply tugmalar).
async function sendMessage(recipientId, response) {
  const message = { text: response.text };
  if (response.quickReplies && response.quickReplies.length) {
    message.quick_replies = response.quickReplies.slice(0, 13).map((q) => ({
      content_type: "text",
      title: q.title.slice(0, 20),
      payload: q.payload,
    }));
  }

  const body = {
    recipient: { id: recipientId },
    messaging_type: "RESPONSE",
    message,
  };

  if (config.dryRun) {
    console.log("[DRY_RUN] →", recipientId, JSON.stringify(message));
    return { dryRun: true };
  }

  try {
    const res = await fetch(apiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) console.error("Send API xatosi:", res.status, JSON.stringify(data));
    return data;
  } catch (e) {
    console.error("Send API ulanish xatosi:", e.message);
    return { error: e.message };
  }
}

// "Ko'rildi" belgisini yuborish (ixtiyoriy, foydalanuvchi tajribasi uchun).
async function markSeen(recipientId) {
  if (config.dryRun || !config.pageAccessToken) return;
  try {
    await fetch(apiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, sender_action: "mark_seen" }),
    });
  } catch (_) {
    /* e'tiborsiz qoldiramiz */
  }
}

// Mahsulot rasmini (havola orqali) yuborish.
async function sendImage(recipientId, imageUrl) {
  if (!imageUrl) return;

  const body = {
    recipient: { id: recipientId },
    messaging_type: "RESPONSE",
    message: { attachment: { type: "image", payload: { url: imageUrl, is_reusable: true } } },
  };

  if (config.dryRun) {
    console.log("[DRY_RUN][IMAGE] →", recipientId, imageUrl);
    return { dryRun: true };
  }

  try {
    const res = await fetch(apiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) console.error("Rasm yuborishda xato:", res.status, JSON.stringify(data));
    return data;
  } catch (e) {
    console.error("Rasm yuborish ulanish xatosi:", e.message);
    return { error: e.message };
  }
}

module.exports = { verifySignature, sendMessage, markSeen, sendImage };
