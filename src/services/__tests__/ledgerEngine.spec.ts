import { describe, expect, it } from 'vitest'
import { WORKSPACE_MODES, categoryLabel } from '@/data/workspaceModes'
import {
  analyseExpenseRisk,
  analyseRunway,
  evaluateGoal,
  evidenceCountByEntry,
  groupEvidence,
  monthlyAverages,
  monthlyBreakdown,
  summarise,
  tradingStats,
  type Evidence,
  type Goal,
  type LedgerEntry,
} from '../ledgerEngine'

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: Math.random().toString(36).slice(2),
    date: '2026-01-15',
    type: 'expense',
    categoryKey: 'food',
    amount: 1_000,
    note: '',
    ...over,
  }
}

describe('สรุปยอดรายรับรายจ่าย', () => {
  it('แยกรายรับ รายจ่าย และคำนวณอัตราการออม', () => {
    const s = summarise(
      [
        entry({ type: 'income', categoryKey: 'salary', amount: 50_000 }),
        entry({ type: 'expense', categoryKey: 'housing', amount: 12_000 }),
        entry({ type: 'expense', categoryKey: 'food', amount: 8_000 }),
      ],
      'personal',
    )
    expect(s.income).toBe(50_000)
    expect(s.expense).toBe(20_000)
    expect(s.net).toBe(30_000)
    expect(s.savingsRate).toBeCloseTo(0.6, 6)
  })

  it('จัดกลุ่มตามหมวดพร้อมสัดส่วน เรียงจากมากไปน้อย', () => {
    const s = summarise(
      [
        entry({ type: 'expense', categoryKey: 'housing', amount: 12_000 }),
        entry({ type: 'expense', categoryKey: 'food', amount: 4_000 }),
        entry({ type: 'expense', categoryKey: 'food', amount: 4_000 }),
      ],
      'personal',
    )
    expect(s.byCategory[0]?.key).toBe('housing')
    expect(s.byCategory[0]?.share).toBeCloseTo(0.6, 6)
    expect(s.byCategory[1]?.count).toBe(2)
    expect(s.byCategory[1]?.label).toBe('อาหารและของใช้')
  })

  it('คิดกำไรขั้นต้นจากต้นทุนขายในโหมดธุรกิจ', () => {
    const s = summarise(
      [
        entry({ type: 'income', categoryKey: 'productSales', amount: 100_000 }),
        entry({ type: 'expense', categoryKey: 'cogs', amount: 60_000 }),
        entry({ type: 'expense', categoryKey: 'marketing', amount: 10_000 }),
      ],
      'sme',
    )
    expect(s.cogs).toBe(60_000)
    expect(s.grossProfit).toBe(40_000)
    expect(s.grossMargin).toBeCloseTo(0.4, 6)
    expect(s.net).toBe(30_000)
  })

  it('รวมภาษีหัก ณ ที่จ่ายของทุกรายการ', () => {
    const s = summarise(
      [
        entry({ type: 'income', categoryKey: 'projectFee', amount: 100_000, withholdingTax: 3_000 }),
        entry({ type: 'income', categoryKey: 'projectFee', amount: 50_000, withholdingTax: 1_500 }),
      ],
      'freelancer',
    )
    expect(s.withholdingTax).toBe(4_500)
  })

  it('เฉลี่ยต่อเดือนคิดจากจำนวนเดือนที่มีข้อมูลจริง', () => {
    const avg = monthlyAverages(
      [
        entry({ date: '2026-01-10', type: 'income', categoryKey: 'salary', amount: 30_000 }),
        entry({ date: '2026-02-10', type: 'income', categoryKey: 'salary', amount: 30_000 }),
        entry({ date: '2026-01-20', amount: 10_000 }),
        entry({ date: '2026-02-20', amount: 10_000 }),
      ],
      'personal',
    )
    expect(avg.months).toBe(2)
    expect(avg.income).toBe(30_000)
    expect(avg.expense).toBe(10_000)
  })

  it('ไม่มีรายการเลยก็ไม่พังและไม่หารด้วยศูนย์', () => {
    const s = summarise([], 'personal')
    expect(s.income).toBe(0)
    expect(s.savingsRate).toBe(0)
    expect(s.monthsCovered).toBe(1)
    expect(monthlyAverages([], 'personal').expense).toBe(0)
  })

  it('แยกยอดรายเดือนเรียงตามเวลา', () => {
    const points = monthlyBreakdown([
      entry({ date: '2026-02-01', type: 'income', amount: 5_000 }),
      entry({ date: '2026-01-01', type: 'income', amount: 3_000 }),
      entry({ date: '2026-01-15', amount: 1_000 }),
    ])
    expect(points.map((p) => p.month)).toEqual(['2026-01', '2026-02'])
    expect(points[0]?.net).toBe(2_000)
  })
})

describe('วิเคราะห์ความเสี่ยงของรายจ่าย', () => {
  it('รายรับ 15,000 รายจ่าย 14,000 ถือว่าเสี่ยง และบอกว่าต้องลดเท่าไร', () => {
    const risk = analyseExpenseRisk(15_000, 14_000, 'personal')
    expect(risk.ratio).toBeCloseTo(0.9333, 4)
    expect(risk.level).toBe('risky')
    expect(risk.surplus).toBe(1_000)
    expect(risk.savingsRate).toBeCloseTo(0.0667, 4)
    // เป้าออม 20% ของโหมดส่วนบุคคล จึงควรจ่ายไม่เกิน 12,000
    expect(risk.sustainableExpense).toBe(12_000)
    expect(risk.expenseToCut).toBe(2_000)
    expect(risk.detail).toContain('2,000')
  })

  it('รายจ่ายเกินรายรับถือเป็นภาวะขาดดุล', () => {
    const risk = analyseExpenseRisk(15_000, 18_000, 'personal')
    expect(risk.level).toBe('deficit')
    expect(risk.surplus).toBe(-3_000)
  })

  it('เหลือเก็บถึงเป้าแล้วไม่ต้องลดรายจ่าย', () => {
    const risk = analyseExpenseRisk(50_000, 20_000, 'personal')
    expect(risk.level).toBe('healthy')
    expect(risk.expenseToCut).toBe(0)
  })

  it('เกณฑ์การออมต่างกันตามโหมด ฟรีแลนซ์ต้องเก็บมากกว่า', () => {
    const person = analyseExpenseRisk(100_000, 78_000, 'personal')
    const freelance = analyseExpenseRisk(100_000, 78_000, 'freelancer')
    expect(person.expenseToCut).toBe(0) // เป้า 20% เก็บได้ 22%
    expect(freelance.expenseToCut).toBe(8_000) // เป้า 30% ต้องจ่ายไม่เกิน 70,000
  })

  it('มีรายจ่ายแต่ยังไม่มีรายรับ บอกตรง ๆ ว่าเงินทุนจะลดลง', () => {
    const risk = analyseExpenseRisk(0, 9_000, 'personal')
    expect(risk.level).toBe('deficit')
    expect(risk.expenseToCut).toBe(9_000)
  })
})

describe('วิเคราะห์เงินทุน', () => {
  it('ทุน 100,000 จ่ายเดือนละ 10,000 อยู่ได้ 10 เดือน', () => {
    const r = analyseRunway(100_000, 10_000, 0, 'personal')
    expect(r.netBurn).toBe(10_000)
    expect(r.months).toBeCloseTo(10, 6)
  })

  it('10 เดือนผ่านเกณฑ์ของมนุษย์เงินเดือน แต่ยังไม่พอสำหรับฟรีแลนซ์', () => {
    const person = analyseRunway(100_000, 10_000, 0, 'personal')
    expect(person.recommendedMonths).toBe(6)
    expect(person.level).toBe('healthy')
    expect(person.shortfall).toBe(0)

    const freelance = analyseRunway(100_000, 10_000, 0, 'freelancer')
    expect(freelance.recommendedMonths).toBe(12)
    expect(freelance.level).toBe('watch')
    expect(freelance.requiredCapital).toBe(120_000)
    expect(freelance.shortfall).toBe(20_000)
  })

  it('มีรายรับช่วยแล้วเผาเงินทุนช้าลง', () => {
    const r = analyseRunway(100_000, 10_000, 6_000, 'personal')
    expect(r.netBurn).toBe(4_000)
    expect(r.months).toBeCloseTo(25, 6)
  })

  it('รายรับพอเลี้ยงตัวเองแล้ว ไม่ต้องเผาเงินทุน', () => {
    const r = analyseRunway(100_000, 10_000, 12_000, 'personal')
    expect(r.level).toBe('positive')
    expect(r.months).toBe(Number.POSITIVE_INFINITY)
    expect(r.depletionDate).toBeNull()
  })

  it('เงินทุนเหลือน้อยมากถือเป็นภาวะวิกฤต', () => {
    const r = analyseRunway(15_000, 10_000, 0, 'personal')
    expect(r.months).toBeCloseTo(1.5, 6)
    expect(r.level).toBe('critical')
  })

  it('บอกวันที่เงินทุนจะหมด', () => {
    const r = analyseRunway(30_000, 10_000, 0, 'personal', new Date('2026-01-15T00:00:00Z'))
    expect(r.depletionDate).toBe('2026-04-15')
  })
})

describe('เป้าหมาย', () => {
  const summary = summarise(
    [
      entry({ date: '2026-01-05', type: 'income', categoryKey: 'salary', amount: 30_000 }),
      entry({ date: '2026-01-20', categoryKey: 'housing', amount: 10_000 }),
    ],
    'personal',
  )
  const averages = monthlyAverages(
    [
      entry({ date: '2026-01-05', type: 'income', categoryKey: 'salary', amount: 30_000 }),
      entry({ date: '2026-01-20', categoryKey: 'housing', amount: 10_000 }),
    ],
    'personal',
  )

  function goal(over: Partial<Goal>): Goal {
    return { id: 'g', name: 'เป้า', kind: 'save', target: 100_000, deadline: '', ...over }
  }

  it('เป้าเก็บเงินนับเงินทุนตั้งต้นรวมกับยอดคงเหลือ', () => {
    const p = evaluateGoal(goal({ kind: 'save', target: 100_000 }), summary, averages, 50_000)
    expect(p.current).toBe(70_000) // 50,000 + (30,000 − 10,000)
    expect(p.percent).toBeCloseTo(0.7, 6)
    expect(p.achieved).toBe(false)
    expect(p.remaining).toBe(30_000)
  })

  it('เป้ารายรับต่อเดือนสำเร็จเมื่อทำได้ถึงเป้า', () => {
    const p = evaluateGoal(goal({ kind: 'income', target: 25_000 }), summary, averages, 0)
    expect(p.current).toBe(30_000)
    expect(p.achieved).toBe(true)
  })

  it('เป้าคุมรายจ่ายสำเร็จเมื่ออยู่ใต้เพดาน และบอกส่วนที่เกิน', () => {
    const ok = evaluateGoal(goal({ kind: 'expenseCap', target: 12_000 }), summary, averages, 0)
    expect(ok.achieved).toBe(true)

    const over = evaluateGoal(goal({ kind: 'expenseCap', target: 8_000 }), summary, averages, 0)
    expect(over.achieved).toBe(false)
    expect(over.remaining).toBe(2_000)
  })

  it('เป้าเงินสำรองคิดเป็นจำนวนเดือน', () => {
    const p = evaluateGoal(goal({ kind: 'runway', target: 6 }), summary, averages, 50_000)
    // รายรับมากกว่ารายจ่าย จึงไม่ต้องเผาเงินสำรอง
    expect(p.achieved).toBe(true)
  })
})

describe('สถิติการเทรด', () => {
  const trades = [
    entry({ type: 'income', categoryKey: 'tradeProfit', amount: 5_000, symbol: 'BTC' }),
    entry({ type: 'income', categoryKey: 'tradeProfit', amount: 3_000, symbol: 'ETH' }),
    entry({ type: 'expense', categoryKey: 'tradeLoss', amount: 2_000, symbol: 'BTC' }),
    entry({ type: 'expense', categoryKey: 'tradeLoss', amount: 2_000, symbol: 'SOL' }),
    entry({ type: 'expense', categoryKey: 'commission', amount: 500 }),
  ]

  it('นับเฉพาะผลการเทรด ไม่รวมค่าคอมมิชชัน', () => {
    const s = tradingStats(trades)
    expect(s.trades).toBe(4)
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(2)
    expect(s.winRate).toBeCloseTo(0.5, 6)
  })

  it('คำนวณ profit factor และกำไรคาดหวังต่อไม้', () => {
    const s = tradingStats(trades)
    expect(s.grossProfit).toBe(8_000)
    expect(s.grossLoss).toBe(4_000)
    expect(s.profitFactor).toBeCloseTo(2, 6)
    expect(s.netPnl).toBe(4_000)
    expect(s.expectancy).toBe(1_000)
    expect(s.largestWin).toBe(5_000)
  })

  it('ยังไม่มีการเทรดก็ไม่พัง', () => {
    const s = tradingStats([])
    expect(s.trades).toBe(0)
    expect(s.winRate).toBe(0)
    expect(s.profitFactor).toBe(0)
  })
})

describe('ชื่อหมวดต้องเป็นภาษาไทยเสมอ', () => {
  it('หาหมวดข้ามโหมดเจอ ไม่หลุดคีย์ดิบออกมา', () => {
    // cogs มีเฉพาะในโหมดธุรกิจ แต่หน้าแดชบอร์ดรวมทุกสมุดจึงอาจถามด้วยโหมดอื่น
    expect(categoryLabel('sme', 'cogs')).toBe('ต้นทุนสินค้าที่ขาย')
    expect(categoryLabel('company', 'cogs')).toBe('ต้นทุนขาย')
    expect(categoryLabel('personal', 'cogs')).not.toBe('cogs')
    expect(categoryLabel('personal', 'tradeProfit')).toBe('กำไรจากการเทรด')
  })

  it('ทุกหมวดของทุกโหมดต้องคืนชื่อไทย ไม่ใช่คีย์', () => {
    for (const definition of WORKSPACE_MODES) {
      for (const category of definition.categories) {
        const label = categoryLabel(definition.key, category.key)
        expect(label, `${definition.key}/${category.key}`).toBe(category.label)
        expect(/^[a-zA-Z]+$/.test(label), `${category.key} หลุดคีย์ดิบ`).toBe(false)
      }
    }
  })

  it('คีย์ที่ไม่รู้จักคืนคำกลาง ไม่ใช่คีย์ดิบ', () => {
    expect(categoryLabel('personal', 'somethingUnknown')).toBe('อื่น ๆ')
  })

  it('สรุปยอดข้ามโหมดก็ต้องได้ชื่อไทย', () => {
    const s = summarise(
      [entry({ type: 'expense', categoryKey: 'cogs', amount: 123 })],
      'personal',
    )
    expect(s.byCategory[0]?.label).not.toBe('cogs')
  })
})

describe('การจัดกลุ่มหลักฐาน', () => {
  function ev(over: Partial<Evidence> = {}): Evidence {
    return {
      id: Math.random().toString(36).slice(2),
      entryId: null,
      date: '2026-08-02',
      direction: 'expense',
      kind: 'receipt',
      name: 'file.jpg',
      size: 1000,
      mimeType: 'image/jpeg',
      uploadedAt: '2026-08-02T10:00:00.000Z',
      note: '',
      ...over,
    }
  }

  it('จัดเป็น วันที่ → รับ/จ่าย → หมวดหลักฐาน ตามที่ต้องการ', () => {
    const groups = groupEvidence([
      ev({ direction: 'income', kind: 'receipt', name: 'in-receipt.jpg' }),
      ev({ direction: 'income', kind: 'document', name: 'in-doc.pdf' }),
      ev({ direction: 'expense', kind: 'receipt', name: 'out-receipt.jpg' }),
      ev({ direction: 'expense', kind: 'document', name: 'out-doc.pdf' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.date).toBe('2026-08-02')
    expect(groups[0]?.count).toBe(4)

    const [income, expense] = groups[0]!.directions
    expect(income?.label).toBe('หลักฐานการรับเงิน')
    expect(income?.kinds.map((k) => k.label)).toEqual(['ใบเสร็จ', 'เอกสาร'])
    expect(expense?.label).toBe('หลักฐานการจ่ายเงิน')
    expect(expense?.kinds.map((k) => k.label)).toEqual(['ใบเสร็จ', 'เอกสาร'])
  })

  it('รองรับสลิปโอนเงินเป็นอีกหมวดหนึ่ง', () => {
    const groups = groupEvidence([
      ev({ direction: 'income', kind: 'slip' }),
      ev({ direction: 'income', kind: 'receipt' }),
    ])
    expect(groups[0]?.directions[0]?.kinds.map((k) => k.label)).toEqual(['ใบเสร็จ', 'สลิปโอนเงิน'])
  })

  it('เรียงวันที่จากใหม่ไปเก่า', () => {
    const groups = groupEvidence([
      ev({ date: '2026-07-15' }),
      ev({ date: '2026-08-02' }),
      ev({ date: '2026-08-01' }),
    ])
    expect(groups.map((g) => g.date)).toEqual(['2026-08-02', '2026-08-01', '2026-07-15'])
  })

  it('ไม่แสดงหัวข้อที่ไม่มีไฟล์อยู่ข้างใน', () => {
    const groups = groupEvidence([ev({ direction: 'expense', kind: 'receipt' })])
    expect(groups[0]?.directions).toHaveLength(1)
    expect(groups[0]?.directions[0]?.direction).toBe('expense')
    expect(groups[0]?.directions[0]?.kinds).toHaveLength(1)
  })

  it('ไฟล์ที่ไม่มีวันที่ใช้วันที่อัปโหลดแทน', () => {
    const groups = groupEvidence([ev({ date: '', uploadedAt: '2026-08-09T03:00:00.000Z' })])
    expect(groups[0]?.date).toBe('2026-08-09')
  })

  it('นับจำนวนหลักฐานของแต่ละรายการได้', () => {
    const counts = evidenceCountByEntry([
      ev({ entryId: 'e1' }),
      ev({ entryId: 'e1' }),
      ev({ entryId: 'e2' }),
      ev({ entryId: null }),
    ])
    expect(counts.get('e1')).toBe(2)
    expect(counts.get('e2')).toBe(1)
    expect(counts.size).toBe(2)
  })

  it('ไม่มีหลักฐานเลยก็คืนรายการว่าง', () => {
    expect(groupEvidence([])).toEqual([])
  })
})
