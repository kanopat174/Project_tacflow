/**
 * ตรวจเครื่องคำนวณภาษีอื่นเทียบกับกฎหมาย
 *  - ภาษีเงินได้นิติบุคคล: SME 0% / 15% / 20%, บริษัททั่วไป 20%, มูลนิธิ 2% / 10% ของรายได้
 *  - ภาษีมูลค่าเพิ่ม 7% และเกณฑ์จดทะเบียน 1.8 ล้านบาท
 *  - ภาษีหัก ณ ที่จ่ายตาม ท.ป.4/2528 คิดจากยอดก่อน VAT
 *  - เครดิตภาษีเงินปันผล มาตรา 47 ทวิ และกำไรขายหุ้นในตลาดหลักทรัพย์ได้รับยกเว้น
 */

import { describe, expect, it } from 'vitest'
import { calculateCorporateTax, type CorporateInput } from '../corporateEngine'
import { calculateVatReturn, extractVat, mustRegisterForVat } from '../vatEngine'
import { calculateWithholding } from '../withholdingEngine'
import { calculateCapitalGainsTax, calculateDividendTax, dividendCreditOf } from '../investmentEngine'

const corp = (over: Partial<CorporateInput>): CorporateInput => ({
  entityType: 'sme',
  paidUpCapital: 1_000_000,
  revenue: 10_000_000,
  expenses: 6_500_000,
  addBacks: 0,
  exemptIncome: 0,
  lossCarryforward: 0,
  withholdingTax: 0,
  halfYearTaxPaid: 0,
  section8Share: 0,
  ...over,
})

describe('ภาษีเงินได้นิติบุคคล', () => {
  it('SME กำไร 3.5 ล้าน: 300,000 แรกยกเว้น · ถึง 3 ล้าน 15% · ส่วนเกิน 20%', () => {
    expect(calculateCorporateTax(corp({})).tax).toBe(405_000 + 100_000)
  })

  it('ทุนชำระแล้วเกิน 5 ล้าน หรือรายได้เกิน 30 ล้าน ไม่ได้อัตรา SME', () => {
    expect(calculateCorporateTax(corp({ paidUpCapital: 6_000_000 })).tax).toBe(700_000)
    expect(calculateCorporateTax(corp({ revenue: 31_000_000, expenses: 27_500_000 })).tax).toBe(700_000)
  })

  it('บริษัททั่วไป 20% ของกำไรสุทธิทางภาษี หลังบวกรายจ่ายต้องห้ามและหักผลขาดทุนยกมา', () => {
    const r = calculateCorporateTax(corp({ entityType: 'standard', addBacks: 500_000, lossCarryforward: 1_000_000 }))
    expect(r.taxableProfit).toBe(3_000_000)
    expect(r.tax).toBe(600_000)
  })

  it('มูลนิธิ/สมาคม: 2% ของรายได้ 40(8) และ 10% ของรายได้ประเภทอื่น ไม่หักรายจ่าย', () => {
    const r = calculateCorporateTax(corp({ entityType: 'foundation', revenue: 1_000_000, section8Share: 0.6 }))
    expect(r.tax).toBeCloseTo(600_000 * 0.02 + 400_000 * 0.1)
  })
})

describe('ภาษีมูลค่าเพิ่ม', () => {
  it('ถอด VAT 7% จากราคารวม 107 บาท', () => {
    expect(extractVat(107)).toMatchObject({ net: 100, vat: 7 })
  })

  it('ภาษีขายหักภาษีซื้อ และยกเครดิตไปเดือนถัดไปเมื่อภาษีซื้อมากกว่า', () => {
    const r = calculateVatReturn({
      standardSales: 100_000,
      zeroRatedSales: 0,
      exemptSales: 0,
      purchases: 150_000,
      nonClaimableInputVat: 0,
      creditCarriedForward: 0,
      rate: 0.07,
    })
    expect(r.outputVat).toBe(7_000)
    expect(r.claimableInputVat).toBe(10_500)
    expect(r.creditToNextMonth).toBe(3_500)
    expect(r.payable).toBe(0)
  })

  it('ต้องจดทะเบียนเมื่อรายรับเกิน 1.8 ล้านบาทต่อปี', () => {
    expect(mustRegisterForVat(1_800_000)).toBe(false)
    expect(mustRegisterForVat(1_800_001)).toBe(true)
  })
})

describe('ภาษีหัก ณ ที่จ่าย', () => {
  const base = { amount: 10_700, amountIncludesVat: true, vatRegistered: true, payeeType: 'juristic' as const, vatRate: 0.07 }

  it('ค่าบริการหัก 3% จากยอดก่อน VAT ไม่ใช่จากยอดรวม', () => {
    const r = calculateWithholding({ ...base, typeKey: 'service' })
    expect(r.base).toBe(10_000)
    expect(r.withholdingTax).toBe(300)
    expect(r.netPayment).toBe(10_400)
    expect(r.form).toBe('ภ.ง.ด.53')
  })

  it.each([
    ['rent', 'individual', 0.05, 'ภ.ง.ด.3'],
    ['transport', 'juristic', 0.01, 'ภ.ง.ด.53'],
    ['advertising', 'juristic', 0.02, 'ภ.ง.ด.53'],
    ['prize', 'individual', 0.05, 'ภ.ง.ด.3'],
    ['dividend', 'individual', 0.1, 'ภ.ง.ด.2'],
    ['interest', 'individual', 0.15, 'ภ.ง.ด.2'],
    ['interest', 'juristic', 0.01, 'ภ.ง.ด.53'],
  ] as const)('%s จ่ายให้ %s หัก %d', (typeKey, payeeType, rate, form) => {
    const r = calculateWithholding({ ...base, amountIncludesVat: false, typeKey, payeeType })
    expect(r.rate).toBe(rate)
    expect(r.form).toBe(form)
  })
})

describe('เงินปันผลและกำไรจากการขายหุ้น', () => {
  it('เครดิตภาษีเงินปันผล = เงินปันผล × อัตราภาษีนิติบุคคล ÷ (100 − อัตรา)', () => {
    expect(dividendCreditOf(80_000, 0.2)).toBeCloseTo(20_000)
    expect(dividendCreditOf(85_000, 0.15)).toBeCloseTo(15_000)
    expect(dividendCreditOf(100_000, 0)).toBe(0)
  })

  it('เงินปันผลถูกหัก ณ ที่จ่าย 10% และดอกเบี้ย 15%', () => {
    const r = calculateDividendTax({
      thaiDividend: 100_000,
      payerCitRate: 0.2,
      interest: 10_000,
      foreignDividend: 0,
      foreignTaxPaid: 0,
      otherNetIncome: 0,
    })
    expect(r.thaiDividendWht).toBe(10_000)
    expect(r.interestWht).toBe(1_500)
    // ไม่มีเงินได้อื่น นำมารวมคำนวณแล้วได้เครดิตคืน จึงคุ้มกว่าให้หักเป็นภาษีสุดท้าย
    expect(r.better).toBe('included')
  })

  it('กำไรขายหุ้นในตลาดหลักทรัพย์และหน่วยลงทุนกองทุนไทยได้รับยกเว้น', () => {
    const r = calculateCapitalGainsTax({
      setGain: 500_000,
      thaiFundGain: 100_000,
      otcGain: 0,
      foreignGain: 0,
      foreignRemitted: 0,
      foreignTaxPaid: 0,
      otherNetIncome: 300_000,
    })
    expect(r.exemptGain).toBe(600_000)
    expect(r.taxableGain).toBe(0)
  })
})
