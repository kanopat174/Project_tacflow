import { ref } from 'vue'

/** เหตุการณ์ beforeinstallprompt ยังไม่มีใน type มาตรฐาน */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferred = ref<InstallPromptEvent | null>(null)
const installed = ref(false)
let listening = false
/** ปุ่มติดตั้งที่กดก่อนเบราว์เซอร์ยิงเหตุการณ์ — รอเหตุการณ์อยู่ */
const waiters = new Set<() => void>()

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
    waiters.forEach((wake) => wake())
  })
  window.addEventListener('appinstalled', () => {
    installed.value = true
    deferred.value = null
  })
  installed.value =
    (window.matchMedia?.('(display-mode: standalone)').matches ?? false) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true

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

export type InAppBrowser = 'line' | 'facebook' | 'instagram' | 'tiktok' | 'other'

/**
 * เบราว์เซอร์ในแอปแชต/โซเชียล (เปิดลิงก์จาก LINE, Facebook ฯลฯ) ติดตั้งเว็บเป็นแอปไม่ได้เลย
 * ต้องพาไปเปิดใน Chrome/Safari ก่อน
 */
export function inAppBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): InAppBrowser | null {
  if (/\bLine\//i.test(ua)) return 'line'
  if (/FBAN|FBAV|FB_IAB|Messenger/i.test(ua)) return 'facebook'
  if (/Instagram/i.test(ua)) return 'instagram'
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok'
  if (/; wv\)/.test(ua)) return 'other'
  return null
}

/** เบราว์เซอร์นี้มีหน้าต่างติดตั้งของตัวเอง (Chrome, Edge, Samsung Internet บน Android/คอม) */
export function supportsInstallPrompt(): boolean {
  return typeof window !== 'undefined' && 'onbeforeinstallprompt' in window && !inAppBrowser()
}

/**
 * พาออกจากเบราว์เซอร์ในแอปไปเปิดหน้าเดิมในเบราว์เซอร์จริง
 *  - LINE: ใส่ ?openExternalBrowser=1 แล้ว LINE จะเปิดด้วยเบราว์เซอร์หลักของเครื่องเอง (ทั้ง iPhone และ Android)
 *  - Android อื่น ๆ: ใช้ลิงก์ intent:// เปิดด้วย Chrome
 *  - iPhone ในแอปอื่น: ไม่มีทางเปิด Safari จากหน้าเว็บได้ → คืน false ให้แสดงวิธีเปิดเองแทน
 */
export function openInRealBrowser(): boolean {
  const app = inAppBrowser()
  if (!app) return false
  const url = new URL(window.location.href)
  if (app === 'line') {
    url.searchParams.set('openExternalBrowser', '1')
    window.location.href = url.toString()
    return true
  }
  if (installPlatform() === 'android') {
    const target = `${url.host}${url.pathname}${url.search}`
    window.location.href = `intent://${target}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.toString())};end`
    return true
  }
  return false
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

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

/** รอเหตุการณ์ติดตั้งจากเบราว์เซอร์ไม่เกิน `ms` — Chrome มักยิงหลังเปิดหน้าไม่กี่วินาที */
function waitForPrompt(ms: number): Promise<InstallPromptEvent | null> {
  if (deferred.value) return Promise.resolve(deferred.value)
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer)
      waiters.delete(wake)
      resolve(deferred.value)
    }
    const timer = setTimeout(wake, ms)
    waiters.add(wake)
  })
}

export function usePwaInstall() {
  /**
   * เปิดหน้าต่างติดตั้งของเบราว์เซอร์ — ถ้าเบราว์เซอร์รองรับแต่ยังไม่ยิงเหตุการณ์ จะรอให้ก่อนสักครู่
   * คืน 'unavailable' เมื่อเครื่องนี้ติดตั้งจากปุ่มไม่ได้ (iPhone, เบราว์เซอร์ในแอป, Firefox ฯลฯ)
   */
  async function install(waitMs = 3500): Promise<InstallOutcome> {
    const event = deferred.value ?? (supportsInstallPrompt() ? await waitForPrompt(waitMs) : null)
    if (!event) return 'unavailable'
    // เรียก prompt() ได้ครั้งเดียวต่อเหตุการณ์ — เบราว์เซอร์จะยิงเหตุการณ์ใหม่ให้ถ้าผู้ใช้กดยกเลิก
    deferred.value = null
    await event.prompt()
    const choice = await event.userChoice
    if (choice.outcome === 'accepted') installed.value = true
    return choice.outcome
  }

  return { canInstall: deferred, installed, install, hint: installHint }
}
