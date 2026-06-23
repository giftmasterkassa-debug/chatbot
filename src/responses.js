// Javob matnlari (O'zbek + Rus). Do'kon ma'lumotlari config'dan keladi.
// Tugmalar (Quick Replies) to'liq olib tashlandi. Erkin suhbat rejimiga o'tkazildi.

module.exports = function buildResponses(b) {
  return {
    welcome: {
      uz: {
        text:
          `Assalomu alaykum! 👋 ${b.shopName}ga xush kelibsiz!\n` +
          `Men avtomat yordamchiman 🤖 Sizga qanday yordam bera olaman?\n` +
          `Nima izlayotganingizni yoki savolingizni bemalol yozavering 👇`,
        quickReplies: [],
      },
      ru: {
        text:
          `Здравствуйте! 👋 Добро пожаловать в ${b.shopName}!\n` +
          `Я ваш помощник 🤖 Чем могу помочь?\n` +
          `Просто напишите, что вы ищете или ваш вопрос 👇`,
        quickReplies: [],
      },
    },

    delivery: {
      uz: {
        text:
          `Yetkazib berish bo'yicha ma'lumot 🚚\n\n` +
          `• ${b.deliveryTashkent}\n` +
          `• ${b.deliveryRegion}\n` +
          `• ${b.selfPickup}\n\n` +
          `Buyurtma bermoqchi bo'lsangiz, shunchaki nima kerakligini yozing 📦`,
        quickReplies: [],
      },
      ru: {
        text:
          `Информация о доставке 🚚\n\n` +
          `• ${b.deliveryTashkent}\n` +
          `• ${b.deliveryRegion}\n` +
          `• ${b.selfPickup}\n\n` +
          `Если хотите сделать заказ, просто напишите, что вам нужно 📦`,
        quickReplies: [],
      },
    },

    order: {
      uz: {
        text:
          `Buyurtma berish juda oson! 🛒\n` +
          `Sizga qaysi mahsulotimizdan va nechta kerak bo'ladi? Yozib yuboring, hisoblab beraman ✅`,
        quickReplies: [],
      },
      ru: {
        text:
          `Оформить заказ очень просто! 🛒\n` +
          `Какой товар и в каком количестве вам нужен? Напишите, и я всё рассчитаю ✅`,
        quickReplies: [],
      },
    },

    payment: {
      uz: {
        text: `To'lov usullari 💳\n${b.paymentMethods}\nQaysi usul qulay bo'lsa, shuni tanlashingiz mumkin 😊`,
        quickReplies: [],
      },
      ru: {
        text: `Способы оплаты 💳\n${b.paymentMethods}\nВыбирайте удобный для вас способ 😊`,
        quickReplies: [],
      },
    },

    contact: {
      uz: {
        text:
          `Aloqa ma'lumotlarimiz 📞\n\n` +
          `🕐 Ish vaqti: ${b.workHours}\n` +
          `📱 Telefon: ${b.phone}\n` +
          `📍 Manzil: ${b.address}`,
        quickReplies: [],
      },
      ru: {
        text:
          `Наши контакты 📞\n\n` +
          `🕐 Время работы: ${b.workHours}\n` +
          `📱 Телефон: ${b.phone}\n` +
          `📍 Адрес: ${b.address}`,
        quickReplies: [],
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
          `Iltimos, so'rovingizni boshqacharoq yozib ko'ring yoki "operator" deb yozing — jonli xodim yordam beradi 👇`,
        quickReplies: [],
      },
      ru: {
        text:
          `Извините, не совсем понял ваш вопрос 🤔\n` +
          `Пожалуйста, перефразируйте запрос или напишите «оператор» — поможет живой сотрудник 👇`,
        quickReplies: [],
      },
    },
  };
};
