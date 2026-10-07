<script setup lang="ts">
/**
 * ยื่นหรือชำระภาษีล่าช้าต้องจ่ายเพิ่มเท่าไร และถ้ายื่นทันจะผ่อน 3 งวดได้อย่างไร
 * รับ ?tax=&year= จากหน้าสรุปแบบภาษีเพื่อเติมยอดให้อัตโนมัติ
 */
import { computed, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import TaxDocument, { type DocumentSection } from '@/components/TaxDocument.vue'
import { DEFAULT_TAX_YEAR, TAX_YEARS } from '@/data/taxData'
import {
  INSTALLMENT_MINIMUM,
  MAX_CRIMINAL_FINE,
  calculateLatePayment,
  canPayInInstallments,
  filingDeadline,
  installmentPlan,
  type FilingChannel,
} from '@/services/latePayment'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { localToday } from '@/stores/ledger'

const route = useRoute()
const today = localToday()

const queryYear = String(route.query.year ?? '')
const form = reactive({
  tax: Math.max(0, Number(route.query.tax) || 10_000),
  taxYear: (TAX_YEARS as readonly string[]).includes(queryYear) ? queryYear : (DEFAULT_TAX_YEAR as string),
  channel: 'online' as FilingChannel,
  deadline: '',
  filedDate: today,
  paidDate: today,
})

// เปลี่ยนปีหรือช่องทางแล้วตั้งกำหนดยื่นใหม่ ผู้ใช้ยังแก้วันเองได้ถ้าปีนั้นประกาศขยายต่างไป
watch(
  () => [form.taxYear, form.channel],
  () => (form.deadline = filingDeadline(form.taxYear, form.channel)),
  { immediate: true },
)

const result = computed(() => calculateLatePayment(form))
const plan = computed(() => installmentPlan(result.value.tax, form.deadline))
const installable = computed(() => canPayInInstallments(result.value.tax))

const documentSections = computed<DocumentSection[]>(() => [
  {
    title: 'ข้อมูลที่ใช้คำนวณ',
    rows: [
      { label: 'ปีภาษี', value: form.taxYear },
      { label: 'กำหนดยื่นแบบ', value: thaiDate(form.deadline) },
      { label: 'วันที่ยื่นแบบ', value: thaiDate(form.filedDate) },
      { label: 'วันที่ชำระภาษี', value: thaiDate(form.paidDate || form.filedDate) },
    ],
  },
  {
    title: 'ยอดที่ต้องชำระ',
    rows: [
      { label: 'ภาษีตามแบบ', value: formatBaht(result.value.tax) },
      { label: `เงินเพิ่ม 1.5% × ${result.value.months} เดือน`, value: formatBaht(result.value.surcharge) },
      { label: 'ค่าปรับอาญา (ประมาณการ)', value: formatBaht(result.value.fine) },
      { label: 'รวมทั้งสิ้น', value: formatBaht(result.value.total), strong: true },
    ],
  },
])

const NOTE =
  'เงินเพิ่มตามมาตรา 27 ขอลดไม่ได้ ส่วนค่าปรับอาญาตามมาตรา 35 สูงสุด 2,000 บาท ' +
  'ตัวเลขในใบนี้ใช้อัตราที่เจ้าหน้าที่มักเปรียบเทียบปรับ ยอดจริงขึ้นกับสำนักงานสรรพากรพื้นที่'

function exportPdf() {
  window.print()
}
</script>

<template>
  <div>
    <div class="notice notice-accent mb-3">
      <strong>ยื่นหรือจ่ายภาษีไม่ทันกำหนด</strong>
      ยื่นเองโดยไม่ถูกเรียกตรวจ เสียเงินเพิ่ม 1.5% ต่อเดือนกับค่าปรับอาญาเท่านั้น ไม่มีเบี้ยปรับ
      ยิ่งยื่นเร็วยิ่งจ่ายน้อย เพราะเศษของเดือนนับเป็นเดือนเต็ม
    </div>

    <div class="work-layout">
      <div>
        <section class="card">
          <div class="card-head">
            <div>
              <h3>ข้อมูลการยื่น</h3>
              <p>ใส่ภาษีที่ต้องชำระเพิ่มตามแบบ (หลังหักภาษีหัก ณ ที่จ่ายแล้ว)</p>
            </div>
          </div>

          <div class="field-grid">
            <MoneyField v-model="form.tax" label="ภาษีที่ต้องชำระเพิ่ม" hint="ใส่ 0 ถ้าไม่มีภาษีต้องชำระ" />
            <div class="field">
              <label for="lp-year">ปีภาษี</label>
              <select id="lp-year" v-model="form.taxYear">
                <option v-for="y in TAX_YEARS" :key="y" :value="y">{{ y }}</option>
              </select>
            </div>
            <div class="field">
              <label for="lp-channel">ช่องทางยื่น</label>
              <select id="lp-channel" v-model="form.channel">
                <option value="online">ยื่นออนไลน์ (e-Filing)</option>
                <option value="paper">ยื่นแบบกระดาษ</option>
              </select>
            </div>
            <div class="field">
              <label for="lp-deadline">กำหนดยื่นแบบ</label>
              <input id="lp-deadline" v-model="form.deadline" type="date" />
              <p class="hint">ยื่นออนไลน์มักขยายถึง 8 เมษายน แก้ได้ถ้าปีนั้นประกาศต่างไป</p>
            </div>
            <div class="field">
              <label for="lp-filed">วันที่ยื่นแบบ</label>
              <input id="lp-filed" v-model="form.filedDate" type="date" />
            </div>
            <div class="field">
              <label for="lp-paid">วันที่ชำระภาษี</label>
              <input id="lp-paid" v-model="form.paidDate" type="date" />
              <p class="hint">ชำระพร้อมยื่นให้ใส่วันเดียวกัน</p>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>ผ่อนชำระ 3 งวด ไม่มีเงินเพิ่ม</h3>
              <p>มาตรา 64 — ภาษีตั้งแต่ {{ formatBaht(INSTALLMENT_MINIMUM) }} และต้องยื่นภายในกำหนด</p>
            </div>
          </div>

          <div v-if="!installable" class="notice">
            <strong>ผ่อนไม่ได้</strong>
            {{ result.tax < INSTALLMENT_MINIMUM ? `ภาษีต่ำกว่า ${formatBaht(INSTALLMENT_MINIMUM)}` : '' }}
            ต้องชำระครั้งเดียวพร้อมยื่นแบบ
          </div>
          <template v-else>
            <div v-if="result.filedLate" class="notice notice-warn mb-2">
              <strong>ยื่นเกินกำหนดแล้วผ่อนไม่ได้</strong>
              ตารางด้านล่างคือสิ่งที่ได้ถ้ายื่นทันวันที่ {{ thaiDate(form.deadline) }}
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>งวด</th>
                    <th>ชำระภายใน</th>
                    <th class="right">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in plan" :key="p.index">
                    <td>งวดที่ {{ p.index }}{{ p.index === 1 ? ' (พร้อมยื่นแบบ)' : '' }}</td>
                    <td>{{ thaiDate(p.dueDate) }}</td>
                    <td class="money">{{ formatBaht(p.amount) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="small muted mt-1">
              งวดไหนจ่ายช้า งวดนั้นเสียเงินเพิ่ม 1.5% ต่อเดือนนับจากวันครบกำหนดของงวด
              เลือกผ่อนได้ตอนยื่นที่ e-Filing แล้วตั้งให้ตัดบัญชีอัตโนมัติได้
            </p>
          </template>
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
          <span class="eyebrow" style="margin: 0">ยื่นหรือชำระล่าช้า</span>
          <span class="live-dot">อัปเดตเรียลไทม์</span>
        </div>

        <div class="headline-amount" aria-live="polite" aria-atomic="true">
          <span>รวมที่ต้องจ่าย</span>
          <strong>{{ formatBaht(result.total) }}</strong>
        </div>

        <div class="price-lines">
          <div class="price-line">
            <span class="lbl">ภาษีตามแบบ</span>
            <span class="val">{{ formatBaht(result.tax) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">เงินเพิ่ม 1.5% × {{ result.months }} เดือน</span>
            <span class="val">{{ formatBaht(result.surcharge) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">ค่าปรับอาญา (ประมาณการ)</span>
            <span class="val">{{ formatBaht(result.fine) }}</span>
          </div>
          <div class="price-line total">
            <span class="lbl">รวมทั้งสิ้น</span>
            <span class="val">{{ formatBaht(result.total) }}</span>
          </div>
        </div>

        <div v-if="!result.filedLate && result.surcharge === 0" class="notice notice-accent mt-3">
          <strong>ยังทันกำหนด</strong>
          ยื่นและชำระภายใน {{ thaiDate(form.deadline) }} ไม่มีค่าใช้จ่ายเพิ่ม
        </div>
        <div v-else class="notice mt-3">
          <strong>{{ result.filedLate ? `ยื่นช้า ${result.daysLate} วัน` : 'ยื่นทันแต่ชำระช้า' }}</strong>
          <template v-if="result.filedLate">
            ค่าปรับอาญาสูงสุด {{ formatBaht(MAX_CRIMINAL_FINE) }} มักลดเหลือ 200 บาทถ้าช้าไม่เกิน 7 วัน
            และ 1,000 บาทถ้าช้ากว่านั้น
          </template>
          <template v-if="result.capped"> · เงินเพิ่มชนเพดานเท่ากับภาษีแล้ว</template>
        </div>
      </aside>
    </div>

    <TaxDocument
      title="ใบสรุปเงินเพิ่มและค่าปรับจากการยื่นล่าช้า"
      :subtitle="`ภาษีเงินได้บุคคลธรรมดา ปีภาษี ${form.taxYear}`"
      headline-label="รวมที่ต้องจ่าย"
      :headline-value="formatBaht(result.total)"
      :sections="documentSections"
      :note="NOTE"
    />
  </div>
</template>
