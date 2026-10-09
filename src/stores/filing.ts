import { computed, reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  DEDUCTION_ITEMS,
  FORM_TYPES,
  SENIOR_AGE,
  INCOME_CATEGORIES,
  TAX_YEARS,
} from '@/data/taxData'
import { calculateTax, type AmountMap, type TaxResult } from '@/services/taxEngine'
import { dependentAmounts, emptyDependents, inferDependents, type Dependents } from '@/data/dependents'
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

export const DRAFT_KEY = 'taxflow_draft_v1'

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
    label: 'ตรวจสอบและบันทึกสรุป',
    shortLabel: 'ตรวจสอบ',
    description: 'ทวนตัวเลขทั้งหมด บันทึกสรุป แล้วนำไปยื่นเองที่ e-Filing ของกรมสรรพากร',
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
  /** เป็นผู้พิการหรือทุพพลภาพ (ยกเว้นเงินได้ 190,000 บาท เหมือนผู้มีอายุ 65 ปีขึ้นไป) */
  disabledPerson: boolean
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
    disabledPerson: false,
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
  /**
   * จำนวนผู้อยู่ในอุปการะ — ผู้ใช้กรอกเป็นจำนวนคน แล้วระบบแปลงเป็นยอดลดหย่อนให้
   * กรอกเป็นยอดเงินเองผิดกันบ่อย เพราะบุตรคนที่ 2 ขึ้นไปที่เกิดตั้งแต่ปี 2561 ได้ไม่เท่าคนแรก
   */
  const dependents = reactive<Dependents>(emptyDependents())
  watch(
    dependents,
    () => Object.assign(deductions, dependentAmounts(dependents)),
    { deep: true },
  )
  const withholdingTax = ref(0)
  /** ภาษีที่ชำระไปแล้วตาม ภ.ง.ด.94 (ภาษีครึ่งปี) */
  const halfYearTaxPaid = ref(0)
  /** ประเภทเงินได้ 40(5)–(8) ที่เลือกหักค่าใช้จ่ายตามจริง และยอดค่าใช้จ่ายจริง */
  const useActualExpense = reactive<Record<string, boolean>>({})
  const actualExpenses = reactive<AmountMap>({})
  /** ข้อมูลคู่สมรสสำหรับเทียบยื่นรวมกับยื่นแยก */
  const spouse = reactive({ hasIncome: false, netIncome: 0 })
  const accepted = ref(false)
  const currentStep = ref<StepId>(1)
  const submitting = ref(false)
  const submitted = ref<Filing | null>(null)

  /** อายุ ณ สิ้นปีภาษี (31 ธ.ค.) — null คือยังไม่กรอกวันเกิด */
  const ageAtYearEnd = computed<number | null>(() => {
    if (!taxpayer.birthDate) return null
    const birth = new Date(`${taxpayer.birthDate}T00:00:00`)
    if (Number.isNaN(birth.getTime())) return null
    return Number(taxpayer.taxYear) - 543 - birth.getFullYear()
  })

  /** อายุ 65 ปีขึ้นไปในปีภาษี หรือเป็นผู้พิการ ได้ยกเว้นเงินได้ 190,000 บาท */
  const seniorExemption = computed(
    () => (ageAtYearEnd.value !== null && ageAtYearEnd.value >= SENIOR_AGE) || taxpayer.disabledPerson,
  )

  /** ตัวเลือกที่ทุกการคำนวณของแบบนี้ต้องใช้ร่วมกัน (ปีภาษีกำหนดสิทธิลดหย่อนที่ใช้ได้) */
  const taxOptions = computed(() => ({
    taxYear: taxpayer.taxYear,
    seniorExemption: seniorExemption.value,
    // ส่งเฉพาะประเภทที่เลือกหักตามจริง ประเภทอื่นใช้แบบเหมา
    actualExpenses: Object.fromEntries(
      Object.entries(actualExpenses).filter(([key]) => useActualExpense[key]),
    ),
    halfYearTaxPaid: halfYearTaxPaid.value,
  }))

  /** ผลคำนวณสด อัปเดตทุกครั้งที่ตัวเลขในฟอร์มเปลี่ยน */
  const result = computed<TaxResult>(() =>
    calculateTax(income, deductions, withholdingTax.value, taxOptions.value),
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

  /**
   * เริ่มแบบปีใหม่จากแบบปีก่อน: ยกข้อมูลที่มักไม่เปลี่ยน (สถานภาพ วันเกิด ผู้อยู่ในอุปการะ คู่สมรส)
   * ไม่ยกเงินได้และค่าลดหย่อนที่เป็นยอดจ่าย — พวกนั้นเปลี่ยนทุกปี ดึงจากสมุดบัญชีแทน
   */
  function applyPreviousYear(snapshot: Record<string, unknown>): void {
    const previous = (snapshot.taxpayer ?? {}) as Partial<Taxpayer>
    const amounts = (snapshot.deductions ?? {}) as Record<string, number>
    if (previous.formType) taxpayer.formType = previous.formType
    if (previous.maritalStatus) taxpayer.maritalStatus = previous.maritalStatus
    if (previous.birthDate && !taxpayer.birthDate) taxpayer.birthDate = previous.birthDate
    if (previous.address && !taxpayer.address) taxpayer.address = previous.address
    if (typeof previous.disabledPerson === 'boolean') taxpayer.disabledPerson = previous.disabledPerson
    Object.assign(dependents, inferDependents(amounts))
    if (Number(amounts.spouse) > 0) deductions.spouse = Number(amounts.spouse)
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
          dependents,
          withholdingTax: withholdingTax.value,
          halfYearTaxPaid: halfYearTaxPaid.value,
          useActualExpense,
          actualExpenses,
          spouse,
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
      // แบบร่างรุ่นเก่าเก็บเป็นยอดเงิน ไม่มีจำนวนคน — แปลงกลับเป็นจำนวนคนให้ใกล้เคียงที่สุด
      Object.assign(dependents, draft.dependents ?? inferDependents(deductions))
      withholdingTax.value = Number(draft.withholdingTax) || 0
      halfYearTaxPaid.value = Number(draft.halfYearTaxPaid) || 0
      Object.assign(useActualExpense, draft.useActualExpense ?? {})
      Object.assign(actualExpenses, draft.actualExpenses ?? {})
      Object.assign(spouse, draft.spouse ?? {})
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
    Object.assign(dependents, emptyDependents())
    withholdingTax.value = 0
    halfYearTaxPaid.value = 0
    for (const key of Object.keys(useActualExpense)) delete useActualExpense[key]
    for (const key of Object.keys(actualExpenses)) delete actualExpenses[key]
    Object.assign(spouse, { hasIncome: false, netIncome: 0 })
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
    [taxpayer, income, deductions, dependents, withholdingTax, halfYearTaxPaid, useActualExpense, actualExpenses, spouse, currentStep],
    () => {
      if (!submitted.value) saveDraft()
    },
    { deep: true },
  )

  return {
    taxpayer,
    income,
    deductions,
    dependents,
    ageAtYearEnd,
    seniorExemption,
    taxOptions,
    halfYearTaxPaid,
    useActualExpense,
    actualExpenses,
    spouse,
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
    applyPreviousYear,
    applyQuickEstimate,
    loadDraft,
    clearDraft,
    resetForm,
    submit,
  }
})
