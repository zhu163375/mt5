FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV MT5_BIND_HOST=0.0.0.0
ENV MT5_TCP_PORT=9527
ENV MT5_HTTP_PORT=9528

EXPOSE 9527 9528

CMD ["node", "src/start-server.js"]
