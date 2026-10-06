<script setup lang="ts">
/** เทียบยื่นรวมกับยื่นแยกกับคู่สมรส ในหน้ายื่นแบบ (แสดงเมื่อสถานภาพเป็นสมรส) */
import { computed } from 'vue'
import MoneyField from './MoneyField.vue'
import { compareSpouseFiling, formatBaht } from '@/services/taxEngine'
import { useFilingStore } from '@/stores/filing'

const filing = useFilingStore()

const married = computed(() => filing.taxpayer.maritalStatus.startsWith('married'))

/** เงินได้สุทธิของเราเองโดยไม่นับค่าลดหย่อนคู่สมรส (ฟังก์ชันเทียบจะใส่ให้เองในทางเลือกยื่นรวม) */
const selfNet = computed(() => {
  const spouseLine = filing.result.deductionLines.find((l) => l.key === 'spouse')
  return filing.result.netIncome + (spouseLine?.allowed ?? 0)
})

const comparison = computed(() =>
  compareSpouseFiling({
    selfNetIncome: selfNet.value,
    spouseNetIncome: filing.spouse.netIncome,
    spouseHasIncome: filing.spouse.hasIncome,
  }),
)

const currentChoice = computed(() => (filing.taxpayer.maritalStatus === 'married_joint' ? 'joint' : 'separate'))

function choose(option: 'joint' | 'separate') {
  filing.taxpayer.maritalStatus = option === 'joint' ? 'married_joint' : 'married_separate'
  // ยื่นรวมกับคู่สมรสที่ไม่มีเงินได้ ใช้ค่าลดหย่อนคู่สมรส 60,000 ได้
  if (option === 'joint' && !filing.spouse.hasIncome) filing.deductions.spouse = 60_000
  if (option === 'separate') filing.deductions.spouse = 0
}
</script>

<template>
  <section v-if="married" class="card">
    <div class="card-head">
      <div>
        <h3>ยื่นรวมหรือยื่นแยกกับคู่สมรส?</h3>
        <p>กรอกข้อมูลคู่สมรส ระบบเทียบภาษีรวมของทั้งสองทางให้</p>
      </div>
    </div>

    <label class="check mb-2">
      <input v-model="filing.spouse.hasIncome" type="checkbox" />
      <span>คู่สมรสมีเงินได้ในปีภาษีนี้</span>
    </label>
    <MoneyField
      v-if="filing.spouse.hasIncome"
      v-model="filing.spouse.netIncome"
      label="เงินได้สุทธิของคู่สมรส"
      hint="เงินได้หลังหักค่าใช้จ่ายและค่าลดหย่อนของคู่สมรสเอง"
    />

    <div class="grid grid-2 mt-2">
      <button
        v-for="option in [comparison.separate, comparison.joint]"
        :key="option.key"
        type="button"
        class="compare-box"
        :class="{ winner: comparison.better === option.key, chosen: currentChoice === option.key }"
        @click="choose(option.key)"
      >
        <span class="eyebrow">{{ option.label }}</span>
        <strong class="num">{{ formatBaht(option.totalTax) }}</strong>
        <span class="small muted">{{ option.basis }}</span>
        <span class="small">{{ currentChoice === option.key ? '✓ เลือกอยู่' : 'กดเพื่อเลือกแบบนี้' }}</span>
      </button>
    </div>
    <p class="small mt-1" :class="comparison.saving > 0 ? 'text-ok' : 'muted'">
      {{
        comparison.saving > 0
          ? `${comparison.better === 'joint' ? 'ยื่นรวม' : 'ยื่นแยก'}เสียภาษีน้อยกว่า ${formatBaht(comparison.saving)}`
          : 'ทั้งสองทางเสียภาษีเท่ากัน'
      }}
    </p>
  </section>
</template>
