<script setup lang="ts">
/**
 * เลือกหักค่าใช้จ่ายตามจริงหรือแบบเหมา สำหรับเงินได้ 40(5)–(8)
 * คำนวณภาษีทั้งสองแบบให้เทียบทันที และบอกว่าแบบไหนเสียน้อยกว่า
 */
import { computed } from 'vue'
import MoneyField from './MoneyField.vue'
import { INCOME_CATEGORIES } from '@/data/taxData'
import { calculateTax, canUseActualExpense, formatBaht } from '@/services/taxEngine'
import { useFilingStore } from '@/stores/filing'

const filing = useFilingStore()

const rows = computed(() =>
  INCOME_CATEGORIES.filter((c) => canUseActualExpense(c.key) && (filing.income[c.key] ?? 0) > 0).map((c) => {
    const amount = filing.income[c.key] ?? 0
    const deemed = Math.min(amount * c.expenseRate, c.expenseCap ?? Number.POSITIVE_INFINITY)
    const actual = filing.actualExpenses[c.key] ?? 0
    // ภาษีถ้าใช้แบบเหมา vs ถ้าใช้ตามจริง เฉพาะประเภทนี้ ประเภทอื่นคงตามที่เลือกไว้
    const others = { ...filing.taxOptions.actualExpenses }
    delete others[c.key]
    const base = { ...filing.taxOptions, actualExpenses: others }
    const taxDeemed = calculateTax(filing.income, filing.deductions, 0, base).tax
    const taxActual = calculateTax(filing.income, filing.deductions, 0, {
      ...base,
      actualExpenses: { ...others, [c.key]: actual },
    }).tax
    return { category: c, amount, deemed, actual, taxDeemed, taxActual }
  }),
)

function toggle(key: string, value: boolean) {
  filing.useActualExpense[key] = value
}
</script>

<template>
  <section v-if="rows.length" class="card">
    <div class="card-head">
      <div>
        <h3>หักค่าใช้จ่ายแบบเหมา หรือตามจริง?</h3>
        <p>เงินได้ 40(5)–40(8) เลือกได้ว่าจะหักตามจริง ถ้าต้นทุนจริงสูงกว่าอัตราเหมา อาจเสียภาษีน้อยกว่า</p>
      </div>
    </div>

    <div v-for="row in rows" :key="row.category.key" class="expense-method">
      <div class="expense-method-head">
        <strong>{{ row.category.label }} · {{ row.category.code }}</strong>
        <span class="small muted">เงินได้ {{ formatBaht(row.amount) }}</span>
      </div>

      <div class="method-switch" role="radiogroup" :aria-label="`วิธีหักค่าใช้จ่าย ${row.category.label}`">
        <button
          type="button"
          role="radio"
          :aria-checked="!filing.useActualExpense[row.category.key]"
          :class="{ active: !filing.useActualExpense[row.category.key] }"
          @click="toggle(row.category.key, false)"
        >
          <b>แบบเหมา {{ row.category.expenseRate * 100 }}%</b>
          <small>หัก {{ formatBaht(row.deemed) }} · ภาษี {{ formatBaht(row.taxDeemed) }}</small>
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="!!filing.useActualExpense[row.category.key]"
          :class="{ active: filing.useActualExpense[row.category.key] }"
          @click="toggle(row.category.key, true)"
        >
          <b>ตามจริง</b>
          <small>หัก {{ formatBaht(Math.min(row.actual, row.amount)) }} · ภาษี {{ formatBaht(row.taxActual) }}</small>
        </button>
      </div>

      <MoneyField
        v-model="filing.actualExpenses[row.category.key]"
        label="ค่าใช้จ่ายที่จ่ายจริงทั้งปี"
        hint="ต้องมีใบเสร็จและหลักฐานครบ เพราะสรรพากรเรียกตรวจได้"
      />

      <p v-if="row.actual > 0" class="small" :class="row.taxActual < row.taxDeemed ? 'text-ok' : 'muted'">
        <template v-if="row.taxActual < row.taxDeemed">
          หักตามจริงประหยัดกว่า {{ formatBaht(row.taxDeemed - row.taxActual) }}
          <template v-if="!filing.useActualExpense[row.category.key]"> — กด "ตามจริง" เพื่อใช้</template>
        </template>
        <template v-else-if="row.taxActual > row.taxDeemed">แบบเหมาเสียภาษีน้อยกว่า {{ formatBaht(row.taxActual - row.taxDeemed) }}</template>
        <template v-else>ทั้งสองแบบเสียภาษีเท่ากัน</template>
      </p>
    </div>
  </section>
</template>
