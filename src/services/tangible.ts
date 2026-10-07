/**
 * แปลงจำนวนเงินเป็นของที่จับต้องได้ — "ประหยัดภาษี 4,200 บาท = ชานมไข่มุก 84 แก้ว"
 * ราคาเป็นราคาโดยประมาณเพื่อความสนุก ไม่ได้อ้างอิงราคาจริงของร้านใด
 */

export interface TangibleItem {
  key: string
  emoji: string
  /** หน่วยนับ เช่น แก้ว จาน */
  unit: string
  label: string
  price: number
}

export const TANGIBLE_ITEMS: TangibleItem[] = [
  { key: 'bubbleTea', emoji: '🧋', unit: 'แก้ว', label: 'ชานมไข่มุก', price: 50 },
  { key: 'chickenRice', emoji: '🍛', unit: 'จาน', label: 'ข้าวมันไก่', price: 50 },
  { key: 'skytrain', emoji: '🚆', unit: 'เที่ยว', label: 'รถไฟฟ้า', price: 45 },
  { key: 'movie', emoji: '🎬', unit: 'ที่นั่ง', label: 'ตั๋วหนัง', price: 220 },
  { key: 'mookata', emoji: '🥓', unit: 'มื้อ', label: 'หมูกระทะ', price: 300 },
  { key: 'massage', emoji: '💆', unit: 'ชั่วโมง', label: 'นวดไทย', price: 350 },
  { key: 'concert', emoji: '🎤', unit: 'ใบ', label: 'บัตรคอนเสิร์ต', price: 3_500 },
  { key: 'flight', emoji: '✈️', unit: 'เที่ยว', label: 'ตั๋วเครื่องบินไปเชียงใหม่', price: 2_000 },
  { key: 'phone', emoji: '📱', unit: 'เครื่อง', label: 'มือถือรุ่นใหม่', price: 35_000 },
]

export interface Tangible {
  item: TangibleItem
  count: number
  text: string
}

/**
 * เลือกของที่จำนวนออกมาดูน่าตื่นเต้นที่สุด คือได้ 3–300 ชิ้น
 * ถ้าหลายชิ้นเข้าเกณฑ์ เลือกแบบคงที่ตาม seed ให้แต่ละที่ได้ของไม่ซ้ำกันแต่ไม่สุ่มเปลี่ยนทุกครั้งที่วาดใหม่
 */
export function toTangible(amount: number, seed = 0): Tangible | null {
  if (!(amount >= 45)) return null
  const fits = TANGIBLE_ITEMS.filter((i) => {
    const n = Math.floor(amount / i.price)
    return n >= 3 && n <= 300
  })
  const pool = fits.length ? fits : TANGIBLE_ITEMS.filter((i) => amount >= i.price)
  if (!pool.length) return null
  const item = pool[Math.abs(Math.floor(seed)) % pool.length]!
  const count = Math.floor(amount / item.price)
  return { item, count, text: `${item.label} ${count.toLocaleString('th-TH')} ${item.unit}` }
}
