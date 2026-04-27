<template>
  <div class="field">
    <label class="label">Captcha</label>
    <div class="is-flex is-align-items-center" style="gap: 0.75rem">
      <button type="button" class="button is-light" @click="reload">
        <img :src="captchaUrl" alt="Captcha" style="height: 38px" />
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
const captchaUrl = computed(() => `http://localhost:3001/api/auth/captcha?${nonce.value}`);

function reload() {
  nonce.value = Date.now();
}

watch(
  () => props.refreshKey,
  () => reload(),
);
</script>
