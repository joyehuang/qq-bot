<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <h1>QQ Bot 管理后台</h1>
        <p>欢迎回来，请登录您的账户</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            size="large"
            :prefix-icon="User"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            clearable
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="login-button"
            @click="handleLogin"
          >
            {{ loading ? '登录中...' : '登录' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">
        <p>QQ Bot 打卡系统管理后台 v1.0</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, FormInstance, FormRules } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

// 表单引用
const formRef = ref<FormInstance>();

// 表单数据
const form = reactive({
  username: '',
  password: '',
});

// 加载状态
const loading = ref(false);

// 表单验证规则
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' },
  ],
};

// 登录处理
const handleLogin = async () => {
  if (!formRef.value) return;

  try {
    // 验证表单
    await formRef.value.validate();

    loading.value = true;

    // 调用登录接口
    await authStore.login({
      username: form.username,
      password: form.password,
    });

    ElMessage.success('登录成功');

    // 跳转到目标页面或首页
    const redirect = (route.query.redirect as string) || '/dashboard';
    router.push(redirect);
  } catch (error: any) {
    console.error('登录失败:', error);
    // 错误信息已在 HTTP 拦截器中处理
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 420px;
  padding: 40px;
  background: var(--bg-color);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-header h1 {
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.login-header p {
  margin: 0;
  font-size: 14px;
  color: var(--text-color-secondary);
}

.login-form {
  margin-bottom: 24px;
}

.login-button {
  width: 100%;
  margin-top: 8px;
}

.login-footer {
  text-align: center;
  padding-top: 20px;
  border-top: 1px solid var(--border-color-lighter);
}

.login-footer p {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-placeholder);
}

/* 暗色模式下的渐变背景 */
html.dark .login-container {
  background: linear-gradient(135deg, #1e3a8a 0%, #4c1d95 100%);
}
</style>
