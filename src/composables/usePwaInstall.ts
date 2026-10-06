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

export function usePwaInstall() {
  async function install(): Promise<boolean> {
    if (!deferred.value) return false
    await deferred.value.prompt()
    const choice = await deferred.value.userChoice
    deferred.value = null
    return choice.outcome === 'accepted'
  }

  return { canInstall: deferred, installed, install }
}
