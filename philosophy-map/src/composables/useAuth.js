// 登录状态管理 composable
import { ref } from 'vue';
import { auth, token as tokenApi } from '../api';

// 模块级状态：多个组件共享同一个 user ref，但每个实例的 checkAuth 独立去重
const user = ref(null);
// 防止多个组件同时挂载时并发打 /api/auth/me
const checkingPromise = ref(null);

export function useAuth() {
  async function checkAuth() {
    // 已有 token 且 user 已就绪 —— 直接返回
    if (user.value) return;
    // 已有进行中的 check —— 复用其 Promise
    if (checkingPromise.value) return checkingPromise.value;
    // 没 token —— 直接置空
    if (!tokenApi.get()) {
      user.value = null;
      return;
    }
    // 启动一次 check
    checkingPromise.value = (async () => {
      try {
        const u = await auth.me();
        user.value = u;
      } catch (e) {
        // token 失效 —— 清掉
        tokenApi.set(null);
        user.value = null;
      } finally {
        checkingPromise.value = null;
      }
    })();
    return checkingPromise.value;
  }

  async function login(email, password) {
    const res = await auth.login(email, password);
    tokenApi.set(res.token);
    user.value = res.user;
    return res.user;
  }

  async function register(email, password, name) {
    const res = await auth.register(email, password, name);
    tokenApi.set(res.token);
    user.value = res.user;
    return res.user;
  }

  function logout() {
    tokenApi.set(null);
    user.value = null;
  }

  return { user, login, register, logout, checkAuth };
}
