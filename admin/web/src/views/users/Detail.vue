<template>
  <div class="page-container">
    <div v-loading="loading">
      <!-- 返回按钮 -->
      <el-button class="back-button" @click="router.back()">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>

      <!-- 用户信息卡片 -->
      <div class="content-card user-info-card">
        <el-row :gutter="20">
          <el-col :span="12">
            <div class="info-item">
              <span class="label">用户昵称:</span>
              <span class="value">{{ userDetail?.nickname }}</span>
            </div>
            <div class="info-item">
              <span class="label">QQ号:</span>
              <span class="value">{{ userDetail?.qqNumber }}</span>
            </div>
            <div class="info-item">
              <span class="label">连续天数:</span>
              <el-tag :type="(userDetail?.streakDays || 0) >= 7 ? 'success' : 'info'">
                {{ userDetail?.streakDays }} 天
              </el-tag>
            </div>
          </el-col>

          <el-col :span="12">
            <div class="info-item">
              <span class="label">每日目标:</span>
              <span class="value">{{ formatDuration(userDetail?.dailyTarget || 0) }}</span>
            </div>
            <div class="info-item">
              <span class="label">负债:</span>
              <el-tag v-if="(userDetail?.debt || 0) > 0" type="warning">
                {{ formatDuration(userDetail?.debt || 0) }}
              </el-tag>
              <span v-else class="value text-success">无负债</span>
            </div>
            <div class="info-item">
              <span class="label">注册时间:</span>
              <span class="value">{{ formatDateTime(userDetail?.createdAt || '') }}</span>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 统计数据 -->
      <el-row :gutter="20" class="stats-row">
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-label">总打卡数</div>
            <div class="stat-value">{{ userDetail?.stats.totalCheckins || 0 }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-label">总时长</div>
            <div class="stat-value">{{ formatDuration(userDetail?.stats.totalDuration || 0) }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-label">平均时长</div>
            <div class="stat-value">{{ formatDuration(userDetail?.stats.averageDuration || 0) }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-label">成就数量</div>
            <div class="stat-value">{{ userDetail?._count?.achievements || 0 }}</div>
          </div>
        </el-col>
      </el-row>

      <!-- 分类统计 -->
      <div v-if="categoryData.length" class="content-card">
        <h3>分类统计</h3>
        <el-row :gutter="16">
          <el-col
            v-for="item in categoryData"
            :key="item.category"
            :xs="24"
            :sm="12"
            :md="8"
            :lg="6"
          >
            <div class="category-item">
              <div class="category-name">{{ item.category }}</div>
              <div class="category-duration">{{ formatDuration(item.duration) }}</div>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 最近打卡记录 -->
      <div class="content-card">
        <h3>最近打卡记录</h3>
        <el-table
          :data="userDetail?.recentCheckins"
          stripe
          style="width: 100%"
        >
          <el-table-column prop="id" label="ID" width="80" />

          <el-table-column prop="content" label="打卡内容" min-width="200" show-overflow-tooltip />

          <el-table-column label="时长" width="120">
            <template #default="{ row }">
              {{ formatDuration(row.duration) }}
            </template>
          </el-table-column>

          <el-table-column label="分类" width="120">
            <template #default="{ row }">
              <el-tag v-if="row.category" type="info" size="small">
                {{ row.category }}
              </el-tag>
              <span v-else class="text-placeholder">-</span>
            </template>
          </el-table-column>

          <el-table-column label="类型" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.isLoan" type="warning" size="small">贷款</el-tag>
              <el-tag v-else type="success" size="small">普通</el-tag>
            </template>
          </el-table-column>

          <el-table-column label="时间" width="180">
            <template #default="{ row }">
              {{ formatDateTime(row.createdAt) }}
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-if="!userDetail?.recentCheckins?.length" description="暂无打卡记录" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { getUserDetail } from '@/api/users';
import { formatDuration, formatDateTime } from '@/utils/format';
import type { UserDetail } from '@/types';

const router = useRouter();
const route = useRoute();

const userDetail = ref<UserDetail>();
const loading = ref(false);

// 分类数据
const categoryData = computed(() => {
  if (!userDetail.value?.stats.categoryBreakdown) return [];

  return Object.entries(userDetail.value.stats.categoryBreakdown).map(([category, duration]) => ({
    category,
    duration,
  }));
});

// 加载用户详情
const loadUserDetail = async () => {
  const userId = parseInt(route.params.id as string);
  if (isNaN(userId)) {
    router.back();
    return;
  }

  loading.value = true;
  try {
    userDetail.value = await getUserDetail(userId);
  } catch (error) {
    console.error('加载用户详情失败:', error);
    router.back();
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadUserDetail();
});
</script>

<style scoped>
.back-button {
  margin-bottom: 16px;
}

.user-info-card {
  margin-bottom: 20px;
}

.info-item {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.label {
  min-width: 100px;
  font-size: 14px;
  color: var(--text-color-secondary);
}

.value {
  font-size: 14px;
  color: var(--text-color-primary);
  font-weight: 500;
}

.text-success {
  color: var(--color-success);
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  padding: 24px;
  text-align: center;
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: var(--shadow-base);
}

.stat-label {
  font-size: 14px;
  color: var(--text-color-secondary);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-primary);
}

.content-card h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.category-item {
  padding: 16px;
  margin-bottom: 16px;
  background: var(--fill-color-lighter);
  border-radius: 8px;
  text-align: center;
}

.category-name {
  font-size: 14px;
  color: var(--text-color-secondary);
  margin-bottom: 8px;
}

.category-duration {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.text-placeholder {
  color: var(--text-color-placeholder);
}
</style>
