<script setup lang="ts">
/**
 * ช่องกรอกเลขประจำตัวประชาชนและเบอร์โทรศัพท์
 *
 * เก็บค่าเป็นตัวเลขล้วนเสมอ แต่แสดงผลแบบมีขีดคั่นให้อ่านง่าย
 * กรองอักขระที่ไม่ใช่ตัวเลขทิ้งตั้งแต่ตอนพิมพ์ จะได้ไม่ต้องไปดักซ้ำตอน validate
 */
import { computed } from 'vue'
import {
  CITIZEN_ID_CHECKSUM_WARNING,
  CITIZEN_ID_LENGTH,
  digitsOnly,
  formatCitizenId,
  formatPhone,
  isCitizenIdChecksumValid,
} from '@/data/accountRules'

const props = withDefaults(
  defineProps<{
    kind: 'citizenId' | 'phone'
    label: string
    hint?: string
    error?: string
    id?: string
    /** แสดงคำเตือนหลักตรวจสอบของเลขบัตร (ไม่บล็อกการบันทึก) */
    showChecksumWarning?: boolean
  }>(),
  { hint: '', error: '', id: undefined, showChecksumWarning: true },
)

/** ค่าที่เก็บจริงเป็นตัวเลขล้วน ไม่มีขีด */
const model = defineModel<string>({ default: '' })

const maxDigits = computed(() => (props.kind === 'citizenId' ? CITIZEN_ID_LENGTH : 10))
const digits = computed(() => digitsOnly(model.value))

const display = computed(() =>
  props.kind === 'citizenId' ? formatCitizenId(model.value) : formatPhone(model.value),
)

/** เลขครบ 13 หลักแล้วแต่หลักตรวจสอบไม่ผ่าน — เตือนแต่ไม่บล็อก */
const checksumWarning = computed(() => {
  if (props.kind !== 'citizenId' || !props.showChecksumWarning) return ''
  if (digits.value.length !== CITIZEN_ID_LENGTH) return ''
  return isCitizenIdChecksumValid(digits.value) ? '' : CITIZEN_ID_CHECKSUM_WARNING
})

const counter = computed(() => {
  if (props.kind !== 'citizenId') return ''
  const n = digits.value.length
  if (n === 0 || n === CITIZEN_ID_LENGTH) return ''
  return `กรอกไปแล้ว ${n} จาก ${CITIZEN_ID_LENGTH} หลัก`
})

function onInput(event: Event) {
  const el = event.target as HTMLInputElement
  model.value = digitsOnly(el.value).slice(0, maxDigits.value)
  // เขียนค่าที่จัดรูปแบบแล้วกลับเข้า input เอง เพราะถ้าผู้ใช้พิมพ์อักขระที่ถูกกรองทิ้ง
  // Vue จะไม่เห็นว่า model เปลี่ยน แล้วตัวอักษรนั้นจะค้างอยู่บนหน้าจอ
  el.value = display.value
}
</script>

<template>
  <div class="field" :class="{ invalid: Boolean(error) }">
    <label :for="id">{{ label }}</label>
    <input
      :id="id"
      type="text"
      :name="kind === 'citizenId' ? 'citizen-id' : 'tel'"
      :inputmode="kind === 'citizenId' ? 'numeric' : 'tel'"
      :autocomplete="kind === 'citizenId' ? 'off' : 'tel'"
      autocapitalize="none"
      autocorrect="off"
      spellcheck="false"
      :placeholder="kind === 'citizenId' ? '0-0000-00000-00-0' : '08X-XXX-XXXX'"
      :value="display"
      :aria-invalid="Boolean(error)"
      @input="onInput"
    />
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="checksumWarning" class="warn-text">{{ checksumWarning }}</p>
    <p v-else-if="counter" class="hint">{{ counter }}</p>
    <p v-else-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>
