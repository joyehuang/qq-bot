<template>
  <el-container class="layout-container">
    <!-- 侧边栏 -->
    <el-aside :width="appStore.sidebarCollapsed ? '64px' : '200px'" class="layout-aside">
      <div class="logo-container">
        <span v-if="!appStore.sidebarCollapsed" class="logo-text">QQ Bot 管理</span>
        <span v-else class="logo-icon">QB</span>
      </div>

      <el-menu
        :default-active="currentRoute"
        :collapse="appStore.sidebarCollapsed"
        :collapse-transition="false"
        router
        class="sidebar-menu"
      >
        <el-menu-item
          v-for="item in menuItems"
          :key="item.path"
          :index="item.path"
        >
          <el-icon>
            <component :is="item.icon" />
          </el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 主内容区 -->
    <el-container class="main-container">
      <!-- 顶部导航栏 -->
      <el-header class="layout-header">
        <div class="header-left">
          <el-icon class="collapse-icon" @click="appStore.toggleSidebar">
            <Fold v-if="!appStore.sidebarCollapsed" />
            <Expand v-else />
          </el-icon>
          <span class="page-title">{{ currentPageTitle }}</span>
        </div>

        <div class="header-right">
          <!-- 暗色模式切换 -->
          <el-tooltip :content="appStore.isDark ? '切换到浅色模式' : '切换到暗色模式'">
            <el-icon class="header-icon" @click="appStore.toggleDark">
              <Moon v-if="!appStore.isDark" />
              <Sunny v-else />
            </el-icon>
          </el-tooltip>

          <!-- 用户信息 -->
          <el-dropdown @command="handleCommand">
            <div class="user-info">
              <el-icon><User /></el-icon>
              <span class="username">{{ authStore.username }}</span>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 页面内容 -->
      <el-main class="layout-main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  DataAnalysis,
  Calendar,
  User,
  Fold,
  Expand,
  Moon,
  Sunny,
  SwitchButton,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const appStore = useAppStore();

// 响应式布局：移动端自动折叠侧边栏
const handleResize = () => {
  const isMobile = window.innerWidth < 768;
  if (isMobile && !appStore.sidebarCollapsed) {
    appStore.setSidebarCollapsed(true);
  }
};

onMounted(() => {
  // 初始化时检查
  handleResize();
  // 监听窗口大小变化
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

// 菜单项配置
const menuItems = [
  {
    path: '/dashboard',
    title: '数据概览',
    icon: DataAnalysis,
  },
  {
    path: '/checkins',
    title: '打卡记录',
    icon: Calendar,
  },
  {
    path: '/users',
    title: '用户管理',
    icon: User,
  },
];

// 当前路由路径
const currentRoute = computed(() => {
  // 匹配一级路由
  const path = route.path;
  const matched = menuItems.find((item) => path.startsWith(item.path));
  return matched ? matched.path : '/dashboard';
});

// 当前页面标题
const currentPageTitle = computed(() => {
  return (route.meta.title as string) || '数据概览';
});

// 下拉菜单命令处理
const handleCommand = async (command: string) => {
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      });

      authStore.logout();
      ElMessage.success('已退出登录');
      router.push('/login');
    } catch {
      // 取消退出
    }
  }
};
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.layout-aside {
  background-color: var(--bg-color-secondary);
  border-right: 1px solid var(--border-color-lighter);
  transition: width 0.3s;
  overflow: hidden;
}

.logo-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-primary);
  border-bottom: 1px solid var(--border-color-lighter);
}

.logo-text {
  white-space: nowrap;
}

.logo-icon {
  font-size: 20px;
}

.sidebar-menu {
  border-right: none;
  background-color: var(--bg-color-secondary);
}

.main-container {
  display: flex;
  flex-direction: column;
}

.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background-color: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.collapse-icon {
  font-size: 20px;
  cursor: pointer;
  color: var(--text-color-regular);
  transition: color 0.3s;
}

.collapse-icon:hover {
  color: var(--color-primary);
}

.page-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-color-primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.header-icon {
  font-size: 20px;
  cursor: pointer;
  color: var(--text-color-regular);
  transition: color 0.3s;
}

.header-icon:hover {
  color: var(--color-primary);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.user-info:hover {
  background-color: var(--fill-color-light);
}

.username {
  font-size: 14px;
  color: var(--text-color-regular);
}

.layout-main {
  background-color: var(--bg-color-page);
  overflow-y: auto;
}

/* 页面切换动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
