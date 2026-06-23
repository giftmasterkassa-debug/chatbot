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

// Mahsulotlar katalogi: products.json fayldan o'qiladi.
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
  return list("PRODUCTS", []).map((name) => ({ name, image: null, tiers: [] }));
}

const config = {
  port: parseInt(val("PORT", "3000"), 10),

  // Meta / Instagram
  verifyToken: val("VERIFY_TOKEN", "my_verify_token"),
  appSecret: val("APP_SECRET", ""),
  pageAccessToken: val("PAGE_ACCESS_TOKEN", ""),
  graphHost: val("GRAPH_HOST", "graph.facebook.com"), // yoki graph.instagram.com
  graphVersion: val("GRAPH_API_VERSION", "v21.0"),

  // Test rejimi
  dryRun: val("DRY_RUN", "false") === "true",

  adminRecipientId: val("ADMIN_RECIPIENT_ID", ""),

  // --- AI (OpenAI API) ---
  ai: {
    apiKey: val("OPENAI_API_KEY", ""),
    // DIQQAT: Mavjud bo'lmagan modellar olib tashlandi va rasmiy tejamkor model qo'yildi
    model: val("AI_MODEL", "gpt-4o-mini"), 
  },

  // Mahsulotlar katalogi
  catalog: loadCatalog(),

  // Do'kon ma'lumotlari
  business: {
    shopName: val("SHOP_NAME", "Gift Master"),
    phone: val("PHONE", "+998 90 123 45 67"), // O'zingizning raqamingizni qo'ying
    workHours: val("WORK_HOURS", "9:00 - 18:00"),
    address: val("ADDRESS", "Toshkent shahar, Yunusobod"),
    catalogUrl: val("CATALOG_URL", "https://t.me/giftmaster_katalog"), // Katalog ssilkasini qo'yasiz
    deliveryTashkent: val("DELIVERY_TASHKENT", "Toshkentga - Yandex Dostavka orqali"),
    deliveryRegion: val("DELIVERY_REGION", "Viloyatlarga - BTS pochta orqali"),
    selfPickup: val("SELF_PICKUP", "Yoki o'zingiz do'kondan olib ketishingiz mumkin"),
    paymentMethods: val("PAYMENT_METHODS", "Naqd, Uzcard/Humo, Payme/Click"),
  },
};

module.exports = config;
