FROM node:20-alpine

WORKDIR /app

# Avval faqat package fayllarini ko'chiramiz (kesh uchun)
COPY package*.json ./
RUN npm install --omit=dev

# Qolgan kodni ko'chiramiz
COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
