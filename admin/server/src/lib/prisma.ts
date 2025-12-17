// Prisma Client 实例
import type { PrismaClient as PrismaClientType } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

// 导出 Prisma Client实例（单例模式）
let prisma: PrismaClientType;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // 开发环境使用全局变量避免热重载时创建多个实例
  const globalForPrisma = global as typeof globalThis & {
    prisma: PrismaClientType;
  };

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }

  prisma = globalForPrisma.prisma;
}

export { prisma };
export type { User, Checkin, Suggestion, Achievement } from '@prisma/client';
