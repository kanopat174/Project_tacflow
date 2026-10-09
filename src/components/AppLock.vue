<script setup lang="ts">
/** หน้าจอล็อก PIN — บังทุกอย่างจนกว่าจะใส่ PIN ถูก หรือออกจากระบบ */
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { useLockStore } from '@/stores/lock'

const auth = useAuthStore()
const lock = useLockStore()
const router = useRouter()

const pin = ref('')
const error = ref('')
const checking = ref(false)
const input = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  await nextTick()
  input.value?.focus()
})

async function submit() {
  if (!pin.value || checking.value) return
  checking.value = true
  error.value = (await lock.unlock(pin.value)) ?? ''
  checking.value = false
  pin.value = ''
  if (error.value) input.value?.focus()
}

async function forgot() {
  if (!confirm('ออกจากระบบแล้วเข้าใหม่ด้วยรหัสผ่าน? PIN เดิมยังใช้ต่อได้')) return
  await auth.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="app-lock" role="dialog" aria-modal="true" aria-labelledby="lock-title">
    <form class="card app-lock-card" novalidate @submit.prevent="submit">
      <span class="ico-big"><AppIcon name="lock" :size="28" /></span>
      <h2 id="lock-title">ใส่ PIN เพื่อเปิด Jodwise</h2>
      <p class="muted small">{{ auth.user?.fullName || auth.user?.username }}</p>
      <input
        ref="input"
        v-model="pin"
        class="pin-input"
        type="password"
        inputmode="numeric"
        autocomplete="off"
        maxlength="6"
        aria-label="PIN"
        :aria-invalid="!!error"
        @input="pin = pin.replace(/\D/g, '')"
      />
      <p v-if="error" class="text-bad small" role="alert">{{ error }}</p>
      <button class="btn btn-primary btn-block" type="submit" :disabled="checking || pin.length < 4">
        {{ checking ? 'กำลังตรวจ...' : 'ปลดล็อก' }}
      </button>
      <button class="btn btn-ghost btn-sm mt-1" type="button" @click="forgot">ลืม PIN — ออกจากระบบ</button>
    </form>
  </div>
</template>

<style scoped>
.app-lock {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--bg);
}
.app-lock-card {
  width: min(360px, 100%);
  display: grid;
  gap: 10px;
  justify-items: center;
  text-align: center;
}
.app-lock-card h2 {
  margin: 0;
  font-size: 20px;
}
.pin-input {
  width: 100%;
  text-align: center;
  font-size: 28px;
  letter-spacing: 0.5em;
}
</style>
