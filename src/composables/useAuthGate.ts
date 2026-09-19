import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

/**
 * เส้นแบ่งฟีเจอร์ของเว็บนี้คือ "บันทึกข้อมูลลงบัญชีหรือไม่"
 *
 * ใช้ได้โดยไม่ต้องสมัคร — เครื่องคำนวณทุกหมวด คู่มือค่าลดหย่อน และการออกเอกสาร PDF
 * ต้องมีบัญชี — ยื่นแบบภาษี เก็บเอกสาร ประวัติการยื่น และสมุดบัญชี
 *
 * ผู้ที่ยังไม่สมัครยัง "เห็น" ทุกหน้าได้ เพื่อให้รู้ว่าได้อะไรบ้างก่อนตัดสินใจ
 * แต่ปุ่มที่เขียนข้อมูลจะถูกล็อกไว้และพาไปหน้าสมัครแทน
 */
export function useAuthGate() {
  const auth = useAuthStore()
  const toast = useToastStore()
  const router = useRouter()
  const route = useRoute()

  const isGuest = computed(() => !auth.isLoggedIn)
  const isMember = computed(() => auth.isLoggedIn)

  /**
   * เรียกก่อนทำสิ่งที่ต้องบันทึกข้อมูล
   * คืน true เมื่อทำต่อได้ และพาไปหน้าเข้าสู่ระบบพร้อมจำหน้าเดิมไว้เมื่อยังไม่ได้ล็อกอิน
   */
  function requireAuth(message = 'ฟีเจอร์นี้ต้องเข้าสู่ระบบก่อน'): boolean {
    if (auth.isLoggedIn) return true
    toast.error(message)
    router.push({ name: 'login', query: { next: route.fullPath } })
    return false
  }

  /** ลิงก์ไปหน้าสมัคร/เข้าสู่ระบบที่กลับมาหน้าเดิมได้หลังทำเสร็จ */
  const registerTo = computed(() => ({ name: 'register', query: { next: route.fullPath } }))
  const loginTo = computed(() => ({ name: 'login', query: { next: route.fullPath } }))

  return { isGuest, isMember, requireAuth, registerTo, loginTo }
}
