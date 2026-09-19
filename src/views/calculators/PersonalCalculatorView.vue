<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import TaxSummaryCard from '@/components/TaxSummaryCard.vue'
import TaxDocument, { type DocumentSection } from '@/components/TaxDocument.vue'
import { DEDUCTION_ITEMS, INCOME_CATEGORIES } from '@/data/taxData'
import {
  calculateTax,
  compareSpouseFiling,
  formatBaht,
  formatPercent,
  savingsFromExtraDeduction,
} from '@/services/taxEngine'
import { useFilingStore } from '@/stores/filing'
import { useToastStore } from '@/stores/toast'

const router = useRouter()
const filing = useFilingStore()
const toast = useToastStore()

/* ค่าลดหย่อนที่คนส่วนใหญ่ใช้ — หน้านี้เน้นประเมินเร็ว รายการเต็มอยู่ที่หน้าค่าลดหย่อน */
const QUICK_DEDUCTION_KEYS = [
  'socialSecurity',
  'providentFund',
  'lifeInsurance',
  'healthInsurance',
  'rmf',
  'ssf',
  'mortgageInterest',
  'donationGeneral',
]

const quickDeductionItems = QUICK_DEDUCTION_KEYS.map(
  (key) => DEDUCTION_ITEMS.find((item) => item.key === key)!,
)

const income = reactive<Record<string, number>>(
  Object.fromEntries(INCOME_CATEGORIES.map((c) => [c.key, 0])),
)
const deductions = reactive<Record<string, number>>({
  personal: 60_000,
  ...Object.fromEntries(QUICK_DEDUCTION_KEYS.map((key) => [key, 0])),
})
const withholdingTax = ref(0)
/** true = กรอกเงินได้ทุกประเภท, false = แสดงเฉพาะเงินเดือนกับฟรีแลนซ์ */
const showAllIncome = ref(false)

const visibleCategories = computed(() =>
  showAllIncome.value
    ? INCOME_CATEGORIES
    : INCOME_CATEGORIES.filter((c) => c.key === 'salary' || c.key === 'freelance'),
)

const result = computed(() => calculateTax(income, deductions, withholdingTax.value))

const expenseLinesWithIncome = computed(() =>
  result.value.expenseLines.filter((line) => line.income > 0),
)

const bracketLinesUsed = computed(() =>
  result.value.bracketLines.filter((line) => line.amount > 0),
)

/** ถ้าลดหย่อนเพิ่มอีก 10,000 บาท จะประหยัดภาษีได้เท่าไร — ใช้ชี้เป้าให้ผู้ใช้ */
const savingsPer10k = computed(() => savingsFromExtraDeduction(result.value.netIncome, 10_000))

/** เงินได้เท่าไรถึงจะเริ่มเสียภาษี — ช่วยให้คนรายได้น้อยเข้าใจว่าทำไมภาษีเป็นศูนย์ */
const untaxedHeadroom = computed(() => Math.max(0, 150_000 - result.value.netIncome))

function useInFiling() {
  filing.applyQuickEstimate({ ...income }, { ...deductions }, withholdingTax.value)
  toast.success('ส่งตัวเลขไปที่แบบยื่นแล้ว')
  router.push('/filing')
}

/* เปรียบเทียบการยื่นแบบของคู่สมรส — เปิดใช้เมื่อผู้ใช้สมรสแล้วเท่านั้น */
const married = ref(false)
const spouseHasIncome = ref(true)
const spouseNetIncome = ref(0)

const spouseComparison = computed(() =>
  compareSpouseFiling({
    selfNetIncome: result.value.netIncome,
    spouseNetIncome: spouseNetIncome.value,
    spouseHasIncome: spouseHasIncome.value,
  }),
)

const spouseOptions = computed(() => [
  spouseComparison.value.separate,
  spouseComparison.value.joint,
])

/** ใบสรุปที่จะถูกพิมพ์เป็น PDF */
const documentSections = computed<DocumentSection[]>(() => [
  {
    title: 'เงินได้และค่าใช้จ่าย',
    rows: [
      ...expenseLinesWithIncome.value.map((line) => ({
        label: `${line.label} (${line.code})`,
        value: formatBaht(line.income),
      })),
      { label: 'รวมเงินได้พึงประเมิน', value: formatBaht(result.value.grossIncome), strong: true },
      { label: 'หัก ค่าใช้จ่าย', value: `− ${formatBaht(result.value.totalExpense)}`, muted: true },
      {
        label: 'เงินได้หลังหักค่าใช้จ่าย',
        value: formatBaht(result.value.incomeAfterExpense),
        strong: true,
      },
    ],
  },
  {
    title: 'ค่าลดหย่อน',
    rows: [
      ...result.value.deductionLines
        .filter((line) => line.allowed > 0)
        .map((line) => ({ label: line.label, value: formatBaht(line.allowed) })),
      { label: 'รวมค่าลดหย่อนที่หักได้', value: formatBaht(result.value.totalDeduction), strong: true },
    ],
  },
  {
    title: 'การคำนวณภาษี',
    rows: [
      ...bracketLinesUsed.value.map((line) => ({
        label: `${line.label} · อัตรา ${formatPercent(line.rate, 0)}`,
        value: formatBaht(line.tax),
      })),
      { label: 'เงินได้สุทธิ', value: formatBaht(result.value.netIncome), strong: true },
      { label: 'ภาษีตามขั้นบันได', value: formatBaht(result.value.tax), strong: true },
      {
        label: 'หัก ภาษีหัก ณ ที่จ่าย',
        value: `− ${formatBaht(result.value.withholdingTax)}`,
        muted: true,
      },
      { label: 'อัตราภาษีที่แท้จริง', value: formatPercent(result.value.effectiveRate) },
      { label: 'ขั้นภาษีสูงสุดที่ถึง', value: formatPercent(result.value.marginalRate, 0) },
    ],
  },
])

function exportPdf() {
  window.print()
}

function resetAll() {
  for (const key of Object.keys(income)) income[key] = 0
  for (const key of QUICK_DEDUCTION_KEYS) deductions[key] = 0
  withholdingTax.value = 0
}
</script>

<template>
  <div>
    <div class="work-layout">
      <div>
        <!-- เงินได้ -->
        <section class="card">
          <div class="card-head">
            <div>
              <h3>เงินได้ตลอดปีภาษี</h3>
              <p>กรอกยอดรวมทั้งปีก่อนหักค่าใช้จ่ายและก่อนหักภาษี ณ ที่จ่าย</p>
            </div>
            <button class="btn btn-ghost btn-sm" type="button" @click="showAllIncome = !showAllIncome">
              {{ showAllIncome ? 'แสดงเฉพาะรายการหลัก' : 'แสดงเงินได้ทุกประเภท' }}
            </button>
          </div>

          <div class="field-grid">
            <MoneyField
              v-for="category in visibleCategories"
              :key="category.key"
              v-model="income[category.key]"
              :label="`${category.label} · ${category.code}`"
              :hint="
                category.expenseRate > 0
                  ? `หักค่าใช้จ่าย ${category.expenseRate * 100}%${category.expenseCap ? ` สูงสุด ${formatBaht(category.expenseCap)}` : ''}`
                  : 'กฎหมายไม่ให้หักค่าใช้จ่ายสำหรับเงินได้ประเภทนี้'
              "
            />
          </div>

          <div class="field-grid mt-2">
            <MoneyField
              v-model="withholdingTax"
              label="ภาษีหัก ณ ที่จ่ายที่ถูกหักไปแล้ว"
              hint="ดูได้จากหนังสือรับรอง 50 ทวิ ที่นายจ้างหรือผู้จ่ายเงินออกให้"
            />
          </div>
        </section>

        <!-- ค่าลดหย่อนยอดนิยม -->
        <section class="card">
          <div class="card-head">
            <div>
              <h3>ค่าลดหย่อนที่ใช้บ่อย</h3>
              <p>ค่าลดหย่อนส่วนตัว 60,000 บาทระบบใส่ให้อัตโนมัติแล้ว</p>
            </div>
            <RouterLink class="btn btn-ghost btn-sm" to="/deductions">ดูรายการทั้งหมด</RouterLink>
          </div>

          <div class="field-grid">
            <MoneyField
              v-for="item in quickDeductionItems"
              :key="item.key"
              v-model="deductions[item.key]"
              :label="item.label"
              :hint="item.hint"
              :cap="item.cap"
            />
          </div>
        </section>

        <!-- ที่มาของค่าใช้จ่าย -->
        <section v-if="expenseLinesWithIncome.length" class="card">
          <div class="card-head">
            <div>
              <h3>ค่าใช้จ่ายที่หักได้</h3>
              <p>ระบบหักแบบเหมาตามอัตราของเงินได้แต่ละประเภท</p>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ประเภทเงินได้</th>
                  <th class="right">เงินได้</th>
                  <th class="right">ค่าใช้จ่ายที่หักได้</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in expenseLinesWithIncome" :key="line.key">
                  <td>
                    {{ line.label }}
                    <span v-if="line.cappedByLimit" class="badge badge-warn" style="margin-left: 6px">
                      ชนเพดาน
                    </span>
                  </td>
                  <td class="money">{{ formatBaht(line.income) }}</td>
                  <td class="money">{{ formatBaht(line.expense) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- ภาษีรายขั้น -->
        <section class="card">
          <div class="card-head">
            <div>
              <h3>ภาษีแยกตามขั้นบันได</h3>
              <p>เงินได้สุทธิ {{ formatBaht(result.netIncome) }} ถูกแบ่งเสียภาษีทีละขั้น</p>
            </div>
          </div>

          <div v-if="!bracketLinesUsed.length" class="notice notice-accent">
            <strong>ยังไม่ต้องเสียภาษี</strong>
            เงินได้สุทธิยังไม่เกิน 150,000 บาท ซึ่งเป็นส่วนที่ได้รับยกเว้นภาษี
            คุณยังมีช่องว่างอีก {{ formatBaht(untaxedHeadroom) }} ก่อนเริ่มเสียภาษีขั้นแรก
          </div>

          <div v-else class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ขั้นเงินได้สุทธิ</th>
                  <th class="right">อัตรา</th>
                  <th class="right">เงินได้ในขั้นนี้</th>
                  <th class="right">ภาษี</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in bracketLinesUsed" :key="line.label">
                  <td>{{ line.label }}</td>
                  <td class="money">{{ formatPercent(line.rate, 0) }}</td>
                  <td class="money">{{ formatBaht(line.amount) }}</td>
                  <td class="money">{{ formatBaht(line.tax) }}</td>
                </tr>
                <tr>
                  <td colspan="3"><strong>รวมภาษีทั้งสิ้น</strong></td>
                  <td class="money"><strong>{{ formatBaht(result.tax) }}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="result.tax > 0" class="notice notice-accent mt-2">
            <strong>ลดหย่อนเพิ่มอีก 10,000 บาท ประหยัดภาษีได้ {{ formatBaht(savingsPer10k) }}</strong>
            เพราะเงินได้สุทธิของคุณอยู่ในขั้น {{ formatPercent(result.marginalRate, 0) }}
            การลงทุนในกองทุนลดหย่อนหรือซื้อประกันจึงคืนกลับมาในอัตรานี้
          </div>
        </section>

        <div class="actions-bar">
          <button class="btn btn-ghost" type="button" @click="resetAll">
            ล้างตัวเลขทั้งหมด
          </button>
          <button class="btn btn-primary" type="button" @click="useInFiling">
            ใช้ตัวเลขนี้ยื่นแบบภาษี
            <AppIcon name="arrowRight" :size="18" />
          </button>
        </div>
      </div>

      <TaxSummaryCard :result="result" />
    </div>

    <TaxDocument
      title="ใบสรุปการคำนวณภาษีเงินได้บุคคลธรรมดา"
      subtitle="คำนวณจากอัตราภาษีขั้นบันไดและเพดานค่าลดหย่อนตามประมวลรัษฎากร"
      :headline-label="result.balance < 0 ? 'ยอดที่ขอคืนได้' : 'ภาษีที่ต้องชำระเพิ่ม'"
      :headline-value="formatBaht(Math.abs(result.balance))"
      :sections="documentSections"
      note="ตัวเลขนี้ยังไม่รวมสิทธิพิเศษเฉพาะกรณีและมาตรการลดหย่อนชั่วคราวของแต่ละปีภาษี"
    />
  </div>
</template>
