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
import { guessCategory } from '@/services/ledgerCsv'
import type { RecipientType, SlipMeta } from '@/services/ledgerEngine'
import { parseQuickEntry } from '@/services/quickParse'
import {
  bangkokToday,
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

/* ---------- พิมพ์เป็นประโยค ---------- */

const parsed = computed(() =>
  workspace.value && sentence.value.trim() ? parseQuickEntry(sentence.value, workspace.value.mode, localToday()) : null,
)

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
})

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

async function pickReceipt(files: FileList | null) {
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
    const [{ readImageText }, { parseReceipt }] = await Promise.all([
      import('@/services/certificateReader'),
      import('@/services/receiptParse'),
    ])
    const text = await readImageText(file, (status, progress) => {
      readStatus.value = `${status} ${Math.round(progress * 100)}%`
    })
    const guess = parseReceipt(text, localToday())
    sentence.value = ''
    form.type = 'expense'
    if (guess.amount) form.amount = guess.amount
    if (guess.date) form.date = guess.date
    if (guess.merchant) form.note = guess.merchant
    const key = guessCategory(guess.merchant, 'expense', workspace.value.mode)
    void nextTick(() => {
      if (key !== 'otherExpense') form.categoryKey = key
    })
    if (guess.amount) toast.success('อ่านใบเสร็จแล้ว ตรวจยอดก่อนบันทึกนะ')
    else toast.error('หายอดรวมในใบเสร็จไม่เจอ กรอกยอดเองได้ รูปจะแนบเป็นหลักฐานให้')
  } catch {
    toast.error('อ่านรูปไม่สำเร็จ — ครั้งแรกต้องต่ออินเทอร์เน็ตเพื่อโหลดตัวอ่านภาษาไทย รูปยังแนบเป็นหลักฐานได้')
  } finally {
    reading.value = false
  }
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
}

async function pickSlip(files: FileList | null) {
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
    const result = parseSlip(ocr.lines, [auth.user?.fullName ?? ''], bangkokToday())
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
    if (result.review.length || !result.direction) toast.push('อ่านสลิปแล้ว มีบางช่องต้องตรวจก่อนบันทึก')
    else toast.success('อ่านสลิปแล้ว ตรวจข้อมูลก่อนบันทึกนะ')
  } catch {
    toast.error('อ่านรูปไม่สำเร็จ — ครั้งแรกต้องต่ออินเทอร์เน็ตเพื่อโหลดตัวอ่านภาษาไทย รูปยังแนบเป็นหลักฐานได้')
  } finally {
    reading.value = false
  }
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
    const { compressImage } = await import('@/services/imageCompress')
    const { blob } = await compressImage(file)
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
  }
})

async function prepare() {
  form.date = localToday()
  sentence.value = ui.quickAddText
  ui.quickAddText = ''
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
  sentenceInput.value?.focus()
}

function close() {
  open.value = false
}

async function save() {
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
    const created = await api.addEntry(workspace.value.id, {
      date: form.date,
      type: form.type,
      categoryKey: form.categoryKey,
      amount: form.amount,
      note: form.note,
      ...(slipMeta.value ? { slip: slipMeta.value } : {}),
    })
    ledger.receiveEntry(created)
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
        (attached ? ` พร้อมรูป${attachedLabel}` : ''),
    )
    fx.entrySaved(form.type, form.amount)
    form.amount = 0
    form.note = ''
    sentence.value = ''
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
              <label for="q-sentence">พิมพ์สั้น ๆ</label>
              <input
                id="q-sentence"
                ref="sentenceInput"
                v-model="sentence"
                type="text"
                autocomplete="off"
                placeholder="เช่น กาแฟ 65 · ค่าไฟ 1,200 เมื่อวาน · +30000 เงินเดือน"
              />
              <p class="hint" aria-live="polite">
                <template v-if="parsed && workspace">
                  {{ parsed.type === 'income' ? 'รายรับ' : 'รายจ่าย' }} {{ formatBaht(parsed.amount) }} ·
                  {{ categoryLabel(workspace.mode, form.categoryKey) }} · {{ thaiDate(parsed.date) }}
                </template>
                <template v-else-if="sentence.trim()">ยังไม่เจอจำนวนเงิน ใส่ตัวเลขด้วย เช่น "ข้าว 60"</template>
                <template v-else>หรือกรอกช่องด้านล่างเองก็ได้</template>
              </p>
            </div>

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
              <small v-if="receiptFile && !reading" class="muted">📎 แนบ {{ receiptFile.name }} เป็นหลักฐาน</small>
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
                <template v-if="typeConfirmed && slip.direction">
                  เป็น{{ slip.direction === 'income' ? 'รายรับ' : 'รายจ่าย' }} เพราะ{{ slip.directionReason }}
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
            </div>

            <button class="btn btn-primary btn-block" type="submit" :disabled="saving">
              {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
            </button>
          </form>
        </section>
      </div>
    </Transition>
  </div>
</template>
