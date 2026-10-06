/**
 * ผู้ช่วยแนะนำการลดหย่อน — ฟังก์ชันบริสุทธิ์
 *
 * ตอบคำถามว่า "ถ้าจะลดหย่อนเพิ่ม ควรซื้ออะไร เท่าไร แล้วประหยัดภาษีได้กี่บาท"
 * โดยลองเติมแต่ละรายการให้เต็มสิทธิที่เหลือ แล้วคำนวณภาษีใหม่ทั้งชุด
 * ตัวเลขจึงรวมผลของเพดานรายการ เพดานตามสัดส่วนเงินได้ เพดานรวมของกลุ่ม
 * และภาษีขั้นต่ำตามมาตรา 48(2) ไว้แล้ว ไม่ได้คูณอัตราภาษีแบบคร่าว ๆ
 */

import { DEDUCTION_ITEMS } from '@/data/taxData'
import { calculateTax, roundMoney, type AmountMap, type TaxOptions } from './taxEngine'

/**
 * รายการที่ผู้ใช้ "ซื้อเพิ่ม" ได้เองเพื่อลดหย่อน
 * ไม่รวมสิทธิที่ขึ้นกับข้อเท็จจริง (คู่สมรส บุตร บิดามารดา) ภาคบังคับ (ประกันสังคม กองทุนสำรองเลี้ยงชีพ)
 * และดอกเบี้ยบ้านที่ต้องมีเงินกู้อยู่ก่อน
 */
export const PURCHASABLE_KEYS = [
  'thaiEsg',
  'thaiEsgxNew',
  'ssf',
  'rmf',
  'pensionInsurance',
  'lifeInsurance',
  'healthInsurance',
  'parentHealthInsurance',
  'nsf',
] as const

/** คำแนะนำสั้น ๆ ว่ารายการนี้เหมาะกับใคร */
const NOTES: Record<string, string> = {
  thaiEsg: 'ถือ 5 ปีนับจากวันที่ซื้อ ไม่ต้องซื้อต่อเนื่องทุกปี',
  thaiEsgxNew: 'วงเงินพิเศษปี 2568 แยกจาก Thai ESG ปกติ',
  ssf: 'ถือ 10 ปีนับจากวันที่ซื้อ',
  rmf: 'ต้องถือจนอายุ 55 ปี และลงทุนอย่างน้อย 5 ปี',
  pensionInsurance: 'ได้เงินคืนเป็นรายงวดหลังเกษียณ',
  lifeInsurance: 'กรมธรรม์ต้องคุ้มครอง 10 ปีขึ้นไป',
  healthInsurance: 'ได้ความคุ้มครองค่ารักษาไปพร้อมกัน',
  parentHealthInsurance: 'ใช้ได้เมื่อบิดามารดามีเงินได้ไม่เกิน 30,000 บาทต่อปี',
  nsf: 'สำหรับผู้ที่ไม่มีระบบบำนาญอื่น ออมได้สูงสุด 30,000 บาทต่อปี',
}

export interface DeductionSuggestion {
  key: string
  label: string
  note: string
  /** จำนวนเงินที่ควรซื้อเพิ่ม (ส่วนที่นำไปหักได้จริงเท่านั้น) */
  amount: number
  /** ภาษีที่ลดลงถ้าซื้อเพิ่มตามจำนวนนี้ */
  saving: number
  /** ภาษีที่ลดลงต่อเงิน 1 บาทที่จ่าย */
  returnRate: number
}

export interface AdvisorResult {
  suggestions: DeductionSuggestion[]
  /** ภาษีที่ต้องเสียตอนนี้ */
  currentTax: number
  /** ถ้าทำตามทุกคำแนะนำพร้อมกัน ภาษีจะเหลือเท่าไร */
  taxIfAll: number
  /** เงินที่ต้องใช้ถ้าทำตามทุกคำแนะนำพร้อมกัน */
  amountIfAll: number
  /** เหตุผลเมื่อไม่มีคำแนะนำ */
  reason: '' | 'no-income' | 'no-tax' | 'maxed'
}

/** ยอดลดหย่อนที่นำไปหักได้จริงของรายการนี้ หลังตัดเพดานทุกชั้นแล้ว */
function allowedOf(income: AmountMap, deductions: AmountMap, key: string, options: TaxOptions): number {
  return calculateTax(income, deductions, 0, options).deductionLines.find((l) => l.key === key)?.allowed ?? 0
}

export function suggestDeductions(
  income: AmountMap,
  deductions: AmountMap,
  withholdingTax = 0,
  limit = 5,
  options: TaxOptions = {},
): AdvisorResult {
  const base = calculateTax(income, deductions, withholdingTax, options)
  const empty: AdvisorResult = {
    suggestions: [],
    currentTax: base.tax,
    taxIfAll: base.tax,
    amountIfAll: 0,
    reason: '',
  }
  if (base.grossIncome <= 0) return { ...empty, reason: 'no-income' }
  if (base.tax <= 0) return { ...empty, reason: 'no-tax' }

  /** ลองเติมรายการนี้ให้เต็มสิทธิที่เหลือ บนค่าลดหย่อนชุดที่ให้มา */
  const evaluate = (key: string, current: AmountMap, currentTax: number) => {
    const before = calculateTax(income, current, withholdingTax, options)
    const line = before.deductionLines.find((l) => l.key === key)
    if (!line || line.limit === null) return null
    const entered = Number(current[key]) || 0
    const room = roundMoney(line.limit - entered)
    if (room <= 0) return null
    // เติมเต็มเพดานรายการ แล้วดูว่าหักได้จริงเพิ่มเท่าไร (เพดานรวมของกลุ่มอาจตัดออกบางส่วน)
    const usable = roundMoney(allowedOf(income, { ...current, [key]: entered + room }, key, options) - line.allowed)
    if (usable <= 0) return null
    const next = { ...current, [key]: entered + usable }
    const tax = calculateTax(income, next, withholdingTax, options).tax
    const saving = roundMoney(currentTax - tax)
    return saving > 0 ? { usable, saving, tax, next } : null
  }

  // จัดอันดับจากผลของแต่ละรายการเดี่ยว ๆ: ประหยัดได้มากสุดก่อน เท่ากันเอาที่ใช้เงินน้อยกว่า
  const ranked = PURCHASABLE_KEYS.map((key) => ({ key, result: evaluate(key, deductions, base.tax) }))
    .filter((r) => r.result)
    .sort((a, b) => b.result!.saving - a.result!.saving || a.result!.usable - b.result!.usable)

  // ทำเป็นแผนต่อเนื่อง: แต่ละข้อคิดบนผลของข้อก่อนหน้า
  // กองทุนหลายตัวใช้เพดานรวม 500,000 บาทร่วมกัน และภาษีลดลงเรื่อย ๆ จึงบวกผลแยกกันตรง ๆ ไม่ได้
  const suggestions: DeductionSuggestion[] = []
  let current: AmountMap = { ...deductions }
  let currentTax = base.tax
  for (const { key } of ranked) {
    if (suggestions.length >= limit || currentTax <= 0) break
    const step = evaluate(key, current, currentTax)
    if (!step) continue
    const item = DEDUCTION_ITEMS.find((i) => i.key === key)!
    suggestions.push({
      key,
      label: item.label,
      note: NOTES[key] ?? '',
      amount: step.usable,
      saving: step.saving,
      returnRate: step.saving / step.usable,
    })
    current = step.next
    currentTax = step.tax
  }

  if (suggestions.length === 0) return { ...empty, reason: 'maxed' }

  return {
    suggestions,
    currentTax: base.tax,
    taxIfAll: currentTax,
    amountIfAll: roundMoney(suggestions.reduce((sum, s) => sum + s.amount, 0)),
    reason: '',
  }
}

/** จำนวนวันที่เหลือก่อนสิ้นปีภาษี (31 ธันวาคม) — ต้องซื้อกองทุนและจ่ายเบี้ยภายในวันนี้ */
export function daysUntilYearEnd(today: Date = new Date()): number {
  const end = new Date(today.getFullYear(), 11, 31)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}
