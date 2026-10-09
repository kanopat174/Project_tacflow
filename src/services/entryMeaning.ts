/**
 * ถอดความหมายว่าเงินไหลทางไหน — ใครให้ใคร ใครยืมใคร ใครคืนใคร — ฟังก์ชันบริสุทธิ์
 *
 *   "แม่ให้"            → รายรับ (แม่เป็นผู้ให้ เราเป็นผู้รับ)
 *   "ให้แม่"            → รายจ่าย (เราให้แม่)
 *   "แม่ให้ค่าขนม"       → รายรับ แม้มีคำว่า "ค่า"
 *   "ซื้อเค้กให้แม่"      → รายจ่าย
 *   "ยืมพี่"            → รายรับ + ยืมมาจากพี่
 *   "ให้เพื่อนยืม"       → รายจ่าย + ให้เพื่อนยืม
 *   "เพื่อนคืน"          → รายรับ + ได้เงินคืนจากเพื่อน
 *
 * ดูลำดับคำ (ผู้ให้อยู่หน้า "ให้" ผู้รับอยู่หลัง) ไม่ใช่แค่ว่ามีคำไหนในประโยค
 * ตีความไม่ได้คืน null แล้วตัวเดาจากคำใน quickParse ทำงานต่อ
 */

import type { EntryType } from '@/data/workspaceModes'
import type { LoanRole } from './ledgerEngine'

export interface Meaning {
  type: EntryType
  /** เหตุผลสั้น ๆ แสดงให้ผู้ใช้เห็นว่าระบบเข้าใจว่าอะไร */
  reason: string
  loan?: { role: LoanRole; party: string }
}

/** คำแทนตัวผู้ใช้เอง */
const ME = 'ผม|ฉัน|หนู|เรา|กู|ดิฉัน|ข้า|ตัวเอง'
/** คำที่ขึ้นต้นด้วยคน — "อา" ไม่รวม "อาหาร" และ "ตา" ไม่รวม "ตาม" */
const PERSON =
  'แม่|พ่อ|ป้า|ลุง|น้า|อา(?!หาร)|ปู่|ย่า|ตา(?!ม)|ยาย|พี่|น้อง|ลูก|หลาน|แฟน|เพื่อน|สามี|ภรรยา|เมีย|ผัว|เจ้านาย|หัวหน้า|ลูกค้า|ลูกน้อง|บริษัท|คุณ|นาย|นาง|น\\.ส\\.|ครู|อาจารย์|เฮีย|เจ๊|หมอ'

const IS_ME = new RegExp(`^(?:${ME})$`)
const STARTS_ME = new RegExp(`^(?:${ME})`)
const STARTS_PERSON = new RegExp(`^(?:${PERSON})`)
/** ส่วนหน้าประโยคที่เป็นการกระทำของเราเอง ไม่ใช่ชื่อคน เช่น "ซื้อของ" "ใส่ซอง" */
const ACTION = /ซื้อ|จ่าย|ค่า|เติม|เลี้ยง|ทำ|ใส่|บริจาค|ซอง|ของขวัญ/
/** คำที่ไม่ใช่ชื่อคู่ยืม */
const NOT_PARTY = /^เงิน|เงิน$|ค่า|ซื้อ|จ่าย|บัตร|ภาษี|ดอกเบี้ย|ประกัน|ธนาคาร|ห้าง/
/** ตัดกริยาโอน/จ่ายท้ายชื่อ: "เพื่อนโอน" → "เพื่อน" */
const cleanParty = (text: string) => text.replace(/(?:โอน|จ่าย|ส่ง)(?:เงิน)?(?:มา)?$/, '')

function isParty(text: string): boolean {
  return text.length > 0 && !IS_ME.test(text) && !NOT_PARTY.test(text) && !ACTION.test(text)
}

const lend = (party: string): Meaning => ({ type: 'expense', reason: `ให้${party}ยืม`, loan: { role: 'lend', party } })
const borrow = (party: string): Meaning => ({ type: 'income', reason: `ยืมจาก${party}`, loan: { role: 'borrow', party } })
const collect = (party: string): Meaning => ({ type: 'income', reason: `${party}คืนเงิน`, loan: { role: 'collect', party } })
const repay = (party: string): Meaning => ({ type: 'expense', reason: `คืนเงิน${party}`, loan: { role: 'repay', party } })

function loanMeaning(s: string): Meaning | null {
  let m: RegExpMatchArray | null
  // ให้เพื่อนยืม · ผมให้เพื่อนยืม
  if ((m = s.match(new RegExp(`^(?:${ME})?ให้(.+?)ยืม`))) && isParty(m[1]!)) return lend(m[1]!)
  // แม่ให้ยืม · แม่ให้ผมยืม
  if ((m = s.match(new RegExp(`^(.+?)ให้(?:${ME})?ยืม`))) && isParty(cleanParty(m[1]!))) return borrow(cleanParty(m[1]!))
  // ยืมพี่ · ผมยืมเงินพี่มา
  if ((m = s.match(new RegExp(`^(?:${ME})?ยืม(?:เงิน)?(?:จาก)?(.+?)(?:มา)?$`))) && isParty(m[1]!)) return borrow(m[1]!)
  // เพื่อนยืม · เพื่อนยืมเงินไป
  if ((m = s.match(/^(.+?)ยืม(?:เงิน)?(?:ไป)?$/)) && isParty(m[1]!)) return lend(m[1]!)
  // คืนพี่ · ใช้หนี้พี่ · โอนคืนพี่
  if ((m = s.match(new RegExp(`^(?:${ME})?(?:โอน|จ่าย)?(?:คืน|ใช้หนี้)(?:เงิน)?(?:ให้)?(.+)$`))) && isParty(m[1]!)) return repay(m[1]!)
  // เพื่อนคืน · เพื่อนโอนคืนมา · เพื่อนใช้หนี้
  if ((m = s.match(/^(.+?)(?:คืน|ใช้หนี้)/)) && isParty(cleanParty(m[1]!))) return collect(cleanParty(m[1]!))
  return null
}

function giveMeaning(s: string): Meaning | null {
  const at = s.indexOf('ให้')
  if (at < 0) return null
  // "แม่โอนให้" ผู้ให้คือแม่ · "โอนให้แม่" ผู้ให้คือเรา
  const giver = cleanParty(s.slice(0, at))
  const rest = s.slice(at + 'ให้'.length).replace(/^เงิน/, '')
  const toOther = STARTS_PERSON.test(rest) && !STARTS_ME.test(rest)

  if (!giver || IS_ME.test(giver)) return { type: 'expense', reason: rest ? `ให้${rest}` : 'เราเป็นผู้ให้' }
  if (!ACTION.test(giver)) {
    // คนอื่นให้คนอื่น ไม่ใช่เงินของเรา ตีความไม่ได้
    if (toOther) return null
    return { type: 'income', reason: `${giver}ให้` }
  }
  // "ซื้อของให้แม่" "ใส่ซองให้น้อง" — เราทำให้คนอื่น
  if (toOther) return { type: 'expense', reason: `ให้${rest}` }
  return null
}

function flowMeaning(s: string): Meaning | null {
  if (/(?:โอน|ส่ง)(?:เงิน)?มา|โอนเข้า|เข้าบัญชี|ได้(?:เงิน|รับ)?(?:มา)?จาก|ได้มา/.test(s)) return { type: 'income', reason: 'เงินเข้ามาหาเรา' }
  if (/โอนออก|โอนไป|ส่งไป/.test(s)) return { type: 'expense', reason: 'เงินออกจากเรา' }
  return null
}

/** อ่านทิศทางเงินจากรายละเอียด (ไม่รวมจำนวนเงินและวันที่) */
export function inferMeaning(note: string): Meaning | null {
  const s = note.replace(/\s+/g, '')
  if (!s) return null
  return loanMeaning(s) ?? giveMeaning(s) ?? flowMeaning(s)
}
