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

// Mahsulotlar katalogi: products.json fayldan o'qiladi (nom + narx pog'onalari + rasm).
// Fayl topilmasa, .env dagi PRODUCTS (oddiy nomlar, narxsiz) zaxira sifatida ishlatiladi.
function loadCatalog() {
  const filePath = path.join(__dirname, "products.json");
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.error("⚠️  products.json o'qishda xato:", e.message);
  }
  return list("PRODUCTS", []).map((name) => ({ name, image: null, tiers: [] }));
}

const config = {
  port: parseInt(val("PORT", "3000"), 10),

  // Meta / Instagram
  verifyToken: val("VERIFY_TOKEN", "my_verify_token"),
  appSecret: val("APP_SECRET", ""), // X-Hub-Signature-256 ni tekshirish uchun
  pageAccessToken: val("PAGE_ACCESS_TOKEN", ""), // Send API uchun token
  graphHost: val("GRAPH_HOST", "graph.facebook.com"), // yoki graph.instagram.com
  graphVersion: val("GRAPH_API_VERSION", "v21.0"),

  // Test rejimi: true bo'lsa, haqiqiy xabar yubormaydi, faqat konsolga yozadi
  dryRun: val("DRY_RUN", "false") === "true",

  // Buyurtma qabul qilingach, do'kon egasi/operatorga ham Instagram orqali xabar yuborilsinmi?
  // Bu yerga operatorning shaxsiy Instagram foydalanuvchi ID (PSID) raqami yoziladi.
  // Bo'sh qoldirilsa - operatorga alohida xabar yuborilmaydi (faqat konsolga yoziladi).
  adminRecipientId: val("ADMIN_RECIPIENT_ID", ""),

  // --- AI (OpenAI API) ---
  // Buyurtma jarayonida mijozning ismi, mahsuloti, soni va muddatini
  // erkin yozilgan matndan tushunib, kerak bo'lsa aniqlashtirib so'rash uchun ishlatiladi.
  // OPENAI_API_KEY bo'sh bo'lsa, bot eski (statik) buyurtma rejimida ishlaydi.
  ai: {
    apiKey: val("OPENAI_API_KEY", ""),
    model: val("AI_MODEL", "gpt-5.4-mini"), // arzonroq variant: gpt-4.1-nano yoki gpt-5.4-nano
  },

  // Mahsulotlar katalogi (products.json yoki .env PRODUCTS dan) - nom, rasm, narx pog'onalari.
  catalog: loadCatalog(),

  // Do'kon ma'lumotlari (javob matnlariga qo'yiladi)
  business: {
    shopName: val("SHOP_NAME", "Gift Master"),
    phone: val("PHONE", "+998 XX XXX XX XX"),
    workHours: val("WORK_HOURS", "9:00 - 18:00"),
    address: val("ADDRESS", "[manzil]"),
    catalogUrl: val("CATALOG_URL", "[katalog havolasi]"),
    deliveryTashkent: val("DELIVERY_TASHKENT", "Toshkentga - Yandex Dostavka orqali"),
    deliveryRegion: val("DELIVERY_REGION", "Viloyatlarga - BTS pochta orqali"),
    selfPickup: val("SELF_PICKUP", "Yoki o'zingiz do'kondan olib ketishingiz mumkin"),
    paymentMethods: val("PAYMENT_METHODS", "Naqd, Uzcard/Humo, Payme/Click"),
  },
};

module.exports = config;
