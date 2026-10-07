import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  api,
  type EntryRecord,
  type EvidenceRecord,
  type GoalRecord,
  type RecurringRecord,
  type Workspace,
  type WorkspacePatch,
} from '@/services/api'
import {
  analyseExpenseRisk,
  analyseRunway,
  evaluateBudgets,
  evaluateGoal,
  monthsWithEntries,
  evidenceCountByEntry,
  groupEvidence,
  monthlyAverages,
  monthlyBreakdown,
  summarise,
  tradingStats,
  type Evidence,
  type Goal,
  type LedgerEntry,
  type RecurringTemplate,
} from '@/services/ledgerEngine'
import { modeDefinition } from '@/data/workspaceModes'
import { roundMoney } from '@/services/taxEngine'

/** วันนี้ตามเวลาเครื่อง YYYY-MM-DD (toISOString เป็นเวลา UTC ทำให้ช่วงเช้ามืดได้วันที่เมื่อวาน) */
export function localToday(date: Date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

/** สถานะของสมุดบัญชีที่กำลังเปิดอยู่ พร้อมผลวิเคราะห์ที่คำนวณสดจากรายการ */
export const useLedgerStore = defineStore('ledger', () => {
  const workspaces = ref<Workspace[]>([])
  const active = ref<Workspace | null>(null)
  const entries = ref<EntryRecord[]>([])
  const goals = ref<GoalRecord[]>([])
  const evidence = ref<EvidenceRecord[]>([])
  const recurring = ref<RecurringRecord[]>([])
  /** จำนวนรายการประจำที่เพิ่งสร้างให้ตอนเปิดสมุด — ใช้แจ้งผู้ใช้ */
  const generatedCount = ref(0)
  const loading = ref(false)

  const mode = computed(() => active.value?.mode ?? 'personal')
  const definition = computed(() => modeDefinition(mode.value))
  const capital = computed(() => active.value?.capital ?? 0)

  const summary = computed(() => summarise(entries.value, mode.value))
  const averages = computed(() => monthlyAverages(entries.value, mode.value))
  const months = computed(() => monthlyBreakdown(entries.value))

  const risk = computed(() =>
    analyseExpenseRisk(averages.value.income, averages.value.expense, mode.value),
  )

  /** เงินทุนที่เหลือจริง คือทุนตั้งต้นบวกยอดคงเหลือสะสม */
  const currentCapital = computed(() => roundMoney(capital.value + summary.value.net))

  const runway = computed(() =>
    analyseRunway(currentCapital.value, averages.value.expense, averages.value.income, mode.value),
  )

  const trading = computed(() => tradingStats(entries.value))

  /* ---------- งบประมาณรายหมวด ---------- */

  const budgets = computed(() => active.value?.budgets ?? {})
  /** เดือนที่ผู้ใช้เลือกดู — ว่างคือให้ระบบเลือกเอง */
  const pickedBudgetMonth = ref('')
  /** เดือนให้เลือก: เดือนปัจจุบันเสมอ ตามด้วยเดือนที่มีรายการ */
  const budgetMonths = computed(() => {
    const current = new Date().toISOString().slice(0, 7)
    return [...new Set([current, ...monthsWithEntries(entries.value)])].sort().reverse()
  })
  /** ค่าเริ่มต้นคือเดือนปัจจุบันถ้ามีรายการ ไม่งั้นเดือนล่าสุดที่มีรายการ ผู้ใช้จะได้เห็นตัวเลขทันที */
  const budgetMonth = computed({
    get: () => {
      if (pickedBudgetMonth.value) return pickedBudgetMonth.value
      const withData = monthsWithEntries(entries.value)
      const current = new Date().toISOString().slice(0, 7)
      return withData.includes(current) ? current : (withData[0] ?? current)
    },
    set: (value: string) => (pickedBudgetMonth.value = value),
  })
  const budgetProgress = computed(() =>
    evaluateBudgets(entries.value, mode.value, budgets.value, budgetMonth.value),
  )

  async function saveBudgets(next: Record<string, number>): Promise<void> {
    await updateActive({ budgets: next })
  }

  /** หลักฐานจัดกลุ่มตามวันที่ แล้วแยกรับเงิน/จ่ายเงิน และชนิดหลักฐาน */
  const evidenceByDate = computed(() => groupEvidence(evidence.value))
  const evidenceCounts = computed(() => evidenceCountByEntry(evidence.value))

  const goalProgress = computed(() =>
    goals.value.map((goal) => evaluateGoal(goal, summary.value, averages.value, capital.value)),
  )

  async function loadWorkspaces(): Promise<void> {
    workspaces.value = await api.workspaces()
  }

  async function open(id: string): Promise<void> {
    loading.value = true
    // เปลี่ยนเล่มแล้วให้ระบบเลือกเดือนของงบประมาณใหม่ เดือนที่เลือกไว้ในเล่มเดิมอาจไม่มีข้อมูล
    pickedBudgetMonth.value = ''
    try {
      active.value = await api.workspace(id)
      // สร้างรายการประจำที่ถึงกำหนดก่อนโหลดรายการ จะได้เห็นครบทันที
      generatedCount.value = await api.syncRecurring(id, localToday())
      const [loadedEntries, loadedGoals, loadedEvidence, loadedRecurring] = await Promise.all([
        api.entries(id),
        api.goals(id),
        api.evidence(id),
        api.recurring(id),
      ])
      entries.value = loadedEntries
      goals.value = loadedGoals
      evidence.value = loadedEvidence
      recurring.value = loadedRecurring
    } finally {
      loading.value = false
    }
  }

  async function createWorkspace(input: Parameters<typeof api.createWorkspace>[0]) {
    const created = await api.createWorkspace(input)
    workspaces.value.push(created)
    return created
  }

  async function updateActive(patch: WorkspacePatch): Promise<void> {
    if (!active.value) return
    const updated = await api.updateWorkspace(active.value.id, patch)
    active.value = updated
    const index = workspaces.value.findIndex((w) => w.id === updated.id)
    if (index !== -1) workspaces.value[index] = updated
  }

  async function removeWorkspace(id: string): Promise<void> {
    await api.deleteWorkspace(id)
    workspaces.value = workspaces.value.filter((w) => w.id !== id)
    if (active.value?.id === id) {
      active.value = null
      entries.value = []
      goals.value = []
      evidence.value = []
    }
  }

  const sortEntries = (list: EntryRecord[]) =>
    list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

  async function addEntry(input: Omit<LedgerEntry, 'id'>): Promise<EntryRecord | null> {
    if (!active.value) return null
    const created = await api.addEntry(active.value.id, input)
    // แทรกไว้ให้ยังเรียงจากใหม่ไปเก่าเหมือนที่ API คืนมา
    entries.value = sortEntries([created, ...entries.value])
    return created
  }

  async function addEntries(inputs: Omit<LedgerEntry, 'id'>[]): Promise<number> {
    if (!active.value || !inputs.length) return 0
    const created = await api.addEntries(active.value.id, inputs)
    entries.value = sortEntries([...created, ...entries.value])
    return created.length
  }

  /** รายการที่ถูกเพิ่มจากที่อื่น (เช่นปุ่มบันทึกด่วน) ขณะเปิดสมุดเล่มนี้อยู่ */
  function receiveEntry(created: EntryRecord): void {
    if (active.value?.id !== created.workspaceId) return
    if (entries.value.some((e) => e.id === created.id)) return
    entries.value = sortEntries([created, ...entries.value])
  }

  async function updateEntry(id: string, patch: Omit<LedgerEntry, 'id'>): Promise<void> {
    const updated = await api.updateEntry(id, patch)
    entries.value = sortEntries(entries.value.map((e) => (e.id === id ? updated : e)))
  }

  /* ---------- รายการประจำ ---------- */

  async function addRecurring(input: Omit<RecurringTemplate, 'id'>): Promise<void> {
    if (!active.value) return
    recurring.value = [...recurring.value, await api.addRecurring(active.value.id, input)]
  }

  async function removeRecurring(id: string): Promise<void> {
    await api.deleteRecurring(id)
    recurring.value = recurring.value.filter((r) => r.id !== id)
  }

  async function removeEntry(id: string): Promise<void> {
    await api.deleteEntry(id)
    entries.value = entries.value.filter((e) => e.id !== id)
    // หลักฐานที่ผูกกับรายการถูกลบไปพร้อมกันฝั่ง API แล้ว ตัดออกจากหน้าจอด้วย
    evidence.value = evidence.value.filter((e) => e.entryId !== id)
  }

  /**
   * ลบแบบเลิกทำได้: ซ่อนจากหน้าจอทันที แล้วลบจริงเมื่อพ้นเวลาเลิกทำ
   * ไม่ลบทันทีแล้วค่อยสร้างใหม่ตอนเลิกทำ เพราะหลักฐานที่แนบไว้จะหายไปกับการลบจริง
   * คืนฟังก์ชันเลิกทำ — ถ้าปิดหน้าเว็บระหว่างรอ ระบบลบจริงให้ก่อนปิด
   */
  function removeEntryLater(id: string, delayMs: number): () => void {
    const entry = entries.value.find((e) => e.id === id)
    if (!entry) return () => {}
    const workspaceId = entry.workspaceId
    const attached = evidence.value.filter((e) => e.entryId === id)
    entries.value = entries.value.filter((e) => e.id !== id)
    evidence.value = evidence.value.filter((e) => e.entryId !== id)

    let done = false
    const commit = () => {
      if (done) return
      done = true
      pendingDeletes.delete(commit)
      void api.deleteEntry(id).catch(() => {
        /* ถูกลบไปแล้วจากที่อื่น ไม่ต้องทำอะไร */
      })
    }
    const timer = setTimeout(commit, delayMs)
    pendingDeletes.add(commit)

    return () => {
      if (done) return
      done = true
      clearTimeout(timer)
      pendingDeletes.delete(commit)
      // เปลี่ยนไปเปิดสมุดเล่มอื่นแล้ว ไม่ต้องใส่กลับในรายการของเล่มที่เปิดอยู่
      if (active.value?.id !== workspaceId) return
      entries.value = sortEntries([entry, ...entries.value])
      evidence.value = [...evidence.value, ...attached]
    }
  }

  /** ลบที่ค้างรอเวลาเลิกทำ — ทำให้เสร็จก่อนปิดหน้า */
  const pendingDeletes = new Set<() => void>()
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => [...pendingDeletes].forEach((commit) => commit()))
  }

  /** แนบหลักฐาน คืน record ที่บันทึกแล้วเพื่อให้หน้าจอแสดงได้ทันที */
  async function addEvidence(
    input: Omit<Evidence, 'id' | 'uploadedAt'>,
    blob: Blob,
  ): Promise<EvidenceRecord | null> {
    if (!active.value) return null
    const created = await api.addEvidence(active.value.id, input, blob)
    evidence.value = [created, ...evidence.value]
    return created
  }

  async function removeEvidence(id: string): Promise<void> {
    await api.deleteEvidence(id)
    evidence.value = evidence.value.filter((e) => e.id !== id)
  }

  async function addGoal(input: Omit<Goal, 'id'>): Promise<void> {
    if (!active.value) return
    goals.value.push(await api.addGoal(active.value.id, input))
  }

  async function removeGoal(id: string): Promise<void> {
    await api.deleteGoal(id)
    goals.value = goals.value.filter((g) => g.id !== id)
  }

  return {
    workspaces,
    active,
    entries,
    goals,
    evidence,
    evidenceByDate,
    evidenceCounts,
    loading,
    mode,
    definition,
    capital,
    currentCapital,
    summary,
    averages,
    months,
    risk,
    runway,
    trading,
    goalProgress,
    budgets,
    budgetMonth,
    budgetMonths,
    budgetProgress,
    saveBudgets,
    loadWorkspaces,
    open,
    createWorkspace,
    updateActive,
    removeWorkspace,
    addEntry,
    addEntries,
    receiveEntry,
    updateEntry,
    recurring,
    generatedCount,
    addRecurring,
    removeRecurring,
    removeEntry,
    removeEntryLater,
    addGoal,
    removeGoal,
    addEvidence,
    removeEvidence,
  }
})
