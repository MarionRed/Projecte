<template>
  <main class="auth-page">
    <div class="auth-orbit auth-orbit-one"></div>
    <div class="auth-orbit auth-orbit-two"></div>

    <section class="auth-console">
      <div class="auth-visual">
        <div class="auth-brand-lockup">
          <h1>
            <span>Control</span>
            <span>d'accessos</span>
          </h1>
          <i></i>
        </div>

        <div class="auth-illustration" aria-hidden="true">
          <div class="identity-node identity-user"><span></span></div>
          <div class="identity-node identity-server"><span></span></div>
          <div class="identity-node identity-shield"><span></span></div>
          <div class="identity-node identity-fingerprint"><span></span></div>

          <div class="lock-radar">
            <div class="lock-ring lock-ring-a"></div>
            <div class="lock-ring lock-ring-b"></div>
            <div class="lock-body">
              <div class="lock-shackle"></div>
              <div class="lock-case"><span></span></div>
            </div>
          </div>
        </div>

        <div class="auth-wave" aria-hidden="true"></div>
      </div>

      <div class="auth-card">
        <div class="auth-tabs" role="tablist" aria-label="Authentication modes">
          <button
            v-for="tab in authTabs"
            :key="tab.key"
            type="button"
            class="auth-tab"
            :class="{ active: activeMode === tab.key }"
            :disabled="(passwordReset.pending || mfa.pending) && tab.key !== 'login'"
            @click="setMode(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>

        <div v-if="activeMode === 'login' || activeMode === 'mfa'" class="auth-steps">
          <span :class="{ active: activeMode === 'login', done: mfa.pending }">Paso 1 · Credenciales</span>
          <span :class="{ active: activeMode === 'mfa' }">Paso 2 · MFA</span>
        </div>

        <Transition name="auth-swap" mode="out-in">
          <form v-if="activeMode === 'login'" key="login" class="auth-form" @submit.prevent="submitLogin">
            <div class="field">
              <label class="label">Usuario</label>
              <div class="input-shell">
                <span class="field-icon icon-user"></span>
                <input v-model="login.username" class="input auth-input" autocomplete="username" placeholder="Introduce tu usuario" required />
              </div>
            </div>

            <div class="field">
              <label class="label">Contrasena</label>
              <div class="input-shell">
                <span class="field-icon icon-lock"></span>
                <input
                  v-model="login.password"
                  class="input auth-input"
                  :type="showLoginPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="Introduce tu contrasena"
                  required
                />
                <button class="input-action" type="button" @click="showLoginPassword = !showLoginPassword">
                  {{ showLoginPassword ? "Ocultar" : "Ver" }}
                </button>
              </div>
            </div>

            <CaptchaField v-if="security.captchaOr2fa" v-model="login.captcha" :refresh-key="captchaRefresh" />

            <button class="button auth-submit is-fullwidth" :class="{ 'is-loading': loading }">
              Entrar
            </button>

            <button class="auth-link-button" type="button" @click="setMode('recovery')">
              Olvide mi contrasena
            </button>
          </form>

          <form v-else-if="activeMode === 'mfa'" key="mfa" class="auth-form" @submit.prevent="submitMfa">
            <div class="auth-form-head">
              <p class="auth-mode-label">MFA Required</p>
              <h2>Introduce tu codigo MFA</h2>
              <p class="auth-copy">Credenciales correctas para {{ mfa.username }}. Completa la verificacion TOTP.</p>
            </div>

            <div class="mfa-orb">
              <span></span>
            </div>

            <div class="field">
              <label class="label">Codigo MFA</label>
              <div class="input-shell">
                <span class="field-icon icon-shield"></span>
                <input v-model="mfa.twoFactorCode" class="input auth-input mfa-code-input" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" required />
              </div>
            </div>

            <button class="button auth-submit is-fullwidth" :class="{ 'is-loading': loading }">
              Verificar MFA
            </button>

            <button class="auth-link-button" type="button" @click="cancelMfa">
              Volver al login
            </button>
          </form>

          <form v-else-if="activeMode === 'register'" key="register" class="auth-form" @submit.prevent="submitRegister">
            <div class="auth-form-head">
              <p class="auth-mode-label">Registro</p>
              <h2>Create secure identity</h2>
              <p class="auth-copy">Register a new account</p>
            </div>

            <div class="field">
              <label class="label">Username</label>
              <div class="input-shell">
                <span class="field-icon icon-user"></span>
                <input v-model="register.username" class="input auth-input" autocomplete="username" placeholder="Nuevo usuario" required />
              </div>
            </div>

            <div class="field">
              <label class="label">Email</label>
              <div class="input-shell">
                <span class="field-icon icon-mail"></span>
                <input v-model="register.email" class="input auth-input" type="email" autocomplete="email" placeholder="correo@ejemplo.local" required />
              </div>
            </div>

            <div class="field">
              <label class="label">Contrasena</label>
              <div class="input-shell">
                <span class="field-icon icon-lock"></span>
                <input
                  v-model="register.password"
                  class="input auth-input"
                  :type="showRegisterPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="Crea una contrasena segura"
                  required
                />
                <button class="input-action" type="button" @click="showRegisterPassword = !showRegisterPassword">
                  {{ showRegisterPassword ? "Ocultar" : "Ver" }}
                </button>
              </div>
            </div>

            <div class="field">
              <label class="label">Confirmar contrasena</label>
              <div class="input-shell">
                <span class="field-icon icon-lock"></span>
                <input
                  v-model="register.confirmPassword"
                  class="input auth-input"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="Repite la contrasena"
                  required
                />
                <button class="input-action" type="button" @click="showConfirmPassword = !showConfirmPassword">
                  {{ showConfirmPassword ? "Ocultar" : "Ver" }}
                </button>
              </div>
            </div>

            <div class="password-meter">
              <div class="password-meter-top">
                <span>Fortaleza</span>
                <strong>{{ passwordStrengthLabel }}</strong>
              </div>
              <div class="password-meter-track">
                <div class="password-meter-fill" :style="{ width: `${passwordStrengthScore * 20}%` }"></div>
              </div>
              <div class="password-rules">
                <span v-for="rule in passwordRules" :key="rule.label" :class="{ ok: rule.ok }">
                  {{ rule.label }}
                </span>
              </div>
            </div>

            <CaptchaField v-if="security.captchaOr2fa" v-model="register.captcha" :refresh-key="captchaRefresh" />

            <button class="button auth-submit is-fullwidth" :class="{ 'is-loading': loading }">
              Crear usuario
            </button>
          </form>

          <form v-else-if="activeMode === 'recovery' && !passwordReset.pending" key="recovery" class="auth-form" @submit.prevent="requestRecovery">
            <div class="auth-form-head">
              <p class="auth-mode-label">Recovery</p>
              <h2>Recover your access</h2>
              <p class="auth-copy">Password reset request</p>
            </div>

            <div class="field">
              <label class="label">Email</label>
              <div class="input-shell">
                <span class="field-icon icon-mail"></span>
                <input v-model="recovery.emailOrUsername" class="input auth-input" type="email" autocomplete="email" placeholder="correo@ejemplo.local" required />
              </div>
            </div>

            <CaptchaField v-if="security.captchaOr2fa" v-model="recovery.captcha" :refresh-key="captchaRefresh" />

            <button class="button auth-submit is-fullwidth" :class="{ 'is-loading': loading }">
              Enviar enlace
            </button>

            <div v-if="recovery.devResetLink" class="auth-dev-link">
              <span>Modo desarrollo</span>
              <a :href="recovery.devResetLink">{{ recovery.devResetLink }}</a>
            </div>
          </form>

          <form v-else key="reset" class="auth-form" @submit.prevent="completePasswordReset">
            <div class="auth-form-head">
              <p class="auth-mode-label">Reset</p>
              <h2>Establecer nueva contrasena</h2>
              <p class="auth-copy">Completa la recuperacion de la cuenta</p>
            </div>

            <div class="field">
              <label class="label">Nueva contrasena</label>
              <div class="input-shell">
                <span class="field-icon icon-lock"></span>
                <input v-model="passwordReset.password" class="input auth-input" type="password" autocomplete="new-password" placeholder="Nueva contrasena segura" required />
              </div>
            </div>

            <CaptchaField v-if="security.captchaOr2fa" v-model="passwordReset.captcha" :refresh-key="captchaRefresh" />

            <div class="buttons">
              <button class="button auth-submit" :class="{ 'is-loading': loading }">Actualizar</button>
              <button class="button auth-secondary" type="button" @click="cancelPasswordReset">Cancelar</button>
            </div>
          </form>
        </Transition>

        <div v-if="message" class="auth-message" :class="`auth-message-${messageType}`">
          {{ message }}
        </div>

        <div v-if="registration.devVerificationLink" class="auth-dev-link">
          <span>Verificacion email · modo desarrollo</span>
          <a :href="registration.devVerificationLink">{{ registration.devVerificationLink }}</a>
        </div>

        <div v-if="registration.qrCodeUrl || passwordReset.qrCodeUrl" class="auth-qr">
          <p class="has-text-weight-semibold">QR 2FA</p>
          <img :src="registration.qrCodeUrl || passwordReset.qrCodeUrl" alt="QR 2FA" width="180" height="180" />
          <p class="is-size-7">Clave manual: <code>{{ registration.manualSecret || passwordReset.manualSecret }}</code></p>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { http } from "@/api/http";
import { useAuthStore } from "@/stores/auth";
import CaptchaField from "./partials/CaptchaField.vue";

const emit = defineEmits(["logged-in"]);
const auth = useAuthStore();
const loading = ref(false);
const message = ref("");
const messageType = ref("info");
const authMode = ref("login");
const showLoginPassword = ref(false);
const showRegisterPassword = ref(false);
const showConfirmPassword = ref(false);
const captchaRefresh = ref(0);
const registration = reactive({ qrCodeUrl: "", manualSecret: "", devVerificationLink: "" });
const security = reactive({ captchaOr2fa: true });

const authTabs = [
  { key: "login", label: "Iniciar sesion" },
  { key: "register", label: "Registro" },
  { key: "recovery", label: "Recuperar contrasena" },
];

const login = reactive({
  username: "admin",
  password: "Admin123!",
  captcha: "",
});

const mfa = reactive({
  pending: false,
  mfaToken: "",
  username: "",
  twoFactorCode: "",
});

const register = reactive({
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  captcha: "",
});

const recovery = reactive({
  emailOrUsername: "",
  captcha: "",
  devResetLink: "",
});

const passwordReset = reactive({
  pending: false,
  resetToken: "",
  password: "",
  captcha: "",
  qrCodeUrl: "",
  manualSecret: "",
});

const activeMode = computed(() => {
  if (mfa.pending) return "mfa";
  if (passwordReset.pending) return "recovery";
  return authMode.value;
});
const passwordRules = computed(() => [
  { label: "8 caracteres", ok: register.password.length >= 8 },
  { label: "Mayuscula", ok: /[A-Z]/.test(register.password) },
  { label: "Minuscula", ok: /[a-z]/.test(register.password) },
  { label: "Numero", ok: /\d/.test(register.password) },
  { label: "Simbolo", ok: /[^A-Za-z0-9]/.test(register.password) },
]);
const passwordStrengthScore = computed(() => passwordRules.value.filter((rule) => rule.ok).length);
const passwordStrengthLabel = computed(() => {
  if (passwordStrengthScore.value <= 1) return "Debil";
  if (passwordStrengthScore.value <= 3) return "Media";
  if (passwordStrengthScore.value === 4) return "Alta";
  return "Excelente";
});

function setMode(mode) {
  authMode.value = mode;
  message.value = "";
  messageType.value = "info";
  registration.qrCodeUrl = "";
  registration.manualSecret = "";
  registration.devVerificationLink = "";
  if (mode !== "recovery") recovery.devResetLink = "";
  if (mode === "login") cancelMfa(false);
}

function setMessage(value, type = "info") {
  message.value = value;
  messageType.value = type;
}

function resetCaptcha() {
  captchaRefresh.value += 1;
  login.captcha = "";
  register.captcha = "";
  recovery.captcha = "";
  passwordReset.captcha = "";
}

function cancelMfa(clearMessage = true) {
  mfa.pending = false;
  mfa.mfaToken = "";
  mfa.username = "";
  mfa.twoFactorCode = "";
  if (clearMessage) setMessage("");
}

async function submitLogin() {
  loading.value = true;
  setMessage("");
  try {
    const data = await auth.login({ ...login });
    if (data.passwordResetRequired) {
      passwordReset.pending = true;
      passwordReset.resetToken = data.resetToken;
      authMode.value = "recovery";
      resetCaptcha();
      return;
    }
    if (data.mfaRequired) {
      mfa.pending = true;
      mfa.mfaToken = data.mfaToken;
      mfa.username = data.user?.username || login.username;
      mfa.twoFactorCode = "";
      resetCaptcha();
      setMessage("Credenciales correctas. Completa el segundo factor.", "success");
      return;
    }
    emit("logged-in");
  } catch (err) {
    setMessage(err.response?.data?.message || "No se pudo iniciar sesion", "error");
    resetCaptcha();
  } finally {
    loading.value = false;
  }
}

async function submitMfa() {
  loading.value = true;
  setMessage("");
  try {
    await auth.verifyMfa({
      mfaToken: mfa.mfaToken,
      twoFactorCode: mfa.twoFactorCode,
    });
    cancelMfa(false);
    emit("logged-in");
  } catch (err) {
    setMessage(err.response?.data?.message || "No se pudo verificar MFA", "error");
    mfa.twoFactorCode = "";
  } finally {
    loading.value = false;
  }
}

async function completePasswordReset() {
  loading.value = true;
  setMessage("");
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
    authMode.value = "login";
    setMessage("Contrasena actualizada. Inicia sesion con la nueva contrasena.", "success");
    resetCaptcha();
  } catch (err) {
    setMessage(firstValidationError(err) || err.response?.data?.message || "No se pudo completar la recuperacion", "error");
    resetCaptcha();
  } finally {
    loading.value = false;
  }
}

async function requestRecovery() {
  loading.value = true;
  setMessage("");
  recovery.devResetLink = "";
  try {
    const { data } = await http.post("/auth/forgot-password", {
      emailOrUsername: recovery.emailOrUsername,
      captcha: recovery.captcha,
    });
    recovery.devResetLink = data.devResetLink || "";
    setMessage(data.message, "success");
    resetCaptcha();
  } catch (err) {
    setMessage(err.response?.data?.message || "No se pudo solicitar la recuperacion", "error");
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
  authMode.value = "login";
  resetCaptcha();
}

async function submitRegister() {
  loading.value = true;
  setMessage("");
  if (register.password !== register.confirmPassword) {
    loading.value = false;
    setMessage("Las contrasenas no coinciden.", "error");
    return;
  }
  if (passwordStrengthScore.value < 5) {
    loading.value = false;
    setMessage("La contrasena debe cumplir todos los criterios de seguridad.", "error");
    return;
  }

  try {
    const { data } = await http.post("/auth/register", {
      username: register.username,
      email: register.email,
      password: register.password,
      captcha: register.captcha,
    });
    registration.qrCodeUrl = data.qrCodeUrl;
    registration.manualSecret = data.manualSecret;
    registration.devVerificationLink = data.devVerificationLink || "";
    register.username = "";
    register.email = "";
    register.password = "";
    register.confirmPassword = "";
    authMode.value = "login";
    setMessage(data.message || "Identidad creada. Revisa la verificacion de email.", "success");
    resetCaptcha();
  } catch (err) {
    setMessage(firstValidationError(err) || err.response?.data?.message || "No se pudo registrar", "error");
    resetCaptcha();
  } finally {
    loading.value = false;
  }
}

function firstValidationError(err) {
  const fieldErrors = err.response?.data?.errors?.fieldErrors || {};
  return Object.values(fieldErrors).flat()[0] || "";
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("resetToken");
  const verifyEmailToken = params.get("verifyEmailToken");
  if (token) {
    passwordReset.pending = true;
    passwordReset.resetToken = token;
    authMode.value = "recovery";
  }
  if (verifyEmailToken) {
    verifyEmail(verifyEmailToken);
  }
});

async function verifyEmail(token) {
  loading.value = true;
  try {
    const { data } = await http.get("/auth/verify-email", { params: { token } });
    authMode.value = "login";
    setMessage(data.message, "success");
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (err) {
    setMessage(err.response?.data?.message || "No se pudo verificar el email", "error");
  } finally {
    loading.value = false;
  }
}
</script>
