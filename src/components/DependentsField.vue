<script setup lang="ts">
/**
 * ช่องกรอกค่าลดหย่อนผู้อยู่ในอุปการะเป็นจำนวนคน (บุตร บิดามารดา คนพิการ)
 * ผูกกับ dependents ของ filing store ระบบแปลงเป็นยอดเงินลดหย่อนให้เอง
 */
import { computed } from 'vue'
import {
  CHILD_ALLOWANCE,
  DISABLED_ALLOWANCE,
  MAX_PARENTS,
  PARENT_ALLOWANCE,
  dependentAmounts,
  normaliseDependents,
} from '@/data/dependents'
import { formatBaht } from '@/services/taxEngine'
import { useFilingStore } from '@/stores/filing'

const props = defineProps<{ itemKey: 'children' | 'parents' | 'disabledCare' }>()

const filing = useFilingStore()
const amounts = computed(() => dependentAmounts(filing.dependents))
const maxBonus = computed(() => Math.max(0, filing.dependents.children - 1))

type CountKey = 'children' | 'childrenBonus' | 'parents' | 'disabled'

function step(key: CountKey, delta: number) {
  filing.dependents[key] = filing.dependents[key] + delta
  // กันค่าเกินเงื่อนไข เช่น ลดจำนวนบุตรแล้วส่วนเพิ่มต้องลดตาม
  Object.assign(filing.dependents, normaliseDependents(filing.dependents))
}

const rows = computed(() => {
  if (props.itemKey === 'children') {
    return [
      { key: 'children' as const, label: 'บุตรที่ใช้สิทธิ', unit: 'คน', max: 20, hint: `คนละ ${formatBaht(CHILD_ALLOWANCE)}` },
      {
        key: 'childrenBonus' as const,
        label: 'ในนี้เป็นบุตรคนที่ 2 ขึ้นไปที่เกิดตั้งแต่ปี 2561',
        unit: 'คน',
        max: maxBonus.value,
        hint: 'ได้คนละ 60,000 บาท',
      },
    ]
  }
  if (props.itemKey === 'parents') {
    return [
      {
        key: 'parents' as const,
        label: 'บิดามารดาที่อายุ 60 ปีขึ้นไป',
        unit: 'คน',
        max: MAX_PARENTS,
        hint: `คนละ ${formatBaht(PARENT_ALLOWANCE)} สูงสุด 4 คน`,
      },
    ]
  }
  return [
    {
      key: 'disabled' as const,
      label: 'คนพิการหรือทุพพลภาพในอุปการะ',
      unit: 'คน',
      max: 20,
      hint: `คนละ ${formatBaht(DISABLED_ALLOWANCE)}`,
    },
  ]
})
</script>

<template>
  <div class="dependents-field">
    <div v-for="row in rows" :key="row.key" class="counter-row">
      <span class="counter-label">
        {{ row.label }}
        <small class="muted">{{ row.hint }}</small>
      </span>
      <div class="stepper" role="group" :aria-label="row.label">
        <button
          type="button"
          :disabled="filing.dependents[row.key] <= 0"
          :aria-label="`ลด${row.label}`"
          @click="step(row.key, -1)"
        >
          −
        </button>
        <output aria-live="polite">{{ filing.dependents[row.key] }}</output>
        <button
          type="button"
          :disabled="filing.dependents[row.key] >= row.max"
          :aria-label="`เพิ่ม${row.label}`"
          @click="step(row.key, 1)"
        >
          +
        </button>
      </div>
    </div>
    <p class="counter-total">
      ลดหย่อนได้ <strong class="num">{{ formatBaht(amounts[itemKey]) }}</strong>
    </p>
  </div>
</template>
