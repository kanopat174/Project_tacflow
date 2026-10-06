import { describe, expect, it } from 'vitest'
import { addVat, calculateVatReturn, extractVat, mustRegisterForVat } from '../vatEngine'

describe('การบวกและแยกภาษีมูลค่าเพิ่ม', () => {
  it('บวก 7% เข้ากับราคาที่ยังไม่รวมภาษี', () => {
    const result = addVat(1_000)
    expect(result.vat).toBe(70)
    expect(result.gross).toBe(1_070)
  })

  it('แยกภาษีออกจากราคาที่รวมภาษีแล้ว', () => {
    const result = extractVat(1_070)
    expect(result.net).toBeCloseTo(1_000, 6)
    expect(result.vat).toBeCloseTo(70, 6)
  })

  it('บวกแล้วแยกกลับได้ราคาเดิม', () => {
    const added = addVat(12_345.67)
    const back = extractVat(added.gross)
    expect(back.net).toBeCloseTo(12_345.67, 6)
  })

  it('ราคาติดลบหรือไม่ใช่ตัวเลขคิดเป็นศูนย์', () => {
    expect(addVat(-500).vat).toBe(0)
    expect(extractVat(Number.NaN).net).toBe(0)
  })
})

describe('สรุปภาษีมูลค่าเพิ่มรายเดือน', () => {
  const base = {
    standardSales: 0,
    zeroRatedSales: 0,
    exemptSales: 0,
    purchases: 0,
    nonClaimableInputVat: 0,
    creditCarriedForward: 0,
    rate: 0.07,
  }

  it('ภาษีขายมากกว่าภาษีซื้อ ต้องชำระส่วนต่าง', () => {
    const result = calculateVatReturn({ ...base, standardSales: 1_000_000, purchases: 400_000 })
    expect(result.outputVat).toBe(70_000)
    expect(result.claimableInputVat).toBe(28_000)
    expect(result.payable).toBe(42_000)
    expect(result.creditToNextMonth).toBe(0)
  })

  it('ภาษีซื้อมากกว่าภาษีขาย ยกเครดิตไปเดือนถัดไป', () => {
    const result = calculateVatReturn({ ...base, standardSales: 100_000, purchases: 500_000 })
    expect(result.payable).toBe(0)
    expect(result.creditToNextMonth).toBe(28_000)
  })

  it('ภาษีซื้อต้องห้ามถูกตัดออกจากยอดที่หักได้', () => {
    const result = calculateVatReturn({
      ...base,
      standardSales: 1_000_000,
      purchases: 400_000,
      nonClaimableInputVat: 8_000,
    })
    expect(result.claimableInputVat).toBe(20_000)
    expect(result.payable).toBe(50_000)
  })

  it('เครดิตยกมาจากเดือนก่อนนำมาหักได้', () => {
    const result = calculateVatReturn({
      ...base,
      standardSales: 1_000_000,
      purchases: 400_000,
      creditCarriedForward: 12_000,
    })
    expect(result.payable).toBe(30_000)
  })

  it('ขายอัตราศูนย์ไม่มีภาษีขาย แต่ยังขอคืนภาษีซื้อได้', () => {
    const result = calculateVatReturn({ ...base, zeroRatedSales: 2_000_000, purchases: 300_000 })
    expect(result.outputVat).toBe(0)
    expect(result.creditToNextMonth).toBe(21_000)
  })

  it('ยอดขายที่ได้รับยกเว้นไม่นับรวมในเกณฑ์จดทะเบียน', () => {
    const result = calculateVatReturn({
      ...base,
      standardSales: 1_000_000,
      exemptSales: 5_000_000,
    })
    expect(result.totalSales).toBe(6_000_000)
    expect(result.taxableTurnover).toBe(1_000_000)
  })
})

describe('เกณฑ์จดทะเบียนภาษีมูลค่าเพิ่ม', () => {
  it('รายรับเกิน 1.8 ล้านบาทต่อปีต้องจดทะเบียน', () => {
    expect(mustRegisterForVat(1_800_000)).toBe(false)
    expect(mustRegisterForVat(1_800_001)).toBe(true)
  })
})
