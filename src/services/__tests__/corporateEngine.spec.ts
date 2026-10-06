import { describe, expect, it } from 'vitest'
import {
  calculateCorporateTax,
  calculateSmeBrackets,
  isSmeEligible,
  type CorporateInput,
} from '../corporateEngine'

function input(overrides: Partial<CorporateInput> = {}): CorporateInput {
  return {
    entityType: 'sme',
    paidUpCapital: 1_000_000,
    revenue: 10_000_000,
    expenses: 9_000_000,
    addBacks: 0,
    exemptIncome: 0,
    lossCarryforward: 0,
    withholdingTax: 0,
    halfYearTaxPaid: 0,
    section8Share: 0,
    ...overrides,
  }
}

describe('เกณฑ์ SME', () => {
  it('ทุนไม่เกิน 5 ล้านและรายได้ไม่เกิน 30 ล้าน จึงเข้าเกณฑ์', () => {
    expect(isSmeEligible(5_000_000, 30_000_000)).toBe(true)
    expect(isSmeEligible(5_000_001, 30_000_000)).toBe(false)
    expect(isSmeEligible(5_000_000, 30_000_001)).toBe(false)
  })

  it('เลือก SME ทั้งที่คุณสมบัติไม่ผ่าน ระบบเตือนและคิดอัตรา 20% ให้แทน', () => {
    const result = calculateCorporateTax(
      input({ paidUpCapital: 10_000_000, revenue: 10_000_000, expenses: 5_000_000 }),
    )
    expect(result.smeEligible).toBe(false)
    expect(result.smeWarning).not.toBe('')
    expect(result.tax).toBe(1_000_000) // 5,000,000 × 20%
  })
})

describe('อัตราภาษีขั้นบันไดของ SME', () => {
  it('กำไรสุทธิ 300,000 บาทแรกได้รับยกเว้น', () => {
    expect(calculateSmeBrackets(300_000).reduce((s, l) => s + l.tax, 0)).toBe(0)
  })

  it('กำไรสุทธิ 3,000,000 บาท เสียภาษี 405,000 บาท', () => {
    // (3,000,000 − 300,000) × 15%
    expect(calculateSmeBrackets(3_000_000).reduce((s, l) => s + l.tax, 0)).toBe(405_000)
  })

  it('กำไรสุทธิ 5,000,000 บาท เสียภาษี 805,000 บาท', () => {
    // 405,000 + (2,000,000 × 20%)
    expect(calculateSmeBrackets(5_000_000).reduce((s, l) => s + l.tax, 0)).toBe(805_000)
  })
})

describe('การคำนวณกำไรสุทธิทางภาษี', () => {
  it('บวกกลับรายจ่ายต้องห้ามและหักรายได้ที่ได้รับยกเว้น', () => {
    const result = calculateCorporateTax(
      input({ revenue: 5_000_000, expenses: 4_000_000, addBacks: 200_000, exemptIncome: 100_000 }),
    )
    expect(result.accountingProfit).toBe(1_000_000)
    expect(result.profitBeforeLoss).toBe(1_100_000)
  })

  it('ผลขาดทุนยกมาหักได้เท่าที่มีกำไร ส่วนที่เหลือยกไปรอบถัดไป', () => {
    const result = calculateCorporateTax(
      input({ revenue: 1_300_000, expenses: 1_000_000, lossCarryforward: 500_000 }),
    )
    expect(result.lossApplied).toBe(300_000)
    expect(result.lossRemaining).toBe(200_000)
    expect(result.taxableProfit).toBe(0)
    expect(result.tax).toBe(0)
  })

  it('บริษัททั่วไปเสียภาษีคงที่ 20% ของกำไรสุทธิ', () => {
    const result = calculateCorporateTax(
      input({ entityType: 'standard', revenue: 50_000_000, expenses: 45_000_000 }),
    )
    expect(result.taxableProfit).toBe(5_000_000)
    expect(result.tax).toBe(1_000_000)
    expect(result.marginalRate).toBe(0.2)
  })

  it('หักภาษีที่ชำระไว้แล้วตาม ภ.ง.ด.51 และภาษีหัก ณ ที่จ่าย', () => {
    const result = calculateCorporateTax(
      input({
        revenue: 4_000_000,
        expenses: 1_000_000,
        withholdingTax: 100_000,
        halfYearTaxPaid: 200_000,
      }),
    )
    expect(result.tax).toBe(405_000) // กำไร 3,000,000
    expect(result.balance).toBe(105_000)
  })
})

describe('มูลนิธิและสมาคม', () => {
  it('คิดจากรายได้ก่อนหักรายจ่าย 2% สำหรับ 40(8) และ 10% สำหรับประเภทอื่น', () => {
    const result = calculateCorporateTax(
      input({ entityType: 'foundation', revenue: 1_000_000, expenses: 900_000, section8Share: 0.5 }),
    )
    // 500,000 × 2% + 500,000 × 10%
    expect(result.tax).toBe(60_000)
    expect(result.effectiveRate).toBeCloseTo(0.06, 10)
  })

  it('รายจ่ายไม่มีผลกับฐานภาษีของมูลนิธิ', () => {
    const a = calculateCorporateTax(
      input({ entityType: 'foundation', revenue: 1_000_000, expenses: 0, section8Share: 1 }),
    )
    const b = calculateCorporateTax(
      input({ entityType: 'foundation', revenue: 1_000_000, expenses: 900_000, section8Share: 1 }),
    )
    expect(a.tax).toBe(b.tax)
    expect(a.tax).toBe(20_000)
  })
})

describe('กรณีขอบ', () => {
  it('ขาดทุนทางบัญชีไม่ต้องเสียภาษี', () => {
    const result = calculateCorporateTax(input({ revenue: 1_000_000, expenses: 2_000_000 }))
    expect(result.accountingProfit).toBe(-1_000_000)
    expect(result.taxableProfit).toBe(0)
    expect(result.tax).toBe(0)
    expect(result.effectiveRate).toBe(0)
  })
})
