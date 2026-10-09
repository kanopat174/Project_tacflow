<script setup lang="ts">
import { computed, reactive } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import TaxDocument, { type DocumentSection } from '@/components/TaxDocument.vue'
import { VAT_RATE } from '@/data/vatData'
import { PAYEE_TYPES, WITHHOLDING_NOTE, WITHHOLDING_TYPES } from '@/data/withholdingData'
import { calculateWithholding, type WithholdingInput } from '@/services/withholdingEngine'
import { formatBaht, formatPercent } from '@/services/taxEngine'

const form = reactive<WithholdingInput>({
  amount: 100_000,
  amountIncludesVat: false,
  vatRegistered: true,
  typeKey: 'service',
  payeeType: 'juristic',
  vatRate: VAT_RATE,
})

const result = computed(() => calculateWithholding(form))

const selectedType = computed(
  () => WITHHOLDING_TYPES.find((t) => t.key === form.typeKey) ?? WITHHOLDING_TYPES[0]!,
)

/** อัตราของทุกประเภทสำหรับผู้รับที่เลือกไว้ ใช้ทำตารางอ้างอิง */
const rateTable = computed(() =>
  WITHHOLDING_TYPES.map((type) => ({
    key: type.key,
    label: type.label,
    rate: type.rates[form.payeeType],
    form: type.forms[form.payeeType],
  })),
)

const documentSections = computed<DocumentSection[]>(() => [
  {
    title: 'รายละเอียดการจ่ายเงิน',
    rows: [
      { label: 'ประเภทเงินได้', value: result.value.label },
      {
        label: 'ประเภทผู้รับเงิน',
        value: PAYEE_TYPES.find((p) => p.value === form.payeeType)?.label ?? '-',
      },
      { label: 'แบบที่ใช้นำส่ง', value: result.value.form },
    ],
  },
  {
    title: 'การคำนวณ',
    rows: [
      { label: 'ยอดก่อนภาษีมูลค่าเพิ่ม (ฐานที่ใช้หัก)', value: formatBaht(result.value.base), strong: true },
      { label: `ภาษีมูลค่าเพิ่ม ${formatPercent(form.vatRate, 0)}`, value: formatBaht(result.value.vat) },
      { label: 'ยอดรวมตามใบแจ้งหนี้', value: formatBaht(result.value.grossInvoice), strong: true },
      {
        label: `หัก ภาษี ณ ที่จ่าย ${result.value.rate === null ? '-' : formatPercent(result.value.rate, 0)}`,
        value: `− ${formatBaht(result.value.withholdingTax)}`,
        muted: true,
      },
      { label: 'ยอดที่โอนให้ผู้รับเงิน', value: formatBaht(result.value.netPayment), strong: true },
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
              <h3>รายละเอียดการจ่ายเงิน</h3>
              <p>ระบุประเภทเงินได้และประเภทผู้รับ เพราะอัตราและแบบที่ใช้นำส่งต่างกัน</p>
            </div>
          </div>

          <div class="field-grid">
            <div class="field">
              <label for="wht-type">ประเภทเงินได้ที่จ่าย</label>
              <select id="wht-type" v-model="form.typeKey">
                <option v-for="type in WITHHOLDING_TYPES" :key="type.key" :value="type.key">
                  {{ type.label }}
                </option>
              </select>
              <p class="hint">{{ selectedType.hint }}</p>
            </div>

            <div class="field">
              <label for="wht-payee">ผู้รับเงินเป็น</label>
              <select id="wht-payee" v-model="form.payeeType">
                <option v-for="payee in PAYEE_TYPES" :key="payee.value" :value="payee.value">
                  {{ payee.label }}
                </option>
              </select>
              <p class="hint">นำส่งด้วยแบบ {{ result.form }}</p>
            </div>
          </div>

          <MoneyField v-model="form.amount" label="ยอดเงินตามที่ตกลงกัน" />

          <label class="check">
            <input v-model="form.amountIncludesVat" type="checkbox" :disabled="!form.vatRegistered" />
            <span>
              ยอดข้างต้นรวมภาษีมูลค่าเพิ่มมาแล้ว
              <span class="muted small">— ระบบจะถอด VAT ออกก่อนคำนวณภาษีหัก ณ ที่จ่าย</span>
            </span>
          </label>

          <label class="check">
            <input v-model="form.vatRegistered" type="checkbox" />
            <span>ผู้รับเงินจดทะเบียนภาษีมูลค่าเพิ่ม</span>
          </label>

          <div v-if="result.notApplicable" class="notice notice-warn">
            <strong>ไม่ต้องหักภาษี ณ ที่จ่าย</strong>
            เงินได้ประเภท "{{ result.label }}" ไม่ต้องหักเมื่อผู้รับเงินเป็นบุคคลธรรมดา
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>ผลการคำนวณ</h3>
              <p>จุดที่ผิดกันบ่อยคือเผลอหักจากยอดที่รวม VAT แล้ว</p>
            </div>
          </div>

          <div class="price-lines">
            <div class="price-line">
              <span class="lbl">ยอดก่อนภาษีมูลค่าเพิ่ม (ฐานที่ใช้หัก)</span>
              <span class="val">{{ formatBaht(result.base) }}</span>
            </div>
            <div class="price-line">
              <span class="lbl">บวก ภาษีมูลค่าเพิ่ม</span>
              <span class="val">{{ formatBaht(result.vat) }}</span>
            </div>
            <div class="price-line total">
              <span class="lbl">ยอดรวมตามใบแจ้งหนี้</span>
              <span class="val">{{ formatBaht(result.grossInvoice) }}</span>
            </div>
            <div class="price-line">
              <span class="lbl">
                หัก ภาษี ณ ที่จ่าย
                <template v-if="result.rate !== null">
                  {{ formatPercent(result.rate, 0) }}
                </template>
              </span>
              <span class="val">− {{ formatBaht(result.withholdingTax) }}</span>
            </div>
          </div>

          <div class="notice notice-accent mt-2">
            <strong>โอนให้ผู้รับเงิน {{ formatBaht(result.netPayment) }}</strong>
            แล้วนำส่งภาษี {{ formatBaht(result.withholdingTax) }} ด้วยแบบ {{ result.form }}
            พร้อมออกหนังสือรับรองการหักภาษี ณ ที่จ่ายให้ผู้รับเงิน
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>ตารางอัตราอ้างอิง</h3>
              <p>
                อัตราสำหรับผู้รับเงินที่เป็น{{
                  PAYEE_TYPES.find((p) => p.value === form.payeeType)?.label
                }}
              </p>
            </div>
          </div>

          <div class="table-wrap table-fit">
            <table>
              <thead>
                <tr>
                  <th>ประเภทเงินได้</th>
                  <th class="right">อัตรา</th>
                  <th>แบบนำส่ง</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in rateTable"
                  :key="row.key"
                  :class="{ 'active-row': row.key === form.typeKey }"
                >
                  <td>{{ row.label }}</td>
                  <td class="money">
                    {{ row.rate === null ? 'ไม่ต้องหัก' : formatPercent(row.rate, 0) }}
                  </td>
                  <td>{{ row.form }}</td>
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
          <span class="eyebrow" style="margin: 0">ภาษีหัก ณ ที่จ่าย</span>
          <span class="live-dot">อัปเดตเรียลไทม์</span>
        </div>

        <div class="headline-amount" aria-live="polite" aria-atomic="true">
          <span>ยอดที่ต้องหักและนำส่ง</span>
          <strong>{{ formatBaht(result.withholdingTax) }}</strong>
        </div>

        <div class="price-lines">
          <div class="price-line">
            <span class="lbl">ฐานที่ใช้หัก</span>
            <span class="val">{{ formatBaht(result.base) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">อัตรา</span>
            <span class="val">
              {{ result.rate === null ? 'ไม่ต้องหัก' : formatPercent(result.rate, 0) }}
            </span>
          </div>
          <div class="price-line total">
            <span class="lbl">โอนให้ผู้รับเงิน</span>
            <span class="val">{{ formatBaht(result.netPayment) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">แบบที่ใช้นำส่ง</span>
            <span class="val">{{ result.form }}</span>
          </div>
        </div>

        <div class="notice mt-3">
          <strong>กำหนดเวลานำส่ง</strong>
          {{ WITHHOLDING_NOTE }}
        </div>
      </aside>
    </div>

    <TaxDocument
      title="ใบสรุปการคำนวณภาษีหัก ณ ที่จ่าย"
      :subtitle="`${result.label} · นำส่งด้วยแบบ ${result.form}`"
      headline-label="ยอดที่ต้องหักและนำส่ง"
      :headline-value="formatBaht(result.withholdingTax)"
      :sections="documentSections"
      :note="WITHHOLDING_NOTE"
    />
  </div>
</template>
