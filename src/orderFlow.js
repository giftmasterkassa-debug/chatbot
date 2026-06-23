// Buyurtma jarayoni: AI yordamida bosqichma-bosqich ma'lumot yig'ish.
//
//   1) name_product      - Ism (bir marta so'raladi, keyin eslab qolinadi) + mahsulot turi
//   2) quantity_single    - (bitta variantli/katalogsiz mahsulot) faqat soni
//      quantity_budget    - (ko'p variantli mahsulot) soni + taxminiy narx -> tavsiya
//      confirm_variant    - tavsiya qilingan variantni tasdiqlash yoki "boshqasini" so'rash
//   3) add_more           - yana mahsulot qo'shish yoki yakunlash
//   4) deadline           - butun buyurtma uchun bir martagina so'raladigan muddat
//   5) confirm_order      - to'liq xulosani ko'rsatib tasdiqlash
//   6) phone              - telefon raqami
//   7) tasdiqlash - "Buyurtmangiz qabul qilindi" (buyurtma raqami bilan)
//
// Qo'shimcha himoyalar:
//   - Bir necha marta tushunolmasa (clarifyCount chegarasi), avtomatik operatorga ulanadi.
//   - Mijoz tavsiya qilingan variantni yoqtirmasa, "boshqa" deb so'rasa, keyingisini taklif qiladi.
//   - Mijoz ismi shu Instagram suhbati uchun eslab qolinadi (customerProfiles).
//
// Har bir mijoz (senderId) uchun xotirada session saqlanadi. Sessiya bo'lmasa,
// chaqiruvchi (server.js) oddiy router orqali javob berishi kerak.

const config = require("./config");
const buildResponses = require("./responses");
const aiModule = require("./ai");
const extractNameAndProduct = aiModule.extractNameAndProduct;
const extractQuantityOnly = aiModule.extractQuantityOnly;
const extractQuantityAndBudget = aiModule.extractQuantityAndBudget;
const extractDeadline = aiModule.extractDeadline;

const responses = buildResponses(config.business);
const sessions = new Map();
const customerProfiles = new Map();

const SESSION_TTL_MS = 30 * 60 * 1000;
setInterval(function () {
  const now = Date.now();
  for (const entry of sessions) {
    const id = entry[0];
    const s = entry[1];
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 5 * 60 * 1000);

const MAX_CLARIFY_ATTEMPTS = 3;

const T = {
  uz: {
    askNameProduct: "Ismingizni va qaysi mahsulotga qiziqayotganingizni yozib yuboring \ud83d\ude0a\n(Masalan: \"Men Aziz, ruchka sotib olmoqchiman\")",
    askProductOnly: function (name) { return "Yana xush kelibsiz, " + name + "! \ud83d\ude0a Bu safar qaysi mahsulotga qiziqyapsiz?"; },
    askAnotherProduct: "Yana qaysi mahsulot kerak? \ud83d\ude0a",
    askQuantitySingle: function (product) { return "\"" + product + "\" dan nechta dona kerak? \ud83d\udce6"; },
    askQuantityBudget: function (name) {
      return "\"" + name + "\" dan bizda bir nechta xili bor, narxlari ham har xil \ud83d\ude42\n" +
        "Nechta dona kerak va taxminan qancha narxga (1 donasi necha so'mga) mos kelishi kerak?\n" +
        "(Masalan: \"100 dona, 10000 so'mgacha\" yoki \"50 dona, eng arzonidan\")";
    },
    recommend: function (variant, price, overBudget) {
      let line = price
        ? "Sizga mos variant topdim: \"" + variant.name + " (" + variant.code + ")\" \u2014 " + formatMoney(price.unitPrice) + " so'm/dona."
        : "\"" + variant.name + " (" + variant.code + ")\" mos keladi, lekin bu mahsulot uchun eng kam buyurtma - " + Math.min.apply(null, variant.tiers.map(function (t) { return t.minQty; })) + " dona, narxni operator aniqlashtiradi.";
      if (overBudget) line += "\n\u26a0\ufe0f Eslatma: bu aytgan byudjetingizdan biroz yuqoriroq.";
      return line + "\nMos kelmasa \"boshqa\" deb yozing, yoki davom etish uchun istalgan narsa yozing \ud83d\udc47";
    },
    altBtn: "Boshqa variant",
    continueBtn: "Davom etish",
    noMoreAlternatives: "Afsuski, boshqa variant qolmadi - shu eng yaqin keladigani. Davom etamiz.",
    askAddMore: "Yana mahsulot qo'shmoqchimisiz?",
    addMoreBtn: "Ha, yana qo'shaman",
    noMoreBtn: "Yo'q, tamom",
    askDeadline: "Butun buyurtma qachongacha tayyor bo'lishi kerak? \u23f0\n(Masalan: \"ertaga\" yoki \"3 kun ichida\")",
    askPhone: "Aloqa uchun telefon raqamingizni yuboring \ud83d\udcf1\n(Masalan: +998 90 123 45 67)",
    invalidPhone: "Telefon raqami noto'g'ri ko'rinmoqda \ud83e\udd14 Iltimos, qaytadan yuboring (masalan: +998 90 123 45 67)",
    needMoreNameProduct: "Iltimos, aniqroq yozing: ismingiz va qaysi mahsulot kerak?",
    needMoreQty: "Iltimos, nechta dona kerakligini aniqroq yozing.",
    needMoreQtyBudget: "Iltimos, kamida nechta dona kerakligini yozing (narx ixtiyoriy).",
    cancelled: "Buyurtma bekor qilindi. Yordam kerak bo'lsa, yana yozing \ud83d\ude0a",
    cancelBtn: "Bekor qilish",
    confirmBtn: "Tasdiqlash",
    confirmOrder: function (summary, total) {
      return "Buyurtmangizni tekshirib chiqing \ud83d\udccb\n\n" + summary + "\n" + (total ? "\n\ud83d\udcb0 Jami: " + formatMoney(total) + " so'm\n" : "") + "\nHammasi to'g'rimi? Tasdiqlasangiz, telefon raqamingizni so'rayman.";
    },
    confirmRejected: "Mayli, agar biror narsani o'zgartirish kerak bo'lsa, \"Buyurtma berish\" tugmasi orqali qaytadan boshlang \ud83d\ude0a",
    escalateNote: "Kechirasiz, savolingizni to'liq tushunolmadim \ud83d\ude4f Sizni operatorga ulayapman.",
    done: function (d) {
      const summary = summarizeItems(d.items, "uz");
      const total = calcGrandTotal(d.items);
      let line = "Rahmat, " + d.name + "! Buyurtmangiz qabul qilindi va operatorimiz tasdiqlashi uchun yuborildi \u2705\n\n" +
        "\ud83c\udd94 Buyurtma raqami: " + d.orderId + "\n\n" + summary + "\n";
      if (total) line += "\n\ud83d\udcb0 Jami: " + formatMoney(total) + " so'm\n";
      line += "\u23f0 Kerak bo'lish vaqti: " + d.deadline + "\n\ud83d\udcf1 Telefon: " + d.phone + "\n\nOperatorimiz tez orada siz bilan bog'lanib, buyurtmani aniq tasdiqlaydi \ud83d\ude4f";
      if (!isWithinWorkHours()) {
        line += "\n\n\ud83c\udf19 Diqqat: hozir ish vaqtimizdan tashqari (" + config.business.workHours + "), shuning uchun ertalab birinchi bo'lib javob beramiz.";
      }
      return line;
    },
  },
  ru: {
    askNameProduct: "\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u0441\u0432\u043e\u0451 \u0438\u043c\u044f \u0438 \u043a\u0430\u043a\u043e\u0439 \u0442\u043e\u0432\u0430\u0440 \u0432\u0430\u0441 \u0438\u043d\u0442\u0435\u0440\u0435\u0441\u0443\u0435\u0442 \ud83d\ude0a\n(\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \"\u042f \u0410\u0437\u0438\u0437, \u0445\u043e\u0447\u0443 \u043a\u0443\u043f\u0438\u0442\u044c \u0440\u0443\u0447\u043a\u0443\")",
    askProductOnly: function (name) { return "\u0421\u043d\u043e\u0432\u0430 \u0440\u0430\u0434\u044b \u0432\u0438\u0434\u0435\u0442\u044c \u0432\u0430\u0441, " + name + "! \ud83d\ude0a \u041a\u0430\u043a\u043e\u0439 \u0442\u043e\u0432\u0430\u0440 \u0432\u0430\u0441 \u0438\u043d\u0442\u0435\u0440\u0435\u0441\u0443\u0435\u0442 \u043d\u0430 \u044d\u0442\u043e\u0442 \u0440\u0430\u0437?"; },
    askAnotherProduct: "\u041a\u0430\u043a\u043e\u0439 \u0435\u0449\u0451 \u0442\u043e\u0432\u0430\u0440 \u043d\u0443\u0436\u0435\u043d? \ud83d\ude0a",
    askQuantitySingle: function (product) { return "\u0421\u043a\u043e\u043b\u044c\u043a\u043e \u0448\u0442\u0443\u043a \"" + product + "\" \u043d\u0443\u0436\u043d\u043e? \ud83d\udce6"; },
    askQuantityBudget: function (name) {
      return "\u0423 \u043d\u0430\u0441 \u0435\u0441\u0442\u044c \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0432\u0438\u0434\u043e\u0432 \"" + name + "\", \u0446\u0435\u043d\u044b \u0440\u0430\u0437\u043d\u044b\u0435 \ud83d\ude42\n" +
        "\u0421\u043a\u043e\u043b\u044c\u043a\u043e \u0448\u0442\u0443\u043a \u043d\u0443\u0436\u043d\u043e \u0438 \u043f\u0440\u0438\u043c\u0435\u0440\u043d\u043e \u043f\u043e \u043a\u0430\u043a\u043e\u0439 \u0446\u0435\u043d\u0435 (\u0437\u0430 1 \u0448\u0442)?\n" +
        "(\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \"100 \u0448\u0442\u0443\u043a, \u0434\u043e 10000 \u0441\u0443\u043c\" \u0438\u043b\u0438 \"50 \u0448\u0442\u0443\u043a, \u043f\u043e\u0434\u0435\u0448\u0435\u0432\u043b\u0435\")";
    },
    recommend: function (variant, price, overBudget) {
      let line = price
        ? "\u041d\u0430\u0448\u0451\u043b \u043f\u043e\u0434\u0445\u043e\u0434\u044f\u0449\u0438\u0439 \u0432\u0430\u0440\u0438\u0430\u043d\u0442: \"" + variant.name + " (" + variant.code + ")\" \u2014 " + formatMoney(price.unitPrice) + " \u0441\u0443\u043c/\u0448\u0442."
        : "\"" + variant.name + " (" + variant.code + ")\" \u043f\u043e\u0434\u0445\u043e\u0434\u0438\u0442, \u043d\u043e \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u0442\u043e\u0432\u0430\u0440\u0430 \u043c\u0438\u043d\u0438\u043c\u0430\u043b\u044c\u043d\u044b\u0439 \u0437\u0430\u043a\u0430\u0437 - " + Math.min.apply(null, variant.tiers.map(function (t) { return t.minQty; })) + " \u0448\u0442, \u0446\u0435\u043d\u0443 \u0443\u0442\u043e\u0447\u043d\u0438\u0442 \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440.";
      if (overBudget) line += "\n\u26a0\ufe0f \u041e\u0431\u0440\u0430\u0442\u0438\u0442\u0435 \u0432\u043d\u0438\u043c\u0430\u043d\u0438\u0435: \u044d\u0442\u043e \u043d\u0435\u043c\u043d\u043e\u0433\u043e \u0432\u044b\u0448\u0435 \u0432\u0430\u0448\u0435\u0433\u043e \u0431\u044e\u0434\u0436\u0435\u0442\u0430.";
      return line + "\n\u0415\u0441\u043b\u0438 \u043d\u0435 \u043f\u043e\u0434\u0445\u043e\u0434\u0438\u0442, \u043d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \"\u0434\u0440\u0443\u0433\u043e\u0439\", \u0438\u043b\u0438 \u043d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u0447\u0442\u043e \u0443\u0433\u043e\u0434\u043d\u043e \u0447\u0442\u043e\u0431\u044b \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \ud83d\udc47";
    },
    altBtn: "\u0414\u0440\u0443\u0433\u043e\u0439 \u0432\u0430\u0440\u0438\u0430\u043d\u0442",
    continueBtn: "\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c",
    noMoreAlternatives: "\u041a \u0441\u043e\u0436\u0430\u043b\u0435\u043d\u0438\u044e, \u0434\u0440\u0443\u0433\u0438\u0445 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u043e\u0432 \u043d\u0435\u0442 - \u044d\u0442\u043e \u0441\u0430\u043c\u044b\u0439 \u0431\u043b\u0438\u0437\u043a\u0438\u0439. \u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0430\u0435\u043c.",
    askAddMore: "\u0445\u043e\u0442\u0438\u0442\u0435 \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0435\u0449\u0451 \u043e\u0434\u0438\u043d \u0442\u043e\u0432\u0430\u0440?",
    addMoreBtn: "\u0414\u0430, \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c",
    noMoreBtn: "\u041d\u0435\u0442, \u0432\u0441\u0451",
    askDeadline: "\u041a \u043a\u0430\u043a\u043e\u043c\u0443 \u0441\u0440\u043e\u043a\u0443 \u043d\u0443\u0436\u0435\u043d \u0432\u0435\u0441\u044c \u0437\u0430\u043a\u0430\u0437? \u23f0\n(\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \"\u0437\u0430\u0432\u0442\u0440\u0430\" \u0438\u043b\u0438 \"\u0432 \u0442\u0435\u0447\u0435\u043d\u0438\u0435 3 \u0434\u043d\u0435\u0439\")",
    askPhone: "\u041e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430 \u0434\u043b\u044f \u0441\u0432\u044f\u0437\u0438 \ud83d\udcf1\n(\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: +998 90 123 45 67)",
    invalidPhone: "\u041d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430 \u0432\u044b\u0433\u043b\u044f\u0434\u0438\u0442 \u043d\u0435\u0432\u0435\u0440\u043d\u044b\u043c \ud83e\udd14 \u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437 (\u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: +998 90 123 45 67)",
    needMoreNameProduct: "\u0423\u0442\u043e\u0447\u043d\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430: \u043a\u0430\u043a \u0432\u0430\u0441 \u0437\u043e\u0432\u0443\u0442 \u0438 \u043a\u0430\u043a\u043e\u0439 \u0442\u043e\u0432\u0430\u0440 \u0432\u0430\u043c \u043d\u0443\u0436\u0435\u043d?",
    needMoreQty: "\u0423\u0442\u043e\u0447\u043d\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0448\u0442\u0443\u043a \u043d\u0443\u0436\u043d\u043e.",
    needMoreQtyBudget: "\u0423\u0442\u043e\u0447\u043d\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0448\u0442\u0443\u043a \u043d\u0443\u0436\u043d\u043e (\u0446\u0435\u043d\u0430 \u043d\u0435 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u0430).",
    cancelled: "\u0417\u0430\u043a\u0430\u0437 \u043e\u0442\u043c\u0435\u043d\u0451\u043d. \u0415\u0441\u043b\u0438 \u043d\u0443\u0436\u043d\u0430 \u043f\u043e\u043c\u043e\u0449\u044c, \u043d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u0441\u043d\u043e\u0432\u0430 \ud83d\ude0a",
    cancelBtn: "\u041e\u0442\u043c\u0435\u043d\u0430",
    confirmBtn: "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c",
    confirmOrder: function (summary, total) {
      return "\u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u0432\u0430\u0448 \u0437\u0430\u043a\u0430\u0437 \ud83d\udccb\n\n" + summary + "\n" + (total ? "\n\ud83d\udcb0 \u0418\u0442\u043e\u0433\u043e: " + formatMoney(total) + " \u0441\u0443\u043c\n" : "") + "\n\u0412\u0441\u0451 \u0432\u0435\u0440\u043d\u043e? \u0415\u0441\u043b\u0438 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435, \u0441\u043f\u0440\u043e\u0448\u0443 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430.";
    },
    confirmRejected: "\u0425\u043e\u0440\u043e\u0448\u043e, \u0435\u0441\u043b\u0438 \u043d\u0443\u0436\u043d\u043e \u0447\u0442\u043e-\u0442\u043e \u0438\u0437\u043c\u0435\u043d\u0438\u0442\u044c, \u043d\u0430\u0447\u043d\u0438\u0442\u0435 \u0437\u0430\u043d\u043e\u0432\u043e \u0447\u0435\u0440\u0435\u0437 \u043a\u043d\u043e\u043f\u043a\u0443 \"\u0417\u0430\u043a\u0430\u0437\u0430\u0442\u044c\" \ud83d\ude0a",
    escalateNote: "\u0418\u0437\u0432\u0438\u043d\u0438\u0442\u0435, \u043d\u0435 \u0441\u043c\u043e\u0433 \u0434\u043e \u043a\u043e\u043d\u0446\u0430 \u043f\u043e\u043d\u044f\u0442\u044c \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \ud83d\ude4f \u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0430\u044e \u0432\u0430\u0441 \u043a \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440\u0443.",
    done: function (d) {
      const summary = summarizeItems(d.items, "ru");
      const total = calcGrandTotal(d.items);
      let line = "\u0421\u043f\u0430\u0441\u0438\u0431\u043e, " + d.name + "! \u0412\u0430\u0448 \u0437\u0430\u043a\u0430\u0437 \u043f\u0440\u0438\u043d\u044f\u0442 \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440\u0443 \u043d\u0430 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u2705\n\n" +
        "\ud83c\udd94 \u041d\u043e\u043c\u0435\u0440 \u0437\u0430\u043a\u0430\u0437\u0430: " + d.orderId + "\n\n" + summary + "\n";
      if (total) line += "\n\ud83d\udcb0 \u0418\u0442\u043e\u0433\u043e: " + formatMoney(total) + " \u0441\u0443\u043c\n";
      line += "\u23f0 \u0421\u0440\u043e\u043a: " + d.deadline + "\n\ud83d\udcf1 \u0422\u0435\u043b\u0435\u0444\u043e\u043d: " + d.phone + "\n\n\u041d\u0430\u0448 \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440 \u0441\u0432\u044f\u0436\u0435\u0442\u0441\u044f \u0441 \u0432\u0430\u043c\u0438 \u0434\u043b\u044f \u0442\u043e\u0447\u043d\u043e\u0433\u043e \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f \u0437\u0430\u043a\u0430\u0437\u0430 \ud83d\ude4f";
      if (!isWithinWorkHours()) {
        line += "\n\n\ud83c\udf19 \u0412\u043d\u0438\u043c\u0430\u043d\u0438\u0435: \u0441\u0435\u0439\u0447\u0430\u0441 \u043d\u0435\u0440\u0430\u0431\u043e\u0447\u0435\u0435 \u0432\u0440\u0435\u043c\u044f (" + config.business.workHours + "), \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u043e\u0442\u0432\u0435\u0442\u0438\u043c \u0443\u0442\u0440\u043e\u043c \u043f\u0435\u0440\u0432\u044b\u043c\u0438.";
      }
      return line;
    },
  },
};

function findVariants(name) {
  if (!name) return [];
  const norm = name.toLowerCase().trim();
  let list = config.catalog.filter(function (p) { return p.name.toLowerCase().trim() === norm; });
  if (!list.length) {
    list = config.catalog.filter(function (p) {
      const pn = p.name.toLowerCase().trim();
      return pn.includes(norm) || norm.includes(pn);
    });
  }
  return list;
}

function calcPrice(product, qty) {
  if (!product || !product.tiers || !product.tiers.length || !qty) return null;
  const tiers = product.tiers.slice().sort(function (a, b) { return a.minQty - b.minQty; });
  let chosen = null;
  for (const t of tiers) {
    if (qty >= t.minQty) chosen = t;
  }
  if (!chosen) return null;
  return { unitPrice: chosen.price, total: chosen.price * qty, minQty: chosen.minQty };
}

function recommendVariant(variants, qty, budgetText, excludeCodes) {
  excludeCodes = excludeCodes || [];
  const pool = variants.filter(function (v) { return excludeCodes.indexOf(v.code) === -1; });
  if (!pool.length) return null;

  const priced = pool.map(function (v) { return { v: v, price: calcPrice(v, qty) }; }).filter(function (x) { return x.price; });

  if (!priced.length) {
    const fallback = pool.reduce(function (a, b) {
      const aMin = Math.min.apply(null, a.tiers.map(function (t) { return t.minQty; }));
      const bMin = Math.min.apply(null, b.tiers.map(function (t) { return t.minQty; }));
      return aMin <= bMin ? a : b;
    });
    return { variant: fallback, price: null, overBudget: false };
  }

  const budgetNum = parseMoneyNumber(budgetText);
  const wantsExpensive = /qimmat|sifatli|premium|\u0434\u043e\u0440\u043e\u0433|\u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0435\u043d/i.test(budgetText || "");

  let best;
  if (budgetNum) {
    best = priced.reduce(function (a, b) { return Math.abs(a.price.unitPrice - budgetNum) <= Math.abs(b.price.unitPrice - budgetNum) ? a : b; });
  } else if (wantsExpensive) {
    best = priced.reduce(function (a, b) { return a.price.unitPrice >= b.price.unitPrice ? a : b; });
  } else {
    best = priced.reduce(function (a, b) { return a.price.unitPrice <= b.price.unitPrice ? a : b; });
  }

  const overBudget = !!(budgetNum && best.price.unitPrice > budgetNum * 1.1);
  return { variant: best.v, price: best.price, overBudget: overBudget };
}

function parseMoneyNumber(text) {
  const m = (text || "").replace(/\s/g, "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function formatMoney(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function summarizeItems(items, lang) {
  return items.map(function (it, i) {
    let line = (i + 1) + ". " + it.product + " \u2014 " + it.quantity;
    if (it.price) {
      line += lang === "ru" ? (", " + formatMoney(it.price.unitPrice) + " \u0441\u0443\u043c/\u0448\u0442 = " + formatMoney(it.price.total) + " \u0441\u0443\u043c") : (", " + formatMoney(it.price.unitPrice) + " so'm/dona = " + formatMoney(it.price.total) + " so'm");
    } else if (it.minQtyRequired) {
      line += lang === "ru" ? (" (\u043c\u0438\u043d. \u0437\u0430\u043a\u0430\u0437 " + it.minQtyRequired + " \u0448\u0442, \u0446\u0435\u043d\u0443 \u0443\u0442\u043e\u0447\u043d\u0438\u0442 \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440)") : (" (eng kam buyurtma " + it.minQtyRequired + " dona, narxni operator aytadi)");
    }
    return line;
  }).join("\n");
}

function calcGrandTotal(items) {
  return items.reduce(function (sum, it) { return sum + (it.price ? it.price.total : 0); }, 0);
}

function generateOrderId() {
  return "GM-" + Date.now().toString(36).toUpperCase().slice(-6);
}

function isWithinWorkHours() {
  const m = (config.business.workHours || "").match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return true;
  try {
    const tashkentStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Tashkent", hour12: false });
    const tashkent = new Date(tashkentStr);
    const minutesNow = tashkent.getHours() * 60 + tashkent.getMinutes();
    const start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const end = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
    return minutesNow >= start && minutesNow <= end;
  } catch (e) {
    return true;
  }
}

function cancelBtn(lang) { return { title: T[lang].cancelBtn, payload: "CANCEL|" + lang }; }
function addMoreBtn(lang) { return { title: T[lang].addMoreBtn, payload: "ADDMORE|" + lang }; }
function noMoreBtn(lang) { return { title: T[lang].noMoreBtn, payload: "NOMORE|" + lang }; }
function altBtn(lang) { return { title: T[lang].altBtn, payload: "ALTVARIANT|" + lang }; }
function continueBtn(lang) { return { title: T[lang].continueBtn, payload: "CONTVARIANT|" + lang }; }
function confirmBtn(lang) { return { title: T[lang].confirmBtn, payload: "CONFIRMORDER|" + lang }; }

function isActive(senderId) { return sessions.has(senderId); }
function cancel(senderId) { sessions.delete(senderId); }
function cancelText(lang) { return { text: T[lang].cancelled, quickReplies: [] }; }

function normalizePhone(text) {
  const digits = (text || "").replace(/[^\d]/g, "");
  const m = digits.match(/^(998)?(\d{9})$/);
  if (!m) return null;
  return "+998" + m[2];
}

function escalateToOperator(senderId, lang) {
  sessions.delete(senderId);
  const r = responses.operator[lang] || responses.operator.uz;
  return { text: T[lang].escalateNote + "\n\n" + r.text, quickReplies: r.quickReplies };
}

function start(senderId, lang) {
  if (!config.ai.apiKey) {
    const r = responses.order[lang] || responses.order.uz;
    return { text: r.text, quickReplies: r.quickReplies };
  }
  const profile = customerProfiles.get(senderId);
  const data = { items: [] };
  if (profile && profile.name) data.name = profile.name;
  sessions.set(senderId, { step: "name_product", lang: lang, data: data, history: [], variants: [], clarifyCount: 0, updatedAt: Date.now() });
  const text = data.name ? T[lang].askProductOnly(data.name) : T[lang].askNameProduct;
  return { text: text, quickReplies: [cancelBtn(lang)] };
}

async function startWithText(senderId, lang, text) {
  if (!config.ai.apiKey) return null;
  const profile = customerProfiles.get(senderId);
  const data = { items: [] };
  if (profile && profile.name) data.name = profile.name;
  const session = { step: "name_product", lang: lang, data: data, history: [], variants: [], clarifyCount: 0, updatedAt: Date.now() };
  sessions.set(senderId, session);
  return processNameProduct(senderId, session, text, lang);
}

async function processNameProduct(senderId, session, text, lang) {
  session.history.push({ role: "user", content: text });

  const result = await extractNameAndProduct(senderId, session.history, lang, session.data);
  if (!result) {
    if (!session.data.name) session.data.name = text;
    if (!session.data.product) session.data.product = text;
  } else {
    if (result.name) session.data.name = result.name;
    if (result.product) session.data.product = result.product;
    if (result.needs_clarification && result.clarification_question) {
      session.clarifyCount += 1;
      if (session.clarifyCount >= MAX_CLARIFY_ATTEMPTS) return escalateToOperator(senderId, lang);
      session.history.push({ role: "assistant", content: result.clarification_question });
      return { text: result.clarification_question, quickReplies: [cancelBtn(lang)] };
    }
  }

  if (!session.data.name || !session.data.product) {
    return { text: T[lang].needMoreNameProduct, quickReplies: [cancelBtn(lang)] };
  }

  customerProfiles.set(senderId, { name: session.data.name });

  const variants = findVariants(session.data.product);
  session.clarifyCount = 0;

  if (variants.length > 1) {
    session.variants = variants;
    session.data.rejectedCodes = [];
    session.step = "quantity_budget";
    session.history = [];
    return { text: T[lang].askQuantityBudget(session.data.product), quickReplies: [cancelBtn(lang)] };
  }

  session.variants = variants;
  session.step = "quantity_single";
  session.history = [];
  const resp = { text: T[lang].askQuantitySingle(session.data.product), quickReplies: [cancelBtn(lang)] };
  if (variants[0] && variants[0].image) resp.image = variants[0].image;
  return resp;
}

function pushCurrentItem(session) {
  const r = session.data.pendingRecommendation;
  const item = { product: r.variant.name + " (" + r.variant.code + ")", quantity: session.data.quantity };
  if (r.price) {
    item.price = r.price;
  } else {
    item.minQtyRequired = Math.min.apply(null, r.variant.tiers.map(function (t) { return t.minQty; }));
  }
  session.data.items.push(item);
  delete session.data.product;
  delete session.data.quantity;
  delete session.data.budget;
  delete session.data.pendingRecommendation;
  delete session.data.pendingQty;
  delete session.data.rejectedCodes;
}

async function handleMessage(senderId, text, lang) {
  const session = sessions.get(senderId);
  if (!session) return null;

  lang = session.lang;
  session.updatedAt = Date.now();

  if (session.step === "name_product") {
    return processNameProduct(senderId, session, text, lang);
  }

  if (session.step === "quantity_single") {
    session.history.push({ role: "user", content: text });
    const result = await extractQuantityOnly(senderId, session.history, lang, session.data);

    let quantity;
    if (!result) {
      quantity = text;
    } else if (result.needs_clarification || !result.quantity) {
      session.clarifyCount += 1;
      if (session.clarifyCount >= MAX_CLARIFY_ATTEMPTS) return escalateToOperator(senderId, lang);
      const q = result.clarification_question || T[lang].needMoreQty;
      session.history.push({ role: "assistant", content: q });
      return { text: q, quickReplies: [cancelBtn(lang)] };
    } else {
      quantity = result.quantity;
    }

    session.clarifyCount = 0;
    const qtyNum = parseMoneyNumber(quantity);
    const variant = session.variants[0];
    const item = { product: variant ? (variant.name + " (" + variant.code + ")") : session.data.product, quantity: quantity };
    if (variant && variant.tiers && variant.tiers.length && qtyNum) {
      const priceInfo = calcPrice(variant, qtyNum);
      if (priceInfo) item.price = priceInfo;
      else item.minQtyRequired = Math.min.apply(null, variant.tiers.map(function (t) { return t.minQty; }));
    }
    session.data.items.push(item);
    session.step = "add_more";
    session.history = [];
    return { text: T[lang].askAddMore, quickReplies: [addMoreBtn(lang), noMoreBtn(lang)] };
  }

  if (session.step === "quantity_budget") {
    session.history.push({ role: "user", content: text });
    const result = await extractQuantityAndBudget(senderId, session.history, lang, session.data);

    if (!result) {
      if (!session.data.quantity) session.data.quantity = text;
    } else {
      if (result.quantity) session.data.quantity = result.quantity;
      if (result.budget) session.data.budget = result.budget;
      if (result.needs_clarification && result.clarification_question) {
        session.clarifyCount += 1;
        if (session.clarifyCount >= MAX_CLARIFY_ATTEMPTS) return escalateToOperator(senderId, lang);
        session.history.push({ role: "assistant", content: result.clarification_question });
        return { text: result.clarification_question, quickReplies: [cancelBtn(lang)] };
      }
    }

    if (!session.data.quantity) {
      return { text: T[lang].needMoreQtyBudget, quickReplies: [cancelBtn(lang)] };
    }

    session.clarifyCount = 0;
    const qtyNum = parseMoneyNumber(session.data.quantity);
    let rec = recommendVariant(session.variants, qtyNum, session.data.budget, session.data.rejectedCodes);
    if (!rec) {
      const fallbackVariant = session.variants[0];
      rec = { variant: fallbackVariant, price: calcPrice(fallbackVariant, qtyNum), overBudget: false };
    }
    session.data.pendingRecommendation = rec;
    session.data.pendingQty = qtyNum;
    session.step = "confirm_variant";
    const resp = { text: T[lang].recommend(rec.variant, rec.price, rec.overBudget), quickReplies: [altBtn(lang), continueBtn(lang)] };
    if (rec.variant.image) resp.image = rec.variant.image;
    return resp;
  }

  if (session.step === "confirm_variant") {
    const wantsAlternative = /boshqa|\u0434\u0440\u0443\u0433/i.test(text || "");

    if (wantsAlternative) {
      session.data.rejectedCodes.push(session.data.pendingRecommendation.variant.code);
      const rec = recommendVariant(session.variants, session.data.pendingQty, session.data.budget, session.data.rejectedCodes);
      if (!rec) {
        pushCurrentItem(session);
        session.step = "add_more";
        return { text: T[lang].noMoreAlternatives + "\n\n" + T[lang].askAddMore, quickReplies: [addMoreBtn(lang), noMoreBtn(lang)] };
      }
      session.data.pendingRecommendation = rec;
      const resp = { text: T[lang].recommend(rec.variant, rec.price, rec.overBudget), quickReplies: [altBtn(lang), continueBtn(lang)] };
      if (rec.variant.image) resp.image = rec.variant.image;
      return resp;
    }

    pushCurrentItem(session);
    session.step = "add_more";
    session.history = [];
    return { text: T[lang].askAddMore, quickReplies: [addMoreBtn(lang), noMoreBtn(lang)] };
  }

  if (session.step === "add_more") {
    const trimmed = (text || "").trim();
    const wantsMore = /^(ha\b|xa\b|yana|qo'sh|qosh|\u0434\u0430)/i.test(trimmed);

    if (wantsMore) {
      session.step = "name_product";
      session.history = [];
      session.clarifyCount = 0;
      delete session.data.product;
      return { text: T[lang].askAnotherProduct, quickReplies: [cancelBtn(lang)] };
    }

    session.step = "deadline";
    session.history = [];
    session.clarifyCount = 0;
    return { text: T[lang].askDeadline, quickReplies: [cancelBtn(lang)] };
  }

  if (session.step === "deadline") {
    session.history.push({ role: "user", content: text });
    const result = await extractDeadline(senderId, session.history, lang);

    if (!result) {
      session.data.deadline = (text || "").trim() || "aniqlanmagan";
    } else if (result.needs_clarification || !result.deadline) {
      session.clarifyCount += 1;
      if (session.clarifyCount >= MAX_CLARIFY_ATTEMPTS) return escalateToOperator(senderId, lang);
      const q = result.clarification_question || T[lang].askDeadline;
      session.history.push({ role: "assistant", content: q });
      return { text: q, quickReplies: [cancelBtn(lang)] };
    } else {
      session.data.deadline = result.deadline;
    }

    session.clarifyCount = 0;
    session.step = "confirm_order";
    const summary = summarizeItems(session.data.items, lang);
    const total = calcGrandTotal(session.data.items);
    return { text: T[lang].confirmOrder(summary, total), quickReplies: [confirmBtn(lang), cancelBtn(lang)] };
  }

  if (session.step === "confirm_order") {
    const rejected = /^(yo'?q|\u043d\u0435\u0442)/i.test((text || "").trim());
    if (rejected) {
      sessions.delete(senderId);
      return { text: T[lang].confirmRejected, quickReplies: [] };
    }
    session.step = "phone";
    return { text: T[lang].askPhone, quickReplies: [cancelBtn(lang)] };
  }

  if (session.step === "phone") {
    const phone = normalizePhone(text);
    if (!phone) {
      return { text: T[lang].invalidPhone, quickReplies: [cancelBtn(lang)] };
    }
    session.data.phone = phone;
    session.data.orderId = generateOrderId();
    const data = session.data;
    sessions.delete(senderId);
    return { text: T[lang].done(data), quickReplies: [], finished: true, order: data };
  }

  sessions.delete(senderId);
  return null;
}

const BUTTON_TEXT_MAP = {
  addmore: "ha",
  nomore: "yo'q",
  altvariant: "boshqa",
  contvariant: "davom etish",
  confirmorder: "ha",
};

module.exports = { isActive: isActive, start: start, startWithText: startWithText, cancel: cancel, cancelText: cancelText, handleMessage: handleMessage, BUTTON_TEXT_MAP: BUTTON_TEXT_MAP };
