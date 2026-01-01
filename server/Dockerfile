FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

EXPOSE 3000

# Script to run migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]
