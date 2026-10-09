<script setup lang="ts">
/**
 * แผนปลดหนี้ — กรอกหนี้แต่ละก้อนกับงบที่จ่ายได้ต่อเดือน แล้วเทียบ Snowball กับ Avalanche
 * บอกวันที่หนี้หมด ดอกเบี้ยรวม และลำดับที่ควรโปะ
 * เงินที่ยืมคนอื่นในสมุด (ระบบเงินยืม) ดึงเข้ามาเป็นหนี้ดอกเบี้ย 0% ได้ในคลิกเดียว
 */
import { computed, reactive, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import { comparePlans, loadDebts, minimumTotal, monthAfter, saveDebts, type DebtBook, type Strategy } from '@/services/debtPlan'
import { loanBalances, openBalances } from '@/services/loans'
import { formatBaht } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { localToday } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const game = useGameStore()
const toast = useToastStore()
const today = localToday()

const book = ref<DebtBook>(auth.user ? loadDebts(auth.user.id) : { debts: [], budget: 0 })
const form = reactive({ name: '', balance: 0, rate: 0, minPayment: 0 })
const chosen = ref<Strategy>('avalanche')

watch(
  book,
  (value) => {
    if (auth.user && !saveDebts(auth.user.id, value)) toast.error('บันทึกไม่สำเร็จ พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม')
  },
  { deep: true },
)

const minimum = computed(() => minimumTotal(book.value.debts))
// ยังไม่ตั้งงบ ใช้ขั้นต่ำรวมไปก่อน
const budget = computed(() => book.value.budget || minimum.value)
const plan = computed(() => (book.value.debts.length ? comparePlans(book.value.debts, budget.value) : null))
const selected = computed(() => (plan.value ? plan.value[chosen.value] : null))
const totalDebt = computed(() => book.value.debts.reduce((s, d) => s + d.balance, 0))

/** หนี้ที่ยืมคนอื่นไว้ในสมุด แต่ยังไม่อยู่ในแผน */
const loanDebts = computed(() =>
  openBalances(loanBalances(game.entries))
    .filter((b) => b.iOwe > 0)
    .filter((b) => !book.value.debts.some((d) => d.id === `loan:${b.key}`)),
)

function newId() {
  return `debt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function addDebt() {
  if (!form.name.trim() || form.balance <= 0) {
    toast.error('ใส่ชื่อหนี้และยอดคงเหลือ')
    return
  }
  if (form.rate < 0 || form.rate > 100) {
    toast.error('ดอกเบี้ยต่อปีต้องอยู่ระหว่าง 0–100%')
    return
  }
  book.value.debts.push({ id: newId(), name: form.name.trim(), balance: form.balance, rate: form.rate, minPayment: form.minPayment })
  Object.assign(form, { name: '', balance: 0, rate: 0, minPayment: 0 })
}

function importLoans() {
  for (const b of loanDebts.value) {
    book.value.debts.push({ id: `loan:${b.key}`, name: `ยืม ${b.party}`, balance: b.iOwe, rate: 0, minPayment: 0 })
  }
  toast.success('ดึงเงินที่ยืมคนอื่นจากสมุดเข้ามาแล้ว ใส่ค่างวดที่ตกลงกันไว้ได้')
}

function removeDebt(id: string) {
  const debt = book.value.debts.find((d) => d.id === id)
  if (!debt || !confirm(`ลบ "${debt.name}" ออกจากแผน?`)) return
  book.value.debts = book.value.debts.filter((d) => d.id !== id)
}

function duration(months: number | null): string {
  if (months === null) return 'ไม่หมด — งบไม่พอจ่ายดอกเบี้ย'
  const years = Math.floor(months / 12)
  const rest = months % 12
  return [years ? `${years} ปี` : '', rest ? `${rest} เดือน` : ''].filter(Boolean).join(' ') || '0 เดือน'
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
function monthLabel(months: number | null): string {
  if (months === null) return '—'
  const [y, m] = monthAfter(today, months - 1).split('-').map(Number) as [number, number]
  return `${THAI_MONTHS[m - 1]} ${y + 543}`
}

/** กราฟยอดหนี้คงเหลือ — จุดสูงสุด 60 จุด */
const chart = computed(() => {
  const points = selected.value?.remaining ?? []
  if (!points.length) return ''
  const series = [totalDebt.value, ...points]
  const step = Math.max(1, Math.ceil(series.length / 60))
  const sampled = series.filter((_, i) => i % step === 0 || i === series.length - 1)
  const max = Math.max(...sampled, 1)
  return sampled.map((v, i) => `${(i / Math.max(1, sampled.length - 1)) * 100},${40 - (v / max) * 38}`).join(' ')
})
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">วางแผนการเงิน</span>
        <h2>แผนปลดหนี้</h2>
        <p>ใส่หนี้ทุกก้อนและงบที่จ่ายได้ต่อเดือน แล้วดูว่าโปะแบบไหนหมดเร็วและเสียดอกเบี้ยน้อยกว่า</p>
      </div>

      <div class="grid grid-2 mb-3">
        <section class="card">
          <div class="card-head">
            <div>
              <h3>เพิ่มหนี้</h3>
              <p>บัตรเครดิต สินเชื่อ ผ่อนของ หรือยืมคนรู้จัก</p>
            </div>
          </div>
          <form novalidate @submit.prevent="addDebt">
            <div class="field">
              <label for="debt-name">ชื่อหนี้</label>
              <input id="debt-name" v-model="form.name" type="text" placeholder="เช่น บัตรเครดิต KTC" />
            </div>
            <MoneyField v-model="form.balance" label="ยอดคงเหลือ" />
            <div class="field">
              <label for="debt-rate">ดอกเบี้ยต่อปี (%)</label>
              <input id="debt-rate" v-model.number="form.rate" type="number" min="0" max="100" step="0.01" inputmode="decimal" />
              <p class="hint">บัตรเครดิตส่วนใหญ่ 16% · บัตรกดเงินสด/สินเชื่อส่วนบุคคล 25% · ยืมคนรู้จักมักเป็น 0%</p>
            </div>
            <MoneyField v-model="form.minPayment" label="ค่างวดขั้นต่ำต่อเดือน" />
            <button class="btn btn-primary btn-block" type="submit">
              <AppIcon name="plus" :size="17" />
              เพิ่มหนี้
            </button>
          </form>
          <div v-if="loanDebts.length" class="notice mt-2">
            <strong>มีเงินที่ยืมคนอื่นในสมุด {{ loanDebts.length }} คน</strong>
            {{ loanDebts.map((b) => `${b.party} ${formatBaht(b.iOwe)}`).join(' · ') }}
            <button class="btn btn-ghost btn-sm mt-1" type="button" @click="importLoans">ดึงเข้ามาในแผน</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>งบปลดหนี้ต่อเดือน</h3>
              <p>หนี้รวม {{ formatBaht(totalDebt) }} · ขั้นต่ำรวม {{ formatBaht(minimum) }}</p>
            </div>
          </div>
          <MoneyField v-model="book.budget" label="จ่ายได้เดือนละ" hint="รวมขั้นต่ำทุกก้อนแล้ว ยิ่งมากยิ่งหมดเร็ว" />
          <div v-if="plan?.shortfall" class="notice notice-warn">
            งบน้อยกว่าขั้นต่ำรวม {{ formatBaht(plan.shortfall) }} — จ่ายไม่ครบขั้นต่ำจะเสียค่าปรับและเครดิตเสีย
          </div>

          <template v-if="plan">
            <div class="chip-row mb-2" role="radiogroup" aria-label="วิธีโปะหนี้">
              <button
                v-for="s in (['avalanche', 'snowball'] as Strategy[])"
                :key="s"
                type="button"
                class="chip"
                role="radio"
                :aria-checked="chosen === s"
                :class="{ selected: chosen === s }"
                @click="chosen = s"
              >
                {{ s === 'avalanche' ? 'ดอกสูงก่อน (Avalanche)' : 'ก้อนเล็กก่อน (Snowball)' }}
              </button>
            </div>
            <dl class="debt-summary">
              <div>
                <dt>หนี้หมดใน</dt>
                <dd>{{ duration(selected!.months) }}</dd>
              </div>
              <div>
                <dt>เดือนสุดท้าย</dt>
                <dd>{{ monthLabel(selected!.months) }}</dd>
              </div>
              <div>
                <dt>ดอกเบี้ยรวม</dt>
                <dd>{{ formatBaht(selected!.totalInterest) }}</dd>
              </div>
              <div>
                <dt>จ่ายขั้นต่ำอย่างเดียว</dt>
                <dd class="small">
                  {{ duration(plan.minimumOnly.months) }} · ดอก {{ formatBaht(plan.minimumOnly.totalInterest) }}
                </dd>
              </div>
            </dl>
            <p class="small muted">
              <template v-if="plan.avalancheSaves > 0">
                ดอกสูงก่อนประหยัดดอกเบี้ยกว่าก้อนเล็กก่อน {{ formatBaht(plan.avalancheSaves) }} ·
                ก้อนเล็กก่อนปิดก้อนแรกได้เร็วกว่า ช่วยให้มีกำลังใจ
              </template>
              <template v-else>สองวิธีให้ผลเท่ากันสำหรับหนี้ชุดนี้</template>
            </p>
            <svg v-if="chart" class="debt-chart" viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label="ยอดหนี้คงเหลือลดลงตามเวลา">
              <polyline :points="chart" fill="none" stroke="currentColor" stroke-width="1.2" vector-effect="non-scaling-stroke" />
            </svg>
          </template>
        </section>
      </div>

      <section class="card">
        <div class="card-head">
          <div>
            <h3>ลำดับการโปะ</h3>
            <p>จ่ายขั้นต่ำทุกก้อน เงินที่เหลือโปะก้อนแรกในลำดับ ปิดแล้วย้ายไปก้อนถัดไป</p>
          </div>
        </div>
        <p v-if="!book.debts.length" class="muted">ยังไม่มีหนี้ในแผน เพิ่มก้อนแรกด้านบน</p>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>หนี้</th>
                <th class="num">คงเหลือ</th>
                <th class="num">ดอกเบี้ย/ปี</th>
                <th class="num">ขั้นต่ำ</th>
                <th>ปิดได้</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="d in [...book.debts].sort(
                  (a, b) =>
                    (selected?.debts.find((x) => x.id === a.id)?.payoffMonth ?? 1e9) -
                    (selected?.debts.find((x) => x.id === b.id)?.payoffMonth ?? 1e9),
                )"
                :key="d.id"
              >
                <td data-label="หนี้"><strong>{{ d.name }}</strong></td>
                <td data-label="คงเหลือ" class="num">{{ formatBaht(d.balance) }}</td>
                <td data-label="ดอกเบี้ย/ปี" class="num">{{ d.rate }}%</td>
                <td data-label="ขั้นต่ำ" class="num">{{ formatBaht(d.minPayment) }}</td>
                <td data-label="ปิดได้">
                  {{ monthLabel(selected?.debts.find((x) => x.id === d.id)?.payoffMonth ?? null) }}
                  <div class="small muted">ดอก {{ formatBaht(selected?.debts.find((x) => x.id === d.id)?.interest ?? 0) }}</div>
                </td>
                <td>
                  <button class="btn btn-ghost btn-sm" type="button" :aria-label="`ลบ ${d.name}`" @click="removeDebt(d.id)">
                    <AppIcon name="trash" :size="16" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="small muted mt-2">ตัวเลขเป็นการประมาณ ดอกเบี้ยจริงขึ้นกับวิธีคิดของแต่ละสถาบัน (เช่นคิดรายวัน)</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.debt-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 8px;
}
.debt-summary dt {
  font-size: 13px;
  color: var(--text-dim);
}
.debt-summary dd {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 600;
}
.debt-chart {
  width: 100%;
  height: 90px;
  color: var(--accent);
  margin-top: 8px;
}
</style>
