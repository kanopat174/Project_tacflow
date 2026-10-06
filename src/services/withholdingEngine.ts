/**
 * เครื่องคำนวณภาษีหัก ณ ที่จ่าย — ฟังก์ชันบริสุทธิ์ทั้งหมด
 *
 * ตอบคำถามว่า "ต้องหักเท่าไร และโอนให้ผู้รับเงินจริงเท่าไร"
 * จุดที่ผิดกันบ่อยคือฐานที่ใช้หัก ต้องเป็นยอดก่อนภาษีมูลค่าเพิ่มเสมอ
 */

import { WITHHOLDING_TYPES, type PayeeType } from '@/data/withholdingData'
import { VAT_RATE } from '@/data/vatData'
import { extractVat } from './vatEngine'
import { roundMoney } from './taxEngine'

function clean(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export interface WithholdingInput {
  /** ยอดเงินที่ตกลงกัน */
  amount: number
  /** ยอดที่กรอกรวมภาษีมูลค่าเพิ่มมาแล้วหรือไม่ */
  amountIncludesVat: boolean
  /** ผู้รับเงินจดทะเบียนภาษีมูลค่าเพิ่มหรือไม่ */
  vatRegistered: boolean
  typeKey: string
  payeeType: PayeeType
  vatRate: number
}

export interface WithholdingResult {
  /** ฐานที่ใช้คำนวณภาษีหัก ณ ที่จ่าย (ยอดก่อน VAT) */
  base: number
  vat: number
  /** ยอดรวมที่ผู้รับออกใบแจ้งหนี้ */
  grossInvoice: number
  rate: number | null
  withholdingTax: number
  /** ยอดที่ผู้จ่ายโอนให้ผู้รับเงินจริง */
  netPayment: number
  /** แบบที่ใช้นำส่ง */
  form: string
  label: string
  /** ระบุเมื่อประเภทเงินได้นี้ไม่ต้องหักสำหรับผู้รับประเภทที่เลือก */
  notApplicable: boolean
}

export function calculateWithholding(input: WithholdingInput): WithholdingResult {
  const type = WITHHOLDING_TYPES.find((t) => t.key === input.typeKey) ?? WITHHOLDING_TYPES[0]!
  const vatRate = input.vatRegistered
    ? (Number.isFinite(input.vatRate) ? input.vatRate : VAT_RATE)
    : 0

  // ผู้รับที่ไม่ได้จดทะเบียน VAT จะไม่มีภาษีมูลค่าเพิ่มในใบแจ้งหนี้
  const amount = clean(input.amount)
  const split =
    input.amountIncludesVat && vatRate > 0
      ? extractVat(amount, vatRate)
      : {
          net: roundMoney(amount),
          vat: roundMoney(amount * vatRate),
          gross: roundMoney(amount * (1 + vatRate)),
          rate: vatRate,
        }

  const rate = type.rates[input.payeeType]
  const withholdingTax = rate === null ? 0 : roundMoney(split.net * rate)

  return {
    base: split.net,
    vat: split.vat,
    grossInvoice: split.gross,
    rate,
    withholdingTax,
    netPayment: roundMoney(split.gross - withholdingTax),
    form: type.forms[input.payeeType],
    label: type.label,
    notApplicable: rate === null,
  }
}

/** อัตราที่ใช้ได้จริงของประเภทเงินได้นั้นกับผู้รับแต่ละแบบ */
export function withholdingRateOf(typeKey: string, payeeType: PayeeType): number | null {
  return WITHHOLDING_TYPES.find((t) => t.key === typeKey)?.rates[payeeType] ?? null
}
