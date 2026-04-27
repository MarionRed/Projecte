<template>
  <LoginView v-if="!auth.user" @logged-in="refresh" />
  <DashboardView v-else @logout="logout" />
</template>

<script setup>
import { onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import LoginView from "@/views/LoginView.vue";
import DashboardView from "@/views/DashboardView.vue";

const auth = useAuthStore();

onMounted(() => {
  auth.loadMe();
});

function refresh() {
  auth.loadMe();
}

async function logout() {
  await auth.logout();
}
</script>
