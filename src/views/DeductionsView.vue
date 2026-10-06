<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import DeductionAdvisor from '@/components/DeductionAdvisor.vue'
import DependentsField from '@/components/DependentsField.vue'
import { DEPENDENT_KEYS } from '@/data/dependents'
import {
  DEDUCTION_GROUPS,
  DEDUCTION_ITEMS,
  TAX_YEARS,
  isDeductionAvailable,
  LIFE_HEALTH_POOL_CAP,
  LIFE_HEALTH_POOL_KEYS,
  RETIREMENT_POOL_CAP,
  RETIREMENT_POOL_KEYS,
  type DeductionGroup,
} from '@/data/taxData'
import { calculateProgressiveTax, formatBaht, formatPercent } from '@/services/taxEngine'
import { useFilingStore } from '@/stores/filing'

/**
 * หน้านี้ผูกกับ store เดียวกับขั้นตอนที่ 3 ของแบบยื่น
 * ผู้ใช้กรอกลดหย่อนที่นี่แล้วเดินต่อไปยื่นแบบได้เลยโดยไม่ต้องพิมพ์ซ้ำ
 */
const filing = useFilingStore()

const GROUP_ORDER: DeductionGroup[] = ['personal', 'insurance', 'investment', 'housing', 'stimulus', 'donation']

/** แสดงเฉพาะรายการที่มีสิทธิในปีภาษีที่เลือก เช่น ไม่แสดง SSF ตั้งแต่ปี 2568 */
const groupedItems = computed(() =>
  GROUP_ORDER.map((group) => ({
    group,
    meta: DEDUCTION_GROUPS[group],
    items: DEDUCTION_ITEMS.filter(
      (item) => item.group === group && isDeductionAvailable(item, filing.taxpayer.taxYear),
    ),
  })).filter((block) => block.items.length > 0),
)

const result = computed(() => filing.result)

/** ยอดที่กรอกไว้ในกลุ่มที่ใช้เพดานรวมกัน — ใช้เตือนก่อนที่ระบบจะตัดให้ */
const poolUsage = computed(() => ({
  retirement: RETIREMENT_POOL_KEYS.reduce((sum, key) => sum + (filing.deductions[key] || 0), 0),
  lifeHealth: LIFE_HEALTH_POOL_KEYS.reduce((sum, key) => sum + (filing.deductions[key] || 0), 0),
}))

const allowedByKey = computed(
  () => new Map(result.value.deductionLines.map((line) => [line.key, line])),
)

/** ภาษีที่ประหยัดได้จากค่าลดหย่อนทั้งหมด เทียบกับกรณีไม่ใช้สิทธิใดเลย */
const taxSaved = computed(() => {
  const withoutDeduction = Math.max(calculateProgressiveTax(result.value.incomeAfterExpense), result.value.minimumTax.applies ? result.value.minimumTax.tax : 0)
  return Math.max(0, withoutDeduction - result.value.tax)
})

/** เพดานตามสัดส่วนต้องรู้เงินได้ก่อน — ถ้ายังไม่กรอกให้ชวนไปหน้าคำนวณ */
const hasIncome = computed(() => result.value.grossIncome > 0)

/** ผู้ใช้กด "ใส่ยอดนี้" จากผู้ช่วยแนะนำ — บวกเพิ่มจากยอดที่กรอกไว้เดิม */
function applySuggestion(key: string, amount: number) {
  filing.deductions[key] = (filing.deductions[key] || 0) + amount
}

function isDependent(key: string): boolean {
  return (DEPENDENT_KEYS as readonly string[]).includes(key)
}

function capFor(key: string): number | null {
  return allowedByKey.value.get(key)?.limit ?? null
}
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">ขั้นตอนที่ 2 — วางแผนลดหย่อน</span>
        <h2>คู่มือค่าลดหย่อนภาษี พร้อมเพดานของทุกรายการ</h2>
        <p>
          กรอกตัวเลขได้เลย ระบบจะตัดเพดานรายการ เพดานตามสัดส่วนเงินได้ และเพดานรวมของกลุ่มให้อัตโนมัติ
          ตัวเลขที่กรอกที่นี่จะติดไปกับแบบยื่นภาษีของคุณด้วย
        </p>
      </div>

      <div v-if="!hasIncome" class="notice notice-warn mb-3">
        <strong>ยังไม่ได้กรอกเงินได้</strong>
        ค่าลดหย่อนบางรายการมีเพดานเป็นสัดส่วนของเงินได้ เช่น กองทุนสำรองเลี้ยงชีพ 15% และ RMF 30%
        กรอกเงินได้ที่หน้าเครื่องคำนวณก่อน แล้วเพดานที่แสดงตรงนี้จะแม่นยำขึ้น
      </div>

      <div class="work-layout">
        <div>
          <DeductionAdvisor
            :income="filing.income"
            :deductions="filing.deductions"
            :withholding-tax="filing.withholdingTax"
            :options="filing.taxOptions"
            @apply="applySuggestion"
          />

          <div class="card year-picker">
            <label for="d-year">ปีภาษีที่วางแผน</label>
            <select id="d-year" v-model="filing.taxpayer.taxYear">
              <option v-for="year in TAX_YEARS" :key="year" :value="year">{{ year }}</option>
            </select>
            <p class="hint">สิทธิลดหย่อนบางรายการมีเฉพาะบางปี เช่น SSF สิ้นสุดปี 2567, Easy E-Receipt และ Thai ESGX มีเฉพาะปีที่ประกาศ</p>
          </div>
          <section v-for="block in groupedItems" :key="block.group" class="card">
            <div class="card-head">
              <div>
                <h3>{{ block.meta.label }}</h3>
                <p>{{ block.meta.hint }}</p>
              </div>
            </div>

            <!-- เตือนเพดานรวมของกลุ่มก่อนที่ระบบจะตัดยอดให้ -->
            <div
              v-if="block.group === 'insurance' && poolUsage.lifeHealth > LIFE_HEALTH_POOL_CAP"
              class="notice notice-warn mb-2"
            >
              <strong>เกินเพดานรวมประกันชีวิต + ประกันสุขภาพตนเอง</strong>
              กรอกไว้ {{ formatBaht(poolUsage.lifeHealth) }} แต่หักได้สูงสุด
              {{ formatBaht(LIFE_HEALTH_POOL_CAP) }} — ส่วนเกินจะไม่ถูกนำไปคำนวณ
            </div>
            <div
              v-if="block.group === 'investment' && poolUsage.retirement > RETIREMENT_POOL_CAP"
              class="notice notice-warn mb-2"
            >
              <strong>เกินเพดานรวมกองทุนเพื่อการเกษียณ</strong>
              กรอกไว้ {{ formatBaht(poolUsage.retirement) }} แต่ทุกกองทุนรวมกันหักได้ไม่เกิน
              {{ formatBaht(RETIREMENT_POOL_CAP) }}
            </div>

            <div v-for="item in block.items" :key="item.key" class="deduction-row">
              <div class="info">
                <strong>{{ item.label }}</strong>
                <p>{{ item.hint }}</p>
                <p
                  v-if="allowedByKey.get(item.key)?.cappedReason"
                  class="small text-bad"
                  style="margin-top: 4px"
                >
                  หักได้จริง {{ formatBaht(allowedByKey.get(item.key)!.allowed) }} —
                  {{ allowedByKey.get(item.key)!.cappedReason }}
                </p>
              </div>
              <div class="amount">
                <!-- บุตร บิดามารดา คนพิการ กรอกเป็นจำนวนคน ระบบคิดยอดให้ -->
                <DependentsField
                  v-if="isDependent(item.key)"
                  :item-key="item.key as (typeof DEPENDENT_KEYS)[number]"
                />
                <MoneyField
                  v-else
                  v-model="filing.deductions[item.key]"
                  label=""
                  :cap="capFor(item.key)"
                  :disabled="item.fixed"
                />
                <p v-if="item.fixed" class="hint">สิทธิอัตโนมัติ แก้ไขไม่ได้</p>
              </div>
            </div>
          </section>

          <div class="actions-bar">
            <RouterLink class="btn btn-ghost" to="/calculator/personal">
              <AppIcon name="arrowLeft" :size="18" />
              กลับไปแก้เงินได้
            </RouterLink>
            <RouterLink class="btn btn-primary" to="/filing">
              ไปยื่นแบบภาษี
              <AppIcon name="arrowRight" :size="18" />
            </RouterLink>
          </div>
        </div>

        <aside class="summary-card">
          <div class="row" style="justify-content: space-between">
            <span class="eyebrow" style="margin: 0">ผลของค่าลดหย่อน</span>
            <span class="live-dot">อัปเดตเรียลไทม์</span>
          </div>

          <div class="headline-amount" aria-live="polite" aria-atomic="true">
            <span>ภาษีที่ประหยัดได้จากการลดหย่อน</span>
            <strong class="refund">{{ formatBaht(taxSaved) }}</strong>
          </div>

          <div class="price-lines">
            <div class="price-line">
              <span class="lbl">ค่าลดหย่อนที่หักได้จริง</span>
              <span class="val">{{ formatBaht(result.usedDeduction) }}</span>
            </div>
            <div class="price-line">
              <span class="lbl">เงินได้สุทธิหลังลดหย่อน</span>
              <span class="val">{{ formatBaht(result.netIncome) }}</span>
            </div>
            <div class="price-line">
              <span class="lbl">ภาษีที่ต้องเสีย</span>
              <span class="val">{{ formatBaht(result.tax) }}</span>
            </div>
            <div class="price-line">
              <span class="lbl">ขั้นภาษีสูงสุดที่ถึง</span>
              <span class="val">{{ formatPercent(result.marginalRate, 0) }}</span>
            </div>
          </div>

          <div class="notice mt-3">
            <strong>อย่าลืมเก็บหลักฐาน</strong>
            ทุกรายการที่ใช้สิทธิต้องมีใบเสร็จหรือหนังสือรับรอง แนบเก็บไว้ได้ที่หน้าเอกสาร
          </div>
        </aside>
      </div>
    </div>
  </main>
</template>
