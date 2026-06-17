# Instagram avtomat javob boti (O'zbek + Rus)

O'z serveringizda ishlaydigan, Instagram Direct'ga avtomat javob beruvchi chatbot.
Online do'kon uchun tayyorlangan: narx, mahsulot, yetkazib berish, buyurtma, to'lov savollariga javob beradi. Mijoz o'zbekcha yozsa — o'zbekcha, ruscha yozsa — ruscha javob qaytadi.

Texnologiya: **Node.js + Express**, tashqi kutubxonalar deyarli yo'q (faqat `express` va `dotenv`).

---

## 1. Qanday ishlaydi

1. Mijoz Instagram'da sizga Direct yozadi.
2. Meta (Instagram) bu xabarni sizning serveringizdagi `/webhook` manziliga yuboradi.
3. Bot xabarni o'qiydi, tilini aniqlaydi, kalit so'zga qarab javobni tanlaydi.
4. Bot **Send API** orqali mijozga javob qaytaradi (tugmalar bilan).

```
Mijoz  →  Instagram  →  [Meta webhook]  →  Sizning serveringiz  →  [Send API]  →  Mijoz
```

---

## 2. Sizga nima kerak (talablar)

| Talab | Izoh |
|---|---|
| Instagram **Professional** akkaunt | Business yoki Creator |
| **Facebook sahifa (Page)** | Instagram akkaunt shu sahifaga ulangan bo'lishi kerak |
| **Meta Developer** akkaunt | https://developers.facebook.com |
| **Server** | Doimiy ishlaydigan, **HTTPS** manzilli (VPS, Render, Railway, yoki test uchun ngrok) |
| **Node.js 18+** | Botni ishga tushirish uchun |

---

## 3. Loyihani ishga tushirish (lokal)

```bash
# 1) Kutubxonalarni o'rnatish
npm install

# 2) Sozlamalar faylini yaratish
cp .env.example .env
#  .env faylini ochib, qiymatlarni to'ldiring (pastga qarang)

# 3) Avval kodni test qiling (Meta'siz, lokal)
npm test

# 4) Serverni ishga tushirish
npm start
```

Server ishga tushgach: `http://localhost:3000` ochsangiz `Instagram bot ishlayapti ✅` chiqadi.

> **Maslahat:** Birinchi marta `.env` da `DRY_RUN=true` qo'ying — bot haqiqiy xabar yubormay, javoblarni faqat konsolga chiqaradi. Hammasi to'g'ri bo'lsa, `DRY_RUN=false` qiling.

---

## 4. .env sozlamalari

| O'zgaruvchi | Nima |
|---|---|
| `VERIFY_TOKEN` | O'zingiz o'ylab topadigan maxfiy so'z. Meta'da webhook ulashda kerak bo'ladi. |
| `APP_SECRET` | Meta App → Settings → Basic → **App Secret**. Imzoni tekshirish uchun. |
| `PAGE_ACCESS_TOKEN` | Instagram'ga ulangan sahifaning tokeni (5-bo'limga qarang). |
| `GRAPH_HOST` | `graph.facebook.com` (Facebook Login) yoki `graph.instagram.com` (Instagram Login). |
| `SHOP_NAME`, `PHONE`, `CATALOG_URL`, ... | Do'koningiz ma'lumotlari — javob matnlariga avtomat qo'yiladi. |

---

## 5. Meta tomonida sozlash (qadam-baqadam)

### 5.1. App yaratish
1. https://developers.facebook.com → **My Apps** → **Create App**.
2. Use case: **"Other"** → tur: **Business** ni tanlang.

### 5.2. Mahsulotlarni qo'shish
1. App panelida **"Messenger"** yoki **"Instagram"** mahsulotini qo'shing (**Add Product**).
2. Instagram akkauntingizni Facebook sahifangizga ulang (agar ulanmagan bo'lsa, Instagram ilovasi → Settings → "Page" orqali ulang).

### 5.3. Page Access Token olish
1. Messenger/Instagram sozlamalarida sahifangizni tanlang → **Generate Token**.
2. Chiqgan tokenni `.env` dagi `PAGE_ACCESS_TOKEN` ga qo'ying.
3. Kerakli ruxsatlar: `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`.

### 5.4. Webhook ulash
1. Serveringizni internetga chiqaring (HTTPS bo'lishi shart). Test uchun:
   ```bash
   npx ngrok http 3000
   ```
   ngrok bergan `https://....ngrok-free.app` manzilini oling.
2. Meta App → **Webhooks** (yoki Messenger → Settings → Webhooks) → **Add Callback URL**:
   - **Callback URL:** `https://SIZNING-MANZIL/webhook`
   - **Verify Token:** `.env` dagi `VERIFY_TOKEN` bilan **bir xil** bo'lsin.
3. **Verify and Save** bosing. Konsolda `✅ Webhook tasdiqlandi` chiqishi kerak.
4. **Subscribe** qiling: `messages` (va xohlasangiz `messaging_postbacks`) maydonlariga obuna bo'ling.
5. Instagram akkauntingizni webhook'ga obuna qiling (Messenger settings → sahifani tanlab "Subscribe").

### 5.5. Test
- Boshqa akkauntdan Instagram'da sizga **"narx"** yoki **"цена"** deb yozing.
- Bot darhol javob berishi kerak.

> Test bosqichida faqat **App'ga qo'shilgan rollar** (Admin / Tester) yoza oladi. Hammaga ochish uchun keyingi bo'limga qarang.

---

## 6. Jonli (Live) rejimga o'tkazish

Botni hamma mijozlar uchun ishlatish uchun Meta **App Review** dan o'tishingiz kerak:
- `instagram_manage_messages` (yoki `instagram_business_manage_messages`) ruxsatini so'rang.
- App'ni **Live** holatiga o'tkazing.
- Meta odatda botning nima qilishini ko'rsatuvchi qisqa video so'raydi.

---

## 7. Doimiy serverga joylash (deploy)

**A variant — VPS (DigitalOcean, Hetzner, Aruba va h.k.):**
```bash
git clone <loyiha>
cd instagram-bot
npm install --omit=dev
cp .env.example .env   # to'ldiring
# PM2 bilan doimiy ishlatish:
npm install -g pm2
pm2 start src/server.js --name ig-bot
pm2 save
```
Domeningizni Nginx (reverse proxy) + Let's Encrypt (HTTPS) bilan `localhost:3000` ga yo'naltiring.

**B variant — Docker:**
```bash
docker build -t ig-bot .
docker run -d -p 3000:3000 --env-file .env --name ig-bot ig-bot
```

**C variant — Render / Railway:** GitHub'ga yuklab, "New Web Service" yarating, `.env` qiymatlarini panelга qo'ying. Bu yerda HTTPS avtomat beriladi.

---

## 8. Javob matnlarini o'zgartirish

- **Do'kon ma'lumotlari** (nom, telefon, narx havolasi): `.env` faylida.
- **Javob matnlari:** `src/responses.js`.
- **Kalit so'zlar** (qaysi so'z qaysi javobni chaqiradi): `src/router.js` dagi `KEYWORDS`.

---

## 9. Muhim eslatma (24-soat qoidasi)

Meta qoidasiga ko'ra bot mijozga faqat u **oxirgi yozgandan keyingi 24 soat** ichida avtomat javob yubora oladi. Bu bot mijoz yozganda darhol javob berishga sozlangani uchun muammo tug'dirmaydi.

---

## 10. Fayllar tuzilishi

```
instagram-bot/
├── src/
│   ├── server.js      # Webhook server (verify + qabul + javob)
│   ├── messenger.js   # Send API + imzo tekshiruvi
│   ├── router.js      # Til + kalit so'z bo'yicha javob tanlash
│   ├── responses.js   # Javob matnlari (UZ + RU)
│   ├── lang.js        # Til aniqlash
│   └── config.js      # .env sozlamalari
├── test/local-test.js # Lokal testlar (Meta'siz)
├── .env.example       # Sozlamalar namunasi
├── Dockerfile
└── README.md
```
