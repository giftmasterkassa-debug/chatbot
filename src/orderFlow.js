// JSON bazadan narx qidirish va hisoblash (options va tiers ni qo'llab-quvvatlaydi)
function calculateRecommendation(productKeyword, qtyStr, budgetStr) {
  const norm = (productKeyword || "").toLowerCase().trim();
  const qty = parseInt((qtyStr || "").replace(/\D/g, "")) || 0;
  
  // Mahsulotni topish
  const product = config.catalog.find(p => p.name.toLowerCase().includes(norm));
  if (!product) return null;

  // Narx qadamlarini (tiers) aniqlash
  let availableTiers = [];
  let optionName = "";

  if (product.tiers && product.tiers.length > 0) {
    availableTiers = product.tiers; // Oddiy tovar
  } else if (product.options && product.options.length > 0) {
    availableTiers = product.options[0].tiers; // Murakkab tovar (default 1-variantni olamiz)
    optionName = ` (${product.options[0].label})`;
  }

  let bestTier = null;
  if (availableTiers.length > 0) {
    // Eng mos narxni miqdorga qarab olish
    bestTier = availableTiers.reduce((prev, curr) => (qty >= curr.minQty ? curr : prev), availableTiers[0]);
  }

  return {
    name: product.name + optionName,
    unitPrice: bestTier ? bestTier.price : "Narx operator tomonidan belgilanadi",
    minQty: bestTier ? bestTier.minQty : 1,
    image: product.image
  };
}
