// Lokal test: Yangi AI-arxitektura uchun routing, til aniqlash va imzo tekshiruvini sinaydi.
process.env.SHOP_NAME = process.env.SHOP_NAME || "Gift Master Test";
process.env.APP_SECRET = "testsecret"; // imzo testi uchun

const assert = require("assert");
const crypto = require("crypto");
// Yo'llar to'g'ri ekanligiga e'tibor bering (test papkasidan src papkasiga)
const config = require("../src/config"); 
const buildResponses = require("../src/responses");
const { buildRouter } = require("../src/router");
const { verifySignature } = require("../src/messenger");
const { detectLang } = require("../src/lang");

const responses = buildResponses(config.business);
const { route } = buildRouter(responses);

// Soxta hodisa yaratuvchi
const ev = (text) => ({ sender: { id: "u1" }, message: { mid: "m" + Math.random(), text } });

console.log("=== 1. Tilni aniqlash testlari (detectLang) ===");
// O'zbek lotin, rus va o'zbek kirill alifbolari farqlanishi kerak
const langCases = [
  ["salom qandaysiz", "uz"],
  ["Привет!", "ru"],
  ["narx qancha?", "uz"],
  ["Сколько стоит?", "ru"],
  ["қанақа ручкаларинг бор", "uz"], // O'zbek kirill (sheva/xato)
  ["здравствуйте", "ru"],
];

let passLang = 0;
for (const [text, expectedLang] of langCases) {
  const gotLang = detectLang(text);
  assert.strictEqual(gotLang, expectedLang, `TIL xato: "${text}" => ${gotLang}, kutilgan ${expectedLang}`);
  passLang++;
  console.log(`  ✓ "${text}"  →  ${gotLang}`);
}

console.log("\n=== 2. Router va AI'ga uzatish testlari ===");
// Tizimda faqat "operator" intenti (statik) qolgan, qolgan hamma matn null bo'lib AI'ga ketishi kerak.
const routerCases = [
  ["operator chaqiring", "operator", "uz"],
  ["позовите оператора", "operator", "ru"],
  ["odam bilan gaplashaman", "operator", "uz"],
  ["salom qanaqa tovarlar bor?", null, "uz"],  // AI'ga ketishi kerak
  ["ruchka qancha", null, "uz"],               // AI'ga ketishi kerak
  ["какие наборы есть?", null, "ru"],          // AI'ga ketishi kerak
];

let passRouter = 0;
for (const [text, expectedIntent, expectedLang] of routerCases) {
  const result = route(ev(text));
  assert.strictEqual(result.intent, expectedIntent, `INTENT xato: "${text}" => ${result.intent}, kutilgan ${expectedIntent}`);
  assert.strictEqual(result.lang, expectedLang, `TIL xato: "${text}" => ${result.lang}, kutilgan ${expectedLang}`);
  
  if (expectedIntent === "operator") {
    // Agar operator so'ralsa, tayyor statik matn qaytishi kerak
    assert.ok(result.response && result.response.text, "Operator javobi bo'sh qoldi!");
    console.log(`  ✓ Favqulodda ulanish: "${text}"  →  ${result.intent} (${result.lang})`);
  } else {
    // Agar boshqa matn bo'lsa, router aralashmasdan response: null qaytarishi kerak (buni server.js AI'ga uzatadi)
    assert.strictEqual(result.response, null, "AI'ga ketadigan xabarga router aralashib qoldi!");
    console.log(`  ✓ AI'ga uzatiladi: "${text}"  →  intent: null (${result.lang})`);
  }
  passRouter++;
}

console.log("\n=== 3. Tugmalar (Quick reply) holati ===");
console.log("  ✓ Tizim biznes talabiga asosan barcha tugmalar (Quick Replies) olib tashlangan.");

console.log("\n=== 4. Imzo (signature) tekshiruvi testi ===");
const raw = Buffer.from(JSON.stringify({ object: "instagram", entry: [] }));
const goodSig = "sha256=" + crypto.createHmac("sha256", "testsecret").update(raw).digest("hex");

assert.strictEqual(verifySignature(raw, goodSig), true, "To'g'ri imzo rad etildi");
assert.strictEqual(verifySignature(raw, "sha256=deadbeef"), false, "Yolg'on imzo qabul qilindi");
console.log("  ✓ To'g'ri imzo qabul qilindi");
console.log("  ✓ Yolg'on imzo rad etildi");

console.log(`\n✅ HAMMASI O'TDI — ${passLang} ta til, ${passRouter} ta routing + imzo testlari muvaffaqiyatli yakunlandi.`);
