# QQ Bot 管理后台 - 前端

基于 Vue 3 + TypeScript + Vite 构建的 QQ Bot 管理后台前端。

## 技术栈

- **框架**：Vue 3 (Composition API + `<script setup>`)
- **构建工具**：Vite 7.2.7
- **语言**：TypeScript
- **UI 组件库**：Element Plus
- **状态管理**：Pinia
- **路由**：Vue Router 4
- **图表库**：ECharts + vue-echarts
- **HTTP 客户端**：axios
- **日期处理**：dayjs

## 功能特性

- ✅ **用户认证**：JWT Token 登录，自动 token 刷新
- ✅ **数据概览**：总览统计、打卡趋势图表、排行榜、分类统计
- ✅ **打卡记录管理**：列表展示、搜索筛选、分页、删除、CSV 导出
- ✅ **用户管理**：用户列表、搜索排序、用户详情、打卡记录查询
- ✅ **暗色模式**：完整的暗色主题支持，自动持久化
- ✅ **响应式设计**：适配移动端和桌面端

## 登录凭证

**默认账号密码**（开发环境）：
- **用户名**：`admin`
- **密码**：`qq-bot-admin-2025`

> ⚠️ **生产环境请修改 `.env` 文件中的 `ADMIN_PASSWORD` 和 `JWT_SECRET`！**

## 开发指南

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

开发服务器默认运行在：
- **端口**：5173（如果被占用会自动使用 5174/5175）
- **本地地址**：http://localhost:5173/
- **API 代理**：自动代理 `/api` 到 `http://localhost:3001`

### 构建生产版本

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

### 类型检查

```bash
npm run type-check
```

### 代码检查

```bash
npm run lint
```

## 项目结构

```
admin/web/
├── public/              # 静态资源
├── src/
│   ├── api/            # API 接口封装
│   │   ├── auth.ts
│   │   ├── checkins.ts
│   │   ├── users.ts
│   │   └── stats.ts
│   ├── components/     # 组件
│   │   └── layout/     # 布局组件
│   ├── router/         # 路由配置
│   ├── stores/         # Pinia 状态管理
│   │   ├── auth.ts
│   │   └── app.ts
│   ├── styles/         # 全局样式
│   ├── types/          # TypeScript 类型定义
│   ├── utils/          # 工具函数
│   │   ├── http.ts     # HTTP 客户端
│   │   └── format.ts   # 格式化工具
│   ├── views/          # 页面组件
│   │   ├── login/      # 登录页
│   │   ├── dashboard/  # 数据概览
│   │   ├── checkins/   # 打卡记录
│   │   └── users/      # 用户管理
│   ├── App.vue         # 根组件
│   └── main.ts         # 入口文件
├── .env.development    # 开发环境变量
├── .env.production     # 生产环境变量
├── vite.config.ts      # Vite 配置
├── tsconfig.json       # TypeScript 配置
└── package.json
```

## 环境变量

### 开发环境 (`.env.development`)

```env
VITE_API_BASE_URL=http://localhost:3001/api
```

### 生产环境 (`.env.production`)

```env
VITE_API_BASE_URL=https://admin-api.joyehuang.me/api
```

## API 接口

所有 API 请求都通过统一的 HTTP 客户端（`src/utils/http.ts`）处理：

- **自动添加 JWT Token**
- **统一错误处理**
- **响应拦截和格式化**
- **401 自动跳转登录**

## 开发注意事项

### TypeScript 类型导入规范

⚠️ **重要**：从第三方库导入 TypeScript 类型时，必须使用 `import type` 语法！

❌ **错误**：
```typescript
import axios, { AxiosError, AxiosInstance } from 'axios';
import { createRouter, RouteRecordRaw } from 'vue-router';
```

✅ **正确**：
```typescript
import axios from 'axios';
import type { AxiosError, AxiosInstance } from 'axios';

import { createRouter } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
```

**原因**：Vite 在浏览器运行时无法找到这些纯类型导出，会报错 `does not provide an export named 'XXX'`。

### 路由守卫

所有路由默认需要认证，除非在 `meta` 中设置 `requiresAuth: false`。

### 暗色模式

暗色模式状态保存在 `localStorage`，使用 `useAppStore` 管理。

## 构建优化

Vite 配置包含以下优化：

- **代码分割**：将 Element Plus、Vue 核心、ECharts 分别打包
- **Tree Shaking**：自动移除未使用的代码
- **路径别名**：`@` 指向 `src/` 目录

## 浏览器支持

- Chrome >= 87
- Firefox >= 78
- Safari >= 14
- Edge >= 88

## License

MIT

## 相关文档

- [Vue 3 官方文档](https://vuejs.org/)
- [Element Plus 文档](https://element-plus.org/)
- [Vite 官方文档](https://vitejs.dev/)
- [ECharts 文档](https://echarts.apache.org/)
