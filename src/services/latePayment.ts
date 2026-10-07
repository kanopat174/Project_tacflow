/**
 * ยื่นหรือชำระภาษีเงินได้บุคคลธรรมดาล่าช้า และการผ่อนชำระ 3 งวด — ฟังก์ชันบริสุทธิ์
 *
 * หลักเกณฑ์ (กรมสรรพากร "เตือนเรื่องค่าปรับ กรณียื่น ภ.ง.ด.90/91 เมื่อพ้นกำหนดเวลา"):
 *  - เงินเพิ่ม มาตรา 27 — 1.5% ต่อเดือนหรือเศษของเดือนของภาษีที่ต้องชำระ นับจากวันพ้นกำหนด
 *    รวมแล้วไม่เกินจำนวนภาษี ขอลดหรืองดไม่ได้
 *  - ค่าปรับอาญา มาตรา 35 — ไม่เกิน 2,000 บาท ทุกกรณีที่ยื่นเกินกำหนด แม้ไม่มีภาษีต้องชำระ
 *    ในทางปฏิบัติเจ้าหน้าที่มักเปรียบเทียบปรับ 200 บาทถ้าช้าไม่เกิน 7 วัน และ 1,000 บาทถ้าช้ากว่านั้น
 *  - เบี้ยปรับ (1–2 เท่า) เกิดเมื่อถูกเรียกตรวจสอบเท่านั้น ยื่นเองโดยสมัครใจไม่ต้องเสีย
 *  - มาตรา 64 — ภาษีตั้งแต่ 3,000 บาทและยื่นภายในกำหนด ผ่อนได้ 3 งวดเท่า ๆ กันโดยไม่มีเงินเพิ่ม
 *    งวดที่ 2 และ 3 ห่างกันงวดละ 1 เดือน งวดไหนจ่ายช้า งวดนั้นเสียเงินเพิ่มนับจากวันครบกำหนดของงวด
 */

import { roundMoney } from './taxEngine'

export const SURCHARGE_RATE = 0.015
export const MAX_CRIMINAL_FINE = 2_000
export const INSTALLMENT_MINIMUM = 3_000
export const INSTALLMENT_COUNT = 3

export type FilingChannel = 'online' | 'paper'

/** วันที่ในรูป YYYY-MM-DD แบบไม่ขึ้นกับเขตเวลา */
function parse(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number)
  return { y: y!, m: m!, d: d! }
}

function format(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** บวกเดือนโดยยึดวันของวันตั้งต้น ถ้าเดือนปลายทางสั้นกว่าให้ใช้วันสุดท้ายของเดือน (31 มี.ค. + 1 = 30 เม.ย.) */
export function addMonths(date: string, months: number): string {
  const { y, m, d } = parse(date)
  const index = y * 12 + (m - 1) + months
  const ny = Math.floor(index / 12)
  const nm = (index % 12) + 1
  return format(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

export function daysBetween(from: string, to: string): number {
  const a = parse(from)
  const b = parse(to)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000)
}

/**
 * กำหนดยื่น ภ.ง.ด.90/91 ของปีภาษี (พ.ศ.)
 * ยื่นกระดาษภายใน 31 มีนาคมของปีถัดไป ยื่นออนไลน์ใช้ 8 เมษายนซึ่งเป็นวันที่ขยายให้เกือบทุกปี
 * ปีไหนประกาศต่างจากนี้ ผู้ใช้แก้วันกำหนดเองได้
 */
export function filingDeadline(taxYear: string, channel: FilingChannel): string {
  const year = Number(taxYear) - 543 + 1
  return channel === 'paper' ? format(year, 3, 31) : format(year, 4, 8)
}

/** จำนวนเดือนที่คิดเงินเพิ่ม — เศษของเดือนนับเป็นหนึ่งเดือน */
export function surchargeMonths(dueDate: string, payDate: string): number {
  if (!dueDate || !payDate || payDate <= dueDate) return 0
  let months = 1
  while (addMonths(dueDate, months) < payDate) months += 1
  return months
}

/** เงินเพิ่มตามมาตรา 27 ไม่เกินจำนวนภาษี */
export function surcharge(tax: number, dueDate: string, payDate: string): number {
  const amount = Math.max(0, Number(tax) || 0)
  const months = surchargeMonths(dueDate, payDate)
  return roundMoney(Math.min(amount, amount * SURCHARGE_RATE * months))
}

/** ค่าปรับอาญาที่มักถูกเปรียบเทียบปรับจริง — ไม่ใช่อัตราตามกฎหมายที่ตายตัว */
export function typicalCriminalFine(daysLate: number): number {
  if (daysLate <= 0) return 0
  return daysLate <= 7 ? 200 : 1_000
}

export interface LatePaymentInput {
  /** ภาษีที่ต้องชำระเพิ่มตามแบบ (หลังหักภาษีหัก ณ ที่จ่ายแล้ว) */
  tax: number
  /** กำหนดยื่นแบบ */
  deadline: string
  /** วันที่ยื่นแบบจริง */
  filedDate: string
  /** วันที่ชำระภาษีจริง */
  paidDate: string
}

export interface LatePaymentResult {
  tax: number
  filedLate: boolean
  daysLate: number
  months: number
  surcharge: number
  /** ค่าปรับอาญาที่มักเสียจริง */
  fine: number
  total: number
  /** เงินเพิ่มชนเพดานเท่ากับภาษีแล้ว */
  capped: boolean
}

export function calculateLatePayment(input: LatePaymentInput): LatePaymentResult {
  const tax = roundMoney(Math.max(0, Number(input.tax) || 0))
  const daysLate = Math.max(0, daysBetween(input.deadline, input.filedDate))
  // ชำระก่อนยื่นไม่ได้ ถ้ากรอกวันชำระก่อนวันยื่นให้ถือว่าชำระวันเดียวกับที่ยื่น
  const paidDate = input.paidDate && input.paidDate > input.filedDate ? input.paidDate : input.filedDate
  const months = tax > 0 ? surchargeMonths(input.deadline, paidDate) : 0
  const extra = surcharge(tax, input.deadline, paidDate)
  const fine = typicalCriminalFine(daysLate)
  return {
    tax,
    filedLate: daysLate > 0,
    daysLate,
    months,
    surcharge: extra,
    fine,
    total: roundMoney(tax + extra + fine),
    capped: tax > 0 && extra >= tax,
  }
}

/* ---------- ผ่อนชำระ 3 งวด ---------- */

export interface Installment {
  index: number
  amount: number
  dueDate: string
}

export function canPayInInstallments(tax: number, filedOnTime = true): boolean {
  return filedOnTime && roundMoney(Number(tax) || 0) >= INSTALLMENT_MINIMUM
}

/**
 * แบ่งภาษีเป็น 3 งวด งวดแรกพร้อมยื่นแบบ งวดถัดไปทุก 1 เดือน
 * แบ่งเป็นสตางค์ให้รวมกันได้ยอดเดิมพอดี เศษที่เหลือรวมไว้ในงวดแรก
 */
export function installmentPlan(tax: number, deadline: string): Installment[] {
  const total = Math.round((Number(tax) || 0) * 100)
  if (total <= 0) return []
  const part = Math.floor(total / INSTALLMENT_COUNT)
  return Array.from({ length: INSTALLMENT_COUNT }, (_, i) => ({
    index: i + 1,
    amount: (i === 0 ? total - part * (INSTALLMENT_COUNT - 1) : part) / 100,
    dueDate: addMonths(deadline, i),
  }))
}

/** เงินเพิ่มของงวดที่จ่ายช้า — งวดอื่นที่จ่ายตรงเวลายังได้สิทธิผ่อนตามเดิม */
export function installmentSurcharge(installment: Installment, paidDate: string): number {
  return surcharge(installment.amount, installment.dueDate, paidDate)
}

/* ---------- ติดตามการชำระของแบบที่บันทึกไว้ ---------- */

/** แผนการชำระที่ผู้ใช้เลือกไว้กับแบบภาษีฉบับหนึ่ง */
export interface PaymentPlan {
  mode: 'single' | 'installments'
  channel: FilingChannel
  /** วันที่จ่ายของแต่ละงวด ตามลำดับงวด — ว่างคือยังไม่จ่าย */
  paidDates: string[]
}

export interface ScheduleRow extends Installment {
  paidDate: string
  status: 'paid' | 'overdue' | 'upcoming'
  daysLeft: number
  /** เงินเพิ่มของงวดนี้ — จ่ายแล้วคิดถึงวันที่จ่าย ยังไม่จ่ายคิดถึงวันนี้ */
  surcharge: number
}

/** ตารางชำระของยอดภาษีที่ต้องจ่ายเพิ่ม พร้อมสถานะของแต่ละงวด ณ วันนี้ */
export function paymentSchedule(
  balance: number,
  taxYear: string,
  plan: PaymentPlan,
  today: string,
): ScheduleRow[] {
  const deadline = filingDeadline(taxYear, plan.channel)
  const rows =
    plan.mode === 'installments' && canPayInInstallments(balance)
      ? installmentPlan(balance, deadline)
      : balance > 0
        ? [{ index: 1, amount: roundMoney(balance), dueDate: deadline }]
        : []
  return rows.map((row, i) => {
    const paidDate = plan.paidDates[i] ?? ''
    const status = paidDate ? 'paid' : today > row.dueDate ? 'overdue' : 'upcoming'
    return {
      ...row,
      paidDate,
      status,
      daysLeft: daysBetween(today, row.dueDate),
      surcharge: surcharge(row.amount, row.dueDate, paidDate || today),
    }
  })
}

export const DEFAULT_PAYMENT_PLAN: PaymentPlan = { mode: 'single', channel: 'online', paidDates: [] }
