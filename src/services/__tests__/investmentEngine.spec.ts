import { describe, expect, it } from 'vitest'
import {
  calculateCapitalGainsTax,
  calculateDividendTax,
  dividendCreditOf,
  type CapitalGainsInput,
  type DividendInput,
} from '../investmentEngine'

function dividendInput(overrides: Partial<DividendInput> = {}): DividendInput {
  return {
    thaiDividend: 0,
    payerCitRate: 0.2,
    interest: 0,
    foreignDividend: 0,
    foreignTaxPaid: 0,
    otherNetIncome: 0,
    ...overrides,
  }
}

function gainsInput(overrides: Partial<CapitalGainsInput> = {}): CapitalGainsInput {
  return {
    setGain: 0,
    thaiFundGain: 0,
    otcGain: 0,
    foreignGain: 0,
    foreignRemitted: 0,
    foreignTaxPaid: 0,
    otherNetIncome: 0,
    ...overrides,
  }
}

describe('เครดิตภาษีเงินปันผล', () => {
  it('บริษัทเสียภาษี 20% ให้เครดิต 25% ของเงินปันผล', () => {
    expect(dividendCreditOf(100_000, 0.2)).toBe(25_000) // 20/80
  })

  it('บริษัท SME เสียภาษี 15% ให้เครดิตน้อยกว่า', () => {
    expect(dividendCreditOf(100_000, 0.15)).toBeCloseTo(17_647.06, 1) // 15/85
  })

  it('กิจการที่ได้รับยกเว้นภาษีไม่มีเครดิตให้ใช้', () => {
    expect(dividendCreditOf(100_000, 0)).toBe(0)
  })
})

describe('เงินปันผล — เลือกภาษีสุดท้ายหรือนำมารวมคำนวณ', () => {
  it('ผู้มีเงินได้น้อย นำมารวมคำนวณแล้วได้เงินคืนทั้งเครดิตและภาษีที่ถูกหักไว้', () => {
    const result = calculateDividendTax(dividendInput({ thaiDividend: 100_000 }))

    expect(result.dividendCredit).toBe(25_000)
    expect(result.grossedUpDividend).toBe(125_000)
    expect(result.thaiDividendWht).toBe(10_000)

    // เงินได้สุทธิ 125,000 ยังไม่ถึงเกณฑ์เสียภาษี
    expect(result.included.progressiveTax).toBe(0)
    expect(result.included.balance).toBe(-35_000) // ขอคืนได้ 35,000
    expect(result.included.totalTax).toBe(-25_000)
    expect(result.final.totalTax).toBe(10_000)
    expect(result.better).toBe('included')
    expect(result.saving).toBe(35_000)
  })

  it('ผู้มีเงินได้สูงในขั้น 30% ให้ภาษีหัก ณ ที่จ่ายเป็นภาษีสุดท้ายคุ้มกว่า', () => {
    const result = calculateDividendTax(
      dividendInput({ thaiDividend: 100_000, otherNetIncome: 3_000_000 }),
    )

    // ภาษีฐานเดิม 665,000 + ภาษีหัก ณ ที่จ่าย 10,000
    expect(result.final.totalTax).toBe(675_000)
    // ภาษีจากฐานใหม่ 702,500 − เครดิตเงินปันผล 25,000
    expect(result.included.totalTax).toBe(677_500)
    expect(result.better).toBe('final')
    expect(result.saving).toBe(2_500)
  })

  it('ในขั้น 25% การนำมารวมคำนวณยังคุ้มกว่า', () => {
    const result = calculateDividendTax(
      dividendInput({ thaiDividend: 100_000, otherNetIncome: 1_500_000 }),
    )
    expect(result.better).toBe('included')
  })

  it('ดอกเบี้ยถูกหักภาษีไว้ 15% และนำมารวมคำนวณเพื่อขอคืนได้', () => {
    const result = calculateDividendTax(dividendInput({ interest: 100_000 }))
    expect(result.interestWht).toBe(15_000)
    expect(result.included.balance).toBe(-15_000)
    expect(result.better).toBe('included')
  })

  it('เครดิตภาษีต่างประเทศใช้ได้ไม่เกินภาษีไทยที่ตกกับเงินได้ก้อนนั้น', () => {
    const result = calculateDividendTax(
      dividendInput({ foreignDividend: 100_000, foreignTaxPaid: 90_000, otherNetIncome: 200_000 }),
    )
    // ภาษีไทยที่เพิ่มขึ้นจากเงินปันผลต่างประเทศ: 300,000 − 200,000 ในขั้น 5% = 5,000
    expect(result.final.credits).toBe(5_000)
    expect(result.final.credits).toBeLessThan(90_000)
  })

  it('ไม่มีเงินปันผลเลย ทั้งสองทางเลือกให้ผลเท่ากัน', () => {
    const result = calculateDividendTax(dividendInput({ otherNetIncome: 500_000 }))
    expect(result.final.totalTax).toBe(result.included.totalTax)
    expect(result.saving).toBe(0)
  })
})

describe('กำไรจากการขายหุ้น', () => {
  it('กำไรจากหุ้นไทยในตลาดหลักทรัพย์ได้รับยกเว้นทั้งจำนวน', () => {
    const result = calculateCapitalGainsTax(
      gainsInput({ setGain: 500_000, otherNetIncome: 500_000 }),
    )
    expect(result.exemptGain).toBe(500_000)
    expect(result.taxableGain).toBe(0)
    expect(result.taxOnGains).toBe(0)
  })

  it('แยกส่วนที่ยกเว้นกับส่วนที่ต้องเสียภาษีได้ถูกต้อง', () => {
    const result = calculateCapitalGainsTax(
      gainsInput({ setGain: 200_000, otcGain: 100_000, otherNetIncome: 500_000 }),
    )
    expect(result.taxableGain).toBe(100_000)
    expect(result.exemptGain).toBe(200_000)
    // 600,000 เสีย 42,500 เทียบกับ 500,000 เสีย 27,500
    expect(result.totalTax).toBe(42_500)
    expect(result.taxOnGains).toBe(15_000)
    // ถ้าไม่มีสิทธิยกเว้น กำไร 300,000 จะถูกคิดภาษีทั้งก้อน
    expect(result.taxSavedByExemption).toBe(32_500)
  })

  it('หุ้นต่างประเทศเสียภาษีเฉพาะส่วนที่นำเงินเข้าประเทศไทย', () => {
    const result = calculateCapitalGainsTax(
      gainsInput({ foreignGain: 500_000, foreignRemitted: 200_000, otherNetIncome: 500_000 }),
    )
    expect(result.taxableGain).toBe(200_000)
    expect(result.exemptGain).toBe(300_000)
  })

  it('นำเงินเข้ามากกว่ากำไรที่เกิดขึ้น ก็เสียภาษีไม่เกินกำไรจริง', () => {
    const result = calculateCapitalGainsTax(
      gainsInput({ foreignGain: 100_000, foreignRemitted: 900_000 }),
    )
    expect(result.taxableGain).toBe(100_000)
  })

  it('เครดิตภาษีต่างประเทศใช้ได้ไม่เกินภาษีไทยของกำไรก้อนนั้น', () => {
    const result = calculateCapitalGainsTax(
      gainsInput({
        foreignGain: 100_000,
        foreignRemitted: 100_000,
        foreignTaxPaid: 80_000,
        otherNetIncome: 500_000,
      }),
    )
    // 600,000 − 500,000 ในขั้น 15% = 15,000
    expect(result.foreignTaxCredit).toBe(15_000)
    expect(result.taxPayable).toBe(result.totalTax - 15_000)
  })

  it('ไม่มีกำไรเลย ผลลัพธ์เป็นศูนย์และไม่พังจากการหารด้วยศูนย์', () => {
    const result = calculateCapitalGainsTax(gainsInput())
    expect(result.totalGain).toBe(0)
    expect(result.effectiveRateOnGains).toBe(0)
    expect(result.lines).toEqual([])
  })
})
