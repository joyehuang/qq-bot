<template>
  <div class="page-container">
    <div class="dashboard-container">
      <!-- 统计卡片 -->
      <el-row :gutter="20" class="stats-row">
        <el-col :xs="24" :sm="12" :md="6">
          <div class="stat-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)">
              <el-icon><User /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats?.totalUsers || 0 }}</div>
              <div class="stat-label">总用户数</div>
            </div>
          </div>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <div class="stat-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%)">
              <el-icon><Calendar /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats?.totalCheckins || 0 }}</div>
              <div class="stat-label">总打卡数</div>
            </div>
          </div>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <div class="stat-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)">
              <el-icon><Clock /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ formatDuration(stats?.totalDuration || 0) }}</div>
              <div class="stat-label">总时长</div>
            </div>
          </div>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <div class="stat-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)">
              <el-icon><TrendCharts /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats?.today.users || 0 }}</div>
              <div class="stat-label">今日活跃用户</div>
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- 图表区域 -->
      <el-row :gutter="20" class="charts-row">
        <!-- 打卡趋势图 -->
        <el-col :xs="24" :lg="16">
          <div class="content-card chart-card">
            <div class="card-header">
              <h3>打卡趋势</h3>
              <el-radio-group v-model="trendPeriod" size="small" @change="loadTrendData">
                <el-radio-button label="day">最近7天</el-radio-button>
                <el-radio-button label="week">最近4周</el-radio-button>
                <el-radio-button label="month">最近6月</el-radio-button>
              </el-radio-group>
            </div>
            <div v-loading="trendLoading" class="chart-container">
              <v-chart v-if="trendOption" :option="trendOption" autoresize />
              <el-empty v-else description="暂无数据" />
            </div>
          </div>
        </el-col>

        <!-- 排行榜 -->
        <el-col :xs="24" :lg="8">
          <div class="content-card">
            <div class="card-header">
              <h3>本周排行榜</h3>
            </div>
            <div v-loading="leaderboardLoading" class="leaderboard-container">
              <div
                v-for="(item, index) in leaderboard?.leaderboard"
                :key="item.userId"
                class="leaderboard-item"
              >
                <div class="rank" :class="`rank-${index + 1}`">{{ index + 1 }}</div>
                <div class="user-info">
                  <div class="nickname">{{ item.nickname }}</div>
                  <div class="duration">{{ formatDuration(item.duration) }}</div>
                </div>
              </div>
              <el-empty v-if="!leaderboard?.leaderboard?.length" description="暂无数据" />
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- 分类统计 -->
      <el-row :gutter="20">
        <el-col :span="24">
          <div class="content-card chart-card">
            <div class="card-header">
              <h3>分类统计</h3>
            </div>
            <div v-loading="categoryLoading" class="chart-container">
              <v-chart v-if="categoryOption" :option="categoryOption" autoresize />
              <el-empty v-else description="暂无数据" />
            </div>
          </div>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { User, Calendar, Clock, TrendCharts } from '@element-plus/icons-vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart, PieChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components';
import { getStatsOverview, getStatsTrend, getStatsCategory, getLeaderboard } from '@/api/stats';
import { formatDuration } from '@/utils/format';
import type { StatsOverview, TrendData, CategoryStats, Leaderboard } from '@/types';

// 注册 ECharts 组件
use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
]);

// 数据状态
const stats = ref<StatsOverview>();
const trendData = ref<TrendData>();
const categoryData = ref<CategoryStats>();
const leaderboard = ref<Leaderboard>();

// 加载状态
const trendLoading = ref(false);
const categoryLoading = ref(false);
const leaderboardLoading = ref(false);

// 趋势周期
const trendPeriod = ref<'day' | 'week' | 'month'>('day');

// 趋势图表配置
const trendOption = computed(() => {
  if (!trendData.value?.data.length) return null;

  const dates = trendData.value.data.map((item) => item.date);
  const durations = trendData.value.data.map((item) => item.duration / 60); // 转换为小时

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const item = params[0];
        return `${item.axisValue}<br/>时长: ${formatDuration(item.value * 60)}`;
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      name: '时长(小时)',
    },
    series: [
      {
        name: '打卡时长',
        type: 'line',
        data: durations,
        smooth: true,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(64, 158, 255, 0.3)' },
              { offset: 1, color: 'rgba(64, 158, 255, 0)' },
            ],
          },
        },
        lineStyle: {
          color: '#409eff',
        },
        itemStyle: {
          color: '#409eff',
        },
      },
    ],
  };
});

// 分类图表配置
const categoryOption = computed(() => {
  if (!categoryData.value?.categories.length) return null;

  const data = categoryData.value.categories.map((item) => ({
    name: item.category,
    value: item.duration / 60, // 转换为小时
  }));

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        return `${params.name}<br/>时长: ${formatDuration(params.value * 60)}<br/>占比: ${params.percent}%`;
      },
    },
    legend: {
      orient: 'vertical',
      right: '10%',
      top: 'center',
    },
    series: [
      {
        name: '分类统计',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: false,
          position: 'center',
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 20,
            fontWeight: 'bold',
          },
        },
        labelLine: {
          show: false,
        },
        data,
      },
    ],
  };
});

// 加载统计概览
const loadOverview = async () => {
  try {
    stats.value = await getStatsOverview();
  } catch (error) {
    console.error('加载统计概览失败:', error);
  }
};

// 加载趋势数据
const loadTrendData = async () => {
  trendLoading.value = true;
  try {
    const limit = trendPeriod.value === 'day' ? 7 : trendPeriod.value === 'week' ? 28 : 180;
    trendData.value = await getStatsTrend({ period: trendPeriod.value, limit });
  } catch (error) {
    console.error('加载趋势数据失败:', error);
  } finally {
    trendLoading.value = false;
  }
};

// 加载分类统计
const loadCategoryData = async () => {
  categoryLoading.value = true;
  try {
    categoryData.value = await getStatsCategory();
  } catch (error) {
    console.error('加载分类统计失败:', error);
  } finally {
    categoryLoading.value = false;
  }
};

// 加载排行榜
const loadLeaderboard = async () => {
  leaderboardLoading.value = true;
  try {
    leaderboard.value = await getLeaderboard({ period: 'week', limit: 10 });
  } catch (error) {
    console.error('加载排行榜失败:', error);
  } finally {
    leaderboardLoading.value = false;
  }
};

// 页面加载时获取数据
onMounted(() => {
  loadOverview();
  loadTrendData();
  loadCategoryData();
  loadLeaderboard();
});
</script>

<style scoped>
.dashboard-container {
  padding: 0;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 24px;
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: var(--shadow-base);
  transition: transform 0.3s, box-shadow 0.3s;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-dark);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-right: 16px;
  border-radius: 12px;
  font-size: 28px;
  color: white;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-color-primary);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: var(--text-color-secondary);
}

.charts-row {
  margin-bottom: 20px;
}

.chart-card {
  height: 400px;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color-lighter);
}

.card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.chart-container {
  flex: 1;
  min-height: 0;
}

.leaderboard-container {
  max-height: 400px;
  overflow-y: auto;
}

.leaderboard-item {
  display: flex;
  align-items: center;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--fill-color-lighter);
  border-radius: 8px;
  transition: background-color 0.3s;
}

.leaderboard-item:hover {
  background: var(--fill-color-light);
}

.rank {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-right: 12px;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 600;
  color: white;
  background: var(--color-info);
}

.rank-1 {
  background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
  color: #333;
}

.rank-2 {
  background: linear-gradient(135deg, #c0c0c0 0%, #e8e8e8 100%);
  color: #333;
}

.rank-3 {
  background: linear-gradient(135deg, #cd7f32 0%, #e6a857 100%);
  color: white;
}

.user-info {
  flex: 1;
}

.nickname {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color-primary);
  margin-bottom: 4px;
}

.duration {
  font-size: 12px;
  color: var(--text-color-secondary);
}
</style>
