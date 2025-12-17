# 使用 Node.js 20 LTS 作为基础镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY admin/server/package*.json ./

# 安装所有依赖(包括 devDependencies,因为需要 TypeScript 编译)
RUN npm ci

# 复制 Prisma schema 并生成 Client（生成到 node_modules/.prisma/client）
COPY prisma ./prisma
RUN npx prisma@6.19.0 generate

# 复制源代码和配置文件
COPY admin/server/tsconfig.json ./
COPY admin/server/src ./src

# 构建 TypeScript
RUN npm run build

# 删除 devDependencies,只保留生产依赖
RUN npm prune --production

# 暴露端口
EXPOSE 3001

# 启动服务
CMD ["npm", "start"]
