import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化 MiniMind 学习项目...');

  // 创建 MiniMind 项目
  const minimind = await prisma.studyProject.upsert({
    where: { projectKey: 'minimind' },
    update: {},
    create: {
      projectKey: 'minimind',
      name: 'MiniMind 学习计划',
      description: '从零实现 LLM，深入理解每个设计选择',
      isActive: true,
      config: JSON.stringify({
        modules: []
      }),
    },
  });

  console.log('✅ MiniMind 项目已创建');
  console.log(`   项目 ID: ${minimid.id}`);
  console.log(`   项目名称: ${minimid.name}`);

  // 统计信息
  const planCount = await prisma.studyPlan.count();
  console.log(`\n📊 当前数据库统计：`);
  console.log(`   学习项目：1 个`);
  console.log(`   学习计划：${planCount} 个`);
}

main()
  .catch((e) => {
    console.error('❌ Seed 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
