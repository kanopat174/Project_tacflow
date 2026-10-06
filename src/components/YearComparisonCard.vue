<script setup lang="ts">
/** กราฟแท่งเทียบเงินได้และภาษีรายปี พร้อมข้อสังเกต */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { compareYears, type YearFiling } from '@/services/yearComparison'
import { formatBaht, formatPercent } from '@/services/taxEngine'

const props = defineProps<{ filings: YearFiling[] }>()

const comparison = computed(() => compareYears(props.filings))
const maxIncome = computed(() => Math.max(1, ...comparison.value.rows.map((r) => r.grossIncome)))
const maxTax = computed(() => Math.max(1, ...comparison.value.rows.map((r) => r.tax)))

function changeText(value: number | null): string {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${(Math.abs(value) * 100).toFixed(1)}%`
}
</script>

<template>
  <section class="card year-compare">
    <div class="card-head">
      <div>
        <h3>
          <AppIcon name="chart" :size="19" />
          เทียบภาษีย้อนหลังรายปี
        </h3>
        <p>เงินได้ ภาษี และอัตราภาษีที่แท้จริงของแต่ละปีที่บันทึกไว้</p>
      </div>
      <div class="year-legend small muted">
        <span><i class="dot income"></i> เงินได้พึงประเมิน</span>
        <span><i class="dot tax"></i> ภาษี</span>
      </div>
    </div>

    <div class="year-bars" role="img" :aria-label="`กราฟเทียบเงินได้และภาษี ${comparison.rows.length} ปี`">
      <div
        v-for="row in comparison.rows"
        :key="row.taxYear"
        class="year-col"
        :class="{ best: row.taxYear === comparison.lowestRateYear }"
      >
        <div class="bars">
          <span
            class="bar income"
            :style="{ height: `${(row.grossIncome / maxIncome) * 100}%` }"
            :title="`เงินได้ ${formatBaht(row.grossIncome)}`"
          ></span>
          <span
            class="bar tax"
            :style="{ height: `${(row.tax / maxTax) * 100}%` }"
            :title="`ภาษี ${formatBaht(row.tax)}`"
          ></span>
        </div>
        <strong>{{ row.taxYear }}</strong>
        <span class="small muted">{{ formatPercent(row.effectiveRate) }}</span>
      </div>
    </div>

    <div class="table-wrap mt-2">
      <table>
        <thead>
          <tr>
            <th>ปีภาษี</th>
            <th class="right">เงินได้</th>
            <th class="right">ภาษี</th>
            <th class="right">อัตราแท้จริง</th>
            <th class="right">หักออกได้</th>
            <th class="right">ภาษีเทียบปีก่อน</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in comparison.rows" :key="row.taxYear">
            <td>
              {{ row.taxYear }}
              <span v-if="row.taxYear === comparison.lowestRateYear" class="badge badge-ok">คุ้มที่สุด</span>
            </td>
            <td class="money">{{ formatBaht(row.grossIncome) }}</td>
            <td class="money">{{ formatBaht(row.tax) }}</td>
            <td class="money">{{ formatPercent(row.effectiveRate) }}</td>
            <td class="money">{{ formatPercent(row.shieldRate) }}</td>
            <td
              class="money"
              :class="row.taxChange === null ? 'muted' : row.taxChange > 0 ? 'text-bad' : 'text-ok'"
            >
              {{ changeText(row.taxChange) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ul v-if="comparison.insights.length" class="insight-list mt-2">
      <li v-for="text in comparison.insights" :key="text">
        <AppIcon name="info" :size="16" />
        <span>{{ text }}</span>
      </li>
    </ul>
    <p v-else class="small muted mt-2">บันทึกแบบภาษีอย่างน้อย 2 ปี ระบบจึงจะสรุปแนวโน้มให้ได้</p>
  </section>
</template>
