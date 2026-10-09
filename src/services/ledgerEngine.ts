/**
 * เครื่องวิเคราะห์สมุดบัญชี — ฟังก์ชันบริสุทธิ์ทั้งหมด
 *
 * ตอบสามคำถามหลักที่คนบันทึกรายรับรายจ่ายอยากรู้
 *   1. เดือนหนึ่งเหลือเก็บเท่าไร และรายจ่ายสูงเกินไปหรือยัง
 *   2. เงินทุนที่มีอยู่ใช้ได้อีกกี่เดือน และควรมีสำรองกี่เดือนถึงจะปลอดภัย
 *   3. เข้าใกล้เป้าหมายที่ตั้งไว้แค่ไหน
 */

import {
  categoryLabel,
  modeDefinition,
  type EntryType,
  type GoalKind,
  type WorkspaceMode,
} from '@/data/workspaceModes'
import {
  EVIDENCE_KINDS,
  type EvidenceDirection,
  type EvidenceKind,
} from '@/data/evidenceTypes'
import { roundMoney } from './taxEngine'

export interface LedgerEntry {
  id: string
  date: string
  type: EntryType
  categoryKey: string
  amount: number
  note: string
  /** ภาษีหัก ณ ที่จ่ายของรายการนี้ (โหมดฟรีแลนซ์และบริษัท) */
  withholdingTax?: number
  /** ภาษีมูลค่าเพิ่มของรายการนี้ (โหมดธุรกิจ) */
  vatAmount?: number
  /** สัญลักษณ์ที่เทรด (โหมดเทรดเดอร์) */
  symbol?: string
  /** ข้อมูลจากสลิปโอนเงิน — มีเฉพาะรายการที่บันทึกจากสลิป ช่องที่อ่านไม่ได้เป็น null */
  slip?: SlipMeta
}

export type RecipientType = 'person' | 'company'

export interface SlipMeta {
  /** HH:MM เวลาไทยตามที่พิมพ์บนสลิป */
  time: string | null
  sender: string | null
  recipient: string | null
  recipientType: RecipientType | null
  /** ธนาคารของฝั่งผู้รับ ถ้าแยกได้ */
  recipientBank: string | null
  /** ธนาคารทั้งหมดที่พบบนสลิป */
  banks: string[]
  /** เลขอ้างอิงตามที่พิมพ์บนสลิป (ตัดเฉพาะช่องว่างคั่นกลุ่ม) */
  reference: string | null
  /** SHA-256 ของไฟล์รูปสลิป ใช้ตรวจสลิปซ้ำ */
  imageHash: string | null
}

function clean(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** เดือนของรายการในรูปแบบ YYYY-MM */
function monthKey(date: string): string {
  return (date || '').slice(0, 7)
}

/* ---------- สรุปยอด ---------- */

export interface CategoryTotal {
  key: string
  label: string
  type: EntryType
  amount: number
  /** สัดส่วนเทียบกับยอดรวมของประเภทเดียวกัน */
  share: number
  count: number
}

export interface LedgerSummary {
  income: number
  expense: number
  /** รายรับหักรายจ่าย */
  net: number
  /** สัดส่วนที่เหลือเก็บจากรายรับ */
  savingsRate: number
  /** ต้นทุนขาย ใช้คำนวณกำไรขั้นต้น */
  cogs: number
  grossProfit: number
  grossMargin: number
  withholdingTax: number
  vatAmount: number
  /** รายจ่ายที่จำเป็นต่อการดำเนินชีวิตหรือดำเนินกิจการ */
  essentialExpense: number
  /** จำนวนเดือนที่มีข้อมูล อย่างน้อย 1 เพื่อไม่ให้หารด้วยศูนย์ */
  monthsCovered: number
  entryCount: number
  byCategory: CategoryTotal[]
}

export function summarise(entries: LedgerEntry[], mode: WorkspaceMode): LedgerSummary {
  const definition = modeDefinition(mode)
  const cogsKeys = new Set(definition.categories.filter((c) => c.isCogs).map((c) => c.key))
  const essentialKeys = new Set(definition.categories.filter((c) => c.essential).map((c) => c.key))

  let income = 0
  let expense = 0
  let cogs = 0
  let essentialExpense = 0
  let withholdingTax = 0
  let vatAmount = 0

  const totals = new Map<string, CategoryTotal>()
  const months = new Set<string>()

  for (const entry of entries) {
    const amount = clean(entry.amount)
    withholdingTax += clean(entry.withholdingTax)
    vatAmount += clean(entry.vatAmount)
    if (entry.date) months.add(monthKey(entry.date))

    if (entry.type === 'income') income += amount
    else {
      expense += amount
      if (cogsKeys.has(entry.categoryKey)) cogs += amount
      if (essentialKeys.has(entry.categoryKey)) essentialExpense += amount
    }

    const existing = totals.get(entry.categoryKey)
    if (existing) {
      existing.amount += amount
      existing.count += 1
    } else {
      totals.set(entry.categoryKey, {
        key: entry.categoryKey,
        label: categoryLabel(mode, entry.categoryKey),
        type: entry.type,
        amount,
        share: 0,
        count: 1,
      })
    }
  }

  const byCategory = [...totals.values()]
    .map((row) => {
      const base = row.type === 'income' ? income : expense
      return { ...row, amount: roundMoney(row.amount), share: base > 0 ? row.amount / base : 0 }
    })
    .sort((a, b) => b.amount - a.amount)

  const grossProfit = income - cogs

  return {
    income: roundMoney(income),
    expense: roundMoney(expense),
    net: roundMoney(income - expense),
    savingsRate: income > 0 ? (income - expense) / income : 0,
    cogs: roundMoney(cogs),
    grossProfit: roundMoney(grossProfit),
    grossMargin: income > 0 ? grossProfit / income : 0,
    withholdingTax: roundMoney(withholdingTax),
    vatAmount: roundMoney(vatAmount),
    essentialExpense: roundMoney(essentialExpense),
    monthsCovered: Math.max(1, months.size),
    entryCount: entries.length,
    byCategory,
  }
}

export interface MonthlyAverages {
  income: number
  expense: number
  essentialExpense: number
  net: number
  months: number
}

/** ค่าเฉลี่ยต่อเดือน คิดจากจำนวนเดือนที่มีข้อมูลจริง */
export function monthlyAverages(entries: LedgerEntry[], mode: WorkspaceMode): MonthlyAverages {
  const s = summarise(entries, mode)
  const months = s.monthsCovered
  return {
    income: roundMoney(s.income / months),
    expense: roundMoney(s.expense / months),
    essentialExpense: roundMoney(s.essentialExpense / months),
    net: roundMoney(s.net / months),
    months,
  }
}

/** ยอดรวมรายเดือนสำหรับวาดกราฟแท่ง */
export interface MonthlyPoint {
  month: string
  income: number
  expense: number
  net: number
}

export function monthlyBreakdown(entries: LedgerEntry[]): MonthlyPoint[] {
  const map = new Map<string, MonthlyPoint>()
  for (const entry of entries) {
    const key = monthKey(entry.date)
    if (!key) continue
    const point = map.get(key) ?? { month: key, income: 0, expense: 0, net: 0 }
    if (entry.type === 'income') point.income += clean(entry.amount)
    else point.expense += clean(entry.amount)
    map.set(key, point)
  }
  // ปัดเป็นสตางค์หลังรวมครบ กันเศษทศนิยมฐานสองอย่าง 0.1 + 0.2 = 0.30000000000000004
  return [...map.values()]
    .map((point) => ({
      month: point.month,
      income: roundMoney(point.income),
      expense: roundMoney(point.expense),
      net: roundMoney(point.income - point.expense),
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/* ---------- วิเคราะห์ความเสี่ยงของรายจ่าย ---------- */

export type RiskLevel = 'healthy' | 'comfortable' | 'watch' | 'risky' | 'deficit'

export interface ExpenseRisk {
  /** รายจ่ายคิดเป็นสัดส่วนเท่าไรของรายรับ */
  ratio: number
  level: RiskLevel
  headline: string
  detail: string
  /** เหลือเก็บต่อเดือน */
  surplus: number
  savingsRate: number
  targetSavingsRate: number
  /** ต้องลดรายจ่ายอีกเท่าไรจึงจะถึงเป้าการออม — 0 คือถึงแล้ว */
  expenseToCut: number
  /** เพดานรายจ่ายที่ทำให้ถึงเป้าการออมพอดี */
  sustainableExpense: number
}

const RISK_BANDS: { max: number; level: RiskLevel; headline: string }[] = [
  { max: 0.5, level: 'healthy', headline: 'สัดส่วนรายจ่ายอยู่ในเกณฑ์ดีมาก' },
  { max: 0.7, level: 'comfortable', headline: 'สัดส่วนรายจ่ายอยู่ในเกณฑ์ปกติ' },
  { max: 0.85, level: 'watch', headline: 'รายจ่ายเริ่มสูง ควรเฝ้าระวัง' },
  { max: 1, level: 'risky', headline: 'รายจ่ายสูงเกินไป เหลือเก็บน้อยมาก' },
  { max: Number.POSITIVE_INFINITY, level: 'deficit', headline: 'รายจ่ายมากกว่ารายรับ' },
]

/**
 * ตอบคำถามว่า "รายรับ 15,000 รายจ่าย 14,000 ถือว่าสูงไปไหม"
 * ดูสองอย่างพร้อมกัน คือสัดส่วนรายจ่ายต่อรายรับ และเหลือเก็บพอถึงเป้าการออมของโหมดนั้นหรือไม่
 */
export function analyseExpenseRisk(
  monthlyIncome: number,
  monthlyExpense: number,
  mode: WorkspaceMode,
): ExpenseRisk {
  const income = clean(monthlyIncome)
  const expense = clean(monthlyExpense)
  const target = modeDefinition(mode).targetSavingsRate
  const surplus = income - expense
  const savingsRate = income > 0 ? surplus / income : 0

  if (income <= 0) {
    return {
      ratio: expense > 0 ? Number.POSITIVE_INFINITY : 0,
      level: expense > 0 ? 'deficit' : 'watch',
      headline: expense > 0 ? 'มีรายจ่ายแต่ยังไม่มีรายรับ' : 'ยังไม่มีข้อมูลพอจะประเมิน',
      detail:
        expense > 0
          ? `เดือนนี้จ่ายไป ${expense.toLocaleString('th-TH')} บาทโดยไม่มีรายรับเข้ามาเลย เงินทุนจะลดลงเรื่อย ๆ`
          : 'บันทึกรายรับและรายจ่ายอย่างน้อยหนึ่งเดือนเพื่อให้ระบบประเมินได้',
      surplus: roundMoney(surplus),
      savingsRate: 0,
      targetSavingsRate: target,
      expenseToCut: roundMoney(expense),
      sustainableExpense: 0,
    }
  }

  const ratio = expense / income
  const band = RISK_BANDS.find((b) => ratio <= b.max) ?? RISK_BANDS[RISK_BANDS.length - 1]!
  // เพดานรายจ่ายที่ยังออมได้ตามเป้าของโหมดนี้
  const sustainableExpense = income * (1 - target)
  const expenseToCut = Math.max(0, expense - sustainableExpense)

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const baht = (n: number) => `${Math.round(n).toLocaleString('th-TH')} บาท`

  let detail: string
  if (band.level === 'deficit') {
    detail = `รายจ่ายคิดเป็น ${pct(ratio)} ของรายรับ ขาดอยู่เดือนละ ${baht(-surplus)} ต้องดึงเงินทุนมาโปะทุกเดือน`
  } else if (expenseToCut > 0) {
    detail =
      `รายจ่ายคิดเป็น ${pct(ratio)} ของรายรับ เหลือเก็บเดือนละ ${baht(surplus)} หรือ ${pct(savingsRate)} ` +
      `ซึ่งต่ำกว่าเป้า ${pct(target)} ของโหมดนี้ ต้องลดรายจ่ายอีกเดือนละ ${baht(expenseToCut)} ` +
      `ให้เหลือไม่เกิน ${baht(sustainableExpense)} จึงจะถึงเป้า`
  } else {
    detail =
      `รายจ่ายคิดเป็น ${pct(ratio)} ของรายรับ เหลือเก็บเดือนละ ${baht(surplus)} หรือ ${pct(savingsRate)} ` +
      `ซึ่งถึงเป้า ${pct(target)} ของโหมดนี้แล้ว`
  }

  return {
    ratio,
    level: band.level,
    headline: band.headline,
    detail,
    surplus: roundMoney(surplus),
    savingsRate,
    targetSavingsRate: target,
    expenseToCut: roundMoney(expenseToCut),
    sustainableExpense: roundMoney(sustainableExpense),
  }
}

/* ---------- วิเคราะห์เงินทุน ---------- */

export type RunwayLevel = 'positive' | 'healthy' | 'watch' | 'tight' | 'critical'

export interface RunwayAnalysis {
  /** เงินที่ไหลออกสุทธิต่อเดือน — <= 0 คือรายรับพอเลี้ยงตัวเองแล้ว */
  netBurn: number
  /** เงินทุนปัจจุบันอยู่ได้กี่เดือน — Infinity เมื่อไม่ต้องเผาเงินทุน */
  months: number
  /** จำนวนเดือนที่ควรมีสำรองตามลักษณะรายได้ของโหมดนี้ */
  recommendedMonths: number
  level: RunwayLevel
  headline: string
  detail: string
  /** เงินทุนที่ควรมีเพื่อให้ครบตามเดือนที่แนะนำ */
  requiredCapital: number
  /** ยังขาดอีกเท่าไร */
  shortfall: number
  /** วันที่เงินทุนจะหมด ถ้ายังเผาในอัตรานี้ */
  depletionDate: string | null
}

/**
 * ตอบคำถามว่า "มีทุน 100,000 จ่ายเดือนละ 10,000 อยู่ได้ 10 เดือน เสี่ยงไปไหม"
 * คำตอบขึ้นกับความผันผวนของรายได้ในโหมดนั้น ฟรีแลนซ์ควรมีสำรอง 12 เดือน แต่มนุษย์เงินเดือน 6 เดือนก็พอ
 */
export function analyseRunway(
  capital: number,
  monthlyExpense: number,
  monthlyIncome: number,
  mode: WorkspaceMode,
  today: Date = new Date(),
): RunwayAnalysis {
  const funds = clean(capital)
  const expense = clean(monthlyExpense)
  const income = clean(monthlyIncome)
  const recommendedMonths = modeDefinition(mode).recommendedRunwayMonths
  const netBurn = expense - income

  const baht = (n: number) => `${Math.round(n).toLocaleString('th-TH')} บาท`

  if (netBurn <= 0) {
    return {
      netBurn: roundMoney(netBurn),
      months: Number.POSITIVE_INFINITY,
      recommendedMonths,
      level: 'positive',
      headline: 'รายรับเลี้ยงตัวเองได้แล้ว',
      detail:
        income > 0
          ? `รายรับต่อเดือนมากกว่ารายจ่าย ${baht(-netBurn)} จึงไม่ต้องดึงเงินทุนออกมาใช้ เงินทุน ${baht(funds)} ยังอยู่ครบและเพิ่มขึ้นเรื่อย ๆ`
          : 'ยังไม่มีทั้งรายรับและรายจ่าย บันทึกรายการเพิ่มเพื่อให้ประเมินได้',
      requiredCapital: 0,
      shortfall: 0,
      depletionDate: null,
    }
  }

  const months = funds / netBurn
  const requiredCapital = recommendedMonths * netBurn
  const shortfall = Math.max(0, requiredCapital - funds)

  let level: RunwayLevel
  if (months >= recommendedMonths) level = 'healthy'
  else if (months >= recommendedMonths * 0.66) level = 'watch'
  else if (months >= recommendedMonths * 0.33) level = 'tight'
  else level = 'critical'

  const headline =
    level === 'healthy'
      ? `เงินทุนอยู่ได้ ${months.toFixed(1)} เดือน ผ่านเกณฑ์ที่แนะนำ`
      : level === 'watch'
        ? `เงินทุนอยู่ได้ ${months.toFixed(1)} เดือน ยังไม่ถึงเกณฑ์ที่แนะนำ`
        : level === 'tight'
          ? `เงินทุนอยู่ได้ ${months.toFixed(1)} เดือน ถือว่าตึงมาก`
          : `เงินทุนอยู่ได้เพียง ${months.toFixed(1)} เดือน อยู่ในภาวะวิกฤต`

  const detail =
    shortfall > 0
      ? `โหมดนี้ควรมีเงินสำรองอย่างน้อย ${recommendedMonths} เดือน คิดเป็น ${baht(requiredCapital)} ` +
        `ตอนนี้มี ${baht(funds)} จึงยังขาดอีก ${baht(shortfall)} ` +
        `ทางเลือกคือเก็บเพิ่มให้ครบ หรือลดรายจ่ายสุทธิลงเหลือเดือนละ ${baht(funds / recommendedMonths)}`
      : `โหมดนี้ควรมีเงินสำรองอย่างน้อย ${recommendedMonths} เดือน คิดเป็น ${baht(requiredCapital)} ` +
        `ตอนนี้มี ${baht(funds)} ซึ่งเกินเกณฑ์แล้ว ${baht(funds - requiredCapital)}`

  const depletion = new Date(today)
  depletion.setMonth(depletion.getMonth() + Math.floor(months))

  return {
    netBurn: roundMoney(netBurn),
    months,
    recommendedMonths,
    level,
    headline,
    detail,
    requiredCapital: roundMoney(requiredCapital),
    shortfall: roundMoney(shortfall),
    depletionDate: depletion.toISOString().slice(0, 10),
  }
}

/* ---------- เป้าหมาย ---------- */

export interface Goal {
  id: string
  name: string
  kind: GoalKind
  target: number
  /** กำหนดเสร็จในรูปแบบ YYYY-MM-DD — ว่างได้ */
  deadline: string
}

export interface GoalProgress {
  goal: Goal
  current: number
  /** 0–1 โดยตัดที่ 1 */
  percent: number
  achieved: boolean
  /** ยังขาดอีกเท่าไร (หรือเกินเพดานไปเท่าไรสำหรับเป้าคุมรายจ่าย) */
  remaining: number
  message: string
}

export function evaluateGoal(
  goal: Goal,
  summary: LedgerSummary,
  averages: MonthlyAverages,
  capital: number,
): GoalProgress {
  const target = clean(goal.target)
  let current = 0
  let achieved = false
  let message = ''

  const baht = (n: number) => `${Math.round(n).toLocaleString('th-TH')} บาท`

  switch (goal.kind) {
    case 'save':
      // เงินคงเหลือสะสม นับรวมเงินทุนตั้งต้นด้วย
      current = clean(capital) + summary.net
      achieved = current >= target
      message = achieved
        ? `ถึงเป้าแล้ว มีอยู่ ${baht(current)}`
        : `ยังขาดอีก ${baht(target - current)} จากเป้า ${baht(target)}`
      break
    case 'income':
      current = averages.income
      achieved = current >= target
      message = achieved
        ? `รายรับเฉลี่ย ${baht(current)} ต่อเดือน ถึงเป้าแล้ว`
        : `รายรับเฉลี่ย ${baht(current)} ต่อเดือน ยังขาดอีก ${baht(target - current)}`
      break
    case 'expenseCap':
      current = averages.expense
      // เป้าแบบคุมเพดาน ยิ่งต่ำยิ่งดี จึงถือว่าสำเร็จเมื่อไม่เกินเป้า
      achieved = current <= target
      message = achieved
        ? `รายจ่ายเฉลี่ย ${baht(current)} ต่อเดือน ยังอยู่ในเพดาน ${baht(target)}`
        : `รายจ่ายเฉลี่ย ${baht(current)} ต่อเดือน เกินเพดานมา ${baht(current - target)}`
      break
    case 'runway': {
      const burn = Math.max(0, averages.expense - averages.income)
      current = burn > 0 ? (clean(capital) + summary.net) / burn : Number.POSITIVE_INFINITY
      achieved = current >= target
      message = Number.isFinite(current)
        ? achieved
          ? `เงินสำรองอยู่ได้ ${current.toFixed(1)} เดือน ถึงเป้า ${target} เดือนแล้ว`
          : `เงินสำรองอยู่ได้ ${current.toFixed(1)} เดือน ยังไม่ถึงเป้า ${target} เดือน`
        : 'รายรับมากกว่ารายจ่าย จึงยังไม่ต้องเผาเงินสำรอง'
      break
    }
  }

  const percent =
    goal.kind === 'expenseCap'
      ? target > 0
        ? Math.min(1, current / target)
        : 0
      : target > 0 && Number.isFinite(current)
        ? Math.min(1, Math.max(0, current / target))
        : achieved
          ? 1
          : 0

  const remaining =
    goal.kind === 'expenseCap'
      ? roundMoney(Math.max(0, current - target))
      : Number.isFinite(current)
        ? roundMoney(Math.max(0, target - current))
        : 0

  return { goal, current: Number.isFinite(current) ? roundMoney(current) : current, percent, achieved, remaining, message }
}

/* ---------- สถิติการเทรด ---------- */

export interface TradingStats {
  trades: number
  wins: number
  losses: number
  winRate: number
  grossProfit: number
  grossLoss: number
  /** กำไรรวมหารขาดทุนรวม — เกิน 1 คือระบบทำเงินได้ */
  profitFactor: number
  netPnl: number
  avgWin: number
  avgLoss: number
  /** กำไรคาดหวังต่อไม้ */
  expectancy: number
  largestWin: number
  largestLoss: number
}

/** นับเฉพาะรายการที่เป็นผลการเทรดจริง ไม่รวมค่าธรรมเนียมและค่าข้อมูล */
const TRADE_RESULT_KEYS = new Set(['tradeProfit', 'tradeLoss'])

export function tradingStats(entries: LedgerEntry[]): TradingStats {
  const results = entries.filter((e) => TRADE_RESULT_KEYS.has(e.categoryKey))
  const wins = results.filter((e) => e.type === 'income').map((e) => clean(e.amount))
  const losses = results.filter((e) => e.type === 'expense').map((e) => clean(e.amount))

  const grossProfit = wins.reduce((s, n) => s + n, 0)
  const grossLoss = losses.reduce((s, n) => s + n, 0)
  const trades = wins.length + losses.length

  return {
    trades,
    wins: wins.length,
    losses: losses.length,
    winRate: trades > 0 ? wins.length / trades : 0,
    grossProfit: roundMoney(grossProfit),
    grossLoss: roundMoney(grossLoss),
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0,
    netPnl: roundMoney(grossProfit - grossLoss),
    avgWin: wins.length > 0 ? roundMoney(grossProfit / wins.length) : 0,
    avgLoss: losses.length > 0 ? roundMoney(grossLoss / losses.length) : 0,
    expectancy: trades > 0 ? roundMoney((grossProfit - grossLoss) / trades) : 0,
    largestWin: wins.length > 0 ? roundMoney(Math.max(...wins)) : 0,
    largestLoss: losses.length > 0 ? roundMoney(Math.max(...losses)) : 0,
  }
}

/* ---------- หลักฐานประกอบรายการ ---------- */


export interface Evidence {
  id: string
  entryId: string | null
  /** วันที่ของหลักฐาน ปกติเท่ากับวันที่ของรายการ */
  date: string
  direction: EvidenceDirection
  kind: EvidenceKind
  name: string
  size: number
  mimeType: string
  uploadedAt: string
  note: string
}

export interface EvidenceKindGroup {
  kind: EvidenceKind
  label: string
  items: Evidence[]
}

export interface EvidenceDirectionGroup {
  direction: EvidenceDirection
  label: string
  count: number
  kinds: EvidenceKindGroup[]
}

export interface EvidenceDateGroup {
  date: string
  count: number
  directions: EvidenceDirectionGroup[]
}

/**
 * จัดหลักฐานเป็น วันที่ → รับเงิน/จ่ายเงิน → ชนิดหลักฐาน
 *
 * เรียงวันที่จากใหม่ไปเก่า และตัดกลุ่มที่ไม่มีไฟล์ทิ้ง
 * เพื่อให้หน้าจอแสดงเฉพาะหัวข้อที่มีของจริงอยู่ข้างใน
 */
export function groupEvidence(items: Evidence[]): EvidenceDateGroup[] {
  const byDate = new Map<string, Evidence[]>()
  for (const item of items) {
    const key = item.date || item.uploadedAt.slice(0, 10)
    const list = byDate.get(key)
    if (list) list.push(item)
    else byDate.set(key, [item])
  }

  const directions: { value: EvidenceDirection; label: string }[] = [
    { value: 'income', label: 'หลักฐานการรับเงิน' },
    { value: 'expense', label: 'หลักฐานการจ่ายเงิน' },
  ]

  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayItems]) => ({
      date,
      count: dayItems.length,
      directions: directions
        .map(({ value, label }) => {
          const forDirection = dayItems.filter((i) => i.direction === value)
          return {
            direction: value,
            label,
            count: forDirection.length,
            kinds: EVIDENCE_KINDS.map((kind) => ({
              kind: kind.value,
              label: kind.label,
              items: forDirection
                .filter((i) => i.kind === kind.value)
                .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
            })).filter((group) => group.items.length > 0),
          }
        })
        .filter((group) => group.count > 0),
    }))
}

/** จำนวนหลักฐานของแต่ละรายการ ใช้ติดป้ายในตารางรายการ */
export function evidenceCountByEntry(items: Evidence[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    if (!item.entryId) continue
    counts.set(item.entryId, (counts.get(item.entryId) ?? 0) + 1)
  }
  return counts
}

/* ---------- งบประมาณรายหมวด ---------- */

export type BudgetStatus = 'ok' | 'warn' | 'over'

export interface BudgetProgress {
  categoryKey: string
  label: string
  limit: number
  spent: number
  remaining: number
  /** ใช้ไปแล้วกี่ส่วนของงบ (เกิน 1 ได้) */
  ratio: number
  status: BudgetStatus
}

/** ใช้งบถึงสัดส่วนนี้แล้วเริ่มเตือน */
export const BUDGET_WARN_RATIO = 0.8

/** เดือนที่มีรายการ เรียงใหม่ไปเก่า — ใช้ทำตัวเลือกเดือนของงบประมาณ */
export function monthsWithEntries(entries: LedgerEntry[]): string[] {
  return [...new Set(entries.map((e) => monthKey(e.date)).filter(Boolean))].sort().reverse()
}

/**
 * เทียบรายจ่ายของเดือนที่เลือกกับงบรายหมวดที่ตั้งไว้
 * เรียงหมวดที่ใกล้เกินหรือเกินงบขึ้นก่อน ผู้ใช้จะได้เห็นเรื่องที่ต้องระวังทันที
 */
export function evaluateBudgets(
  entries: LedgerEntry[],
  mode: WorkspaceMode,
  budgets: Record<string, number>,
  month: string,
): BudgetProgress[] {
  const spentByKey = new Map<string, number>()
  for (const entry of entries) {
    if (entry.type !== 'expense' || monthKey(entry.date) !== month) continue
    spentByKey.set(entry.categoryKey, (spentByKey.get(entry.categoryKey) ?? 0) + clean(entry.amount))
  }

  return Object.entries(budgets)
    .filter(([, limit]) => clean(limit) > 0)
    .map(([categoryKey, rawLimit]) => {
      const limit = clean(rawLimit)
      const spent = roundMoney(spentByKey.get(categoryKey) ?? 0)
      const ratio = spent / limit
      return {
        categoryKey,
        label: categoryLabel(mode, categoryKey),
        limit,
        spent,
        remaining: roundMoney(limit - spent),
        ratio,
        status: (ratio > 1 ? 'over' : ratio >= BUDGET_WARN_RATIO ? 'warn' : 'ok') as BudgetStatus,
      }
    })
    .sort((a, b) => b.ratio - a.ratio)
}

/* ---------- ค้นหาและกรองรายการ ---------- */

export type EntrySort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'

export interface EntryFilter {
  type: 'all' | EntryType
  /** ค้นจากรายละเอียด ชื่อหมวด และสัญลักษณ์ที่เทรด */
  query: string
  categoryKey: string
  /** YYYY-MM-DD ว่างคือไม่จำกัด */
  from: string
  to: string
  sort: EntrySort
}

export const EMPTY_FILTER: EntryFilter = {
  type: 'all',
  query: '',
  categoryKey: '',
  from: '',
  to: '',
  sort: 'date-desc',
}

export function filterEntries<T extends LedgerEntry>(
  entries: T[],
  filter: EntryFilter,
  labelOf: (key: string) => string,
): T[] {
  const q = filter.query.trim().toLowerCase()
  const rows = entries.filter((e) => {
    if (filter.type !== 'all' && e.type !== filter.type) return false
    if (filter.categoryKey && e.categoryKey !== filter.categoryKey) return false
    if (filter.from && e.date < filter.from) return false
    if (filter.to && e.date > filter.to) return false
    if (q) {
      const haystack = `${e.note} ${labelOf(e.categoryKey)} ${e.symbol ?? ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
  const byDate = (a: T, b: T) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  const byAmount = (a: T, b: T) => clean(a.amount) - clean(b.amount)
  const sorters: Record<EntrySort, (a: T, b: T) => number> = {
    'date-desc': (a, b) => byDate(b, a),
    'date-asc': byDate,
    'amount-desc': (a, b) => byAmount(b, a),
    'amount-asc': byAmount,
  }
  return [...rows].sort(sorters[filter.sort])
}

export function isFilterActive(filter: EntryFilter): boolean {
  return Boolean(filter.query.trim() || filter.categoryKey || filter.from || filter.to)
}

/* ---------- รายการประจำ ---------- */

export interface RecurringTemplate {
  id: string
  type: EntryType
  categoryKey: string
  amount: number
  note: string
  /** วันที่ของทุกเดือน 1–31 — เดือนที่สั้นกว่าใช้วันสุดท้ายของเดือน */
  dayOfMonth: number
  /** เดือนแรกที่ต้องสร้างรายการ YYYY-MM */
  startMonth: string
  /** เดือนล่าสุดที่สร้างรายการไปแล้ว — ว่างคือยังไม่เคยสร้าง */
  lastMonth: string
}

function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function dateInMonth(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const last = new Date(y, m, 0).getDate()
  return `${month}-${String(Math.min(Math.max(1, day), last)).padStart(2, '0')}`
}

/**
 * วันที่ที่รายการประจำนี้ต้องถูกสร้างแต่ยังไม่ได้สร้าง นับถึงวันนี้
 * เปิดสมุดหลังหายไปหลายเดือนก็สร้างย้อนให้ครบทุกเดือน ไม่สร้างล่วงหน้าเกินวันนี้
 */
export function dueRecurringDates(template: RecurringTemplate, today: string): string[] {
  const todayMonth = today.slice(0, 7)
  let month = template.lastMonth ? addMonths(template.lastMonth, 1) : template.startMonth
  const dates: string[] = []
  // กันวนไม่รู้จบเมื่อข้อมูลเสีย: สร้างย้อนได้ไม่เกิน 36 เดือน
  for (let i = 0; i < 36 && month <= todayMonth; i++) {
    const date = dateInMonth(month, template.dayOfMonth)
    if (date > today) break
    dates.push(date)
    month = addMonths(month, 1)
  }
  return dates
}

export { addMonths as shiftMonth }
