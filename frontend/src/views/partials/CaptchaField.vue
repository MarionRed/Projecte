<template>
  <div class="captcha-challenge">
    <div class="captcha-stage">
      <div class="captcha-header">
        <p>Security Challenge</p>
        <span>Prove you are human</span>
      </div>
      <button type="button" class="captcha-refresh" aria-label="Regenerar CAPTCHA" @click="reload">
        R
      </button>
      <button type="button" class="captcha-image-shell" @click="reload">
        <img :src="captchaUrl" alt="Captcha" class="captcha-image" />
      </button>
    </div>

    <div class="input-shell captcha-code-shell">
      <span class="field-icon icon-shield"></span>
      <input
        :value="modelValue"
        class="input captcha-input"
        placeholder="Introduce el codigo"
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
