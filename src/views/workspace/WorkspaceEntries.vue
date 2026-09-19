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
import { categoriesOf, categoryLabel, type EntryType } from '@/data/workspaceModes'
import { ApiError } from '@/services/api'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const ledger = useLedgerStore()
const toast = useToastStore()

const today = new Date().toISOString().slice(0, 10)
const saving = ref(false)
const filterType = ref<'all' | EntryType>('all')

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

const visible = computed(() =>
  filterType.value === 'all'
    ? ledger.entries
    : ledger.entries.filter((e) => e.type === filterType.value),
)

const features = computed(() => ledger.definition.features)

async function submit() {
  showConfirm.value = false
  if (form.amount <= 0) {
    toast.error('จำนวนเงินต้องมากกว่า 0')
    return
  }
  saving.value = true
  try {
    await ledger.addEntry({
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
    })
    // แนบหลักฐานต่อทันที โดยผูกกับรายการที่เพิ่งบันทึกและใช้วันที่เดียวกัน
    const created = ledger.entries[0]
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
    // คงวันที่และประเภทไว้ เพราะคนมักบันทึกหลายรายการต่อกัน
    form.amount = 0
    form.note = ''
    form.withholdingTax = 0
    form.vatAmount = 0
    form.symbol = ''
    pendingFiles.value = []
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

async function remove(id: string) {
  try {
    await ledger.removeEntry(id)
    toast.success('ลบรายการแล้ว')
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'ลบไม่สำเร็จ')
  }
}

function labelOf(key: string): string {
  return categoryLabel(ledger.mode, key)
}
</script>

<template>
  <div class="work-layout">
    <div>
      <section class="card">
        <div class="card-head">
          <div>
            <h3>รายการทั้งหมด</h3>
            <p>{{ visible.length }} รายการ</p>
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
              :class="{ selected: filterType === option.value }"
              @click="filterType = option.value as 'all' | EntryType"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div v-if="!visible.length" class="empty-state">
          <span class="ico-big"><AppIcon name="receipt" :size="24" /></span>
          <h3>ยังไม่มีรายการ</h3>
          <p>ใช้ฟอร์มด้านขวาเพื่อบันทึกรายรับหรือรายจ่ายรายการแรก</p>
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
              <tr v-for="row in visible" :key="row.id">
                <td class="num">{{ thaiDate(row.date) }}</td>
                <td>
                  <span class="badge" :class="row.type === 'income' ? 'badge-ok' : 'badge-muted'">
                    {{ labelOf(row.categoryKey) }}
                  </span>
                </td>
                <td>
                  {{ row.note || '-' }}
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
                <td>
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

    <aside class="card" style="position: sticky; top: 88px">
      <div class="card-head">
        <div>
          <h3>บันทึกรายการใหม่</h3>
          <p>หมวดจะเปลี่ยนตามโหมด{{ ledger.definition.label }}</p>
        </div>
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

        <div class="field">
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
          {{ saving ? 'กำลังบันทึก...' : 'บันทึกรายการ' }}
        </button>
      </form>
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
