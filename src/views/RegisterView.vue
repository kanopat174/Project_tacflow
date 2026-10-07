<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import AppIcon from '@/components/AppIcon.vue'
import IdentityInput from '@/components/IdentityInput.vue'
import {
  CITIZEN_ID_ERROR,
  EMAIL_PATTERN,
  FULL_NAME_ERROR,
  PASSWORD_ERROR,
  PASSWORD_MIN_LENGTH,
  PHONE_ERROR,
  USERNAME_ERROR,
  USERNAME_HINT,
  isValidCitizenId,
  isValidFullName,
  isValidPhone,
  isValidUsername,
} from '@/data/accountRules'

const auth = useAuthStore()
const toast = useToastStore()
const router = useRouter()

const form = reactive({
  username: '',
  fullName: '',
  email: '',
  citizenId: '',
  phone: '',
  password: '',
  confirmPassword: '',
})

const submitted = ref(false)
const errorMessage = ref('')

/** ตรวจทุกช่องพร้อมกัน แต่แสดงผลเฉพาะหลังผู้ใช้กดสมัครแล้ว */
const errors = computed(() => {
  const result: Record<string, string> = {}
  if (!isValidUsername(form.username)) result.username = USERNAME_ERROR
  if (!isValidFullName(form.fullName)) result.fullName = FULL_NAME_ERROR
  if (!EMAIL_PATTERN.test(form.email.trim())) result.email = 'รูปแบบอีเมลไม่ถูกต้อง'
  if (!isValidCitizenId(form.citizenId)) result.citizenId = CITIZEN_ID_ERROR
  // เบอร์โทรไม่บังคับกรอก แต่ถ้ากรอกแล้วต้องถูกรูปแบบ
  if (form.phone.trim() && !isValidPhone(form.phone)) result.phone = PHONE_ERROR
  if (form.password.length < PASSWORD_MIN_LENGTH) result.password = PASSWORD_ERROR
  if (form.password !== form.confirmPassword) result.confirmPassword = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'
  return result
})

const isValid = computed(() => Object.keys(errors.value).length === 0)

async function submit() {
  submitted.value = true
  errorMessage.value = ''
  if (!isValid.value) return

  try {
    await auth.register({
      username: form.username,
      password: form.password,
      fullName: form.fullName,
      email: form.email,
      citizenId: form.citizenId,
      phone: form.phone,
    })
    toast.success('สมัครสมาชิกเรียบร้อย ตอบ 5 คำถามแล้วเริ่มใช้งานได้เลย')
    router.push('/welcome')
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : 'สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่'
  }
}
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="auth-shell">
        <div class="section-head text-center">
          <span class="eyebrow">บัญชีสมาชิก</span>
          <h2>สมัครสมาชิก</h2>
          <p style="margin-inline: auto">
            สมัครฟรี ใช้เก็บแบบร่าง เอกสารลดหย่อน และประวัติการยื่นของทุกปีภาษี
          </p>
        </div>

        <form class="card" novalidate @submit.prevent="submit">
          <div class="field" :class="{ invalid: submitted && errors.username }">
            <label for="rg-username">Username</label>
            <input
              id="rg-username"
              v-model="form.username"
              type="text"
              name="username"
              autocomplete="username"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              maxlength="20"
              placeholder="เช่น somchai.dev"
            />
            <p v-if="submitted && errors.username" class="error">{{ errors.username }}</p>
            <p v-else class="hint">{{ USERNAME_HINT }}</p>
          </div>

          <div class="field" :class="{ invalid: submitted && errors.fullName }">
            <label for="rg-fullname">ชื่อ-นามสกุล</label>
            <input
              id="rg-fullname"
              v-model="form.fullName"
              type="text"
              name="name"
              autocomplete="name"
              autocapitalize="words"
              :maxlength="100"
              placeholder="เช่น สมชาย ใจดี"
            />
            <p v-if="submitted && errors.fullName" class="error">{{ errors.fullName }}</p>
          </div>

          <div class="field" :class="{ invalid: submitted && errors.email }">
            <label for="rg-email">อีเมล</label>
            <input
              id="rg-email"
              v-model="form.email"
              type="email"
              name="email"
              autocomplete="email"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              placeholder="name@example.com"
            />
            <p v-if="submitted && errors.email" class="error">{{ errors.email }}</p>
          </div>

          <IdentityInput
            id="rg-citizen"
            v-model="form.citizenId"
            kind="citizenId"
            label="เลขประจำตัวประชาชน"
            hint="ใช้ยืนยันตัวตนกับแบบภาษีที่ยื่น"
            :error="submitted ? errors.citizenId : ''"
          />

          <IdentityInput
            id="rg-phone"
            v-model="form.phone"
            kind="phone"
            label="เบอร์โทรศัพท์"
            hint="ไม่บังคับกรอก ใช้สำหรับติดต่อกลับเรื่องแบบภาษี"
            :error="submitted ? errors.phone : ''"
          />

          <div class="field" :class="{ invalid: submitted && errors.password }">
            <label for="rg-password">รหัสผ่าน</label>
            <input
              id="rg-password"
              v-model="form.password"
              type="password"
              autocomplete="new-password"
            />
            <p v-if="submitted && errors.password" class="error">{{ errors.password }}</p>
            <p v-else class="hint">อย่างน้อย {{ PASSWORD_MIN_LENGTH }} ตัวอักษร</p>
          </div>

          <div class="field" :class="{ invalid: submitted && errors.confirmPassword }">
            <label for="rg-confirm">ยืนยันรหัสผ่าน</label>
            <input
              id="rg-confirm"
              v-model="form.confirmPassword"
              type="password"
              autocomplete="new-password"
            />
            <p v-if="submitted && errors.confirmPassword" class="error">
              {{ errors.confirmPassword }}
            </p>
          </div>

          <p v-if="errorMessage" class="form-error" role="alert">
            <AppIcon name="alert" :size="18" />
            <span>{{ errorMessage }}</span>
          </p>

          <button class="btn btn-primary btn-block" type="submit" :disabled="auth.loading">
            {{ auth.loading ? 'กำลังสมัคร...' : 'สมัครสมาชิก' }}
          </button>

          <p class="hint mt-2">
            ระบบต้นแบบนี้เก็บข้อมูลไว้ในเบราว์เซอร์ของคุณเท่านั้น อย่าใช้รหัสผ่านจริงที่ใช้กับบริการอื่น
          </p>
        </form>

        <p class="foot">
          มีบัญชีอยู่แล้ว? <RouterLink to="/login">เข้าสู่ระบบ</RouterLink>
        </p>
      </div>
    </div>
  </main>
</template>
