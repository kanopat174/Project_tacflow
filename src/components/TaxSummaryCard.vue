<script setup lang="ts">
/**
 * แผงสรุปผลคำนวณภาษี ใช้ร่วมกันระหว่างหน้าเครื่องคำนวณและหน้ายื่นแบบ
 *
 * จอแคบ (ไอแพดแนวตั้ง/มือถือ) แผงนี้ไปอยู่ท้ายฟอร์ม ระหว่างกรอกจึงมองไม่เห็นตัวเลข
 * เลยมีแถบสรุปเล็ก ๆ ลอยอยู่ล่างจอตอนที่แผงเต็มอยู่นอกจอ แตะแล้วเลื่อนไปที่แผง
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatBaht, formatPercent, type TaxResult } from '@/services/taxEngine'
import TermTip from './TermTip.vue'

const props = withDefaults(defineProps<{ result: TaxResult; showDisclaimer?: boolean }>(), {
  showDisclaimer: true,
})

const isRefund = computed(() => props.result.balance < 0)

const card = ref<HTMLElement | null>(null)
const cardVisible = ref(true)
const narrow = ref(false)
let observer: IntersectionObserver | null = null
let media: MediaQueryList | null = null
const onMedia = () => (narrow.value = Boolean(media?.matches))

onMounted(() => {
  // เท่ากับจุดที่ .work-layout ยุบเป็นคอลัมน์เดียว
  media = window.matchMedia?.('(max-width: 1000px)') ?? null
  onMedia()
  media?.addEventListener?.('change', onMedia)
  if (typeof IntersectionObserver === 'undefined' || !card.value) return
  observer = new IntersectionObserver(([entry]) => (cardVisible.value = Boolean(entry?.isIntersecting)))
  observer.observe(card.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  media?.removeEventListener?.('change', onMedia)
})

const showPeek = computed(() => narrow.value && !cardVisible.value && props.result.grossIncome > 0)

function scrollToCard() {
  card.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <aside ref="card" class="summary-card">
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
        <span class="lbl"><TermTip term="assessableIncome">เงินได้พึงประเมิน</TermTip></span>
        <span class="val">{{ formatBaht(result.grossIncome) }}</span>
      </div>
      <div v-if="result.exemptIncome > 0" class="price-line">
        <span class="lbl">หัก เงินได้ที่ได้รับยกเว้น</span>
        <span class="val">− {{ formatBaht(result.exemptIncome) }}</span>
      </div>
      <div class="price-line">
        <span class="lbl">หัก <TermTip term="expense">ค่าใช้จ่าย</TermTip></span>
        <span class="val">− {{ formatBaht(result.totalExpense) }}</span>
      </div>
      <div class="price-line">
        <span class="lbl">หัก <TermTip term="deduction">ค่าลดหย่อน</TermTip></span>
        <span class="val">− {{ formatBaht(result.usedDeduction) }}</span>
      </div>
      <p v-if="result.totalDeduction > result.usedDeduction" class="hint small">
        มีสิทธิลดหย่อน {{ formatBaht(result.totalDeduction) }} แต่หักได้ไม่เกินเงินได้ที่เหลือ
      </p>
      <div class="price-line total">
        <span class="lbl"><TermTip term="netIncome">เงินได้สุทธิ</TermTip></span>
        <span class="val">{{ formatBaht(result.netIncome) }}</span>
      </div>
      <div class="price-line">
        <span class="lbl">ภาษีตาม<TermTip term="progressive">ขั้นบันได</TermTip></span>
        <span class="val">{{ formatBaht(result.progressiveTax) }}</span>
      </div>
      <template v-if="result.minimumTax.applies">
        <div class="price-line">
          <span class="lbl"><TermTip term="minimumTax">ภาษีขั้นต่ำ 0.5%</TermTip> (มาตรา 48(2))</span>
          <span class="val">{{ formatBaht(result.minimumTax.tax) }}</span>
        </div>
        <div class="price-line total">
          <span class="lbl">ภาษีที่ต้องเสีย (ยอดที่สูงกว่า)</span>
          <span class="val">{{ formatBaht(result.tax) }}</span>
        </div>
      </template>
      <div class="price-line">
        <span class="lbl">หัก <TermTip term="withholding">ภาษี ณ ที่จ่าย</TermTip></span>
        <span class="val">− {{ formatBaht(result.withholdingTax) }}</span>
      </div>
      <div v-if="result.halfYearTaxPaid > 0" class="price-line">
        <span class="lbl">หัก ภาษีครึ่งปี (ภ.ง.ด.94)</span>
        <span class="val">− {{ formatBaht(result.halfYearTaxPaid) }}</span>
      </div>
      <div class="price-line">
        <span class="lbl"><TermTip term="effectiveRate">อัตราภาษีที่แท้จริง</TermTip></span>
        <span class="val">{{ formatPercent(result.effectiveRate) }}</span>
      </div>
      <div class="price-line">
        <span class="lbl"><TermTip term="marginalRate">ขั้นภาษีสูงสุดที่ถึง</TermTip></span>
        <span class="val">{{ formatPercent(result.marginalRate, 0) }}</span>
      </div>
    </div>

    <div v-if="showDisclaimer" class="notice mt-3">
      <strong>ตัวเลขนี้เป็นการประมาณการ</strong>
      ระบบคำนวณจากข้อมูลที่กรอกเท่านั้น ยังไม่รวมสิทธิพิเศษเฉพาะกรณีและมาตรการชั่วคราวของแต่ละปีภาษี
    </div>
  </aside>

  <Teleport to="body">
    <Transition name="peek">
      <button v-if="showPeek" type="button" class="summary-peek no-print" @click="scrollToCard">
        <span>{{ isRefund ? 'ยอดที่ขอคืนได้' : 'ภาษีที่ต้องชำระเพิ่ม' }}</span>
        <strong :class="{ refund: isRefund }">{{ formatBaht(Math.abs(result.balance)) }}</strong>
        <small>ดูรายละเอียด ↓</small>
      </button>
    </Transition>
  </Teleport>
</template>
