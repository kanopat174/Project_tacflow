/**
 * สีของเว็บที่ผู้ใช้เลือกได้
 *
 * "ลุค" หนึ่งแบบ = โหมดสว่าง/มืด + ชุดสีหลัก (palette) + สีไล่โทน (ถ้ามี)
 * ค่าสีจริงอยู่ใน style.css (`[data-palette]` และ `[data-gradient]`)
 * ที่นี่เก็บแค่ชื่อและภาพตัวอย่างสำหรับวาดปุ่มเลือกสี เพิ่มแบบใหม่ต้องเพิ่มทั้งสองที่
 */

export type PaletteKey =
  | 'mint'
  | 'lavender'
  | 'peach'
  | 'sky'
  | 'sakura'
  | 'butter'
  | 'matcha'
  | 'mono'
  | 'green'

const PALETTE_KEYS: PaletteKey[] = [
  'mint',
  'lavender',
  'peach',
  'sky',
  'sakura',
  'butter',
  'matcha',
  'mono',
  'green',
]

export const DEFAULT_PALETTE: PaletteKey = 'mint'

export function isPaletteKey(value: unknown): value is PaletteKey {
  return PALETTE_KEYS.includes(value as PaletteKey)
}

export type GradientKey =
  | 'black-pink'
  | 'black-blue'
  | 'black-purple'
  | 'black-green'
  | 'pink-blue'
  | 'purple-pink'
  | 'blue-green'
  | 'yellow-pink'

export interface LookOption {
  key: string
  label: string
  group: 'solid' | 'gradient'
  mode: 'light' | 'dark'
  palette: PaletteKey
  gradient?: GradientKey
  /** พื้นหลังของวงกลมตัวอย่าง */
  preview: string
}

export const LOOKS: LookOption[] = [
  { key: 'white', label: 'ขาว', group: 'solid', mode: 'light', palette: 'mono', preview: '#ffffff' },
  { key: 'black', label: 'ดำ', group: 'solid', mode: 'dark', palette: 'mono', preview: '#111113' },
  { key: 'pink', label: 'ชมพู', group: 'solid', mode: 'light', palette: 'sakura', preview: '#f7bfd4' },
  { key: 'blue', label: 'ฟ้า', group: 'solid', mode: 'light', palette: 'sky', preview: '#a9cff5' },
  { key: 'green', label: 'เขียว', group: 'solid', mode: 'light', palette: 'green', preview: '#a7e3b6' },
  { key: 'purple', label: 'ม่วง', group: 'solid', mode: 'light', palette: 'lavender', preview: '#c9b8f4' },
  { key: 'yellow', label: 'เหลือง', group: 'solid', mode: 'light', palette: 'butter', preview: '#f6d77a' },
  {
    key: 'black-pink',
    label: 'ดำชมพู',
    group: 'gradient',
    mode: 'dark',
    palette: 'sakura',
    gradient: 'black-pink',
    preview: 'linear-gradient(135deg, #111113 45%, #f472b6)',
  },
  {
    key: 'black-blue',
    label: 'ดำฟ้า',
    group: 'gradient',
    mode: 'dark',
    palette: 'sky',
    gradient: 'black-blue',
    preview: 'linear-gradient(135deg, #111113 45%, #60a5fa)',
  },
  {
    key: 'black-purple',
    label: 'ดำม่วง',
    group: 'gradient',
    mode: 'dark',
    palette: 'lavender',
    gradient: 'black-purple',
    preview: 'linear-gradient(135deg, #111113 45%, #c084fc)',
  },
  {
    key: 'black-green',
    label: 'ดำเขียว',
    group: 'gradient',
    mode: 'dark',
    palette: 'green',
    gradient: 'black-green',
    preview: 'linear-gradient(135deg, #111113 45%, #4ade80)',
  },
  {
    key: 'pink-blue',
    label: 'ชมพูฟ้า',
    group: 'gradient',
    mode: 'light',
    palette: 'sakura',
    gradient: 'pink-blue',
    preview: 'linear-gradient(135deg, #f7bfd4, #a9cff5)',
  },
  {
    key: 'purple-pink',
    label: 'ม่วงชมพู',
    group: 'gradient',
    mode: 'light',
    palette: 'lavender',
    gradient: 'purple-pink',
    preview: 'linear-gradient(135deg, #c9b8f4, #f7bfd4)',
  },
  {
    key: 'blue-green',
    label: 'ฟ้าเขียว',
    group: 'gradient',
    mode: 'light',
    palette: 'sky',
    gradient: 'blue-green',
    preview: 'linear-gradient(135deg, #a9cff5, #a7e3b6)',
  },
  {
    key: 'yellow-pink',
    label: 'เหลืองชมพู',
    group: 'gradient',
    mode: 'light',
    palette: 'butter',
    gradient: 'yellow-pink',
    preview: 'linear-gradient(135deg, #f6d77a, #f7bfd4)',
  },
]

export function findLook(key: unknown): LookOption | undefined {
  return LOOKS.find((look) => look.key === key)
}
