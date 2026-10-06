/**
 * ระบบความสนุก: เหรียญรางวัล บันทึกต่อเนื่อง เลเวลของตัวการ์ตูน อารมณ์ของตัวการ์ตูน และภารกิจออมเงิน
 * ฟังก์ชันบริสุทธิ์ทั้งหมด รับข้อมูลและ "วันนี้" เข้ามา จึงเทสต์ได้และไม่ขึ้นกับเวลาเครื่อง
 */

import {
  evaluateBudgets,
  evaluateGoal,
  monthlyAverages,
  monthlyBreakdown,
  monthsWithEntries,
  summarise,
  type GoalProgress,
} from './ledgerEngine'
import { roundMoney } from './taxEngine'
import type { ChallengeRecord, EntryRecord, Filing, GoalRecord, Workspace } from './api'

/* ---------- วันที่ ---------- */

const DAY_MS = 86_400_000

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

function isoOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS)
}

export function addDays(iso: string, n: number): string {
  const d = toDate(iso)
  d.setDate(d.getDate() + n)
  return isoOf(d)
}

/* ---------- บันทึกต่อเนื่อง ---------- */

export interface Streak {
  /** จำนวนวันติดกันล่าสุดที่มีการบันทึก — ยังนับต่อถ้าเมื่อวานยังจดอยู่ */
  current: number
  best: number
  /** วันนี้จดแล้วหรือยัง */
  todayDone: boolean
  /** วันล่าสุดที่มีรายการ */
  lastDate: string | null
}

/**
 * นับจากวันที่ของรายการ (ไม่ใช่เวลาที่กดบันทึก) เพราะคนมักจดย้อนหลังของเมื่อวาน
 * ถ้าวันนี้ยังไม่จดแต่เมื่อวานจด ถือว่ายังต่อเนื่องอยู่ ให้โอกาสจดก่อนหมดวัน
 */
export function computeStreak(entries: { date: string }[], today: string): Streak {
  const days = [...new Set(entries.map((e) => e.date).filter((d) => d && d <= today))].sort()
  if (!days.length) return { current: 0, best: 0, todayDone: false, lastDate: null }

  let best = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = daysBetween(days[i - 1]!, days[i]!) === 1 ? run + 1 : 1
    best = Math.max(best, run)
  }

  const set = new Set(days)
  const todayDone = set.has(today)
  let cursor = todayDone ? today : addDays(today, -1)
  let current = 0
  while (set.has(cursor)) {
    current += 1
    cursor = addDays(cursor, -1)
  }
  return { current, best, todayDone, lastDate: days[days.length - 1]! }
}

/* ---------- ข้อมูลรวมสำหรับคิดเหรียญรางวัล ---------- */

export interface GameData {
  today: string
  workspaces: Workspace[]
  entries: EntryRecord[]
  goals: GoalRecord[]
  filings: Filing[]
  challenges: ChallengeRecord[]
  quizBest: number
  /** เคยแต่งเว็บ (เปลี่ยนรูปแบบหรือสีจากค่าเริ่มต้น) */
  styled: boolean
  /** ใช้สิทธิลดหย่อนที่ซื้อเพิ่มเองได้ครบแล้ว */
  deductionMaxed: boolean
}

/** ความคืบหน้าของเป้าหมายทุกข้อ ข้ามทุกสมุด */
export function goalStatuses(data: Pick<GameData, 'workspaces' | 'entries' | 'goals'>): GoalProgress[] {
  return data.goals.flatMap((goal) => {
    const ws = data.workspaces.find((w) => w.id === goal.workspaceId)
    if (!ws) return []
    const own = data.entries.filter((e) => e.workspaceId === ws.id)
    return [evaluateGoal(goal, summarise(own, ws.mode), monthlyAverages(own, ws.mode), ws.capital)]
  })
}

/** มีเดือนที่จบไปแล้วโดยไม่มีหมวดไหนเกินงบหรือไม่ */
function hasUnderBudgetMonth(data: GameData): boolean {
  const thisMonth = data.today.slice(0, 7)
  return data.workspaces.some((ws) => {
    if (!ws.budgets || !Object.keys(ws.budgets).length) return false
    const own = data.entries.filter((e) => e.workspaceId === ws.id)
    return monthsWithEntries(own)
      .filter((m) => m < thisMonth)
      .some((m) => {
        const rows = evaluateBudgets(own, ws.mode, ws.budgets!, m)
        return rows.length > 0 && rows.every((r) => r.status !== 'over')
      })
  })
}

function hasSavingMonth(data: GameData, rate: number): boolean {
  return data.workspaces.some((ws) =>
    monthlyBreakdown(data.entries.filter((e) => e.workspaceId === ws.id)).some(
      (p) => p.income > 0 && p.net / p.income >= rate,
    ),
  )
}

/* ---------- เหรียญรางวัล ---------- */

export interface Achievement {
  id: string
  title: string
  description: string
  /** อีโมจิประจำเหรียญ */
  icon: string
  xp: number
  check: (data: GameData, streak: Streak) => boolean
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-book', title: 'เปิดสมุดเล่มแรก', description: 'สร้างสมุดบัญชีเล่มแรก', icon: '📒', xp: 50, check: (d) => d.workspaces.length >= 1 },
  { id: 'first-entry', title: 'ก้าวแรก', description: 'บันทึกรายการแรก', icon: '✏️', xp: 50, check: (d) => d.entries.length >= 1 },
  { id: 'entries-50', title: 'นักจดตัวยง', description: 'บันทึกครบ 50 รายการ', icon: '📚', xp: 150, check: (d) => d.entries.length >= 50 },
  { id: 'streak-3', title: 'จดติดกัน 3 วัน', description: 'มีรายการต่อเนื่อง 3 วัน', icon: '🔥', xp: 80, check: (_d, s) => s.best >= 3 },
  { id: 'streak-7', title: 'ครบหนึ่งสัปดาห์', description: 'มีรายการต่อเนื่อง 7 วัน', icon: '🌟', xp: 150, check: (_d, s) => s.best >= 7 },
  { id: 'streak-30', title: 'วินัยเหล็ก', description: 'มีรายการต่อเนื่อง 30 วัน', icon: '🏆', xp: 400, check: (_d, s) => s.best >= 30 },
  { id: 'multi-book', title: 'นักจัดระเบียบ', description: 'มีสมุดบัญชี 3 เล่มขึ้นไป', icon: '🗂️', xp: 80, check: (d) => d.workspaces.length >= 3 },
  {
    id: 'first-budget',
    title: 'ตั้งงบครั้งแรก',
    description: 'ตั้งงบประมาณรายหมวดอย่างน้อยหนึ่งหมวด',
    icon: '🎯',
    xp: 60,
    check: (d) => d.workspaces.some((w) => w.budgets && Object.keys(w.budgets).length > 0),
  },
  { id: 'under-budget', title: 'คุมงบอยู่หมัด', description: 'จบเดือนโดยไม่มีหมวดไหนเกินงบ', icon: '🛡️', xp: 200, check: (d) => hasUnderBudgetMonth(d) },
  { id: 'saver-20', title: 'นักออม', description: 'มีเดือนที่ออมได้ 20% ของรายรับขึ้นไป', icon: '🐷', xp: 150, check: (d) => hasSavingMonth(d, 0.2) },
  { id: 'first-goal', title: 'มีเป้าหมาย', description: 'ตั้งเป้าหมายแรก', icon: '🚩', xp: 50, check: (d) => d.goals.length >= 1 },
  {
    id: 'goal-achieved',
    title: 'ถึงเป้าแล้ว!',
    description: 'ทำเป้าหมายสำเร็จอย่างน้อยหนึ่งข้อ',
    icon: '🎉',
    xp: 250,
    check: (d) => goalStatuses(d).some((g) => g.achieved),
  },
  { id: 'first-filing', title: 'พร้อมยื่นภาษี', description: 'บันทึกสรุปแบบภาษีครั้งแรก', icon: '🧾', xp: 120, check: (d) => d.filings.length >= 1 },
  { id: 'refund', title: 'ได้เงินคืน', description: 'มีแบบภาษีที่ขอคืนภาษีได้', icon: '💸', xp: 150, check: (d) => d.filings.some((f) => f.balance < 0) },
  { id: 'deduction-max', title: 'ลดหย่อนเต็มสิทธิ', description: 'ใช้สิทธิลดหย่อนที่ซื้อเพิ่มเองได้ครบ', icon: '💎', xp: 200, check: (d) => d.deductionMaxed },
  { id: 'quiz-perfect', title: 'เซียนภาษี', description: 'ตอบควิซภาษีถูกครบ 5 ข้อ', icon: '🧠', xp: 150, check: (d) => d.quizBest >= 5 },
  {
    id: 'challenge-done',
    title: 'ภารกิจสำเร็จ',
    description: 'ทำภารกิจออมเงินสำเร็จหนึ่งภารกิจ',
    icon: '🏅',
    xp: 300,
    check: (d) =>
      d.challenges.some((c) => {
        const own = d.entries.filter((e) => e.workspaceId === c.workspaceId)
        return challengeProgress(c, own, d.today).status === 'completed'
      }),
  },
  { id: 'stylist', title: 'สายแต่ง', description: 'เปลี่ยนรูปแบบหรือสีของเว็บ', icon: '🎨', xp: 30, check: (d) => d.styled },
]

/** เหรียญที่ผู้ใช้ทำได้ตามข้อมูลตอนนี้ */
export function earnedAchievements(data: GameData, streak = computeStreak(data.entries, data.today)): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(data, streak)).map((a) => a.id)
}

/* ---------- เลเวลและของแต่งตัว ---------- */

/** XP ที่ต้องมีเพื่อขึ้นแต่ละเลเวล (index 0 = เลเวล 1) */
export const LEVEL_XP = [0, 150, 400, 800, 1300, 2000, 3000]

export type Accessory = 'none' | 'bow' | 'glasses' | 'scarf' | 'hat' | 'crown'

export const ACCESSORIES: { key: Accessory; label: string; level: number }[] = [
  { key: 'none', label: 'ไม่ใส่', level: 1 },
  { key: 'bow', label: 'โบว์', level: 2 },
  { key: 'glasses', label: 'แว่นตา', level: 3 },
  { key: 'scarf', label: 'ผ้าพันคอ', level: 4 },
  { key: 'hat', label: 'หมวกปาร์ตี้', level: 5 },
  { key: 'crown', label: 'มงกุฎ', level: 6 },
]

export interface LevelInfo {
  xp: number
  level: number
  /** XP ของเลเวลปัจจุบัน และของเลเวลถัดไป (null คือเลเวลสูงสุดแล้ว) */
  floor: number
  next: number | null
  /** ความคืบหน้าไปเลเวลถัดไป 0–1 */
  progress: number
}

export function computeXp(unlocked: string[], streak: Streak, entryCount: number): number {
  const fromBadges = ACHIEVEMENTS.filter((a) => unlocked.includes(a.id)).reduce((s, a) => s + a.xp, 0)
  // จดรายการละ 2 XP สูงสุด 200 รายการ กันคนกดเพิ่มรายการรัว ๆ เพื่อปั๊มเลเวล
  return fromBadges + streak.best * 5 + Math.min(entryCount, 200) * 2
}

export function levelOf(xp: number): LevelInfo {
  let level = 1
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]!) level = i + 1
  const floor = LEVEL_XP[level - 1]!
  const next = LEVEL_XP[level] ?? null
  return {
    xp,
    level,
    floor,
    next,
    progress: next === null ? 1 : (xp - floor) / (next - floor),
  }
}

export function unlockedAccessories(level: number): Accessory[] {
  return ACCESSORIES.filter((a) => a.level <= level).map((a) => a.key)
}

/* ---------- อารมณ์ของตัวการ์ตูน ---------- */

export type Mood = 'normal' | 'happy' | 'worried' | 'sleepy'

export interface MoodInfo {
  mood: Mood
  /** คำพูดตามอารมณ์ — ว่างคือใช้คำทักทายปกติของตัวการ์ตูน */
  say: string
}

/**
 * อารมณ์คิดจากสถานะการเงินล่าสุด เรียงตามความสำคัญ
 *  1. กังวล — มีหมวดเกินงบในเดือนล่าสุด หรือเดือนล่าสุดรายจ่ายมากกว่ารายรับ
 *  2. ง่วง — ไม่ได้จดมา 3 วันขึ้นไป
 *  3. ดีใจ — เดือนล่าสุดออมได้ 20% ขึ้นไป หรือมีเป้าหมายที่ทำสำเร็จ
 */
export function computeMood(data: GameData, streak: Streak): MoodInfo {
  if (!data.entries.length) return { mood: 'normal', say: '' }

  for (const ws of data.workspaces) {
    const own = data.entries.filter((e) => e.workspaceId === ws.id)
    const month = monthsWithEntries(own)[0]
    if (!month || !ws.budgets) continue
    const over = evaluateBudgets(own, ws.mode, ws.budgets, month).find((b) => b.status === 'over')
    if (over) return { mood: 'worried', say: `หมวด${over.label}เกินงบแล้ว ระวังหน่อยน้า` }
  }

  const months = monthlyBreakdown(data.entries)
  const latest = months[months.length - 1]
  if (latest && latest.income > 0 && latest.net < 0) {
    return { mood: 'worried', say: 'เดือนล่าสุดใช้เงินเกินรายรับไปแล้ว ลองดูหมวดที่ลดได้กัน' }
  }

  if (streak.lastDate) {
    const idle = daysBetween(streak.lastDate, data.today)
    if (idle >= 3) return { mood: 'sleepy', say: `ไม่ได้จดมา ${idle} วันแล้ว คิดถึงจัง` }
  }

  if (latest && latest.income > 0 && latest.net / latest.income >= 0.2) {
    return { mood: 'happy', say: `ออมเก่งมาก! เดือนล่าสุดเหลือเก็บ ${Math.round((latest.net / latest.income) * 100)}%` }
  }
  if (goalStatuses(data).some((g) => g.achieved)) {
    return { mood: 'happy', say: 'มีเป้าหมายที่ทำสำเร็จแล้ว เก่งที่สุด!' }
  }
  return { mood: 'normal', say: '' }
}

/* ---------- ภารกิจออมเงิน ---------- */

export type ChallengeKind = 'week52' | 'daily' | 'nospend'

export const CHALLENGE_TYPES: {
  kind: ChallengeKind
  label: string
  description: string
  defaultAmount: number
  defaultDays: number
}[] = [
  {
    kind: 'week52',
    label: 'ออม 52 สัปดาห์',
    description: 'สัปดาห์ที่ 1 ออม 1 เท่า สัปดาห์ที่ 2 ออม 2 เท่า ไล่ไปจนครบปี',
    defaultAmount: 10,
    defaultDays: 364,
  },
  {
    kind: 'daily',
    label: 'ออมทุกวัน',
    description: 'ออมเท่ากันทุกวันจนครบจำนวนวันที่ตั้งไว้',
    defaultAmount: 20,
    defaultDays: 30,
  },
  {
    kind: 'nospend',
    label: 'งดใช้จ่ายหมวดเดียว',
    description: 'ไม่มีรายจ่ายในหมวดที่เลือกจนครบจำนวนวัน ระบบตรวจจากรายการให้เอง',
    defaultAmount: 0,
    defaultDays: 30,
  },
]

export type ChallengeStatus = 'active' | 'completed' | 'ended' | 'broken'

export interface ChallengeProgress {
  done: number
  total: number
  percent: number
  /** เงินที่ออมได้แล้ว (ภารกิจงดใช้จ่ายเป็น 0) */
  saved: number
  /** เงินที่จะได้เมื่อทำครบ */
  target: number
  /** รอบปัจจุบันเช็คอินแล้วหรือยัง */
  currentDone: boolean
  /** คีย์ของรอบปัจจุบัน (เลขสัปดาห์หรือวันที่) — null คือหมดเวลาแล้ว */
  currentKey: string | null
  /** ยอดที่ต้องออมในรอบนี้ */
  currentAmount: number
  status: ChallengeStatus
  /** วันที่ผิดเงื่อนไข (ภารกิจงดใช้จ่าย) */
  brokenDays: string[]
}

export function challengeProgress(
  ch: Pick<ChallengeRecord, 'kind' | 'startDate' | 'amount' | 'days' | 'categoryKey' | 'checkins'>,
  entries: { date: string; type: string; categoryKey: string }[],
  today: string,
): ChallengeProgress {
  const elapsed = Math.max(0, daysBetween(ch.startDate, today)) + 1
  const checkins = new Set(ch.checkins)

  if (ch.kind === 'week52') {
    const week = Math.ceil(elapsed / 7)
    const done = [...checkins].filter((k) => Number(k) >= 1 && Number(k) <= 52).length
    const saved = [...checkins].reduce((s, k) => s + Number(k) * ch.amount, 0)
    const inRange = week <= 52
    return {
      done,
      total: 52,
      percent: done / 52,
      saved: roundMoney(saved),
      target: roundMoney(ch.amount * 1378),
      currentDone: inRange && checkins.has(String(week)),
      currentKey: inRange ? String(week) : null,
      currentAmount: roundMoney(Math.min(week, 52) * ch.amount),
      status: done >= 52 ? 'completed' : inRange ? 'active' : 'ended',
      brokenDays: [],
    }
  }

  if (ch.kind === 'daily') {
    const done = checkins.size
    const inRange = elapsed <= ch.days
    return {
      done,
      total: ch.days,
      percent: Math.min(1, done / ch.days),
      saved: roundMoney(done * ch.amount),
      target: roundMoney(ch.days * ch.amount),
      currentDone: inRange && checkins.has(today),
      currentKey: inRange ? today : null,
      currentAmount: ch.amount,
      status: done >= ch.days ? 'completed' : inRange ? 'active' : 'ended',
      brokenDays: [],
    }
  }

  // งดใช้จ่าย: ตรวจจากรายการจริงในช่วงภารกิจ
  const end = addDays(ch.startDate, ch.days - 1)
  const last = today < end ? today : end
  const brokenDays = [
    ...new Set(
      entries
        .filter(
          (e) =>
            e.type === 'expense' &&
            e.categoryKey === ch.categoryKey &&
            e.date >= ch.startDate &&
            e.date <= last,
        )
        .map((e) => e.date),
    ),
  ].sort()
  const counted = Math.min(elapsed, ch.days)
  const clean = Math.max(0, counted - brokenDays.length)
  const finished = elapsed >= ch.days
  return {
    done: clean,
    total: ch.days,
    percent: clean / ch.days,
    saved: 0,
    target: 0,
    currentDone: false,
    currentKey: null,
    currentAmount: 0,
    status: brokenDays.length ? 'broken' : finished ? 'completed' : 'active',
    brokenDays,
  }
}
