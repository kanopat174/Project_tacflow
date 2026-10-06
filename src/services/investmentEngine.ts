/**
 * เครื่องคำนวณภาษีจากเงินลงทุน — ฟังก์ชันบริสุทธิ์ทั้งหมด
 *
 * ครอบคลุมสองคำถามที่คนถามบ่อยที่สุด
 *   1. เงินปันผล — ควร "ให้ภาษีหัก ณ ที่จ่ายเป็นภาษีสุดท้าย" หรือ "นำมารวมคำนวณเพื่อใช้เครดิตภาษี"
 *   2. กำไรจากการขายหุ้น — ส่วนไหนได้รับยกเว้น ส่วนไหนต้องเสียภาษี
 */

import { DIVIDEND_WHT_RATE, INTEREST_WHT_RATE } from '@/data/investmentTaxData'
import { calculateProgressiveTax } from './taxEngine'

function clean(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/* ---------- เงินปันผลและดอกเบี้ย ---------- */

export interface DividendInput {
  /** เงินปันผลจากบริษัทไทย ก่อนหักภาษี ณ ที่จ่าย */
  thaiDividend: number
  /** อัตราภาษีนิติบุคคลของบริษัทผู้จ่าย เช่น 0.2 */
  payerCitRate: number
  /** ดอกเบี้ยเงินฝากและหุ้นกู้ ก่อนหักภาษี ณ ที่จ่าย */
  interest: number
  /** เงินปันผลจากต่างประเทศที่นำเงินเข้ามาในไทยแล้ว */
  foreignDividend: number
  /** ภาษีที่ถูกหักไว้ในต่างประเทศ */
  foreignTaxPaid: number
  /** เงินได้สุทธิจากแหล่งอื่น (หลังหักค่าใช้จ่ายและค่าลดหย่อนแล้ว) */
  otherNetIncome: number
}

export interface DividendScenario {
  key: 'final' | 'included'
  label: string
  /** เงินได้สุทธิที่ใช้คำนวณภาษีตามขั้นบันได */
  netIncome: number
  /** ภาษีตามขั้นบันไดจากเงินได้สุทธิข้างต้น */
  progressiveTax: number
  /** เครดิตที่นำมาหักตอนยื่นแบบ (เครดิตเงินปันผล + ภาษีที่ถูกหักไว้ + เครดิตต่างประเทศ) */
  credits: number
  /**
   * ภาระภาษีรวมทั้งปีของทางเลือกนี้ — ตัวเลขที่ใช้เปรียบเทียบกันจริง
   * ภาษีหัก ณ ที่จ่ายที่จ่ายไปแล้วนับเป็นต้นทุนในทางเลือกภาษีสุดท้าย
   * แต่ในทางเลือกนำมารวมคำนวณจะถูกเครดิตคืน จึงหักล้างกันไป
   */
  totalTax: number
  /** ยอดที่ต้องชำระเพิ่มหรือขอคืนตอนยื่นแบบ (> 0 ชำระเพิ่ม, < 0 ขอคืน) */
  balance: number
}

export interface DividendResult {
  /** เครดิตภาษีเงินปันผลที่ใช้ได้ */
  dividendCredit: number
  /** เงินปันผลหลังบวกเครดิต (gross-up) */
  grossedUpDividend: number
  thaiDividendWht: number
  interestWht: number
  /** เครดิตภาษีต่างประเทศที่ใช้ได้จริง (ไม่เกินภาษีไทยของเงินได้ก้อนนั้น) */
  foreignTaxCredit: number
  final: DividendScenario
  included: DividendScenario
  /** ทางเลือกที่เสียภาษีน้อยกว่า */
  better: 'final' | 'included'
  /** ส่วนต่างภาษีระหว่างสองทางเลือก */
  saving: number
}

/** เครดิตภาษีเงินปันผล = เงินปันผล × อัตราภาษีนิติบุคคล ÷ (1 − อัตราภาษีนิติบุคคล) */
export function dividendCreditOf(dividend: number, payerCitRate: number): number {
  const rate = Math.min(0.99, Math.max(0, Number(payerCitRate) || 0))
  if (rate <= 0) return 0
  return clean(dividend) * (rate / (1 - rate))
}

export function calculateDividendTax(input: DividendInput): DividendResult {
  const thaiDividend = clean(input.thaiDividend)
  const interest = clean(input.interest)
  const foreignDividend = clean(input.foreignDividend)
  const otherNetIncome = clean(input.otherNetIncome)

  const thaiDividendWht = thaiDividend * DIVIDEND_WHT_RATE
  const interestWht = interest * INTEREST_WHT_RATE
  const dividendCredit = dividendCreditOf(thaiDividend, input.payerCitRate)
  const grossedUpDividend = thaiDividend + dividendCredit

  // เงินปันผลต่างประเทศเลือกเป็นภาษีสุดท้ายไม่ได้ ต้องนำมารวมคำนวณเสมอทั้งสองทางเลือก
  const baseWithForeign = otherNetIncome + foreignDividend

  /** เครดิตภาษีต่างประเทศใช้ได้ไม่เกินภาษีไทยที่ตกกับเงินได้ก้อนนั้น */
  const foreignCreditFor = (netIncome: number, base: number): number => {
    if (foreignDividend <= 0) return 0
    const thaiTaxOnForeign = Math.max(
      0,
      calculateProgressiveTax(netIncome) - calculateProgressiveTax(Math.max(0, base)),
    )
    return Math.min(clean(input.foreignTaxPaid), thaiTaxOnForeign)
  }

  // ภาษีหัก ณ ที่จ่ายที่จ่ายไปแล้ว เหมือนกันทั้งสองทางเลือก ต่างกันแค่จะขอคืนได้หรือไม่
  const withholdingPaid = thaiDividendWht + interestWht

  // ทางเลือกที่ 1: ให้ภาษีหัก ณ ที่จ่ายของเงินปันผลและดอกเบี้ยเป็นภาษีสุดท้าย
  // เงินปันผลและดอกเบี้ยไม่เข้าแบบยื่น ภาษีที่ถูกหักไว้จึงกลายเป็นต้นทุนถาวร ขอคืนไม่ได้
  const finalNetIncome = baseWithForeign
  const finalProgressive = calculateProgressiveTax(finalNetIncome)
  const finalForeignCredit = foreignCreditFor(finalNetIncome, otherNetIncome)
  const finalBalance = finalProgressive - finalForeignCredit

  const final: DividendScenario = {
    key: 'final',
    label: 'ให้ภาษีหัก ณ ที่จ่ายเป็นภาษีสุดท้าย',
    netIncome: finalNetIncome,
    progressiveTax: finalProgressive,
    credits: finalForeignCredit,
    totalTax: finalBalance + withholdingPaid,
    balance: finalBalance,
  }

  // ทางเลือกที่ 2: นำเงินปันผลและดอกเบี้ยมารวมคำนวณ แล้วใช้เครดิตภาษีเงินปันผล
  // ภาษีที่ถูกหักไว้กลายเป็นเครดิตที่ขอคืนได้ จึงหักล้างกับเงินที่จ่ายไปแล้วพอดี
  const includedNetIncome = otherNetIncome + grossedUpDividend + interest + foreignDividend
  const includedProgressive = calculateProgressiveTax(includedNetIncome)
  const includedForeignCredit = foreignCreditFor(
    includedNetIncome,
    otherNetIncome + grossedUpDividend + interest,
  )
  const includedCredits = dividendCredit + withholdingPaid + includedForeignCredit

  const included: DividendScenario = {
    key: 'included',
    label: 'นำมารวมคำนวณและใช้เครดิตภาษีเงินปันผล',
    netIncome: includedNetIncome,
    progressiveTax: includedProgressive,
    credits: includedCredits,
    totalTax: includedProgressive - dividendCredit - includedForeignCredit,
    balance: includedProgressive - includedCredits,
  }

  const better = included.totalTax <= final.totalTax ? 'included' : 'final'

  return {
    dividendCredit,
    grossedUpDividend,
    thaiDividendWht,
    interestWht,
    foreignTaxCredit: includedForeignCredit,
    final,
    included,
    better,
    saving: Math.abs(final.totalTax - included.totalTax),
  }
}

/* ---------- กำไรจากการขายหุ้น ---------- */

export interface CapitalGainsInput {
  /** กำไรจากการขายหุ้นไทยผ่านตลาดหลักทรัพย์ */
  setGain: number
  /** กำไรจากการขายคืนหน่วยลงทุนกองทุนรวมไทย */
  thaiFundGain: number
  /** กำไรจากการโอนหุ้นไทยนอกตลาดหลักทรัพย์ */
  otcGain: number
  /** กำไรจากการขายหุ้นต่างประเทศทั้งจำนวน */
  foreignGain: number
  /** ส่วนของกำไรต่างประเทศที่นำเงินเข้ามาในประเทศไทยแล้ว */
  foreignRemitted: number
  /** ภาษีที่ถูกหักไว้ในต่างประเทศ */
  foreignTaxPaid: number
  /** เงินได้สุทธิจากแหล่งอื่น (หลังหักค่าใช้จ่ายและค่าลดหย่อนแล้ว) */
  otherNetIncome: number
}

export interface GainLine {
  key: string
  label: string
  gain: number
  taxable: number
  exempt: number
  note: string
}

export interface CapitalGainsResult {
  totalGain: number
  exemptGain: number
  taxableGain: number
  /** เงินได้สุทธิรวมกำไรที่ต้องเสียภาษี */
  netIncome: number
  /** ภาษีทั้งหมดหลังรวมกำไรจากหุ้น */
  totalTax: number
  /** ภาษีที่เกิดจากกำไรจากหุ้นโดยเฉพาะ */
  taxOnGains: number
  foreignTaxCredit: number
  /** ภาษีที่ต้องชำระจริงหลังหักเครดิตต่างประเทศ */
  taxPayable: number
  /** ภาษีที่ประหยัดได้จากสิทธิยกเว้น */
  taxSavedByExemption: number
  effectiveRateOnGains: number
  lines: GainLine[]
}

export function calculateCapitalGainsTax(input: CapitalGainsInput): CapitalGainsResult {
  const setGain = clean(input.setGain)
  const thaiFundGain = clean(input.thaiFundGain)
  const otcGain = clean(input.otcGain)
  const foreignGain = clean(input.foreignGain)
  // เสียภาษีเฉพาะส่วนที่นำเงินเข้าไทย และไม่เกินกำไรที่เกิดขึ้นจริง
  const foreignTaxable = Math.min(foreignGain, clean(input.foreignRemitted))
  const otherNetIncome = clean(input.otherNetIncome)

  const lines: GainLine[] = [
    {
      key: 'setListed',
      label: 'หุ้นไทยขายผ่านตลาดหลักทรัพย์ (SET / mai)',
      gain: setGain,
      taxable: 0,
      exempt: setGain,
      note: 'ได้รับยกเว้นภาษีเงินได้บุคคลธรรมดาทั้งจำนวน',
    },
    {
      key: 'thaiFund',
      label: 'หน่วยลงทุนกองทุนรวมไทย',
      gain: thaiFundGain,
      taxable: 0,
      exempt: thaiFundGain,
      note: 'กำไรจากการขายคืนหน่วยลงทุนได้รับยกเว้นสำหรับบุคคลธรรมดา',
    },
    {
      key: 'otc',
      label: 'หุ้นไทยโอนนอกตลาดหลักทรัพย์',
      gain: otcGain,
      taxable: otcGain,
      exempt: 0,
      note: 'เป็นเงินได้ตามมาตรา 40(4)(ช) ต้องนำมารวมคำนวณภาษี',
    },
    {
      key: 'foreign',
      label: 'หุ้นต่างประเทศ',
      gain: foreignGain,
      taxable: foreignTaxable,
      exempt: Math.max(0, foreignGain - foreignTaxable),
      note:
        foreignGain > foreignTaxable
          ? 'เสียภาษีเฉพาะส่วนที่นำเงินเข้าประเทศไทยแล้ว ส่วนที่ยังไม่นำเข้ายังไม่ถูกประเมิน'
          : 'นำเงินเข้าประเทศไทยแล้วทั้งจำนวน จึงต้องเสียภาษีเต็มจำนวน',
    },
  ].filter((line) => line.gain > 0)

  const totalGain = setGain + thaiFundGain + otcGain + foreignGain
  const taxableGain = otcGain + foreignTaxable
  const exemptGain = totalGain - taxableGain

  const netIncome = otherNetIncome + taxableGain
  const taxWithout = calculateProgressiveTax(otherNetIncome)
  const totalTax = calculateProgressiveTax(netIncome)
  const taxOnGains = Math.max(0, totalTax - taxWithout)

  // เครดิตภาษีต่างประเทศใช้ได้ไม่เกินภาษีไทยที่ตกกับกำไรต่างประเทศก้อนนั้น
  const taxBeforeForeign = calculateProgressiveTax(otherNetIncome + otcGain)
  const thaiTaxOnForeign = Math.max(0, totalTax - taxBeforeForeign)
  const foreignTaxCredit = Math.min(clean(input.foreignTaxPaid), thaiTaxOnForeign)

  // ถ้าไม่มีสิทธิยกเว้น กำไรทั้งก้อนจะถูกนำมารวมคำนวณ ส่วนต่างคือภาษีที่ประหยัดได้
  const taxIfNothingExempt = calculateProgressiveTax(otherNetIncome + totalGain)
  const taxSavedByExemption = Math.max(0, taxIfNothingExempt - totalTax)

  return {
    totalGain,
    exemptGain,
    taxableGain,
    netIncome,
    totalTax,
    taxOnGains,
    foreignTaxCredit,
    taxPayable: Math.max(0, totalTax - foreignTaxCredit),
    taxSavedByExemption,
    effectiveRateOnGains: taxableGain > 0 ? taxOnGains / taxableGain : 0,
    lines,
  }
}
