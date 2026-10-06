<script setup lang="ts">
/** แผงสรุปผลคำนวณภาษี ใช้ร่วมกันระหว่างหน้าเครื่องคำนวณและหน้ายื่นแบบ */
import { computed } from 'vue'
import { formatBaht, formatPercent, type TaxResult } from '@/services/taxEngine'

const props = withDefaults(defineProps<{ result: TaxResult; showDisclaimer?: boolean }>(), {
  showDisclaimer: true,
})

const isRefund = computed(() => props.result.balance < 0)
</script>

<template>
  <aside class="summary-card">
    <div class="row" style="justify-content: space-between">
      <span class="eyebrow" style="margin: 0">ประมาณการภาษี</span>
      <span class="live-dot">อัปเดตเรียลไทม์</span>
    </div>

    <div class="headline-amount" aria-live="polite" aria-atomic="true">
      <span>{{ isRefund ? 'ยอดที่ขอคืนได้' : 'ภาษีที่ต้องชำระเพิ่ม' }}</span>
      <strong :class="{ refund: isRefund }">{{ formatBaht(Math.abs(result.balance)) }}</strong>
    </div>

    <div class="price-lines">
      <div class="price-line">
        <span class="lbl">เงินได้พึงประเมิน</span>
        <span class="val">{{ formatBaht(result.grossIncome) }}</span>
      </div>
      <div v-if="result.exemptIncome > 0" class="price-line">
        <span class="lbl">หัก เงินได้ที่ได้รับยกเว้น</span>
        <span class="val">− {{ formatBaht(result.exemptIncome) }}</span>
      </div>
      <div class="price-line">
        <span class="lbl">หัก ค่าใช้จ่าย</span>
        <span class="val">− {{ formatBaht(result.totalExpense) }}</span>
      </div>
      <div class="price-line">
        <span class="lbl">หัก ค่าลดหย่อน</span>
        <span class="val">− {{ formatBaht(result.usedDeduction) }}</span>
      </div>
      <p v-if="result.totalDeduction > result.usedDeduction" class="hint small">
        มีสิทธิลดหย่อน {{ formatBaht(result.totalDeduction) }} แต่หักได้ไม่เกินเงินได้ที่เหลือ
      </p>
      <div class="price-line total">
        <span class="lbl">เงินได้สุทธิ</span>
        <span class="val">{{ formatBaht(result.netIncome) }}</span>
      </div>
      <div class="price-line">
        <span class="lbl">ภาษีตามขั้นบันได</span>
        <span class="val">{{ formatBaht(result.progressiveTax) }}</span>
      </div>
      <template v-if="result.minimumTax.applies">
        <div class="price-line">
          <span class="lbl">ภาษีขั้นต่ำ 0.5% (มาตรา 48(2))</span>
          <span class="val">{{ formatBaht(result.minimumTax.tax) }}</span>
        </div>
        <div class="price-line total">
          <span class="lbl">ภาษีที่ต้องเสีย (ยอดที่สูงกว่า)</span>
          <span class="val">{{ formatBaht(result.tax) }}</span>
        </div>
      </template>
      <div class="price-line">
        <span class="lbl">หัก ภาษี ณ ที่จ่าย</span>
        <span class="val">− {{ formatBaht(result.withholdingTax) }}</span>
      </div>
      <div v-if="result.halfYearTaxPaid > 0" class="price-line">
        <span class="lbl">หัก ภาษีครึ่งปี (ภ.ง.ด.94)</span>
        <span class="val">− {{ formatBaht(result.halfYearTaxPaid) }}</span>
      </div>
      <div class="price-line">
        <span class="lbl">อัตราภาษีที่แท้จริง</span>
        <span class="val">{{ formatPercent(result.effectiveRate) }}</span>
      </div>
      <div class="price-line">
        <span class="lbl">ขั้นภาษีสูงสุดที่ถึง</span>
        <span class="val">{{ formatPercent(result.marginalRate, 0) }}</span>
      </div>
    </div>

    <div v-if="showDisclaimer" class="notice mt-3">
      <strong>ตัวเลขนี้เป็นการประมาณการ</strong>
      ระบบคำนวณจากข้อมูลที่กรอกเท่านั้น ยังไม่รวมสิทธิพิเศษเฉพาะกรณีและมาตรการชั่วคราวของแต่ละปีภาษี
    </div>
  </aside>
</template>
