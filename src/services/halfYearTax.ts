/**
 * ภาษีเงินได้บุคคลธรรมดาครึ่งปี (ภ.ง.ด.94) — ฟังก์ชันบริสุทธิ์
 *
 * ใช้กับเงินได้ 40(5)–40(8) ที่ได้รับช่วงมกราคม–มิถุนายน ยื่นภายในกันยายน
 * ภาษีที่ชำระนับเป็นเงินจ่ายล่วงหน้า นำไปหักตอนยื่น ภ.ง.ด.90 สิ้นปี
 *
 * หลักเกณฑ์ค่าลดหย่อนครึ่งปี (สรุปจากกรมสรรพากรและ iTAX/PEAK/กรุงศรี):
 *  - ส่วนตัว 30,000 · คู่สมรสไม่มีเงินได้ 30,000 · บุตรคนละ 15,000 (คนที่ 2 ขึ้นไปเกิดตั้งแต่ 2561 คนละ 30,000)
 *    · บิดามารดาคนละ 15,000 · คนพิการคนละ 30,000 — คือกึ่งหนึ่งของทั้งปี
 *  - เบี้ยประกันชีวิตและดอกเบี้ยบ้านที่จ่าย ม.ค.–มิ.ย.: 10,000 บาทแรกหักได้กึ่งหนึ่ง ส่วนที่เกินหักตามจริง รวมไม่เกิน 95,000
 *  - กองทุนสำรองเลี้ยงชีพ / กบข. / ครูเอกชน ใช้ในแบบครึ่งปีไม่ได้ (ใช้ได้ตอนสิ้นปีเท่านั้น)
 *  - รายการอื่นหักตามที่จ่ายจริงช่วง ม.ค.–มิ.ย. ภายในเพดานเดิม
 *  - ไม่คิดภาษีขั้นต่ำ 0.5% เพราะยังไม่พบแหล่งที่ยืนยันเกณฑ์ของแบบครึ่งปี
 */

import { INCOME_CATEGORIES } from '@/data/taxData'
import { dependentAmounts, type Dependents } from '@/data/dependents'
import { calculateTax, roundMoney, type AmountMap, type TaxResult } from './taxEngine'

export const HALF_YEAR_CODES = ['40(5)', '40(6)', '40(7)', '40(8)']
export const HALF_YEAR_PERSONAL = 30_000

/** ประเภทเงินได้ที่ต้องยื่นในแบบครึ่งปี */
export const HALF_YEAR_CATEGORIES = INCOME_CATEGORIES.filter((c) => HALF_YEAR_CODES.includes(c.code))

/** รายการลดหย่อนที่ใช้ในแบบครึ่งปีไม่ได้ */
const NOT_ALLOWED = ['providentFund', 'gpf']

/** 10,000 บาทแรกหักได้กึ่งหนึ่ง ส่วนที่เกินหักตามจริง รวมไม่เกิน 95,000 */
function halfFirstTenThousand(paid: number): number {
  const amount = Math.max(0, paid)
  return Math.min(95_000, Math.min(amount, 10_000) / 2 + Math.max(0, amount - 10_000))
}

export interface HalfYearInput {
  /** เงินได้ ม.ค.–มิ.ย. (ระบบใช้เฉพาะ 40(5)–40(8)) */
  income: AmountMap
  /** ค่าใช้จ่ายตามจริงของประเภทที่เลือกหักตามจริง */
  actualExpenses?: AmountMap
  /** ค่าลดหย่อนที่จ่ายจริงช่วง ม.ค.–มิ.ย. */
  deductions: AmountMap
  dependents: Dependents
  spouseNoIncome: boolean
  /** ภาษีที่ถูกหัก ณ ที่จ่ายช่วง ม.ค.–มิ.ย. */
  withholdingTax: number
  taxYear: string
}

export interface HalfYearResult {
  result: TaxResult
  /** ยอดที่ต้องชำระพร้อมแบบ ภ.ง.ด.94 — นำไปหักตอนยื่นสิ้นปี */
  payable: number
  /** ยอดที่ใช้ปรับค่าลดหย่อนครึ่งปีแล้ว */
  adjustedDeductions: AmountMap
}

/** แปลงค่าลดหย่อนที่กรอกเป็นยอดตามหลักเกณฑ์ครึ่งปี */
export function halfYearDeductions(input: Pick<HalfYearInput, 'deductions' | 'dependents' | 'spouseNoIncome'>): AmountMap {
  const d: AmountMap = { ...input.deductions }
  for (const key of NOT_ALLOWED) d[key] = 0

  // ครอบครัว: กึ่งหนึ่งของสิทธิทั้งปี
  const family = dependentAmounts(input.dependents)
  d.children = family.children / 2
  d.parents = family.parents / 2
  d.disabledCare = family.disabledCare / 2
  d.spouse = input.spouseNoIncome ? 30_000 : 0

  d.lifeInsurance = halfFirstTenThousand(Number(input.deductions.lifeInsurance) || 0)
  d.mortgageInterest = halfFirstTenThousand(Number(input.deductions.mortgageInterest) || 0)
  d.healthInsurance = Math.min(15_000, Number(input.deductions.healthInsurance) || 0)

  for (const key of Object.keys(d)) d[key] = roundMoney(d[key] ?? 0)
  return d
}

export function calculateHalfYearTax(input: HalfYearInput): HalfYearResult {
  // เงินได้ประเภทอื่น (เช่นเงินเดือน) ไม่ต้องยื่นในแบบครึ่งปี
  const income = Object.fromEntries(
    HALF_YEAR_CATEGORIES.map((c) => [c.key, Number(input.income[c.key]) || 0]),
  )
  const adjustedDeductions = halfYearDeductions(input)
  // ประกันสังคมใช้เพดานครึ่งหนึ่งของทั้งปี
  const fullYear = calculateTax({}, { socialSecurity: 1e9 }, 0, { taxYear: input.taxYear })
  const ssCap = (fullYear.deductionLines.find((l) => l.key === 'socialSecurity')?.allowed ?? 9_000) / 2
  adjustedDeductions.socialSecurity = Math.min(ssCap, adjustedDeductions.socialSecurity ?? 0)

  const result = calculateTax(income, adjustedDeductions, input.withholdingTax, {
    taxYear: input.taxYear,
    personalAllowance: HALF_YEAR_PERSONAL,
    minimumTax: false,
    actualExpenses: input.actualExpenses,
  })
  return { result, payable: Math.max(0, result.balance), adjustedDeductions }
}
