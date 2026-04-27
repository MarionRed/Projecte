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
      this.user = data.user;
    },
    async logout() {
      await http.post("/auth/logout");
      this.user = null;
    },
  },
});
