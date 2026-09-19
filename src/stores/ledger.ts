import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, type EntryRecord, type EvidenceRecord, type GoalRecord, type Workspace } from '@/services/api'
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
} from '@/services/ledgerEngine'
import { modeDefinition } from '@/data/workspaceModes'

/** สถานะของสมุดบัญชีที่กำลังเปิดอยู่ พร้อมผลวิเคราะห์ที่คำนวณสดจากรายการ */
export const useLedgerStore = defineStore('ledger', () => {
  const workspaces = ref<Workspace[]>([])
  const active = ref<Workspace | null>(null)
  const entries = ref<EntryRecord[]>([])
  const goals = ref<GoalRecord[]>([])
  const evidence = ref<EvidenceRecord[]>([])
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
  const currentCapital = computed(() => capital.value + summary.value.net)

  const runway = computed(() =>
    analyseRunway(currentCapital.value, averages.value.expense, averages.value.income, mode.value),
  )

  const trading = computed(() => tradingStats(entries.value))

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
    try {
      active.value = await api.workspace(id)
      const [loadedEntries, loadedGoals, loadedEvidence] = await Promise.all([
        api.entries(id),
        api.goals(id),
        api.evidence(id),
      ])
      entries.value = loadedEntries
      goals.value = loadedGoals
      evidence.value = loadedEvidence
    } finally {
      loading.value = false
    }
  }

  async function createWorkspace(input: Parameters<typeof api.createWorkspace>[0]) {
    const created = await api.createWorkspace(input)
    workspaces.value.push(created)
    return created
  }

  async function updateActive(patch: { name?: string; capital?: number }): Promise<void> {
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

  async function addEntry(input: Omit<LedgerEntry, 'id'>): Promise<void> {
    if (!active.value) return
    const created = await api.addEntry(active.value.id, input)
    // แทรกไว้ให้ยังเรียงจากใหม่ไปเก่าเหมือนที่ API คืนมา
    entries.value = [created, ...entries.value].sort(
      (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
    )
  }

  async function removeEntry(id: string): Promise<void> {
    await api.deleteEntry(id)
    entries.value = entries.value.filter((e) => e.id !== id)
    // หลักฐานที่ผูกกับรายการถูกลบไปพร้อมกันฝั่ง API แล้ว ตัดออกจากหน้าจอด้วย
    evidence.value = evidence.value.filter((e) => e.entryId !== id)
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
    loadWorkspaces,
    open,
    createWorkspace,
    updateActive,
    removeWorkspace,
    addEntry,
    removeEntry,
    addGoal,
    removeGoal,
    addEvidence,
    removeEvidence,
  }
})
