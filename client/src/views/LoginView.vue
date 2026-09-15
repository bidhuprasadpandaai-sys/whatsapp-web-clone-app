<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const router = useRouter();
const authStore = useAuthStore();

const login = async () => {
  error.value = '';
  loading.value = true;
  try {
    const res = await fetch('http://localhost:8005/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    
    authStore.setAuth(data.user, data.token);
    router.push('/');
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="h-full flex items-center justify-center bg-[#222e35]">
    <div class="bg-[#111b21] p-8 rounded-lg shadow-lg w-full max-w-md text-[#e9edef]">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-light text-[#e9edef] mb-2">WhatsApp Web</h1>
        <p class="text-[#8696a0]">Sign in to your account</p>
      </div>
      <form @submit.prevent="login" class="space-y-4">
        <div>
          <input v-model="username" type="text" placeholder="Username" class="w-full bg-[#2a3942] text-[#d1d7db] px-4 py-3 rounded outline-none focus:border-[#00a884] border border-transparent transition-colors" required />
        </div>
        <div>
          <input v-model="password" type="password" placeholder="Password" class="w-full bg-[#2a3942] text-[#d1d7db] px-4 py-3 rounded outline-none focus:border-[#00a884] border border-transparent transition-colors" required />
        </div>
        <div v-if="error" class="text-[#f15c6d] text-sm">{{ error }}</div>
        <button type="submit" :disabled="loading" class="w-full bg-[#00a884] text-[#111b21] font-medium py-3 rounded hover:bg-[#008f6f] transition-colors flex justify-center items-center">
          <span v-if="loading" class="material-icons animate-spin mr-2">autorenew</span>
          Sign In
        </button>
      </form>
      <p class="mt-6 text-center text-[#8696a0] text-sm">
        Don't have an account? <router-link to="/signup" class="text-[#00a884] hover:underline">Sign up</router-link>
      </p>
    </div>
  </div>
</template>
