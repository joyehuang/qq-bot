<template>
  <div class="page-container">
    <div class="page-stack">
      <!-- 概览统计 -->
      <el-row :gutter="20" class="stats-row">
        <el-col :xs="12" :sm="12" :md="6">
          <div class="stat-card">
            <div class="stat-content">
              <div class="stat-value">{{ stats?.today.count ?? 0 }}</div>
              <div class="stat-label">今日调用</div>
              <div class="stat-sub">平均 {{ formatMs(stats?.today.avgDurationMs) }}</div>
            </div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6">
          <div class="stat-card">
            <div class="stat-content">
              <div class="stat-value">{{ stats?.week.count ?? 0 }}</div>
              <div class="stat-label">本周调用</div>
              <div class="stat-sub">平均 {{ formatMs(stats?.week.avgDurationMs) }}</div>
            </div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6">
          <div class="stat-card">
            <div class="stat-content">
              <div class="stat-value">{{ stats?.week.successRate ?? 0 }}%</div>
              <div class="stat-label">本周成功率</div>
              <div class="stat-sub">失败 {{ weekFailures }} 次</div>
            </div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6">
          <div class="stat-card">
            <div class="stat-content">
              <div class="stat-value">{{ stats?.total ?? 0 }}</div>
              <div class="stat-label">累计调用</div>
              <div class="stat-sub">平均 {{ formatMs(stats?.all.avgDurationMs) }}</div>
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- 趋势 + 场景分布 -->
      <el-row :gutter="20">
        <el-col :xs="24" :lg="14">
          <div class="content-card">
            <div class="card-header">
              <h3>14 天调用趋势</h3>
            </div>
            <div v-loading="statsLoading" class="chart-container">
              <v-chart v-if="trendOption" :option="trendOption" autoresize />
              <el-empty v-else description="暂无数据" />
            </div>
          </div>
        </el-col>
        <el-col :xs="24" :lg="10">
          <div class="content-card">
            <div class="card-header">
              <h3>本周按场景分布</h3>
            </div>
            <div v-loading="statsLoading" class="chart-container">
              <v-chart v-if="scenarioOption" :option="scenarioOption" autoresize />
              <el-empty v-else description="暂无数据" />
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- 列表 -->
      <div class="content-card">
        <el-form :model="searchForm" :inline="true" class="search-form">
          <el-form-item label="场景">
            <el-select v-model="searchForm.scenario" placeholder="全部" clearable @change="handleSearch" style="width: 180px">
              <el-option v-for="opt in scenarioOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="searchForm.status" placeholder="全部" clearable @change="handleSearch" style="width: 140px">
              <el-option label="成功" value="success" />
              <el-option label="失败" value="error" />
              <el-option label="超时" value="timeout" />
            </el-select>
          </el-form-item>
          <el-form-item label="QQ号">
            <el-input v-model="searchForm.callerQQ" placeholder="调用者 QQ" clearable @clear="handleSearch" style="width: 160px" />
          </el-form-item>
          <el-form-item label="关键词">
            <el-input v-model="searchForm.keyword" placeholder="prompt/response 模糊匹配" clearable @clear="handleSearch" style="width: 220px" />
          </el-form-item>
          <el-form-item label="时间">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始"
              end-placeholder="结束"
              value-format="YYYY-MM-DD"
              @change="handleSearch"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch">
              <el-icon><Search /></el-icon>
              搜索
            </el-button>
            <el-button @click="handleReset">
              <el-icon><RefreshLeft /></el-icon>
              重置
            </el-button>
          </el-form-item>
        </el-form>

        <el-table v-loading="loading" :data="tableData" stripe style="width: 100%">
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="场景" width="170">
            <template #default="{ row }">
              <el-tag size="small" type="info">{{ scenarioLabel(row.scenario) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="调用者" width="130">
            <template #default="{ row }">
              <div v-if="row.callerQQ">{{ row.callerQQ }}</div>
              <span v-else class="text-placeholder">-</span>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="100">
            <template #default="{ row }">{{ formatMs(row.durationMs) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag v-if="row.status === 'success'" size="small" type="success">成功</el-tag>
              <el-tag v-else-if="row.status === 'timeout'" size="small" type="warning">超时</el-tag>
              <el-tag v-else size="small" type="danger">失败</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="prompt 预览" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ truncate(row.userPrompt, 60) }}</template>
          </el-table-column>
          <el-table-column label="response 预览" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.responseText">{{ truncate(row.responseText, 60) }}</span>
              <span v-else class="text-placeholder">{{ truncate(row.errorMsg || '-', 60) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" size="small" link @click="viewDetail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-container">
          <el-pagination
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :page-sizes="[10, 20, 50, 100]"
            :total="pagination.total"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="handlePageChange"
            @current-change="handlePageChange"
          />
        </div>
      </div>
    </div>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="AI 调用详情" size="50%" direction="rtl">
      <div v-if="detail" class="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="ID">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="时间">{{ formatDateTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="场景">{{ scenarioLabel(detail.scenario) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag v-if="detail.status === 'success'" type="success" size="small">成功</el-tag>
            <el-tag v-else-if="detail.status === 'timeout'" type="warning" size="small">超时</el-tag>
            <el-tag v-else type="danger" size="small">失败</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="调用者 QQ">{{ detail.callerQQ || '-' }}</el-descriptions-item>
          <el-descriptions-item label="群号">{{ detail.groupQQ || '-' }}</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ formatMs(detail.durationMs) }}</el-descriptions-item>
          <el-descriptions-item label="模型">{{ detail.model || '默认' }}</el-descriptions-item>
          <el-descriptions-item label="Session ID" :span="2">{{ detail.sessionId || '-' }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="detail-h">System Prompt</h4>
        <pre class="detail-pre">{{ detail.systemPrompt }}</pre>

        <h4 class="detail-h">User Prompt</h4>
        <pre class="detail-pre">{{ detail.userPrompt }}</pre>

        <h4 class="detail-h">Response</h4>
        <pre v-if="detail.responseText" class="detail-pre">{{ detail.responseText }}</pre>
        <el-alert v-else :title="detail.errorMsg || '无响应'" type="error" :closable="false" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { Search, RefreshLeft } from '@element-plus/icons-vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components';
import { getAICalls, getAICallDetail, getAICallStats } from '@/api/aiCalls';
import { formatDateTime, truncate } from '@/utils/format';
import type { AICallLog, AICallStats } from '@/types';

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
]);

const SCENARIO_LABELS: Record<string, string> = {
  classify: '打卡分类',
  checkin_reply: '打卡结语',
  reminder: '打卡督促',
  streak_warning: '断签警告',
  streak_broken: '断签调侃',
  user_analysis: '用户分析',
  user_weekly_report: '用户周报',
  group_weekly_report: '群周报',
  unknown: '未标记',
};

const scenarioOptions = computed(() =>
  Object.entries(SCENARIO_LABELS).map(([value, label]) => ({ value, label })),
);
const scenarioLabel = (s: string) => SCENARIO_LABELS[s] ?? s;

const searchForm = reactive({
  scenario: '' as string,
  status: '' as '' | 'success' | 'error' | 'timeout',
  callerQQ: '',
  keyword: '',
});
const dateRange = ref<[string, string] | null>(null);

const pagination = reactive({ page: 1, pageSize: 20, total: 0 });
const tableData = ref<AICallLog[]>([]);
const loading = ref(false);

const stats = ref<AICallStats>();
const statsLoading = ref(false);

const detailVisible = ref(false);
const detail = ref<AICallLog>();

const weekFailures = computed(() => {
  if (!stats.value) return 0;
  const total = stats.value.byStatus.reduce((acc, s) => acc + s.count, 0);
  const ok = stats.value.byStatus.find((s) => s.status === 'success')?.count ?? 0;
  return total - ok;
});

const trendOption = computed(() => {
  if (!stats.value?.trend?.length) return null;
  const dates = stats.value.trend.map((t) => t.date.slice(5)); // MM-DD
  const success = stats.value.trend.map((t) => t.success);
  const failed = stats.value.trend.map((t) => t.error);
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['成功', '失败'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: dates, boundaryGap: false },
    yAxis: { type: 'value', name: '调用数' },
    series: [
      {
        name: '成功',
        type: 'line',
        smooth: true,
        data: success,
        itemStyle: { color: '#67C23A' },
        areaStyle: { opacity: 0.2 },
      },
      {
        name: '失败',
        type: 'line',
        smooth: true,
        data: failed,
        itemStyle: { color: '#F56C6C' },
      },
    ],
  };
});

const scenarioOption = computed(() => {
  if (!stats.value?.byScenario?.length) return null;
  const items = stats.value.byScenario;
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (p: any) => {
        const i = p[0];
        const item = items[i.dataIndex];
        if (!item) return i.axisValue;
        return `${i.axisValue}<br/>调用 ${item.count} 次<br/>平均 ${formatMs(item.avgDurationMs)}`;
      },
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: items.map((i) => scenarioLabel(i.scenario)),
      inverse: true,
    },
    series: [
      {
        type: 'bar',
        data: items.map((i) => i.count),
        itemStyle: { color: '#409EFF' },
      },
    ],
  };
});

function formatMs(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return '-';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

async function loadStats() {
  statsLoading.value = true;
  try {
    stats.value = await getAICallStats();
  } catch (err) {
    console.error('加载统计失败:', err);
  } finally {
    statsLoading.value = false;
  }
}

async function loadData() {
  loading.value = true;
  try {
    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      scenario: searchForm.scenario || undefined,
      status: searchForm.status || undefined,
      callerQQ: searchForm.callerQQ || undefined,
      keyword: searchForm.keyword || undefined,
      startDate: dateRange.value?.[0],
      endDate: dateRange.value?.[1],
    };
    const response = await getAICalls(params);
    tableData.value = response.items;
    pagination.total = response.total;
  } catch (err) {
    console.error('加载列表失败:', err);
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchForm.scenario = '';
  searchForm.status = '';
  searchForm.callerQQ = '';
  searchForm.keyword = '';
  dateRange.value = null;
  handleSearch();
}

function handlePageChange() {
  loadData();
}

async function viewDetail(row: AICallLog) {
  try {
    detail.value = await getAICallDetail(row.id);
    detailVisible.value = true;
  } catch (err) {
    console.error('加载详情失败:', err);
  }
}

onMounted(() => {
  loadStats();
  loadData();
});
</script>

<style scoped>
.page-stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stats-row {
  margin-bottom: 0;
}

.stat-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  height: 100%;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin-top: 6px;
}

.stat-sub {
  font-size: 12px;
  color: var(--text-color-placeholder);
  margin-top: 4px;
}

.content-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  padding: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.card-header h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: var(--text-color-primary);
}

.chart-container {
  height: 300px;
}

.search-form {
  margin-bottom: 16px;
}

.text-placeholder {
  color: var(--text-color-placeholder);
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.detail {
  padding: 0 4px;
}

.detail-h {
  margin: 18px 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.detail-pre {
  background: var(--fill-color-light);
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color-regular);
  max-height: 320px;
  overflow-y: auto;
  margin: 0;
}
</style>
