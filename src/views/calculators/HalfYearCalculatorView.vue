<script setup lang="ts">
/**
 * เครื่องคำนวณภาษีครึ่งปี (ภ.ง.ด.94) สำหรับเงินได้ 40(5)–40(8) ช่วง ม.ค.–มิ.ย.
 * ดึงรายรับครึ่งปีแรกจากสมุดบัญชีได้ และส่งภาษีที่ชำระไปหักในแบบสิ้นปีได้ทันที
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import TaxSummaryCard from '@/components/TaxSummaryCard.vue'
import { DEFAULT_TAX_YEAR, TAX_YEARS } from '@/data/taxData'
import { emptyDependents, normaliseDependents } from '@/data/dependents'
import { ApiError, api } from '@/services/api'
import { buildFilingImport } from '@/services/ledgerImport'
import { HALF_YEAR_CATEGORIES, calculateHalfYearTax } from '@/services/halfYearTax'
import { formatBaht } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { useFilingStore } from '@/stores/filing'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const filing = useFilingStore()
const toast = useToastStore()
const router = useRouter()

const taxYear = ref<string>(DEFAULT_TAX_YEAR)
const income = reactive<Record<string, number>>(Object.fromEntries(HALF_YEAR_CATEGORIES.map((c) => [c.key, 0])))
const useActual = reactive<Record<string, boolean>>({})
const actual = reactive<Record<string, number>>({})
const dependents = reactive(emptyDependents())
const spouseNoIncome = ref(false)
const withholdingTax = ref(0)

/** ค่าลดหย่อนที่จ่ายจริงช่วง ม.ค.–มิ.ย. */
const DEDUCTION_FIELDS = [
  { key: 'lifeInsurance', label: 'เบี้ยประกันชีวิต', hint: '10,000 บาทแรกหักได้กึ่งหนึ่ง ส่วนที่เกินหักตามจริง' },
  { key: 'healthInsurance', label: 'เบี้ยประกันสุขภาพตนเอง', hint: 'ไม่เกิน 15,000 บาท' },
  { key: 'parentHealthInsurance', label: 'ประกันสุขภาพบิดามารดา', hint: 'ไม่เกิน 15,000 บาท' },
  { key: 'socialSecurity', label: 'เงินสมทบประกันสังคม', hint: 'ไม่เกินครึ่งหนึ่งของเพดานทั้งปี' },
  { key: 'rmf', label: 'RMF', hint: 'ไม่เกิน 30% ของเงินได้ครึ่งปี' },
  { key: 'thaiEsg', label: 'Thai ESG', hint: 'ไม่เกิน 30% ของเงินได้ครึ่งปี' },
  { key: 'pensionInsurance', label: 'เบี้ยประกันบำนาญ', hint: 'ไม่เกิน 15% ของเงินได้' },
  { key: 'nsf', label: 'กอช.', hint: '' },
  { key: 'mortgageInterest', label: 'ดอกเบี้ยเงินกู้บ้าน', hint: '10,000 บาทแรกหักได้กึ่งหนึ่ง ส่วนที่เกินหักตามจริง' },
  { key: 'donationGeneral', label: 'เงินบริจาคทั่วไป', hint: 'ไม่เกิน 10% ของเงินได้หลังหักค่าลดหย่อน' },
]
const deductions = reactive<Record<string, number>>(Object.fromEntries(DEDUCTION_FIELDS.map((f) => [f.key, 0])))

const half = computed(() =>
  calculateHalfYearTax({
    income,
    actualExpenses: Object.fromEntries(Object.entries(actual).filter(([k]) => useActual[k])),
    deductions,
    dependents: normaliseDependents(dependents),
    spouseNoIncome: spouseNoIncome.value,
    withholdingTax: withholdingTax.value,
    taxYear: taxYear.value,
  }),
)

const totalIncome = computed(() => Object.values(income).reduce((s, n) => s + (Number(n) || 0), 0))
/** ต้องยื่นเมื่อเงินได้ครึ่งปีตั้งแต่ 60,000 (โสด) หรือ 120,000 (สมรส) */
const mustFile = computed(() => totalIncome.value >= (spouseNoIncome.value ? 120_000 : 60_000))

const importing = ref(false)
async function importFromLedger() {
  importing.value = true
  try {
    const [ws, entries] = await Promise.all([api.workspaces(), api.allEntries()])
    const data = buildFilingImport(ws, entries, taxYear.value, [1, 6])
    let found = 0
    for (const line of data.lines) {
      if (line.incomeKey in income) {
        income[line.incomeKey] = line.amount
        found += 1
      }
    }
    if (data.businessExpenses > 0) actual.business = data.businessExpenses
    toast.success(found ? `ดึงเงินได้ ม.ค.–มิ.ย. จากสมุดแล้ว ${found} ประเภท` : 'ไม่พบเงินได้ 40(5)–40(8) ช่วง ม.ค.–มิ.ย. ในสมุด')
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'โหลดสมุดบัญชีไม่สำเร็จ')
  } finally {
    importing.value = false
  }
}

function sendToAnnual() {
  filing.taxpayer.taxYear = taxYear.value
  filing.halfYearTaxPaid = half.value.payable
  toast.success(`ใส่ภาษีครึ่งปี ${formatBaht(half.value.payable)} ในแบบสิ้นปีแล้ว`)
  router.push('/filing')
}
</script>

<template>
  <div>
    <div class="notice notice-accent mb-3">
      <strong>ภ.ง.ด.94 ภาษีครึ่งปี</strong>
      สำหรับเงินได้ค่าเช่า วิชาชีพอิสระ รับเหมา และธุรกิจ (40(5)–40(8)) ที่ได้รับช่วงมกราคม–มิถุนายน
      ยื่นภายใน 30 กันยายน (ออนไลน์มักขยายถึงต้นตุลาคม) ภาษีที่จ่ายเป็นเงินล่วงหน้า หักคืนได้ตอนยื่นสิ้นปี
    </div>

    <div class="work-layout">
      <div>
        <section class="card">
          <div class="card-head">
            <div>
              <h3>เงินได้ ม.ค.–มิ.ย.</h3>
              <p>เงินเดือนไม่ต้องยื่นในแบบนี้</p>
            </div>
            <div class="row" style="gap: 8px">
              <select v-model="taxYear" aria-label="ปีภาษี">
                <option v-for="y in TAX_YEARS" :key="y" :value="y">ปี {{ y }}</option>
              </select>
              <button v-if="auth.isLoggedIn" class="btn btn-ghost btn-sm" type="button" :disabled="importing" @click="importFromLedger">
                <AppIcon name="wallet" :size="15" />
                ดึงจากสมุดบัญชี
              </button>
            </div>
          </div>

          <div v-for="c in HALF_YEAR_CATEGORIES" :key="c.key" class="half-income-row">
            <MoneyField v-model="income[c.key]" :label="`${c.label} · ${c.code}`" :hint="`หักเหมา ${c.expenseRate * 100}%`" />
            <template v-if="(income[c.key] ?? 0) > 0">
              <label class="check small">
                <input v-model="useActual[c.key]" type="checkbox" />
                <span>หักค่าใช้จ่ายตามจริงแทน</span>
              </label>
              <MoneyField v-if="useActual[c.key]" v-model="actual[c.key]" label="ค่าใช้จ่ายจริง ม.ค.–มิ.ย." />
            </template>
          </div>

          <MoneyField v-model="withholdingTax" label="ภาษีที่ถูกหัก ณ ที่จ่ายช่วง ม.ค.–มิ.ย." class="mt-2" />
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>ค่าลดหย่อนครึ่งปี</h3>
              <p>ส่วนตัว 30,000 บาทให้อัตโนมัติ ค่าลดหย่อนครอบครัวคิดกึ่งหนึ่งของทั้งปี</p>
            </div>
          </div>

          <label class="check mb-2">
            <input v-model="spouseNoIncome" type="checkbox" />
            <span>มีคู่สมรสที่ไม่มีเงินได้ (ลดหย่อน 30,000)</span>
          </label>

          <div class="field-grid">
            <div class="field">
              <label for="h-children">บุตร (คน)</label>
              <input id="h-children" v-model.number="dependents.children" type="number" min="0" max="20" />
              <p class="hint">คนละ 15,000</p>
            </div>
            <div class="field">
              <label for="h-bonus">บุตรคนที่ 2 ขึ้นไปที่เกิดตั้งแต่ 2561</label>
              <input id="h-bonus" v-model.number="dependents.childrenBonus" type="number" min="0" max="20" />
              <p class="hint">คนละ 30,000</p>
            </div>
            <div class="field">
              <label for="h-parents">บิดามารดา (คน)</label>
              <input id="h-parents" v-model.number="dependents.parents" type="number" min="0" max="4" />
              <p class="hint">คนละ 15,000</p>
            </div>
            <div class="field">
              <label for="h-disabled">คนพิการในอุปการะ (คน)</label>
              <input id="h-disabled" v-model.number="dependents.disabled" type="number" min="0" max="20" />
              <p class="hint">คนละ 30,000</p>
            </div>
            <MoneyField v-for="f in DEDUCTION_FIELDS" :key="f.key" v-model="deductions[f.key]" :label="f.label" :hint="f.hint" />
          </div>
          <p class="small muted mt-1">กองทุนสำรองเลี้ยงชีพและ กบข. ใช้ในแบบครึ่งปีไม่ได้ ใช้สิทธิได้ตอนยื่นสิ้นปี</p>
        </section>

        <div class="notice mt-2" :class="mustFile ? 'notice-warn' : ''">
          <strong>{{ mustFile ? 'ต้องยื่น ภ.ง.ด.94' : 'ยังไม่ถึงเกณฑ์ต้องยื่น' }}</strong>
          เกณฑ์คือเงินได้ 40(5)–40(8) ครึ่งปีตั้งแต่ 60,000 บาท (โสด) หรือ 120,000 บาท (สมรส)
          · ระบบไม่ได้คิดภาษีขั้นต่ำ 0.5% ในแบบครึ่งปี ตรวจกับกรมสรรพากรอีกครั้งถ้าเงินได้สูงมาก
        </div>
      </div>

      <div>
        <TaxSummaryCard :result="half.result" />
        <button class="btn btn-primary btn-block mt-2" type="button" :disabled="half.payable <= 0" @click="sendToAnnual">
          ใช้ยอดนี้หักในแบบสิ้นปี ({{ formatBaht(half.payable) }})
          <AppIcon name="arrowRight" :size="17" />
        </button>
      </div>
    </div>
  </div>
</template>
