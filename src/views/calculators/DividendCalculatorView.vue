<script setup lang="ts">
import { computed, reactive } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import TaxDocument, { type DocumentSection } from '@/components/TaxDocument.vue'
import {
  DIVIDEND_WHT_RATE,
  FOREIGN_REMITTANCE_NOTE,
  INTEREST_WHT_RATE,
  PAYER_CIT_RATES,
} from '@/data/investmentTaxData'
import { calculateDividendTax, type DividendInput } from '@/services/investmentEngine'
import { formatBaht, formatPercent } from '@/services/taxEngine'

const form = reactive<DividendInput>({
  thaiDividend: 0,
  payerCitRate: 0.2,
  interest: 0,
  foreignDividend: 0,
  foreignTaxPaid: 0,
  otherNetIncome: 0,
})

const result = computed(() => calculateDividendTax(form))

const scenarios = computed(() => [result.value.final, result.value.included])
const bestScenario = computed(() =>
  result.value.better === 'included' ? result.value.included : result.value.final,
)

const documentSections = computed<DocumentSection[]>(() => [
  {
    title: 'เงินได้จากการลงทุน',
    rows: [
      { label: 'เงินปันผลจากบริษัทไทย', value: formatBaht(form.thaiDividend) },
      {
        label: `ภาษีหัก ณ ที่จ่าย ${formatPercent(DIVIDEND_WHT_RATE, 0)}`,
        value: formatBaht(result.value.thaiDividendWht),
        muted: true,
      },
      { label: 'ดอกเบี้ยเงินฝากและหุ้นกู้', value: formatBaht(form.interest) },
      {
        label: `ภาษีหัก ณ ที่จ่าย ${formatPercent(INTEREST_WHT_RATE, 0)}`,
        value: formatBaht(result.value.interestWht),
        muted: true,
      },
      { label: 'เงินปันผลจากต่างประเทศที่นำเข้าไทย', value: formatBaht(form.foreignDividend) },
      { label: 'เงินได้สุทธิจากแหล่งอื่น', value: formatBaht(form.otherNetIncome) },
    ],
  },
  {
    title: 'เครดิตภาษีเงินปันผล',
    rows: [
      {
        label: `อัตราภาษีนิติบุคคลของบริษัทผู้จ่าย ${formatPercent(form.payerCitRate, 0)}`,
        value: formatBaht(result.value.dividendCredit),
      },
      { label: 'เงินปันผลหลังบวกเครดิต (gross-up)', value: formatBaht(result.value.grossedUpDividend), strong: true },
    ],
  },
  {
    title: 'เปรียบเทียบสองทางเลือก',
    rows: [
      { label: 'ทางเลือก 1 — ภาษีหัก ณ ที่จ่ายเป็นภาษีสุดท้าย', value: formatBaht(result.value.final.totalTax) },
      { label: 'ทางเลือก 2 — นำมารวมคำนวณและใช้เครดิต', value: formatBaht(result.value.included.totalTax) },
      { label: 'ทางเลือกที่เสียภาษีน้อยกว่า', value: bestScenario.value.label, strong: true },
      { label: 'ประหยัดภาษีได้', value: formatBaht(result.value.saving), strong: true },
    ],
  },
])

function exportPdf() {
  window.print()
}
</script>

<template>
  <div>
    <div class="work-layout">
      <div>
        <section class="card">
          <div class="card-head">
            <div>
              <h3>เงินปันผลจากบริษัทไทย</h3>
              <p>กรอกยอดก่อนหักภาษี ณ ที่จ่าย ตามที่ระบุในหนังสือรับรองการหักภาษี</p>
            </div>
          </div>

          <div class="field-grid">
            <MoneyField
              v-model="form.thaiDividend"
              label="เงินปันผลทั้งปี (ก่อนหักภาษี)"
              :hint="`ถูกหักภาษี ณ ที่จ่าย ${formatPercent(DIVIDEND_WHT_RATE, 0)} = ${formatBaht(result.thaiDividendWht)}`"
            />
            <div class="field">
              <label for="cit-rate">อัตราภาษีนิติบุคคลของบริษัทผู้จ่าย</label>
              <select id="cit-rate" v-model.number="form.payerCitRate">
                <option v-for="rate in PAYER_CIT_RATES" :key="rate.label" :value="rate.value">
                  {{ rate.label }}
                </option>
              </select>
              <p class="hint">
                {{ PAYER_CIT_RATES.find((r) => r.value === form.payerCitRate)?.hint }}
              </p>
            </div>
          </div>

          <div v-if="result.dividendCredit > 0" class="notice notice-accent">
            <strong>เครดิตภาษีเงินปันผล {{ formatBaht(result.dividendCredit) }}</strong>
            บริษัทเสียภาษีนิติบุคคลไปแล้วก่อนจ่ายปันผล กฎหมายจึงให้นำภาษีส่วนนั้นมาเป็นเครดิตได้
            เมื่อเลือกนำเงินปันผลมารวมคำนวณ ระบบจะบวกเครดิตเข้าไปในเงินได้ก่อน (gross-up) เป็น
            {{ formatBaht(result.grossedUpDividend) }}
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>ดอกเบี้ยและเงินได้จากต่างประเทศ</h3>
              <p>ดอกเบี้ยเงินฝากและหุ้นกู้ถูกหักภาษี ณ ที่จ่าย {{ formatPercent(INTEREST_WHT_RATE, 0) }}</p>
            </div>
          </div>

          <div class="field-grid">
            <MoneyField
              v-model="form.interest"
              label="ดอกเบี้ยเงินฝากและหุ้นกู้"
              :hint="`ถูกหักภาษีไว้ ${formatBaht(result.interestWht)}`"
            />
            <MoneyField
              v-model="form.foreignDividend"
              label="เงินปันผลต่างประเทศที่นำเข้าไทยแล้ว"
              hint="เลือกเป็นภาษีสุดท้ายไม่ได้ ต้องนำมารวมคำนวณเสมอ"
            />
            <MoneyField
              v-model="form.foreignTaxPaid"
              label="ภาษีที่ถูกหักไว้ในต่างประเทศ"
              hint="ใช้เป็นเครดิตได้ไม่เกินภาษีไทยที่ตกกับเงินได้ก้อนนั้น"
            />
          </div>

          <div v-if="form.foreignDividend > 0" class="notice notice-warn">
            <strong>เงินได้จากต่างประเทศ</strong>
            {{ FOREIGN_REMITTANCE_NOTE }}
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>เงินได้สุทธิจากแหล่งอื่น</h3>
              <p>ตัวเลขนี้ตัดสินว่าคุณอยู่ขั้นภาษีไหน ซึ่งเป็นตัวชี้ขาดว่าทางเลือกไหนคุ้มกว่า</p>
            </div>
          </div>
          <MoneyField
            v-model="form.otherNetIncome"
            label="เงินได้สุทธิ (หลังหักค่าใช้จ่ายและค่าลดหย่อนแล้ว)"
            hint="ดูตัวเลขนี้ได้จากเครื่องคำนวณภาษีบุคคลธรรมดา"
          />
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>เปรียบเทียบสองทางเลือก</h3>
              <p>ตัวเลขที่เทียบกันคือภาระภาษีรวมทั้งปี ไม่ใช่ยอดที่จ่ายตอนยื่นแบบ</p>
            </div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ทางเลือก</th>
                  <th class="right">เงินได้สุทธิ</th>
                  <th class="right">ภาษีตามขั้นบันได</th>
                  <th class="right">เครดิตที่ใช้ได้</th>
                  <th class="right">ภาระภาษีรวม</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="scenario in scenarios"
                  :key="scenario.key"
                  :class="{ 'active-row': scenario.key === result.better }"
                >
                  <td>{{ scenario.label }}</td>
                  <td class="money">{{ formatBaht(scenario.netIncome) }}</td>
                  <td class="money">{{ formatBaht(scenario.progressiveTax) }}</td>
                  <td class="money">{{ formatBaht(scenario.credits) }}</td>
                  <td class="money">{{ formatBaht(scenario.totalTax) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="result.saving > 0" class="notice notice-accent mt-2">
            <strong>ควรเลือก: {{ bestScenario.label }}</strong>
            ประหยัดภาษีได้ {{ formatBaht(result.saving) }} เทียบกับอีกทางเลือกหนึ่ง
            <template v-if="result.better === 'included' && result.included.balance < 0">
              และยังขอคืนภาษีได้อีก {{ formatBaht(-result.included.balance) }} ตอนยื่นแบบ
            </template>
          </div>

          <div class="notice mt-2">
            <strong>หลักการจำง่าย</strong>
            ถ้าขั้นภาษีของคุณต่ำกว่าอัตราภาษีนิติบุคคลของบริษัทผู้จ่าย การนำเงินปันผลมารวมคำนวณจะคุ้มกว่า
            เพราะเครดิตที่ได้คืนมากกว่าภาษีที่เพิ่มขึ้น แต่ถ้าขั้นภาษีสูงกว่านั้น
            การปล่อยให้ภาษีหัก ณ ที่จ่ายเป็นภาษีสุดท้ายจะเสียภาษีน้อยกว่า
          </div>

          <div class="notice notice-warn mt-2">
            <strong>เลือกแล้วต้องเลือกทั้งหมด</strong>
            ถ้าตัดสินใจนำเงินปันผลมารวมคำนวณ ต้องนำเงินปันผลจากทุกบริษัทมารวมทั้งหมด
            เลือกเฉพาะบางรายการไม่ได้
          </div>
        </section>

        <div class="actions-bar no-print">
          <RouterLink class="btn btn-ghost" to="/calculator">
            <AppIcon name="arrowLeft" :size="18" />
            เลือกหมวดอื่น
          </RouterLink>
          <button class="btn btn-primary" type="button" @click="exportPdf">
            <AppIcon name="download" :size="18" />
            บันทึกเป็น PDF
          </button>
        </div>
      </div>

      <aside class="summary-card">
        <div class="row" style="justify-content: space-between">
          <span class="eyebrow" style="margin: 0">ทางเลือกที่คุ้มที่สุด</span>
          <span class="live-dot">อัปเดตเรียลไทม์</span>
        </div>

        <div class="headline-amount" aria-live="polite" aria-atomic="true">
          <span>ภาระภาษีรวมทั้งปี</span>
          <strong :class="{ refund: bestScenario.totalTax < 0 }">
            {{ formatBaht(Math.abs(bestScenario.totalTax)) }}
          </strong>
        </div>

        <div class="price-lines">
          <div class="price-line">
            <span class="lbl">วิธีที่ควรเลือก</span>
            <span class="val" style="font-size: 13px; text-align: right">
              {{ result.better === 'included' ? 'นำมารวมคำนวณ' : 'ภาษีสุดท้าย' }}
            </span>
          </div>
          <div class="price-line">
            <span class="lbl">เครดิตภาษีเงินปันผล</span>
            <span class="val">{{ formatBaht(result.dividendCredit) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">ภาษีหัก ณ ที่จ่ายที่ถูกหักไว้</span>
            <span class="val">{{ formatBaht(result.thaiDividendWht + result.interestWht) }}</span>
          </div>
          <div class="price-line total">
            <span class="lbl">ประหยัดได้เทียบอีกทางเลือก</span>
            <span class="val">{{ formatBaht(result.saving) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">ยอดชำระ/ขอคืนตอนยื่นแบบ</span>
            <span class="val">
              {{ bestScenario.balance < 0 ? 'ขอคืน ' : '' }}{{ formatBaht(Math.abs(bestScenario.balance)) }}
            </span>
          </div>
        </div>

        <div class="notice mt-3">
          <strong>เครดิตต้องมีหลักฐาน</strong>
          ต้องมีหนังสือรับรองการหักภาษี ณ ที่จ่ายที่ระบุอัตราภาษีนิติบุคคลของบริษัทผู้จ่าย
          จึงจะใช้เครดิตภาษีเงินปันผลได้
        </div>
      </aside>
    </div>

    <TaxDocument
      title="ใบสรุปการคำนวณภาษีเงินปันผลและดอกเบี้ย"
      subtitle="เปรียบเทียบระหว่างการให้ภาษีหัก ณ ที่จ่ายเป็นภาษีสุดท้าย กับการนำมารวมคำนวณเพื่อใช้เครดิตภาษี"
      headline-label="ภาระภาษีรวมของทางเลือกที่คุ้มที่สุด"
      :headline-value="formatBaht(Math.abs(bestScenario.totalTax))"
      :sections="documentSections"
      note="การเลือกนำเงินปันผลมารวมคำนวณต้องนำมารวมทุกรายการ และต้องมีหนังสือรับรองการหักภาษี ณ ที่จ่ายประกอบ"
    />
  </div>
</template>
