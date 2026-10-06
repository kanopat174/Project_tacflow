import { describe, expect, it } from 'vitest'
import { calculateWithholding, withholdingRateOf, type WithholdingInput } from '../withholdingEngine'

function input(overrides: Partial<WithholdingInput> = {}): WithholdingInput {
  return {
    amount: 100_000,
    amountIncludesVat: false,
    vatRegistered: true,
    typeKey: 'service',
    payeeType: 'juristic',
    vatRate: 0.07,
    ...overrides,
  }
}

describe('ฐานที่ใช้คำนวณภาษีหัก ณ ที่จ่าย', () => {
  it('หักจากยอดก่อนภาษีมูลค่าเพิ่มเสมอ', () => {
    const result = calculateWithholding(input())
    expect(result.base).toBe(100_000)
    expect(result.vat).toBe(7_000)
    expect(result.grossInvoice).toBe(107_000)
    expect(result.withholdingTax).toBe(3_000) // 3% ของ 100,000 ไม่ใช่ของ 107,000
    expect(result.netPayment).toBe(104_000)
  })

  it('กรอกยอดที่รวมภาษีมูลค่าเพิ่มมาแล้ว ระบบถอด VAT ออกก่อนหัก', () => {
    const result = calculateWithholding(input({ amount: 107_000, amountIncludesVat: true }))
    expect(result.base).toBe(100_000)
    expect(result.withholdingTax).toBe(3_000)
    expect(result.netPayment).toBe(104_000)
  })

  it('ผู้รับที่ไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม ไม่มี VAT ในใบแจ้งหนี้', () => {
    const result = calculateWithholding(input({ vatRegistered: false }))
    expect(result.vat).toBe(0)
    expect(result.grossInvoice).toBe(100_000)
    expect(result.withholdingTax).toBe(3_000)
    expect(result.netPayment).toBe(97_000)
  })
})

describe('อัตราตามประเภทเงินได้และประเภทผู้รับ', () => {
  it('ค่าเช่าอสังหาริมทรัพย์หัก 5%', () => {
    expect(calculateWithholding(input({ typeKey: 'rent' })).withholdingTax).toBe(5_000)
  })

  it('ค่าขนส่งหัก 1%', () => {
    expect(calculateWithholding(input({ typeKey: 'transport' })).withholdingTax).toBe(1_000)
  })

  it('ค่าโฆษณาหัก 2%', () => {
    expect(calculateWithholding(input({ typeKey: 'advertising' })).withholdingTax).toBe(2_000)
  })

  it('ดอกเบี้ยหักต่างกันระหว่างบุคคลธรรมดากับนิติบุคคล', () => {
    expect(withholdingRateOf('interest', 'individual')).toBe(0.15)
    expect(withholdingRateOf('interest', 'juristic')).toBe(0.01)
  })

  it('เบี้ยประกันวินาศภัยไม่ต้องหักเมื่อผู้รับเป็นบุคคลธรรมดา', () => {
    const result = calculateWithholding(input({ typeKey: 'insurancePremium', payeeType: 'individual' }))
    expect(result.notApplicable).toBe(true)
    expect(result.withholdingTax).toBe(0)
  })
})

describe('แบบที่ใช้นำส่ง', () => {
  it('ผู้รับบุคคลธรรมดาใช้ ภ.ง.ด.3 ผู้รับนิติบุคคลใช้ ภ.ง.ด.53', () => {
    expect(calculateWithholding(input({ payeeType: 'individual' })).form).toBe('ภ.ง.ด.3')
    expect(calculateWithholding(input({ payeeType: 'juristic' })).form).toBe('ภ.ง.ด.53')
  })

  it('เงินปันผลใช้ ภ.ง.ด.2 ทั้งสองประเภทผู้รับ', () => {
    expect(calculateWithholding(input({ typeKey: 'dividend', payeeType: 'individual' })).form).toBe('ภ.ง.ด.2')
  })
})

describe('กรณีขอบ', () => {
  it('ยอดเงินติดลบคิดเป็นศูนย์', () => {
    const result = calculateWithholding(input({ amount: -5_000 }))
    expect(result.base).toBe(0)
    expect(result.withholdingTax).toBe(0)
    expect(result.netPayment).toBe(0)
  })
})
