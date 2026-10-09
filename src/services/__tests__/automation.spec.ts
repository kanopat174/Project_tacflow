import { beforeEach, describe, expect, it } from 'vitest'
import { memoryKey, recallEntry, rememberEntry, type MemoryItem } from '../entryMemory'
import { addYears, holdingYears, lotStatuses, purchasesInTaxYear, rmfGaps, type FundLot } from '../fundHoldings'
import { buildDeductionImport, classifyDeduction, previousYearFiling } from '../deductionImport'
import { detectDeductionReceipt } from '../receiptParse'
import { decryptBackup, encryptBackup, isEncryptedBackup } from '../backupCrypto'
import { checkPin, lockoutDelayMs, readLockout, recordFailure, removePin, setPin } from '../appLock'
import { efilingSections, plainMoney } from '../efilingFields'

const today = '2026-10-09'

describe('จำรายการที่เคยบันทึก', () => {
  it('ปรับชื่อคู่โอนให้เทียบกันได้ ตัดคำนำหน้าและเลขบัญชี', () => {
    expect(memoryKey('นาง สมศรี ใจดี')).toBe('สมศรี ใจดี')
    expect(memoryKey('นางสมศรี ใจดี xxx-x-x1234-x')).toBe('สมศรี ใจดี')
    expect(memoryKey('MRS. Somsri Jaidee')).toBe('somsri jaidee')
    expect(memoryKey('ก')).toBe('')
  })

  const slip = { source: 'นาง สมศรี ใจดี', type: 'expense' as const, mode: 'personal' as const }

  it('คนเดิม ยอดเดิม เติมหมวดและรายละเอียดเดิม', () => {
    let items: MemoryItem[] = []
    items = rememberEntry(items, { ...slip, amount: 4500, categoryKey: 'housing', note: 'ค่าเช่าห้อง' }, '2026-08-01')
    items = rememberEntry(items, { ...slip, amount: 300, categoryKey: 'food', note: 'ฝากซื้อกับข้าว' }, '2026-08-05')
    const hit = recallEntry(items, { ...slip, source: 'นางสมศรี ใจดี', amount: 4500 })
    // ผู้ใช้เปลี่ยนหมวดล่าสุดเป็น food — หมวดของคู่โอนนี้ตามค่าล่าสุดทั้งหมด
    expect(hit).toMatchObject({ note: 'ค่าเช่าห้อง', sameAmount: true })
  })

  it('คนเดิม ยอดต่าง ใช้รายการที่บ่อยที่สุด', () => {
    let items: MemoryItem[] = []
    for (let i = 0; i < 3; i++) {
      items = rememberEntry(items, { ...slip, amount: 4500, categoryKey: 'housing', note: 'ค่าเช่าห้อง' }, `2026-0${i + 1}-01`)
    }
    expect(recallEntry(items, { ...slip, amount: 5000 })).toMatchObject({
      categoryKey: 'housing',
      note: 'ค่าเช่าห้อง',
      sameAmount: false,
    })
  })

  it('จำหมวดที่ผู้ใช้แก้ล่าสุด', () => {
    let items: MemoryItem[] = []
    const base = { source: '7-Eleven สาขา 123', type: 'expense' as const, mode: 'personal' as const, amount: 65, note: '7-Eleven' }
    items = rememberEntry(items, { ...base, categoryKey: 'otherExpense' }, '2026-09-01')
    items = rememberEntry(items, { ...base, categoryKey: 'food' }, '2026-09-02')
    expect(recallEntry(items, { ...base, amount: 120 })?.categoryKey).toBe('food')
  })

  it('ไม่ปนข้ามประเภทหรือโหมด', () => {
    const items = rememberEntry([], { ...slip, amount: 100, categoryKey: 'food', note: '' }, today)
    expect(recallEntry(items, { ...slip, type: 'income', amount: 100 })).toBeNull()
    expect(recallEntry(items, { ...slip, mode: 'freelancer', amount: 100 })).toBeNull()
  })
})

describe('ระยะถือกองทุนลดหย่อน', () => {
  const lot = (kind: FundLot['kind'], buyDate: string, amount = 10_000): FundLot => ({
    id: `${kind}-${buyDate}`,
    kind,
    name: kind,
    buyDate,
    amount,
  })

  it('นับวันชนวัน และ 29 ก.พ. เลื่อนเป็น 1 มี.ค.', () => {
    expect(addYears('2024-12-25', 5)).toBe('2029-12-25')
    expect(addYears('2024-02-29', 5)).toBe('2029-03-01')
  })

  it('Thai ESG ปี 2566 ถือ 8 ปี ตั้งแต่ 2567 ถือ 5 ปี · SSF 10 ปี', () => {
    expect(holdingYears({ kind: 'thaiEsg', buyDate: '2023-12-20' })).toBe(8)
    expect(holdingYears({ kind: 'thaiEsg', buyDate: '2024-01-01' })).toBe(5)
    expect(holdingYears({ kind: 'ssf', buyDate: '2022-06-01' })).toBe(10)
    expect(holdingYears({ kind: 'thaiEsgx', buyDate: '2025-04-01' })).toBe(5)
  })

  it('บอกวันที่ขายได้และก้อนที่ขายได้แล้ว', () => {
    const [first, second] = lotStatuses([lot('ssf', '2016-01-05'), lot('thaiEsg', '2024-12-25')], today, null)
    expect(first).toMatchObject({ sellable: true, daysLeft: 0, sellableOn: '2026-01-05' })
    expect(second).toMatchObject({ sellable: false, sellableOn: '2029-12-25' })
  })

  it('RMF ขายได้เมื่อครบทั้ง 5 ปีจากก้อนแรกและอายุ 55 ปี', () => {
    const lots = [lot('rmf', '2020-03-01'), lot('rmf', '2025-03-01')]
    expect(lotStatuses(lots, today, null)[0]!.sellableOn).toBeNull()
    // อายุ 55 ปีตอน 2030 — ช้ากว่า 5 ปีของก้อนแรก
    expect(lotStatuses(lots, today, '1975-06-15').map((s) => s.sellableOn)).toEqual(['2030-06-15', '2030-06-15'])
    // อายุครบ 55 แล้ว — ใช้ 5 ปีจากก้อนแรก ทุกก้อนขายพร้อมกัน
    expect(lotStatuses(lots, today, '1960-01-01')[0]).toMatchObject({ sellableOn: '2025-03-01', sellable: true })
  })

  it('เตือน RMF เว้นการซื้อเกิน 1 ปีติดต่อกัน', () => {
    expect(rmfGaps([lot('rmf', '2020-03-01'), lot('rmf', '2023-03-01')], '2025-06-01')).toEqual([[2021, 2022]])
    // ปีนี้ (2026) ยังซื้อทัน แต่ 2024–2025 ผ่านไปแล้วโดยไม่ได้ซื้อ
    expect(rmfGaps([lot('rmf', '2020-03-01'), lot('rmf', '2022-03-01'), lot('rmf', '2023-03-01')], today)).toEqual([[2024, 2025]])
    expect(rmfGaps([lot('rmf', '2020-03-01'), lot('rmf', '2022-03-01'), lot('rmf', '2024-03-01')], today)).toEqual([])
  })

  it('รวมยอดซื้อตามปีภาษี', () => {
    expect(purchasesInTaxYear([lot('rmf', '2026-02-01', 5000), lot('rmf', '2026-11-01', 7000), lot('ssf', '2025-01-01')], '2569')).toEqual({
      rmf: 12_000,
    })
  })
})

describe('ดึงค่าลดหย่อนอัตโนมัติ', () => {
  it('จับประเภทจากรายละเอียด', () => {
    expect(classifyDeduction('personal', 'insurance', 'เบี้ยประกันชีวิต AIA')?.key).toBe('lifeInsurance')
    expect(classifyDeduction('personal', 'insurance', 'ประกันสุขภาพ')?.key).toBe('healthInsurance')
    expect(classifyDeduction('personal', 'insurance', 'ประกันสุขภาพพ่อ')?.key).toBe('parentHealthInsurance')
    expect(classifyDeduction('personal', 'insurance', 'ประกันรถชั้น 1')).toMatchObject({ key: null })
    expect(classifyDeduction('personal', 'insurance', 'เบี้ยประกัน')).toMatchObject({ key: null })
    expect(classifyDeduction('personal', 'savingInvest', 'ซื้อ RMF')?.key).toBe('rmf')
    expect(classifyDeduction('personal', 'savingInvest', 'ฝากประจำ')).toBeNull()
    expect(classifyDeduction('company', 'insurance', 'ประกันชีวิต')).toBeNull()
  })

  const workspaces = [{ id: 'w1', name: 'สมุดส่วนตัว', mode: 'personal' as const }]
  const entry = (date: string, categoryKey: string, amount: number, note: string) => ({
    workspaceId: 'w1',
    date,
    type: 'expense' as const,
    categoryKey,
    amount,
    note,
  })

  it('รวมจากสมุด กองทุน และปีก่อน โดยไม่นับซ้ำ', () => {
    const result = buildDeductionImport({
      workspaces,
      entries: [
        entry('2026-03-01', 'insurance', 12_000, 'ประกันชีวิต'),
        entry('2026-09-01', 'insurance', 12_000, 'ประกันชีวิต'),
        entry('2026-05-01', 'savingInvest', 50_000, 'RMF'),
        entry('2025-05-01', 'insurance', 9_000, 'ประกันสุขภาพ'),
        entry('2026-06-01', 'insurance', 8_000, 'ประกันรถ'),
      ],
      taxYearBE: '2569',
      fundLots: [{ id: 'f1', kind: 'rmf', name: 'K-RMF', buyDate: '2026-05-01', amount: 50_000 }],
      lastYear: { taxYear: '2568', deductions: { healthInsurance: 15_000, lifeInsurance: 30_000, mortgageInterest: 0 } },
    })
    const byKey = Object.fromEntries(result.lines.map((l) => [l.key, l]))
    expect(byKey.lifeInsurance).toMatchObject({ amount: 24_000, source: 'ledger' })
    // RMF จดในหน้ากองทุนแล้ว ไม่นับจากสมุดซ้ำ
    expect(byKey.rmf).toMatchObject({ amount: 50_000, source: 'funds' })
    // ปีนี้ไม่มีประกันสุขภาพในสมุด ยกจากปีก่อน
    expect(byKey.healthInsurance).toMatchObject({ amount: 15_000, source: 'lastYear' })
    expect(byKey.mortgageInterest).toBeUndefined()
    expect(result.skipped).toEqual([expect.objectContaining({ note: 'ประกันรถ', amount: 8_000 })])
  })

  it('หาแบบปีก่อนฉบับล่าสุด', () => {
    const filings = [
      { taxYear: '2568', submittedAt: '2026-02-01', id: 'a' },
      { taxYear: '2568', submittedAt: '2026-03-01', id: 'b' },
      { taxYear: '2567', submittedAt: '2025-03-01', id: 'c' },
    ]
    expect(previousYearFiling(filings, '2569')?.id).toBe('b')
    expect(previousYearFiling(filings, '2567')).toBeNull()
  })
})

describe('OCR ใบเสร็จค่าลดหย่อน', () => {
  it('แยกประเภทใบเสร็จ', () => {
    expect(detectDeductionReceipt('ใบเสร็จรับเงิน เบี้ยประกันชีวิต งวดที่ 3')?.kind).toBe('lifeInsurance')
    expect(detectDeductionReceipt('บริษัท ... ประกันภัยสุขภาพ รายปี')?.kind).toBe('healthInsurance')
    expect(detectDeductionReceipt('ยืนยันการซื้อหน่วยลงทุน K-ESGSI-ThaiESG')?.kind).toBe('thaiEsg')
    expect(detectDeductionReceipt('SCBRMF2 คำสั่งซื้อ')?.kind).toBe('rmf')
    expect(detectDeductionReceipt('KTAG70/30-ThaiESGX')?.kind).toBe('thaiEsgx')
    expect(detectDeductionReceipt('โรงพยาบาล ค่ารักษาพยาบาล 1,200.00')).toBeNull()
    expect(detectDeductionReceipt('7-ELEVEN รวม 65.00')).toBeNull()
  })
})

describe('เข้ารหัสไฟล์สำรอง', () => {
  it('เข้ารหัสแล้วถอดกลับได้ด้วยรหัสผ่านเดิมเท่านั้น', async () => {
    const plain = JSON.stringify({ app: 'taxflow', citizenId: '1101700203451' })
    const encrypted = await encryptBackup(plain, 'correct horse')
    expect(isEncryptedBackup(encrypted)).toBe(true)
    expect(isEncryptedBackup(plain)).toBe(false)
    expect(encrypted).not.toContain('1101700203451')
    expect(await decryptBackup(encrypted, 'correct horse')).toBe(plain)
    await expect(decryptBackup(encrypted, 'wrong password')).rejects.toThrow('รหัสผ่านไม่ถูกต้อง')
  }, 20_000)
})

describe('ล็อกแอปด้วย PIN', () => {
  beforeEach(() => localStorage.clear())

  it('ตั้ง ตรวจ และลบ PIN', async () => {
    await setPin('u1', '2468')
    expect(localStorage.getItem('taxflow_pin_u1')).not.toContain('2468')
    expect(await checkPin('u1', '2468')).toBe(true)
    expect(await checkPin('u1', '1357')).toBe(false)
    removePin('u1')
    expect(await checkPin('u1', '0000')).toBe(true)
    await expect(setPin('u1', '12a4')).rejects.toThrow('ตัวเลข 4–6 หลัก')
  }, 20_000)

  it('ใส่ผิดเกิน 5 ครั้งต้องรอนานขึ้นเรื่อย ๆ', () => {
    expect(lockoutDelayMs(4)).toBe(0)
    expect(lockoutDelayMs(5)).toBe(30_000)
    expect(lockoutDelayMs(6)).toBe(60_000)
    expect(lockoutDelayMs(50)).toBe(3_600_000)
    for (let i = 0; i < 5; i++) recordFailure('u1', 1_000)
    expect(readLockout('u1')).toEqual({ fails: 5, until: 31_000 })
  })
})

describe('ตัวช่วยกรอก e-Filing', () => {
  it('เรียงตัวเลขตามหน้าจอและให้คัดลอกเป็นตัวเลขล้วน', () => {
    const sections = efilingSections({
      taxpayer: { citizenId: '1-1017-00203-45-1' },
      income: { salary: 600_000, freelance: 0 },
      deductions: { personal: 60_000, children: 60_000, lifeInsurance: 25_000.5, socialSecurity: 9_000 },
      withholdingTax: 12_345,
    })
    expect(sections.map((s) => s.title)[0]).toBe('เข้าสู่ระบบ e-Filing')
    const fields = sections.flatMap((s) => s.fields)
    expect(fields.find((f) => f.id === 'citizenId')?.copy).toBe('1101700203451')
    expect(fields.find((f) => f.id === 'income:salary')?.copy).toBe('600000.00')
    expect(fields.find((f) => f.id === 'withholding')?.copy).toBe('12345.00')
    expect(fields.find((f) => f.id === 'children')).toMatchObject({ copy: '2', display: '2 คน' })
    expect(fields.find((f) => f.id === 'deduction:lifeInsurance')?.copy).toBe('25000.50')
    // ค่าลดหย่อนส่วนตัว e-Filing ใส่เอง ไม่ต้องคัดลอก
    expect(fields.some((f) => f.id === 'deduction:personal')).toBe(false)
    expect(fields.some((f) => f.id === 'income:freelance')).toBe(false)
    expect(plainMoney(0.1 + 0.2)).toBe('0.30')
  })
})
