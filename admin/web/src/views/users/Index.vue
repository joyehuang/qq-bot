<template>
  <div class="page-container">
    <div class="content-card">
      <!-- 搜索 -->
      <el-form :model="searchForm" :inline="true" class="search-form">
        <el-form-item label="关键词">
          <el-input
            v-model="searchForm.keyword"
            placeholder="搜索昵称或QQ号"
            clearable
            @clear="handleSearch"
          />
        </el-form-item>

        <el-form-item label="排序">
          <el-select v-model="searchForm.sortBy" @change="handleSearch">
            <el-option label="创建时间" value="createdAt" />
            <el-option label="连续天数" value="streakDays" />
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

        <el-table-column label="用户信息" width="200">
          <template #default="{ row }">
            <div>
              <div class="user-nickname">{{ row.nickname }}</div>
              <div class="user-qq">QQ: {{ row.qqNumber }}</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="打卡统计" width="150">
          <template #default="{ row }">
            <div class="stat-item">
              打卡数: {{ row._count?.checkins || 0 }}
            </div>
            <div class="stat-item">
              总时长: {{ formatDuration(row.totalDuration || 0) }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="连续天数" width="100">
          <template #default="{ row }">
            <el-tag :type="row.streakDays >= 7 ? 'success' : 'info'">
              {{ row.streakDays }} 天
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="每日目标" width="120">
          <template #default="{ row }">
            <span v-if="row.dailyTarget">{{ formatDuration(row.dailyTarget) }}</span>
            <span v-else class="text-placeholder">无目标</span>
          </template>
        </el-table-column>

        <el-table-column label="负债" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.debt > 0" type="warning">
              {{ formatDuration(row.debt) }}
            </el-tag>
            <span v-else class="text-success">无负债</span>
          </template>
        </el-table-column>

        <el-table-column label="注册时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              link
              @click="handleViewDetail(row)"
            >
              查看详情
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
import { useRouter } from 'vue-router';
import { Search, RefreshLeft } from '@element-plus/icons-vue';
import { getUsers } from '@/api/users';
import { formatDuration, formatDateTime } from '@/utils/format';
import type { User } from '@/types';

const router = useRouter();

// 搜索表单
const searchForm = reactive({
  keyword: '',
  sortBy: 'createdAt' as 'createdAt' | 'streakDays',
});

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

// 表格数据
const tableData = ref<User[]>([]);
const loading = ref(false);

// 加载数据
const loadData = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      sortBy: searchForm.sortBy,
      sortOrder: 'desc' as const,
    };

    const response = await getUsers(params);
    tableData.value = response.items;
    pagination.total = response.total;
  } catch (error) {
    console.error('加载用户列表失败:', error);
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
  searchForm.sortBy = 'createdAt';
  handleSearch();
};

// 分页变化
const handlePageChange = () => {
  loadData();
};

// 查看详情
const handleViewDetail = (row: User) => {
  router.push(`/users/${row.id}`);
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
  font-weight: 500;
  color: var(--text-color-primary);
  margin-bottom: 4px;
}

.user-qq {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.stat-item {
  font-size: 12px;
  color: var(--text-color-regular);
  margin-bottom: 2px;
}

.text-success {
  color: var(--color-success);
  font-size: 12px;
}

.text-placeholder {
  color: var(--text-color-placeholder);
  font-size: 12px;
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
