<script setup lang="ts">
/** ช่องกรอกจำนวนเงินพร้อมป้ายกำกับ คำอธิบาย และข้อความเตือนเมื่อเกินเพดาน */
import { computed, useId } from 'vue'
import { formatBaht } from '@/services/taxEngine'

const props = withDefaults(
  defineProps<{
    label?: string
    hint?: string
    /** เพดานของรายการนี้ ใช้แสดงแถบสัดส่วนและเตือนเมื่อกรอกเกิน */
    cap?: number | null
    warning?: string
    disabled?: boolean
    placeholder?: string
    /** มาตราที่อ้างอิงท้ายป้ายกำกับ เช่น "40(1)" — คลิกแล้วเปิดตัวบทของกรมสรรพากรในแท็บใหม่ */
    law?: string
    lawUrl?: string
  }>(),
  {
    label: '',
    hint: '',
    cap: null,
    warning: '',
    disabled: false,
    placeholder: '0',
    law: '',
    lawUrl: '',
  },
)

// รับ undefined ได้ด้วย เพราะหลายหน้าผูก v-model กับคีย์ในอ็อบเจกต์จำนวนเงินโดยตรง
const model = defineModel<number | undefined>({ default: 0 })

const inputId = useId()

const amount = computed(() => model.value ?? 0)

const usage = computed(() => {
  if (!props.cap || props.cap <= 0) return 0
  return Math.min(100, (amount.value / props.cap) * 100)
})

const overCap = computed(() => Boolean(props.cap && amount.value > props.cap))

/** กันค่าติดลบและ NaN ตั้งแต่ต้นทาง ไม่ต้องไปดักซ้ำในชั้นคำนวณ */
function onInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  model.value = Number.isFinite(raw) && raw > 0 ? raw : 0
}
</script>

<template>
  <div class="field" :class="{ invalid: overCap }">
    <div v-if="label" class="field-label">
      <label :for="inputId">{{ label }}</label>
      <!-- ลิงก์อยู่นอก <label> เพราะคลิกใน label จะไปโฟกัสช่องกรอกแทนการเปิดลิงก์ -->
      <a
        v-if="law && lawUrl"
        class="law-link"
        :href="lawUrl"
        target="_blank"
        rel="noopener noreferrer"
        :title="`อ่านตัวบทมาตรา ${law} ประมวลรัษฎากร บนเว็บไซต์กรมสรรพากร`"
        :aria-label="`อ่านตัวบทมาตรา ${law} ประมวลรัษฎากร บนเว็บไซต์กรมสรรพากร (เปิดแท็บใหม่)`"
      >
        {{ law }}
      </a>
    </div>
    <div class="money-input">
      <span class="sym">฿</span>
      <input
        :id="inputId"
        type="number"
        min="0"
        step="any"
        inputmode="numeric"
        :value="amount || ''"
        :disabled="disabled"
        :placeholder="placeholder"
        @input="onInput"
      />
    </div>
    <div v-if="cap" class="cap-bar" :class="{ over: overCap }">
      <span :style="{ width: `${usage}%` }"></span>
    </div>
    <p v-if="overCap" class="error">
      เกินเพดาน {{ formatBaht(cap as number) }} — ระบบจะหักให้เท่าเพดานเท่านั้น
    </p>
    <p v-else-if="warning" class="error">{{ warning }}</p>
    <p v-else-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>
