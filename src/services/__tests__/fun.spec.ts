import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILTER,
  dueRecurringDates,
  filterEntries,
  type LedgerEntry,
  type RecurringTemplate,
} from '../ledgerEngine'
import {
  challengeProgress,
  computeMood,
  computeStreak,
  computeXp,
  earnedAchievements,
  levelOf,
  unlockedAccessories,
  type GameData,
} from '../gamification'
import { buildWrapped, wrappedYears } from '../wrapped'
import { dependentAmounts, inferDependents, normaliseDependents } from '@/data/dependents'
import { QUIZ_QUESTIONS, QUIZ_ROUND_SIZE, pickQuestions } from '@/data/taxQuiz'

const e = (id: string, date: string, type: 'income' | 'expense', categoryKey: string, amount: number, note = ''): LedgerEntry => ({
  id,
  date,
  type,
  categoryKey,
  amount,
  note,
})

describe('ค้นหาและกรองรายการ', () => {
  const entries = [
    e('1', '2026-07-01', 'income', 'salary', 15_000, 'เงินเดือนกรกฎาคม'),
    e('2', '2026-07-05', 'expense', 'food', 4_200, 'ค่าอาหาร'),
    e('3', '2026-08-06', 'expense', 'food', 4_400, 'ข้าวมันไก่'),
    e('4', '2026-08-09', 'expense', 'transport', 1_500, 'BTS'),
  ]
  const label = (k: string) => ({ salary: 'เงินเดือน', food: 'อาหารและของใช้', transport: 'เดินทาง' })[k] ?? k

  it('ค้นจากรายละเอียดและชื่อหมวด ไม่สนตัวพิมพ์', () => {
    expect(filterEntries(entries, { ...EMPTY_FILTER, query: 'bts' }, label).map((x) => x.id)).toEqual(['4'])
    expect(filterEntries(entries, { ...EMPTY_FILTER, query: 'อาหาร' }, label).map((x) => x.id)).toEqual(['3', '2'])
  })

  it('กรองหมวด ช่วงวันที่ และเรียงตามจำนวนเงิน', () => {
    const rows = filterEntries(
      entries,
      { ...EMPTY_FILTER, type: 'expense', from: '2026-08-01', to: '2026-08-31', sort: 'amount-asc' },
      label,
    )
    expect(rows.map((x) => x.id)).toEqual(['4', '3'])
    expect(filterEntries(entries, { ...EMPTY_FILTER, categoryKey: 'food' }, label)).toHaveLength(2)
  })
})

describe('รายการประจำ', () => {
  const base: RecurringTemplate = {
    id: 'r1',
    type: 'expense',
    categoryKey: 'housing',
    amount: 5_500,
    note: 'ค่าเช่า',
    dayOfMonth: 31,
    startMonth: '2026-01',
    lastMonth: '',
  }

  it('สร้างย้อนให้ครบทุกเดือนจนถึงวันนี้ และใช้วันสุดท้ายของเดือนที่สั้นกว่า', () => {
    expect(dueRecurringDates(base, '2026-03-15')).toEqual(['2026-01-31', '2026-02-28'])
  })

  it('ไม่สร้างซ้ำเดือนที่สร้างไปแล้ว และไม่สร้างล่วงหน้า', () => {
    expect(dueRecurringDates({ ...base, lastMonth: '2026-02' }, '2026-03-15')).toEqual([])
    expect(dueRecurringDates({ ...base, lastMonth: '2026-02' }, '2026-03-31')).toEqual(['2026-03-31'])
    expect(dueRecurringDates({ ...base, startMonth: '2026-05' }, '2026-03-31')).toEqual([])
  })
})

describe('ค่าลดหย่อนแบบนับคน', () => {
  it('บุตรคนที่ 2 ขึ้นไปที่เกิดตั้งแต่ปี 2561 ได้ 60,000 บาท', () => {
    expect(dependentAmounts({ children: 3, childrenBonus: 2, parents: 2, disabled: 1 })).toEqual({
      children: 150_000,
      parents: 60_000,
      disabledCare: 60_000,
    })
  })

  it('ส่วนเพิ่มของบุตรต้องไม่เกินจำนวนบุตรลบหนึ่ง และบิดามารดาไม่เกิน 4 คน', () => {
    expect(normaliseDependents({ children: 1, childrenBonus: 1, parents: 9, disabled: -2 })).toEqual({
      children: 1,
      childrenBonus: 0,
      parents: 4,
      disabled: 0,
    })
  })

  it('แปลงยอดเงินจากแบบร่างรุ่นเก่ากลับเป็นจำนวนคน', () => {
    expect(inferDependents({ children: 60_000, parents: 30_000 })).toMatchObject({ children: 2, parents: 1 })
  })
})

describe('บันทึกต่อเนื่อง', () => {
  const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06'].map((date) => ({ date }))

  it('นับวันติดกันล่าสุดและสถิติดีที่สุด', () => {
    const s = computeStreak(days, '2026-10-06')
    expect(s).toMatchObject({ current: 2, best: 3, todayDone: true })
  })

  it('วันนี้ยังไม่จดแต่เมื่อวานจด ยังนับต่อเนื่อง', () => {
    expect(computeStreak(days, '2026-10-07')).toMatchObject({ current: 2, todayDone: false })
    expect(computeStreak(days, '2026-10-08').current).toBe(0)
  })
})

describe('เหรียญรางวัล เลเวล และของแต่งตัว', () => {
  const data = (over: Partial<GameData> = {}): GameData => ({
    today: '2026-10-06',
    workspaces: [{ id: 'w', userId: 'u', name: 'ส่วนตัว', mode: 'personal', capital: 0, createdAt: '' }],
    entries: [],
    goals: [],
    filings: [],
    challenges: [],
    quizBest: 0,
    styled: false,
    deductionMaxed: false,
    ...over,
  })

  it('ได้เหรียญตามข้อมูลจริง', () => {
    const entries = [
      { ...e('1', '2026-10-04', 'income', 'salary', 10_000), workspaceId: 'w', userId: 'u' },
      { ...e('2', '2026-10-05', 'expense', 'food', 1_000), workspaceId: 'w', userId: 'u' },
      { ...e('3', '2026-10-06', 'expense', 'food', 1_000), workspaceId: 'w', userId: 'u' },
    ]
    const earned = earnedAchievements(data({ entries, quizBest: 5 }))
    expect(earned).toEqual(expect.arrayContaining(['first-book', 'first-entry', 'streak-3', 'saver-20', 'quiz-perfect']))
    expect(earned).not.toContain('streak-7')
  })

  it('เลเวลขึ้นตาม XP และปลดล็อกของแต่งตัวตามเลเวล', () => {
    expect(levelOf(0).level).toBe(1)
    expect(levelOf(400)).toMatchObject({ level: 3, floor: 400, next: 800 })
    expect(levelOf(99_999)).toMatchObject({ level: 7, next: null, progress: 1 })
    expect(unlockedAccessories(3)).toEqual(['none', 'bow', 'glasses'])
    const xp = computeXp(['first-entry'], { current: 0, best: 2, todayDone: false, lastDate: null }, 10)
    expect(xp).toBe(50 + 10 + 20)
  })

  it('อารมณ์ของตัวการ์ตูน: เกินงบกังวล ไม่ได้จดหลายวันง่วง ออมดีดีใจ', () => {
    const ws = data().workspaces[0]!
    const income = { ...e('i', '2026-09-01', 'income', 'salary', 10_000), workspaceId: 'w', userId: 'u' }
    const food = { ...e('f', '2026-09-02', 'expense', 'food', 3_000), workspaceId: 'w', userId: 'u' }

    const worried = data({ workspaces: [{ ...ws, budgets: { food: 1_000 } }], entries: [income, food] })
    expect(computeMood(worried, computeStreak(worried.entries, worried.today)).mood).toBe('worried')

    const sleepy = data({ entries: [income, food] })
    expect(computeMood(sleepy, computeStreak(sleepy.entries, sleepy.today)).mood).toBe('sleepy')

    const fresh = data({ today: '2026-09-03', entries: [income, food] })
    expect(computeMood(fresh, computeStreak(fresh.entries, fresh.today)).mood).toBe('happy')
  })
})

describe('ภารกิจออมเงิน', () => {
  it('ออม 52 สัปดาห์: สัปดาห์ที่ n ออม n เท่า', () => {
    const p = challengeProgress(
      { kind: 'week52', startDate: '2026-10-01', amount: 10, days: 364, categoryKey: '', checkins: ['1', '2'] },
      [],
      '2026-10-16',
    )
    expect(p).toMatchObject({ done: 2, total: 52, saved: 30, target: 13_780, currentKey: '3', currentAmount: 30, currentDone: false, status: 'active' })
  })

  it('ออมทุกวัน: ครบจำนวนวันแล้วสำเร็จ', () => {
    const checkins = ['2026-10-01', '2026-10-02', '2026-10-03']
    const p = challengeProgress({ kind: 'daily', startDate: '2026-10-01', amount: 20, days: 3, categoryKey: '', checkins }, [], '2026-10-03')
    expect(p).toMatchObject({ done: 3, saved: 60, status: 'completed', currentDone: true })
  })

  it('งดใช้จ่าย: ตรวจจากรายการจริง มีรายจ่ายหมวดนั้นคือพลาด', () => {
    const base = { kind: 'nospend' as const, startDate: '2026-10-01', amount: 0, days: 5, categoryKey: 'lifestyle', checkins: [] }
    const clean = challengeProgress(base, [{ date: '2026-10-02', type: 'expense', categoryKey: 'food' }], '2026-10-05')
    expect(clean).toMatchObject({ done: 5, status: 'completed' })
    const broken = challengeProgress(base, [{ date: '2026-10-03', type: 'expense', categoryKey: 'lifestyle' }], '2026-10-04')
    expect(broken).toMatchObject({ status: 'broken', brokenDays: ['2026-10-03'], done: 3 })
  })
})

describe('สรุปปี', () => {
  const ws = [{ id: 'w', mode: 'personal' as const }]
  const entries = [
    { workspaceId: 'w', date: '2026-07-01', type: 'income' as const, categoryKey: 'salary', amount: 15_000, note: '' },
    { workspaceId: 'w', date: '2026-07-03', type: 'expense' as const, categoryKey: 'housing', amount: 5_500, note: 'ค่าเช่า' },
    { workspaceId: 'w', date: '2026-08-04', type: 'expense' as const, categoryKey: 'food', amount: 4_400, note: '' },
    { workspaceId: 'w', date: '2025-12-31', type: 'expense' as const, categoryKey: 'food', amount: 99, note: '' },
  ]

  it('สรุปยอด หมวดที่ใช้มากสุด เดือนประหยัดสุด และแบบภาษีของปีเดียวกัน', () => {
    const s = buildWrapped(entries, ws, [{ taxYear: '2569', tax: 1_000, balance: -500 }], 2026)
    expect(s).toMatchObject({ income: 15_000, expense: 9_900, net: 5_100, entryCount: 3 })
    expect(s.topCategory?.label).toBe('ที่อยู่อาศัย')
    expect(s.frugalMonth?.month).toBe('2026-08')
    expect(s.biggestExpense?.amount).toBe(5_500)
    expect(s.filing).toEqual({ tax: 1_000, balance: -500 })
    expect(wrappedYears(entries)).toEqual([2026, 2025])
  })
})

describe('ควิซภาษี', () => {
  it('ทุกข้อมีคำตอบที่ถูกอยู่ในตัวเลือก และรอบหนึ่งไม่ซ้ำกัน', () => {
    for (const q of QUIZ_QUESTIONS) {
      expect(q.choices[q.answer], q.id).toBeTruthy()
      expect(q.explanation.length).toBeGreaterThan(10)
    }
    const round = pickQuestions()
    expect(round).toHaveLength(QUIZ_ROUND_SIZE)
    expect(new Set(round.map((q) => q.id)).size).toBe(QUIZ_ROUND_SIZE)
  })
})
