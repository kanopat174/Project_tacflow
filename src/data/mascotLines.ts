/**
 * คำพูดเล่น ๆ ของตัวการ์ตูน — ตอนเอาเมาส์ไปชี้ จี้ ปล่อยไว้นาน และตอนตอบสนองต่อสิ่งที่ผู้ใช้ทำ
 * แต่ละตัวมีเสียงประจำตัวนำหน้า (อู๊ด ๆ เมี้ยว อ๊บ ๆ ...) ให้รู้สึกว่ามีนิสัยของตัวเอง
 */

import type { MascotKey } from './mascot'

export const MASCOT_SOUND: Record<MascotKey, string> = {
  piggy: 'อู๊ด ๆ',
  cat: 'เมี้ยว~',
  bear: 'ง่ำ ๆ',
  bunny: 'ปุ๊ก ๆ',
  frog: 'อ๊บ ๆ',
  chick: 'เจี๊ยบ ๆ',
}

/** เอาเมาส์ไปชี้ */
export const HOVER_LINES = [
  'วันนี้จดรายจ่ายหรือยังเอ่ย?',
  'มีอะไรให้ช่วยไหม แตะเลย!',
  'เก็บเงินเก่งขึ้นทุกวันนะ',
  'อย่าลืมเก็บใบเสร็จไว้ลดหย่อนนะ',
  'ลองพิมพ์ "กาแฟ 65" ที่ปุ่มบันทึกดูสิ',
  'ภาษีไม่ยากถ้ามีเพื่อนช่วย~',
  'กด Ctrl+K ค้นหาได้ทุกอย่างเลย',
]

/** จี้ (ส่ายเมาส์ไปมาบนตัว หรือแตะรัว ๆ บนมือถือ) */
export const TICKLE_LINES = ['ฮิ ๆ จั๊กจี้!', 'ฮ่า ๆ ๆ พอแล้ว~', 'อย่าจี้ตรงนั้นสิ!', 'คิกคัก ๆ']

/** ปล่อยไว้นานไม่ได้ทำอะไร */
export const IDLE_LINES = ['หาววว~ ง่วงจัง', 'ยังอยู่ไหมเอ่ย?', 'แอบงีบแป๊บนะ…']

export type MascotReaction =
  | 'save-income'
  | 'save-expense'
  | 'save-many'
  | 'delete'
  | 'undo'
  | 'party'
  | 'equip'
  | 'quiz-right'
  | 'quiz-wrong'
  | 'theme'

/** ท่าทางตอบสนอง: hop กระโดดเบา · jump กระโดดสูง · shake ส่ายหัว · spin หมุนตัว */
export const REACTIONS: Record<MascotReaction, { lines: string[]; move: 'hop' | 'jump' | 'shake' | 'spin' }> = {
  'save-income': { lines: ['เย้! เงินเข้า 💰', 'รวยขึ้นอีกแล้ว!', 'ปังมาก!'], move: 'jump' },
  'save-expense': { lines: ['จดแล้ว เก่งมาก!', 'บันทึกเรียบร้อย ✓', 'จดครบ รู้ทันเงินตัวเอง!'], move: 'hop' },
  'save-many': { lines: ['ว้าว นำเข้าเพียบเลย!', 'ประหยัดเวลาไปเยอะ!'], move: 'spin' },
  delete: { lines: ['เอ๊ะ ลบแล้วเหรอ', 'บ๊ายบาย~ รายการ'], move: 'shake' },
  undo: { lines: ['เย้ กลับมาแล้ว!', 'เกือบไปแล้ว~'], move: 'hop' },
  party: { lines: ['ปาร์ตี้! 🎉', 'เจอความลับแล้ว!', 'เต้นกัน~'], move: 'spin' },
  equip: { lines: ['สวยไหม? ✨', 'ใส่แล้วดูดีเลย!'], move: 'hop' },
  'quiz-right': { lines: ['ถูกต้อง! เก่งมาก', 'เซียนภาษีชัด ๆ!'], move: 'jump' },
  'quiz-wrong': { lines: ['ไม่เป็นไรนะ ข้อหน้าเอาใหม่', 'เกือบแล้ว!'], move: 'shake' },
  theme: { lines: ['เปลี่ยนลุคแล้ว!', 'ชุดใหม่ ใจใหม่~'], move: 'spin' },
}

export function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!
}
