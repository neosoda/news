FROM node:20-alpine AS client-build

WORKDIR /app
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client ./client
RUN cd client && npm run build

FROM node:20-alpine AS server-build

WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci
COPY server ./server
ENV DATABASE_URL="postgresql://johndoe:mypassword@localhost:5432/mydb?schema=public"
RUN cd server && npx prisma generate

FROM node:20-alpine

RUN apk add --no-cache openssl

ENV NODE_ENV=production
# DATABASE_URL must be provided as an environment variable in production
WORKDIR /app

COPY --from=server-build /app/server /app
COPY --from=client-build /app/client/dist /app/public

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node index.js"]
