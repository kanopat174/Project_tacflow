<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import AppIcon from '@/components/AppIcon.vue'

const auth = useAuthStore()
const toast = useToastStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const errorMessage = ref('')

const DEMO_ACCOUNTS = [
  { username: 'somchai', password: 'somchai123', label: 'สมาชิกทั่วไป' },
  { username: 'admin', password: 'admin1234', label: 'ผู้ดูแลระบบ' },
]

function fill(account: (typeof DEMO_ACCOUNTS)[number]) {
  username.value = account.username
  password.value = account.password
}

async function submit() {
  errorMessage.value = ''
  if (!username.value.trim() || !password.value) {
    errorMessage.value = 'กรุณากรอก username และรหัสผ่านให้ครบ'
    return
  }

  try {
    await auth.login({ username: username.value, password: password.value })
    toast.success(`ยินดีต้อนรับ ${auth.user?.fullName ?? ''}`)
    // กลับไปหน้าที่ผู้ใช้ตั้งใจเข้าก่อนถูกเด้งมาล็อกอิน
    router.push((route.query.next as string) || '/filing')
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
  }
}
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="auth-shell">
        <div class="section-head text-center">
          <span class="eyebrow">บัญชีสมาชิก</span>
          <h2>เข้าสู่ระบบ</h2>
          <p style="margin-inline: auto">
            เข้าสู่ระบบเพื่อบันทึกแบบร่าง เก็บสรุปแบบภาษี และสมุดบัญชีของคุณ
          </p>
        </div>

        <form class="card" novalidate @submit.prevent="submit">
          <div class="field">
            <label for="li-username">Username หรืออีเมล</label>
            <input
              id="li-username"
              v-model="username"
              type="text"
              name="username"
              autocomplete="username"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              placeholder="somchai หรือ somchai@example.com"
              autofocus
            />
          </div>

          <div class="field">
            <label for="li-password">รหัสผ่าน</label>
            <input
              id="li-password"
              v-model="password"
              type="password"
              name="password"
              autocomplete="current-password"
              autocapitalize="none"
              spellcheck="false"
            />
          </div>

          <p v-if="errorMessage" class="form-error" role="alert">
            <AppIcon name="alert" :size="18" />
            <span>{{ errorMessage }}</span>
          </p>

          <button class="btn btn-primary btn-block" type="submit" :disabled="auth.loading">
            {{ auth.loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ' }}
          </button>

          <div class="demo-accounts">
            บัญชีตัวอย่างสำหรับทดสอบ —
            <template v-for="(account, index) in DEMO_ACCOUNTS" :key="account.username">
              <span v-if="index > 0"> · </span>
              <b>{{ account.username }}</b> / {{ account.password }}
              <button type="button" @click="fill(account)">ใช้บัญชีนี้</button>
            </template>
          </div>
        </form>

        <p class="foot">
          ยังไม่มีบัญชี? <RouterLink to="/register">สมัครสมาชิกฟรี</RouterLink>
        </p>
      </div>
    </div>
  </main>
</template>
