import { onMounted, ref } from 'vue'
import {
  DEFAULT_PALETTE,
  findLook,
  isPaletteKey,
  type GradientKey,
  type PaletteKey,
} from '@/data/palettes'
import {
  DEFAULT_MASCOT,
  findMascot,
  isMascotKey,
  mascotDataUrl,
  type MascotKey,
} from '@/data/mascot'

export type ThemeChoice = 'light' | 'dark' | 'system'
/** รูปแบบเว็บ: ปกติ มินิมอล หรือน่ารัก (มีตัวการ์ตูน) — แยกจากสีเว็บ เลือกคู่กันได้อิสระ */
export type SiteStyle = 'normal' | 'minimal' | 'cute'

const STORAGE_KEY = 'taxflow_theme'
const PALETTE_KEY = 'taxflow_palette'
const LOOK_KEY = 'taxflow_look'
const STYLE_KEY = 'taxflow_style'
const MASCOT_KEY = 'taxflow_mascot'

const SITE_STYLES: SiteStyle[] = ['normal', 'minimal', 'cute']

/** ผู้ใช้เลือกไว้อะไร — เก็บนอก setup เพื่อให้ทุกคอมโพเนนต์เห็นค่าเดียวกัน */
const choice = ref<ThemeChoice>('system')
/** ธีมที่ใช้จริงหลังแปลค่า system เป็น light/dark แล้ว */
const resolved = ref<'light' | 'dark'>('light')
/** ชุดสีหลักของเว็บ */
const palette = ref<PaletteKey>(DEFAULT_PALETTE)
/** สีไล่โทน — null คือสีพื้นเรียบ */
const gradient = ref<GradientKey | null>(null)
/** สีเว็บที่เลือกจากเมนู — null คือยังไม่เคยเลือก (ใช้ค่าตั้งต้นตามเครื่อง) */
const look = ref<string | null>(null)
/** รูปแบบเว็บ */
const siteStyle = ref<SiteStyle>('normal')
/** ตัวการ์ตูนของธีมน่ารัก */
const mascot = ref<MascotKey>(DEFAULT_MASCOT)

let listening = false

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
}

function apply(): void {
  const next = choice.value === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice.value
  const root = document.documentElement
  resolved.value = next
  root.setAttribute('data-theme', next)
  root.setAttribute('data-palette', palette.value)
  if (gradient.value) root.setAttribute('data-gradient', gradient.value)
  else root.removeAttribute('data-gradient')
  root.setAttribute('data-style', siteStyle.value)
  // ตัวการ์ตูนของธีมน่ารัก ให้ CSS หยิบไปใช้แทนไอคอนในหน้าว่างทุกหน้า
  root.setAttribute('data-mascot', mascot.value)
  root.style.setProperty('--mascot', mascotDataUrl(mascot.value))
  root.style.setProperty('--cute-pattern', findMascot(mascot.value).pattern)
  root.style.colorScheme = next
}

function save(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* บันทึกไม่ได้ก็ยังใช้งานได้ในเซสชันนี้ */
  }
}

/**
 * อ่านค่าที่เคยเลือกแล้วใส่ธีมทันที — เรียกใน main.ts ก่อน mount
 * หน้าเว็บจะได้ไม่กะพริบเป็นสีตั้งต้นก่อนเปลี่ยนเป็นสีที่ผู้ใช้เลือก
 */
export function initTheme(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') choice.value = saved
    const savedPalette = localStorage.getItem(PALETTE_KEY)
    if (isPaletteKey(savedPalette)) palette.value = savedPalette
    const savedStyle = localStorage.getItem(STYLE_KEY) as SiteStyle | null
    if (savedStyle && SITE_STYLES.includes(savedStyle)) siteStyle.value = savedStyle
    const savedMascot = localStorage.getItem(MASCOT_KEY)
    if (isMascotKey(savedMascot)) mascot.value = savedMascot
    const savedLook = findLook(localStorage.getItem(LOOK_KEY))
    if (savedLook) {
      look.value = savedLook.key
      gradient.value = savedLook.gradient ?? null
    }
  } catch {
    /* อ่าน localStorage ไม่ได้ — ใช้ค่าเริ่มต้น */
  }
  apply()

  if (!listening && typeof window !== 'undefined') {
    listening = true
    // ตามการตั้งค่าของเครื่องต่อไปเรื่อย ๆ ตราบใดที่ผู้ใช้ยังเลือก system
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (choice.value === 'system') apply()
    })
  }
}

/**
 * เลือกสีเว็บ สลับสว่าง/มืด และจำค่าที่ผู้ใช้เลือกไว้
 * ค่าเริ่มต้นเป็น system เพื่อให้ตรงกับการตั้งค่าของเครื่อง
 */
export function useTheme() {
  onMounted(initTheme)

  function setTheme(next: ThemeChoice): void {
    choice.value = next
    save(STORAGE_KEY, next)
    apply()
  }

  function setPalette(next: PaletteKey): void {
    palette.value = next
    save(PALETTE_KEY, next)
    apply()
  }

  /** เลือกสีเว็บหนึ่งแบบ เช่น "ดำชมพู" = โหมดมืด + ชุดชมพู + พื้นหลังไล่โทน */
  function setLook(key: string): void {
    const option = findLook(key)
    if (!option) return
    look.value = option.key
    gradient.value = option.gradient ?? null
    choice.value = option.mode
    palette.value = option.palette
    save(LOOK_KEY, option.key)
    save(STORAGE_KEY, option.mode)
    save(PALETTE_KEY, option.palette)
    apply()
  }

  /**
   * ปุ่มพระอาทิตย์/พระจันทร์บนหัวเว็บ: สลับสว่าง/มืดโดยคงสีหลักไว้
   * สีไล่โทนแต่ละแบบออกแบบมาสำหรับโหมดเดียว จึงปิดไล่โทนเมื่อสลับ
   */
  function toggle(): void {
    if (gradient.value) {
      gradient.value = null
      look.value = null
      save(LOOK_KEY, null)
    }
    setTheme(resolved.value === 'dark' ? 'light' : 'dark')
  }

  /** เลือกตัวการ์ตูน — เปิดธีมน่ารักให้ด้วย เพราะตัวการ์ตูนแสดงเฉพาะในธีมนี้ */
  function setMascot(next: MascotKey): void {
    if (!isMascotKey(next)) return
    mascot.value = next
    save(MASCOT_KEY, next)
    if (siteStyle.value !== 'cute') {
      siteStyle.value = 'cute'
      save(STYLE_KEY, 'cute')
    }
    apply()
  }

  function setStyle(next: SiteStyle): void {
    if (!SITE_STYLES.includes(next)) return
    siteStyle.value = next
    save(STYLE_KEY, next)
    apply()
  }

  return {
    choice,
    resolved,
    palette,
    gradient,
    look,
    siteStyle,
    mascot,
    setMascot,
    setTheme,
    setPalette,
    setLook,
    setStyle,
    toggle,
  }
}
