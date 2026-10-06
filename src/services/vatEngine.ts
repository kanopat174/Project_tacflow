/**
 * เครื่องคำนวณภาษีมูลค่าเพิ่ม — ฟังก์ชันบริสุทธิ์ทั้งหมด
 *
 * สองโจทย์หลัก
 *   1. แยกหรือบวกภาษีมูลค่าเพิ่มจากราคาสินค้า
 *   2. สรุปภาษีขายหักภาษีซื้อของรอบเดือน เพื่อยื่นแบบ ภ.พ.30
 */

import { VAT_RATE, VAT_REGISTRATION_THRESHOLD } from '@/data/vatData'
import { roundMoney } from './taxEngine'

function clean(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export interface VatSplit {
  /** ราคาก่อนภาษีมูลค่าเพิ่ม */
  net: number
  vat: number
  /** ราคารวมภาษีมูลค่าเพิ่ม */
  gross: number
  rate: number
}

/** บวกภาษีมูลค่าเพิ่มเข้ากับราคาที่ยังไม่รวมภาษี */
export function addVat(netAmount: number, rate: number = VAT_RATE): VatSplit {
  const net = roundMoney(clean(netAmount))
  const vat = roundMoney(net * rate)
  return { net, vat, gross: roundMoney(net + vat), rate }
}

/** แยกภาษีมูลค่าเพิ่มออกจากราคาที่รวมภาษีแล้ว */
export function extractVat(grossAmount: number, rate: number = VAT_RATE): VatSplit {
  const gross = roundMoney(clean(grossAmount))
  const net = roundMoney(gross / (1 + rate))
  return { net, vat: roundMoney(gross - net), gross, rate }
}

export interface VatReturnInput {
  /** ยอดขายที่ต้องเสียภาษีอัตราปกติ (ก่อน VAT) */
  standardSales: number
  /** ยอดขายอัตราศูนย์ เช่น ส่งออก */
  zeroRatedSales: number
  /** ยอดขายที่ได้รับยกเว้นภาษีมูลค่าเพิ่ม */
  exemptSales: number
  /** ยอดซื้อที่มีใบกำกับภาษี (ก่อน VAT) */
  purchases: number
  /** ภาษีซื้อที่กฎหมายห้ามนำมาหัก */
  nonClaimableInputVat: number
  /** ภาษีซื้อยกมาจากเดือนก่อน */
  creditCarriedForward: number
  rate: number
}

export interface VatReturnResult {
  outputVat: number
  /** ภาษีซื้อทั้งหมดจากใบกำกับภาษี */
  totalInputVat: number
  /** ภาษีซื้อที่นำมาหักได้จริง */
  claimableInputVat: number
  creditCarriedForward: number
  /** > 0 ต้องชำระ, < 0 ขอคืนหรือยกไปเดือนถัดไป */
  balance: number
  /** ยอดที่ต้องชำระในเดือนนี้ */
  payable: number
  /** เครดิตภาษีที่ยกไปเดือนถัดไป */
  creditToNextMonth: number
  totalSales: number
  /** รายรับที่นับรวมเพื่อดูเกณฑ์จดทะเบียน */
  taxableTurnover: number
}

export function calculateVatReturn(input: VatReturnInput): VatReturnResult {
  const rate = Number.isFinite(input.rate) ? input.rate : VAT_RATE
  const standardSales = clean(input.standardSales)
  const zeroRatedSales = clean(input.zeroRatedSales)
  const exemptSales = clean(input.exemptSales)
  const purchases = clean(input.purchases)

  const outputVat = roundMoney(standardSales * rate)
  const totalInputVat = roundMoney(purchases * rate)
  // ภาษีซื้อต้องห้ามหักออกก่อน และเครดิตที่นำมาหักต้องไม่ติดลบ
  const claimableInputVat = Math.max(0, roundMoney(totalInputVat - clean(input.nonClaimableInputVat)))
  const credit = clean(input.creditCarriedForward)

  const balance = roundMoney(outputVat - claimableInputVat - credit)

  return {
    outputVat,
    totalInputVat,
    claimableInputVat,
    creditCarriedForward: credit,
    balance,
    payable: Math.max(0, balance),
    creditToNextMonth: Math.max(0, -balance),
    totalSales: standardSales + zeroRatedSales + exemptSales,
    // กิจการที่ได้รับยกเว้นไม่นับรวมในเกณฑ์จดทะเบียนภาษีมูลค่าเพิ่ม
    taxableTurnover: standardSales + zeroRatedSales,
  }
}

/** รายรับต่อปีถึงเกณฑ์ต้องจดทะเบียนภาษีมูลค่าเพิ่มหรือยัง */
export function mustRegisterForVat(annualTaxableTurnover: number): boolean {
  return clean(annualTaxableTurnover) > VAT_REGISTRATION_THRESHOLD
}
