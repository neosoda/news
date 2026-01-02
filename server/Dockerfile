FROM node:18-alpine

RUN apk add --no-cache openssl

ENV SQLITE_URL=file:/app/prisma/dev.db
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Provide a dummy but valid URL for the generate phase
RUN SQLITE_URL=file:/app/prisma/dev.db npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "export SQLITE_URL=${SQLITE_URL:-file:/app/prisma/dev.db} && if [ \"${SQLITE_URL#file:}\" = \"$SQLITE_URL\" ]; then export SQLITE_URL=\"file:$SQLITE_URL\"; fi && npx prisma db push --accept-data-loss && npx prisma db seed && node index.js"]
