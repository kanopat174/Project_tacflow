<script setup lang="ts">
/**
 * "ภาษีของคุณมาจากไหน" — กราฟน้ำตกจากเงินได้ถึงเงินได้สุทธิ แล้วแตกตามขั้นภาษี
 * ทุกแท่งมีตัวเลขกำกับเป็นข้อความ จึงอ่านได้โดยไม่ต้องพึ่งสี และโปรแกรมอ่านหน้าจออ่านเป็นตารางได้
 */
import { computed } from 'vue'
import TermTip from './TermTip.vue'
import { taxBreakdown } from '@/services/taxBreakdown'
import { formatBaht, formatPercent, type TaxResult } from '@/services/taxEngine'
import { toTangible } from '@/services/tangible'

const props = defineProps<{ result: TaxResult }>()
const data = computed(() => taxBreakdown(props.result))
const scale = computed(() => props.result.grossIncome || 1)
const maxRate = computed(() => Math.max(0.05, ...(data.value?.brackets.map((b) => b.rate) ?? [0])))
const fun = computed(() => toTangible(props.result.tax, 1))

function pct(n: number): string {
  return `${Math.max(0, Math.min(100, (n / scale.value) * 100))}%`
}
/** ขั้นที่อัตราสูงกว่าเข้มกว่า — สีเดียวไล่อ่อนไปเข้ม */
function shade(rate: number): string {
  return `color-mix(in srgb, var(--accent) ${Math.round(25 + (rate / maxRate.value) * 75)}%, var(--surface-2))`
}
</script>

<template>
  <section v-if="data" class="card tax-waterfall">
    <div class="card-head">
      <div>
        <h3>ภาษีของคุณมาจากไหน</h3>
        <p>
          จากเงินทุก 100 บาทที่หาได้ เสียภาษี <b>{{ data.per100.toLocaleString('th-TH') }} บาท</b> ·
          ถ้าหาเพิ่มอีก 100 บาท จะเสียภาษีเพิ่ม <b>{{ data.marginalPer100 }} บาท</b>
        </p>
      </div>
    </div>

    <table class="wf-table">
      <caption class="sr-only">ขั้นตอนจากเงินได้พึงประเมินถึงเงินได้สุทธิ</caption>
      <tbody>
        <tr v-for="s in data.steps" :key="s.key" :class="s.kind">
          <th scope="row">
            {{ s.kind === 'minus' ? 'หัก ' : '' }}<TermTip v-if="s.term" :term="s.term">{{ s.label }}</TermTip><template v-else>{{ s.label }}</template>
          </th>
          <td class="wf-track" aria-hidden="true">
            <span
              class="wf-bar"
              :title="`${s.label} ${formatBaht(s.end - s.start)}`"
              :style="{ left: pct(s.start), width: pct(s.end - s.start) }"
            ></span>
          </td>
          <td class="money">{{ s.kind === 'minus' ? '− ' : '' }}{{ formatBaht(s.end - s.start) }}</td>
        </tr>
      </tbody>
    </table>

    <h4 class="mt-2">เงินได้สุทธิแต่ละก้อนเสียภาษีเท่าไร</h4>
    <table class="wf-table">
      <caption class="sr-only">ภาษีตามขั้นบันได</caption>
      <thead class="sr-only">
        <tr><th>ช่วงเงินได้</th><th>สัดส่วน</th><th>ภาษี</th></tr>
      </thead>
      <tbody>
        <tr v-for="b in data.brackets" :key="b.label">
          <th scope="row">
            {{ b.label }}
            <small class="muted"> · {{ formatPercent(b.rate, 0) }}</small>
          </th>
          <td class="wf-track" aria-hidden="true">
            <span
              class="wf-bar"
              :title="`${b.label}: เงินได้ ${formatBaht(b.amount)} เสียภาษี ${formatBaht(b.tax)}`"
              :style="{ left: 0, width: pct(b.amount), background: shade(b.rate) }"
            ></span>
          </td>
          <td class="money">{{ b.tax > 0 ? formatBaht(b.tax) : 'ไม่เสีย' }}</td>
        </tr>
        <tr class="total">
          <th scope="row">ภาษีทั้งปี</th>
          <td></td>
          <td class="money">{{ formatBaht(result.tax) }}</td>
        </tr>
      </tbody>
    </table>

    <p v-if="fun && result.tax > 0" class="small muted mt-1">
      {{ fun.item.emoji }} ภาษี {{ formatBaht(result.tax) }} เท่ากับ{{ fun.text }}
    </p>
  </section>
</template>

<style scoped>
/* กฎตารางทั่วไปตั้ง min-width: 560px ไว้สำหรับตารางที่เลื่อนได้ ตารางนี้ต้องพอดีการ์ด ไม่งั้นมือถือถูกซูมออก */
.wf-table {
  width: 100%;
  min-width: 0;
  border-collapse: separate;
  border-spacing: 0 6px;
}
.wf-table th {
  text-align: left;
  font-weight: 500;
  white-space: nowrap;
  padding-right: 10px;
  width: 1%;
}
.wf-table .money {
  white-space: nowrap;
  text-align: right;
  width: 1%;
  padding-left: 10px;
}
.wf-table tr.total th,
.wf-table tr.total .money {
  font-weight: 700;
}
.wf-track {
  position: relative;
  min-width: 80px;
  height: 18px;
  background: var(--surface-2);
  border-radius: 4px;
}
.wf-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 4px;
  background: var(--accent);
  min-width: 2px;
}
tr.minus .wf-bar {
  background: color-mix(in srgb, var(--accent) 35%, var(--surface-2));
}
@media (max-width: 560px) {
  .wf-table th {
    white-space: normal;
    width: 38%;
  }
  .wf-track {
    min-width: 40px;
  }
}
</style>
