// Konfiguratsiya: barcha sozlamalar .env faylidan o'qiladi.
require("dotenv").config();
const fs = require("fs");
const path = require("path");

function val(name, def) {
  const v = process.env[name];
  return v === undefined || v === "" ? def : v;
}

function list(name, def = []) {
  const v = process.env[name];
  if (v === undefined || v === "") return def;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Mahsulotlar katalogi: products.json fayldan o'qiladi (Toifa va rasmlarni qo'llab-quvvatlaydi)
function loadCatalog() {
  const filePath = path.join(__dirname, "products.json");
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.error("⚠️ products.json o'qishda xato:", e.message);
  }
  return list("PRODUCTS", []).map((name) => ({ name, category: "boshqa", image: null, price_tiers: [] }));
}

const config = {
  port: parseInt(val("PORT", "3000"), 10),

  // Meta / Instagram (v21.0 Graph API)
  verifyToken: val("VERIFY_TOKEN", "my_verify_token"),
  appSecret: val("APP_SECRET", ""),
  pageAccessToken: val("PAGE_ACCESS_TOKEN", ""),
  graphHost: val("GRAPH_HOST", "graph.instagram.com"), 
  graphVersion: val("GRAPH_API_VERSION", "v21.0"),

  // Xotira (Suhbat tarixini barqaror saqlash uchun)
  redisUrl: val("REDIS_URL", ""), 

  // CRM va Ombor (Kelajakdagi integratsiyalar uchun zamin)
  amocrm: {
    domain: val("AMOCRM_DOMAIN", ""),
    accessToken: val("AMOCRM_TOKEN", "")
  },
  moysklad: {
    token: val("MOYSKLAD_TOKEN", "")
  },

  // Test rejimi va Admin
  dryRun: val("DRY_RUN", "false") === "true",
  adminRecipientId: val("ADMIN_RECIPIENT_ID", ""),

  // --- AI (OpenAI API) ---
  ai: {
    apiKey: val("OPENAI_API_KEY", ""),
    model: val("AI_MODEL", "gpt-4o-mini"), 
  },

  // Mahsulotlar katalogi (JSON)
  catalog: loadCatalog(),

  // Do'kon ma'lumotlari (Biznes mantiq va AI uchun tayanch faktlar)
  business: {
    shopName: val("SHOP_NAME", "Gift Master"),
    phone: val("PHONE", "+998 90 123 45 67"), 
    workHours: val("WORK_HOURS", "9:00 - 18:00"),
    address: val("ADDRESS", "Toshkent shahar, Yunusobod"),
    catalogUrl: val("CATALOG_URL", "https://t.me/giftmaster_katalog"), 
    deliveryTashkent: val("DELIVERY_TASHKENT", "Toshkentga - Yandex Dostavka orqali"),
    deliveryRegion: val("DELIVERY_REGION", "Viloyatlarga - BTS pochta orqali"),
    selfPickup: val("SELF_PICKUP", "O'zingiz ofisimizdan olib ketishingiz mumkin"),
    paymentMethods: val("PAYMENT_METHODS", "Naqd, Uzcard/Humo, va korxona hisobidan pul o'tkazish (QQS bilan)"),
  },
};

module.exports = config;
