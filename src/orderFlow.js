// Buyurtma/suhbat jarayoni - YANGI ARXITEKTURA (tugmasiz, to'liq kontekstli suhbat).
//
// Eski qattiq "qadam" (step) mashinasi olib tashlandi. Endi har bir mijoz xabari uchun:
//   1) Butun suhbat tarixi saqlanadi (qadamlar orasida tozalanmaydi).
//   2) ai.extractTurn() - mijoz xabaridan FAKTLARNI ajratib oladi (ism, mahsulot/kategoriya,
//      soni, tanlangan narx, telefon, muddat, bekor/operator niyati, mavzudan tashqari savol).
//   3) Shu JS fayl FAKTLARGA asoslanib HOLATNI yangilaydi va narxni ANIQ hisoblaydi
//      (AI hech qachon narxni o'zi "hisoblamaydi" - shu bilan xato narx aytib qo'yish oldini olamiz).
//   4) ai.composeReply() - JS tayyorlagan faktlarni tabiiy, suhbatdosh javobga aylantiradi.
//
// Tugmalar UMUMAN ishlatilmaydi - hammasi erkin matn orqali.

const config = require("./config");
const buildResponses = require("./responses");
const fs = require("fs");
const path = require("path");
const ai = require("./ai");

const responses = buildResponses(config.business);
const sessions = new Map(); // senderId -> { lang, data, history, updatedAt }
const customerProfiles = new Map(); // senderId -> { name, gender }

// --- Holatni faylga saqlash/tiklash (oddiy qayta ishga tushishlarda foydali) ---
const STORE_DIR = path.join(__dirname, ".data");
const STORE_PATH = path.join(STORE_DIR, "orderflow-state.json");

function loadState() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
      for (const [id, s] of raw.sessions || []) sessions.set(id, s);
      for (const [id, p] of raw.profiles || []) customerProfiles.set(id, p);
      if (sessions.size || customerProfiles.size) {
        console.log("\u21ba Saqlangan holat tiklandi: " + sessions.size + " faol sessiya, " + customerProfiles.size + " mijoz profili.");
      }
    }
  } catch (e) {
    console.error("\u26a0\ufe0f  Saqlangan holatni o'qishda xato:", e.message);
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(function () {
    saveTimer = null;
    try {
      if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
      const data = { sessions: Array.from(sessions.entries()), profiles: Array.from(customerProfiles.entries()) };
      fs.writeFileSync(STORE_PATH, JSON.stringify(data));
    } catch (e) {
      console.error("\u26a0\ufe0f  Holatni saqlashda xato:", e.message);
    }
  }, 500);
}

loadState();

// ============================================================================
// Katalog yordamchi funksiyalari
// ============================================================================

function getCategories() {
  const set = new Set(config.catalog.map(function (p) { return p.category || "Boshqa"; }));
  return Array.from(set).sort();
}

function categoryProducts(category) {
  return config.catalog.filter(function (p) { return p.category === category; });
}

function findProductVariants(text) {
  if (!text) return [];
  const norm = text.toLowerCase().trim();
  let list = config.catalog.filter(function (p) { return p.name.toLowerCase().trim() === norm; });
  if (!list.length) {
    list = config.catalog.filter(function (p) {
      const pn = p.name.toLowerCase().trim();
      return pn.includes(norm) || norm.includes(pn);
    });
  }
  return list;
}

function getTiers(product, optionLabel) {
  if (product.tiers) return product.tiers;
  if (product.options && product.options.length) {
    if (optionLabel) {
      const norm = optionLabel.toLowerCase().trim();
      const opt = product.options.find(function (o) {
        const on = o.label.toLowerCase();
        return on === norm || on.includes(norm) || norm.includes(on);
      });
      if (opt) return opt.tiers;
    }
    return product.options.reduce(function (a, b) {
      const aMin = Math.min.apply(null, a.tiers.map(function (t) { return t.price; }));
      const bMin = Math.min.apply(null, b.tiers.map(function (t) { return t.price; }));
      return aMin <= bMin ? a : b;
    }).tiers;
  }
  return null;
}

function minQtyOfTiers(tiers) {
  if (!tiers || !tiers.length) return 0;
  return Math.min.apply(null, tiers.map(function (t) { return t.minQty; }));
}

function calcPrice(product, qty, optionLabel) {
  const tiers = product && getTiers(product, optionLabel);
  if (!tiers || !tiers.length || !qty) return null;
  const sorted = tiers.slice().sort(function (a, b) { return a.minQty - b.minQty; });
  let chosen = null;
  for (const t of sorted) {
    if (qty >= t.minQty) chosen = t;
  }
  if (!chosen) return null;
  return { unitPrice: chosen.price, total: chosen.price * qty, minQty: chosen.minQty };
}

// Berilgan variantlar (bir xil nomdagi bir yoki bir nechta kod) uchun, har bir kod+tanlov
// kombinatsiyasi bo'yicha narx variantlarini hisoblaydi.
function priceOptionsForQuantity(variants, qty) {
  const out = [];
  for (const v of variants) {
    if (v.options && v.options.length > 1) {
      for (const opt of v.options) {
        out.push({
          code: v.code, name: v.name, optionLabel: opt.label, image: v.image,
          price: calcPrice(v, qty, opt.label), minQtyAll: minQtyOfTiers(opt.tiers),
        });
      }
    } else {
      out.push({
        code: v.code, name: v.name, optionLabel: null, image: v.image,
        price: calcPrice(v, qty), minQtyAll: minQtyOfTiers(getTiers(v)),
      });
    }
  }
  return out;
}

function formatMoney(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function normalizePhone(text) {
  const digits = (text || "").replace(/[^\d]/g, "");
  const m = digits.match(/^(998)?(\d{9})$/);
  if (!m) return null;
  return "+998" + m[2];
}

function genderSuffix(gender, lang) {
  if (lang !== "uz") return "";
  if (gender === "male") return " aka";
  if (gender === "female") return " opa";
  return "";
}

let orderCounter = 0;
function generateOrderId() {
  orderCounter += 1;
  return "GM-" + Date.now().toString(36).toUpperCase().slice(-5) + orderCounter;
}

// ============================================================================
// "Holat tasviri" matnini qurish - composeReply shu asosida tabiiy javob yozadi
// ============================================================================

function businessFactsText(lang) {
  const b = config.business;
  return [
    "Ish vaqti: " + b.workHours,
    "Yetkazib berish: " + b.deliveryTashkent + "; " + b.deliveryRegion + "; " + b.selfPickup,
    "To'lov usullari: " + b.paymentMethods,
    "Telefon: " + b.phone,
    "Manzil: " + b.address,
  ].join("; ");
}

function categoryListText() {
  return getCategories().join(", ");
}

function categoryProductsText(category) {
  const items = categoryProducts(category);
  const names = Array.from(new Set(items.map(function (p) { return p.name; })));
  return names.join(", ");
}

function variantsListText(variants) {
  if (variants.length === 1 && !(variants[0].options && variants[0].options.length > 1)) {
    return variants[0].name + " (kod " + variants[0].code + ")";
  }
  return variants
    .map(function (v) {
      const opts = v.options && v.options.length > 1 ? " [" + v.options.map(function (o) { return o.label; }).join(" / ") + "]" : "";
      return v.name + " (kod " + v.code + ")" + opts;
    })
    .join("; ");
}


function orderSummaryText(order) {
  const lines = ["Buyurtma raqami: " + order.id];
  for (const it of order.items) {
    if (it.price) {
      lines.push(it.product + " - " + it.quantity + " - " + formatMoney(it.price.unitPrice) + " so'm/dona, jami " + formatMoney(it.price.total) + " so'm");
    } else {
      lines.push(it.product + " - " + it.quantity + " - narx operator tomonidan aniqlashtiriladi");
    }
  }
  lines.push("Jami summa: " + formatMoney(order.total) + " so'm");
  lines.push("Telefon: " + order.phone);
  lines.push("Muddat: " + (order.deadline || "kelishiladi"));
  return lines.join("\n");
}

function priceOptionsBlock(options, qty) {
  return options
    .map(function (o) {
      const label = o.name + " (" + o.code + ")" + (o.optionLabel ? " - " + o.optionLabel : "");
      if (o.price) {
        return "\u2022 " + label + ": " + formatMoney(o.price.unitPrice) + " so'm/dona \u2014 " + qty + " dona uchun jami " + formatMoney(o.price.total) + " so'm";
      }
      return "\u2022 " + label + ": eng kam buyurtma - " + o.minQtyAll + " dona (siz so'ragan " + qty + " dona uchun narx yo'q)";
    })
    .join("\n");
}

function buildSituation(ctx, lang) {
  const e = ctx.extracted;
  const s = ctx.session;
  const lines = [];
  let factsBlock = null;

  if (e.off_topic_question) {
    lines.push("Mijoz mavzudan tashqari savol berdi: \"" + e.off_topic_question + "\". Quyidagi biznes faktlardan foydalanib qisqa javob ber, keyin muloyimlik bilan asosiy mavzuga qaytar (agar suhbat biror mahsulot/savatcha haqida bo'lsa, shuni eslatib o't):");
    lines.push(businessFactsText(lang));
    return { situation: lines.join("\n"), factsBlock: null };
  }

  if (ctx.orderFinalized) {
    factsBlock = orderSummaryText(ctx.orderFinalized);
    lines.push("BUYURTMA HOZIRGINA YAKUNLANDI. Mijozga rahmat ayt, buyurtma qabul qilingani va operatorga yuborilganini ayt, tez orada bog'lanishini ayt. Buyurtma tafsilotlari alohida (sendan tashqari) ko'rsatiladi.");
    return { situation: lines.join("\n"), factsBlock: factsBlock };
  }

  if (e.wants_operator && !ctx.orderFinalized) {
    if (!s.data.items.length) {
      lines.push("Mijoz operator/jonli odam bilan gaplashishni so'rayapti. Operatorga ulanayotganingni, tez orada bog'lanishini ayt.");
    } else if (!s.data.phone) {
      lines.push("Mijoz buyurtmani yakunlamoqchi/operator bilan gaplashmoqchi, lekin telefon raqami hali yo'q. Aloqa uchun telefon raqamini so'ra.");
    }
    return { situation: lines.join("\n"), factsBlock: null };
  }

  if (e.objection_text) {
    lines.push("Mijoz e'tiroz/shubha bildirdi: \"" + e.objection_text + "\".");
    if (s.data.focusVariants && s.data.focusVariants.length) {
      const cheapestQty = s.data.pendingQty || Math.max.apply(null, s.data.focusVariants.map(function (v) { return minQtyOfTiers(getTiers(v)); }));
      const opts = priceOptionsForQuantity(s.data.focusVariants, cheapestQty).filter(function (o) { return o.price; });
      if (opts.length) {
        const cheapest = opts.reduce(function (a, b) { return a.price.unitPrice <= b.price.unitPrice ? a : b; });
        lines.push(
          "Mijozning e'tirozini tushunganingni bildir, keyin eng arzon mavjud variantni taklif qil: " +
          cheapest.name + " (" + cheapest.code + ")" + (cheapest.optionLabel ? " - " + cheapest.optionLabel : "") +
          " - " + formatMoney(cheapest.price.unitPrice) + " so'm/dona (" + cheapestQty + " dona uchun). " +
          "Bosimsiz, tushunuvchan ohangda yoz - agar bu ham mos kelmasa, miqdorni oshirish narxni tushirishini eslatishing mumkin."
        );
      } else {
        lines.push("Mahsulot sifati/qiymati haqida ishonchli, bosimsiz tarzda qisqa tushuntir, va kerak bo'lsa operator bilan gaplashish mumkinligini ayt.");
      }
    } else {
      lines.push("Mahsulot haqida aniq gap bo'lmagani uchun, umumiy tarzda tushunuvchan javob ber va qaysi mahsulot/narx haqida ekanini so'ra.");
    }
    return { situation: lines.join("\n"), factsBlock: null };
  }

  if (e.is_unclear && !e.off_topic_question) {
    lines.push("Mijoz xabari tushunarsiz edi. Muloyimlik bilan, nima kerak ekanini qayta so'ra.");
    return { situation: lines.join("\n"), factsBlock: null };
  }

  if (ctx.selectedItem && ctx.selectedItem.price) {
    const it = ctx.selectedItem;
    factsBlock = "\u2022 " + it.name + " (" + it.code + ")" + (it.optionLabel ? " - " + it.optionLabel : "") +
      " \u2014 " + ctx.qtyUsed + " dona, " + formatMoney(it.price.unitPrice) + " so'm/dona, jami " + formatMoney(it.price.total) + " so'm";
    lines.push("Mijoz narx variantini tanladi - bu savatga qo'shildi. Tafsilotlar alohida (sendan tashqari) ko'rsatiladi - sen faqat \"savatga qo'shildi\" kabi qisqa tasdiq ber.");
    if (!s.data.phone) {
      lines.push("So'ngra aloqa uchun telefon raqamini so'ra.");
    } else {
      lines.push("Telefon raqami allaqachon bor (" + s.data.phone + "). Yana mahsulot kerak bo'lsa aytishini, aks holda buyurtmani tasdiqlashini so'ra.");
    }
    return { situation: lines.join("\n"), factsBlock: factsBlock };
  }

  if (ctx.computedOptions && ctx.computedOptions.length) {
    factsBlock = priceOptionsBlock(ctx.computedOptions, ctx.qtyUsed);
    lines.push(
      "Mijoz " + ctx.qtyUsed + " dona uchun narxlarni bilishni so'radi. Narx ro'yxati alohida (sendan tashqari) ko'rsatiladi - " +
      "shuning uchun sen FAQAT shu ro'yxatdan OLDIN keladigan qisqa kirish jumlasi va undan KEYIN keladigan qisqa savol yozasan, raqamlarni o'zing yozmaysan."
    );
    if (ctx.computedOptions.every(function (o) { return !o.price; })) {
      lines.push("Diqqat: hech biri mos kelmadi (juda kam miqdor so'ralgan) - shuni nazokat bilan tushuntir, narx ro'yxati o'zida buni ko'rsatadi.");
    }
    return { situation: lines.join("\n"), factsBlock: factsBlock };
  }

  if (ctx.newFocus && !s.data.pendingQty) {
    lines.push("Mijoz \"" + s.data.focusName + "\" haqida so'radi. Bizda shu nomda quyidagi(lar) bor: " + variantsListText(s.data.focusVariants) + ".");
    lines.push("Narxni aniq aytish uchun, mijozdan ODOB BILAN nechta dona kerakligini so'ra (narx miqdorga qarab farqlanadi, shuni tushuntir). Byudjet haqida SO'RAMA.");
    return { situation: lines.join("\n"), factsBlock: null };
  }

  if (ctx.categoryChanged && !ctx.newFocus) {
    lines.push("Mijoz \"" + s.data.category + "\" kategoriyasini tanladi. Shu kategoriyada quyidagi mahsulotlar bor: " + categoryProductsText(s.data.category) + ".");
    lines.push("Shularni qisqacha sanab o't, qaysi biriga aniq qiziqayotganini so'ra.");
    return { situation: lines.join("\n"), factsBlock: null };
  }

  if (!s.data.category && !s.data.focusVariants) {
    lines.push("Mijoz nima borligini bilmoqchi yoki hali aniq mahsulot aytmagan. Quyidagi kategoriyalarni tabiiy tilda sanab o't, qaysi biriga qiziqayotganini so'ra:");
    lines.push(categoryListText());
    return { situation: lines.join("\n"), factsBlock: null };
  }

  if (e.phone && !normalizePhone(e.phone)) {
    lines.push("Mijoz telefon raqam yozdi, lekin format noto'g'ri ko'rinadi (9 xonali O'zbekiston raqami kerak). Qaytadan to'g'ri formatda so'ra, masalan +998901234567.");
    return { situation: lines.join("\n"), factsBlock: null };
  }

  if (e.phone && normalizePhone(e.phone) && s.data.items.length) {
    lines.push("Mijoz telefon raqamini berdi: " + s.data.phone + ". Buni qabul qilganingni ayt, va agar buyurtmani tasdiqlashga tayyor bo'lsa \"tasdiqlayman\" deyishini so'ra.");
    return { situation: lines.join("\n"), factsBlock: null };
  }

  lines.push("Mijozga oddiy, do'stona javob ber, suhbatni tabiiy davom ettir.");
  return { situation: lines.join("\n"), factsBlock: null };
}

// ============================================================================
// Asosiy funksiya - har bir kiruvchi xabar uchun chaqiriladi
// ============================================================================

function isActive(senderId) {
  return sessions.has(senderId);
}

function cancel(senderId) {
  sessions.delete(senderId);
  scheduleSave();
}

function finalizeOrder(session) {
  const total = session.data.items.reduce(function (sum, it) { return sum + (it.price ? it.price.total : 0); }, 0);
  const order = {
    id: generateOrderId(),
    name: session.data.name,
    items: session.data.items,
    phone: session.data.phone,
    deadline: session.data.deadline,
    total: total,
  };
  session.data.items = [];
  session.data.phone = null;
  session.data.deadline = null;
  session.data.focusVariants = null;
  session.data.focusName = null;
  session.data.pendingQty = null;
  session.data.lastPriceOptions = null;
  session.data.category = null;
  return order;
}

async function processMessage(senderId, text, lang) {
  let session = sessions.get(senderId);
  if (!session) {
    const profile = customerProfiles.get(senderId);
    session = {
      lang: lang,
      script: lang === "ru" ? "cyrillic" : "latin",
      history: [],
      data: {
        name: profile ? profile.name : null,
        gender: profile ? profile.gender : null,
        category: null,
        focusVariants: null,
        focusName: null,
        pendingQty: null,
        lastPriceOptions: null,
        items: [],
        phone: null,
        deadline: null,
        unclearCount: 0,
      },
      updatedAt: Date.now(),
    };
    sessions.set(senderId, session);
  }
  // Boshlang'ich (taxminiy) til - extractTurn javobidan keyin ANIQ tilga yangilanadi.
  lang = session.lang || lang;
  session.updatedAt = Date.now();

  // AI sozlanmagan bo'lsa - eski statik zaxira matni
  if (!config.ai.apiKey) {
    const r = responses.order[lang] || responses.order.uz;
    return { text: r.text };
  }

  session.history.push({ role: "user", content: text });
  if (session.history.length > 24) session.history = session.history.slice(-24);

  const state = {
    name: session.data.name,
    category: session.data.category,
    focusProduct: session.data.focusName,
    hasItems: session.data.items.length > 0,
    hasPhone: !!session.data.phone,
  };

  const extracted = await ai.extractTurn(senderId, session.history, lang, state, getCategories());

  if (!extracted) {
    scheduleSave();
    return { text: lang === "ru" ? "Извините, технические трудности \ud83d\ude4f Попробуйте, пожалуйста, ещё раз." : "Kechirasiz, texnik nosozlik yuz berdi \ud83d\ude4f Iltimos, qayta urinib ko'ring." };
  }

  // AI butun suhbat konteksti asosida tilni ANIQ belgilaydi - bir martalik regex'dan
  // (faqat kirill bor-yoqligiga qaragan) ko'ra ishonchliroq, chunki o'zbek tilini ham
  // kirill alifbosida yozish mumkin va bu holatni AI to'g'ri ajrata oladi.
  if (extracted.language) session.lang = extracted.language;
  if (extracted.script) session.data.script = extracted.script;
  lang = session.lang;

  if (extracted.wants_cancel) {
    sessions.delete(senderId);
    scheduleSave();
    return { text: lang === "ru" ? "Хорошо, отменено. Если понадоблюсь снова - просто напишите \ud83d\ude0a" : "Mayli, bekor qildim. Yana kerak bo'lib qolsa, shu yerga yozib qoling \ud83d\ude0a" };
  }

  if (!extracted.is_unclear) session.data.unclearCount = 0;

  // --- ism va jins ---
  if (extracted.customer_name && !session.data.name) {
    session.data.name = extracted.customer_name;
    if (extracted.likely_gender) session.data.gender = extracted.likely_gender;
    customerProfiles.set(senderId, { name: session.data.name, gender: session.data.gender });
  }

  // --- kategoriya ---
  let categoryChanged = false;
  const cats = getCategories();
  if (extracted.category && cats.includes(extracted.category) && session.data.category !== extracted.category) {
    session.data.category = extracted.category;
    categoryChanged = true;
  }

  // --- mahsulot matni -> fokus ---
  let newFocus = false;
  if (extracted.product_text) {
    const variants = findProductVariants(extracted.product_text);
    if (variants.length) {
      session.data.focusVariants = variants;
      session.data.focusName = variants[0].name;
      session.data.category = variants[0].category;
      categoryChanged = false;
      newFocus = true;
      if (!extracted.quantity) {
        session.data.pendingQty = null;
        session.data.lastPriceOptions = null;
      }
    }
  }

  // --- soni ---
  if (extracted.quantity && extracted.quantity > 0) {
    session.data.pendingQty = extracted.quantity;
  }

  // --- narxlarni hisoblash ---
  let computedOptions = null;
  if (session.data.focusVariants && session.data.pendingQty) {
    computedOptions = priceOptionsForQuantity(session.data.focusVariants, session.data.pendingQty);
    session.data.lastPriceOptions = computedOptions;
  }

  // --- tanlangan narx -> savatga qo'shish ---
  let selectedItem = null;
  const qtyUsed = session.data.pendingQty;
  if (extracted.selected_price && session.data.lastPriceOptions && session.data.lastPriceOptions.length) {
    const withPrice = session.data.lastPriceOptions.filter(function (o) { return o.price; });
    if (withPrice.length) {
      selectedItem = withPrice.reduce(function (a, b) {
        return Math.abs(a.price.unitPrice - extracted.selected_price) <= Math.abs(b.price.unitPrice - extracted.selected_price) ? a : b;
      });
      const label = selectedItem.name + " (" + selectedItem.code + ")" + (selectedItem.optionLabel ? " - " + selectedItem.optionLabel : "");
      session.data.items.push({ product: label, quantity: qtyUsed + " dona", price: selectedItem.price });
      session.data.focusVariants = null;
      session.data.focusName = null;
      session.data.pendingQty = null;
      session.data.lastPriceOptions = null;
      computedOptions = null;
    }
  }

  // --- telefon va muddat ---
  if (extracted.phone) {
    const normalized = normalizePhone(extracted.phone);
    if (normalized) session.data.phone = normalized;
  }
  if (extracted.deadline) session.data.deadline = extracted.deadline;

  // --- operator/yakunlash ---
  let orderFinalized = null;
  let shouldNotifyAdmin = false;
  if (extracted.wants_operator) {
    shouldNotifyAdmin = true;
    if (session.data.items.length && session.data.phone) {
      orderFinalized = finalizeOrder(session);
    }
  }

  if (extracted.is_unclear) {
    session.data.unclearCount = (session.data.unclearCount || 0) + 1;
    if (session.data.unclearCount >= 3) {
      shouldNotifyAdmin = true;
      session.data.unclearCount = 0;
    }
  }

  const situation = buildSituation(
    { extracted: extracted, session: session, computedOptions: computedOptions, selectedItem: selectedItem, categoryChanged: categoryChanged, newFocus: newFocus, orderFinalized: orderFinalized, qtyUsed: qtyUsed },
    lang
  );

  const addressName = session.data.name ? session.data.name + genderSuffix(session.data.gender, lang) : null;
  let reply = await ai.composeReply(senderId, session.history, lang, situation.situation, addressName, situation.factsBlock, session.data.script);

  // ai.composeReply narx faktini (agar bo'lsa) o'zi to'g'ri joyga sendvich qilib qo'shadi -
  // AI narx yoziladigan joyga UMUMAN tegmaydi (alohida intro/closing maydonlari orqali).
  // Shunga qaramay, AI butunlay ishlamay qolsa (masalan tarmoq xatosi) - faktni baribir yuboramiz.
  if (!reply) {
    reply = situation.factsBlock ? situation.factsBlock : situation.situation;
  }

  session.history.push({ role: "assistant", content: reply });
  if (session.history.length > 24) session.history = session.history.slice(-24);

  scheduleSave();

  const result = { text: reply };
  if (selectedItem && selectedItem.image) {
    result.image = selectedItem.image;
  } else if (session.data.focusVariants && session.data.focusVariants.length === 1 && session.data.focusVariants[0].image) {
    result.image = session.data.focusVariants[0].image;
  }
  if (shouldNotifyAdmin) {
    result.adminNotice = {
      senderId: senderId,
      customerName: session.data.name,
      order: orderFinalized,
    };
  }
  return result;
}

module.exports = {
  isActive: isActive,
  cancel: cancel,
  processMessage: processMessage,
  getCategories: getCategories,
};
