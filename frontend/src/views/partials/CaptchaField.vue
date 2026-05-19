<template>
  <div class="field">
    <label class="label">Captcha</label>
    <div class="is-flex is-align-items-center captcha-field">
      <button type="button" class="button is-light captcha-button" @click="reload">
        <img :src="captchaUrl" alt="Captcha" class="captcha-image" />
      </button>
      <input
        :value="modelValue"
        class="input"
        placeholder="Texto del captcha"
        required
        @input="$emit('update:modelValue', $event.target.value)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  modelValue: { type: String, required: true },
  refreshKey: { type: Number, default: 0 },
});

defineEmits(["update:modelValue"]);

const nonce = ref(Date.now());
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
const captchaUrl = computed(() => `${apiBaseUrl}/auth/captcha?${nonce.value}`);

function reload() {
  nonce.value = Date.now();
}

watch(
  () => props.refreshKey,
  () => reload(),
);
</script>

<style scoped>
.captcha-field {
  gap: 0.75rem;
}

.captcha-button {
  height: auto;
  padding: 0.35rem;
}

.captcha-image {
  display: block;
  height: 72px;
  width: 216px;
}
</style>
