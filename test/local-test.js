// Lokal test: routing va imzo tekshiruvini real Meta'ga ulanmasdan sinaydi.
process.env.SHOP_NAME = process.env.SHOP_NAME || "Test Shop";
process.env.APP_SECRET = "testsecret"; // imzo testi uchun

const assert = require("assert");
const crypto = require("crypto");
const config = require("../src/config");
const buildResponses = require("../src/responses");
const { buildRouter } = require("../src/router");
const { verifySignature } = require("../src/messenger");

const responses = buildResponses(config.business);
const { route, matchIntent } = buildRouter(responses);

const ev = (text) => ({ sender: { id: "u1" }, message: { mid: "m" + Math.random(), text } });
const evQR = (payload) => ({ sender: { id: "u1" }, message: { mid: "q" + Math.random(), text: "", quick_reply: { payload } } });

const cases = [
  ["narx qancha?", "uz", "price"],
  ["Сколько это стоит?", "ru", "price"],
  ["salom", "uz", "welcome"],
  ["Привет!", "ru", "welcome"],
  ["katalog bormi", "uz", "catalog"],
  ["какой каталог есть", "ru", "catalog"],
  ["dostavka bormi", "uz", "delivery"],
  ["доставка есть?", "ru", "delivery"],
  ["buyurtma bermoqchiman", "uz", "order"],
  ["хочу купить", "ru", "order"],
  ["to'lov qanday", "uz", "payment"],
  ["оплата картой можно?", "ru", "payment"],
  ["operator chaqiring", "uz", "operator"],
  ["позовите оператора", "ru", "operator"],
  ["ish vaqti qachon", "uz", "contact"],
  ["asdfg qwerty", "uz", "fallback"],
];

let pass = 0;
console.log("=== Routing testlari ===");
for (const [text, lang, intent] of cases) {
  const got = matchIntent(text) || "fallback";
  const r = route(ev(text));
  assert.strictEqual(r.lang, lang, `TIL xato: "${text}" => ${r.lang}, kutilgan ${lang}`);
  assert.strictEqual(got, intent, `INTENT xato: "${text}" => ${got}, kutilgan ${intent}`);
  assert.ok(r.response && r.response.text && r.response.text.length > 0, `Bo'sh javob: "${text}"`);
  pass++;
  console.log(`  ✓ "${text}"  →  ${intent} (${lang})`);
}

console.log("\n=== Quick reply testi ===");
const qr1 = route(evQR("PRICE|ru"));
assert.strictEqual(qr1.lang, "ru");
assert.ok(qr1.response.text.includes("Цена") || qr1.response.text.length > 0);
console.log("  ✓ PRICE|ru →", qr1.lang);
const qr2 = route(evQR("ORDER|uz"));
assert.strictEqual(qr2.lang, "uz");
assert.ok(qr2.response.text.includes("Buyurtma"));
console.log("  ✓ ORDER|uz →", qr2.lang);

console.log("\n=== Imzo (signature) testi ===");
const raw = Buffer.from(JSON.stringify({ object: "instagram", entry: [] }));
const goodSig = "sha256=" + crypto.createHmac("sha256", "testsecret").update(raw).digest("hex");
assert.strictEqual(verifySignature(raw, goodSig), true, "To'g'ri imzo rad etildi");
assert.strictEqual(verifySignature(raw, "sha256=deadbeef"), false, "Yolg'on imzo qabul qilindi");
console.log("  ✓ to'g'ri imzo qabul qilindi");
console.log("  ✓ yolg'on imzo rad etildi");

console.log(`\n✅ HAMMASI O'TDI — ${pass} routing + 2 quick reply + 2 imzo testi.`);
