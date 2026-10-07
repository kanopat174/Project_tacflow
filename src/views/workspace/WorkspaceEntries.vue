<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import {
  ACCEPTED_EVIDENCE_TYPES,
  EVIDENCE_KINDS,
  MAX_EVIDENCE_BYTES,
  type EvidenceKind,
} from '@/data/evidenceTypes'
import { compressImage, formatBytes } from '@/services/imageCompress'
import MoneyField from '@/components/MoneyField.vue'
import StagedFileList from '@/components/StagedFileList.vue'
import StatementImport from '@/components/StatementImport.vue'
import { downloadText, safeFilename } from '@/services/download'
import { entriesToCsv } from '@/services/ledgerCsv'
import { categoriesOf, categoryLabel, type EntryType } from '@/data/workspaceModes'
import { ApiError, type EntryRecord } from '@/services/api'
import {
  EMPTY_FILTER,
  filterEntries,
  isFilterActive,
  type EntryFilter,
} from '@/services/ledgerEngine'
import { formatBaht, roundMoney, thaiDate } from '@/services/taxEngine'
import { localToday, useLedgerStore } from '@/stores/ledger'
import { UNDO_WINDOW_MS, useToastStore } from '@/stores/toast'
import { useFx } from '@/composables/useFx'

const ledger = useLedgerStore()
const toast = useToastStore()
const fx = useFx()

const today = localToday()
const saving = ref(false)

/* ---------- ค้นหาและกรอง ---------- */

const filter = reactive<EntryFilter>({ ...EMPTY_FILTER })
const showFilters = ref(false)
const filterCategories = computed(() =>
  filter.type === 'all' ? categoriesOf(ledger.mode) : categoriesOf(ledger.mode, filter.type),
)

function clearFilters() {
  Object.assign(filter, { ...EMPTY_FILTER, type: filter.type, sort: filter.sort })
}

/* ไฟล์ที่เลือกไว้จะถูกแนบหลังจากบันทึกรายการสำเร็จ เพราะต้องรู้ id ของรายการก่อน */
const pendingFiles = ref<File[]>([])
const evidenceKind = ref<EvidenceKind>('receipt')
const evidenceInput = ref<HTMLInputElement | null>(null)

function pickFiles(files: FileList | null) {
  if (!files?.length) return
  for (const file of Array.from(files)) {
    if (!ACCEPTED_EVIDENCE_TYPES.includes(file.type)) {
      toast.error(`${file.name} — รองรับเฉพาะ JPG, PNG, WebP และ PDF`)
      continue
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      toast.error(`${file.name} — ไฟล์ใหญ่เกิน ${formatBytes(MAX_EVIDENCE_BYTES)}`)
      continue
    }
    pendingFiles.value.push(file)
  }
  if (evidenceInput.value) evidenceInput.value.value = ''
}

function dropPending(index: number) {
  pendingFiles.value.splice(index, 1)
}

/* บันทึกรายการที่มีไฟล์แนบต้องผ่านการยืนยันก่อน เหมือนหน้าหลักฐาน */
const showConfirm = ref(false)
const pendingSize = computed(() => pendingFiles.value.reduce((sum, f) => sum + f.size, 0))

function requestSubmit() {
  if (form.amount <= 0) {
    toast.error('จำนวนเงินต้องมากกว่า 0')
    return
  }
  if (pendingFiles.value.length > 0) {
    showConfirm.value = true
    return
  }
  submit()
}

const form = reactive({
  date: today,
  type: 'expense' as EntryType,
  categoryKey: '',
  amount: 0,
  note: '',
  withholdingTax: 0,
  vatAmount: 0,
  symbol: '',
})

const categories = computed(() => categoriesOf(ledger.mode, form.type))

// เปลี่ยนประเภทแล้วหมวดเดิมอาจไม่มีอยู่ในรายการใหม่ ต้องรีเซ็ตให้เป็นตัวแรกเสมอ
const currentCategory = computed({
  get: () => {
    const valid = categories.value.some((c) => c.key === form.categoryKey)
    return valid ? form.categoryKey : (categories.value[0]?.key ?? '')
  },
  set: (value: string) => {
    form.categoryKey = value
  },
})

const visible = computed(() => filterEntries(ledger.entries, filter, labelOf))

/** ยอดรวมของผลการค้นหา แสดงเฉพาะตอนกรองอยู่ ผู้ใช้จะได้รู้ว่าหมวดหรือช่วงที่เลือกใช้ไปเท่าไร */
const filteredTotal = computed(() => {
  let income = 0
  let expense = 0
  for (const e of visible.value) {
    if (e.type === 'income') income += Number(e.amount) || 0
    else expense += Number(e.amount) || 0
  }
  return { income: roundMoney(income), expense: roundMoney(expense) }
})

/* ---------- แก้ไขรายการ ---------- */

/** id ของรายการที่กำลังแก้ — null คือฟอร์มอยู่ในโหมดเพิ่มรายการใหม่ */
const editingId = ref<string | null>(null)

function startEdit(row: EntryRecord) {
  editingId.value = row.id
  pendingFiles.value = []
  repeatMonthly.value = false
  Object.assign(form, {
    date: row.date,
    type: row.type,
    categoryKey: row.categoryKey,
    amount: row.amount,
    note: row.note,
    withholdingTax: row.withholdingTax ?? 0,
    vatAmount: row.vatAmount ?? 0,
    symbol: row.symbol ?? '',
  })
}

function cancelEdit() {
  editingId.value = null
  resetAmounts()
}

function resetAmounts() {
  // คงวันที่และประเภทไว้ เพราะคนมักบันทึกหลายรายการต่อกัน
  form.amount = 0
  form.note = ''
  form.withholdingTax = 0
  form.vatAmount = 0
  form.symbol = ''
}

/* ---------- รายการประจำ ---------- */

const repeatMonthly = ref(false)

function nextMonthOf(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number]
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function removeRecurring(id: string) {
  if (!confirm('หยุดรายการประจำนี้? รายการที่สร้างไปแล้วยังอยู่ในสมุดตามเดิม')) return
  try {
    await ledger.removeRecurring(id)
    toast.success('หยุดรายการประจำแล้ว')
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'ลบไม่สำเร็จ')
  }
}

const features = computed(() => ledger.definition.features)

async function submit() {
  showConfirm.value = false
  if (form.amount <= 0) {
    toast.error('จำนวนเงินต้องมากกว่า 0')
    return
  }
  saving.value = true
  try {
    const payload = {
      date: form.date,
      type: form.type,
      categoryKey: currentCategory.value,
      amount: form.amount,
      note: form.note,
      ...(features.value.withholdingTax && form.withholdingTax > 0
        ? { withholdingTax: form.withholdingTax }
        : {}),
      ...(features.value.vat && form.vatAmount > 0 ? { vatAmount: form.vatAmount } : {}),
      ...(features.value.tradingStats && form.symbol.trim()
        ? { symbol: form.symbol.trim().toUpperCase() }
        : {}),
    }

    if (editingId.value) {
      await ledger.updateEntry(editingId.value, payload)
      toast.success('แก้ไขรายการแล้ว หลักฐานที่แนบไว้ยังอยู่ครบ')
      editingId.value = null
      resetAmounts()
      return
    }

    // แนบหลักฐานกับรายการที่เพิ่งบันทึกจริง ๆ — เดิมหยิบรายการแรกของรายการทั้งหมด
    // ซึ่งผิดเมื่อบันทึกย้อนวันที่ เพราะรายการเรียงตามวันที่ ไม่ใช่ลำดับที่บันทึก
    const created = await ledger.addEntry(payload)

    if (repeatMonthly.value) {
      await ledger.addRecurring({
        type: payload.type,
        categoryKey: payload.categoryKey,
        amount: payload.amount,
        note: payload.note,
        dayOfMonth: Number(form.date.slice(8, 10)),
        // เดือนนี้บันทึกไปแล้วด้วยรายการนี้ เริ่มสร้างให้ตั้งแต่เดือนถัดไป
        startMonth: nextMonthOf(form.date),
        lastMonth: '',
      })
      repeatMonthly.value = false
    }

    let attached = 0
    for (const file of pendingFiles.value) {
      const { blob } = await compressImage(file)
      try {
        await ledger.addEvidence(
          {
            entryId: created?.id ?? null,
            date: form.date,
            direction: form.type,
            kind: evidenceKind.value,
            name: file.name,
            size: blob.size,
            mimeType: blob.type || file.type,
            note: form.note,
          },
          blob,
        )
        attached += 1
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : `แนบ ${file.name} ไม่สำเร็จ`)
      }
    }

    toast.success(attached > 0 ? `บันทึกรายการและแนบหลักฐาน ${attached} ไฟล์` : 'บันทึกรายการแล้ว')
    fx.entrySaved(created?.type ?? payload.type, created?.amount ?? payload.amount)
    resetAmounts()
    pendingFiles.value = []
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

function remove(id: string) {
  if (editingId.value === id) cancelEdit()
  const undo = ledger.removeEntryLater(id, UNDO_WINDOW_MS)
  fx.deleted()
  toast.undoable('ลบรายการแล้ว', () => {
    undo()
    fx.undone()
    toast.success('เอารายการกลับมาแล้ว')
  })
}

function labelOf(key: string): string {
  return categoryLabel(ledger.mode, key)
}

/* ---------- ส่งออกและนำเข้า CSV ---------- */

const showImport = ref(false)

/** ส่งออกตามตัวกรองที่ใช้อยู่ — ไม่กรองอะไรก็ได้ทุกรายการ */
function exportCsv() {
  if (!visible.value.length) {
    toast.error('ไม่มีรายการให้ส่งออก')
    return
  }
  const name = safeFilename(`${ledger.active?.name ?? 'สมุดบัญชี'}-${today}`)
  downloadText(`${name}.csv`, entriesToCsv(visible.value, ledger.mode), 'text/csv')
  toast.success(`ส่งออก ${visible.value.length} รายการแล้ว`)
}
</script>

<template>
  <div class="work-layout">
    <div>
      <div class="row mb-2 no-print" style="gap: 8px; flex-wrap: wrap">
        <button class="btn btn-ghost btn-sm" type="button" @click="exportCsv">
          <AppIcon name="download" :size="15" />
          ส่งออก CSV{{ isFilterActive(filter) || filter.type !== 'all' ? ' (ตามตัวกรอง)' : '' }}
        </button>
        <button class="btn btn-ghost btn-sm" type="button" @click="showImport = !showImport">
          <AppIcon name="upload" :size="15" />
          นำเข้า statement ธนาคาร
        </button>
      </div>
      <StatementImport v-if="showImport" @close="showImport = false" />

      <section class="card">
        <div class="card-head">
          <div>
            <h3>รายการทั้งหมด</h3>
            <p>{{ visible.length }} จาก {{ ledger.entries.length }} รายการ</p>
          </div>
          <div class="chip-row">
            <button
              v-for="option in [
                { value: 'all', label: 'ทั้งหมด' },
                { value: 'income', label: 'รายรับ' },
                { value: 'expense', label: 'รายจ่าย' },
              ]"
              :key="option.value"
              type="button"
              class="chip"
              :class="{ selected: filter.type === option.value }"
              @click="((filter.type = option.value as 'all' | EntryType), (filter.categoryKey = ''))"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <!-- ค้นหา + ตัวกรองละเอียด -->
        <div class="entry-search">
          <div class="search-box">
            <AppIcon name="search" :size="17" />
            <input
              v-model="filter.query"
              type="search"
              placeholder="ค้นจากรายละเอียดหรือชื่อหมวด"
              aria-label="ค้นหารายการ"
            />
          </div>
          <button
            class="btn btn-ghost btn-sm"
            type="button"
            :aria-expanded="showFilters"
            @click="showFilters = !showFilters"
          >
            ตัวกรอง{{ isFilterActive(filter) && !filter.query ? ' •' : '' }}
          </button>
        </div>
        <div v-if="showFilters" class="filter-grid">
          <div class="field">
            <label for="f-cat">หมวด</label>
            <select id="f-cat" v-model="filter.categoryKey">
              <option value="">ทุกหมวด</option>
              <option v-for="c in filterCategories" :key="c.key" :value="c.key">{{ c.label }}</option>
            </select>
          </div>
          <div class="field">
            <label for="f-from">ตั้งแต่วันที่</label>
            <input id="f-from" v-model="filter.from" type="date" />
          </div>
          <div class="field">
            <label for="f-to">ถึงวันที่</label>
            <input id="f-to" v-model="filter.to" type="date" />
          </div>
          <div class="field">
            <label for="f-sort">เรียงตาม</label>
            <select id="f-sort" v-model="filter.sort">
              <option value="date-desc">วันที่ ใหม่ → เก่า</option>
              <option value="date-asc">วันที่ เก่า → ใหม่</option>
              <option value="amount-desc">จำนวนเงิน มาก → น้อย</option>
              <option value="amount-asc">จำนวนเงิน น้อย → มาก</option>
            </select>
          </div>
        </div>
        <div v-if="isFilterActive(filter)" class="filter-summary">
          <span>
            ผลการค้นหา: รายรับ <strong class="text-ok">{{ formatBaht(filteredTotal.income) }}</strong>
            · รายจ่าย <strong class="text-bad">{{ formatBaht(filteredTotal.expense) }}</strong>
          </span>
          <button class="btn btn-ghost btn-sm" type="button" @click="clearFilters">ล้างตัวกรอง</button>
        </div>

        <div v-if="!ledger.entries.length" class="empty-state">
          <span class="ico-big"><AppIcon name="receipt" :size="24" /></span>
          <h3>ยังไม่มีรายการ</h3>
          <p>ใช้ฟอร์มด้านขวาเพื่อบันทึกรายรับหรือรายจ่ายรายการแรก</p>
        </div>
        <div v-else-if="!visible.length" class="empty-state">
          <span class="ico-big"><AppIcon name="search" :size="24" /></span>
          <h3>ไม่พบรายการที่ตรงกับการค้นหา</h3>
          <p>ลองเปลี่ยนคำค้นหรือล้างตัวกรอง</p>
        </div>

        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>หมวด</th>
                <th>รายละเอียด</th>
                <th class="right">จำนวนเงิน</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visible" :key="row.id" :class="{ editing: editingId === row.id }">
                <td class="num">{{ thaiDate(row.date) }}</td>
                <td>
                  <span class="badge" :class="row.type === 'income' ? 'badge-ok' : 'badge-muted'">
                    {{ labelOf(row.categoryKey) }}
                  </span>
                </td>
                <td>
                  {{ row.note || '-' }}
                  <span v-if="row.recurringId" class="badge badge-muted" style="margin-left: 6px">ประจำ</span>
                  <span v-if="row.symbol" class="badge badge-accent" style="margin-left: 6px">
                    {{ row.symbol }}
                  </span>
                  <p v-if="row.withholdingTax" class="muted small">
                    หัก ณ ที่จ่าย {{ formatBaht(row.withholdingTax) }}
                  </p>
                  <p v-if="row.vatAmount" class="muted small">
                    ภาษีมูลค่าเพิ่ม {{ formatBaht(row.vatAmount) }}
                  </p>
                  <RouterLink
                    v-if="ledger.evidenceCounts.get(row.id)"
                    class="evidence-count"
                    :to="`/workspace/${ledger.active?.id}/evidence`"
                  >
                    <AppIcon name="folder" :size="13" />
                    หลักฐาน {{ ledger.evidenceCounts.get(row.id) }} ไฟล์
                  </RouterLink>
                </td>
                <td class="money" :class="row.type === 'income' ? 'text-ok' : 'text-bad'">
                  {{ row.type === 'income' ? '+' : '−' }} {{ formatBaht(row.amount) }}
                </td>
                <td class="row-actions">
                  <button
                    class="btn btn-ghost btn-sm"
                    type="button"
                    :aria-label="`แก้ไขรายการ ${labelOf(row.categoryKey)} วันที่ ${thaiDate(row.date)}`"
                    :aria-pressed="editingId === row.id"
                    @click="startEdit(row)"
                  >
                    <AppIcon name="edit" :size="15" />
                  </button>
                  <button
                    class="btn btn-danger btn-sm"
                    type="button"
                    :aria-label="`ลบรายการ ${labelOf(row.categoryKey)} วันที่ ${thaiDate(row.date)}`"
                    @click="remove(row.id)"
                  >
                    <AppIcon name="trash" :size="15" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <aside class="card entry-form" :class="{ editing: editingId }" style="position: sticky; top: 88px">
      <div class="card-head">
        <div>
          <h3>{{ editingId ? 'แก้ไขรายการ' : 'บันทึกรายการใหม่' }}</h3>
          <p>
            {{ editingId ? 'หลักฐานที่แนบไว้กับรายการนี้ยังอยู่ครบหลังแก้ไข' : `หมวดจะเปลี่ยนตามโหมด${ledger.definition.label}` }}
          </p>
        </div>
        <button v-if="editingId" class="btn btn-ghost btn-sm" type="button" @click="cancelEdit">ยกเลิก</button>
      </div>

      <form novalidate @submit.prevent="requestSubmit">
        <div class="chip-row mb-2" role="radiogroup" aria-label="ประเภทรายการ">
          <button
            type="button"
            class="chip"
            role="radio"
            :aria-checked="form.type === 'income'"
            :class="{ selected: form.type === 'income' }"
            @click="form.type = 'income'"
          >
            รายรับ
          </button>
          <button
            type="button"
            class="chip"
            role="radio"
            :aria-checked="form.type === 'expense'"
            :class="{ selected: form.type === 'expense' }"
            @click="form.type = 'expense'"
          >
            รายจ่าย
          </button>
        </div>

        <div class="field">
          <label for="e-date">วันที่</label>
          <input id="e-date" v-model="form.date" type="date" :max="today" />
        </div>

        <div class="field">
          <label for="e-cat">หมวด</label>
          <select id="e-cat" v-model="currentCategory">
            <option v-for="c in categories" :key="c.key" :value="c.key">{{ c.label }}</option>
          </select>
        </div>

        <MoneyField v-model="form.amount" label="จำนวนเงิน" />

        <MoneyField
          v-if="features.withholdingTax && form.type === 'income'"
          v-model="form.withholdingTax"
          label="ภาษีหัก ณ ที่จ่ายของรายการนี้"
          hint="ไม่บังคับ ใส่ตามหนังสือรับรอง 50 ทวิ"
        />

        <MoneyField
          v-if="features.vat"
          v-model="form.vatAmount"
          label="ภาษีมูลค่าเพิ่มของรายการนี้"
          hint="ไม่บังคับ"
        />

        <div v-if="features.tradingStats" class="field">
          <label for="e-symbol">สัญลักษณ์ที่เทรด</label>
          <input id="e-symbol" v-model="form.symbol" type="text" placeholder="เช่น BTCUSDT" />
        </div>

        <div class="field">
          <label for="e-note">รายละเอียด</label>
          <input id="e-note" v-model="form.note" type="text" placeholder="ไม่บังคับ" />
        </div>

        <label v-if="!editingId" class="check mb-2">
          <input v-model="repeatMonthly" type="checkbox" />
          <span>
            ทำซ้ำทุกเดือน วันที่ {{ Number(form.date.slice(8, 10)) || 1 }}
            <small class="muted">— ระบบบันทึกให้เองทุกเดือนตอนเปิดสมุด เหมาะกับเงินเดือน ค่าเช่า ค่าเน็ต</small>
          </span>
        </label>

        <div v-if="!editingId" class="field">
          <label>แนบหลักฐาน</label>
          <div class="chip-row mb-2" role="radiogroup" aria-label="หมวดหลักฐาน">
            <button
              v-for="k in EVIDENCE_KINDS"
              :key="k.value"
              type="button"
              class="chip"
              role="radio"
              :aria-checked="evidenceKind === k.value"
              :class="{ selected: evidenceKind === k.value }"
              @click="evidenceKind = k.value"
            >
              {{ k.label }}
            </button>
          </div>

          <button class="btn btn-ghost btn-block" type="button" @click="evidenceInput?.click()">
            <AppIcon name="upload" :size="17" />
            เลือกใบเสร็จหรือสลิป
          </button>
          <input
            ref="evidenceInput"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            class="hidden"
            @change="pickFiles(($event.target as HTMLInputElement).files)"
          />

          <StagedFileList
            :files="pendingFiles"
            @remove="dropPending"
            @clear="pendingFiles = []"
          />
          <p v-if="!pendingFiles.length" class="hint">
            ไม่บังคับ แนบได้หลายไฟล์ ภาพจะถูกย่อก่อนเก็บ
          </p>
        </div>

        <button class="btn btn-primary btn-block" type="submit" :disabled="saving">
          {{ saving ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'บันทึกรายการ' }}
        </button>
      </form>

      <!-- รายการประจำที่ตั้งไว้ -->
      <div v-if="ledger.recurring.length" class="recurring-list">
        <h4>รายการประจำ</h4>
        <ul>
          <li v-for="item in ledger.recurring" :key="item.id">
            <span>
              <strong>{{ labelOf(item.categoryKey) }}</strong>
              <small class="muted">
                ทุกวันที่ {{ item.dayOfMonth }} · {{ item.type === 'income' ? '+' : '−' }}{{ formatBaht(item.amount) }}
                {{ item.note ? `· ${item.note}` : '' }}
              </small>
            </span>
            <button
              class="btn btn-ghost btn-sm"
              type="button"
              :aria-label="`หยุดรายการประจำ ${labelOf(item.categoryKey)}`"
              @click="removeRecurring(item.id)"
            >
              หยุด
            </button>
          </li>
        </ul>
      </div>
    </aside>

    <!-- ยืนยันก่อนบันทึกรายการที่มีไฟล์แนบ -->
    <div v-if="showConfirm" class="modal-backdrop" @click.self="showConfirm = false">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="entry-confirm-title">
        <span class="ico-big"><AppIcon name="alert" :size="26" /></span>
        <h3 id="entry-confirm-title">ตรวจสอบก่อนบันทึก</h3>
        <p>รายการนี้จะถูกบันทึกพร้อมไฟล์แนบ ตรวจให้ตรงก่อนกดยืนยัน</p>

        <ul class="confirm-list">
          <li>
            <span class="k">รายการ</span>
            <span class="v">
              {{ form.type === 'income' ? 'รายรับ' : 'รายจ่าย' }}
              {{ formatBaht(form.amount) }}
            </span>
          </li>
          <li>
            <span class="k">วันที่</span>
            <span class="v">{{ thaiDate(form.date) }}</span>
          </li>
          <li>
            <span class="k">หมวด</span>
            <span class="v">{{ labelOf(currentCategory) }}</span>
          </li>
          <li>
            <span class="k">ไฟล์แนบ</span>
            <span class="v">
              {{ pendingFiles.length }} ไฟล์ · {{ formatBytes(pendingSize) }}
            </span>
          </li>
          <li>
            <span class="k">หมวดหลักฐาน</span>
            <span class="v">
              {{ EVIDENCE_KINDS.find((k) => k.value === evidenceKind)?.label }}
              ({{ form.type === 'income' ? 'หลักฐานการรับเงิน' : 'หลักฐานการจ่ายเงิน' }})
            </span>
          </li>
        </ul>

        <div class="notice notice-warn">
          <strong>ไฟล์เก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น</strong>
          ยังไม่ได้อัปโหลดขึ้นเซิร์ฟเวอร์ ถ้าล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่อง ไฟล์จะหายถาวร
          และภาพจะถูกย่อขนาดลงก่อนบันทึก
        </div>

        <div class="actions">
          <button class="btn btn-ghost" type="button" @click="showConfirm = false">
            กลับไปแก้ไข
          </button>
          <button class="btn btn-primary" type="button" :disabled="saving" @click="submit">
            ยืนยันบันทึก
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
