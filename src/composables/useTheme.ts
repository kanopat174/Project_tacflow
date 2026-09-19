import { onMounted, ref } from 'vue'

export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'taxflow_theme'

/** ผู้ใช้เลือกไว้อะไร — เก็บนอก setup เพื่อให้ทุกคอมโพเนนต์เห็นค่าเดียวกัน */
const choice = ref<ThemeChoice>('system')
/** ธีมที่ใช้จริงหลังแปลค่า system เป็น light/dark แล้ว */
const resolved = ref<'light' | 'dark'>('light')

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
}

function apply(): void {
  const next = choice.value === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice.value
  resolved.value = next
  document.documentElement.setAttribute('data-theme', next)
  document.documentElement.style.colorScheme = next
}

/**
 * สลับธีมสว่าง/มืด และจำค่าที่ผู้ใช้เลือกไว้
 * ค่าเริ่มต้นเป็น system เพื่อให้ตรงกับการตั้งค่าของเครื่อง
 */
export function useTheme() {
  onMounted(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeChoice | null
      if (saved === 'light' || saved === 'dark' || saved === 'system') choice.value = saved
    } catch {
      /* อ่าน localStorage ไม่ได้ — ใช้ค่าเริ่มต้น */
    }
    apply()

    // ตามการตั้งค่าของเครื่องต่อไปเรื่อย ๆ ตราบใดที่ผู้ใช้ยังเลือก system
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (choice.value === 'system') apply()
    })
  })

  function setTheme(next: ThemeChoice): void {
    choice.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* บันทึกไม่ได้ก็ยังใช้งานได้ในเซสชันนี้ */
    }
    apply()
  }

  function toggle(): void {
    setTheme(resolved.value === 'dark' ? 'light' : 'dark')
  }

  return { choice, resolved, setTheme, toggle }
}
