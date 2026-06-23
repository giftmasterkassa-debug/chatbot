// Til aniqlash moduli
// Mijozlarning yozuv uslubi va alifbosini aniqroq farqlash uchun kengaytirildi.

function detectLang(text) {
  if (!text) return "uz";

  const lowerText = text.toLowerCase();

  // Rus tiliga xos belgilar
  const russianChars = /[ыщэьъ]/;
  // O'zbek kirill alifbosiga xos belgilar
  const uzbekCyrillicChars = /[ўқғҳ]/;
  // Umumiy kirill alifbosi
  const cyrillic = /[а-яА-ЯёЁ]/;

  // Agar matnda kirill harflari bo'lsa
  if (cyrillic.test(lowerText)) {
    // Agar o'zbek kirilliga xos harflar qatnashgan bo'lsa
    if (uzbekCyrillicChars.test(lowerText)) {
      return "uz"; // O'zbek tili (kirill yozuvida)
    } 
    // Agar aniq rus tiliga xos harflar bo'lsa
    else if (russianChars.test(lowerText)) {
      return "ru"; // Rus tili
    }
    // Boshqa qisqa kirill so'zlar bo'lsa ham AI matn mazmunidan o'zi tushunib oladi
    // Lekin bazaviy holatda rus tili deb uzatamiz
    return "ru";
  }

  // Qolgan barcha holatlarda (lotin yozuvi, xatolar, sheva) o'zbek tili deb qabul qilinadi
  return "uz";
}

module.exports = { detectLang };
