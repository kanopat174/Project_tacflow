import { ref } from 'vue'

/** เหตุการณ์ beforeinstallprompt ยังไม่มีใน type มาตรฐาน */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferred = ref<InstallPromptEvent | null>(null)
const installed = ref(false)
let listening = false

/**
 * ลงทะเบียน service worker (เฉพาะ build จริง ตอน dev จะได้ไม่ติดแคชไฟล์เก่า)
 * และเก็บเหตุการณ์ "ติดตั้งแอป" ไว้ให้ปุ่มติดตั้งเรียกใช้ทีหลัง
 */
export function setupPwa(): void {
  if (typeof window === 'undefined' || listening) return
  listening = true

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred.value = event as InstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    installed.value = true
    deferred.value = null
  })
  installed.value = window.matchMedia?.('(display-mode: standalone)').matches ?? false

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* ลงทะเบียนไม่ได้ เว็บยังใช้งานแบบออนไลน์ได้ตามปกติ */
      })
    })
  }
}

export type InstallPlatform = 'ios' | 'android' | 'desktop'

/** ระบบของเครื่องนี้ — ใช้เลือกวิธีติดตั้งเองเมื่อเบราว์เซอร์ไม่มีหน้าต่างติดตั้งให้ */
export function installPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  // iPad รุ่นใหม่รายงานตัวเป็น Mac จึงดูจากจอสัมผัสร่วมด้วย
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

/**
 * วิธีติดตั้งเอง — iPhone/iPad ไม่มีเหตุการณ์ beforeinstallprompt เลย
 * ส่วน Android/คอม บางครั้งเบราว์เซอร์ก็ยังไม่ยิงเหตุการณ์ (เช่น เคยกดปิดไปแล้ว หรือไม่ใช่ Chrome)
 */
export function installHint(platform: InstallPlatform = installPlatform()): string {
  if (platform === 'ios')
    return 'บน iPhone/iPad: เปิดเว็บนี้ด้วย Safari แล้วกดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรชี้ขึ้น) เลื่อนลงแล้วเลือก "เพิ่มไปยังหน้าจอโฮม"'
  if (platform === 'android')
    return 'บน Android: เปิดด้วย Chrome แล้วกดเมนู ⋮ มุมขวาบน เลือก "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"'
  return 'บนคอม: ใช้ Chrome หรือ Edge แล้วกดไอคอนติดตั้งท้ายช่อง URL หรือเมนู ⋮ → "ติดตั้ง Jodwise"'
}

export function usePwaInstall() {
  async function install(): Promise<boolean> {
    if (!deferred.value) return false
    await deferred.value.prompt()
    const choice = await deferred.value.userChoice
    deferred.value = null
    return choice.outcome === 'accepted'
  }

  return { canInstall: deferred, installed, install, hint: installHint }
}
