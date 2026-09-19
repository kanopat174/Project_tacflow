import { computed, reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  DEDUCTION_ITEMS,
  FORM_TYPES,
  INCOME_CATEGORIES,
  TAX_YEARS,
} from '@/data/taxData'
import { calculateTax, type AmountMap, type TaxResult } from '@/services/taxEngine'
import {
  CITIZEN_ID_ERROR,
  EMAIL_PATTERN,
  FULL_NAME_ERROR,
  PHONE_ERROR,
  isValidCitizenId,
  isValidFullName,
  isValidPhone,
} from '@/data/accountRules'
import { api, type Filing } from '@/services/api'
import { useAuthStore } from './auth'

const DRAFT_KEY = 'taxflow_draft_v1'

export type StepId = 1 | 2 | 3 | 4

export interface FilingStep {
  id: StepId
  label: string
  shortLabel: string
  description: string
}

export const FILING_STEPS: FilingStep[] = [
  {
    id: 1,
    label: 'ข้อมูลผู้เสียภาษี',
    shortLabel: 'ข้อมูลส่วนตัว',
    description: 'ยืนยันตัวตนและเลือกแบบภาษีที่ต้องยื่น',
  },
  {
    id: 2,
    label: 'เงินได้ตลอดปีภาษี',
    shortLabel: 'รายได้',
    description: 'กรอกเงินได้แยกตามประเภทเพื่อให้ระบบหักค่าใช้จ่ายได้ถูกต้อง',
  },
  {
    id: 3,
    label: 'ค่าลดหย่อนภาษี',
    shortLabel: 'ลดหย่อน',
    description: 'ใส่สิทธิลดหย่อนที่มี ระบบจะตัดเพดานให้อัตโนมัติ',
  },
  {
    id: 4,
    label: 'ตรวจสอบและยื่นแบบ',
    shortLabel: 'ตรวจสอบ',
    description: 'ทวนตัวเลขทั้งหมดก่อนส่งเข้าระบบ',
  },
]

export interface Taxpayer {
  taxYear: string
  formType: string
  citizenId: string
  fullName: string
  birthDate: string
  phone: string
  email: string
  address: string
  maritalStatus: string
}

function emptyAmounts(keys: string[]): AmountMap {
  return Object.fromEntries(keys.map((key) => [key, 0]))
}

function initialTaxpayer(): Taxpayer {
  return {
    taxYear: TAX_YEARS[0],
    formType: FORM_TYPES[0].value,
    citizenId: '',
    fullName: '',
    birthDate: '',
    phone: '',
    email: '',
    address: '',
    maritalStatus: 'single',
  }
}

function initialDeductions(): AmountMap {
  const amounts = emptyAmounts(DEDUCTION_ITEMS.map((item) => item.key))
  // ค่าลดหย่อนส่วนตัวเป็นสิทธิที่ทุกคนได้ ระบบใส่ให้ล่วงหน้าและแก้ไขไม่ได้
  for (const item of DEDUCTION_ITEMS) {
    if (item.preset) amounts[item.key] = item.preset
  }
  return amounts
}

export const useFilingStore = defineStore('filing', () => {
  const taxpayer = reactive<Taxpayer>(initialTaxpayer())
  const income = reactive<AmountMap>(emptyAmounts(INCOME_CATEGORIES.map((c) => c.key)))
  const deductions = reactive<AmountMap>(initialDeductions())
  const withholdingTax = ref(0)
  const accepted = ref(false)
  const currentStep = ref<StepId>(1)
  const submitting = ref(false)
  const submitted = ref<Filing | null>(null)

  /** ผลคำนวณสด อัปเดตทุกครั้งที่ตัวเลขในฟอร์มเปลี่ยน */
  const result = computed<TaxResult>(() =>
    calculateTax(income, deductions, withholdingTax.value),
  )

  const progress = computed(() => (currentStep.value / FILING_STEPS.length) * 100)
  const activeStep = computed(
    () => FILING_STEPS.find((step) => step.id === currentStep.value) ?? FILING_STEPS[0]!,
  )

  /* ---------- การตรวจความถูกต้องรายขั้นตอน ---------- */

  const step1Errors = computed(() => {
    const errors: Record<string, string> = {}
    if (!isValidFullName(taxpayer.fullName)) errors.fullName = FULL_NAME_ERROR
    if (!isValidCitizenId(taxpayer.citizenId)) errors.citizenId = CITIZEN_ID_ERROR
    if (!EMAIL_PATTERN.test(taxpayer.email.trim())) errors.email = 'รูปแบบอีเมลไม่ถูกต้อง'
    // เบอร์โทรไม่บังคับ แต่ถ้ากรอกแล้วต้องถูกรูปแบบ
    if (taxpayer.phone.trim() && !isValidPhone(taxpayer.phone)) errors.phone = PHONE_ERROR
    return errors
  })

  const step2Errors = computed(() => {
    const errors: Record<string, string> = {}
    if (result.value.grossIncome <= 0) {
      errors.income = 'กรุณากรอกเงินได้อย่างน้อยหนึ่งประเภท'
    }
    // ภาษีหัก ณ ที่จ่ายมากกว่าเงินได้ทั้งปีเป็นไปไม่ได้ — น่าจะกรอกผิดช่อง
    if (withholdingTax.value > result.value.grossIncome && result.value.grossIncome > 0) {
      errors.withholdingTax = 'ภาษีหัก ณ ที่จ่ายสูงกว่าเงินได้รวม กรุณาตรวจสอบตัวเลขอีกครั้ง'
    }
    return errors
  })

  const errorsForStep = (step: StepId): Record<string, string> => {
    if (step === 1) return step1Errors.value
    if (step === 2) return step2Errors.value
    return {}
  }

  const canLeaveStep = (step: StepId): boolean => Object.keys(errorsForStep(step)).length === 0
  const canSubmit = computed(
    () => accepted.value && canLeaveStep(1) && canLeaveStep(2) && !submitting.value,
  )

  /* ---------- การนำทางระหว่างขั้นตอน ---------- */

  function goNext(): boolean {
    if (!canLeaveStep(currentStep.value)) return false
    if (currentStep.value < 4) currentStep.value = (currentStep.value + 1) as StepId
    return true
  }

  function goBack(): void {
    if (currentStep.value > 1) currentStep.value = (currentStep.value - 1) as StepId
  }

  /** ข้ามไปขั้นตอนอื่นได้ต่อเมื่อขั้นตอนก่อนหน้าทั้งหมดผ่านแล้ว */
  function jumpToStep(step: StepId): boolean {
    if (step > currentStep.value) {
      for (let s = currentStep.value; s < step; s++) {
        if (!canLeaveStep(s as StepId)) return false
      }
    }
    currentStep.value = step
    return true
  }

  /* ---------- เติมข้อมูลและบันทึกแบบร่าง ---------- */

  /** เติมข้อมูลส่วนตัวจากบัญชีผู้ใช้ เฉพาะช่องที่ยังว่าง */
  function prefillFromAccount(): void {
    const { user } = useAuthStore()
    if (!user) return
    if (!taxpayer.fullName) taxpayer.fullName = user.fullName
    if (!taxpayer.citizenId) taxpayer.citizenId = user.citizenId
    if (!taxpayer.email) taxpayer.email = user.email
    if (!taxpayer.phone) taxpayer.phone = user.phone
    if (!taxpayer.address) taxpayer.address = user.address
  }

  /** รับตัวเลขจากหน้าเครื่องคำนวณเร็วมาตั้งต้นในแบบยื่น */
  function applyQuickEstimate(
    quickIncome: AmountMap,
    quickDeductions: AmountMap,
    quickWithholding: number,
  ): void {
    Object.assign(income, quickIncome)
    Object.assign(deductions, quickDeductions)
    withholdingTax.value = quickWithholding
  }

  function saveDraft(): void {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          taxpayer,
          income,
          deductions,
          withholdingTax: withholdingTax.value,
          currentStep: currentStep.value,
        }),
      )
    } catch {
      /* พื้นที่เก็บเต็ม — ข้ามการบันทึกรอบนี้ */
    }
  }

  function loadDraft(): boolean {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return false
      const draft = JSON.parse(raw)
      Object.assign(taxpayer, draft.taxpayer ?? {})
      Object.assign(income, draft.income ?? {})
      Object.assign(deductions, draft.deductions ?? {})
      withholdingTax.value = Number(draft.withholdingTax) || 0
      currentStep.value = (draft.currentStep as StepId) ?? 1
      return true
    } catch {
      return false
    }
  }

  function clearDraft(): void {
    localStorage.removeItem(DRAFT_KEY)
  }

  function resetForm(): void {
    Object.assign(taxpayer, initialTaxpayer())
    Object.assign(income, emptyAmounts(INCOME_CATEGORIES.map((c) => c.key)))
    Object.assign(deductions, initialDeductions())
    withholdingTax.value = 0
    accepted.value = false
    currentStep.value = 1
    submitted.value = null
    clearDraft()
  }

  /* ---------- ส่งแบบภาษี ---------- */

  async function submit(): Promise<Filing> {
    submitting.value = true
    try {
      const snapshot = {
        taxpayer: { ...taxpayer },
        income: { ...income },
        deductions: { ...deductions },
        withholdingTax: withholdingTax.value,
      }
      const filing = await api.createFiling({
        taxYear: taxpayer.taxYear,
        formType: taxpayer.formType,
        grossIncome: result.value.grossIncome,
        netIncome: result.value.netIncome,
        tax: result.value.tax,
        withholdingTax: result.value.withholdingTax,
        balance: result.value.balance,
        snapshot,
      })
      submitted.value = filing
      clearDraft()
      return filing
    } finally {
      submitting.value = false
    }
  }

  // บันทึกแบบร่างอัตโนมัติทุกครั้งที่ข้อมูลเปลี่ยน ผู้ใช้ปิดแท็บแล้วกลับมากรอกต่อได้
  watch(
    [taxpayer, income, deductions, withholdingTax, currentStep],
    () => {
      if (!submitted.value) saveDraft()
    },
    { deep: true },
  )

  return {
    taxpayer,
    income,
    deductions,
    withholdingTax,
    accepted,
    currentStep,
    submitting,
    submitted,
    steps: FILING_STEPS,
    result,
    progress,
    activeStep,
    step1Errors,
    step2Errors,
    errorsForStep,
    canLeaveStep,
    canSubmit,
    goNext,
    goBack,
    jumpToStep,
    prefillFromAccount,
    applyQuickEstimate,
    loadDraft,
    clearDraft,
    resetForm,
    submit,
  }
})
