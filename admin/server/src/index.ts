// Admin Server API - v1.0.0
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ENV } from './config/env';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';

const app = express();

// 安全中间件
app.use(helmet());

// CORS 配置
app.use(
  cors({
    origin: ENV.NODE_ENV === 'development' ? '*' : [
      'https://admin.joyehuang.me',
      'http://localhost:5173',
    ],
    credentials: true,
  })
);

// 请求日志
app.use(morgan(ENV.NODE_ENV === 'development' ? 'dev' : 'combined'));

// 解析 JSON 请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 路由
app.use('/api', routes);

// 404 处理
app.use(notFoundHandler);

// 错误处理
app.use(errorHandler);

// 启动服务器
const PORT = ENV.ADMIN_API_PORT;

app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 QQ Bot 管理后台 API 服务已启动`);
  console.log(`📡 端口: ${PORT}`);
  console.log(`🌍 环境: ${ENV.NODE_ENV}`);
  console.log(`📊 数据库: ${ENV.DATABASE_URL}`);
  console.log(`⏰ 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`========================================`);
  console.log(`API 接口：`);
  console.log(`  POST   /api/auth/login       - 登录`);
  console.log(`  POST   /api/auth/verify      - 验证 Token`);
  console.log(`  GET    /api/checkins         - 获取打卡列表`);
  console.log(`  GET    /api/checkins/:id     - 获取打卡详情`);
  console.log(`  DELETE /api/checkins/:id     - 删除打卡`);
  console.log(`  GET    /api/checkins/export/csv - 导出 CSV`);
  console.log(`  GET    /api/users            - 获取用户列表`);
  console.log(`  GET    /api/users/:id        - 获取用户详情`);
  console.log(`  GET    /api/users/:id/checkins - 获取用户打卡`);
  console.log(`  GET    /api/stats/overview   - 总览统计`);
  console.log(`  GET    /api/stats/trend      - 打卡趋势`);
  console.log(`  GET    /api/stats/category   - 分类统计`);
  console.log(`  GET    /api/stats/leaderboard - 排行榜`);
  console.log(`========================================`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('收到 SIGINT 信号，正在关闭服务器...');
  process.exit(0);
});
