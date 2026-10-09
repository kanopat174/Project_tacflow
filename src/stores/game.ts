import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api, type ChallengeRecord, type EntryRecord, type Filing, type GoalRecord, type Workspace } from '@/services/api'
import {
  ACCESSORIES,
  ACHIEVEMENTS,
  computeMood,
  computeStreak,
  computeXp,
  earnedAchievements,
  goalStatuses,
  levelOf,
  unlockedAccessories,
  daysBetween,
  type Accessory,
  type GameData,
} from '@/services/gamification'
import { evaluateBudgets, monthsWithEntries } from '@/services/ledgerEngine'
import { daysUntilYearEnd, suggestDeductions } from '@/services/deductionAdvisor'
import { DEFAULT_PAYMENT_PLAN, paymentSchedule } from '@/services/latePayment'
import { liveTax } from '@/services/liveTax'
import { activeSeasonalAccessories, taxSeason, taxSeasonMission } from '@/services/seasons'
import { weeklyRecap } from '@/services/weeklyRecap'
import { upcomingDeadlines } from '@/services/taxCalendar'
import { backupOverdueDays, backupStamp, readLastBackup, requestPersistentStorage } from '@/services/storageSafety'
import { FUND_KINDS, loadFunds, lotStatuses, type FundBook } from '@/services/fundHoldings'
import { formatBaht, roundMoney } from '@/services/taxEngine'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from './auth'
import { useCelebrateStore } from './celebrate'
import { useFilingStore } from './filing'
import { localToday, useLedgerStore } from './ledger'

/** สิ่งที่จำไว้ต่อผู้ใช้ในเครื่องนี้ */
interface SavedProgress {
  /** เหรียญที่ปลดล็อกแล้ว → วันที่ปลดล็อก */
  unlocked: Record<string, string>
  equipped: Accessory
  quizBest: number
  /** การแจ้งเตือนที่อ่านแล้ว */
  seen: string[]
  /** เป้าหมายที่ฉลองไปแล้ว จะได้ไม่ฉลองซ้ำ */
  celebratedGoals: string[]
  /** ของแต่งตัวพิเศษที่สะสมได้แล้ว (เทศกาล / รางวัล) เก็บถาวร */
  collected: Accessory[]
}

const emptyProgress = (): SavedProgress => ({
  unlocked: {},
  equipped: 'none',
  quizBest: 0,
  seen: [],
  celebratedGoals: [],
  collected: [],
})

export const gameStorageKey = (userId: string) => `taxflow_game_${userId}`

/** เริ่มเตือนให้ซื้อลดหย่อนเมื่อเหลือไม่เกินกี่วันก่อนสิ้นปี */
const YEAR_END_WINDOW_DAYS = 90

export interface AppNotification {
  id: string
  level: 'ok' | 'info' | 'warn' | 'bad'
  icon: string
  title: string
  text: string
  to: string
}

/** ฟีเจอร์สนุก ๆ ทั้งหมด (เหรียญ เลเวล อารมณ์ แจ้งเตือน) อ่านข้อมูลจากที่นี่ที่เดียว */
export const useGameStore = defineStore('game', () => {
  const auth = useAuthStore()
  const ledger = useLedgerStore()
  const filing = useFilingStore()
  const celebrate = useCelebrateStore()
  const theme = useTheme()

  const workspaces = ref<Workspace[]>([])
  const entries = ref<EntryRecord[]>([])
  const goals = ref<GoalRecord[]>([])
  const filings = ref<Filing[]>([])
  const challenges = ref<ChallengeRecord[]>([])
  const funds = ref<FundBook>({ lots: [], birthDate: '' })
  const loaded = ref(false)
  const progress = ref<SavedProgress>(emptyProgress())
  const today = ref(localToday())

  /* ---------- เก็บความคืบหน้า ---------- */

  function load(userId: string): SavedProgress | null {
    try {
      const raw = localStorage.getItem(gameStorageKey(userId))
      return raw ? { ...emptyProgress(), ...JSON.parse(raw) } : null
    } catch {
      return null
    }
  }

  function persist() {
    if (!auth.user) return
    try {
      localStorage.setItem(gameStorageKey(auth.user.id), JSON.stringify(progress.value))
    } catch {
      /* พื้นที่เต็ม — รอบหน้าค่อยบันทึก */
    }
  }

  /* ---------- ข้อมูลรวม ---------- */

  const data = computed<GameData>(() => ({
    today: today.value,
    workspaces: workspaces.value,
    entries: entries.value,
    goals: goals.value,
    filings: filings.value,
    challenges: challenges.value,
    quizBest: progress.value.quizBest,
    styled: theme.siteStyle.value !== 'normal' || theme.look.value !== null,
    deductionMaxed:
      filing.result.grossIncome > 0 &&
      suggestDeductions(filing.income, filing.deductions, filing.withholdingTax, 5, filing.taxOptions).reason ===
        'maxed',
  }))

  const streak = computed(() => computeStreak(entries.value, today.value))
  const unlockedIds = computed(() => Object.keys(progress.value.unlocked))
  const levelInfo = computed(() => levelOf(computeXp(unlockedIds.value, streak.value, entries.value.length)))
  const accessories = computed(() => unlockedAccessories(levelInfo.value.level, progress.value.collected))
  /** ของที่ใส่อยู่ — ถ้าเลเวลลดจนไม่มีสิทธิ์ใส่แล้วให้ถอดออก */
  const equipped = computed<Accessory>(() =>
    accessories.value.includes(progress.value.equipped) ? progress.value.equipped : 'none',
  )
  const mood = computed(() => computeMood(data.value, streak.value))

  const achievements = computed(() =>
    ACHIEVEMENTS.map((a) => ({
      ...a,
      unlockedAt: progress.value.unlocked[a.id] ?? null,
    })),
  )

  /**
   * นับถอยหลังซื้อลดหย่อนก่อน 31 ธันวาคม — แสดงเฉพาะ 90 วันสุดท้ายของปี
   * ใช้ตัวเลขจากแบบร่างที่กรอกไว้เป็นประมาณการเงินได้ของปีนี้ และคิดสิทธิตามปีภาษีปัจจุบัน
   */
  const yearEndAdvice = computed(() => {
    const now = new Date(`${today.value}T00:00:00`)
    const daysLeft = daysUntilYearEnd(now)
    if (daysLeft > YEAR_END_WINDOW_DAYS || filing.result.grossIncome <= 0) return null
    const taxYear = String(now.getFullYear() + 543)
    const advice = suggestDeductions(filing.income, filing.deductions, filing.withholdingTax, 3, {
      ...filing.taxOptions,
      taxYear,
    })
    if (!advice.suggestions.length) return null
    return {
      daysLeft,
      taxYear,
      amount: advice.amountIfAll,
      saving: roundMoney(advice.currentTax - advice.taxIfAll),
      suggestions: advice.suggestions,
    }
  })

  /* ---------- ภาษีสด สรุปสัปดาห์ และฤดูยื่นภาษี ---------- */

  const modesById = computed(() => Object.fromEntries(workspaces.value.map((w) => [w.id, w.mode])))

  /** ภาษีของปีนี้จากรายรับในสมุด ใช้ค่าลดหย่อนในแบบร่างเป็นประมาณการ */
  const live = computed(() =>
    loaded.value
      ? liveTax(workspaces.value, entries.value, today.value, filing.deductions, {
          seniorExemption: filing.taxOptions.seniorExemption,
        })
      : null,
  )

  const weekly = computed(() => (loaded.value ? weeklyRecap(entries.value, modesById.value, today.value) : null))

  const season = computed(() => taxSeason(today.value))
  const mission = computed(() => {
    if (!season.value) return null
    const draftIncome = filing.taxpayer.taxYear === season.value.taxYear ? filing.result.grossIncome : 0
    return taxSeasonMission(season.value, filings.value, draftIncome)
  })

  /* ---------- แจ้งเตือน ---------- */

  const notifications = computed<AppNotification[]>(() => {
    if (!auth.isLoggedIn || !loaded.value) return []
    const list: AppNotification[] = []

    for (const d of upcomingDeadlines([...new Set(workspaces.value.map((w) => w.mode))])) {
      if (d.daysLeft > 30) continue
      list.push({
        id: `deadline:${d.key}:${d.date}`,
        level: d.daysLeft <= 7 ? 'bad' : 'warn',
        icon: '📅',
        title: d.daysLeft === 0 ? 'ถึงกำหนดวันนี้' : `อีก ${d.daysLeft} วันถึงกำหนด`,
        text: d.title,
        to: d.to ?? '/dashboard',
      })
    }

    // ภาษีที่ต้องชำระเพิ่มและยังไม่ได้จ่าย ทั้งแบบครั้งเดียวและผ่อน 3 งวด
    for (const f of filings.value) {
      if (f.balance <= 0) continue
      const rows = paymentSchedule(f.balance, f.taxYear, f.payment ?? DEFAULT_PAYMENT_PLAN, today.value)
      for (const row of rows) {
        if (row.status === 'paid' || row.daysLeft > 30) continue
        const label = rows.length > 1 ? `งวดที่ ${row.index} ` : ''
        list.push({
          id: `payment:${f.reference}:${row.index}:${row.status}`,
          level: row.status === 'overdue' || row.daysLeft <= 7 ? 'bad' : 'warn',
          icon: '💳',
          title:
            row.status === 'overdue'
              ? `ภาษี${label}เลยกำหนด ${-row.daysLeft} วัน`
              : `ชำระภาษี${label}อีก ${row.daysLeft} วัน`,
          text:
            `ปี ${f.taxYear} ยอด ${formatBaht(row.amount)}` +
            (row.surcharge > 0 ? ` + เงินเพิ่ม ${formatBaht(row.surcharge)}` : ''),
          to: `/status/${f.reference}`,
        })
      }
    }

    // ฤดูยื่นภาษี: เตือนขั้นถัดไปของภารกิจ
    const nextStep = mission.value?.find((s) => !s.done)
    if (season.value && nextStep) {
      list.push({
        id: `season:${season.value.taxYear}:${nextStep.key}`,
        level: season.value.daysLeft <= 14 ? 'warn' : 'info',
        icon: '🧾',
        title: `ภารกิจยื่นภาษีปี ${season.value.taxYear} · เหลือ ${season.value.daysLeft} วัน`,
        text: `ขั้นถัดไป: ${nextStep.title}`,
        to: nextStep.to,
      })
    }

    // สรุปสัปดาห์ที่แล้ว ขึ้นใหม่ทุกวันจันทร์
    if (weekly.value) {
      const w = weekly.value
      list.push({
        id: `weekly:${w.from}`,
        level: 'info',
        icon: '🗓️',
        title: 'สรุปสัปดาห์ที่แล้วมาแล้ว',
        text:
          `ใช้ไป ${formatBaht(w.expense)}` +
          (w.expenseChange !== null ? ` (${w.expenseChange >= 0 ? '+' : ''}${Math.round(w.expenseChange * 100)}% จากสัปดาห์ก่อน)` : ''),
        to: '/dashboard',
      })
    }

    // ช่วงท้ายปียังซื้อกองทุนหรือประกันลดหย่อนทัน
    const yearEnd = yearEndAdvice.value
    if (yearEnd) {
      list.push({
        id: `year-end:${today.value.slice(0, 4)}:${yearEnd.daysLeft <= 14 ? 'last' : 'soon'}`,
        level: yearEnd.daysLeft <= 14 ? 'warn' : 'info',
        icon: '⏳',
        title: `อีก ${yearEnd.daysLeft} วันหมดเขตซื้อลดหย่อน`,
        text: `ซื้อเพิ่ม ${formatBaht(yearEnd.amount)} ประหยัดภาษีได้ราว ${formatBaht(yearEnd.saving)}`,
        to: '/deductions',
      })
    }

    for (const ws of workspaces.value) {
      if (!ws.budgets || !Object.keys(ws.budgets).length) continue
      const own = entries.value.filter((e) => e.workspaceId === ws.id)
      const month = monthsWithEntries(own)[0]
      if (!month) continue
      for (const b of evaluateBudgets(own, ws.mode, ws.budgets, month)) {
        if (b.status === 'ok') continue
        list.push({
          id: `budget:${ws.id}:${month}:${b.categoryKey}:${b.status}`,
          level: b.status === 'over' ? 'bad' : 'warn',
          icon: b.status === 'over' ? '🚨' : '⚠️',
          title: b.status === 'over' ? `หมวด${b.label}เกินงบ` : `หมวด${b.label}ใกล้เต็มงบ`,
          text:
            b.status === 'over'
              ? `${ws.name}: เกินไปแล้ว ${formatBaht(-b.remaining)}`
              : `${ws.name}: เหลืออีก ${formatBaht(b.remaining)}`,
          to: `/workspace/${ws.id}/goals`,
        })
      }
    }

    for (const g of goalStatuses(data.value)) {
      if (!g.achieved) continue
      list.push({
        id: `goal:${g.goal.id}`,
        level: 'ok',
        icon: '🎯',
        title: 'ถึงเป้าหมายแล้ว',
        text: g.goal.name,
        to: `/workspace/${(g.goal as GoalRecord).workspaceId}/goals`,
      })
    }

    for (const a of achievements.value) {
      if (!a.unlockedAt || daysBetween(a.unlockedAt, today.value) > 14) continue
      list.push({
        id: `badge:${a.id}`,
        level: 'ok',
        icon: a.icon,
        title: `ได้เหรียญ "${a.title}"`,
        text: a.description,
        to: '/achievements',
      })
    }

    // กองทุนลดหย่อนที่ใกล้ครบหรือเพิ่งครบระยะถือ — ขายได้โดยไม่ต้องคืนภาษี
    for (const s of lotStatuses(funds.value.lots, today.value, funds.value.birthDate || null)) {
      if (!s.sellableOn || s.daysLeft === null) continue
      const sinceSellable = daysBetween(s.sellableOn, today.value)
      if (s.daysLeft > 30 || sinceSellable > 14) continue
      list.push({
        id: `fund:${s.lot.id}:${s.sellable ? 'open' : 'soon'}`,
        level: 'info',
        icon: '📈',
        title: s.sellable ? `${FUND_KINDS[s.lot.kind].label} ครบระยะถือแล้ว` : `${FUND_KINDS[s.lot.kind].label} ครบระยะถือในอีก ${s.daysLeft} วัน`,
        text: `${s.lot.name} ที่ซื้อเมื่อ ${s.lot.buyDate} ขายได้โดยไม่ต้องคืนภาษี`,
        to: '/funds',
      })
    }

    // ข้อมูลอยู่ในเบราว์เซอร์เครื่องเดียว ไม่ได้สำรองนาน ๆ เสี่ยงหายทั้งหมด
    void backupStamp.value
    const user = auth.user
    const lastBackup = user ? readLastBackup(user.id) : null
    const hasData = entries.value.length > 0 || filings.value.length > 0
    const overdue = user ? backupOverdueDays(lastBackup, user.createdAt, today.value, hasData) : null
    if (overdue !== null) {
      list.push({
        id: `backup:${today.value.slice(0, 7)}`,
        level: 'warn',
        icon: '💾',
        title: lastBackup ? `ไม่ได้สำรองข้อมูลมา ${overdue} วัน` : 'ยังไม่เคยสำรองข้อมูล',
        text: 'ข้อมูลอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ล้างเบราว์เซอร์หรือเปลี่ยนเครื่องแล้วจะหาย',
        to: '/profile',
      })
    }

    if (streak.value.lastDate && daysBetween(streak.value.lastDate, today.value) >= 3) {
      list.push({
        id: `remind:${streak.value.lastDate}`,
        level: 'info',
        icon: '✏️',
        title: 'ไม่ได้จดรายการมาหลายวัน',
        text: 'บันทึกรายรับรายจ่ายต่อกันเถอะ ใช้ปุ่ม + มุมขวาล่างได้เลย',
        to: workspaces.value[0] ? `/workspace/${workspaces.value[0].id}/entries` : '/workspaces',
      })
    }
    return list
  })

  const seenSet = computed(() => new Set(progress.value.seen))
  const unreadCount = computed(() => notifications.value.filter((n) => !seenSet.value.has(n.id)).length)

  function isSeen(id: string): boolean {
    return seenSet.value.has(id)
  }

  function markAllSeen() {
    // เก็บเฉพาะที่ยังแสดงอยู่ รายการเก่าที่หายไปแล้วไม่ต้องจำ กันข้อมูลโตไม่หยุด
    progress.value.seen = notifications.value.map((n) => n.id)
    persist()
  }

  /* ---------- โหลดและตรวจเหรียญใหม่ ---------- */

  let refreshing: Promise<void> | null = null

  async function refresh(): Promise<void> {
    if (!auth.isLoggedIn || !auth.user) return reset()
    if (refreshing) return refreshing
    const userId = auth.user.id
    refreshing = (async () => {
      try {
        const [ws, es, gs, fs, cs] = await Promise.all([
          api.workspaces(),
          api.allEntries(),
          api.allGoals(),
          api.filings(),
          api.challenges(),
        ])
        if (auth.user?.id !== userId) return
        workspaces.value = ws
        entries.value = es
        goals.value = gs
        filings.value = fs
        challenges.value = cs
        funds.value = loadFunds(userId)
        today.value = localToday()
        loaded.value = true
        detectUnlocks(userId)
        if (es.length || fs.length) {
          void requestPersistentStorage()
          // โหลดเฉพาะเมื่อมีข้อมูลแล้ว และแยก chunk เพื่อไม่ให้ไฟล์สำรองวนกลับมา import store นี้ตอนเริ่มเว็บ
          void import('@/services/autoBackup').then((m) => m.runAutoBackup(userId))
        }
      } catch {
        /* ออกจากระบบระหว่างโหลด หรือโหลดไม่สำเร็จ — รอบหน้าค่อยลองใหม่ */
      } finally {
        refreshing = null
      }
    })()
    return refreshing
  }

  function detectUnlocks(userId: string) {
    const saved = load(userId)
    // เปิดครั้งแรกในเครื่องนี้: ปลดล็อกของที่ทำได้อยู่แล้วแบบเงียบ ๆ ไม่ฉลองย้อนหลังทีละเหรียญ
    const firstRun = saved === null
    progress.value = saved ?? emptyProgress()

    const earned = earnedAchievements(data.value, streak.value)
    const fresh = earned.filter((id) => !progress.value.unlocked[id])
    for (const id of fresh) progress.value.unlocked[id] = today.value

    const achievedGoals = goalStatuses(data.value).filter((g) => g.achieved)
    const newGoals = achievedGoals.filter((g) => !progress.value.celebratedGoals.includes(g.goal.id))
    progress.value.celebratedGoals = achievedGoals.map((g) => g.goal.id)

    // ของพิเศษ: ของเทศกาลที่แจกอยู่วันนี้ และเหรียญนักยื่นไวเมื่อได้เหรียญรางวัลนั้นแล้ว
    const special: Accessory[] = activeSeasonalAccessories(today.value).map((s) => s.key)
    if (progress.value.unlocked['early-filer']) special.push('medal')
    const newItems = special.filter((key) => !progress.value.collected.includes(key))
    progress.value.collected = [...progress.value.collected, ...newItems]
    // ของเทศกาลฉลองแม้เปิดเครื่องนี้ครั้งแรก เพราะเป็นของที่ได้ "วันนี้" จริง ๆ
    for (const key of newItems) {
      const item = ACCESSORIES.find((a) => a.key === key)!
      celebrate.show({ icon: '🎁', title: `ได้ของแต่งตัว "${item.label}"`, text: 'ไปใส่ให้ตัวการ์ตูนได้ที่หน้าเหรียญรางวัล' })
    }

    if (!firstRun) {
      for (const g of newGoals) celebrate.show({ icon: '🎯', title: 'ถึงเป้าหมายแล้ว!', text: g.goal.name })
      for (const id of fresh) {
        const a = ACHIEVEMENTS.find((x) => x.id === id)!
        celebrate.show({ icon: a.icon, title: `ได้เหรียญ "${a.title}"`, text: a.description })
      }
    }
    persist()
  }

  function reset() {
    workspaces.value = []
    entries.value = []
    goals.value = []
    filings.value = []
    challenges.value = []
    funds.value = { lots: [], birthDate: '' }
    loaded.value = false
    progress.value = emptyProgress()
  }

  /* ---------- การกระทำของผู้ใช้ ---------- */

  function equip(accessory: Accessory) {
    if (!accessories.value.includes(accessory)) return
    progress.value.equipped = accessory
    persist()
  }

  function recordQuiz(score: number) {
    if (score > progress.value.quizBest) {
      progress.value.quizBest = score
      persist()
      scheduleRefresh()
    }
  }

  /* ---------- รีเฟรชอัตโนมัติเมื่อข้อมูลเปลี่ยน ---------- */

  let timer: ReturnType<typeof setTimeout> | undefined
  function scheduleRefresh(delay = 700) {
    clearTimeout(timer)
    timer = setTimeout(() => void refresh(), delay)
  }

  watch(
    () => auth.user?.id,
    (id) => {
      reset()
      if (id) scheduleRefresh(0)
    },
    { immediate: true },
  )
  watch(
    () => [
      ledger.entries.length,
      ledger.entries.map((e) => `${e.id}:${e.amount}:${e.date}:${e.categoryKey}`).join('|'),
      ledger.goals.length,
      JSON.stringify(ledger.active?.budgets ?? {}),
      ledger.workspaces.length,
      filing.submitted?.id,
      theme.siteStyle.value,
      theme.look.value,
    ],
    () => {
      if (auth.isLoggedIn) scheduleRefresh()
    },
  )

  return {
    loaded,
    workspaces,
    entries,
    filings,
    challenges,
    streak,
    levelInfo,
    accessories,
    accessoryList: ACCESSORIES,
    equipped,
    mood,
    achievements,
    notifications,
    yearEndAdvice,
    live,
    weekly,
    season,
    mission,
    unreadCount,
    isSeen,
    markAllSeen,
    refresh,
    scheduleRefresh,
    equip,
    recordQuiz,
    quizBest: computed(() => progress.value.quizBest),
  }
})
