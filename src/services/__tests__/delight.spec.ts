import { describe, expect, it } from 'vitest'
import { parseQuickEntry } from '../quickParse'
import { frequentEntries } from '../frequentEntries'
import { liveTax } from '../liveTax'
import { mondayOf, weeklyRecap } from '../weeklyRecap'
import { toTangible } from '../tangible'
import { activeSeasonalAccessories, isEarlyFiler, taxSeason, taxSeasonMission } from '../seasons'
import { taxBreakdown } from '../taxBreakdown'
import { buildOnboardingPlan } from '../onboarding'
import { parseReceipt } from '../receiptParse'
import { calculateTax } from '../taxEngine'
import { unlockedAccessories } from '../gamification'

const TODAY = '2026-10-07'

describe('พิมพ์ประโยคแล้วเป็นรายการ', () => {
  const p = (text: string) => parseQuickEntry(text, 'personal', TODAY)

  it('รายจ่ายพื้นฐาน เดาหมวดจากคำ', () => {
    expect(p('กาแฟ 65')).toEqual({ type: 'expense', amount: 65, date: TODAY, note: 'กาแฟ', categoryKey: 'food' })
    expect(p('ค่าไฟ 1,200')).toMatchObject({ amount: 1200, categoryKey: 'utilities' })
    expect(p('ค่าน้ำมัน 800')).toMatchObject({ categoryKey: 'transport' })
  })

  it('รายรับจากคำหรือเครื่องหมาย +', () => {
    expect(p('เงินเดือน 30000')).toMatchObject({ type: 'income', categoryKey: 'salary' })
    expect(p('+500 ขายของ')).toMatchObject({ type: 'income', amount: 500 })
  })

  it('วันที่แบบคำและแบบตัวเลข', () => {
    expect(p('ข้าว 60 เมื่อวาน')).toMatchObject({ date: '2026-10-06', note: 'ข้าว' })
    expect(p('ข้าว 60 เมื่อวานซืน')?.date).toBe('2026-10-05')
    expect(p('ค่าเช่า 5500 3/10')).toMatchObject({ date: '2026-10-03', amount: 5500 })
    // วันในอนาคตของปีนี้ = ปีที่แล้ว
    expect(p('ค่าเทอม 20000 15/12')?.date).toBe('2025-12-15')
  })

  it('หน่วย k พัน หมื่น และเลือกตัวเลขที่ถูก', () => {
    expect(p('ค่าไฟ 1.2k')?.amount).toBe(1200)
    expect(p('โบนัส 2หมื่น')).toMatchObject({ type: 'income', amount: 20_000 })
    expect(p('ข้าว 7-11 60')?.amount).toBe(60)
  })

  it('ไม่มีตัวเลขคือไม่ใช่รายการ', () => {
    expect(p('กาแฟ')).toBeNull()
    expect(p('')).toBeNull()
  })
})

describe('รายการที่จดบ่อย', () => {
  it('นับเฉพาะที่ซ้ำและอยู่ในช่วงเวลา เรียงจากบ่อยสุด', () => {
    const e = (date: string, amount: number, note = '') => ({ date, type: 'expense' as const, categoryKey: 'food', amount, note })
    const list = frequentEntries(
      [e('2026-10-01', 60, 'ข้าว'), e('2026-10-02', 60, 'ข้าว'), e('2026-10-03', 60), e('2026-10-04', 45, 'BTS'), e('2026-10-05', 45), e('2026-01-01', 99), e('2026-01-02', 99)],
      TODAY,
    )
    expect(list.map((x) => [x.amount, x.count, x.note])).toEqual([
      [60, 3, 'ข้าว'],
      [45, 2, 'BTS'],
    ])
  })
})

describe('ภาษีของปีนี้แบบสด', () => {
  const ws = [{ id: 'w', name: 'ส่วนตัว', mode: 'personal' as const }]
  const salary = (m: number) => ({ workspaceId: 'w', date: `2026-${String(m).padStart(2, '0')}-01`, type: 'income' as const, categoryKey: 'salary', amount: 50_000, withholdingTax: 1_000 })

  it('เงินเดือนทุกเดือนคาดการณ์ได้ 12 เดือนพอดี', () => {
    const r = liveTax(ws, Array.from({ length: 10 }, (_, i) => salary(i + 1)), TODAY, { personal: 60_000 })!
    expect(r.taxYear).toBe('2569')
    expect(r.ytdIncome).toBe(500_000)
    expect(r.projectedIncome).toBe(600_000)
    expect(r.projectedWithholding).toBe(12_000)
    expect(r.projected.tax).toBe(calculateTax({ salary: 600_000 }, { personal: 60_000 }, 0, { taxYear: '2569' }).tax)
    expect(r.confident).toBe(true)
  })

  it('ไม่มีรายรับปีนี้คืน null และเดือนเดียวยังไม่มั่นใจ', () => {
    expect(liveTax(ws, [], TODAY, {})).toBeNull()
    expect(liveTax(ws, [salary(10)], TODAY, {})!.confident).toBe(false)
  })
})

describe('สรุปสัปดาห์', () => {
  it('จันทร์ของสัปดาห์', () => {
    expect(mondayOf('2026-10-07')).toBe('2026-10-05')
    expect(mondayOf('2026-10-05')).toBe('2026-10-05')
    expect(mondayOf('2026-10-11')).toBe('2026-10-05')
  })

  it('เทียบกับสัปดาห์ก่อนและหาหมวดที่พุ่ง', () => {
    const e = (date: string, categoryKey: string, amount: number, type: 'income' | 'expense' = 'expense') => ({ workspaceId: 'w', date, type, categoryKey, amount })
    const r = weeklyRecap(
      [e('2026-09-22', 'food', 1000), e('2026-09-30', 'food', 1500), e('2026-10-01', 'transport', 500), e('2026-10-02', 'salary', 9000, 'income'), e('2026-10-06', 'food', 999)],
      { w: 'personal' },
      TODAY,
    )!
    expect(r.from).toBe('2026-09-28')
    expect(r.to).toBe('2026-10-04')
    expect(r.expense).toBe(2000)
    expect(r.income).toBe(9000)
    expect(r.expenseChange).toBe(1)
    expect(r.topCategory).toEqual({ label: 'อาหารและของใช้', amount: 1500 })
    expect(r.biggestRise).toEqual({ label: 'อาหารและของใช้', amount: 500 })
    expect(r.daysLogged).toBe(3)
  })

  it('สัปดาห์ที่แล้วไม่มีรายการคืน null', () => {
    expect(weeklyRecap([], {}, TODAY)).toBeNull()
  })
})

describe('แปลงเงินเป็นของ', () => {
  it('เลือกของที่ได้ 3–300 ชิ้น และคงที่ตาม seed', () => {
    const t = toTangible(4_200, 0)!
    expect(t.count).toBeGreaterThanOrEqual(3)
    expect(t.count).toBeLessThanOrEqual(300)
    expect(toTangible(4_200, 0)).toEqual(t)
    expect(toTangible(4_200, 0)!.text).toBe('ชานมไข่มุก 84 แก้ว')
  })

  it('ยอดน้อยเกินไม่แปลง', () => {
    expect(toTangible(10)).toBeNull()
  })
})

describe('เทศกาลและฤดูยื่นภาษี', () => {
  it('ของเทศกาลตามช่วงวัน รวมช่วงข้ามปี', () => {
    expect(activeSeasonalAccessories('2026-12-25').map((s) => s.key)).toEqual(['santa'])
    expect(activeSeasonalAccessories('2027-01-03').map((s) => s.key)).toEqual(['santa'])
    expect(activeSeasonalAccessories('2026-04-13').map((s) => s.key)).toEqual(['garland'])
    expect(activeSeasonalAccessories(TODAY)).toEqual([])
  })

  it('ของพิเศษใส่ได้เมื่อสะสมแล้วเท่านั้น', () => {
    expect(unlockedAccessories(1)).toEqual(['none'])
    expect(unlockedAccessories(1, ['santa'])).toEqual(['none', 'santa'])
  })

  it('ฤดูยื่นภาษี 1 ม.ค. – 8 เม.ย. ของปีภาษีที่แล้ว', () => {
    expect(taxSeason('2027-02-01')).toEqual({ taxYear: '2569', deadline: '2027-04-08', daysLeft: 66 })
    expect(taxSeason('2027-04-09')).toBeNull()
  })

  it('เช็กลิสต์ภารกิจตามความคืบหน้า', () => {
    const season = taxSeason('2027-02-01')!
    expect(taxSeasonMission(season, [], 0).map((s) => s.done)).toEqual([false, false, false, false])
    expect(taxSeasonMission(season, [], 500_000).map((s) => s.done)).toEqual([true, false, false, false])
    const filed = [{ reference: 'TF-1', taxYear: '2569', status: 'received', balance: -3000 }]
    expect(taxSeasonMission(season, filed, 0).every((s) => s.done)).toBe(true)
    const due = [{ reference: 'TF-1', taxYear: '2569', status: 'received', balance: 9000, payment: { paidDates: ['2027-03-01', ''] } }]
    expect(taxSeasonMission(season, due, 0).map((s) => s.done)).toEqual([true, true, true, false])
  })

  it('นักยื่นไว: บันทึกก่อน 1 มี.ค. และยื่นจริงแล้ว', () => {
    expect(isEarlyFiler([{ taxYear: '2569', status: 'received', submittedAt: '2027-02-20T10:00:00Z' }])).toBe(true)
    expect(isEarlyFiler([{ taxYear: '2569', status: 'submitted', submittedAt: '2027-02-20T10:00:00Z' }])).toBe(false)
    expect(isEarlyFiler([{ taxYear: '2569', status: 'completed', submittedAt: '2027-03-15T10:00:00Z' }])).toBe(false)
  })
})

describe('ภาษีของคุณมาจากไหน', () => {
  it('ขั้นน้ำตกต่อกันพอดีจากเงินได้ถึงเงินได้สุทธิ', () => {
    const r = calculateTax({ salary: 600_000 }, { personal: 60_000, socialSecurity: 9_000 }, 0, { taxYear: '2568' })
    const b = taxBreakdown(r)!
    const minus = b.steps.filter((s) => s.kind === 'minus')
    expect(minus[minus.length - 1]!.start).toBe(r.netIncome)
    expect(b.steps[b.steps.length - 1]).toMatchObject({ key: 'net', end: r.netIncome })
    expect(b.brackets.reduce((s, x) => s + x.tax, 0)).toBe(r.progressiveTax)
    expect(b.marginalPer100).toBe(Math.round(r.marginalRate * 100))
  })

  it('ไม่มีเงินได้ไม่ต้องแสดง', () => {
    expect(taxBreakdown(calculateTax({}, {}))).toBeNull()
  })
})

describe('เริ่มต้นด้วย 5 คำถาม', () => {
  it('พนักงานประจำได้สมุดส่วนตัว เงินเดือนทั้งปี ประกันสังคม และลดหย่อนคู่สมรส', () => {
    const plan = buildOnboardingPlan({
      work: 'employee',
      monthlyIncome: 30_000,
      married: true,
      spouseHasIncome: false,
      children: 2,
      parents: 1,
      holdings: ['socialSecurity', 'lifeInsurance'],
      goal: 'save',
    })
    expect(plan.workspace.mode).toBe('personal')
    expect(plan.income).toEqual({ salary: 360_000 })
    expect(plan.deductions).toEqual({ socialSecurity: 9_000, spouse: 60_000 })
    expect(plan.maritalStatus).toBe('married_joint')
    expect(plan.dependents).toEqual({ children: 2, parents: 1 })
    expect(plan.goal).toEqual({ name: 'เงินสำรองฉุกเฉิน 6 เดือน', kind: 'runway', target: 6 })
    expect(plan.todos.some((t) => t.title.includes('ประกัน'))).toBe(true)
  })

  it('บริษัทไม่เติมเงินได้บุคคลธรรมดา และแนะนำภาษีนิติบุคคลก่อน', () => {
    const plan = buildOnboardingPlan({
      work: 'company', monthlyIncome: 200_000, married: false, spouseHasIncome: true, children: 0, parents: 0, holdings: [], goal: 'organise',
    })
    expect(plan.income).toEqual({})
    expect(plan.todos[0]!.to).toBe('/calculator/corporate')
  })
})

describe('อ่านใบเสร็จ', () => {
  it('ใช้ยอดรวมท้ายใบ ไม่ใช้เงินสดหรือเงินทอน', () => {
    const text = `CAFE AMAZON สาขาสยาม
TAX ID 0105551234567
วันที่ 05/10/2569 14:22
ลาเต้เย็น 65.00
ครัวซองต์ 55.00
รวม 120.00
VAT 7% 7.85
เงินสด 500.00
เงินทอน 380.00`
    expect(parseReceipt(text, TODAY)).toEqual({ amount: 120, date: '2026-10-05', merchant: 'CAFE AMAZON สาขาสยาม' })
  })

  it('ไม่มีคำว่ารวม ใช้ยอดที่มากที่สุด และไม่รับวันในอนาคต', () => {
    const r = parseReceipt('ร้านป้าแดง\n12/12/2026\nข้าวผัด 50.00\nต้มยำ 120.00', TODAY)
    expect(r.amount).toBe(120)
    expect(r.date).toBeNull()
  })
})
