import { describe, expect, it } from 'vitest'
import { calculateTax } from '../taxEngine'
import { suggestDeductions, daysUntilYearEnd } from '../deductionAdvisor'
import { buildFilingImport } from '../ledgerImport'
import { upcomingDeadlines } from '../taxCalendar'
import { compareYears } from '../yearComparison'
import { evaluateBudgets } from '../ledgerEngine'
import { compareIncorporation, runScenario } from '../scenario'
import { RETIREMENT_POOL_CAP, RETIREMENT_POOL_KEYS } from '@/data/taxData'

describe('ภาษีขั้นต่ำตามมาตรา 48(2)', () => {
  it('เงินได้ 40(8) ตั้งแต่ 1 ล้านและลดหย่อนจนภาษีขั้นบันไดต่ำ ต้องเสีย 0.5%', () => {
    const r = calculateTax({ business: 1_200_000 }, { rmf: 300_000 })
    expect(r.progressiveTax).toBe(0)
    expect(r.minimumTax.applies).toBe(true)
    expect(r.taxMethod).toBe('minimum')
    expect(r.tax).toBe(6_000)
  })

  it('ภาษีขั้นต่ำไม่เกิน 5,000 บาทได้รับยกเว้น', () => {
    const r = calculateTax({ business: 1_000_000 }, { rmf: 300_000 })
    expect(r.minimumTax.tax).toBe(5_000)
    expect(r.minimumTax.applies).toBe(false)
    expect(r.taxMethod).toBe('progressive')
  })

  it('เงินเดือนไม่นับรวมในฐานภาษีขั้นต่ำ', () => {
    const r = calculateTax({ salary: 5_000_000 }, {})
    expect(r.minimumTax.base).toBe(0)
    expect(r.tax).toBe(r.progressiveTax)
  })

  it('ภาษีขั้นบันไดสูงกว่า ใช้ขั้นบันไดตามเดิม', () => {
    const r = calculateTax({ business: 3_000_000 }, {})
    expect(r.minimumTax.applies).toBe(true)
    expect(r.taxMethod).toBe('progressive')
    expect(r.tax).toBe(r.progressiveTax)
  })
})

describe('ผู้ช่วยแนะนำการลดหย่อน', () => {
  it('แนะนำเรียงจากประหยัดมากสุด และผลรวมของแผนเท่ากับภาษีที่ลดลงจริง', () => {
    const advice = suggestDeductions({ salary: 1_500_000 }, { personal: 60_000 })
    expect(advice.suggestions.length).toBeGreaterThan(0)
    const totalSaving = advice.suggestions.reduce((s, x) => s + x.saving, 0)
    expect(Math.round(totalSaving * 100) / 100).toBe(
      Math.round((advice.currentTax - advice.taxIfAll) * 100) / 100,
    )
    expect(advice.taxIfAll).toBeLessThan(advice.currentTax)
  })

  it('แผนรวมไม่เกินเพดานกองทุนเพื่อการเกษียณ 500,000 บาท', () => {
    const advice = suggestDeductions({ salary: 5_000_000 }, { personal: 60_000 }, 0, 10)
    const retirement = advice.suggestions
      .filter((s) => RETIREMENT_POOL_KEYS.includes(s.key))
      .reduce((sum, s) => sum + s.amount, 0)
    expect(retirement).toBeLessThanOrEqual(RETIREMENT_POOL_CAP)
  })

  it('ไม่มีเงินได้ หรือไม่ต้องเสียภาษี ไม่แนะนำอะไร', () => {
    expect(suggestDeductions({}, {}).reason).toBe('no-income')
    expect(suggestDeductions({ salary: 200_000 }, { personal: 60_000 }).reason).toBe('no-tax')
  })

  it('นับวันถึงสิ้นปีภาษี', () => {
    expect(daysUntilYearEnd(new Date(2026, 9, 6))).toBe(86)
    expect(daysUntilYearEnd(new Date(2026, 11, 31))).toBe(0)
  })
})

describe('ดึงตัวเลขจากสมุดบัญชี', () => {
  const workspaces = [
    { id: 'p', name: 'ส่วนตัว', mode: 'personal' as const },
    { id: 'f', name: 'ฟรีแลนซ์', mode: 'freelancer' as const },
    { id: 'c', name: 'บริษัท', mode: 'company' as const },
  ]
  const entries = [
    { workspaceId: 'p', date: '2026-01-25', type: 'income' as const, categoryKey: 'salary', amount: 50_000 },
    { workspaceId: 'p', date: '2026-12-20', type: 'income' as const, categoryKey: 'bonus', amount: 30_000 },
    { workspaceId: 'p', date: '2025-12-25', type: 'income' as const, categoryKey: 'salary', amount: 99_999 },
    {
      workspaceId: 'f',
      date: '2026-03-01',
      type: 'income' as const,
      categoryKey: 'projectFee',
      amount: 20_000,
      withholdingTax: 600,
    },
    { workspaceId: 'f', date: '2026-03-02', type: 'income' as const, categoryKey: 'otherIncome', amount: 1_000 },
    { workspaceId: 'c', date: '2026-03-03', type: 'income' as const, categoryKey: 'sales', amount: 500_000 },
  ]

  it('จับคู่หมวดกับประเภทเงินได้ กรองตามปีภาษี และรวมภาษีหัก ณ ที่จ่าย', () => {
    const result = buildFilingImport(workspaces, entries, '2569')
    expect(result.calendarYear).toBe(2026)
    expect(result.lines.find((l) => l.incomeKey === 'salary')?.amount).toBe(80_000)
    expect(result.lines.find((l) => l.incomeKey === 'freelance')?.amount).toBe(20_000)
    expect(result.withholdingTax).toBe(600)
  })

  it('ไม่ดึงสมุดบริษัทและหมวดที่ไม่รู้ประเภท แต่แจ้งเหตุผลไว้', () => {
    const result = buildFilingImport(workspaces, entries, '2569')
    expect(result.lines.some((l) => l.amount === 500_000)).toBe(false)
    expect(result.skipped.map((s) => s.workspace).sort()).toEqual(['บริษัท', 'ฟรีแลนซ์'].sort())
    expect(result.skipped.every((s) => s.reason.length > 0)).toBe(true)
  })
})

describe('ปฏิทินภาษี', () => {
  const today = new Date(2026, 9, 6)

  it('ผู้มีเงินได้ทั่วไปเห็นกำหนดซื้อกองทุนก่อนสิ้นปี', () => {
    const list = upcomingDeadlines([], today)
    expect(list[0]?.key).toBe('deduction-deadline')
    expect(list[0]?.daysLeft).toBe(86)
    expect(list.some((d) => d.key === 'vat-monthly')).toBe(false)
  })

  it('มีสมุดธุรกิจแล้วเห็นกำหนดรายเดือน เรียงจากใกล้สุด', () => {
    const list = upcomingDeadlines(['sme'], today)
    expect(list[0]?.key).toBe('wht-monthly')
    expect(list[0]?.date).toBe('2026-10-07')
    const days = list.map((d) => d.daysLeft)
    expect(days).toEqual([...days].sort((a, b) => a - b))
  })
})

describe('เทียบภาษีรายปี', () => {
  it('คำนวณอัตราภาษีแท้จริงและการเปลี่ยนแปลงจากปีก่อน', () => {
    const result = compareYears([
      { taxYear: '2567', grossIncome: 620_000, netIncome: 373_000, tax: 19_800 },
      { taxYear: '2566', grossIncome: 540_000, netIncome: 311_000, tax: 15_050 },
    ])
    expect(result.rows.map((r) => r.taxYear)).toEqual(['2566', '2567'])
    expect(result.rows[1]?.taxChange).toBeCloseTo(19_800 / 15_050 - 1)
    expect(result.lowestRateYear).toBe('2566')
    expect(result.insights.length).toBeGreaterThan(0)
  })
})

describe('งบประมาณรายหมวด', () => {
  const entries = [
    { id: '1', date: '2026-08-01', type: 'expense' as const, categoryKey: 'food', amount: 5_500, note: '' },
    { id: '2', date: '2026-08-02', type: 'expense' as const, categoryKey: 'transport', amount: 900, note: '' },
    { id: '3', date: '2026-08-03', type: 'expense' as const, categoryKey: 'lifestyle', amount: 3_000, note: '' },
    { id: '4', date: '2026-07-03', type: 'expense' as const, categoryKey: 'lifestyle', amount: 9_999, note: '' },
  ]

  it('เทียบรายจ่ายของเดือนที่เลือกกับงบ และเรียงหมวดที่ใกล้เกินงบก่อน', () => {
    const result = evaluateBudgets(
      entries,
      'personal',
      { food: 6_000, transport: 2_000, lifestyle: 2_000 },
      '2026-08',
    )
    expect(result.map((r) => r.categoryKey)).toEqual(['lifestyle', 'food', 'transport'])
    expect(result[0]?.status).toBe('over')
    expect(result[0]?.remaining).toBe(-1_000)
    expect(result[1]?.status).toBe('warn')
    expect(result[2]?.status).toBe('ok')
  })
})

describe('จำลองสถานการณ์', () => {
  it('ขึ้นเงินเดือนแล้วภาษีเพิ่ม และบอกสัดส่วนภาษีของเงินที่เพิ่มขึ้น', () => {
    const r = runScenario({ salary: 600_000 }, { personal: 60_000 }, 0, {
      salaryChangePct: 10,
      extraFreelance: 0,
      extraFunds: 0,
    })
    expect(r.after.grossIncome).toBe(660_000)
    expect(r.taxChange).toBeGreaterThan(0)
    expect(r.marginalTakeRate).toBeGreaterThan(0)
    expect(r.marginalTakeRate).toBeLessThan(0.35)
  })

  it('ซื้อกองทุนลดหย่อนแล้วภาษีลดลง', () => {
    const r = runScenario({ salary: 1_200_000 }, { personal: 60_000 }, 0, {
      salaryChangePct: 0,
      extraFreelance: 0,
      extraFunds: 100_000,
    })
    expect(r.taxChange).toBeLessThan(0)
    expect(r.after.grossIncome).toBe(r.before.grossIncome)
  })

  it('เทียบรับงานเองกับจดบริษัท ภาษีรวมของบริษัท = นิติบุคคล + ปันผล + ภาษีส่วนตัว', () => {
    const r = compareIncorporation({
      revenue: 3_000_000,
      costPct: 30,
      otherIncome: {},
      deductions: { personal: 60_000 },
    })
    const c = r.company
    expect(Math.round((c.corporateTax + c.dividendTax + c.ownerTax) * 100) / 100).toBe(c.totalTax)
    expect(r.better === 'company' ? r.saving > 0 : r.saving <= 0).toBe(true)
  })
})
