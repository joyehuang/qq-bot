<template>
  <div class="page-container">
    <div class="content-card">
      <!-- 搜索筛选 -->
      <el-form :model="searchForm" :inline="true" class="search-form">
        <el-form-item label="关键词">
          <el-input
            v-model="searchForm.keyword"
            placeholder="搜索打卡内容"
            clearable
            @clear="handleSearch"
          />
        </el-form-item>

        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            @change="handleSearch"
          />
        </el-form-item>

        <el-form-item label="是否贷款">
          <el-select
            v-model="searchForm.isLoan"
            placeholder="全部"
            clearable
            @change="handleSearch"
          >
            <el-option label="普通打卡" :value="false" />
            <el-option label="贷款打卡" :value="true" />
          </el-select>
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
          <el-button @click="handleExport">
            <el-icon><Download /></el-icon>
            导出
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 数据表格 -->
      <el-table
        v-loading="loading"
        :data="tableData"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="id" label="ID" width="80" />

        <el-table-column label="用户" width="150">
          <template #default="{ row }">
            <div>
              <div class="user-nickname">{{ row.user?.nickname }}</div>
              <div class="user-qq">{{ row.user?.qqNumber }}</div>
            </div>
          </template>
        </el-table-column>

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

        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              type="danger"
              size="small"
              link
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
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
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, RefreshLeft, Download } from '@element-plus/icons-vue';
import { getCheckins, deleteCheckin, exportCheckins } from '@/api/checkins';
import { formatDuration, formatDateTime } from '@/utils/format';
import type { Checkin } from '@/types';

// 搜索表单
const searchForm = reactive({
  keyword: '',
  isLoan: undefined as boolean | undefined,
});

// 日期范围
const dateRange = ref<[string, string] | null>(null);

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

// 表格数据
const tableData = ref<Checkin[]>([]);
const loading = ref(false);

// 加载数据
const loadData = async () => {
  loading.value = true;
  try {
    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      isLoan: searchForm.isLoan,
      startDate: dateRange.value?.[0],
      endDate: dateRange.value?.[1],
    };

    const response = await getCheckins(params);
    tableData.value = response.items;
    pagination.total = response.total;
  } catch (error) {
    console.error('加载打卡记录失败:', error);
  } finally {
    loading.value = false;
  }
};

// 搜索
const handleSearch = () => {
  pagination.page = 1;
  loadData();
};

// 重置
const handleReset = () => {
  searchForm.keyword = '';
  searchForm.isLoan = undefined;
  dateRange.value = null;
  handleSearch();
};

// 导出
const handleExport = async () => {
  try {
    await exportCheckins({
      startDate: dateRange.value?.[0],
      endDate: dateRange.value?.[1],
    });
    ElMessage.success('导出成功');
  } catch (error) {
    console.error('导出失败:', error);
  }
};

// 分页变化
const handlePageChange = () => {
  loadData();
};

// 删除
const handleDelete = async (row: Checkin) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除这条打卡记录吗？`,
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    await deleteCheckin(row.id);
    ElMessage.success('删除成功');
    loadData();
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('删除失败:', error);
    }
  }
};

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.search-form {
  margin-bottom: 20px;
}

.user-nickname {
  font-size: 14px;
  color: var(--text-color-primary);
  margin-bottom: 4px;
}

.user-qq {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.text-placeholder {
  color: var(--text-color-placeholder);
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
