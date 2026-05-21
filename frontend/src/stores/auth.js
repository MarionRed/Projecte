import { defineStore } from "pinia";
import { http } from "@/api/http";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    loading: false,
  }),
  actions: {
    async loadMe() {
      try {
        const { data } = await http.get("/auth/me");
        this.user = data.user;
      } catch (err) {
        this.user = null;
      }
    },
    async login(payload) {
      const { data } = await http.post("/auth/login", payload);
      if (!data.passwordResetRequired && !data.mfaRequired) {
        this.user = data.user;
      }
      return data;
    },
    async verifyMfa(payload) {
      const { data } = await http.post("/auth/verify-mfa", payload);
      this.user = data.user;
      return data;
    },
    async logout() {
      try {
        await http.post("/auth/logout");
      } finally {
        this.user = null;
      }
    },
  },
});
