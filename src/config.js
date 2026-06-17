// Konfiguratsiya: barcha sozlamalar .env faylidan o'qiladi.
require("dotenv").config();

function val(name, def) {
  const v = process.env[name];
  return v === undefined || v === "" ? def : v;
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

  // Do'kon ma'lumotlari (javob matnlariga qo'yiladi)
  business: {
    shopName: val("SHOP_NAME", "[Do'kon nomi]"),
    phone: val("PHONE", "+998 XX XXX XX XX"),
    workHours: val("WORK_HOURS", "Dush-Shan, 9:00-19:00"),
    address: val("ADDRESS", "[manzil]"),
    catalogUrl: val("CATALOG_URL", "[katalog havolasi]"),
    deliveryTashkent: val("DELIVERY_TASHKENT", "Toshkent bo'ylab - 1 kun ichida"),
    deliveryRegion: val("DELIVERY_REGION", "Viloyatlarga - 2-4 kun (pochta/kuryer)"),
    freeDelivery: val("FREE_DELIVERY", "300 000 so'mdan ortiq xaridga bepul"),
    paymentMethods: val("PAYMENT_METHODS", "Naqd, Uzcard/Humo, Payme/Click"),
  },
};

module.exports = config;
