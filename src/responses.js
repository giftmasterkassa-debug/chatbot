// Statik javob matnlari (O'zbek + Rus). YANGI ARXITEKTURADA bu fayl FAQAT 2 holatda ishlatiladi:
//   1) "welcome" - Instagram "Get Started" tugmasi bosilganda (birinchi ochilish, AI chaqirilmaydi)
//   2) "order" - OPENAI_API_KEY sozlanmagan paytda ishlaydigan eng oddiy zaxira matni
// Boshqa hamma narsa (yetkazib berish, to'lov, aloqa, operator va h.k.) endi botning
// AI suhbat tizimi orqali, config.business faktlaridan foydalanib, tabiiy tilda javob beriladi.
// Tugmalar (quickReplies) UMUMAN ishlatilmaydi.

module.exports = function buildResponses(b) {
  return {
    welcome: {
      uz: {
        text:
          `Assalomu alaykum! 👋 ${b.shopName}ga xush kelibsiz!\n` +
          `Men avtomat yordamchiman 🤖 Savolingizni yoki nimaga qiziqayotganingizni yozib qoldirsangiz bo'ldi.`,
      },
      ru: {
        text:
          `Здравствуйте! 👋 Добро пожаловать в ${b.shopName}!\n` +
          `Я автоматический помощник 🤖 Просто напишите, что вас интересует.`,
      },
    },

    // Faqat OPENAI_API_KEY sozlanmagan holatda ishlatiladi (AI'siz zaxira rejim).
    order: {
      uz: {
        text:
          `Buyurtma berish uchun iltimos quyidagilarni yozing:\n` +
          `① Mahsulot nomi va soni\n` +
          `② Ism va telefon raqamingiz\n` +
          `Ma'lumotlarni yuborgach, operatorimiz siz bilan bog'lanadi ✅`,
      },
      ru: {
        text:
          `Чтобы сделать заказ, напишите, пожалуйста:\n` +
          `① Название и количество товара\n` +
          `② Ваше имя и номер телефона\n` +
          `После отправки данных наш оператор свяжется с вами ✅`,
      },
    },
  };
};
