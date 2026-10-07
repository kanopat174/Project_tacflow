<script setup lang="ts">
/**
 * นำเข้า statement ธนาคาร (CSV) เข้าสมุดที่เปิดอยู่
 * แสดงตัวอย่างให้ตรวจและแก้หมวดก่อนเสมอ รายการที่น่าจะซ้ำกับที่มีอยู่ไม่ถูกเลือกไว้ตั้งแต่แรก
 */
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { categoriesOf } from '@/data/workspaceModes'
import { ApiError } from '@/services/api'
import { importStatement, type ImportedRow } from '@/services/ledgerCsv'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'
import { useFx } from '@/composables/useFx'

const emit = defineEmits<{ close: [] }>()

const ledger = useLedgerStore()
const toast = useToastStore()
const fx = useFx()

const MAX_FILE_BYTES = 5 * 1024 * 1024

const rows = ref<(ImportedRow & { include: boolean })[]>([])
const skipped = ref<{ line: number; reason: string }[]>([])
const fileName = ref('')
const saving = ref(false)
const input = ref<HTMLInputElement | null>(null)

const selected = computed(() => rows.value.filter((r) => r.include))
const totals = computed(() => ({
  income: selected.value.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0),
  expense: selected.value.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0),
}))
const duplicates = computed(() => rows.value.filter((r) => r.duplicate).length)

async function pick(files: FileList | null) {
  const file = files?.[0]
  if (input.value) input.value.value = ''
  if (!file) return
  if (file.size > MAX_FILE_BYTES) {
    toast.error('ไฟล์ใหญ่เกิน 5 MB')
    return
  }
  const text = await file.text()
  const result = importStatement(text, ledger.mode, ledger.entries)
  if (result.error) {
    toast.error(result.error)
    return
  }
  fileName.value = file.name
  rows.value = result.rows.map((r) => ({ ...r, include: !r.duplicate }))
  skipped.value = result.skipped
}

async function save() {
  saving.value = true
  try {
    const count = await ledger.addEntries(
      selected.value.map((r) => ({
        date: r.date,
        type: r.type,
        categoryKey: r.categoryKey,
        amount: r.amount,
        note: r.note,
      })),
    )
    toast.success(`นำเข้าแล้ว ${count} รายการ`)
    fx.entriesImported(count)
    rows.value = []
    emit('close')
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'นำเข้าไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="card">
    <div class="card-head">
      <div>
        <h3>
          <AppIcon name="upload" :size="19" />
          นำเข้า statement ธนาคาร
        </h3>
        <p>ไฟล์ CSV จากแอปหรือเว็บธนาคาร ระบบเดาคอลัมน์และจัดหมวดให้ ตรวจแล้วค่อยกดบันทึก</p>
      </div>
      <button class="btn btn-ghost btn-sm" type="button" @click="emit('close')">ปิด</button>
    </div>

    <label class="btn btn-ghost">
      <AppIcon name="folder" :size="17" />
      {{ fileName ? 'เลือกไฟล์อื่น' : 'เลือกไฟล์ CSV' }}
      <input ref="input" type="file" accept=".csv,text/csv,text/plain" class="sr-only" @change="pick(($event.target as HTMLInputElement).files)" />
    </label>
    <span v-if="fileName" class="small muted"> {{ fileName }}</span>

    <template v-if="rows.length">
      <div v-if="duplicates" class="notice notice-warn mt-2">
        <strong>พบ {{ duplicates }} รายการที่น่าจะมีอยู่แล้ว</strong>
        วันที่ ประเภท และยอดตรงกับรายการในสมุด จึงไม่ได้เลือกไว้ ติ๊กเองได้ถ้าเป็นคนละรายการ
      </div>

      <div class="table-wrap mt-2">
        <table>
          <thead>
            <tr>
              <th><span class="sr-only">เลือก</span></th>
              <th>วันที่</th>
              <th>รายละเอียด</th>
              <th>หมวด</th>
              <th class="right">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.line" :class="{ 'muted': !row.include }">
              <td><input v-model="row.include" type="checkbox" :aria-label="`เลือกแถวที่ ${row.line}`" /></td>
              <td class="nowrap">{{ thaiDate(row.date) }}</td>
              <td>{{ row.note || '-' }}</td>
              <td>
                <select v-model="row.categoryKey" :aria-label="`หมวดของแถวที่ ${row.line}`">
                  <option v-for="c in categoriesOf(ledger.mode, row.type)" :key="c.key" :value="c.key">{{ c.label }}</option>
                </select>
              </td>
              <td class="money" :class="row.type === 'income' ? 'text-ok' : 'text-bad'">
                {{ row.type === 'income' ? '+' : '−' }}{{ formatBaht(row.amount) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="skipped.length" class="small muted mt-1">
        ข้าม {{ skipped.length }} แถว:
        {{ skipped.slice(0, 5).map((s) => `แถว ${s.line} (${s.reason})`).join(', ') }}{{ skipped.length > 5 ? ' …' : '' }}
      </p>

      <div class="row mt-2" style="justify-content: space-between; flex-wrap: wrap; gap: 8px">
        <span class="small">
          เลือก {{ selected.length }} รายการ · รับ {{ formatBaht(totals.income) }} · จ่าย {{ formatBaht(totals.expense) }}
        </span>
        <button class="btn btn-primary" type="button" :disabled="saving || !selected.length" @click="save">
          บันทึก {{ selected.length }} รายการ
        </button>
      </div>
    </template>
  </section>
</template>
