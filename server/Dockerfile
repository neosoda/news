FROM node:18-alpine

RUN apk add --no-cache openssl

ENV SQLITE_URL=file:/app/prisma/dev.db
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "if [ -n \"$SQLITE_URL\" ] && [ \"${SQLITE_URL#file:}\" = \"$SQLITE_URL\" ]; then export SQLITE_URL=\"file:$SQLITE_URL\"; fi && npx prisma db push --accept-data-loss && npx prisma db seed && node index.js"]
