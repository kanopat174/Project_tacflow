/**
 * จำลองสถานการณ์ "ถ้า…" — ฟังก์ชันบริสุทธิ์
 *
 * รับตัวเลขปัจจุบันของผู้ใช้ แล้วปรับตามสถานการณ์ที่เลือก ก่อนคำนวณภาษีใหม่ทั้งชุดด้วย engine เดิม
 * ผลจึงรวมเพดานลดหย่อน ภาษีขั้นต่ำ และขั้นบันไดไว้ครบ ไม่ได้ประมาณแบบคูณอัตราเดียว
 */

import { calculateCorporateTax } from './corporateEngine'
import { calculateTax, roundMoney, type AmountMap, type TaxResult } from './taxEngine'
import { DIVIDEND_WHT_RATE } from '@/data/investmentTaxData'

export interface ScenarioInput {
  /** เงินเดือนเปลี่ยนกี่เปอร์เซ็นต์ เช่น 10 = ขึ้น 10% */
  salaryChangePct: number
  /** รับงานฟรีแลนซ์ (40(2)) เพิ่มต่อปี */
  extraFreelance: number
  /** ซื้อกองทุนลดหย่อน (Thai ESG → SSF → RMF) เพิ่มต่อปี */
  extraFunds: number
}

export interface Snapshot {
  grossIncome: number
  tax: number
  /** เงินได้หลังหักภาษี */
  afterTax: number
  effectiveRate: number
  marginalRate: number
}

export interface ScenarioResult {
  before: Snapshot
  after: Snapshot
  /** ภาษีเปลี่ยนไปเท่าไร (+ คือเสียเพิ่ม) */
  taxChange: number
  /** เงินได้หลังหักภาษีเปลี่ยนไปเท่าไร */
  afterTaxChange: number
  /** จากเงินได้ที่เพิ่มขึ้นทุก 100 บาท ถูกหักเป็นภาษีกี่บาท */
  marginalTakeRate: number | null
  /** เงินที่ใช้ซื้อกองทุนลดหย่อน ไม่นับเป็นภาษีแต่เป็นเงินที่ออกจากกระเป๋าไปลงทุน */
  fundsSpent: number
}

/** ลำดับการเติมกองทุนลดหย่อน — เพดานต่ำและถือสั้นก่อน */
const FUND_ORDER: { key: string; cap: number }[] = [
  { key: 'thaiEsg', cap: 300_000 },
  { key: 'ssf', cap: 200_000 },
  { key: 'rmf', cap: 500_000 },
]

function snapshot(result: TaxResult): Snapshot {
  return {
    grossIncome: result.grossIncome,
    tax: result.tax,
    afterTax: roundMoney(result.grossIncome - result.tax),
    effectiveRate: result.effectiveRate,
    marginalRate: result.marginalRate,
  }
}

export function applyScenario(
  income: AmountMap,
  deductions: AmountMap,
  input: ScenarioInput,
): { income: AmountMap; deductions: AmountMap } {
  const nextIncome = { ...income }
  const nextDeductions = { ...deductions }

  const salary = Number(income.salary) || 0
  nextIncome.salary = roundMoney(Math.max(0, salary * (1 + (Number(input.salaryChangePct) || 0) / 100)))
  nextIncome.freelance = roundMoney(
    (Number(income.freelance) || 0) + Math.max(0, Number(input.extraFreelance) || 0),
  )

  // เติมกองทุนทีละตัวจนเต็มเพดานรายการ ส่วนที่เกินเพดานตามสัดส่วนเงินได้ engine จะตัดเอง
  let funds = Math.max(0, Number(input.extraFunds) || 0)
  for (const { key, cap } of FUND_ORDER) {
    if (funds <= 0) break
    const current = Number(nextDeductions[key]) || 0
    const add = Math.min(funds, Math.max(0, cap - current))
    nextDeductions[key] = current + add
    funds -= add
  }

  return { income: nextIncome, deductions: nextDeductions }
}

export function runScenario(
  income: AmountMap,
  deductions: AmountMap,
  withholdingTax: number,
  input: ScenarioInput,
): ScenarioResult {
  const before = calculateTax(income, deductions, withholdingTax)
  const next = applyScenario(income, deductions, input)
  const after = calculateTax(next.income, next.deductions, withholdingTax)

  const incomeGain = after.grossIncome - before.grossIncome
  const taxChange = roundMoney(after.tax - before.tax)

  return {
    before: snapshot(before),
    after: snapshot(after),
    taxChange,
    afterTaxChange: roundMoney(after.grossIncome - after.tax - (before.grossIncome - before.tax)),
    marginalTakeRate: incomeGain > 0 ? taxChange / incomeGain : null,
    fundsSpent: roundMoney(Math.max(0, Number(input.extraFunds) || 0)),
  }
}

/* ---------- เทียบรับงานในนามบุคคลกับจดบริษัท ---------- */

export interface IncorporationInput {
  /** รายได้จากธุรกิจหรืองานอิสระต่อปี */
  revenue: number
  /** ต้นทุนจริงคิดเป็นกี่เปอร์เซ็นต์ของรายได้ */
  costPct: number
  /** เงินได้อื่นของเจ้าของ (นอกจากธุรกิจนี้) */
  otherIncome: AmountMap
  deductions: AmountMap
}

export interface IncorporationResult {
  personal: { tax: number; afterTax: number }
  company: {
    profit: number
    corporateTax: number
    dividendTax: number
    ownerTax: number
    totalTax: number
    afterTax: number
  }
  /** + คือจดบริษัทประหยัดกว่า */
  saving: number
  better: 'personal' | 'company'
}

/**
 * เทียบภาระภาษีรวมระหว่าง
 *  - รับเองในนามบุคคล: รายได้เป็นเงินได้ 40(8) หักค่าใช้จ่ายเหมา 60%
 *  - จดบริษัท SME: เสียภาษีนิติบุคคลจากกำไรจริง แล้วจ่ายกำไรที่เหลือเป็นเงินปันผล (หัก ณ ที่จ่าย 10% เป็นภาษีสุดท้าย)
 * เป็นแบบจำลองอย่างง่าย ไม่รวมเงินเดือนกรรมการ ค่าทำบัญชี ค่าสอบบัญชี และภาระประกันสังคม
 */
export function compareIncorporation(input: IncorporationInput): IncorporationResult {
  const revenue = Math.max(0, Number(input.revenue) || 0)
  const costPct = Math.min(100, Math.max(0, Number(input.costPct) || 0))

  const asPerson = calculateTax({ ...input.otherIncome, business: (Number(input.otherIncome.business) || 0) + revenue }, input.deductions)
  const ownerOnly = calculateTax(input.otherIncome, input.deductions)

  const profit = roundMoney(revenue * (1 - costPct / 100))
  const corporate = calculateCorporateTax({
    entityType: 'sme',
    paidUpCapital: 1_000_000,
    revenue,
    expenses: roundMoney(revenue - profit),
    addBacks: 0,
    exemptIncome: 0,
    lossCarryforward: 0,
    withholdingTax: 0,
    halfYearTaxPaid: 0,
    section8Share: 0,
  })
  const distributable = Math.max(0, profit - corporate.tax)
  const dividendTax = roundMoney(distributable * DIVIDEND_WHT_RATE)
  const totalTax = roundMoney(corporate.tax + dividendTax + ownerOnly.tax)

  // เงินที่เหลือเข้ากระเป๋าเจ้าของ: กำไรหลังภาษีทั้งสองชั้น + เงินได้อื่นหลังภาษี
  // (ฝั่งบุคคลเงินได้ = รายได้เต็ม ต้นทุนจริงต้องจ่ายเหมือนกัน จึงหักต้นทุนจริงออกทั้งสองฝั่งเพื่อเทียบกันตรง ๆ)
  const realCost = revenue - profit
  const personalAfterTax = roundMoney(asPerson.grossIncome - realCost - asPerson.tax)
  const companyAfterTax = roundMoney(ownerOnly.grossIncome - ownerOnly.tax + distributable - dividendTax)

  const saving = roundMoney(asPerson.tax - totalTax)
  return {
    personal: { tax: asPerson.tax, afterTax: personalAfterTax },
    company: {
      profit,
      corporateTax: corporate.tax,
      dividendTax,
      ownerTax: ownerOnly.tax,
      totalTax,
      afterTax: companyAfterTax,
    },
    saving,
    better: saving > 0 ? 'company' : 'personal',
  }
}
