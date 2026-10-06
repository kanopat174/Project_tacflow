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
import { suggestDeductions } from '@/services/deductionAdvisor'
import { upcomingDeadlines } from '@/services/taxCalendar'
import { formatBaht } from '@/services/taxEngine'
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
}

const emptyProgress = (): SavedProgress => ({
  unlocked: {},
  equipped: 'none',
  quizBest: 0,
  seen: [],
  celebratedGoals: [],
})

const storageKey = (userId: string) => `taxflow_game_${userId}`

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
  const loaded = ref(false)
  const progress = ref<SavedProgress>(emptyProgress())
  const today = ref(localToday())

  /* ---------- เก็บความคืบหน้า ---------- */

  function load(userId: string): SavedProgress | null {
    try {
      const raw = localStorage.getItem(storageKey(userId))
      return raw ? { ...emptyProgress(), ...JSON.parse(raw) } : null
    } catch {
      return null
    }
  }

  function persist() {
    if (!auth.user) return
    try {
      localStorage.setItem(storageKey(auth.user.id), JSON.stringify(progress.value))
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
  const accessories = computed(() => unlockedAccessories(levelInfo.value.level))
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
        today.value = localToday()
        loaded.value = true
        detectUnlocks(userId)
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
