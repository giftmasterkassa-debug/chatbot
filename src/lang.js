// Til aniqlash (BOSHLANG'ICH taxmin uchun - keyin AI butun suhbat asosida aniqroq belgilaydi).
// MUHIM: o'zbek tilini ham KIRILL alifbosida yozish mumkin - shuning uchun "kirill bor = rus"
// degan oddiy qoida noto'g'ri. O'zbekchaga xos harflar (ў, қ, ғ, ҳ) faqat o'zbek kirillida
// bo'ladi, ruschada umuman yo'q - shularni topsak, albatta "uz" deb belgilaymiz.
function detectLang(text) {
  if (!text) return "uz";
  if (/[ўқғҳЎҚҒҲ]/.test(text)) return "uz";
  return /[Ѐ-ӿ]/.test(text) ? "ru" : "uz";
}

module.exports = { detectLang };
