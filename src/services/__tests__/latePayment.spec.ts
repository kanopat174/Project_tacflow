import { describe, expect, it } from 'vitest'
import {
  addMonths,
  calculateLatePayment,
  canPayInInstallments,
  filingDeadline,
  installmentPlan,
  installmentSurcharge,
  paymentSchedule,
  surcharge,
  surchargeMonths,
} from '../latePayment'

describe('กำหนดยื่นและการนับเดือน', () => {
  it('ปีภาษี 2568 ยื่นกระดาษ 31 มี.ค. 2569 ออนไลน์ 8 เม.ย. 2569', () => {
    expect(filingDeadline('2568', 'paper')).toBe('2026-03-31')
    expect(filingDeadline('2568', 'online')).toBe('2026-04-08')
  })

  it('บวกเดือนแล้วตัดวันให้อยู่ในเดือน', () => {
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30')
    expect(addMonths('2026-03-31', 2)).toBe('2026-05-31')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-11-08', 2)).toBe('2027-01-08')
  })

  it('เศษของเดือนนับเป็นหนึ่งเดือน', () => {
    expect(surchargeMonths('2026-04-08', '2026-04-08')).toBe(0)
    expect(surchargeMonths('2026-04-08', '2026-04-09')).toBe(1)
    expect(surchargeMonths('2026-04-08', '2026-05-08')).toBe(1)
    expect(surchargeMonths('2026-04-08', '2026-05-09')).toBe(2)
  })
})

describe('เงินเพิ่มตามมาตรา 27', () => {
  it('ภาษี 10,000 ช้า 1 วัน เสียเงินเพิ่ม 150', () => {
    expect(surcharge(10_000, '2026-04-08', '2026-04-09')).toBe(150)
  })

  it('เงินเพิ่มไม่เกินจำนวนภาษี', () => {
    // 1.5% × 80 เดือน = 120% ต้องตัดเหลือ 100%
    expect(surcharge(10_000, '2020-04-08', '2026-12-01')).toBe(10_000)
  })
})

describe('ยื่นและชำระล่าช้า', () => {
  it('ยื่นช้า 5 วันพร้อมชำระ — เงินเพิ่ม 1 เดือน ค่าปรับ 200', () => {
    const r = calculateLatePayment({ tax: 20_000, deadline: '2026-04-08', filedDate: '2026-04-13', paidDate: '2026-04-13' })
    expect(r.filedLate).toBe(true)
    expect(r.daysLate).toBe(5)
    expect(r.surcharge).toBe(300)
    expect(r.fine).toBe(200)
    expect(r.total).toBe(20_500)
  })

  it('ยื่นช้าเกิน 7 วัน ค่าปรับ 1,000', () => {
    const r = calculateLatePayment({ tax: 20_000, deadline: '2026-04-08', filedDate: '2026-06-20', paidDate: '2026-06-20' })
    expect(r.months).toBe(3)
    expect(r.surcharge).toBe(900)
    expect(r.fine).toBe(1_000)
  })

  it('ยื่นช้าแต่ไม่มีภาษีต้องชำระ เสียแค่ค่าปรับ', () => {
    const r = calculateLatePayment({ tax: 0, deadline: '2026-04-08', filedDate: '2026-04-20', paidDate: '' })
    expect(r.surcharge).toBe(0)
    expect(r.fine).toBe(1_000)
  })

  it('ยื่นทันแต่ชำระช้า ไม่มีค่าปรับ มีแค่เงินเพิ่ม', () => {
    const r = calculateLatePayment({ tax: 5_000, deadline: '2026-04-08', filedDate: '2026-04-01', paidDate: '2026-05-20' })
    expect(r.fine).toBe(0)
    expect(r.surcharge).toBe(150)
  })
})

describe('ผ่อนชำระ 3 งวดตามมาตรา 64', () => {
  it('ต้องมีภาษีตั้งแต่ 3,000 บาทและยื่นทันกำหนด', () => {
    expect(canPayInInstallments(2_999.99)).toBe(false)
    expect(canPayInInstallments(3_000)).toBe(true)
    expect(canPayInInstallments(10_000, false)).toBe(false)
  })

  it('แบ่งเป็นสตางค์ให้รวมได้ยอดเดิม เศษไว้งวดแรก', () => {
    const plan = installmentPlan(10_000, '2026-03-31')
    expect(plan.map((p) => p.amount)).toEqual([3_333.34, 3_333.33, 3_333.33])
    expect(plan.map((p) => p.dueDate)).toEqual(['2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('ตารางชำระบอกสถานะของแต่ละงวด ณ วันนี้', () => {
    const rows = paymentSchedule(
      9_000,
      '2568',
      { mode: 'installments', channel: 'online', paidDates: ['2026-04-01'] },
      '2026-05-20',
    )
    expect(rows.map((r) => r.status)).toEqual(['paid', 'overdue', 'upcoming'])
    expect(rows[0]!.surcharge).toBe(0)
    expect(rows[1]!.surcharge).toBe(45)
    expect(rows[2]!.dueDate).toBe('2026-06-08')
  })

  it('ภาษีต่ำกว่า 3,000 เลือกผ่อนไว้ก็ได้งวดเดียว', () => {
    const rows = paymentSchedule(2_000, '2568', { mode: 'installments', channel: 'paper', paidDates: [] }, '2026-03-01')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.dueDate).toBe('2026-03-31')
  })

  it('งวดที่จ่ายช้าเสียเงินเพิ่มเฉพาะงวดนั้น', () => {
    const [, second] = installmentPlan(9_000, '2026-04-08')
    expect(installmentSurcharge(second!, '2026-05-08')).toBe(0)
    expect(installmentSurcharge(second!, '2026-05-10')).toBe(45)
  })
})
