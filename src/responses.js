// Javob matnlari (O'zbek + Rus). Do'kon ma'lumotlari config'dan keladi.
// Har bir javob: { text, quickReplies: [{title, payload}] }
// payload format: "INTENT|lang"  (masalan: "DELIVERY|uz")

module.exports = function buildResponses(b) {
  // Quick reply tugmalar (tilga qarab). Katalog tugmasi olib tashlandi.
  const btn = (lang) => ({
    delivery: { title: lang === "ru" ? "Доставка" : "Yetkazib berish", payload: `DELIVERY|${lang}` },
    order: { title: lang === "ru" ? "Заказать" : "Buyurtma berish", payload: `ORDER|${lang}` },
    operator: { title: lang === "ru" ? "Оператор" : "Operator", payload: `OPERATOR|${lang}` },
  });
  const U = btn("uz");
  const R = btn("ru");

  return {
    welcome: {
      uz: {
        text:
          `Assalomu alaykum! 👋 ${b.shopName}ga xush kelibsiz!\n` +
          `Men avtomat yordamchiman 🤖 Sizga qanday yordam bera olaman?\n` +
          `Quyidagidan birini tanlang yoki savolingizni yozing 👇`,
        quickReplies: [U.delivery, U.order, U.operator],
      },
      ru: {
        text:
          `Здравствуйте! 👋 Добро пожаловать в ${b.shopName}!\n` +
          `Я автоматический помощник 🤖 Чем могу помочь?\n` +
          `Выберите вариант или напишите свой вопрос 👇`,
        quickReplies: [R.delivery, R.order, R.operator],
      },
    },

    delivery: {
      uz: {
        text:
          `Yetkazib berish 🚚\n` +
          `• ${b.deliveryTashkent}\n` +
          `• ${b.deliveryRegion}\n` +
          `• ${b.selfPickup}\n` +
          `Buyurtma bermoqchi bo'lsangiz, "Buyurtma berish" tugmasini bosing 📦`,
        quickReplies: [U.order, U.operator],
      },
      ru: {
        text:
          `Доставка 🚚\n` +
          `• ${b.deliveryTashkent}\n` +
          `• ${b.deliveryRegion}\n` +
          `• ${b.selfPickup}\n` +
          `Если хотите сделать заказ, нажмите «Заказать» 📦`,
        quickReplies: [R.order, R.operator],
      },
    },

    // Bu javob faqat ANTHROPIC_API_KEY sozlanmagan holatda ishlatiladi (zaxira rejim).
    // AI sozlangan bo'lsa, buyurtma server.js / orderFlow.js orqali bosqichma-bosqich olinadi.
    order: {
      uz: {
        text:
          `Buyurtma berish juda oson! 🛒\n` +
          `Iltimos, quyidagilarni yozing:\n` +
          `① Mahsulot nomi va soni\n` +
          `② Ism va telefon raqamingiz\n` +
          `③ Yetkazib berish manzili\n` +
          `Ma'lumotlarni yuborgach, operatorimiz siz bilan bog'lanadi ✅`,
        quickReplies: [U.operator],
      },
      ru: {
        text:
          `Оформить заказ очень просто! 🛒\n` +
          `Пожалуйста, напишите:\n` +
          `① Название и количество товара\n` +
          `② Ваше имя и номер телефона\n` +
          `③ Адрес доставки\n` +
          `После отправки данных наш оператор свяжется с вами ✅`,
        quickReplies: [R.operator],
      },
    },

    payment: {
      uz: {
        text: `To'lov usullari 💳\n${b.paymentMethods}\nQaysi usul qulay bo'lsa, shuni tanlashingiz mumkin 😊`,
        quickReplies: [U.order, U.operator],
      },
      ru: {
        text: `Способы оплаты 💳\n${b.paymentMethods}\nВыбирайте удобный для вас способ 😊`,
        quickReplies: [R.order, R.operator],
      },
    },

    contact: {
      uz: {
        text:
          `Aloqa ma'lumotlari 📞\n` +
          `🕐 Ish vaqti: ${b.workHours}\n` +
          `📱 Telefon: ${b.phone}\n` +
          `📍 Manzil: ${b.address}`,
        quickReplies: [U.operator],
      },
      ru: {
        text:
          `Контакты 📞\n` +
          `🕐 Время работы: ${b.workHours}\n` +
          `📱 Телефон: ${b.phone}\n` +
          `📍 Адрес: ${b.address}`,
        quickReplies: [R.operator],
      },
    },

    operator: {
      uz: {
        text:
          `Sizni operatorimizga ulayapman 👤\n` +
          `Iltimos, biroz kuting — tez orada javob beramiz.\n` +
          `Ish vaqti: ${b.workHours}. Hozir dam olish vaqti bo'lsa, ertalab birinchi bo'lib javob beramiz! 🙏`,
        quickReplies: [],
      },
      ru: {
        text:
          `Подключаю вас к оператору 👤\n` +
          `Пожалуйста, подождите — ответим в ближайшее время.\n` +
          `Время работы: ${b.workHours}. Если сейчас нерабочее время, ответим утром первыми! 🙏`,
        quickReplies: [],
      },
    },

    fallback: {
      uz: {
        text:
          `Kechirasiz, savolingizni to'liq tushunmadim 🤔\n` +
          `Quyidagidan birini tanlang yoki "operator" deb yozing — jonli xodim yordam beradi 👇`,
        quickReplies: [U.order, U.operator],
      },
      ru: {
        text:
          `Извините, не совсем понял ваш вопрос 🤔\n` +
          `Выберите вариант ниже или напишите «оператор» — поможет живой сотрудник 👇`,
        quickReplies: [R.order, R.operator],
      },
    },
  };
};
