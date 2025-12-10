FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN mkdir -p uploads
EXPOSE 3000 9229
CMD ["node", "main.js", "-h", "0.0.0.0", "-p", "3000", "-c", "./cache"]