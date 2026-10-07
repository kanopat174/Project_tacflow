<script setup lang="ts">
/**
 * อ่านหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) จาก PDF หรือรูปถ่าย แล้วเติมเงินได้ ภาษีที่ถูกหัก
 * และเงินสมทบกองทุนลงแบบ — อ่านในเครื่องทั้งหมด และให้ผู้ใช้ตรวจแก้ก่อนเติมเสมอ
 */
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { INCOME_CATEGORIES } from '@/data/taxData'
import { readCertificate } from '@/services/certificateReader'
import { formatBaht } from '@/services/taxEngine'
import { parseWithholdingCertificate, type CertificateFunds } from '@/services/withholdingCertificate'
import { useToastStore } from '@/stores/toast'

export interface CertificateApply {
  /** เงินได้แยกตามช่องในแบบ */
  income: Record<string, number>
  withholdingTax: number
  funds: CertificateFunds
  /** true = บวกเพิ่มจากยอดเดิม (หลายใบ), false = แทนที่ยอดเดิม */
  add: boolean
}

const emit = defineEmits<{ apply: [value: CertificateApply] }>()
const toast = useToastStore()

const MAX_BYTES = 15 * 1024 * 1024
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

const input = ref<HTMLInputElement | null>(null)
const reading = ref(false)
const status = ref('')
const progress = ref(0)
const fileName = ref('')
const method = ref<'pdf' | 'ocr'>('pdf')
const rows = ref<{ label: string; incomeKey: string; paid: number; tax: number; review: boolean }[]>([])
const funds = ref<CertificateFunds>({ socialSecurity: 0, providentFund: 0, gpf: 0 })
const mismatch = ref(false)
const payerTaxId = ref('')
const add = ref(true)
const parsed = ref(false)

const FUND_LABELS: { key: keyof CertificateFunds; label: string }[] = [
  { key: 'socialSecurity', label: 'เงินสมทบประกันสังคม' },
  { key: 'providentFund', label: 'กองทุนสำรองเลี้ยงชีพ' },
  { key: 'gpf', label: 'กบข. / กองทุนสงเคราะห์ครูฯ' },
]

const totals = computed(() => ({
  paid: rows.value.reduce((s, r) => s + (Number(r.paid) || 0), 0),
  tax: rows.value.reduce((s, r) => s + (Number(r.tax) || 0), 0),
}))

async function pick(files: FileList | null) {
  const file = files?.[0]
  if (input.value) input.value.value = ''
  if (!file) return
  if (!ACCEPT.split(',').includes(file.type)) {
    toast.error('รองรับ PDF, JPG, PNG และ WebP')
    return
  }
  if (file.size > MAX_BYTES) {
    toast.error('ไฟล์ใหญ่เกิน 15 MB')
    return
  }

  reading.value = true
  parsed.value = false
  fileName.value = file.name
  try {
    const result = await readCertificate(file, (s, p) => {
      status.value = s
      progress.value = p
    })
    method.value = result.method
    const r = parseWithholdingCertificate(result.text)
    rows.value = r.rows.map(({ label, incomeKey, paid, tax, review }) => ({ label, incomeKey, paid, tax, review }))
    funds.value = r.funds
    mismatch.value = r.mismatch
    payerTaxId.value = r.payerTaxId
    parsed.value = true
    if (!rows.value.length) toast.error('อ่านยอดเงินจากไฟล์นี้ไม่ได้ ลองถ่ายรูปให้ชัดและตรงขึ้น หรือใช้ไฟล์ PDF')
  } catch {
    toast.error('อ่านไฟล์ไม่สำเร็จ — ถ้าเป็นรูปครั้งแรกต้องต่ออินเทอร์เน็ตเพื่อโหลดตัวอ่านภาษาไทย')
  } finally {
    reading.value = false
  }
}

function addRow() {
  rows.value.push({ label: 'เพิ่มเอง', incomeKey: 'salary', paid: 0, tax: 0, review: false })
}

function apply() {
  const income: Record<string, number> = {}
  for (const r of rows.value) {
    const paid = Number(r.paid) || 0
    if (paid > 0) income[r.incomeKey] = (income[r.incomeKey] ?? 0) + paid
  }
  emit('apply', { income, withholdingTax: totals.value.tax, funds: { ...funds.value }, add: add.value })
  toast.success(add.value ? 'บวกยอดจาก 50 ทวิ เข้าแบบแล้ว' : 'ใส่ยอดจาก 50 ทวิ ในแบบแล้ว')
  parsed.value = false
  rows.value = []
}
</script>

<template>
  <section class="card import-panel">
    <div class="card-head">
      <div>
        <h3>
          <AppIcon name="camera" :size="19" />
          อ่านจากหนังสือรับรอง 50 ทวิ
        </h3>
        <p>
          เลือกไฟล์ PDF จากนายจ้างหรือถ่ายรูปใบ 50 ทวิ ระบบอ่านเงินได้ ภาษีที่ถูกหัก และเงินสมทบกองทุนให้
          อ่านในเครื่องนี้ ไฟล์ไม่ถูกส่งไปไหน
        </p>
      </div>
      <label class="btn btn-ghost btn-sm" :class="{ disabled: reading }">
        <AppIcon name="upload" :size="15" />
        {{ parsed ? 'อ่านใบอื่น' : 'เลือกไฟล์' }}
        <input ref="input" type="file" :accept="ACCEPT" class="sr-only" :disabled="reading" @change="pick(($event.target as HTMLInputElement).files)" />
      </label>
    </div>

    <div v-if="reading" class="notice" aria-live="polite">
      <strong>{{ status || 'กำลังอ่าน' }} {{ Math.round(progress * 100) }}%</strong>
      {{ fileName }}
    </div>

    <template v-if="parsed && (rows.length || funds.socialSecurity || funds.providentFund || funds.gpf)">
      <div v-if="method === 'ocr' || mismatch || rows.some((r) => r.review)" class="notice notice-warn mb-2">
        <strong>ตรวจตัวเลขกับใบจริงก่อนกดเติม</strong>
        <template v-if="method === 'ocr'">อ่านจากภาพอาจคลาดเคลื่อน </template>
        <template v-if="mismatch">· ผลรวมของแต่ละแถวไม่ตรงกับแถวรวมในใบ อาจอ่านบางแถวพลาด </template>
        <template v-if="rows.some((r) => r.review)">· แถวที่มีเครื่องหมาย ⚠ ต้องเลือกประเภทเงินได้ให้ถูก เช่น ค่าบริการฟรีแลนซ์อาจเป็น 40(2) หรือ 40(8)</template>
      </div>
      <p v-if="payerTaxId" class="small muted">เลขผู้เสียภาษีของผู้จ่ายเงิน {{ payerTaxId }}</p>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ประเภทในใบ</th>
              <th>เติมที่ช่อง</th>
              <th class="right">เงินที่จ่าย</th>
              <th class="right">ภาษีที่หัก</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rows" :key="i">
              <td>{{ row.review ? '⚠ ' : '' }}{{ row.label }}</td>
              <td>
                <select v-model="row.incomeKey" :aria-label="`ช่องเงินได้ของแถวที่ ${i + 1}`">
                  <option v-for="c in INCOME_CATEGORIES" :key="c.key" :value="c.key">{{ c.code }} {{ c.label }}</option>
                </select>
              </td>
              <td><input v-model.number="row.paid" type="number" min="0" step="0.01" class="right" :aria-label="`เงินที่จ่ายแถวที่ ${i + 1}`" /></td>
              <td><input v-model.number="row.tax" type="number" min="0" step="0.01" class="right" :aria-label="`ภาษีที่หักแถวที่ ${i + 1}`" /></td>
            </tr>
            <tr>
              <td colspan="2"><button class="btn btn-ghost btn-sm" type="button" @click="addRow">+ เพิ่มแถว</button></td>
              <td class="money"><b>{{ formatBaht(totals.paid) }}</b></td>
              <td class="money"><b>{{ formatBaht(totals.tax) }}</b></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="field-grid mt-2">
        <div v-for="f in FUND_LABELS" :key="f.key" class="field">
          <label :for="`cert-${f.key}`">{{ f.label }}</label>
          <input :id="`cert-${f.key}`" v-model.number="funds[f.key]" type="number" min="0" step="0.01" />
        </div>
      </div>

      <div class="row mt-2" style="justify-content: space-between; flex-wrap: wrap; gap: 8px">
        <label class="check">
          <input v-model="add" type="checkbox" />
          <span>บวกเพิ่มจากยอดเดิม (มีหลายใบ) — ไม่ติ๊กคือแทนที่ยอดเดิม</span>
        </label>
        <button class="btn btn-primary" type="button" @click="apply">
          เติมลงแบบ
          <AppIcon name="arrowRight" :size="16" />
        </button>
      </div>
    </template>
  </section>
</template>
