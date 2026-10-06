import { describe, expect, it } from 'vitest'
import {
  calculateExpenses,
  calculateProgressiveTax,
  calculateTax,
  compareSpouseFiling,
  roundMoney,
  savingsFromExtraDeduction,
} from '../taxEngine'

describe('อัตราภาษีขั้นบันได', () => {
  it('เงินได้สุทธิไม่เกิน 150,000 บาท ได้รับยกเว้นภาษี', () => {
    expect(calculateProgressiveTax(150_000)).toBe(0)
  })

  it('เก็บภาษีเฉพาะส่วนที่เกินแต่ละขั้น ไม่ใช่เหมาทั้งก้อน', () => {
    // 150,001–300,000 เสีย 5% → 150,000 × 5% = 7,500
    expect(calculateProgressiveTax(300_000)).toBe(7_500)
    // บวกขั้น 10% อีก 200,000 → 7,500 + 20,000 = 27,500
    expect(calculateProgressiveTax(500_000)).toBe(27_500)
  })

  it('เงินได้สูงมากคิดขั้นสูงสุด 35%', () => {
    // ภาษีสะสมถึง 5,000,000 คือ 1,265,000 บวกส่วนเกิน 1,000,000 × 35%
    expect(calculateProgressiveTax(6_000_000)).toBe(1_265_000 + 350_000)
  })

  it('เงินได้ติดลบหรือค่าที่ไม่ใช่ตัวเลขคิดเป็นศูนย์', () => {
    expect(calculateProgressiveTax(-50_000)).toBe(0)
    expect(calculateProgressiveTax(Number.NaN)).toBe(0)
  })
})

describe('ค่าใช้จ่ายแบบเหมา', () => {
  it('เงินเดือนหัก 50% แต่ไม่เกิน 100,000 บาท', () => {
    const lines = calculateExpenses({ salary: 480_000 })
    const salary = lines.find((line) => line.key === 'salary')!
    expect(salary.expense).toBe(100_000)
    expect(salary.cappedByLimit).toBe(true)
  })

  it('เงินเดือนกับฟรีแลนซ์ใช้เพดาน 100,000 บาทร่วมกัน', () => {
    const lines = calculateExpenses({ salary: 200_000, freelance: 200_000 })
    const total = lines.reduce((sum, line) => sum + line.expense, 0)
    expect(total).toBe(100_000)
  })

  it('ดอกเบี้ยและเงินปันผลหักค่าใช้จ่ายไม่ได้', () => {
    const lines = calculateExpenses({ investment: 100_000 })
    expect(lines.find((line) => line.key === 'investment')!.expense).toBe(0)
  })

  it('ธุรกิจตามมาตรา 40(8) หักได้ 60% โดยไม่มีเพดาน', () => {
    const lines = calculateExpenses({ business: 1_000_000 })
    expect(lines.find((line) => line.key === 'business')!.expense).toBe(600_000)
  })
})

describe('การคำนวณภาษีทั้งชุด', () => {
  it('มนุษย์เงินเดือน 600,000 บาทต่อปี พร้อมลดหย่อนพื้นฐาน', () => {
    const result = calculateTax(
      { salary: 600_000 },
      { personal: 60_000, socialSecurity: 9_000 },
      25_000,
    )

    expect(result.grossIncome).toBe(600_000)
    expect(result.totalExpense).toBe(100_000) // ชนเพดาน
    expect(result.netIncome).toBe(431_000) // 600,000 − 100,000 − 69,000
    expect(result.tax).toBe(20_600) // 7,500 + (131,000 × 10%)
    expect(result.balance).toBe(-4_400) // หัก ณ ที่จ่ายไว้เกิน → ขอคืนได้
  })

  it('ตัดเพดานรวมกองทุนเพื่อการเกษียณที่ 500,000 บาท', () => {
    const result = calculateTax(
      { salary: 3_000_000 },
      { personal: 60_000, providentFund: 400_000, rmf: 400_000 },
      0,
    )

    const retirement = result.deductionLines
      .filter((line) => line.key === 'providentFund' || line.key === 'rmf')
      .reduce((sum, line) => sum + line.allowed, 0)

    expect(retirement).toBe(500_000)
  })

  it('กองทุนสำรองเลี้ยงชีพหักได้ 10,000 + ไม่เกิน 15% ของค่าจ้าง', () => {
    const result = calculateTax({ salary: 400_000 }, { personal: 60_000, providentFund: 100_000 }, 0)
    const line = result.deductionLines.find((item) => item.key === 'providentFund')!
    expect(line.allowed).toBe(70_000) // 10,000 + 15% ของค่าจ้าง 400,000
    expect(line.cappedReason).not.toBe('')
  })

  it('ประกันชีวิตรวมประกันสุขภาพหักได้ไม่เกิน 100,000 บาท', () => {
    const result = calculateTax(
      { salary: 1_000_000 },
      { personal: 60_000, lifeInsurance: 100_000, healthInsurance: 25_000 },
      0,
    )

    const pool = result.deductionLines
      .filter((line) => line.key === 'lifeInsurance' || line.key === 'healthInsurance')
      .reduce((sum, line) => sum + line.allowed, 0)

    expect(pool).toBe(100_000)
  })

  it('เงินบริจาคทั่วไปหักได้ไม่เกิน 10% ของเงินได้หลังหักค่าลดหย่อน', () => {
    const result = calculateTax({ salary: 600_000 }, { personal: 60_000, donationGeneral: 100_000 }, 0)
    // ฐานก่อนบริจาค = 600,000 − 100,000 − 60,000 = 440,000 → หักบริจาคได้ 44,000
    expect(result.donationDeduction).toBe(44_000)
    expect(result.netIncome).toBe(396_000)
  })

  it('บริจาคเพื่อการศึกษาหักได้ 2 เท่าของที่จ่ายจริง', () => {
    const result = calculateTax({ salary: 600_000 }, { personal: 60_000, donationEducation: 10_000 }, 0)
    expect(result.donationDeduction).toBe(20_000)
  })

  it('ไม่มีเงินได้ ผลลัพธ์ทุกช่องเป็นศูนย์และไม่พังจากการหารด้วยศูนย์', () => {
    const result = calculateTax({}, {}, 0)
    expect(result.grossIncome).toBe(0)
    expect(result.tax).toBe(0)
    expect(result.effectiveRate).toBe(0)
    expect(result.netIncome).toBe(0)
  })
})

describe('ประมาณการภาษีที่ประหยัดได้', () => {
  it('ลดหย่อนเพิ่มในขั้น 10% ประหยัดภาษีได้ 10% ของยอดที่ลดหย่อน', () => {
    expect(savingsFromExtraDeduction(400_000, 10_000)).toBe(1_000)
  })

  it('ลดหย่อนเพิ่มเมื่อเงินได้สุทธิยังไม่ถึงเกณฑ์เสียภาษี ไม่ช่วยประหยัดอะไร', () => {
    expect(savingsFromExtraDeduction(120_000, 10_000)).toBe(0)
  })
})

describe('เปรียบเทียบการยื่นแบบของคู่สมรส', () => {
  it('ทั้งคู่มีเงินได้ การยื่นแยกเสียภาษีน้อยกว่าเพราะแต่ละคนเริ่มนับขั้นบันไดใหม่', () => {
    const result = compareSpouseFiling({
      selfNetIncome: 500_000,
      spouseNetIncome: 500_000,
      spouseHasIncome: true,
    })
    // แยก: 27,500 × 2 = 55,000 / รวม: ภาษีของ 1,000,000 = 115,000
    expect(result.separate.totalTax).toBe(55_000)
    expect(result.joint.totalTax).toBe(115_000)
    expect(result.better).toBe('separate')
    expect(result.saving).toBe(60_000)
  })

  it('คู่สมรสไม่มีเงินได้ ยื่นรวมแล้วใช้ค่าลดหย่อนคู่สมรสได้อีก 60,000 บาท', () => {
    const result = compareSpouseFiling({
      selfNetIncome: 500_000,
      spouseNetIncome: 0,
      spouseHasIncome: false,
    })
    expect(result.spouseAllowanceApplied).toBe(true)
    // 440,000 เสีย 7,500 + 140,000 × 10% = 21,500
    expect(result.joint.totalTax).toBe(21_500)
    expect(result.separate.totalTax).toBe(27_500)
    expect(result.better).toBe('joint')
    expect(result.saving).toBe(6_000)
  })

  it('ฝ่ายหนึ่งมีเงินได้น้อยมาก ผลต่างระหว่างสองวิธีก็ยังคำนวณได้', () => {
    const result = compareSpouseFiling({
      selfNetIncome: 1_000_000,
      spouseNetIncome: 100_000,
      spouseHasIncome: true,
    })
    expect(result.separate.spouseTax).toBe(0) // ยังไม่ถึงเกณฑ์เสียภาษี
    expect(result.better).toBe('separate')
  })
})

describe('การปัดจำนวนเงิน', () => {
  it('ปัดเป็นทศนิยม 2 ตำแหน่งและตัด float noise ทิ้ง', () => {
    expect(roundMoney(300_000 * 0.07)).toBe(21_000)
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(Number.NaN)).toBe(0)
  })
})
