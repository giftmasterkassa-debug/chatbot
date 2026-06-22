// Konfiguratsiya: barcha sozlamalar .env faylidan o'qiladi.
require("dotenv").config();

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

  // --- AI (Anthropic Claude API) ---
  // Buyurtma jarayonida mijozning ismi, mahsuloti, soni va muddatini
  // erkin yozilgan matndan tushunib, kerak bo'lsa aniqlashtirib so'rash uchun ishlatiladi.
  // ANTHROPIC_API_KEY bo'sh bo'lsa, bot eski (statik) buyurtma rejimida ishlaydi.
  ai: {
    apiKey: val("ANTHROPIC_API_KEY", ""),
    model: val("AI_MODEL", "claude-sonnet-4-6"), // arzonroq/tezroq variant: claude-haiku-4-5-20251001
    // Do'kondagi mahsulotlar ro'yxati - .env faylida vergul bilan yoziladi, masalan:
    // PRODUCTS="ruchka,bloknot,sovga to'plami,krujka"
    // Shu ro'yxat bo'lsa, AI mijoz xato/qisqa yozgan nomlarni shularga moslab aniqlashtiradi.
    products: list("PRODUCTS", []),
  },

  // Do'kon ma'lumotlari (javob matnlariga qo'yiladi)
  business: {
    shopName: val("SHOP_NAME", "Gift Master"),
    phone: val("PHONE", "+998 99 100 01 20"),
    workHours: val("WORK_HOURS", "9:00 - 18:00"),
    address: val("ADDRESS", "Toshkent sh. Olmazor tumani,Abdujalil ota ko'chasi 4-uy"),
    catalogUrl: val("CATALOG_URL", "[katalog havolasi]"),
    deliveryTashkent: val("DELIVERY_TASHKENT", "Toshkentga - Yandex Dostavka orqali"),
    deliveryRegion: val("DELIVERY_REGION", "Viloyatlarga - BTS pochta orqali"),
    selfPickup: val("SELF_PICKUP", "Yoki o'zingiz do'kondan olib ketishingiz mumkin"),
    paymentMethods: val("PAYMENT_METHODS", "Naqd, Pul o'tkazish, Payme/Click"),
  },
};

module.exports = config;

