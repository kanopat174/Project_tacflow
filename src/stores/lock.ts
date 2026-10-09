import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { checkPin, clearLockout, readLockout, readPin, recordFailure } from '@/services/appLock'
import { useAuthStore } from './auth'

/**
 * สถานะล็อกแอปด้วย PIN
 *  - เปิดเว็บใหม่ (กู้ session จาก token) และตั้ง PIN ไว้ → ล็อกทันที
 *  - เพิ่งล็อกอินด้วยรหัสผ่าน → ไม่ล็อก เพราะเพิ่งยืนยันตัวตนมา
 *  - ไม่ได้ใช้งาน หรือสลับไปแอปอื่นนานเกินเวลาที่ตั้ง → ล็อก
 */
export const useLockStore = defineStore('lock', () => {
  const auth = useAuthStore()
  const locked = ref(false)
  const hasPin = ref(false)
  let lastActive = Date.now()
  let hiddenAt: number | null = null

  function idleMs(): number {
    const record = auth.user ? readPin(auth.user.id) : null
    return record?.idleMinutes ? record.idleMinutes * 60_000 : 0
  }

  // flush sync: ต้องเห็นค่า auth.ready ณ ตอนที่ user เปลี่ยน — ก่อน restore เสร็จคือเปิดเว็บใหม่
  watch(
    () => auth.user?.id,
    (id) => {
      hasPin.value = !!id && !!readPin(id)
      locked.value = hasPin.value && !auth.ready
      lastActive = Date.now()
    },
    { immediate: true, flush: 'sync' },
  )

  function refreshPinState() {
    hasPin.value = !!auth.user && !!readPin(auth.user.id)
    if (!hasPin.value) locked.value = false
  }

  function lockNow() {
    if (hasPin.value) locked.value = true
  }

  function touch() {
    lastActive = Date.now()
  }

  function checkIdle(now = Date.now()) {
    const limit = idleMs()
    if (!locked.value && hasPin.value && limit && now - lastActive >= limit) locked.value = true
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    const limit = idleMs()
    if (hiddenAt !== null && hasPin.value && limit && Date.now() - hiddenAt >= limit) locked.value = true
    hiddenAt = null
    lastActive = Date.now()
  }

  let timer: ReturnType<typeof setInterval> | null = null
  const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const

  /** เริ่มจับการใช้งาน — เรียกครั้งเดียวจาก App */
  function start() {
    if (timer || typeof window === 'undefined') return
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, touch, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    timer = setInterval(() => checkIdle(), 15_000)
  }

  function stop() {
    for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, touch)
    document.removeEventListener('visibilitychange', onVisibility)
    if (timer) clearInterval(timer)
    timer = null
  }

  /** ปลดล็อก — คืนข้อความ error ภาษาไทย หรือ null เมื่อสำเร็จ */
  async function unlock(pin: string): Promise<string | null> {
    const user = auth.user
    if (!user) return null
    const lockout = readLockout(user.id)
    const wait = lockout.until - Date.now()
    if (wait > 0) return `ใส่ PIN ผิดหลายครั้ง รออีก ${Math.ceil(wait / 1000)} วินาที`
    if (await checkPin(user.id, pin)) {
      clearLockout(user.id)
      locked.value = false
      lastActive = Date.now()
      return null
    }
    const state = recordFailure(user.id)
    const nextWait = state.until - Date.now()
    return nextWait > 0
      ? `PIN ไม่ถูกต้อง ใส่ผิด ${state.fails} ครั้งแล้ว รอ ${Math.ceil(nextWait / 1000)} วินาทีก่อนลองใหม่`
      : 'PIN ไม่ถูกต้อง'
  }

  return { locked, hasPin, refreshPinState, lockNow, checkIdle, start, stop, unlock, touch }
})
