// Javob matnlari (O'zbek + Rus). 
// FAQAT STATIK MA'LUMOTLAR UCHUN ISHLATILADI. 
// Asosiy suhbatni AI o'zi boshqaradi.

module.exports = function buildResponses(b) {
  return {
    welcome: {
      uz: {
        text:
          `Assalomu alaykum! 👋 ${b.shopName} korporativ sovg'alar do'koniga xush kelibsiz!\n` +
          `Sizga qanday yordam bera olaman? Nima izlayotganingizni yoki qanday savolingiz borligini bemalol yozavering 👇`,
        quickReplies: [],
      },
      ru: {
        text:
          `Здравствуйте! 👋 Добро пожаловать в магазин корпоративных подарков ${b.shopName}!\n` +
          `Чем могу помочь? Просто напишите, что вы ищете или какой у вас вопрос 👇`,
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
          `Sizni mutaxassisga yo'naltirdim 👤\n` +
          `Iltimos, biroz kuting — tez orada sizga javob beradi.\n` +
          `Ish vaqti: ${b.workHours}. Agar hozir dam olish vaqti bo'lsa, ertasi kuni ertalab birinchi bo'lib aloqaga chiqamiz! 🙏`,
        quickReplies: [],
      },
      ru: {
        text:
          `Я перевел вас на специалиста 👤\n` +
          `Пожалуйста, подождите — он ответит вам в ближайшее время.\n` +
          `Время работы: ${b.workHours}. Если сейчас нерабочее время, мы свяжемся с вами утром первыми! 🙏`,
        quickReplies: [],
      },
    },

    fallback: {
      uz: {
        text:
          `Kechirasiz, xabaringizni to'liq tushunmadim 🤔\n` +
          `Iltimos, boshqacharoq yozib ko'ring yoki "operator" deb yozing 👇`,
        quickReplies: [],
      },
      ru: {
        text:
          `Извините, не совсем понял ваше сообщение 🤔\n` +
          `Пожалуйста, перефразируйте или напишите «оператор» 👇`,
        quickReplies: [],
      },
    },
  };
};
