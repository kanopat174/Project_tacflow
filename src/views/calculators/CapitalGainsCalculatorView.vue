<script setup lang="ts">
import { computed, reactive } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import TaxDocument, { type DocumentSection } from '@/components/TaxDocument.vue'
import { FOREIGN_REMITTANCE_NOTE, STOCK_SALE_TYPES } from '@/data/investmentTaxData'
import { calculateCapitalGainsTax, type CapitalGainsInput } from '@/services/investmentEngine'
import { formatBaht, formatPercent } from '@/services/taxEngine'

const form = reactive<CapitalGainsInput>({
  setGain: 0,
  thaiFundGain: 0,
  otcGain: 0,
  foreignGain: 0,
  foreignRemitted: 0,
  foreignTaxPaid: 0,
  otherNetIncome: 0,
})

const result = computed(() => calculateCapitalGainsTax(form))

const hasGains = computed(() => result.value.totalGain > 0)
const notYetRemitted = computed(() => Math.max(0, form.foreignGain - form.foreignRemitted))

const documentSections = computed<DocumentSection[]>(() => [
  {
    title: 'กำไรจากการขายหลักทรัพย์',
    rows: [
      ...result.value.lines.map((line) => ({ label: line.label, value: formatBaht(line.gain) })),
      { label: 'รวมกำไรทั้งสิ้น', value: formatBaht(result.value.totalGain), strong: true },
    ],
  },
  {
    title: 'การแยกส่วนที่ยกเว้นและส่วนที่ต้องเสียภาษี',
    rows: [
      { label: 'กำไรที่ได้รับยกเว้นภาษี', value: formatBaht(result.value.exemptGain), muted: true },
      { label: 'กำไรที่ต้องนำมารวมคำนวณ', value: formatBaht(result.value.taxableGain), strong: true },
      { label: 'เงินได้สุทธิจากแหล่งอื่น', value: formatBaht(form.otherNetIncome) },
      { label: 'เงินได้สุทธิรวม', value: formatBaht(result.value.netIncome), strong: true },
    ],
  },
  {
    title: 'ภาษีที่ต้องเสีย',
    rows: [
      { label: 'ภาษีรวมจากเงินได้สุทธิ', value: formatBaht(result.value.totalTax) },
      { label: 'ภาษีที่เกิดจากกำไรหุ้นโดยเฉพาะ', value: formatBaht(result.value.taxOnGains) },
      {
        label: 'หัก เครดิตภาษีต่างประเทศ',
        value: `− ${formatBaht(result.value.foreignTaxCredit)}`,
        muted: true,
      },
      { label: 'ภาษีที่ต้องชำระ', value: formatBaht(result.value.taxPayable), strong: true },
      { label: 'ภาษีที่ประหยัดได้จากสิทธิยกเว้น', value: formatBaht(result.value.taxSavedByExemption) },
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
        <!-- สรุปกติกาก่อน เพราะประเด็นหลักของหมวดนี้คือ "ก้อนไหนต้องเสียภาษี" -->
        <section class="card">
          <div class="card-head">
            <div>
              <h3>กติกาสำคัญของกำไรจากการขายหุ้น</h3>
              <p>สำหรับผู้เสียภาษีที่เป็นบุคคลธรรมดา</p>
            </div>
          </div>

          <div v-for="type in STOCK_SALE_TYPES" :key="type.key" class="rule-row">
            <span class="badge" :class="type.exemptForIndividual ? 'badge-ok' : 'badge-warn'">
              {{ type.exemptForIndividual ? 'ยกเว้นภาษี' : 'ต้องเสียภาษี' }}
            </span>
            <div>
              <strong>{{ type.label }}</strong>
              <p class="muted small">{{ type.hint }}</p>
            </div>
          </div>

          <div class="notice notice-warn mt-2">
            <strong>ข้อยกเว้นนี้ใช้กับบุคคลธรรมดาเท่านั้น</strong>
            ถ้าผู้ขายเป็นนิติบุคคล กำไรจากการขายหุ้นในตลาดหลักทรัพย์ต้องนำไปรวมเป็นรายได้
            เพื่อคำนวณภาษีเงินได้นิติบุคคลตามปกติ
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>หุ้นไทย</h3>
              <p>แยกให้ชัดว่าขายผ่านตลาดหลักทรัพย์หรือโอนกันเอง เพราะผลทางภาษีต่างกันสิ้นเชิง</p>
            </div>
          </div>

          <div class="field-grid">
            <MoneyField
              v-model="form.setGain"
              label="กำไรจากหุ้นไทยในตลาดหลักทรัพย์ (SET / mai)"
              hint="ได้รับยกเว้นภาษีทั้งจำนวน ไม่ต้องนำมารวมคำนวณ"
            />
            <MoneyField
              v-model="form.thaiFundGain"
              label="กำไรจากการขายคืนหน่วยลงทุนกองทุนรวมไทย"
              hint="ได้รับยกเว้นเช่นกัน แต่เงินปันผลจากกองทุนยังต้องเสียภาษี"
            />
            <MoneyField
              v-model="form.otcGain"
              label="กำไรจากการโอนหุ้นนอกตลาดหลักทรัพย์"
              hint="เงินได้ตามมาตรา 40(4)(ช) ต้องนำมารวมคำนวณ"
            />
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>หุ้นต่างประเทศ</h3>
              <p>เสียภาษีตามจำนวนที่นำเงินเข้ามาในประเทศไทย ไม่ใช่ตามกำไรที่เกิดขึ้นทั้งหมด</p>
            </div>
          </div>

          <div class="field-grid">
            <MoneyField
              v-model="form.foreignGain"
              label="กำไรจากการขายหุ้นต่างประเทศทั้งหมด"
              hint="กำไรที่เกิดขึ้นจริงในบัญชีต่างประเทศ"
            />
            <MoneyField
              v-model="form.foreignRemitted"
              label="ส่วนที่นำเงินเข้าประเทศไทยแล้ว"
              hint="เฉพาะส่วนนี้ที่ถูกนำมาคำนวณภาษี"
            />
            <MoneyField
              v-model="form.foreignTaxPaid"
              label="ภาษีที่ถูกหักไว้ในต่างประเทศ"
              hint="ใช้เป็นเครดิตได้ไม่เกินภาษีไทยที่ตกกับกำไรก้อนนั้น"
            />
          </div>

          <div v-if="notYetRemitted > 0" class="notice notice-accent">
            <strong>ยังไม่นำเข้าไทย {{ formatBaht(notYetRemitted) }}</strong>
            ส่วนนี้ยังไม่ถูกประเมินภาษีในปีนี้ แต่จะเสียภาษีเมื่อนำเงินเข้าประเทศไทยในปีใดก็ตาม
          </div>

          <div v-if="form.foreignGain > 0" class="notice notice-warn mt-2">
            <strong>เกณฑ์เงินได้จากต่างประเทศเพิ่งเปลี่ยน</strong>
            {{ FOREIGN_REMITTANCE_NOTE }}
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>เงินได้สุทธิจากแหล่งอื่น</h3>
              <p>กำไรที่ต้องเสียภาษีจะถูกนำไปต่อยอดจากฐานนี้ ทำให้อาจขยับขึ้นขั้นภาษีถัดไป</p>
            </div>
          </div>
          <MoneyField
            v-model="form.otherNetIncome"
            label="เงินได้สุทธิ (หลังหักค่าใช้จ่ายและค่าลดหย่อนแล้ว)"
            hint="ดูตัวเลขนี้ได้จากเครื่องคำนวณภาษีบุคคลธรรมดา"
          />
        </section>

        <section v-if="hasGains" class="card">
          <div class="card-head">
            <div>
              <h3>สรุปรายก้อน</h3>
              <p>กำไรแต่ละก้อนถูกจัดประเภทอย่างไร</p>
            </div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ประเภท</th>
                  <th class="right">กำไร</th>
                  <th class="right">ยกเว้น</th>
                  <th class="right">ต้องเสียภาษี</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in result.lines" :key="line.key">
                  <td>
                    {{ line.label }}
                    <p class="muted small">{{ line.note }}</p>
                  </td>
                  <td class="money">{{ formatBaht(line.gain) }}</td>
                  <td class="money">{{ formatBaht(line.exempt) }}</td>
                  <td class="money">{{ formatBaht(line.taxable) }}</td>
                </tr>
                <tr>
                  <td><strong>รวม</strong></td>
                  <td class="money"><strong>{{ formatBaht(result.totalGain) }}</strong></td>
                  <td class="money"><strong>{{ formatBaht(result.exemptGain) }}</strong></td>
                  <td class="money"><strong>{{ formatBaht(result.taxableGain) }}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="result.taxSavedByExemption > 0" class="notice notice-accent mt-2">
            <strong>สิทธิยกเว้นช่วยประหยัดภาษีได้ {{ formatBaht(result.taxSavedByExemption) }}</strong>
            เทียบกับกรณีที่กำไรทุกก้อนต้องนำมารวมคำนวณ
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
          <span class="eyebrow" style="margin: 0">ภาษีจากกำไรหุ้น</span>
          <span class="live-dot">อัปเดตเรียลไทม์</span>
        </div>

        <div class="headline-amount" aria-live="polite" aria-atomic="true">
          <span>ภาษีที่ต้องชำระจากกำไรหุ้น</span>
          <strong>{{ formatBaht(Math.max(0, result.taxOnGains - result.foreignTaxCredit)) }}</strong>
        </div>

        <div class="price-lines">
          <div class="price-line">
            <span class="lbl">กำไรทั้งสิ้น</span>
            <span class="val">{{ formatBaht(result.totalGain) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">ส่วนที่ได้รับยกเว้น</span>
            <span class="val">− {{ formatBaht(result.exemptGain) }}</span>
          </div>
          <div class="price-line total">
            <span class="lbl">ส่วนที่ต้องเสียภาษี</span>
            <span class="val">{{ formatBaht(result.taxableGain) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">ภาษีรวมทั้งหมด</span>
            <span class="val">{{ formatBaht(result.totalTax) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">หัก เครดิตภาษีต่างประเทศ</span>
            <span class="val">− {{ formatBaht(result.foreignTaxCredit) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">อัตราภาษีจริงของกำไรที่ต้องเสีย</span>
            <span class="val">{{ formatPercent(result.effectiveRateOnGains) }}</span>
          </div>
        </div>

        <div class="notice mt-3">
          <strong>เก็บหลักฐานต้นทุน</strong>
          กำไรคือราคาขายหักต้นทุนและค่าธรรมเนียม ต้องมีรายงานจากโบรกเกอร์รองรับ
          โดยเฉพาะหุ้นต่างประเทศที่ต้องแปลงค่าเงินตามวันที่เกิดรายการ
        </div>
      </aside>
    </div>

    <TaxDocument
      title="ใบสรุปการคำนวณภาษีจากกำไรการขายหุ้น"
      subtitle="แยกกำไรที่ได้รับยกเว้นออกจากกำไรที่ต้องนำมารวมคำนวณ"
      headline-label="ภาษีที่ต้องชำระจากกำไรหุ้น"
      :headline-value="formatBaht(Math.max(0, result.taxOnGains - result.foreignTaxCredit))"
      :sections="documentSections"
      note="สิทธิยกเว้นสำหรับหุ้นในตลาดหลักทรัพย์ใช้กับบุคคลธรรมดาเท่านั้น และเกณฑ์เงินได้จากต่างประเทศเปลี่ยนแปลงเมื่อไม่นานมานี้"
    />
  </div>
</template>
