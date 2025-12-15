<template>
  <router-view />
</template>

<script setup lang="ts">
import { watch, onMounted } from 'vue';
import { useAppStore } from '@/stores/app';

const appStore = useAppStore();

// 初始化暗黑模式
onMounted(() => {
  // 根据 store 的状态设置 Element Plus 暗黑模式
  if (appStore.isDark) {
    document.documentElement.classList.add('dark');
  }
});

// 监听暗黑模式变化
watch(
  () => appStore.isDark,
  (isDark) => {
    // Element Plus 暗黑模式通过在 html 元素添加 dark class 实现
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
);
</script>

<style scoped>
/* 应用级别的样式已在 styles/index.css 中定义 */
</style>
