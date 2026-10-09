<script setup lang="ts">
/**
 * กองทุนลดหย่อนของฉัน — จดวันซื้อและยอดซื้อ RMF / SSF / Thai ESG / Thai ESGX
 * แล้วบอกว่าแต่ละก้อนขายได้เมื่อไรโดยไม่ผิดเงื่อนไข (ขายก่อนต้องคืนภาษีพร้อมเงินเพิ่ม)
 */
import { computed, reactive, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import {
  FUND_KINDS,
  loadFunds,
  lotStatuses,
  rmfGaps,
  saveFunds,
  type FundBook,
  type FundKind,
} from '@/services/fundHoldings'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { useFilingStore } from '@/stores/filing'
import { useGameStore } from '@/stores/game'
import { localToday } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const filing = useFilingStore()
const game = useGameStore()
const toast = useToastStore()

const book = ref<FundBook>(auth.user ? loadFunds(auth.user.id) : { lots: [], birthDate: '' })
// วันเกิดที่กรอกไว้ในแบบภาษีแล้ว ไม่ต้องกรอกซ้ำ
if (!book.value.birthDate && filing.taxpayer.birthDate) book.value.birthDate = filing.taxpayer.birthDate

const today = localToday()
const form = reactive({ kind: 'thaiEsg' as FundKind, name: '', buyDate: today, amount: 0 })

const statuses = computed(() => lotStatuses(book.value.lots, today, book.value.birthDate || null))
const gaps = computed(() => rmfGaps(book.value.lots, today))
const totals = computed(() => {
  const sum = (list: typeof statuses.value) => list.reduce((s, x) => s + x.lot.amount, 0)
  return {
    all: sum(statuses.value),
    sellable: sum(statuses.value.filter((s) => s.sellable)),
    locked: sum(statuses.value.filter((s) => !s.sellable)),
  }
})

function persist() {
  if (!auth.user) return
  if (!saveFunds(auth.user.id, book.value)) toast.error('บันทึกไม่สำเร็จ พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม')
  game.scheduleRefresh()
}

watch(() => book.value.birthDate, persist)

function addLot() {
  if (form.amount <= 0) {
    toast.error('ยอดซื้อต้องมากกว่า 0')
    return
  }
  if (!form.buyDate || form.buyDate > today) {
    toast.error('ใส่วันที่ซื้อที่ไม่อยู่ในอนาคต')
    return
  }
  book.value.lots.push({
    id: `fund-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    kind: form.kind,
    name: form.name.trim() || FUND_KINDS[form.kind].label,
    buyDate: form.buyDate,
    amount: form.amount,
  })
  persist()
  toast.success(`บันทึก ${FUND_KINDS[form.kind].label} ${formatBaht(form.amount)} แล้ว`)
  form.amount = 0
  form.name = ''
}

function removeLot(id: string) {
  const lot = book.value.lots.find((l) => l.id === id)
  if (!lot || !confirm(`ลบ ${lot.name} ที่ซื้อเมื่อ ${thaiDate(lot.buyDate)} ออกจากรายการ?`)) return
  book.value.lots = book.value.lots.filter((l) => l.id !== id)
  persist()
}

function countdown(days: number | null): string {
  if (days === null) return 'ยังคำนวณไม่ได้'
  if (days === 0) return 'ขายได้แล้ว'
  if (days < 60) return `อีก ${days} วัน`
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  return `อีก ${years ? `${years} ปี ` : ''}${months ? `${months} เดือน` : ''}`.trim()
}
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">ค่าลดหย่อน</span>
        <h2>กองทุนลดหย่อนของฉัน</h2>
        <p>จดวันซื้อ RMF, SSF, Thai ESG และ Thai ESGX แล้วดูว่าแต่ละก้อนขายได้เมื่อไรโดยไม่ผิดเงื่อนไข</p>
      </div>

      <div class="notice notice-warn mb-3">
        <strong>ขายก่อนครบเงื่อนไข = คืนภาษีทั้งหมดที่เคยได้</strong>
        พร้อมเงินเพิ่ม 1.5% ต่อเดือน ตรวจวันที่ขายได้ที่นี่ก่อนสั่งขายทุกครั้ง และยืนยันกับ บลจ. อีกครั้ง
      </div>

      <div class="grid grid-2 mb-3">
        <section class="card">
          <div class="card-head">
            <div>
              <h3>เพิ่มการซื้อ</h3>
              <p>หนึ่งรายการต่อการซื้อหนึ่งครั้ง — ระยะถือนับจากวันซื้อแต่ละครั้ง</p>
            </div>
          </div>
          <form novalidate @submit.prevent="addLot">
            <div class="field">
              <label for="fund-kind">ประเภทกองทุน</label>
              <select id="fund-kind" v-model="form.kind">
                <option v-for="(info, key) in FUND_KINDS" :key="key" :value="key">{{ info.label }}</option>
              </select>
              <p class="hint">{{ FUND_KINDS[form.kind].rule }}</p>
            </div>
            <div class="field">
              <label for="fund-name">ชื่อกองทุน</label>
              <input id="fund-name" v-model="form.name" type="text" placeholder="ไม่บังคับ เช่น K-ESGSI-ThaiESG" />
            </div>
            <div class="field">
              <label for="fund-date">วันที่ซื้อ</label>
              <input id="fund-date" v-model="form.buyDate" type="date" :max="today" />
            </div>
            <MoneyField v-model="form.amount" label="ยอดซื้อ" />
            <button class="btn btn-primary btn-block" type="submit">
              <AppIcon name="plus" :size="17" />
              บันทึกการซื้อ
            </button>
          </form>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>ภาพรวม</h3>
              <p>{{ book.lots.length }} รายการ · ยอดซื้อรวม {{ formatBaht(totals.all) }}</p>
            </div>
          </div>
          <dl class="fund-summary">
            <div>
              <dt>ขายได้แล้ว</dt>
              <dd class="text-ok">{{ formatBaht(totals.sellable) }}</dd>
            </div>
            <div>
              <dt>ยังต้องถือต่อ</dt>
              <dd>{{ formatBaht(totals.locked) }}</dd>
            </div>
          </dl>
          <div class="field mt-2">
            <label for="fund-birth">วันเกิด (ใช้กับ RMF)</label>
            <input id="fund-birth" v-model="book.birthDate" type="date" :max="today" />
            <p class="hint">RMF ขายได้เมื่ออายุครบ 55 ปี และถือครบ 5 ปีนับจากก้อนแรก</p>
          </div>
          <div v-if="gaps.length" class="notice notice-warn mt-2" data-test="rmf-gap">
            <strong>RMF อาจผิดเงื่อนไขการลงทุนต่อเนื่อง</strong>
            ไม่พบการซื้อในปี
            {{ gaps.map(([a, b]) => `${a + 543}–${b + 543}`).join(', ') }}
            ติดต่อกันเกิน 1 ปี ถ้าซื้อไว้แต่ยังไม่ได้จด ให้เพิ่มรายการ ถ้าไม่ได้ซื้อจริง ตรวจกับ บลจ.
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card-head">
          <div>
            <h3>วันที่ขายได้ของแต่ละก้อน</h3>
            <p>เรียงจากก้อนที่ขายได้ก่อน</p>
          </div>
        </div>
        <p v-if="!statuses.length" class="muted">ยังไม่มีรายการ เพิ่มการซื้อครั้งแรกด้านบน</p>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>กองทุน</th>
                <th>วันที่ซื้อ</th>
                <th class="num">ยอดซื้อ</th>
                <th>ขายได้ตั้งแต่</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in statuses" :key="s.lot.id">
                <td data-label="กองทุน">
                  <strong>{{ s.lot.name }}</strong>
                  <div class="small muted">{{ FUND_KINDS[s.lot.kind].label }} · {{ s.note }}</div>
                </td>
                <td data-label="วันที่ซื้อ">{{ thaiDate(s.lot.buyDate) }}</td>
                <td data-label="ยอดซื้อ" class="num">{{ formatBaht(s.lot.amount) }}</td>
                <td data-label="ขายได้ตั้งแต่">
                  <span class="badge" :class="s.sellable ? 'badge-ok' : 'badge-muted'">{{ countdown(s.daysLeft) }}</span>
                  <div v-if="s.sellableOn" class="small muted">{{ thaiDate(s.sellableOn) }}</div>
                </td>
                <td>
                  <button
                    class="btn btn-ghost btn-sm"
                    type="button"
                    :aria-label="`ลบ ${s.lot.name} วันที่ ${thaiDate(s.lot.buyDate)}`"
                    @click="removeLot(s.lot.id)"
                  >
                    <AppIcon name="trash" :size="16" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.fund-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.fund-summary dt {
  font-size: 13px;
  color: var(--text-dim);
}
.fund-summary dd {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 600;
}
</style>
