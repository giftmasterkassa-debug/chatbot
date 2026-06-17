// Til aniqlash: matnda kirill harflari bo'lsa - rus, aks holda o'zbek (lotin).
function detectLang(text) {
  if (!text) return "uz";
  return /[Ѐ-ӿ]/.test(text) ? "ru" : "uz";
}

module.exports = { detectLang };
