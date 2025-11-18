FROM node:20-alpine

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 生成 Prisma Client（需要临时设置 DATABASE_URL）
RUN DATABASE_URL="file:./dev.db" npx prisma generate

# 启动命令
CMD ["npx", "ts-node", "src/index.ts"]
