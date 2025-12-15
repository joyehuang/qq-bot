import dotenv from 'dotenv';
import path from 'path';

// 加载根目录的 .env 文件
dotenv.config({ path: path.join(__dirname, '../../../..', '.env') });

export const ENV = {
  // 管理后台配置
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'change-this-password',
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret-key',
  ADMIN_API_PORT: parseInt(process.env.ADMIN_API_PORT || '3001'),

  // 数据库配置（使用 Bot 主程序的数据库）
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',

  // Node 环境
  NODE_ENV: process.env.NODE_ENV || 'development',

  // JWT 配置
  JWT_EXPIRES_IN: '7d', // Token 有效期 7 天
} as const;
