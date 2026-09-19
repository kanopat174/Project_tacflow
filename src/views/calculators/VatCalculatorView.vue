<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import TaxDocument, { type DocumentSection } from '@/components/TaxDocument.vue'
import {
  NON_CLAIMABLE_INPUT_VAT,
  VAT_FILING_NOTE,
  VAT_RATE,
  VAT_REGISTRATION_THRESHOLD,
  VAT_SUPPLY_TYPES,
} from '@/data/vatData'
import {
  addVat,
  calculateVatReturn,
  extractVat,
  mustRegisterForVat,
  type VatReturnInput,
} from '@/services/vatEngine'
import { formatBaht, formatPercent } from '@/services/taxEngine'

/* เครื่องมือย่อย: แยกหรือบวก VAT จากราคาเดียว */
const quickAmount = ref(1_070)
const quickMode = ref<'extract' | 'add'>('extract')
const quickResult = computed(() =>
  quickMode.value === 'extract' ? extractVat(quickAmount.value) : addVat(quickAmount.value),
)

/* แบบสรุปรายเดือน ภ.พ.30 */
const form = reactive<VatReturnInput>({
  standardSales: 0,
  zeroRatedSales: 0,
  exemptSales: 0,
  purchases: 0,
  nonClaimableInputVat: 0,
  creditCarriedForward: 0,
  rate: VAT_RATE,
})

const result = computed(() => calculateVatReturn(form))

/** ประมาณรายรับทั้งปีจากเดือนนี้ เพื่อเตือนเรื่องเกณฑ์จดทะเบียน */
const projectedAnnual = computed(() => result.value.taxableTurnover * 12)
const nearThreshold = computed(() => mustRegisterForVat(projectedAnnual.value))

const documentSections = computed<DocumentSection[]>(() => [
  {
    title: 'ยอดขายในรอบเดือน',
    rows: [
      { label: 'ขายที่ต้องเสียภาษีอัตราปกติ', value: formatBaht(form.standardSales) },
      { label: 'ขายอัตราศูนย์ เช่น ส่งออก', value: formatBaht(form.zeroRatedSales) },
      { label: 'ขายที่ได้รับยกเว้นภาษี', value: formatBaht(form.exemptSales) },
      { label: 'รวมยอดขาย', value: formatBaht(result.value.totalSales), strong: true },
    ],
  },
  {
    title: 'ภาษีขายและภาษีซื้อ',
    rows: [
      { label: `ภาษีขาย ${formatPercent(form.rate, 0)}`, value: formatBaht(result.value.outputVat), strong: true },
      { label: 'ภาษีซื้อจากใบกำกับภาษี', value: formatBaht(result.value.totalInputVat) },
      {
        label: 'หัก ภาษีซื้อต้องห้าม',
        value: `− ${formatBaht(form.nonClaimableInputVat)}`,
        muted: true,
      },
      { label: 'ภาษีซื้อที่หักได้', value: formatBaht(result.value.claimableInputVat), strong: true },
      {
        label: 'หัก เครดิตยกมาจากเดือนก่อน',
        value: `− ${formatBaht(result.value.creditCarriedForward)}`,
        muted: true,
      },
    ],
  },
  {
    title: 'สรุป',
    rows: [
      { label: 'ภาษีที่ต้องชำระ', value: formatBaht(result.value.payable), strong: true },
      { label: 'เครดิตยกไปเดือนถัดไป', value: formatBaht(result.value.creditToNextMonth) },
    ],
  },
])

function exportPdf() {
  window.print()
}
</script>

<template>
  <div>
    <div class="work-layout">
      <div>
        <!-- เครื่องมือเล็กที่คนเปิดหน้านี้มาใช้บ่อยที่สุด -->
        <section class="card">
          <div class="card-head">
            <div>
              <h3>แยกหรือบวกภาษีมูลค่าเพิ่มจากราคาเดียว</h3>
              <p>คำถามที่เจอบ่อยที่สุดเวลาออกใบเสนอราคาและใบกำกับภาษี</p>
            </div>
          </div>

          <div class="chip-row mb-2" role="radiogroup" aria-label="เลือกวิธีคำนวณ">
            <button
              class="chip"
              type="button"
              role="radio"
              :aria-checked="quickMode === 'extract'"
              :class="{ selected: quickMode === 'extract' }"
              @click="quickMode = 'extract'"
            >
              ราคารวม VAT แล้ว
            </button>
            <button
              class="chip"
              type="button"
              role="radio"
              :aria-checked="quickMode === 'add'"
              :class="{ selected: quickMode === 'add' }"
              @click="quickMode = 'add'"
            >
              ราคายังไม่รวม VAT
            </button>
          </div>

          <MoneyField
            v-model="quickAmount"
            :label="quickMode === 'extract' ? 'ราคารวมภาษีมูลค่าเพิ่ม' : 'ราคาก่อนภาษีมูลค่าเพิ่ม'"
          />

          <div class="price-lines mt-2">
            <div class="price-line">
              <span class="lbl">ราคาก่อนภาษี</span>
              <span class="val">{{ formatBaht(quickResult.net) }}</span>
            </div>
            <div class="price-line">
              <span class="lbl">ภาษีมูลค่าเพิ่ม {{ formatPercent(VAT_RATE, 0) }}</span>
              <span class="val">{{ formatBaht(quickResult.vat) }}</span>
            </div>
            <div class="price-line total">
              <span class="lbl">ราคารวมภาษี</span>
              <span class="val">{{ formatBaht(quickResult.gross) }}</span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>ยอดขายในรอบเดือน</h3>
              <p>กรอกยอดก่อนภาษีมูลค่าเพิ่ม แยกตามประเภทของรายการขาย</p>
            </div>
          </div>

          <div v-for="type in VAT_SUPPLY_TYPES" :key="type.key" class="rule-row">
            <span class="badge" :class="type.claimableInput ? 'badge-ok' : 'badge-warn'">
              {{ type.claimableInput ? 'ขอคืนภาษีซื้อได้' : 'ขอคืนภาษีซื้อไม่ได้' }}
            </span>
            <div>
              <strong>{{ type.label }}</strong>
              <p class="muted small">{{ type.hint }}</p>
            </div>
          </div>

          <div class="field-grid mt-2">
            <MoneyField v-model="form.standardSales" label="ขายที่ต้องเสียภาษีอัตราปกติ" />
            <MoneyField v-model="form.zeroRatedSales" label="ขายอัตราศูนย์ (ส่งออก)" />
            <MoneyField v-model="form.exemptSales" label="ขายที่ได้รับยกเว้นภาษี" />
          </div>

          <div v-if="nearThreshold" class="notice notice-warn">
            <strong>ถึงเกณฑ์จดทะเบียนภาษีมูลค่าเพิ่มแล้ว</strong>
            ถ้ารายรับเป็นแบบนี้ทั้งปีจะได้ประมาณ {{ formatBaht(projectedAnnual) }} ซึ่งเกิน
            {{ formatBaht(VAT_REGISTRATION_THRESHOLD) }} ต้องยื่นจดทะเบียนภายใน 30 วันนับแต่วันที่รายรับเกินเกณฑ์
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>ภาษีซื้อ</h3>
              <p>กรอกยอดซื้อก่อนภาษี จากใบกำกับภาษีที่ได้รับในเดือนนี้</p>
            </div>
          </div>

          <div class="field-grid">
            <MoneyField v-model="form.purchases" label="ยอดซื้อที่มีใบกำกับภาษี" />
            <MoneyField
              v-model="form.nonClaimableInputVat"
              label="ภาษีซื้อต้องห้าม"
              hint="กรอกเป็นจำนวนภาษี ไม่ใช่ยอดซื้อ"
            />
            <MoneyField
              v-model="form.creditCarriedForward"
              label="เครดิตภาษียกมาจากเดือนก่อน"
            />
          </div>

          <details class="mt-2">
            <summary class="muted small">ภาษีซื้อที่กฎหมายห้ามนำมาหัก</summary>
            <ul class="bullet-list mt-1">
              <li v-for="item in NON_CLAIMABLE_INPUT_VAT" :key="item">{{ item }}</li>
            </ul>
          </details>
        </section>

        <div class="actions-bar no-print">
          <RouterLink class="btn btn-ghost" to="/calculator">
            <AppIcon name="arrowLeft" :size="18" />
            เลือกหมวดอื่น
          </RouterLink>
          <button class="btn btn-primary" type="button" @click="exportPdf">
            <AppIcon name="download" :size="18" />
            บันทึกเป็น PDF
          </button>
        </div>
      </div>

      <aside class="summary-card">
        <div class="row" style="justify-content: space-between">
          <span class="eyebrow" style="margin: 0">สรุป ภ.พ.30</span>
          <span class="live-dot">อัปเดตเรียลไทม์</span>
        </div>

        <div class="headline-amount" aria-live="polite" aria-atomic="true">
          <span>{{ result.payable > 0 ? 'ภาษีที่ต้องชำระเดือนนี้' : 'เครดิตยกไปเดือนถัดไป' }}</span>
          <strong :class="{ refund: result.payable === 0 && result.creditToNextMonth > 0 }">
            {{ formatBaht(result.payable > 0 ? result.payable : result.creditToNextMonth) }}
          </strong>
        </div>

        <div class="price-lines">
          <div class="price-line">
            <span class="lbl">ภาษีขาย</span>
            <span class="val">{{ formatBaht(result.outputVat) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">หัก ภาษีซื้อที่หักได้</span>
            <span class="val">− {{ formatBaht(result.claimableInputVat) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">หัก เครดิตยกมา</span>
            <span class="val">− {{ formatBaht(result.creditCarriedForward) }}</span>
          </div>
          <div class="price-line total">
            <span class="lbl">ผลต่างสุทธิ</span>
            <span class="val">{{ formatBaht(result.balance) }}</span>
          </div>
        </div>

        <div class="notice mt-3">
          <strong>กำหนดเวลายื่น</strong>
          {{ VAT_FILING_NOTE }}
        </div>
      </aside>
    </div>

    <TaxDocument
      title="ใบสรุปภาษีมูลค่าเพิ่มประจำเดือน"
      subtitle="ประกอบการยื่นแบบ ภ.พ.30"
      :headline-label="result.payable > 0 ? 'ภาษีที่ต้องชำระ' : 'เครดิตยกไปเดือนถัดไป'"
      :headline-value="formatBaht(result.payable > 0 ? result.payable : result.creditToNextMonth)"
      :sections="documentSections"
      :note="VAT_FILING_NOTE"
    />
  </div>
</template>
