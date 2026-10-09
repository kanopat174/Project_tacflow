<script setup lang="ts">
/**
 * ปุ่ม + บันทึกรายการด่วนจากหน้าไหนก็ได้
 *  - พิมพ์เป็นประโยค เช่น "กาแฟ 65" หรือ "เงินเดือน 30000 เมื่อวาน" ระบบแยกยอด วันที่ และหมวดให้
 *  - รายการที่จดบ่อยขึ้นเป็นปุ่มให้กดเลือก ไม่ต้องพิมพ์ซ้ำ
 *  - จำสมุดเล่มล่าสุด และหมวดล่าสุดของแต่ละเล่ม
 *  - สแกนสลิปโอนเงิน: อ่านยอด วันเวลา คู่โอน ธนาคาร เลขอ้างอิง แล้วเติมฟอร์มให้ตรวจก่อนบันทึก
 *    ถ้าเทียบชื่อแล้วไม่รู้ว่าเงินเข้าหรือออก จะไม่ให้บันทึกจนกว่าผู้ใช้เลือกประเภทเอง
 * ถ้าเปิดสมุดอยู่จะบันทึกลงเล่มนั้นและแสดงในรายการทันที
 */
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import MoneyField from './MoneyField.vue'
import { categoriesOf, categoryLabel, type EntryType } from '@/data/workspaceModes'
import type { EvidenceKind } from '@/data/evidenceTypes'
import { ApiError, api } from '@/services/api'
import { frequentEntries, type FrequentEntry } from '@/services/frequentEntries'
import { loadMemory, recallEntry, rememberMany, type MemoryInput, type Recall } from '@/services/entryMemory'
import { loadFunds, saveFunds, type FundKind } from '@/services/fundHoldings'
import type { DeductionReceipt } from '@/services/receiptParse'
// ตัวอ่าน PDF (pdf.js) โหลดแยกภายใน readEtaxPdf เฉพาะตอนเลือกไฟล์ครั้งแรก
import { buyerMatches, readEtaxPdf, type EtaxInvoice } from '@/services/etaxInvoice'
import {
  LOAN_ROLE_LABELS,
  LOAN_ROLES_FOR,
  loanBalances,
  suggestLoanRole,
  type LoanSuggestion,
} from '@/services/loans'
import type { LoanRole } from '@/services/ledgerEngine'
import { guessCategory } from '@/services/ledgerCsv'
import type { RecipientType, SlipMeta } from '@/services/ledgerEngine'
import { parseEntries } from '@/services/multiEntry'
import { learnSelfFromSlip, loadSelf } from '@/services/selfIdentity'
import {
  bangkokToday,
  fileDateOf,
  findSlipDuplicates,
  isValidReference,
  parseSlip,
  slipNote,
  type SlipExtraction,
  type SlipFieldKey,
} from '@/services/slipParse'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { localToday, useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'
import { useFx } from '@/composables/useFx'
import { useSpeechInput } from '@/composables/useSpeechInput'
import { normaliseSpokenEntry } from '@/services/spokenThai'

const LAST_KEY = 'taxflow_quick_workspace'
const CATEGORY_KEY = 'taxflow_quick_category'

const auth = useAuthStore()
const ledger = useLedgerStore()
const game = useGameStore()
const toast = useToastStore()
const fx = useFx()
const ui = useUiStore()

const open = computed({
  get: () => ui.quickAddOpen,
  set: (value: boolean) => (ui.quickAddOpen = value),
})
const saving = ref(false)
const panel = ref<HTMLElement | null>(null)
const sentenceInput = ref<HTMLInputElement | null>(null)
const sentence = ref('')
const form = reactive({ workspaceId: '', type: 'expense' as EntryType, amount: 0, categoryKey: '', note: '', date: localToday() })

const workspaces = computed(() => ledger.workspaces)
const workspace = computed(() => workspaces.value.find((w) => w.id === form.workspaceId) ?? null)
const categories = computed(() => (workspace.value ? categoriesOf(workspace.value.mode, form.type) : []))

/* ---------- จำค่าที่ใช้ล่าสุด ---------- */

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ไม่จำก็ไม่เป็นไร */
  }
}
const lastCategories = ref<Record<string, string>>(readJson(CATEGORY_KEY, {}))

// เปลี่ยนประเภทหรือเล่มแล้วหมวดเดิมอาจไม่มี ใช้หมวดล่าสุดของเล่มนั้น ไม่มีก็หมวดแรก
watch([categories], () => {
  if (categories.value.some((c) => c.key === form.categoryKey)) return
  const remembered = lastCategories.value[`${form.workspaceId}:${form.type}`]
  form.categoryKey = categories.value.some((c) => c.key === remembered) ? remembered! : (categories.value[0]?.key ?? '')
})

/* ---------- จำรายการที่เคยบันทึก ---------- */

/** ต้นทางของรายการนี้ (ชื่อคู่โอน ชื่อร้าน หรือข้อความที่พิมพ์) ใช้เป็นกุญแจความจำตอนบันทึก */
const memorySource = ref('')
/** ข้อมูลที่เติมจากความจำ — แสดงบอกผู้ใช้ */
const recalled = ref<Recall | null>(null)
/** ใบเสร็จที่ถ่ายเป็นค่าลดหย่อน (เบี้ยประกัน/กองทุน) */
const deductionReceipt = ref<DeductionReceipt | null>(null)

const FUND_RECEIPT_KINDS: Partial<Record<DeductionReceipt['kind'], FundKind>> = {
  rmf: 'rmf',
  ssf: 'ssf',
  thaiEsg: 'thaiEsg',
  thaiEsgx: 'thaiEsgx',
}

/** ใบเสร็จซื้อกองทุนลดหย่อน — จดลงหน้ากองทุนของฉันด้วย จะได้ติดตามวันที่ขายได้โดยไม่ต้องกรอกซ้ำ */
function recordFundPurchase(): boolean {
  const kind = deductionReceipt.value ? FUND_RECEIPT_KINDS[deductionReceipt.value.kind] : undefined
  if (!kind || !auth.user || !form.date) return false
  const book = loadFunds(auth.user.id)
  book.lots.push({
    id: `fund-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    name: form.note || deductionReceipt.value!.label,
    buyDate: form.date,
    amount: form.amount,
  })
  return saveFunds(auth.user.id, book)
}

/**
 * เติมหมวด (และรายละเอียดถ้า withNote) จากรายการที่เคยบันทึกกับต้นทางเดียวกัน
 * เรียกหลังตัวเดาหมวดจากคำค้นเสมอ ความจำของผู้ใช้จึงชนะการเดา
 */
function applyMemory(source: string, withNote: boolean) {
  memorySource.value = source
  recalled.value = null
  if (!auth.user || !workspace.value || !source.trim()) return
  const hit = recallEntry(loadMemory(auth.user.id), {
    source,
    type: form.type,
    mode: workspace.value.mode,
    amount: form.amount,
  })
  if (!hit) return
  recalled.value = hit
  if (withNote && hit.note) form.note = hit.note
  void nextTick(() => {
    if (categories.value.some((c) => c.key === hit.categoryKey)) form.categoryKey = hit.categoryKey
  })
}

/** คู่โอนบนสลิปที่ใช้จำ — รายจ่ายจำผู้รับ รายรับจำผู้โอน */
const slipCounterparty = () => (form.type === 'expense' ? slipEdit.recipient : slipEdit.sender).trim()

/* ---------- เงินยืม ---------- */

const loanRole = ref<LoanRole | ''>('')
const loanParty = ref('')
/** ระบบเติมบทบาทเงินยืมให้เพราะคู่โอนค้างกันอยู่ */
const loanSuggested = ref<LoanSuggestion | null>(null)
const loanBook = computed(() => loanBalances(game.entries))

// เปลี่ยนเงินเข้า/ออกแล้วบทบาทเดิมใช้ไม่ได้ (ให้ยืมต้องเป็นเงินออก)
watch(
  () => form.type,
  (type) => {
    if (loanRole.value && !LOAN_ROLES_FOR[type].includes(loanRole.value)) loanRole.value = ''
  },
)

watch(loanRole, (role) => {
  if (role && !loanParty.value) loanParty.value = (slip.value ? slipCounterparty() : '') || form.note
})

/** สลิปจากคนที่ค้างเงินกันอยู่ — เสนอเป็นเงินคืนให้เลย */
function suggestLoan() {
  loanSuggested.value = null
  const party = slipCounterparty()
  const hit = party ? suggestLoanRole(loanBook.value, form.type, party) : null
  if (!hit) return
  loanSuggested.value = hit
  loanRole.value = hit.tag.role
  loanParty.value = hit.tag.party
}

function resetLoan() {
  loanRole.value = ''
  loanParty.value = ''
  loanSuggested.value = null
}

/* ---------- พิมพ์เป็นประโยค ---------- */

/** ทุกรายการที่อ่านได้จากข้อความ — ประโยคหลายรายการ หรือข้อความแจ้งเตือนธนาคารที่วางมา */
const entries = computed(() =>
  workspace.value && sentence.value.trim() ? parseEntries(sentence.value, workspace.value.mode, localToday()) : [],
)
const parsed = computed(() => (entries.value.length === 1 ? entries.value[0]! : null))
/** หลายรายการ — แสดงเป็นรายการให้ตรวจ แล้วบันทึกพร้อมกัน */
const multi = computed(() => (entries.value.length > 1 ? entries.value : []))

/** วางข้อความหลายบรรทัด (เช่นแจ้งเตือนธนาคารหลายอัน) — ช่องพิมพ์บรรทัดเดียวจะรวมบรรทัดจนแยกไม่ได้ จึงคั่นด้วย | */
function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? ''
  if (!/\r?\n/.test(text.trim())) return
  event.preventDefault()
  sentence.value = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ')
}

/* ---------- หารบิล ---------- */

/** ชื่อเพื่อนที่หารด้วย คั่นด้วยจุลภาคหรือเว้นวรรค */
const splitWith = ref('')
const splitNames = computed(() => [
  ...new Set(
    splitWith.value
      .split(/[,\s]+|และ/)
      .map((n) => n.trim())
      .filter(Boolean),
  ),
])
/** ส่วนของแต่ละคน — เศษสตางค์ตกเป็นของเรา */
const splitShare = computed(() =>
  splitNames.value.length && form.amount > 0 ? Math.floor((form.amount / (splitNames.value.length + 1)) * 100) / 100 : 0,
)
const splitActive = computed(() => form.type === 'expense' && splitShare.value > 0)
const myShare = computed(() => Math.round((form.amount - splitShare.value * splitNames.value.length) * 100) / 100)

// พิมพ์แล้วเติมฟอร์มให้ทันที ผู้ใช้ยังแก้ช่องไหนก็ได้ก่อนกดบันทึก
watch(parsed, (p) => {
  if (!p) return
  clearSlip()
  form.type = p.type
  form.amount = p.amount
  form.date = p.date
  form.note = p.note
  // รอให้รายการหมวดของประเภทใหม่คำนวณก่อน แล้วค่อยตั้งหมวดที่เดาได้
  void nextTick(() => {
    if (p.categoryKey !== 'otherIncome' && p.categoryKey !== 'otherExpense') form.categoryKey = p.categoryKey
  })
  // ข้อความที่พิมพ์เป็นของผู้ใช้เอง เติมจากความจำแค่หมวด
  applyMemory(p.note, false)
  // ประโยคบอกว่ายืมหรือคืนเงิน ("ยืมพี่ 2000") — รอ watch ของประเภทล้างบทบาทเดิมก่อนแล้วค่อยตั้ง
  if (p.loan) {
    const loan = p.loan
    void nextTick(() => {
      loanRole.value = loan.role
      loanParty.value = loan.party
    })
  }
})

/* ---------- พูดเพื่อจด ---------- */

const speech = useSpeechInput(
  (text) => {
    // แปลงคำตัวเลขเป็นเลข แล้วส่งเข้าช่องพิมพ์ — ตัวแยกประโยคและความจำทำงานต่อเหมือนพิมพ์เอง
    // ล้างก่อน พูดประโยคเดิมซ้ำแล้วฟอร์มจะเติมใหม่ แม้ผู้ใช้แก้ช่องด้านล่างไปแล้ว
    sentence.value = ''
    sentence.value = normaliseSpokenEntry(text)
    if (!entries.value.length) toast.error(`ได้ยินว่า "${text}" แต่ไม่เจอจำนวนเงิน พูดยอดเงินด้วย เช่น "หกสิบบาท"`)
  },
  (message) => toast.error(message),
)

function toggleSpeech() {
  if (speech.listening.value) speech.stop()
  else speech.start()
}

/* ---------- รายการที่จดบ่อย ---------- */

const frequent = computed(() =>
  form.workspaceId
    ? frequentEntries(
        game.entries.filter((e) => e.workspaceId === form.workspaceId),
        localToday(),
      )
    : [],
)

function useFrequent(item: FrequentEntry) {
  sentence.value = ''
  clearSlip()
  form.type = item.type
  form.amount = item.amount
  form.note = item.note
  form.date = localToday()
  void nextTick(() => (form.categoryKey = item.categoryKey))
}

/* ---------- ถ่ายใบเสร็จ ---------- */

const receiptInput = ref<HTMLInputElement | null>(null)
const receiptFile = ref<File | null>(null)
/** รูปที่แนบเป็นใบเสร็จหรือสลิป */
const evidenceKind = ref<EvidenceKind>('receipt')
const reading = ref(false)
const readStatus = ref('')

async function pickReceipt(files: FileList | File[] | null) {
  const file = files?.[0]
  if (receiptInput.value) receiptInput.value.value = ''
  if (!file || !workspace.value) return
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    toast.error('รองรับรูป JPG, PNG และ WebP')
    return
  }
  reading.value = true
  receiptFile.value = file
  evidenceKind.value = 'receipt'
  clearSlip()
  try {
    // ตัวอ่าน OCR โหลดเฉพาะตอนถ่ายใบเสร็จครั้งแรก
    const [{ readImageText }, { parseReceipt, detectDeductionReceipt }] = await Promise.all([
      import('@/services/certificateReader'),
      import('@/services/receiptParse'),
    ])
    const text = await readImageText(file, (status, progress) => {
      readStatus.value = `${status} ${Math.round(progress * 100)}%`
    })
    const guess = parseReceipt(text, localToday())
    const deduction = detectDeductionReceipt(text)
    sentence.value = ''
    form.type = 'expense'
    if (guess.amount) form.amount = guess.amount
    if (guess.date) form.date = guess.date
    if (guess.merchant) form.note = guess.merchant
    const key = guessCategory(guess.merchant, 'expense', workspace.value.mode)
    void nextTick(() => {
      if (key !== 'otherExpense') form.categoryKey = key
    })
    applyMemory(guess.merchant, true)
    // ใบเสร็จเบี้ยประกันหรือกองทุนลดหย่อน: ลงหมวดที่ถูกและใส่ประเภทในรายละเอียด
    // ตอนยื่นภาษีระบบดึงไปเป็นค่าลดหย่อนให้เอง (ดู deductionImport)
    if (deduction && categories.value.some((c) => c.key === deduction.categoryKey)) {
      deductionReceipt.value = deduction
      form.note = guess.merchant ? `${deduction.label} — ${guess.merchant}` : deduction.label
      void nextTick(() => void nextTick(() => (form.categoryKey = deduction.categoryKey)))
    }
    if (guess.amount) toast.success('อ่านใบเสร็จแล้ว ตรวจยอดก่อนบันทึกนะ')
    else toast.error('หายอดรวมในใบเสร็จไม่เจอ กรอกยอดเองได้ รูปจะแนบเป็นหลักฐานให้')
  } catch {
    toast.error('อ่านรูปไม่สำเร็จ — ครั้งแรกต้องต่ออินเทอร์เน็ตเพื่อโหลดตัวอ่านภาษาไทย รูปยังแนบเป็นหลักฐานได้')
  } finally {
    reading.value = false
  }
}

/* ---------- ใบกำกับภาษีอิเล็กทรอนิกส์ (PDF ที่ฝัง XML) ---------- */

const etaxInput = ref<HTMLInputElement | null>(null)
const etax = ref<EtaxInvoice | null>(null)
/** ใบกำกับออกในชื่อคนอื่น — ใช้เป็นหลักฐานลดหย่อนของผู้ใช้ไม่ได้ */
const etaxOtherBuyer = computed(() => !!etax.value && buyerMatches(etax.value, auth.user?.citizenId ?? '') === false)

async function pickEtax(files: FileList | File[] | null) {
  const file = files?.[0]
  if (etaxInput.value) etaxInput.value.value = ''
  if (!file || !workspace.value) return
  if (file.type !== 'application/pdf') {
    toast.error('เลือกไฟล์ PDF ของใบกำกับภาษีอิเล็กทรอนิกส์')
    return
  }
  reading.value = true
  readStatus.value = 'กำลังอ่านใบกำกับ'
  clearSlip()
  receiptFile.value = file
  evidenceKind.value = 'receipt'
  try {
    const invoice = await readEtaxPdf(file)
    if (!invoice) {
      toast.error('ไฟล์นี้ไม่มีข้อมูล e-Tax ฝังอยู่ กรอกยอดเองได้ ไฟล์จะแนบเป็นหลักฐานให้')
      return
    }
    etax.value = invoice
    sentence.value = ''
    form.type = 'expense'
    form.amount = invoice.total
    if (invoice.issueDate && invoice.issueDate <= maxDate.value) form.date = invoice.issueDate
    form.note = invoice.sellerName ? `${invoice.sellerName} (e-Tax ${invoice.number})` : `e-Tax ${invoice.number}`
    const key = guessCategory(invoice.sellerName, 'expense', workspace.value.mode)
    void nextTick(() => {
      if (key !== 'otherExpense') form.categoryKey = key
    })
    applyMemory(invoice.sellerName, false)
    toast.success(`อ่าน${invoice.typeLabel}แล้ว ยอด ${formatBaht(invoice.total)} — ตัวเลขมาจากไฟล์โดยตรง`)
  } catch {
    toast.error('อ่านไฟล์ PDF ไม่สำเร็จ ไฟล์อาจเสียหายหรือมีรหัสผ่าน')
  } finally {
    reading.value = false
  }
}

/* ---------- สแกนสลิปหลายใบ ---------- */

const bulkInput = ref<HTMLInputElement | null>(null)

function pickBulk(files: FileList | null) {
  const images = [...(files ?? [])].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type))
  if (bulkInput.value) bulkInput.value.value = ''
  if (!images.length) return
  if (images.length === 1) {
    void pickSlip(images)
    return
  }
  ui.openBulkSlips(images)
  close()
}

/* ---------- สแกนสลิปโอนเงิน ---------- */

const slipInput = ref<HTMLInputElement | null>(null)
const slip = ref<SlipExtraction | null>(null)
/** ข้อความดิบจาก OCR — แสดงให้ผู้ใช้เทียบเท่านั้น ไม่บันทึก เพราะมีชื่อและเลขบัญชี */
const slipOcr = ref<{ text: string; confidence: number; rotation: number; enhanced: boolean } | null>(null)
/** รูปสลิปต้นฉบับให้ดูเทียบระหว่างตรวจ */
const slipPreview = ref('')
const slipImageHash = ref<string | null>(null)
/** ช่องจากสลิปที่ผู้ใช้แก้ได้ — ค่าเริ่มต้นจาก OCR ช่องที่อ่านไม่ได้เป็นค่าว่าง */
const slipEdit = reactive({ sender: '', recipient: '', recipientType: '' as RecipientType | '', reference: '', time: '' })
/** สลิปที่ตัดสินไม่ได้ว่าเงินเข้าหรือออก ต้องให้ผู้ใช้กดเลือกประเภทก่อนบันทึก */
const typeConfirmed = ref(true)
const reviewConfirmed = ref(false)
const duplicateConfirmed = ref(false)
/** รายละเอียดที่ระบบเติมให้ล่าสุด — ถ้าผู้ใช้ยังไม่แก้ จะเปลี่ยนตามประเภทและชื่อที่แก้ */
let autoNote = ''

const FIELD_LABELS: Record<SlipFieldKey, string> = {
  amount: 'ยอดเงิน',
  date: 'วันที่',
  time: 'เวลา',
  sender: 'ผู้โอน',
  recipient: 'ผู้รับ',
  reference: 'เลขอ้างอิง',
}

/** วันที่ล่าสุดที่เลือกได้ — สลิปใช้เวลาไทย เครื่องที่ตั้งโซนอื่นอาจยังเป็นเมื่อวาน */
const maxDate = computed(() => {
  const local = localToday()
  const bangkok = bangkokToday()
  return local > bangkok ? local : bangkok
})

const slipMeta = computed<SlipMeta | null>(() => {
  if (!slip.value) return null
  return {
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(slipEdit.time) ? slipEdit.time : null,
    sender: slipEdit.sender.trim() || null,
    recipient: slipEdit.recipient.trim() || null,
    recipientType: slipEdit.recipientType || null,
    recipientBank: slip.value.recipientBank,
    banks: slip.value.banks,
    // ตัดเฉพาะช่องว่าง ตัวอักษรและขีดคงไว้ตามสลิป
    reference: slipEdit.reference.replace(/\s+/g, '') || null,
    imageHash: slipImageHash.value,
  }
})

const referenceInvalid = computed(() => !!slipMeta.value?.reference && !isValidReference(slipMeta.value.reference))

/** รายการเดิมที่น่าจะเป็นสลิปใบเดียวกัน — เลขอ้างอิง รูปเดียวกัน หรือวันที่+ยอด+ชื่อ ตรงกัน */
const duplicates = computed(() =>
  slipMeta.value ? findSlipDuplicates({ date: form.date, amount: form.amount, meta: slipMeta.value }, game.entries) : [],
)

const reviewFields = computed(() => slip.value?.review ?? [])

function fieldOf(key: SlipFieldKey) {
  return slip.value?.[key] ?? null
}

function chooseType(type: EntryType) {
  form.type = type
  typeConfirmed.value = true
  // ผู้ใช้บอกเองว่าสลิปนี้เข้าหรือออก — จำชื่อและบัญชีฝั่งที่เป็นผู้ใช้ ครั้งหน้าไม่ต้องเดา
  if (slip.value && auth.user) {
    learnSelfFromSlip(auth.user.id, type, {
      sender: slipEdit.sender.trim() || null,
      recipient: slipEdit.recipient.trim() || null,
      senderAccount: slip.value.senderAccount,
      recipientAccount: slip.value.recipientAccount,
    })
  }
  // ทิศทางเงินกำหนดว่าคู่โอนคือผู้รับหรือผู้โอน — รอรายละเอียดอัตโนมัติเปลี่ยนตามก่อน แล้วค่อยเติมจากความจำ
  void nextTick(() => {
    applyMemory(slipCounterparty(), true)
    if (slip.value) suggestLoan()
  })
}

// เปลี่ยนประเภทหรือแก้ชื่อแล้ว รายละเอียดที่ระบบเติมให้เปลี่ยนตาม ถ้าผู้ใช้ยังไม่ได้แก้รายละเอียดเอง
watch([() => form.type, () => ({ ...slipEdit })], () => {
  if (!slipMeta.value || form.note !== autoNote) return
  form.note = autoNote = slipNote(slipMeta.value, form.type)
})

function clearSlip() {
  slip.value = null
  slipOcr.value = null
  slipImageHash.value = null
  if (slipPreview.value) URL.revokeObjectURL?.(slipPreview.value)
  slipPreview.value = ''
  Object.assign(slipEdit, { sender: '', recipient: '', recipientType: '', reference: '', time: '' })
  typeConfirmed.value = true
  reviewConfirmed.value = false
  duplicateConfirmed.value = false
  autoNote = ''
  memorySource.value = ''
  recalled.value = null
  deductionReceipt.value = null
  etax.value = null
  resetLoan()
}

async function pickSlip(files: FileList | File[] | null) {
  const file = files?.[0]
  if (slipInput.value) slipInput.value.value = ''
  if (!file || !workspace.value) return
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    toast.error('รองรับรูป JPG, PNG และ WebP')
    return
  }
  reading.value = true
  receiptFile.value = file
  evidenceKind.value = 'slip'
  clearSlip()
  slipPreview.value = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''
  try {
    // ตัวอ่าน OCR โหลดเฉพาะตอนสแกนสลิปครั้งแรก
    const { readSlipImage } = await import('@/services/slipReader')
    const ocr = await readSlipImage(file, (status, progress) => {
      readStatus.value = `${status} ${Math.round(progress * 100)}%`
    })
    slipImageHash.value = ocr.imageHash
    slipOcr.value = { text: ocr.text, confidence: ocr.confidence, rotation: ocr.rotation, enhanced: ocr.enhanced }
    // "วันนี้" ใช้กันวันที่ในอนาคตเท่านั้น ไม่ใช้แทนวันที่ที่หาไม่เจอ
    const self = auth.user ? loadSelf(auth.user.id) : { names: [], accounts: [] }
    const result = parseSlip(ocr.lines, [auth.user?.fullName ?? '', ...self.names], bangkokToday(), {
      qr: ocr.qr,
      fileDate: fileDateOf(file),
      ownAccounts: self.accounts,
    })
    slip.value = result
    sentence.value = ''
    Object.assign(slipEdit, {
      sender: result.sender.value ?? '',
      recipient: result.recipient.value ?? '',
      recipientType: result.recipientType ?? '',
      reference: result.reference.value ?? '',
      time: result.time.value ?? '',
    })
    // ช่องที่สลิปไม่มีปล่อยว่าง ไม่ค้างค่าจากรายการก่อนหน้า และไม่ใช้วันที่วันนี้แทน
    form.amount = result.amount.value ?? 0
    form.date = result.date.value ?? ''
    typeConfirmed.value = result.direction !== null
    if (result.direction) form.type = result.direction
    await nextTick()
    form.note = autoNote = slipNote(slipMeta.value!, form.type)
    const key = guessCategory(form.note, form.type, workspace.value.mode)
    void nextTick(() => {
      if (key !== 'otherIncome' && key !== 'otherExpense') form.categoryKey = key
    })
    // รู้ทิศทางเงินแล้วเท่านั้นจึงรู้ว่าคู่โอนคือใคร ไม่รู้ให้รอผู้ใช้เลือกประเภทก่อน (chooseType)
    if (typeConfirmed.value) {
      applyMemory(slipCounterparty(), true)
      suggestLoan()
    }
    if (result.review.length || !result.direction) toast.push('อ่านสลิปแล้ว มีบางช่องต้องตรวจก่อนบันทึก')
    else toast.success('อ่านสลิปแล้ว ตรวจข้อมูลก่อนบันทึกนะ')
  } catch {
    toast.error('อ่านรูปไม่สำเร็จ — ครั้งแรกต้องต่ออินเทอร์เน็ตเพื่อโหลดตัวอ่านภาษาไทย รูปยังแนบเป็นหลักฐานได้')
  } finally {
    reading.value = false
  }
}

/** จำรายการที่บันทึก ทั้งตามต้นทาง (คู่โอน/ร้าน) และตามรายละเอียด ครั้งหน้าเติมให้ได้ทั้งสองทาง */
function rememberSaved(mode: MemoryInput['mode']) {
  if (!auth.user) return
  const base = { type: form.type, mode, amount: form.amount, categoryKey: form.categoryKey, note: form.note }
  const source = (slip.value ? slipCounterparty() : '') || memorySource.value
  const inputs: MemoryInput[] = [{ ...base, source: form.note }]
  if (source && source !== form.note) inputs.push({ ...base, source })
  rememberMany(auth.user.id, inputs, localToday())
}

/** เหตุผลที่ยังบันทึกสลิปไม่ได้ — null คือพร้อมบันทึก */
function slipBlocker(): string | null {
  if (!slip.value) return null
  if (!form.date) return 'กรอกวันที่ทำรายการตามที่เห็นบนสลิป'
  if (form.date > maxDate.value) return 'วันที่ทำรายการอยู่ในอนาคต ตรวจกับสลิปอีกครั้ง'
  if (!typeConfirmed.value) return 'เลือกก่อนว่าสลิปนี้เป็นรายรับหรือรายจ่าย'
  if (referenceInvalid.value) return 'เลขอ้างอิงต้องเป็นตัวอักษร/ตัวเลข 6–40 ตัว — ลบออกได้ถ้าสลิปไม่มี'
  if (reviewFields.value.length && !reviewConfirmed.value) return 'ตรวจช่องที่มีเครื่องหมาย ⚠ กับรูปสลิป แล้วติ๊กยืนยัน'
  if (duplicates.value.length && !duplicateConfirmed.value) return 'สลิปนี้อาจเคยบันทึกแล้ว ติ๊กยืนยันถ้าต้องการบันทึกซ้ำ'
  return null
}

/** แนบรูปใบเสร็จหรือสลิปเป็นหลักฐานของรายการที่เพิ่งบันทึก — แนบไม่สำเร็จไม่ทำให้รายการหาย */
async function attachReceipt(workspaceId: string, entryId: string, date: string, direction: EntryType): Promise<boolean> {
  const file = receiptFile.value
  if (!file) return false
  try {
    // PDF (e-Tax) เก็บไฟล์เดิมไว้ทั้งไฟล์ — XML ที่ฝังอยู่คือหลักฐานตัวจริง ย่อไม่ได้
    const blob: Blob =
      file.type === 'application/pdf' ? file : (await (await import('@/services/imageCompress')).compressImage(file)).blob
    const record = await api.addEvidence(
      workspaceId,
      { entryId, date, direction, kind: evidenceKind.value, name: file.name, size: blob.size, mimeType: blob.type || file.type, note: '' },
      blob,
    )
    if (ledger.active?.id === workspaceId) ledger.evidence.push(record)
    return true
  } catch {
    toast.error(`บันทึกรายการแล้ว แต่แนบรูป${evidenceKind.value === 'slip' ? 'สลิป' : 'ใบเสร็จ'}ไม่สำเร็จ`)
    return false
  }
}

/* ---------- เปิด ปิด บันทึก ---------- */

watch(open, async (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeydown)
    await prepare()
  } else {
    document.removeEventListener('keydown', onKeydown)
    // ปิดหน้าต่างระหว่างฟัง — ปิดไมค์ด้วย ไม่งั้นค้างไปถึงครั้งหน้า
    speech.cancel()
  }
})

async function prepare() {
  form.date = localToday()
  sentence.value = ui.quickAddText
  ui.quickAddText = ''
  splitWith.value = ''
  receiptFile.value = null
  clearSlip()
  if (!ledger.workspaces.length) {
    try {
      await ledger.loadWorkspaces()
    } catch {
      /* โหลดไม่ได้ จะขึ้นข้อความให้สร้างสมุดแทน */
    }
  }
  let last = ''
  try {
    last = localStorage.getItem(LAST_KEY) ?? ''
  } catch {
    /* อ่านไม่ได้ก็ใช้เล่มแรก */
  }
  // เปิดสมุดเล่มไหนอยู่ ใช้เล่มนั้นก่อน
  const preferred = [ledger.active?.id, last, workspaces.value[0]?.id].find(
    (id) => id && workspaces.value.some((w) => w.id === id),
  )
  form.workspaceId = preferred ?? ''
  await nextTick()
  // ไฟล์ที่แชร์มาจากแอปอื่น (Web Share Target) อ่านให้ทันที
  const shared = ui.quickAddFile
  ui.quickAddFile = null
  if (shared && workspace.value) {
    if (shared.type === 'application/pdf') await pickEtax([shared])
    else await pickSlip([shared])
    return
  }
  // ทางลัดบนหน้าจอโฮม
  const intent = ui.quickAddIntent
  ui.quickAddIntent = ''
  if (intent === 'income' || intent === 'expense') chooseType(intent)
  if (intent === 'voice' && speech.supported) {
    speech.start()
    return
  }
  if (intent === 'slip') {
    // บางเบราว์เซอร์ไม่ยอมเปิดตัวเลือกไฟล์เองถ้าผู้ใช้ไม่ได้แตะ — ถ้าไม่เปิด ปุ่มสแกนสลิปอยู่ตรงหน้าแล้ว
    slipInput.value?.click()
    return
  }
  sentenceInput.value?.focus()
}

function close() {
  open.value = false
}

/** บันทึกหลายรายการจากข้อความเดียว — หมวดใช้ความจำของผู้ใช้ก่อน แล้วค่อยตัวเดาจากคำ */
async function saveMany() {
  if (!workspace.value || !auth.user) return
  const ws = workspace.value
  const user = auth.user
  const list = [...multi.value]
  saving.value = true
  let count = 0
  try {
    const memory = loadMemory(user.id)
    for (const item of list) {
      const valid = categoriesOf(ws.mode, item.type)
      const hit = recallEntry(memory, { source: item.note, type: item.type, mode: ws.mode, amount: item.amount })
      const categoryKey =
        [hit?.categoryKey, item.categoryKey].find((k) => k && valid.some((c) => c.key === k)) ?? valid[0]?.key ?? ''
      const created = await api.addEntry(ws.id, {
        date: item.date,
        type: item.type,
        categoryKey,
        amount: item.amount,
        note: item.note,
        ...(item.loan?.party ? { loan: item.loan } : {}),
      })
      ledger.receiveEntry(created)
      rememberMany(user.id, [{ type: item.type, mode: ws.mode, amount: item.amount, categoryKey, note: item.note, source: item.note }], localToday())
      count++
    }
    game.scheduleRefresh()
    writeLocal(LAST_KEY, ws.id)
    toast.success(`บันทึก ${count} รายการลง "${ws.name}" แล้ว`)
    fx.entrySaved(list[0]!.type, list.reduce((s, e) => s + e.amount, 0))
    sentence.value = ''
    close()
  } catch (error) {
    toast.error(
      `บันทึกได้ ${count} จาก ${list.length} รายการ — ${error instanceof ApiError ? error.message : 'เกิดข้อผิดพลาด'} ตรวจในสมุดก่อนบันทึกซ้ำ`,
    )
  } finally {
    saving.value = false
  }
}

/** หารบิล: ส่วนของเพื่อนแต่ละคนบันทึกเป็น "ให้ยืม" ระบบเงินยืมจะติดตามให้ว่าใครยังไม่คืน */
async function saveSplitShares(workspaceId: string, categoryKey: string) {
  for (const friend of splitNames.value) {
    const created = await api.addEntry(workspaceId, {
      date: form.date,
      type: 'expense',
      categoryKey,
      amount: splitShare.value,
      note: `${friend} ติดค่า${form.note ? ` ${form.note}` : 'บิล'} (หาร ${splitNames.value.length + 1} คน)`,
      loan: { role: 'lend', party: friend },
    })
    ledger.receiveEntry(created)
  }
}

async function save() {
  if (multi.value.length) return saveMany()
  if (!workspace.value) return
  if (form.amount <= 0) {
    toast.error('จำนวนเงินต้องมากกว่า 0')
    return
  }
  // สลิปที่ยังมีช่องไม่แน่ใจ ไม่รู้ทิศทางเงิน หรืออาจซ้ำ ต้องให้ผู้ใช้ยืนยันก่อน ไม่บันทึกเงียบ ๆ
  const blocker = slipBlocker()
  if (blocker) {
    toast.error(blocker)
    return
  }
  saving.value = true
  try {
    // หารบิล: รายการหลักเป็นส่วนของเราเอง ส่วนของเพื่อนแยกเป็นรายการให้ยืม (ยอดรวมทุกรายการ = ยอดที่จ่ายจริง)
    const split = splitActive.value
    const created = await api.addEntry(workspace.value.id, {
      date: form.date,
      type: form.type,
      categoryKey: form.categoryKey,
      amount: split ? myShare.value : form.amount,
      note: split ? `${form.note || 'บิล'} (ส่วนของฉัน จาก ${formatBaht(form.amount)} หาร ${splitNames.value.length + 1} คน)` : form.note,
      ...(slipMeta.value ? { slip: slipMeta.value } : {}),
      ...(!split && loanRole.value && loanParty.value.trim() ? { loan: { role: loanRole.value, party: loanParty.value.trim() } } : {}),
    })
    ledger.receiveEntry(created)
    if (split) await saveSplitShares(workspace.value.id, form.categoryKey)
    rememberSaved(workspace.value.mode)
    // ระบบรู้ทิศทางจากชื่อคุณแน่นอนแล้ว — จำเลขบัญชีฝั่งคุณไว้ด้วย สลิปภาษาอังกฤษครั้งหน้าจะรู้จาก
    if (slip.value && auth.user && !slip.value.directionGuessed && slip.value.direction === form.type) {
      learnSelfFromSlip(auth.user.id, form.type, {
        sender: null,
        recipient: null,
        senderAccount: slip.value.senderAccount,
        recipientAccount: slip.value.recipientAccount,
      })
    }
    const fundRecorded = recordFundPurchase()
    const attached = await attachReceipt(workspace.value.id, created.id, form.date, form.type)
    const attachedLabel = evidenceKind.value === 'slip' ? 'สลิป' : 'ใบเสร็จ'
    receiptFile.value = null
    clearSlip()
    game.scheduleRefresh()
    writeLocal(LAST_KEY, workspace.value.id)
    lastCategories.value = { ...lastCategories.value, [`${workspace.value.id}:${form.type}`]: form.categoryKey }
    writeLocal(CATEGORY_KEY, JSON.stringify(lastCategories.value))
    toast.success(
      `บันทึก${form.type === 'income' ? 'รายรับ' : 'รายจ่าย'} ${formatBaht(form.amount)} ลง "${workspace.value.name}" แล้ว` +
        (attached ? ` พร้อมรูป${attachedLabel}` : '') +
        (fundRecorded ? ' และจดลงกองทุนลดหย่อนของฉันแล้ว' : '') +
        (split ? ` · ${splitNames.value.join(', ')} ติดคุณคนละ ${formatBaht(splitShare.value)}` : ''),
    )
    fx.entrySaved(form.type, form.amount)
    form.amount = 0
    form.note = ''
    sentence.value = ''
    splitWith.value = ''
    close()
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- เปิดจากปุ่ม "บันทึกรายการ" ในเมนูด้านข้าง ปุ่ม + บนแถบล่างของมือถือ หรือ Ctrl+K -->
  <div v-if="auth.isLoggedIn" class="quick-add no-print">

    <Transition name="guide-pop">
      <div v-if="open" class="modal-backdrop quick-backdrop" @click.self="close">
        <section ref="panel" class="modal quick-panel" role="dialog" aria-modal="true" aria-labelledby="quick-title">
          <div class="card-head">
            <div>
              <h3 id="quick-title">บันทึกด่วน</h3>
              <p>พิมพ์เป็นประโยคก็ได้ แล้วกด Enter</p>
            </div>
            <button class="guide-icon-btn" type="button" aria-label="ปิด" @click="close">
              <AppIcon name="close" :size="18" />
            </button>
          </div>

          <div v-if="!workspaces.length" class="notice">
            <strong>ยังไม่มีสมุดบัญชี</strong>
            สร้างสมุดเล่มแรกก่อน แล้วปุ่มนี้จะบันทึกได้ทันที
            <RouterLink to="/workspaces" @click="close">ไปสร้างสมุด</RouterLink>
          </div>

          <form v-else novalidate @submit.prevent="save">
            <div class="field">
              <label for="q-sentence">{{ speech.supported ? 'พิมพ์หรือพูดสั้น ๆ' : 'พิมพ์สั้น ๆ' }}</label>
              <div class="sentence-row">
                <input
                  id="q-sentence"
                  ref="sentenceInput"
                  v-model="sentence"
                  type="text"
                  autocomplete="off"
                  placeholder="เช่น กาแฟ 65 · ข้าว 60 ค่ารถ 30 · แม่ให้ 500 · วางแจ้งเตือนธนาคาร"
                  @paste="onPaste"
                />
                <button
                  v-if="speech.supported"
                  class="btn btn-sm mic-btn"
                  :class="speech.listening.value ? 'btn-primary listening' : 'btn-ghost'"
                  type="button"
                  :aria-label="speech.listening.value ? 'หยุดฟัง' : 'พูดเพื่อจดรายการ'"
                  :aria-pressed="speech.listening.value"
                  data-test="mic"
                  @click="toggleSpeech"
                >
                  🎤
                </button>
              </div>
              <p class="hint" aria-live="polite">
                <template v-if="speech.listening.value">กำลังฟัง... {{ speech.interim.value || 'พูดเช่น "ข้าวมันไก่ หกสิบบาท"' }}</template>
                <template v-else-if="multi.length">อ่านได้ {{ multi.length }} รายการ — ตรวจด้านล่างแล้วกดบันทึกทีเดียว</template>
                <template v-else-if="parsed && workspace">
                  {{ parsed.type === 'income' ? 'รายรับ' : 'รายจ่าย' }} {{ formatBaht(parsed.amount) }} ·
                  {{ categoryLabel(workspace.mode, form.categoryKey) }} · {{ thaiDate(parsed.date) }}
                  <template v-if="parsed.reason"> · เข้าใจว่า "{{ parsed.reason }}"</template>
                </template>
                <template v-else-if="sentence.trim()">ยังไม่เจอจำนวนเงิน ใส่ตัวเลขด้วย เช่น "ข้าว 60"</template>
                <template v-else>หรือกรอกช่องด้านล่างเองก็ได้</template>
              </p>
            </div>

            <ul v-if="multi.length && workspace" class="multi-list mb-2" data-test="multi-list">
              <li v-for="(item, i) in multi" :key="i">
                <span class="multi-type" :class="item.type">{{ item.type === 'income' ? 'รับ' : 'จ่าย' }}</span>
                <span class="multi-note">
                  {{ item.note || categoryLabel(workspace.mode, item.categoryKey) }}
                  <small class="muted">· {{ categoryLabel(workspace.mode, item.categoryKey) }} · {{ thaiDate(item.date) }}</small>
                </span>
                <strong>{{ formatBaht(item.amount) }}</strong>
              </li>
            </ul>

            <template v-if="!multi.length">
            <div class="row mb-2" style="gap: 8px; flex-wrap: wrap; align-items: center">
              <label class="btn btn-ghost btn-sm" :class="{ disabled: reading }">
                <AppIcon name="camera" :size="15" />
                {{ reading ? readStatus || 'กำลังอ่าน...' : receiptFile ? 'ถ่ายใบใหม่' : 'ถ่ายใบเสร็จ' }}
                <input
                  ref="receiptInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  class="sr-only"
                  :disabled="reading"
                  @change="pickReceipt(($event.target as HTMLInputElement).files)"
                />
              </label>
              <label class="btn btn-ghost btn-sm" :class="{ disabled: reading }">
                <AppIcon name="wallet" :size="15" />
                {{ slip ? 'สแกนสลิปใหม่' : 'สแกนสลิปโอนเงิน' }}
                <input
                  ref="slipInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  class="sr-only"
                  :disabled="reading"
                  @change="pickSlip(($event.target as HTMLInputElement).files)"
                />
              </label>
              <label class="btn btn-ghost btn-sm" :class="{ disabled: reading }">
                <AppIcon name="plusSquare" :size="15" />
                สแกนสลิปหลายใบ
                <input
                  ref="bulkInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  class="sr-only"
                  :disabled="reading"
                  @change="pickBulk(($event.target as HTMLInputElement).files)"
                />
              </label>
              <label class="btn btn-ghost btn-sm" :class="{ disabled: reading }">
                <AppIcon name="file" :size="15" />
                e-Tax (PDF)
                <input
                  ref="etaxInput"
                  type="file"
                  accept="application/pdf"
                  class="sr-only"
                  :disabled="reading"
                  @change="pickEtax(($event.target as HTMLInputElement).files)"
                />
              </label>
              <small v-if="receiptFile && !reading" class="muted">📎 แนบ {{ receiptFile.name }} เป็นหลักฐาน</small>
            </div>

            <div v-if="etax && !reading" class="notice mb-2" :class="{ 'notice-warn': etaxOtherBuyer }" data-test="etax-review">
              <strong>{{ etax.typeLabel }} เลขที่ {{ etax.number }}</strong>
              {{ etax.sellerName }} (เลขผู้เสียภาษี {{ etax.sellerTaxId }}) · ยอดรวม {{ formatBaht(etax.total) }}
              · VAT {{ formatBaht(etax.vat) }}
              <template v-if="etaxOtherBuyer">
                <br />ใบนี้ออกในชื่อ {{ etax.buyerName || 'ผู้อื่น' }} ไม่ใช่เลขบัตรของคุณ — ใช้ลดหย่อนภาษีของคุณไม่ได้
              </template>
            </div>

            <!-- ข้อมูลที่อ่านได้จากสลิป ให้ตรวจก่อนบันทึก ช่องที่ไม่มีในสลิปบอกตรง ๆ ว่าไม่พบ -->
            <div
              v-if="slip && !reading"
              class="notice slip-review mb-2"
              :class="{ 'notice-warn': !typeConfirmed || reviewFields.length || duplicates.length }"
              data-test="slip-review"
            >
              <strong>ข้อมูลจากสลิป — เทียบกับรูปแล้วแก้ได้ทุกช่อง</strong>
              <a v-if="slipPreview" :href="slipPreview" target="_blank" rel="noopener" class="slip-preview">
                <img :src="slipPreview" alt="รูปสลิปต้นฉบับ" />
              </a>

              <dl>
                <div v-for="key in ['amount', 'date'] as SlipFieldKey[]" :key="key" :data-field="key">
                  <dt>
                    <span v-if="reviewFields.includes(key)" class="slip-flag" title="ต้องตรวจ">⚠</span>{{ FIELD_LABELS[key] }}
                  </dt>
                  <dd :title="fieldOf(key)?.source ?? ''">
                    <template v-if="key === 'amount'">{{ form.amount > 0 ? formatBaht(form.amount) : 'ไม่พบ — กรอกช่องจำนวนเงิน' }}</template>
                    <template v-else>{{ form.date ? thaiDate(form.date) : 'ไม่พบ — กรอกช่องวันที่' }}</template>
                  </dd>
                </div>
                <div>
                  <dt>ธนาคาร</dt>
                  <dd>{{ slip.banks.length ? slip.banks.join(', ') : 'ไม่พบ' }}</dd>
                </div>
              </dl>

              <div class="field-grid slip-fields">
                <div class="field">
                  <label for="s-sender"><span v-if="reviewFields.includes('sender')" class="slip-flag">⚠</span>ผู้โอน</label>
                  <input id="s-sender" v-model="slipEdit.sender" type="text" maxlength="120" placeholder="ไม่พบในสลิป" :title="slip.sender.source ?? ''" />
                </div>
                <div class="field">
                  <label for="s-recipient"><span v-if="reviewFields.includes('recipient')" class="slip-flag">⚠</span>ผู้รับ</label>
                  <input id="s-recipient" v-model="slipEdit.recipient" type="text" maxlength="120" placeholder="ไม่พบในสลิป" :title="slip.recipient.source ?? ''" />
                </div>
                <div class="field">
                  <label for="s-rtype">ผู้รับเป็น</label>
                  <select id="s-rtype" v-model="slipEdit.recipientType">
                    <option value="">ไม่ระบุ</option>
                    <option value="person">บุคคล</option>
                    <option value="company">บริษัท/นิติบุคคล</option>
                  </select>
                </div>
                <div class="field">
                  <label for="s-time"><span v-if="reviewFields.includes('time')" class="slip-flag">⚠</span>เวลา</label>
                  <input id="s-time" v-model="slipEdit.time" type="time" />
                </div>
                <div class="field slip-wide">
                  <label for="s-ref"><span v-if="reviewFields.includes('reference')" class="slip-flag">⚠</span>เลขอ้างอิง</label>
                  <input
                    id="s-ref"
                    v-model="slipEdit.reference"
                    type="text"
                    maxlength="60"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="ไม่พบในสลิป"
                    :aria-invalid="referenceInvalid"
                  />
                </div>
              </div>

              <ul v-if="reviewFields.length || slip.unassignedNames.length" class="slip-issues">
                <li v-for="key in reviewFields" :key="key">
                  ⚠ {{ FIELD_LABELS[key] }}: {{ fieldOf(key)?.issue ?? `อ่านได้ไม่ชัด (มั่นใจ ${Math.round((fieldOf(key)?.confidence ?? 0) * 100)}%)` }}
                </li>
                <li v-if="slip.unassignedNames.length">ชื่อที่พบแต่ไม่รู้ว่าเป็นฝั่งไหน: {{ slip.unassignedNames.join(', ') }}</li>
              </ul>

              <p class="slip-direction">
                <template v-if="typeConfirmed && slip.direction && form.type === slip.direction">
                  เป็น{{ slip.direction === 'income' ? 'รายรับ' : 'รายจ่าย' }} เพราะ{{ slip.directionReason }}
                  <template v-if="slip.directionGuessed"> — ถ้าผิด กดเลือกประเภทด้านล่าง ระบบจะจำไว้ครั้งหน้า</template>
                </template>
                <template v-else-if="typeConfirmed">เลือกเป็น{{ form.type === 'income' ? 'รายรับ' : 'รายจ่าย' }}แล้ว</template>
                <template v-else>{{ slip.directionReason }} — กดเลือกรายรับหรือรายจ่ายด้านล่างก่อนบันทึก</template>
              </p>

              <label v-if="reviewFields.length" class="slip-check">
                <input v-model="reviewConfirmed" type="checkbox" data-test="review-confirm" />
                ตรวจช่องที่มี ⚠ กับรูปสลิปแล้ว
              </label>
              <label v-if="duplicates.length" class="slip-check">
                <input v-model="duplicateConfirmed" type="checkbox" data-test="duplicate-confirm" />
                <span>
                  อาจซ้ำกับรายการ {{ thaiDate(duplicates[0]!.entry.date) }} {{ formatBaht(duplicates[0]!.entry.amount) }}
                  ({{ duplicates[0]!.reason === 'reference' ? 'เลขอ้างอิงเดียวกัน' : duplicates[0]!.reason === 'image' ? 'รูปสลิปเดียวกัน' : 'วันที่ ยอด และชื่อตรงกัน' }})
                  — ยืนยันบันทึกซ้ำ
                </span>
              </label>

              <details v-if="slipOcr" class="slip-raw">
                <summary>
                  ข้อความที่ OCR อ่านได้ (มั่นใจ {{ Math.round(slipOcr.confidence) }}%{{ slipOcr.rotation ? ` · หมุนรูป ${slipOcr.rotation}°` : '' }})
                </summary>
                <pre>{{ slipOcr.text }}</pre>
              </details>
            </div>

            <div v-if="frequent.length" class="chip-row mb-2" aria-label="รายการที่จดบ่อย">
              <button
                v-for="item in frequent"
                :key="`${item.type}${item.categoryKey}${item.amount}`"
                type="button"
                class="chip"
                :title="`จดไปแล้ว ${item.count} ครั้งใน 90 วัน`"
                @click="useFrequent(item)"
              >
                {{ item.note || (workspace ? categoryLabel(workspace.mode, item.categoryKey) : '') }} {{ formatBaht(item.amount) }}
              </button>
            </div>

            <div class="chip-row mb-2" role="radiogroup" aria-label="ประเภทรายการ">
              <button
                v-for="t in [
                  { value: 'expense', label: 'รายจ่าย' },
                  { value: 'income', label: 'รายรับ' },
                ]"
                :key="t.value"
                type="button"
                class="chip"
                role="radio"
                :aria-checked="typeConfirmed && form.type === t.value"
                :class="{ selected: typeConfirmed && form.type === t.value }"
                @click="chooseType(t.value as EntryType)"
              >
                {{ t.label }}
              </button>
            </div>

            <MoneyField v-model="form.amount" label="จำนวนเงิน" />

            <div class="field-grid">
              <div class="field">
                <label for="q-cat">หมวด</label>
                <select id="q-cat" v-model="form.categoryKey">
                  <option v-for="c in categories" :key="c.key" :value="c.key">{{ c.label }}</option>
                </select>
              </div>
              <div v-if="workspaces.length > 1" class="field">
                <label for="q-ws">สมุด</label>
                <select id="q-ws" v-model="form.workspaceId">
                  <option v-for="w in workspaces" :key="w.id" :value="w.id">{{ w.name }}</option>
                </select>
              </div>
              <div class="field">
                <label for="q-date">วันที่</label>
                <input id="q-date" v-model="form.date" type="date" :max="maxDate" />
              </div>
              <div class="field">
                <label for="q-note">รายละเอียด</label>
                <input id="q-note" v-model="form.note" type="text" placeholder="ไม่บังคับ" />
              </div>
              <div v-if="form.type === 'expense'" class="field">
                <label for="q-split">หารบิลกับ</label>
                <input id="q-split" v-model="splitWith" type="text" placeholder="ไม่บังคับ เช่น เอ, บี, ซี" data-test="split-with" />
              </div>
              <div class="field">
                <label for="q-loan">เงินยืม</label>
                <select id="q-loan" v-model="loanRole" data-test="loan-role" :disabled="splitActive">
                  <option value="">ไม่ใช่</option>
                  <option v-for="role in LOAN_ROLES_FOR[form.type]" :key="role" :value="role">
                    {{ LOAN_ROLE_LABELS[role] }}
                  </option>
                </select>
              </div>
              <div v-if="loanRole" class="field">
                <label for="q-loan-party">{{ loanRole === 'lend' || loanRole === 'collect' ? 'ผู้ยืม' : 'ผู้ให้ยืม' }}</label>
                <input id="q-loan-party" v-model="loanParty" type="text" placeholder="ชื่อ" />
              </div>
            </div>

            <p v-if="splitActive" class="small muted mb-2" data-test="split-hint">
              🍕 จ่าย {{ formatBaht(form.amount) }} หาร {{ splitNames.length + 1 }} คน — ส่วนของคุณ {{ formatBaht(myShare) }} ·
              {{ splitNames.join(', ') }} ติดคุณคนละ {{ formatBaht(splitShare) }} (บันทึกเป็น "ให้ยืม" ติดตามได้ว่าใครยังไม่คืน)
            </p>
            <p v-if="loanSuggested" class="small muted mb-2" data-test="loan-hint">
              🤝 {{ loanSuggested.tag.party }}
              {{ loanSuggested.tag.role === 'collect' ? 'ติดเงินคุณอยู่' : 'คุณติดเงินอยู่' }}
              {{ formatBaht(loanSuggested.outstanding) }} — บันทึกเป็น "{{ LOAN_ROLE_LABELS[loanSuggested.tag.role] }}" ให้แล้ว
              <template v-if="form.amount > 0">
                (เหลือ {{ formatBaht(Math.max(0, loanSuggested.outstanding - form.amount)) }})
              </template>
            </p>

            <p v-if="recalled" class="small muted mb-2" data-test="memory-hint">
              💡 {{ recalled.sameAmount ? 'เคยบันทึกยอดนี้กับรายการนี้แล้ว' : 'เคยบันทึกรายการนี้มาก่อน' }}
              เติมหมวด{{ recalled.note ? 'และรายละเอียด' : '' }}ให้ตามครั้งก่อน แก้ได้ก่อนบันทึก
            </p>
            <p v-if="deductionReceipt" class="small muted mb-2" data-test="deduction-receipt-hint">
              🧾 ใบเสร็จ{{ deductionReceipt.label }} — ตอนยื่นภาษีระบบดึงไปเป็นค่าลดหย่อนให้อัตโนมัติ
              {{ deductionReceipt.categoryKey === 'savingInvest' ? 'และจดลงหน้ากองทุนลดหย่อนเพื่อติดตามวันที่ขายได้' : '' }}
            </p>

            </template>

            <button class="btn btn-primary btn-block" type="submit" :disabled="saving">
              {{ saving ? 'กำลังบันทึก...' : multi.length ? `บันทึก ${multi.length} รายการ` : 'บันทึก' }}
            </button>
          </form>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.multi-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.multi-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.multi-type {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bad) 14%, transparent);
  color: var(--bad);
}
.multi-type.income {
  background: color-mix(in srgb, var(--ok) 14%, transparent);
  color: var(--ok);
}
.multi-note {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
