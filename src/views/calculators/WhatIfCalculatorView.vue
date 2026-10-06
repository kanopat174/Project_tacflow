<script setup lang="ts">
/**
 * จำลองสถานการณ์ "ถ้า…" — ลองขยับเงินเดือน งานเสริม และกองทุนลดหย่อน แล้วดูภาษีเปลี่ยนทันที
 * พร้อมเทียบรับงานในนามบุคคลกับจดบริษัท
 */
import { computed, reactive, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import { compareIncorporation, runScenario, type ScenarioInput } from '@/services/scenario'
import { formatBaht, formatPercent } from '@/services/taxEngine'
import { useFilingStore } from '@/stores/filing'
import { useToastStore } from '@/stores/toast'

const filing = useFilingStore()
const toast = useToastStore()

/* ---------- ตัวเลขตั้งต้น ---------- */

const base = reactive({ salary: 600_000, freelance: 0, business: 0, socialSecurity: 9_000 })
const baseIncome = computed(() => ({
  salary: base.salary,
  freelance: base.freelance,
  business: base.business,
}))
const baseDeductions = computed(() => ({ personal: 60_000, socialSecurity: base.socialSecurity }))

const hasFilingNumbers = computed(() => filing.result.grossIncome > 0)

/** ดึงเงินเดือน ฟรีแลนซ์ และธุรกิจจากแบบภาษีที่กรอกไว้ */
function useFilingNumbers() {
  base.salary = filing.income.salary || 0
  base.freelance = filing.income.freelance || 0
  base.business = filing.income.business || 0
  base.socialSecurity = filing.deductions.socialSecurity || 0
  toast.success('ใช้ตัวเลขจากแบบภาษีของคุณแล้ว')
}

/* ---------- สถานการณ์ ---------- */

const scenario = reactive<ScenarioInput>({ salaryChangePct: 0, extraFreelance: 0, extraFunds: 0 })

const PRESETS: { label: string; apply: Partial<ScenarioInput> }[] = [
  { label: 'ขึ้นเงินเดือน 10%', apply: { salaryChangePct: 10 } },
  { label: 'รับงานเสริม 200,000', apply: { extraFreelance: 200_000 } },
  { label: 'ซื้อกองทุนลดหย่อน 100,000', apply: { extraFunds: 100_000 } },
  { label: 'ล้างค่า', apply: { salaryChangePct: 0, extraFreelance: 0, extraFunds: 0 } },
]

const result = computed(() => runScenario(baseIncome.value, baseDeductions.value, 0, scenario))

const changed = computed(
  () => scenario.salaryChangePct !== 0 || scenario.extraFreelance > 0 || scenario.extraFunds > 0,
)

/** ความกว้างแท่งเทียบ อิงยอดเงินได้ที่มากกว่า */
const barMax = computed(() => Math.max(1, result.value.before.grossIncome, result.value.after.grossIncome))

function signed(value: number): string {
  if (value === 0) return formatBaht(0)
  return `${value > 0 ? '+' : '−'}${formatBaht(Math.abs(value))}`
}

/* ---------- จดบริษัท ---------- */

const company = reactive({ revenue: 1_500_000, costPct: 40 })
const incorporation = computed(() =>
  compareIncorporation({
    revenue: company.revenue,
    costPct: company.costPct,
    otherIncome: { salary: base.salary, freelance: base.freelance },
    deductions: baseDeductions.value,
  }),
)

const showCompany = ref(false)
</script>

<template>
  <div>
    <div class="work-layout">
      <div>
        <!-- ตัวเลขตั้งต้น -->
        <section class="card">
          <div class="card-head">
            <div>
              <h3>ตัวเลขตั้งต้น (ต่อปี)</h3>
              <p>สถานการณ์ด้านล่างจะคิดเทียบจากตัวเลขชุดนี้</p>
            </div>
            <button
              v-if="hasFilingNumbers"
              class="btn btn-ghost btn-sm"
              type="button"
              @click="useFilingNumbers"
            >
              <AppIcon name="file" :size="15" />
              ใช้ตัวเลขจากแบบภาษีของฉัน
            </button>
          </div>
          <div class="field-grid">
            <MoneyField v-model="base.salary" label="เงินเดือนและค่าจ้างทั้งปี" />
            <MoneyField v-model="base.freelance" label="งานฟรีแลนซ์ทั้งปี" />
            <MoneyField v-model="base.business" label="รายได้ธุรกิจทั้งปี" />
            <MoneyField v-model="base.socialSecurity" label="เงินสมทบประกันสังคม" :cap="9000" />
          </div>
        </section>

        <!-- ปรับสถานการณ์ -->
        <section class="card">
          <div class="card-head">
            <div>
              <h3>ถ้า…</h3>
              <p>เลื่อนแถบแล้วตัวเลขทางขวาเปลี่ยนทันที</p>
            </div>
          </div>

          <div class="chip-row mb-2">
            <button
              v-for="preset in PRESETS"
              :key="preset.label"
              type="button"
              class="chip"
              @click="Object.assign(scenario, preset.apply)"
            >
              {{ preset.label }}
            </button>
          </div>

          <div class="slider-field">
            <div class="slider-head">
              <label for="s-salary">เงินเดือนเปลี่ยน</label>
              <strong class="num">{{ scenario.salaryChangePct > 0 ? '+' : '' }}{{ scenario.salaryChangePct }}%</strong>
            </div>
            <input id="s-salary" v-model.number="scenario.salaryChangePct" type="range" min="-50" max="100" step="5" />
          </div>

          <div class="slider-field">
            <div class="slider-head">
              <label for="s-freelance">รับงานฟรีแลนซ์เพิ่มต่อปี</label>
              <strong class="num">{{ formatBaht(scenario.extraFreelance) }}</strong>
            </div>
            <input id="s-freelance" v-model.number="scenario.extraFreelance" type="range" min="0" max="2000000" step="10000" />
          </div>

          <div class="slider-field">
            <div class="slider-head">
              <label for="s-funds">ซื้อกองทุนลดหย่อนเพิ่ม (Thai ESG → SSF → RMF)</label>
              <strong class="num">{{ formatBaht(scenario.extraFunds) }}</strong>
            </div>
            <input id="s-funds" v-model.number="scenario.extraFunds" type="range" min="0" max="500000" step="5000" />
          </div>
        </section>

        <!-- เทียบจดบริษัท -->
        <section class="card">
          <div class="card-head">
            <div>
              <h3>รับงานเองหรือจดบริษัทดี?</h3>
              <p>เทียบภาษีรวมของรายได้ก้อนหนึ่ง ระหว่างรับในนามบุคคลกับจดเป็นบริษัท SME</p>
            </div>
            <button class="btn btn-ghost btn-sm" type="button" :aria-expanded="showCompany" @click="showCompany = !showCompany">
              {{ showCompany ? 'ซ่อน' : 'ลองเทียบ' }}
            </button>
          </div>

          <template v-if="showCompany">
            <div class="field-grid">
              <MoneyField v-model="company.revenue" label="รายได้จากงานหรือธุรกิจต่อปี" />
              <div class="slider-field">
                <div class="slider-head">
                  <label for="c-cost">ต้นทุนจริง</label>
                  <strong class="num">{{ company.costPct }}% ของรายได้</strong>
                </div>
                <input id="c-cost" v-model.number="company.costPct" type="range" min="0" max="90" step="5" />
              </div>
            </div>

            <div class="grid grid-2 mt-2">
              <div class="compare-box" :class="{ winner: incorporation.better === 'personal' }">
                <span class="eyebrow">รับในนามบุคคล</span>
                <strong class="num">{{ formatBaht(incorporation.personal.tax) }}</strong>
                <span class="small muted">ภาษีบุคคลธรรมดารวมเงินได้อื่น · หักค่าใช้จ่ายเหมา 60%</span>
                <span class="small">เหลือเข้ากระเป๋า {{ formatBaht(incorporation.personal.afterTax) }}</span>
              </div>
              <div class="compare-box" :class="{ winner: incorporation.better === 'company' }">
                <span class="eyebrow">จดบริษัท SME</span>
                <strong class="num">{{ formatBaht(incorporation.company.totalTax) }}</strong>
                <span class="small muted">
                  นิติบุคคล {{ formatBaht(incorporation.company.corporateTax) }} + ปันผล
                  {{ formatBaht(incorporation.company.dividendTax) }} + ภาษีส่วนตัว
                  {{ formatBaht(incorporation.company.ownerTax) }}
                </span>
                <span class="small">เหลือเข้ากระเป๋า {{ formatBaht(incorporation.company.afterTax) }}</span>
              </div>
            </div>

            <div class="notice mt-2" :class="incorporation.better === 'company' ? 'notice-accent' : ''">
              <strong>
                {{ incorporation.better === 'company'
                  ? `จดบริษัทเสียภาษีน้อยกว่า ${formatBaht(incorporation.saving)}`
                  : `รับในนามบุคคลเสียภาษีน้อยกว่า ${formatBaht(-incorporation.saving)}` }}
              </strong>
              แบบจำลองนี้ยังไม่รวมค่าทำบัญชี ค่าสอบบัญชี (ปีละราว 20,000–50,000 บาท) เงินเดือนกรรมการ
              และภาระเอกสาร ควรปรึกษานักบัญชีก่อนตัดสินใจ
            </div>
          </template>
        </section>
      </div>

      <!-- ผลเทียบ -->
      <aside class="summary-card">
        <div class="row" style="justify-content: space-between">
          <span class="eyebrow" style="margin: 0">ผลของสถานการณ์</span>
          <span class="live-dot">อัปเดตเรียลไทม์</span>
        </div>

        <div class="headline-amount" aria-live="polite" aria-atomic="true">
          <span>ภาษีเปลี่ยนไป</span>
          <strong :class="{ refund: result.taxChange < 0 }">{{ signed(result.taxChange) }}</strong>
        </div>

        <div class="whatif-bars">
          <div v-for="side in ['before', 'after'] as const" :key="side" class="whatif-row">
            <span class="whatif-label">{{ side === 'before' ? 'ตอนนี้' : 'ถ้า…' }}</span>
            <div class="whatif-track">
              <span class="keep" :style="{ width: `${(result[side].afterTax / barMax) * 100}%` }"></span>
              <span class="tax" :style="{ width: `${(result[side].tax / barMax) * 100}%` }"></span>
            </div>
          </div>
          <div class="whatif-legend small">
            <span><i class="keep"></i> เหลือหลังภาษี</span>
            <span><i class="tax"></i> ภาษี</span>
          </div>
        </div>

        <div class="price-lines">
          <div class="price-line">
            <span class="lbl">เงินได้ทั้งปี</span>
            <span class="val">{{ formatBaht(result.before.grossIncome) }} → {{ formatBaht(result.after.grossIncome) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">ภาษี</span>
            <span class="val">{{ formatBaht(result.before.tax) }} → {{ formatBaht(result.after.tax) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">อัตราภาษีที่แท้จริง</span>
            <span class="val">{{ formatPercent(result.before.effectiveRate) }} → {{ formatPercent(result.after.effectiveRate) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">ขั้นภาษีสูงสุด</span>
            <span class="val">{{ formatPercent(result.before.marginalRate, 0) }} → {{ formatPercent(result.after.marginalRate, 0) }}</span>
          </div>
          <div class="price-line total">
            <span class="lbl">เหลือหลังภาษีเปลี่ยนไป</span>
            <span class="val">{{ signed(result.afterTaxChange) }}</span>
          </div>
        </div>

        <div v-if="changed" class="notice mt-3">
          <template v-if="result.marginalTakeRate !== null">
            <strong>เงินได้ที่เพิ่มทุก 100 บาท เสียภาษี {{ (result.marginalTakeRate * 100).toFixed(0) }} บาท</strong>
            ส่วนที่เหลือเข้ากระเป๋าคุณจริง
          </template>
          <template v-else-if="result.fundsSpent > 0">
            <strong>ซื้อกองทุน {{ formatBaht(result.fundsSpent) }} ประหยัดภาษีได้ {{ formatBaht(-result.taxChange) }}</strong>
            เงินที่ซื้อกองทุนยังเป็นของคุณ แต่ต้องถือตามเงื่อนไขของกองทุนแต่ละประเภท
          </template>
          <template v-else>
            <strong>ปรับแถบด้านซ้ายเพื่อดูผล</strong>
          </template>
        </div>
      </aside>
    </div>
  </div>
</template>
