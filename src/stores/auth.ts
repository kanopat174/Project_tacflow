import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, type LoginInput, type RegisterInput, type User } from '@/services/api'

/** ช่องที่เจ้าของบัญชีแก้เองได้ — role และ id ต้องแก้จากฝั่งเซิร์ฟเวอร์เท่านั้น */
export type ProfilePatch = Partial<Omit<User, 'id' | 'role' | 'createdAt' | 'username'>>

/** สถานะการเข้าสู่ระบบที่ใช้ร่วมกันทั้งเว็บ (header, route guard, หน้าโปรไฟล์) */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)
  /** true เมื่อเช็ค token ที่ค้างอยู่เสร็จแล้ว — route guard ต้องรอค่านี้ก่อนตัดสินใจ */
  const ready = ref(false)

  const isLoggedIn = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const initials = computed(() => (user.value?.fullName || user.value?.username || '?').trim().charAt(0))

  /** เรียกครั้งเดียวตอนเปิดเว็บ เพื่อกู้ session จาก token ที่เก็บไว้ */
  async function restore(): Promise<void> {
    if (ready.value) return
    user.value = await api.me()
    ready.value = true
  }

  async function login(input: LoginInput): Promise<void> {
    loading.value = true
    try {
      const result = await api.login(input)
      user.value = result.user
      ready.value = true
    } finally {
      loading.value = false
    }
  }

  async function register(input: RegisterInput): Promise<void> {
    loading.value = true
    try {
      const result = await api.register(input)
      user.value = result.user
      ready.value = true
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    await api.logout()
    user.value = null
  }

  async function updateProfile(patch: ProfilePatch): Promise<void> {
    user.value = await api.updateProfile(patch)
  }

  return {
    user,
    loading,
    ready,
    isLoggedIn,
    isAdmin,
    initials,
    restore,
    login,
    register,
    logout,
    updateProfile,
  }
})
