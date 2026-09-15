import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<any>(JSON.parse(localStorage.getItem('user') || 'null'));
  const token = ref<string | null>(localStorage.getItem('token'));
  const router = useRouter();

  const isAuthenticated = computed(() => !!token.value);

  const setAuth = (userData: any, userToken: string) => {
    user.value = userData;
    token.value = userToken;
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', userToken);
  };

  const logout = () => {
    user.value = null;
    token.value = null;
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    router.push('/login');
  };

  return { user, token, isAuthenticated, setAuth, logout };
});
