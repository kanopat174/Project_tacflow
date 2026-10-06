<script setup lang="ts">
import { computed, reactive } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import TaxDocument, { type DocumentSection } from '@/components/TaxDocument.vue'
import {
  COMMON_ADD_BACKS,
  CORPORATE_FORMS,
  ENTITY_TYPES,
  LOSS_CARRYFORWARD_YEARS,
  SME_CAPITAL_LIMIT,
  SME_REVENUE_LIMIT,
} from '@/data/corporateTaxData'
import { calculateCorporateTax, type CorporateInput } from '@/services/corporateEngine'
import { formatBaht, formatPercent } from '@/services/taxEngine'

const form = reactive<CorporateInput & { formType: string; section8Percent: number }>({
  entityType: 'sme',
  paidUpCapital: 1_000_000,
  revenue: 0,
  expenses: 0,
  addBacks: 0,
  exemptIncome: 0,
  lossCarryforward: 0,
  withholdingTax: 0,
  halfYearTaxPaid: 0,
  section8Share: 0,
  section8Percent: 0,
  formType: CORPORATE_FORMS[0].value,
})

const result = computed(() =>
  calculateCorporateTax({ ...form, section8Share: form.section8Percent / 100 }),
)

const isFoundation = computed(() => form.entityType === 'foundation')
const isRefund = computed(() => result.value.balance < 0)

const documentSections = computed<DocumentSection[]>(() => [
  {
    title: 'ข้อมูลนิติบุคคล',
    rows: [
      {
        label: 'ประเภทนิติบุคคล',
        value: ENTITY_TYPES.find((e) => e.value === form.entityType)?.label ?? '-',
      },
      { label: 'แบบแสดงรายการ', value: form.formType },
      { label: 'ทุนจดทะเบียนที่ชำระแล้ว', value: formatBaht(form.paidUpCapital) },
    ],
  },
  {
    title: isFoundation.value ? 'รายได้' : 'การคำนวณกำไรสุทธิทางภาษี',
    rows: isFoundation.value
      ? [
          { label: 'รายได้ก่อนหักรายจ่าย', value: formatBaht(form.revenue), strong: true },
          { label: 'สัดส่วนเงินได้ตามมาตรา 40(8)', value: `${form.section8Percent}%` },
        ]
      : [
          { label: 'รายได้ทั้งสิ้น', value: formatBaht(form.revenue) },
          { label: 'หัก รายจ่ายทางบัญชี', value: `− ${formatBaht(form.expenses)}`, muted: true },
          { label: 'กำไรสุทธิทางบัญชี', value: formatBaht(result.value.accountingProfit), strong: true },
          { label: 'บวกกลับ รายจ่ายต้องห้าม', value: formatBaht(form.addBacks) },
          { label: 'หัก รายได้ที่ได้รับยกเว้น', value: `− ${formatBaht(form.exemptIncome)}`, muted: true },
          { label: 'หัก ผลขาดทุนยกมาที่ใช้ได้', value: `− ${formatBaht(result.value.lossApplied)}`, muted: true },
          { label: 'กำไรสุทธิทางภาษี', value: formatBaht(result.value.taxableProfit), strong: true },
        ],
  },
  {
    title: 'การคำนวณภาษี',
    rows: [
      ...result.value.bracketLines
        .filter((line) => line.amount > 0)
        .map((line) => ({
          label: `${line.label} · อัตรา ${formatPercent(line.rate, 0)}`,
          value: formatBaht(line.tax),
        })),
      { label: 'ภาษีที่คำนวณได้', value: formatBaht(result.value.tax), strong: true },
      { label: 'หัก ภาษีหัก ณ ที่จ่าย', value: `− ${formatBaht(result.value.withholdingTax)}`, muted: true },
      { label: 'หัก ภาษีที่ชำระตาม ภ.ง.ด.51', value: `− ${formatBaht(result.value.halfYearTaxPaid)}`, muted: true },
      { label: 'อัตราภาษีที่แท้จริง', value: formatPercent(result.value.effectiveRate) },
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
              <h3>ประเภทนิติบุคคล</h3>
              <p>อัตราภาษีและฐานที่ใช้คำนวณต่างกันตามประเภท</p>
            </div>
          </div>

          <div class="field">
            <label for="entity-type">ประเภท</label>
            <select id="entity-type" v-model="form.entityType">
              <option v-for="entity in ENTITY_TYPES" :key="entity.value" :value="entity.value">
                {{ entity.label }}
              </option>
            </select>
            <p class="hint">
              {{ ENTITY_TYPES.find((e) => e.value === form.entityType)?.hint }}
            </p>
          </div>

          <div class="field">
            <label for="corp-form">แบบแสดงรายการ</label>
            <select id="corp-form" v-model="form.formType">
              <option v-for="f in CORPORATE_FORMS" :key="f.value" :value="f.value">
                {{ f.label }}
              </option>
            </select>
            <p class="hint">{{ CORPORATE_FORMS.find((f) => f.value === form.formType)?.hint }}</p>
          </div>

          <MoneyField
            v-if="!isFoundation"
            v-model="form.paidUpCapital"
            label="ทุนจดทะเบียนที่ชำระแล้ว"
            :hint="`ไม่เกิน ${formatBaht(SME_CAPITAL_LIMIT)} จึงจะใช้สิทธิอัตรา SME ได้`"
          />

          <div v-if="result.smeWarning" class="notice notice-warn">
            <strong>ใช้สิทธิ SME ไม่ได้</strong>
            {{ result.smeWarning }}
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>{{ isFoundation ? 'รายได้ก่อนหักรายจ่าย' : 'รายได้และรายจ่าย' }}</h3>
              <p>
                {{
                  isFoundation
                    ? 'มูลนิธิและสมาคมเสียภาษีจากรายได้ ไม่ใช่จากกำไร รายจ่ายจึงไม่มีผลกับฐานภาษี'
                    : `รายได้ไม่เกิน ${formatBaht(SME_REVENUE_LIMIT)} จึงจะใช้สิทธิอัตรา SME ได้`
                }}
              </p>
            </div>
          </div>

          <div class="field-grid">
            <MoneyField v-model="form.revenue" label="รายได้ทั้งสิ้นในรอบบัญชี" />
            <MoneyField
              v-if="!isFoundation"
              v-model="form.expenses"
              label="รายจ่ายทางบัญชี"
              hint="รายจ่ายรวมตามงบกำไรขาดทุน"
            />
          </div>

          <div v-if="isFoundation" class="field">
            <label for="s8-share">
              สัดส่วนรายได้ที่เป็นเงินได้ตามมาตรา 40(8)
              <span class="num text-accent">{{ form.section8Percent }}%</span>
            </label>
            <input
              id="s8-share"
              v-model.number="form.section8Percent"
              type="range"
              min="0"
              max="100"
              step="5"
            />
            <p class="hint">
              เงินได้ตามมาตรา 40(8) เสียภาษี 2% ส่วนเงินได้ประเภทอื่นเสียภาษี 10% ของรายได้
            </p>
          </div>

          <div v-if="!isFoundation" class="notice notice-accent">
            <strong>กำไรสุทธิทางบัญชี {{ formatBaht(result.accountingProfit) }}</strong>
            ตัวเลขนี้ยังไม่ใช่ฐานภาษี ต้องปรับปรุงด้วยรายจ่ายต้องห้ามและรายได้ที่ได้รับยกเว้นก่อน
          </div>
        </section>

        <section v-if="!isFoundation" class="card">
          <div class="card-head">
            <div>
              <h3>รายการปรับปรุงทางภาษี</h3>
              <p>ปรับกำไรทางบัญชีให้เป็นกำไรสุทธิทางภาษีตามประมวลรัษฎากร</p>
            </div>
          </div>

          <div class="field-grid">
            <MoneyField
              v-model="form.addBacks"
              label="รายจ่ายต้องห้ามที่ต้องบวกกลับ"
              hint="รายจ่ายที่กฎหมายไม่ให้ถือเป็นรายจ่าย"
            />
            <MoneyField
              v-model="form.exemptIncome"
              label="รายได้ที่ได้รับยกเว้นภาษี"
              hint="เช่น กำไรจากกิจการที่ได้รับส่งเสริมการลงทุน (BOI)"
            />
            <MoneyField
              v-model="form.lossCarryforward"
              label="ผลขาดทุนสุทธิยกมา"
              :hint="`ยกมาได้ไม่เกิน ${LOSS_CARRYFORWARD_YEARS} รอบบัญชี`"
            />
          </div>

          <div v-if="result.lossRemaining > 0" class="notice notice-accent">
            <strong>ผลขาดทุนคงเหลือยกไปรอบถัดไป {{ formatBaht(result.lossRemaining) }}</strong>
            รอบบัญชีนี้มีกำไรไม่พอให้หักได้ทั้งจำนวน ส่วนที่เหลือใช้ในรอบถัดไปได้
          </div>

          <details class="mt-2">
            <summary class="muted small">ตัวอย่างรายจ่ายต้องห้ามที่พบบ่อย</summary>
            <ul class="bullet-list mt-1">
              <li v-for="item in COMMON_ADD_BACKS" :key="item">{{ item }}</li>
            </ul>
          </details>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>ภาษีที่ชำระไว้แล้ว</h3>
              <p>นำมาหักออกจากภาษีที่คำนวณได้ทั้งปี</p>
            </div>
          </div>
          <div class="field-grid">
            <MoneyField v-model="form.withholdingTax" label="ภาษีหัก ณ ที่จ่าย" />
            <MoneyField
              v-model="form.halfYearTaxPaid"
              label="ภาษีที่ชำระตาม ภ.ง.ด.51"
              hint="ภาษีครึ่งรอบบัญชีที่ยื่นไปแล้ว"
            />
          </div>
        </section>

        <section v-if="result.bracketLines.length" class="card">
          <div class="card-head">
            <div>
              <h3>ภาษีแยกตามขั้น</h3>
              <p>
                {{
                  isFoundation
                    ? 'คิดจากรายได้ก่อนหักรายจ่ายตามประเภทเงินได้'
                    : 'กำไรสุทธิทางภาษีถูกแบ่งเสียภาษีทีละขั้น'
                }}
              </p>
            </div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ขั้น</th>
                  <th class="right">อัตรา</th>
                  <th class="right">ฐานภาษีในขั้นนี้</th>
                  <th class="right">ภาษี</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in result.bracketLines" :key="line.label">
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
          <span class="eyebrow" style="margin: 0">ประมาณการภาษีนิติบุคคล</span>
          <span class="live-dot">อัปเดตเรียลไทม์</span>
        </div>

        <div class="headline-amount" aria-live="polite" aria-atomic="true">
          <span>{{ isRefund ? 'ยอดที่ขอคืนได้' : 'ภาษีที่ต้องชำระเพิ่ม' }}</span>
          <strong :class="{ refund: isRefund }">{{ formatBaht(Math.abs(result.balance)) }}</strong>
        </div>

        <div class="price-lines">
          <div class="price-line">
            <span class="lbl">{{ isFoundation ? 'รายได้ก่อนหักรายจ่าย' : 'กำไรสุทธิทางบัญชี' }}</span>
            <span class="val">
              {{ formatBaht(isFoundation ? form.revenue : result.accountingProfit) }}
            </span>
          </div>
          <div v-if="!isFoundation" class="price-line total">
            <span class="lbl">กำไรสุทธิทางภาษี</span>
            <span class="val">{{ formatBaht(result.taxableProfit) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">ภาษีที่คำนวณได้</span>
            <span class="val">{{ formatBaht(result.tax) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">หัก ภาษีที่ชำระไว้แล้ว</span>
            <span class="val">
              − {{ formatBaht(result.withholdingTax + result.halfYearTaxPaid) }}
            </span>
          </div>
          <div class="price-line">
            <span class="lbl">อัตราภาษีที่แท้จริง</span>
            <span class="val">{{ formatPercent(result.effectiveRate) }}</span>
          </div>
        </div>

        <div class="notice mt-3">
          <strong>อย่าลืมกำหนดเวลายื่น</strong>
          ภ.ง.ด.50 ยื่นภายใน 150 วันนับแต่วันสุดท้ายของรอบบัญชี ส่วน ภ.ง.ด.51 ยื่นภายใน 2 เดือน
          นับแต่วันสุดท้ายของ 6 เดือนแรก
        </div>
      </aside>
    </div>

    <TaxDocument
      title="ใบสรุปการคำนวณภาษีเงินได้นิติบุคคล"
      :subtitle="form.formType"
      :headline-label="isRefund ? 'ยอดที่ขอคืนได้' : 'ภาษีที่ต้องชำระเพิ่ม'"
      :headline-value="formatBaht(Math.abs(result.balance))"
      :sections="documentSections"
      note="ตัวเลขนี้ยังไม่รวมสิทธิประโยชน์เฉพาะกิจการ เช่น การส่งเสริมการลงทุน หรือรายจ่ายที่หักได้เพิ่มตามกฎหมายเฉพาะ"
    />
  </div>
</template>
