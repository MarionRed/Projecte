<template>
  <main class="auth-page">
    <div class="auth-box">
      <section class="panel-box">
        <p class="is-size-7 has-text-weight-semibold has-text-grey">Control de Accesos</p>
        <h1 class="title is-3">Acceso al panel</h1>
        <p class="subtitle is-6">
          Gestion de identidades, grupos, recursos, permisos y auditoria.
        </p>

        <div class="notification is-light is-small">
          Usuario administrador: <strong>admin</strong> / <strong>Admin123!</strong>.
        </div>

        <form v-if="!passwordReset.pending" @submit.prevent="submitLogin">
          <div class="field">
            <label class="label">Usuario</label>
            <input v-model="login.username" class="input" autocomplete="username" required />
          </div>
          <div class="field">
            <label class="label">Contrasena</label>
            <input v-model="login.password" class="input" type="password" autocomplete="current-password" required />
          </div>
          <div v-if="security.captchaOr2fa" class="field">
            <label class="label">Codigo 2FA</label>
            <input v-model="login.twoFactorCode" class="input" placeholder="Solo si el usuario tiene 2FA" />
          </div>
          <CaptchaField v-if="security.captchaOr2fa" v-model="login.captcha" :refresh-key="captchaRefresh" />
          <button class="button is-primary is-fullwidth" :class="{ 'is-loading': loading }">Entrar</button>
        </form>

        <form v-else @submit.prevent="completePasswordReset">
          <div class="notification is-info is-light">
            Introduce una nueva contrasena para completar la recuperacion de la cuenta.
          </div>
          <div class="field">
            <label class="label">Nueva contrasena</label>
            <input v-model="passwordReset.password" class="input" type="password" autocomplete="new-password" required />
          </div>
          <CaptchaField v-if="security.captchaOr2fa" v-model="passwordReset.captcha" :refresh-key="captchaRefresh" />
          <div class="buttons">
            <button class="button is-primary" :class="{ 'is-loading': loading }">Actualizar</button>
            <button class="button is-light" type="button" @click="cancelPasswordReset">Cancelar</button>
          </div>
        </form>

        <div v-if="passwordReset.qrCodeUrl" class="mt-4">
          <p class="has-text-weight-semibold">Nuevo QR 2FA</p>
          <img :src="passwordReset.qrCodeUrl" alt="QR 2FA" width="180" height="180" />
          <p class="is-size-7">Clave manual: <code>{{ passwordReset.manualSecret }}</code></p>
        </div>
      </section>

      <section class="panel-box">
        <h2 class="title is-4">Registro</h2>
        <p class="subtitle is-6">Crea nuevas identidades para asignarlas a grupos y recursos.</p>

        <form @submit.prevent="submitRegister">
          <div class="field">
            <label class="label">Usuario</label>
            <input v-model="register.username" class="input" autocomplete="username" required />
          </div>
          <div class="field">
            <label class="label">Contrasena</label>
            <input v-model="register.password" class="input" type="password" autocomplete="new-password" required />
          </div>
          <CaptchaField v-if="security.captchaOr2fa" v-model="register.captcha" :refresh-key="captchaRefresh" />
          <button class="button is-link is-fullwidth" :class="{ 'is-loading': loading }">Crear usuario</button>
        </form>

        <div v-if="registration.qrCodeUrl" class="mt-4">
          <p class="has-text-weight-semibold">QR 2FA del nuevo usuario</p>
          <img :src="registration.qrCodeUrl" alt="QR 2FA" width="180" height="180" />
          <p class="is-size-7">Clave manual: <code>{{ registration.manualSecret }}</code></p>
        </div>
      </section>
    </div>

    <div v-if="message" class="notification is-warning mt-4">{{ message }}</div>
  </main>
</template>

<script setup>
import { reactive, ref } from "vue";
import { http } from "@/api/http";
import { useAuthStore } from "@/stores/auth";
import CaptchaField from "./partials/CaptchaField.vue";

const emit = defineEmits(["logged-in"]);
const auth = useAuthStore();
const loading = ref(false);
const message = ref("");
const captchaRefresh = ref(0);
const registration = reactive({ qrCodeUrl: "", manualSecret: "" });
const security = reactive({ captchaOr2fa: true });

const login = reactive({
  username: "admin",
  password: "Admin123!",
  twoFactorCode: "",
  captcha: "",
});

const register = reactive({
  username: "",
  password: "",
  captcha: "",
});

const passwordReset = reactive({
  pending: false,
  resetToken: "",
  password: "",
  captcha: "",
  qrCodeUrl: "",
  manualSecret: "",
});

function resetCaptcha() {
  captchaRefresh.value += 1;
  login.captcha = "";
  register.captcha = "";
  passwordReset.captcha = "";
}

async function submitLogin() {
  loading.value = true;
  message.value = "";
  try {
    const data = await auth.login({ ...login });
    if (data.passwordResetRequired) {
      passwordReset.pending = true;
      passwordReset.resetToken = data.resetToken;
      resetCaptcha();
      return;
    }
    emit("logged-in");
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo iniciar sesion";
    resetCaptcha();
  } finally {
    loading.value = false;
  }
}

async function completePasswordReset() {
  loading.value = true;
  message.value = "";
  try {
    const { data } = await http.post("/auth/complete-password-reset", {
      resetToken: passwordReset.resetToken,
      password: passwordReset.password,
      captcha: passwordReset.captcha,
    });
    passwordReset.pending = false;
    passwordReset.password = "";
    passwordReset.resetToken = "";
    passwordReset.qrCodeUrl = data.qrCodeUrl || "";
    passwordReset.manualSecret = data.manualSecret || "";
    login.password = "";
    login.twoFactorCode = "";
    message.value = "Contrasena actualizada. Inicia sesion con la nueva contrasena.";
    resetCaptcha();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo completar la recuperacion";
    resetCaptcha();
  } finally {
    loading.value = false;
  }
}

function cancelPasswordReset() {
  passwordReset.pending = false;
  passwordReset.resetToken = "";
  passwordReset.password = "";
  passwordReset.qrCodeUrl = "";
  passwordReset.manualSecret = "";
  resetCaptcha();
}

async function submitRegister() {
  loading.value = true;
  message.value = "";
  try {
    const { data } = await http.post("/auth/register", { ...register });
    registration.qrCodeUrl = data.qrCodeUrl;
    registration.manualSecret = data.manualSecret;
    register.username = "";
    register.password = "";
    resetCaptcha();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo registrar";
    resetCaptcha();
  } finally {
    loading.value = false;
  }
}
</script>
