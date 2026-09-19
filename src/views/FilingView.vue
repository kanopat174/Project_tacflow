<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import IdentityInput from '@/components/IdentityInput.vue'
import TaxSummaryCard from '@/components/TaxSummaryCard.vue'
import {
  DEDUCTION_GROUPS,
  DEDUCTION_ITEMS,
  FORM_TYPES,
  INCOME_CATEGORIES,
  MARITAL_STATUS,
  TAX_YEARS,
  type DeductionGroup,
} from '@/data/taxData'
import { ApiError } from '@/services/api'
import { formatBaht } from '@/services/taxEngine'
import { useFilingStore, type StepId } from '@/stores/filing'
import { useToastStore } from '@/stores/toast'
import LockedFeature from '@/components/LockedFeature.vue'
import { useAuthGate } from '@/composables/useAuthGate'

const filing = useFilingStore()
const toast = useToastStore()
const router = useRouter()

const gate = useAuthGate()
const showConfirm = ref(false)
const confirmButton = ref<HTMLButtonElement | null>(null)

// กล่องยืนยันต้องปิดด้วย Escape และย้ายโฟกัสเข้าไปในกล่องได้ด้วยคีย์บอร์ด
function onModalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') showConfirm.value = false
}

watch(showConfirm, async (open) => {
  if (open) {
    document.addEventListener('keydown', onModalKeydown)
    await nextTick()
    confirmButton.value?.focus()
  } else {
    document.removeEventListener('keydown', onModalKeydown)
  }
})

onBeforeUnmount(() => document.removeEventListener('keydown', onModalKeydown))
/** แสดงข้อความ error รายช่องเฉพาะหลังผู้ใช้กดถัดไปแล้วเท่านั้น จะได้ไม่ขึ้นเตือนตั้งแต่ยังไม่กรอก */
const showErrors = ref(false)

const GROUP_ORDER: DeductionGroup[] = ['personal', 'insurance', 'investment', 'housing', 'donation']

const deductionGroups = GROUP_ORDER.map((group) => ({
  group,
  meta: DEDUCTION_GROUPS[group],
  items: DEDUCTION_ITEMS.filter((item) => item.group === group),
}))

const errors = computed(() => filing.errorsForStep(filing.currentStep))
const result = computed(() => filing.result)
const allowedByKey = computed(
  () => new Map(result.value.deductionLines.map((line) => [line.key, line])),
)

onMounted(() => {
  filing.loadDraft()
  filing.prefillFromAccount()
})

function next() {
  showErrors.value = true
  if (filing.goNext()) showErrors.value = false
  else toast.error('กรุณาแก้ไขข้อมูลที่ยังไม่ถูกต้องก่อนไปขั้นตอนถัดไป')
}

function back() {
  showErrors.value = false
  filing.goBack()
}

function jump(step: StepId) {
  if (!filing.jumpToStep(step)) {
    showErrors.value = true
    toast.error('กรอกข้อมูลในขั้นตอนก่อนหน้าให้ครบก่อน')
  }
}

async function confirmSubmit() {
  showConfirm.value = false
  if (!gate.requireAuth('ต้องเข้าสู่ระบบก่อนยื่นแบบภาษี แบบร่างที่กรอกไว้ถูกเก็บให้แล้ว')) return
  try {
    const created = await filing.submit()
    toast.success(`ยื่นแบบภาษีสำเร็จ เลขอ้างอิง ${created.reference}`)
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'ยื่นแบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
  }
}

function startNewFiling() {
  filing.resetForm()
  filing.prefillFromAccount()
}

function goToStatus() {
  if (filing.submitted) router.push(`/status/${filing.submitted.reference}`)
}

</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <!-- ยื่นสำเร็จแล้ว -->
      <section v-if="filing.submitted" class="confirm-panel">
        <span class="ico-big"><AppIcon name="check" :size="34" /></span>
        <span class="eyebrow">ทำรายการสำเร็จ</span>
        <h2>ยื่นแบบภาษีปี {{ filing.submitted.taxYear }} เรียบร้อยแล้ว</h2>
        <p class="code">{{ filing.submitted.reference }}</p>
        <p>
          <template v-if="filing.submitted.balance > 0">
            คุณต้องชำระภาษีเพิ่มอีก
            <strong class="text-accent">{{ formatBaht(filing.submitted.balance) }}</strong>
            ระบบจะแจ้งช่องทางชำระเงินในหน้าติดตามสถานะ
          </template>
          <template v-else-if="filing.submitted.balance < 0">
            คุณขอคืนภาษีได้
            <strong class="text-ok">{{ formatBaht(Math.abs(filing.submitted.balance)) }}</strong>
            ติดตามผลการคืนเงินได้ที่หน้าสถานะ
          </template>
          <template v-else>ภาษีที่ถูกหักไว้พอดีกับที่ต้องเสีย ไม่ต้องชำระเพิ่มและไม่มียอดขอคืน</template>
        </p>
        <div class="actions">
          <button class="btn btn-ghost" type="button" @click="startNewFiling">ยื่นแบบปีอื่น</button>
          <button class="btn btn-primary" type="button" @click="goToStatus">
            ติดตามสถานะแบบภาษี
            <AppIcon name="arrowRight" :size="18" />
          </button>
        </div>
      </section>

      <!-- แบบฟอร์ม 4 ขั้นตอน -->
      <template v-else>
        <div class="section-head">
          <span class="eyebrow">ขั้นตอนที่ {{ filing.currentStep }} จาก 4</span>
          <h2>{{ filing.activeStep.label }}</h2>
          <p>{{ filing.activeStep.description }}</p>
        </div>

        <LockedFeature
          v-if="gate.isGuest.value"
          title="กรอกลองได้เลย การยื่นแบบเท่านั้นที่ต้องมีบัญชี"
          description="ทุกช่องในหน้านี้ใช้ได้เต็มที่และคำนวณให้แบบเรียลไทม์ ระบบจะขอให้เข้าสู่ระบบตอนกดยื่นเท่านั้น"
          :benefits="[
            'บันทึกแบบร่างอัตโนมัติ กลับมากรอกต่อได้',
            'เก็บประวัติการยื่นทุกปีภาษี',
            'ติดตามสถานะจนถึงวันได้เงินคืน',
            'แนบเอกสารลดหย่อนแยกตามปี',
          ]"
        />

        <div class="stepper-bar mb-3">
          <button
            v-for="step in filing.steps"
            :key="step.id"
            class="step-item"
            type="button"
            :class="{ active: filing.currentStep === step.id, done: filing.currentStep > step.id }"
            @click="jump(step.id)"
          >
            <span class="n">
              <AppIcon v-if="filing.currentStep > step.id" name="check" :size="15" />
              <template v-else>{{ step.id }}</template>
            </span>
            <span class="t">
              <small>ขั้นตอน {{ step.id }}</small>
              <strong>{{ step.shortLabel }}</strong>
            </span>
          </button>
        </div>

        <div class="work-layout">
          <div>
            <!-- ขั้นตอนที่ 1: ข้อมูลผู้เสียภาษี -->
            <section v-if="filing.currentStep === 1" class="card">
              <div class="card-head">
                <div>
                  <h3>ข้อมูลผู้เสียภาษี</h3>
                  <p>ระบบดึงข้อมูลจากบัญชีของคุณมาให้แล้ว ตรวจสอบและแก้ไขได้ตามจริง</p>
                </div>
                <span class="badge badge-accent">บันทึกแบบร่างอัตโนมัติ</span>
              </div>

              <div class="field-grid">
                <div class="field">
                  <label for="tax-year">ปีภาษี</label>
                  <select id="tax-year" v-model="filing.taxpayer.taxYear">
                    <option v-for="year in TAX_YEARS" :key="year" :value="year">{{ year }}</option>
                  </select>
                </div>

                <div class="field">
                  <label for="form-type">ประเภทแบบภาษี</label>
                  <select id="form-type" v-model="filing.taxpayer.formType">
                    <option v-for="type in FORM_TYPES" :key="type.value" :value="type.value">
                      {{ type.label }}
                    </option>
                  </select>
                  <p class="hint">
                    {{ FORM_TYPES.find((t) => t.value === filing.taxpayer.formType)?.hint }}
                  </p>
                </div>

                <div class="field" :class="{ invalid: showErrors && errors.fullName }">
                  <label for="full-name">ชื่อ-นามสกุล</label>
                  <input
                    id="full-name"
                    v-model="filing.taxpayer.fullName"
                    type="text"
                    name="name"
                    autocomplete="name"
                    autocapitalize="words"
                    :maxlength="100"
                    placeholder="เช่น สมชาย ใจดี"
                  />
                  <p v-if="showErrors && errors.fullName" class="error">{{ errors.fullName }}</p>
                </div>

                <IdentityInput
                  id="citizen-id"
                  v-model="filing.taxpayer.citizenId"
                  kind="citizenId"
                  label="เลขประจำตัวประชาชน"
                  :error="showErrors ? errors.citizenId : ''"
                />

                <div class="field">
                  <label for="birth-date">วันเกิด</label>
                  <input id="birth-date" v-model="filing.taxpayer.birthDate" type="date" />
                </div>

                <div class="field">
                  <label for="marital">สถานภาพสมรส</label>
                  <select id="marital" v-model="filing.taxpayer.maritalStatus">
                    <option v-for="status in MARITAL_STATUS" :key="status.value" :value="status.value">
                      {{ status.label }}
                    </option>
                  </select>
                </div>

                <IdentityInput
                  id="phone"
                  v-model="filing.taxpayer.phone"
                  kind="phone"
                  label="เบอร์โทรศัพท์"
                  :error="showErrors ? errors.phone : ''"
                />

                <div class="field" :class="{ invalid: showErrors && errors.email }">
                  <label for="email">อีเมล</label>
                  <input id="email" v-model="filing.taxpayer.email" type="email" placeholder="name@example.com" />
                  <p v-if="showErrors && errors.email" class="error">{{ errors.email }}</p>
                </div>

                <div class="field full">
                  <label for="address">ที่อยู่ตามทะเบียนบ้าน</label>
                  <textarea id="address" v-model="filing.taxpayer.address" rows="3"></textarea>
                </div>
              </div>
            </section>

            <!-- ขั้นตอนที่ 2: เงินได้ -->
            <section v-if="filing.currentStep === 2" class="card">
              <div class="card-head">
                <div>
                  <h3>เงินได้ตลอดปีภาษี {{ filing.taxpayer.taxYear }}</h3>
                  <p>กรอกยอดรวมทั้งปีก่อนหักค่าใช้จ่าย แยกตามประเภทเงินได้ตามมาตรา 40</p>
                </div>
              </div>

              <div class="field-grid">
                <MoneyField
                  v-for="category in INCOME_CATEGORIES"
                  :key="category.key"
                  v-model="filing.income[category.key]"
                  :label="`${category.label} · ${category.code}`"
                  :hint="category.hint"
                />
              </div>

              <div class="field-grid mt-2">
                <MoneyField
                  v-model="filing.withholdingTax"
                  label="ภาษีหัก ณ ที่จ่าย"
                  hint="ยอดรวมจากหนังสือรับรอง 50 ทวิ ทุกใบ"
                  :warning="showErrors ? errors.withholdingTax : ''"
                />
              </div>

              <div v-if="showErrors && errors.income" class="notice notice-warn mt-2">
                <strong>ยังไม่มีเงินได้ในแบบยื่น</strong>
                {{ errors.income }}
              </div>

              <div class="notice notice-accent mt-2">
                <strong>ค่าใช้จ่ายที่หักได้ {{ formatBaht(result.totalExpense) }}</strong>
                ระบบหักแบบเหมาให้ตามอัตราของเงินได้แต่ละประเภท เช่น เงินเดือนหัก 50% สูงสุด 100,000 บาท
              </div>
            </section>

            <!-- ขั้นตอนที่ 3: ค่าลดหย่อน -->
            <template v-if="filing.currentStep === 3">
              <section v-for="block in deductionGroups" :key="block.group" class="card">
                <div class="card-head">
                  <div>
                    <h3>{{ block.meta.label }}</h3>
                    <p>{{ block.meta.hint }}</p>
                  </div>
                </div>

                <div class="field-grid">
                  <MoneyField
                    v-for="item in block.items"
                    :key="item.key"
                    v-model="filing.deductions[item.key]"
                    :label="item.label"
                    :hint="item.hint"
                    :cap="allowedByKey.get(item.key)?.limit ?? item.cap"
                    :disabled="item.fixed"
                  />
                </div>
              </section>

              <section class="card">
                <div class="upload-zone">
                  <span class="ico"><AppIcon name="upload" :size="26" /></span>
                  <div class="txt">
                    <strong>แนบเอกสารประกอบการลดหย่อน</strong>
                    <span>ใบเสร็จประกัน หนังสือรับรองกองทุน และใบอนุโมทนาบัตร</span>
                  </div>
                  <RouterLink class="btn btn-ghost" to="/documents">ไปหน้าเอกสาร</RouterLink>
                </div>
              </section>
            </template>

            <!-- ขั้นตอนที่ 4: ตรวจสอบ -->
            <section v-if="filing.currentStep === 4" class="card">
              <div class="card-head">
                <div>
                  <h3>ตรวจสอบข้อมูลก่อนยื่น</h3>
                  <p>ทวนตัวเลขทั้งหมดอีกครั้ง กดแก้ไขที่หัวข้อใดก็ได้เพื่อกลับไปแก้</p>
                </div>
              </div>

              <div class="review-block">
                <div class="rhead">
                  <h4>ข้อมูลผู้เสียภาษี</h4>
                  <button type="button" @click="filing.currentStep = 1">แก้ไข</button>
                </div>
                <dl>
                  <div><dt>ปีภาษี</dt><dd>{{ filing.taxpayer.taxYear }}</dd></div>
                  <div><dt>ประเภทแบบ</dt><dd class="text">{{ filing.taxpayer.formType }}</dd></div>
                  <div><dt>ชื่อผู้เสียภาษี</dt><dd class="text">{{ filing.taxpayer.fullName || '-' }}</dd></div>
                  <div><dt>เลขประจำตัวประชาชน</dt><dd>{{ filing.taxpayer.citizenId || '-' }}</dd></div>
                </dl>
              </div>

              <div class="review-block">
                <div class="rhead">
                  <h4>เงินได้และค่าใช้จ่าย</h4>
                  <button type="button" @click="filing.currentStep = 2">แก้ไข</button>
                </div>
                <dl>
                  <div><dt>เงินได้พึงประเมิน</dt><dd>{{ formatBaht(result.grossIncome) }}</dd></div>
                  <div><dt>ค่าใช้จ่ายที่หักได้</dt><dd class="text-bad">− {{ formatBaht(result.totalExpense) }}</dd></div>
                  <div><dt>เงินได้หลังหักค่าใช้จ่าย</dt><dd>{{ formatBaht(result.incomeAfterExpense) }}</dd></div>
                  <div><dt>ภาษีหัก ณ ที่จ่าย</dt><dd>{{ formatBaht(result.withholdingTax) }}</dd></div>
                </dl>
              </div>

              <div class="review-block">
                <div class="rhead">
                  <h4>ค่าลดหย่อนและภาษี</h4>
                  <button type="button" @click="filing.currentStep = 3">แก้ไข</button>
                </div>
                <dl>
                  <div><dt>ค่าลดหย่อนทั่วไป</dt><dd class="text-bad">− {{ formatBaht(result.generalDeduction) }}</dd></div>
                  <div><dt>เงินบริจาคที่หักได้</dt><dd class="text-bad">− {{ formatBaht(result.donationDeduction) }}</dd></div>
                  <div><dt>เงินได้สุทธิ</dt><dd>{{ formatBaht(result.netIncome) }}</dd></div>
                  <div><dt>ภาษีที่คำนวณได้</dt><dd>{{ formatBaht(result.tax) }}</dd></div>
                </dl>
              </div>

              <label class="check mt-2">
                <input v-model="filing.accepted" type="checkbox" />
                <span>
                  ข้าพเจ้ารับรองว่าข้อมูลข้างต้นถูกต้องตามความเป็นจริง
                  และยินยอมให้ระบบประมวลผลข้อมูลเพื่อจัดทำแบบแสดงรายการภาษี
                </span>
              </label>
            </section>

            <div class="actions-bar">
              <button
                class="btn btn-ghost"
                type="button"
                :disabled="filing.currentStep === 1"
                @click="back"
              >
                <AppIcon name="arrowLeft" :size="18" />
                ย้อนกลับ
              </button>
              <button v-if="filing.currentStep < 4" class="btn btn-primary" type="button" @click="next">
                ขั้นตอนถัดไป
                <AppIcon name="arrowRight" :size="18" />
              </button>
              <button
                v-else
                class="btn btn-primary"
                type="button"
                :disabled="!filing.canSubmit"
                @click="gate.isGuest.value ? gate.requireAuth('สมัครสมาชิกหรือเข้าสู่ระบบเพื่อยื่นแบบภาษี') : (showConfirm = true)"
              >
                <AppIcon v-if="gate.isGuest.value" name="lock" :size="17" />
                {{ gate.isGuest.value ? 'เข้าสู่ระบบเพื่อยื่นแบบ' : 'ยืนยันและยื่นแบบภาษี' }}
              </button>
            </div>
          </div>

          <TaxSummaryCard :result="result" />
        </div>
      </template>
    </div>

    <!-- ยืนยันก่อนส่ง -->
    <div v-if="showConfirm" class="modal-backdrop" @click.self="showConfirm = false">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <span class="ico-big"><AppIcon name="alert" :size="26" /></span>
        <h3 id="confirm-title">ยืนยันการยื่นแบบภาษี?</h3>
        <p>
          เมื่อยืนยันแล้ว ระบบจะบันทึกแบบภาษีปี {{ filing.taxpayer.taxYear }} เข้าสู่ระบบ
          และแก้ไขแบบชุดนี้ไม่ได้อีก — หนึ่งปีภาษียื่นได้หนึ่งครั้ง
        </p>
        <div class="actions">
          <button class="btn btn-ghost" type="button" @click="showConfirm = false">
            กลับไปตรวจทาน
          </button>
          <button
            ref="confirmButton"
            class="btn btn-primary"
            type="button"
            :disabled="filing.submitting"
            @click="confirmSubmit"
          >
            {{ filing.submitting ? 'กำลังส่ง...' : 'ยืนยันส่งแบบภาษี' }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>
