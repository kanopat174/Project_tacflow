<script setup lang="ts">
/**
 * สแกนสลิปหลายใบพร้อมกัน — เลือกจากแกลเลอรีหรือแชร์มาจากแอปธนาคาร
 * อ่านทีละใบ (OCR ใช้เครื่องเดียว อ่านพร้อมกันจะช้าลง) แล้วแสดงเป็นตารางให้ตรวจ
 * ใบที่ต้องตรวจ น่าจะซ้ำ หรือไม่รู้ว่าเงินเข้า/ออก จะไม่ถูกเลือกไว้ ผู้ใช้ติ๊กเองหลังตรวจ (นับเป็นการยืนยัน)
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { categoriesOf, type EntryType } from '@/data/workspaceModes'
import { api } from '@/services/api'
import { loadMemory, recallEntry, rememberMany } from '@/services/entryMemory'
import { guessCategory } from '@/services/ledgerCsv'
import type { LoanTag, SlipMeta } from '@/services/ledgerEngine'
import { LOAN_ROLE_LABELS, loanBalances, suggestLoanRole } from '@/services/loans'
import { learnSelfFromSlip, loadSelf } from '@/services/selfIdentity'
import { bangkokToday, fileDateOf, findSlipDuplicates, parseSlip, slipNote, type SlipFieldKey } from '@/services/slipParse'
import { formatBaht } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { localToday, useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'

type RowStatus = 'waiting' | 'reading' | 'ready' | 'failed' | 'saved'

interface Row {
  id: number
  file: File
  preview: string
  status: RowStatus
  include: boolean
  date: string
  type: EntryType | ''
  amount: number
  categoryKey: string
  note: string
  meta: SlipMeta | null
  /** ปัญหาที่ต้องแก้ก่อน — มีแล้วไม่เลือกใบนี้ไว้ให้ */
  warnings: string[]
  /** ข้อสังเกตที่ควรดู แต่ไม่ต้องแก้ */
  notes: string[]
  /** ทิศทางเงินมาจากการเดา */
  guessed: boolean
  /** เลขบัญชีที่มองเห็นบนสลิป ใช้จำบัญชีของผู้ใช้ */
  accounts: { sender: string | null; recipient: string | null }
  /** คู่โอนค้างเงินกันอยู่ — บันทึกเป็นเงินคืนให้ */
  loan: LoanTag | null
}

const FIELD_LABELS: Record<SlipFieldKey, string> = {
  amount: 'ยอดเงิน',
  date: 'วันที่',
  time: 'เวลา',
  sender: 'ผู้โอน',
  recipient: 'ผู้รับ',
  reference: 'เลขอ้างอิง',
}

const auth = useAuthStore()
const ledger = useLedgerStore()
const game = useGameStore()
const toast = useToastStore()
const ui = useUiStore()

const rows = ref<Row[]>([])
const workspaceId = ref('')
const saving = ref(false)
let cancelled = false

const workspace = computed(() => ledger.workspaces.find((w) => w.id === workspaceId.value) ?? null)
/** ยอดเงินยืมค้างของแต่ละคน ใช้จับสลิปรับเงินคืน */
const loanBook = computed(() => loanBalances(game.entries))
const readCount = computed(() => rows.value.filter((r) => r.status !== 'waiting' && r.status !== 'reading').length)
const selected = computed(() => rows.value.filter((r) => r.include && (r.status === 'ready' || r.status === 'failed')))
const busy = computed(() => rows.value.some((r) => r.status === 'reading' || r.status === 'waiting'))

const categories = (type: EntryType | '') => (workspace.value && type ? categoriesOf(workspace.value.mode, type) : [])

watch(
  () => ui.bulkSlipFiles,
  async (files) => {
    if (!files?.length) return
    cancelled = false
    if (!ledger.workspaces.length) await ledger.loadWorkspaces().catch(() => undefined)
    workspaceId.value =
      [ledger.active?.id, ledger.workspaces[0]?.id].find((id) => id && ledger.workspaces.some((w) => w.id === id)) ?? ''
    rows.value = files.map((file, i) => ({
      id: i,
      file,
      preview: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '',
      status: 'waiting',
      include: false,
      date: '',
      type: '',
      amount: 0,
      categoryKey: '',
      note: '',
      meta: null,
      warnings: [],
      notes: [],
      guessed: false,
      accounts: { sender: null, recipient: null },
      loan: null,
    }))
    await readAll()
  },
  { immediate: true },
)

/** ใบที่อ่านไม่ได้ยังกรอกเองได้ รูปยังแนบเป็นหลักฐาน */
function markFailed(row: Row) {
  row.status = 'failed'
  row.include = false
  row.date = fileDateOf(row.file) ?? ''
  row.type = 'expense'
  row.warnings = ['อ่านรูปไม่สำเร็จ — กรอกยอดเองได้ (ครั้งแรกต้องต่ออินเทอร์เน็ตเพื่อโหลดตัวอ่านภาษาไทย)']
  applyCategory(row)
}

async function readAll() {
  // ตัวอ่านตัวเดียวทั้งชุด โหลดข้อมูลภาษาครั้งเดียว
  const pending = rows.value.filter((r) => r.status === 'waiting')
  if (!pending.length) return
  pending[0]!.status = 'reading'
  try {
    const { readSlipBatch } = await import('@/services/slipReader')
    await readSlipBatch(
      pending.map((r) => r.file),
      (i, ocr) => {
        const row = pending[i]!
        if (ocr) {
          fill(row, ocr.lines, ocr.imageHash, ocr.qr ?? null)
          row.status = 'ready'
        } else markFailed(row)
        if (pending[i + 1]) pending[i + 1]!.status = 'reading'
      },
      () => cancelled,
    )
  } catch {
    // โหลดตัวอ่านไม่ได้ (ออฟไลน์) — ทุกใบที่ยังไม่ได้อ่านให้กรอกเอง
    for (const row of pending) if (row.status === 'waiting' || row.status === 'reading') markFailed(row)
  }
}

async function retry(row: Row) {
  row.status = 'waiting'
  row.warnings = []
  await readAll()
}

function fill(row: Row, lines: Parameters<typeof parseSlip>[0], imageHash: string | null, qr: string | null) {
  const self = auth.user ? loadSelf(auth.user.id) : { names: [], accounts: [] }
  const result = parseSlip(lines, [auth.user?.fullName ?? '', ...self.names], bangkokToday(), {
    qr,
    fileDate: fileDateOf(row.file),
    ownAccounts: self.accounts,
  })
  row.accounts = { sender: result.senderAccount, recipient: result.recipientAccount }
  row.guessed = result.directionGuessed
  const meta: SlipMeta = {
    time: result.time.value,
    sender: result.sender.value,
    recipient: result.recipient.value,
    recipientType: result.recipientType,
    recipientBank: result.recipientBank,
    banks: result.banks,
    reference: result.reference.value?.replace(/\s+/g, '') ?? null,
    imageHash,
  }
  row.meta = meta
  row.amount = result.amount.value ?? 0
  row.date = result.date.value ?? ''
  row.type = result.direction ?? ''
  row.warnings = []
  row.notes = []
  if (!result.direction) row.warnings.push(`${result.directionReason} — เลือกประเภทเอง`)
  else if (result.directionGuessed) row.notes.push(`${result.directionReason} (เปลี่ยนได้)`)
  if (!row.amount) row.warnings.push('อ่านยอดไม่ได้ — กรอกเอง')
  if (!row.date) row.warnings.push('อ่านวันที่ไม่ได้ — กรอกเอง')
  const softReview = result.review.filter((k) => !(k === 'amount' && !row.amount))
  if (softReview.length) row.notes.push(`ตรวจ ${softReview.map((k) => FIELD_LABELS[k]).join(', ')} กับรูป`)
  if (result.date.issue && result.date.value) row.notes.push(result.date.issue)

  applyCategory(row)

  const dupInLedger = findSlipDuplicates({ date: row.date, amount: row.amount, meta }, game.entries).length > 0
  const dupInBatch = rows.value.some(
    (other) =>
      other !== row &&
      other.meta &&
      ((meta.reference && other.meta.reference === meta.reference) || (meta.imageHash && other.meta.imageHash === meta.imageHash)),
  )
  if (dupInLedger) row.warnings.push('น่าจะเคยบันทึกสลิปนี้แล้ว')
  if (dupInBatch) row.warnings.push('ซ้ำกับสลิปอีกใบในชุดนี้')
  // เลือกไว้ให้ถ้าข้อมูลครบและไม่ซ้ำ — ข้อสังเกตอื่น (notes) แสดงให้ดูแต่ไม่ต้องติ๊กเอง
  row.include = !row.warnings.length
}

/** หมวดและรายละเอียด: เดาจากคำ แล้วใช้ความจำของคู่โอนเดิมถ้ามี */
function applyCategory(row: Row) {
  if (!row.type || !workspace.value) return
  if (!row.meta) {
    if (!categories(row.type).some((c) => c.key === row.categoryKey)) row.categoryKey = categories(row.type)[0]?.key ?? ''
    return
  }
  const mode = workspace.value.mode
  row.note = slipNote(row.meta, row.type)
  row.categoryKey = guessCategory(row.note, row.type, mode)
  const party = (row.type === 'expense' ? row.meta.recipient : row.meta.sender) ?? ''
  const hit = auth.user ? recallEntry(loadMemory(auth.user.id), { source: party, type: row.type, mode, amount: row.amount }) : null
  if (hit) {
    row.categoryKey = hit.categoryKey
    if (hit.note) row.note = hit.note
  }
  if (!categories(row.type).some((c) => c.key === row.categoryKey)) row.categoryKey = categories(row.type)[0]?.key ?? ''
  row.loan = party ? (suggestLoanRole(loanBook.value, row.type, party)?.tag ?? null) : null
}

function changeType(row: Row, type: EntryType) {
  row.type = type
  row.warnings = row.warnings.filter((w) => !w.endsWith('เลือกประเภทเอง'))
  // ผู้ใช้บอกเองว่าสลิปนี้เข้าหรือออก — จำชื่อและบัญชีฝั่งที่เป็นผู้ใช้
  if (auth.user && row.meta) {
    learnSelfFromSlip(auth.user.id, type, {
      sender: row.meta.sender,
      recipient: row.meta.recipient,
      senderAccount: row.accounts.sender,
      recipientAccount: row.accounts.recipient,
    })
  }
  applyCategory(row)
}

// เปลี่ยนสมุดแล้วหมวดของโหมดเดิมอาจไม่มี จัดหมวดใหม่ทุกแถว
watch(workspaceId, () => rows.value.forEach((r) => r.status === 'ready' && applyCategory(r)))

async function save() {
  if (!workspace.value || !auth.user) return
  const ws = workspace.value
  const invalid = selected.value.find((r) => !r.type || !(r.amount > 0) || !r.date || r.date > bangkokToday())
  if (invalid) {
    toast.error(`สลิปใบที่ ${invalid.id + 1}: เลือกประเภท และกรอกยอดกับวันที่ให้ครบก่อน`)
    return
  }
  saving.value = true
  let count = 0
  try {
    const { compressImage } = await import('@/services/imageCompress')
    for (const row of selected.value) {
      const type = row.type as EntryType
      const created = await api.addEntry(ws.id, {
        date: row.date,
        type,
        categoryKey: row.categoryKey,
        amount: row.amount,
        note: row.note,
        ...(row.meta ? { slip: row.meta } : {}),
        ...(row.loan ? { loan: row.loan } : {}),
      })
      ledger.receiveEntry(created)
      try {
        const { blob } = await compressImage(row.file)
        const evidence = await api.addEvidence(
          ws.id,
          { entryId: created.id, date: row.date, direction: type, kind: 'slip', name: row.file.name, size: blob.size, mimeType: blob.type, note: '' },
          blob,
        )
        if (ledger.active?.id === ws.id) ledger.evidence.push(evidence)
      } catch {
        /* บันทึกรายการแล้ว แนบรูปไม่ได้ไม่ทำให้รายการหาย */
      }
      const party = (type === 'expense' ? row.meta?.recipient : row.meta?.sender) ?? ''
      const base = { type, mode: ws.mode, amount: row.amount, categoryKey: row.categoryKey, note: row.note }
      rememberMany(auth.user.id, [{ ...base, source: row.note }, ...(party ? [{ ...base, source: party }] : [])], localToday())
      row.status = 'saved'
      row.include = false
      count++
    }
    toast.success(`บันทึกจากสลิป ${count} ใบลง "${ws.name}" แล้ว`)
    game.scheduleRefresh()
    if (rows.value.every((r) => r.status === 'saved' || !r.include)) close()
  } catch {
    toast.error(`บันทึกได้ ${count} ใบ แล้วเกิดข้อผิดพลาด — ใบที่เหลือยังอยู่ในรายการ`)
  } finally {
    saving.value = false
  }
}

function close() {
  cancelled = true
  for (const row of rows.value) if (row.preview) URL.revokeObjectURL?.(row.preview)
  rows.value = []
  ui.bulkSlipFiles = null
}

onBeforeUnmount(() => (cancelled = true))

const summary = computed(() => ({
  income: selected.value.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0),
  expense: selected.value.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0),
}))
</script>

<template>
  <div v-if="rows.length" class="modal-backdrop" @click.self="!saving && close()">
    <section class="modal bulk-slips" role="dialog" aria-modal="true" aria-labelledby="bulk-title" data-test="bulk-slips">
      <div class="card-head">
        <div>
          <h3 id="bulk-title">สแกนสลิป {{ rows.length }} ใบ</h3>
          <p>อ่านแล้ว {{ readCount }}/{{ rows.length }} · ใบที่มี ⚠ ตรวจกับรูปแล้วติ๊กเลือกเอง</p>
        </div>
        <button class="guide-icon-btn" type="button" aria-label="ปิด" :disabled="saving" @click="close">
          <AppIcon name="close" :size="18" />
        </button>
      </div>

      <div v-if="ledger.workspaces.length > 1" class="field">
        <label for="bulk-ws">บันทึกลงสมุด</label>
        <select id="bulk-ws" v-model="workspaceId">
          <option v-for="w in ledger.workspaces" :key="w.id" :value="w.id">{{ w.name }}</option>
        </select>
      </div>
      <div v-if="!ledger.workspaces.length" class="notice">
        <strong>ยังไม่มีสมุดบัญชี</strong> สร้างสมุดก่อนแล้วสแกนใหม่
      </div>

      <ul class="bulk-list">
        <li v-for="row in rows" :key="row.id" :class="row.status">
          <a v-if="row.preview" :href="row.preview" target="_blank" rel="noopener" class="bulk-thumb">
            <img :src="row.preview" :alt="`สลิปใบที่ ${row.id + 1}`" />
          </a>
          <div class="bulk-body">
            <div v-if="row.status === 'waiting' || row.status === 'reading'" class="muted small">
              {{ row.status === 'reading' ? 'กำลังอ่าน...' : 'รอคิว' }}
            </div>
            <div v-else-if="row.status === 'saved'" class="text-ok small">✓ บันทึกแล้ว</div>
            <template v-else-if="row.status === 'ready' || row.status === 'failed'">
              <div class="bulk-fields">
                <label class="bulk-check">
                  <input v-model="row.include" type="checkbox" :aria-label="`เลือกสลิปใบที่ ${row.id + 1}`" />
                </label>
                <select
                  :value="row.type"
                  :aria-label="`ประเภทของสลิปใบที่ ${row.id + 1}`"
                  @change="changeType(row, ($event.target as HTMLSelectElement).value as EntryType)"
                >
                  <option value="" disabled>เข้าหรือออก?</option>
                  <option value="expense">รายจ่าย</option>
                  <option value="income">รายรับ</option>
                </select>
                <input v-model.number="row.amount" type="number" min="0" step="0.01" :aria-label="`ยอดของสลิปใบที่ ${row.id + 1}`" />
                <input v-model="row.date" type="date" :max="bangkokToday()" :aria-label="`วันที่ของสลิปใบที่ ${row.id + 1}`" />
                <select v-model="row.categoryKey" :aria-label="`หมวดของสลิปใบที่ ${row.id + 1}`">
                  <option v-for="c in categories(row.type)" :key="c.key" :value="c.key">{{ c.label }}</option>
                </select>
              </div>
              <input v-model="row.note" class="bulk-note" type="text" :aria-label="`รายละเอียดของสลิปใบที่ ${row.id + 1}`" />
            </template>
            <p v-for="w in row.warnings" :key="w" class="small text-warn">⚠ {{ w }}</p>
            <p v-for="n in row.notes" :key="n" class="small muted">ℹ {{ n }}</p>
            <button v-if="row.status === 'failed' && !busy" class="btn btn-ghost btn-sm" type="button" @click="retry(row)">
              ลองอ่านใหม่
            </button>
            <p v-if="row.loan && row.status === 'ready'" class="small muted">
              🤝 บันทึกเป็น "{{ LOAN_ROLE_LABELS[row.loan.role] }}" ของ {{ row.loan.party }}
              <button class="btn btn-ghost btn-sm" type="button" @click="row.loan = null">ไม่ใช่</button>
            </p>
          </div>
        </li>
      </ul>

      <div class="row mt-2" style="justify-content: space-between; gap: 8px">
        <span class="small muted">
          เลือก {{ selected.length }} ใบ · รับ {{ formatBaht(summary.income) }} · จ่าย {{ formatBaht(summary.expense) }}
        </span>
        <button class="btn btn-primary btn-sm" type="button" :disabled="saving || busy || !selected.length || !workspace" @click="save">
          {{ saving ? 'กำลังบันทึก...' : busy ? 'รออ่านให้ครบ...' : `บันทึก ${selected.length} ใบ` }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bulk-slips {
  width: min(760px, 100%);
  max-height: 90vh;
  overflow-y: auto;
}
.bulk-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.bulk-list li {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.bulk-list li.saved {
  opacity: 0.6;
}
.bulk-thumb img {
  width: 56px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
}
.bulk-fields {
  display: grid;
  grid-template-columns: auto 1fr 1fr 1fr 1.3fr;
  gap: 6px;
  align-items: center;
}
.bulk-note {
  width: 100%;
  margin-top: 6px;
}
.bulk-body p {
  margin: 4px 0 0;
}
@media (max-width: 640px) {
  .bulk-fields {
    grid-template-columns: auto 1fr 1fr;
  }
}
</style>
