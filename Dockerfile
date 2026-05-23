FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN chmod +x docker-entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
