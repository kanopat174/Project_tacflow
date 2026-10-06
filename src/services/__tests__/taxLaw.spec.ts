/**
 * ตรวจการคำนวณภาษีบุคคลธรรมดาเทียบกับกฎหมายทีละข้อ
 *
 * แหล่งอ้างอิง
 *  - ประมวลรัษฎากร มาตรา 40, 42 ทวิ–46, 47, 48 (https://www.rd.go.th/5937.html)
 *  - กรมสรรพากร "ผู้มีเงินได้มีสิทธิหักลดหย่อนอะไรได้บ้าง?" (ปรับปรุง 28 ม.ค. 2568)
 *  - พระราชกฤษฎีกา (ฉบับที่ 11) อัตราหักค่าใช้จ่ายเงินได้ 40(5)–40(8)
 *  - มาตรการเฉพาะปี: SSF สิ้นสุดปี 2567, ThaiESGX ปี 2568, Easy E-Receipt 2.0 ปี 2568,
 *    เพดานเงินสมทบประกันสังคม 17,500 บาท/เดือน ตั้งแต่ปี 2569
 */

import { describe, expect, it } from 'vitest'
import { calculateBrackets, calculateExpenses, calculateTax, type AmountMap } from '../taxEngine'

const allowedOf = (income: AmountMap, deductions: AmountMap, key: string, taxYear = '2568') =>
  calculateTax(income, deductions, 0, { taxYear }).deductionLines.find((l) => l.key === key)!.allowed

const expenseOf = (income: AmountMap, key: string) => calculateExpenses(income).find((l) => l.key === key)!.expense

describe('มาตรา 48(1) อัตราภาษีขั้นบันได', () => {
  it.each([
    [150_000, 0],
    [300_000, 7_500],
    [500_000, 27_500],
    [750_000, 65_000],
    [1_000_000, 115_000],
    [2_000_000, 365_000],
    [5_000_000, 1_265_000],
    [6_000_000, 1_615_000],
  ])('เงินได้สุทธิ %i บาท เสียภาษี %i บาท', (net, tax) => {
    expect(calculateBrackets(net).reduce((s, l) => s + l.tax, 0)).toBe(tax)
  })
})

describe('มาตรา 42 ทวิ–46 ค่าใช้จ่ายแบบเหมา', () => {
  it('40(1) + 40(2) หัก 50% รวมกันไม่เกิน 100,000', () => {
    expect(expenseOf({ salary: 150_000 }, 'salary')).toBe(75_000)
    const lines = calculateExpenses({ salary: 300_000, freelance: 100_000 })
    expect(lines.filter((l) => l.code === '40(1)' || l.code === '40(2)').reduce((s, l) => s + l.expense, 0)).toBe(100_000)
  })

  it('40(3) ค่าลิขสิทธิ์ 50% ไม่เกิน 100,000 · 40(4) หักไม่ได้', () => {
    expect(expenseOf({ royalty: 300_000 }, 'royalty')).toBe(100_000)
    expect(expenseOf({ investment: 100_000 }, 'investment')).toBe(0)
  })

  it('40(5) ค่าเช่า: อาคาร/ยานพาหนะ 30% · ที่ดินเกษตร 20% · ที่ดินอื่น 15% · ทรัพย์สินอื่น 10%', () => {
    expect(expenseOf({ rent: 100_000 }, 'rent')).toBe(30_000)
    expect(expenseOf({ rentFarmland: 100_000 }, 'rentFarmland')).toBe(20_000)
    expect(expenseOf({ rentLand: 100_000 }, 'rentLand')).toBe(15_000)
    expect(expenseOf({ rentOther: 100_000 }, 'rentOther')).toBe(10_000)
  })

  it('40(6) การประกอบโรคศิลปะ 60% · วิชาชีพอื่น 30% · 40(7) และ 40(8) 60%', () => {
    expect(expenseOf({ medical: 100_000 }, 'medical')).toBe(60_000)
    expect(expenseOf({ profession: 100_000 }, 'profession')).toBe(30_000)
    expect(expenseOf({ contractor: 100_000 }, 'contractor')).toBe(60_000)
    expect(expenseOf({ business: 100_000 }, 'business')).toBe(60_000)
  })
})

describe('มาตรา 47 ค่าลดหย่อนส่วนตัวและครอบครัว', () => {
  const income = { salary: 2_000_000 }

  it('ส่วนตัว 60,000 ได้อัตโนมัติ และคู่สมรสไม่มีเงินได้ไม่เกิน 60,000', () => {
    expect(allowedOf(income, {}, 'personal')).toBe(60_000)
    expect(allowedOf(income, { spouse: 90_000 }, 'spouse')).toBe(60_000)
  })

  it('บิดามารดาไม่เกิน 4 คน คนละ 30,000 และค่าฝากครรภ์ไม่เกิน 60,000', () => {
    expect(allowedOf(income, { parents: 150_000 }, 'parents')).toBe(120_000)
    expect(allowedOf(income, { prenatal: 80_000 }, 'prenatal')).toBe(60_000)
  })
})

describe('ประกันและกองทุนภาคบังคับ', () => {
  const income = { salary: 2_000_000 }

  it('ประกันสังคมไม่เกิน 9,000 และปีภาษี 2569 ไม่เกิน 10,500', () => {
    expect(allowedOf(income, { socialSecurity: 12_000 }, 'socialSecurity', '2568')).toBe(9_000)
    expect(allowedOf(income, { socialSecurity: 12_000 }, 'socialSecurity', '2569')).toBe(10_500)
  })

  it('ประกันสุขภาพตนเองไม่เกิน 25,000 และรวมประกันชีวิตไม่เกิน 100,000', () => {
    expect(allowedOf(income, { healthInsurance: 40_000 }, 'healthInsurance')).toBe(25_000)
    const r = calculateTax(income, { lifeInsurance: 90_000, healthInsurance: 25_000 }, 0, { taxYear: '2568' })
    const pool = r.deductionLines.filter((l) => l.key === 'lifeInsurance' || l.key === 'healthInsurance')
    expect(pool.reduce((s, l) => s + l.allowed, 0)).toBe(100_000)
  })

  it('ประกันชีวิตคู่สมรสไม่เกิน 10,000 และประกันสุขภาพบิดามารดาไม่เกิน 15,000', () => {
    expect(allowedOf(income, { spouseLifeInsurance: 20_000 }, 'spouseLifeInsurance')).toBe(10_000)
    expect(allowedOf(income, { parentHealthInsurance: 20_000 }, 'parentHealthInsurance')).toBe(15_000)
  })
})

describe('กองทุนเพื่อการออมและการลงทุน', () => {
  it('กองทุนสำรองเลี้ยงชีพ = 10,000 + 15% ของค่าจ้าง ไม่ใช่ของเงินได้ทั้งหมด', () => {
    // ค่าจ้าง 200,000 + ฟรีแลนซ์ 800,000 → เพดาน 10,000 + 30,000 ไม่ใช่ 15% ของ 1 ล้าน
    expect(allowedOf({ salary: 200_000, freelance: 800_000 }, { providentFund: 100_000 }, 'providentFund')).toBe(40_000)
  })

  it('กบข. / กองทุนครูเอกชนหักได้ตามจ่ายจริง ไม่ติดเพดาน 15%', () => {
    expect(allowedOf({ salary: 300_000 }, { gpf: 120_000 }, 'gpf')).toBe(120_000)
  })

  it('RMF 30% ของเงินได้ ไม่เกิน 500,000 · ประกันบำนาญ 15% ไม่เกิน 200,000 · กอช. ไม่เกิน 30,000', () => {
    expect(allowedOf({ salary: 1_000_000 }, { rmf: 400_000 }, 'rmf')).toBe(300_000)
    expect(allowedOf({ salary: 3_000_000 }, { pensionInsurance: 300_000 }, 'pensionInsurance')).toBe(200_000)
    expect(allowedOf({ salary: 1_000_000 }, { nsf: 50_000 }, 'nsf')).toBe(30_000)
  })

  it('กองทุนเพื่อการเกษียณรวมกันไม่เกิน 500,000 แต่ Thai ESG แยกวงเงิน', () => {
    const r = calculateTax(
      { salary: 5_000_000 },
      { providentFund: 300_000, rmf: 300_000, thaiEsg: 300_000 },
      0,
      { taxYear: '2568' },
    )
    const pool = r.deductionLines.filter((l) => ['providentFund', 'rmf'].includes(l.key))
    expect(pool.reduce((s, l) => s + l.allowed, 0)).toBe(500_000)
    expect(r.deductionLines.find((l) => l.key === 'thaiEsg')!.allowed).toBe(300_000)
  })

  it('SSF ใช้สิทธิได้ถึงปีภาษี 2567 เท่านั้น', () => {
    expect(allowedOf({ salary: 1_000_000 }, { ssf: 100_000 }, 'ssf', '2567')).toBe(100_000)
    expect(allowedOf({ salary: 1_000_000 }, { ssf: 100_000 }, 'ssf', '2568')).toBe(0)
    expect(allowedOf({ salary: 1_000_000 }, { ssf: 100_000 }, 'ssf', '2569')).toBe(0)
  })

  it('Thai ESG ปี 2566 เพดาน 100,000 ปีต่อมา 300,000', () => {
    expect(allowedOf({ salary: 2_000_000 }, { thaiEsg: 300_000 }, 'thaiEsg', '2566')).toBe(100_000)
    expect(allowedOf({ salary: 2_000_000 }, { thaiEsg: 300_000 }, 'thaiEsg', '2567')).toBe(300_000)
  })

  it('Thai ESGX: เงินใหม่เฉพาะปี 2568 · สับเปลี่ยน LTF ปี 2568 ไม่เกิน 300,000 ปี 2569 ไม่เกิน 50,000', () => {
    expect(allowedOf({ salary: 2_000_000 }, { thaiEsgxNew: 300_000 }, 'thaiEsgxNew', '2568')).toBe(300_000)
    expect(allowedOf({ salary: 2_000_000 }, { thaiEsgxNew: 300_000 }, 'thaiEsgxNew', '2569')).toBe(0)
    expect(allowedOf({ salary: 2_000_000 }, { thaiEsgxLtf: 400_000 }, 'thaiEsgxLtf', '2568')).toBe(300_000)
    expect(allowedOf({ salary: 2_000_000 }, { thaiEsgxLtf: 400_000 }, 'thaiEsgxLtf', '2569')).toBe(50_000)
  })
})

describe('ที่อยู่อาศัยและมาตรการเฉพาะปี', () => {
  const income = { salary: 2_000_000 }

  it('ดอกเบี้ยเงินกู้ไม่เกิน 100,000 · สร้างบ้านใหม่ 10,000 ต่อทุก 1 ล้าน สูงสุด 100,000', () => {
    expect(allowedOf(income, { mortgageInterest: 150_000 }, 'mortgageInterest')).toBe(100_000)
    expect(allowedOf(income, { newHouse: 3_500_000 }, 'newHouse', '2568')).toBe(30_000)
    expect(allowedOf(income, { newHouse: 15_000_000 }, 'newHouse', '2568')).toBe(100_000)
    expect(allowedOf(income, { newHouse: 3_500_000 }, 'newHouse', '2569')).toBe(0)
  })

  it('Easy E-Receipt: ปี 2567 สูงสุด 50,000 · ปี 2568 ทั่วไป 30,000 + ชุมชน 20,000 · ปี 2569 ยังไม่มี', () => {
    expect(allowedOf(income, { easyReceipt: 60_000 }, 'easyReceipt', '2567')).toBe(50_000)
    expect(allowedOf(income, { easyReceipt: 60_000 }, 'easyReceipt', '2568')).toBe(30_000)
    expect(allowedOf(income, { easyReceiptCommunity: 60_000 }, 'easyReceiptCommunity', '2568')).toBe(20_000)
    expect(allowedOf(income, { easyReceipt: 60_000 }, 'easyReceipt', '2569')).toBe(0)
  })
})

describe('มาตรา 47(7) เงินบริจาค', () => {
  it('บริจาคเพื่อการศึกษาหัก 2 เท่า แต่ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่ายและค่าลดหย่อน', () => {
    // 1,000,000 − 100,000 − 60,000 = 840,000 → เพดาน 84,000
    const r = calculateTax({ salary: 1_000_000 }, { donationEducation: 30_000 }, 0, { taxYear: '2568' })
    expect(r.deductionLines.find((l) => l.key === 'donationEducation')!.allowed).toBe(60_000)
    const capped = calculateTax({ salary: 1_000_000 }, { donationEducation: 50_000 }, 0, { taxYear: '2568' })
    expect(capped.deductionLines.find((l) => l.key === 'donationEducation')!.allowed).toBe(84_000)
  })

  it('บริจาคทั่วไปไม่เกิน 10% ของยอดที่เหลือ และบริจาคพรรคการเมืองแยก ไม่เกิน 10,000', () => {
    const r = calculateTax({ salary: 1_000_000 }, { donationGeneral: 200_000, politicalDonation: 20_000 }, 0, { taxYear: '2568' })
    expect(r.deductionLines.find((l) => l.key === 'politicalDonation')!.allowed).toBe(10_000)
    // 840,000 − 10,000 (พรรคการเมือง) = 830,000 → บริจาคทั่วไปไม่เกิน 83,000
    expect(r.deductionLines.find((l) => l.key === 'donationGeneral')!.allowed).toBe(83_000)
  })
})

describe('ผู้มีอายุ 65 ปีขึ้นไป / ผู้พิการ ยกเว้นเงินได้ 190,000 บาท', () => {
  it('หักก่อนค่าใช้จ่าย', () => {
    const r = calculateTax({ salary: 500_000 }, {}, 0, { taxYear: '2568', seniorExemption: true })
    expect(r.exemptIncome).toBe(190_000)
    // (500,000 − 190,000) หักค่าใช้จ่าย 50% แต่ไม่เกิน 100,000 → 210,000
    expect(r.incomeAfterExpense).toBe(210_000)
    expect(r.grossIncome - r.exemptIncome - r.totalExpense).toBe(r.incomeAfterExpense)
  })

  it('เลือกยกเว้นเงินได้ประเภทที่ช่วยลดฐานภาษีได้มากที่สุด', () => {
    // ยกเว้นดอกเบี้ย 40(4) ที่หักค่าใช้จ่ายไม่ได้ ดีกว่ายกเว้นเงินได้ธุรกิจที่หักเหมา 60%
    const r = calculateTax({ investment: 190_000, business: 500_000 }, {}, 0, { taxYear: '2568', seniorExemption: true })
    expect(r.exemptCategory).toBe('investment')
  })

  it('ไม่ได้ใช้สิทธิ ไม่มีการยกเว้น', () => {
    expect(calculateTax({ salary: 500_000 }, {}, 0).exemptIncome).toBe(0)
  })
})

describe('มาตรา 48(2) ภาษีขั้นต่ำ 0.5%', () => {
  it('เงินได้ 40(2)–(8) ถึงเกณฑ์ 120,000 แต่ภาษี 0.5% ไม่เกิน 5,000 บาท ได้รับยกเว้น', () => {
    expect(calculateTax({ business: 1_000_000 }, { rmf: 300_000 }).minimumTax.applies).toBe(false)
    expect(calculateTax({ business: 1_000_200 }, { rmf: 300_000 }).minimumTax.applies).toBe(true)
  })
})
