FROM alpine:3.19

# Cài đặt curl, nodejs, npm và libc6-compat (cần thiết để chạy apkeep binary trên Alpine)
RUN apk add --no-cache curl libc6-compat ca-certificates nodejs npm gcompat

# Tải xuống apkeep v1.0.0 cho Linux x86_64
RUN curl -L https://github.com/EFForg/apkeep/releases/download/v1.0.0/apkeep-x86_64-unknown-linux-musl -o /usr/local/bin/apkeep \
    && chmod +x /usr/local/bin/apkeep

WORKDIR /app

# Copy tệp cấu hình và cài đặt dependencies
COPY package.json ./
RUN npm install --production

# Copy mã nguồn server API
COPY server.js ./

EXPOSE 8080

CMD ["node", "server.js"]
