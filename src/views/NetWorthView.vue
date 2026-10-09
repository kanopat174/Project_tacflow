<script setup lang="ts">
/**
 * มูลค่าสุทธิ — ทรัพย์สินทั้งหมดลบหนี้สินทั้งหมด ดูว่าฐานะการเงินดีขึ้นไหมในแต่ละเดือน
 * รายการจากหน้าอื่น (กองทุน เงินยืม แผนปลดหนี้) เติมให้อัตโนมัติ ไม่ต้องกรอกซ้ำ
 * เปิดหน้านี้หรือแก้รายการแล้วจดภาพรวมของเดือนนี้ให้เอง (เดือนละหนึ่งจุด)
 */
import { computed, reactive, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import { loadDebts } from '@/services/debtPlan'
import { loadFunds } from '@/services/fundHoldings'
import { loanBalances, loanTotals } from '@/services/loans'
import {
  ASSET_KINDS,
  LIABILITY_KINDS,
  changeSincePrevious,
  loadWorth,
  saveWorth,
  withSnapshot,
  worthTotals,
  type AutoItem,
  type WorthBook,
} from '@/services/netWorth'
import { formatBaht } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { localToday } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const game = useGameStore()
const toast = useToastStore()
const month = localToday().slice(0, 7)

const book = ref<WorthBook>(auth.user ? loadWorth(auth.user.id) : { assets: [], liabilities: [], snapshots: [] })
const form = reactive({ side: 'assets' as 'assets' | 'liabilities', name: '', kind: 'bank', amount: 0 })

watch(
  () => form.side,
  (side) => (form.kind = side === 'assets' ? 'bank' : 'credit'),
)

const autoAssets = computed<AutoItem[]>(() => {
  if (!auth.user) return []
  const items: AutoItem[] = []
  const funds = loadFunds(auth.user.id).lots.reduce((s, l) => s + l.amount, 0)
  if (funds > 0) items.push({ name: 'กองทุนลดหย่อน (ยอดซื้อ)', amount: funds, to: '/funds' })
  const { owedToMe } = loanTotals(loanBalances(game.entries))
  if (owedToMe > 0) items.push({ name: 'เงินที่คนอื่นยืมไป', amount: owedToMe, to: '/workspaces' })
  return items
})

const autoLiabilities = computed<AutoItem[]>(() => {
  if (!auth.user) return []
  const items: AutoItem[] = []
  const plan = loadDebts(auth.user.id).debts
  // หนี้เงินยืมที่ดึงเข้าแผนปลดหนี้แล้ว ไม่นับซ้ำกับระบบเงินยืม
  const fromLoans = plan.some((d) => d.id.startsWith('loan:'))
  for (const d of plan) items.push({ name: `${d.name} (แผนปลดหนี้)`, amount: d.balance, to: '/debts' })
  const { iOwe } = loanTotals(loanBalances(game.entries))
  if (iOwe > 0 && !fromLoans) items.push({ name: 'เงินที่ยืมคนอื่น', amount: iOwe, to: '/workspaces' })
  return items
})

const totals = computed(() => worthTotals(book.value, autoAssets.value, autoLiabilities.value))
const change = computed(() => changeSincePrevious(book.value, month, totals.value.net))

// จดภาพรวมเดือนนี้ทุกครั้งที่ตัวเลขเปลี่ยน
watch(
  totals,
  (t) => {
    if (!auth.user) return
    const current = book.value.snapshots.find((s) => s.month === month)
    if (current && current.assets === t.assets && current.liabilities === t.liabilities) return
    book.value = withSnapshot(book.value, month, t)
  },
  { immediate: true },
)
watch(
  book,
  (value) => {
    if (auth.user && !saveWorth(auth.user.id, value)) toast.error('บันทึกไม่สำเร็จ พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม')
  },
  { deep: true },
)

function addItem() {
  if (!form.name.trim() || form.amount <= 0) {
    toast.error('ใส่ชื่อและมูลค่า')
    return
  }
  book.value[form.side].push({
    id: `nw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: form.name.trim(),
    kind: form.kind,
    amount: form.amount,
  })
  form.name = ''
  form.amount = 0
}

function removeItem(side: 'assets' | 'liabilities', id: string) {
  book.value[side] = book.value[side].filter((i) => i.id !== id)
}

const kindLabel = (side: 'assets' | 'liabilities', kind: string) =>
  (side === 'assets' ? (ASSET_KINDS as Record<string, string>) : (LIABILITY_KINDS as Record<string, string>))[kind] ?? kind

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const monthName = (m: string) => `${THAI_MONTHS[Number(m.slice(5)) - 1]} ${(Number(m.slice(0, 4)) + 543) % 100}`

/** 12 เดือนล่าสุด เป็นแท่งมูลค่าสุทธิ */
const bars = computed(() => {
  const recent = book.value.snapshots.slice(-12).map((s) => ({ month: s.month, net: s.assets - s.liabilities }))
  const max = Math.max(1, ...recent.map((r) => Math.abs(r.net)))
  return recent.map((r) => ({ ...r, height: Math.max(2, (Math.abs(r.net) / max) * 100) }))
})
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">วางแผนการเงิน</span>
        <h2>มูลค่าสุทธิ</h2>
        <p>ทรัพย์สินทั้งหมด ลบ หนี้สินทั้งหมด — ตัวเลขเดียวที่บอกว่าฐานะการเงินดีขึ้นหรือแย่ลง</p>
      </div>

      <section class="card mb-3">
        <dl class="worth-summary">
          <div>
            <dt>ทรัพย์สิน</dt>
            <dd class="text-ok">{{ formatBaht(totals.assets) }}</dd>
          </div>
          <div>
            <dt>หนี้สิน</dt>
            <dd class="text-bad">{{ formatBaht(totals.liabilities) }}</dd>
          </div>
          <div>
            <dt>มูลค่าสุทธิ</dt>
            <dd :class="totals.net >= 0 ? '' : 'text-bad'">{{ formatBaht(totals.net) }}</dd>
            <p v-if="change !== null" class="small" :class="change >= 0 ? 'text-ok' : 'text-bad'">
              {{ change >= 0 ? '▲' : '▼' }} {{ formatBaht(Math.abs(change)) }} จากครั้งก่อน
            </p>
          </div>
        </dl>
        <div v-if="bars.length > 1" class="worth-bars" role="img" aria-label="มูลค่าสุทธิรายเดือน">
          <div v-for="b in bars" :key="b.month" class="worth-bar">
            <span :class="{ negative: b.net < 0 }" :style="{ height: `${b.height}%` }" :title="formatBaht(b.net)"></span>
            <small>{{ monthName(b.month) }}</small>
          </div>
        </div>
        <p v-else class="small muted mt-2">ระบบจดภาพรวมให้เดือนละครั้งเมื่อเปิดหน้านี้ เดือนหน้าจะเริ่มเห็นแนวโน้ม</p>
      </section>

      <div class="grid grid-2 mb-3">
        <section class="card">
          <div class="card-head">
            <div>
              <h3>เพิ่มรายการ</h3>
              <p>ใส่มูลค่าปัจจุบัน (ราคาตลาด) แก้ได้ทุกเมื่อ</p>
            </div>
          </div>
          <form novalidate @submit.prevent="addItem">
            <div class="chip-row mb-2" role="radiogroup" aria-label="ทรัพย์สินหรือหนี้สิน">
              <button
                v-for="s in (['assets', 'liabilities'] as const)"
                :key="s"
                type="button"
                class="chip"
                role="radio"
                :aria-checked="form.side === s"
                :class="{ selected: form.side === s }"
                @click="form.side = s"
              >
                {{ s === 'assets' ? 'ทรัพย์สิน' : 'หนี้สิน' }}
              </button>
            </div>
            <div class="field">
              <label for="nw-kind">ประเภท</label>
              <select id="nw-kind" v-model="form.kind">
                <option v-for="(label, k) in form.side === 'assets' ? ASSET_KINDS : LIABILITY_KINDS" :key="k" :value="k">
                  {{ label }}
                </option>
              </select>
            </div>
            <div class="field">
              <label for="nw-name">ชื่อ</label>
              <input id="nw-name" v-model="form.name" type="text" placeholder="เช่น ออมทรัพย์ SCB · คอนโด · ผ่อนรถ" />
            </div>
            <MoneyField v-model="form.amount" :label="form.side === 'assets' ? 'มูลค่า' : 'ยอดหนี้คงเหลือ'" />
            <button class="btn btn-primary btn-block" type="submit">
              <AppIcon name="plus" :size="17" />
              เพิ่ม
            </button>
          </form>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3>จากหน้าอื่นอัตโนมัติ</h3>
              <p>แก้ที่หน้าต้นทาง ตัวเลขที่นี่ตามให้เอง</p>
            </div>
          </div>
          <p v-if="!autoAssets.length && !autoLiabilities.length" class="muted">
            ยังไม่มี — จดกองทุนลดหย่อน เงินยืม หรือแผนปลดหนี้ แล้วจะขึ้นที่นี่
          </p>
          <ul class="worth-list">
            <li v-for="item in autoAssets" :key="`a${item.name}`">
              <RouterLink :to="item.to">{{ item.name }}</RouterLink>
              <span class="text-ok">{{ formatBaht(item.amount) }}</span>
            </li>
            <li v-for="item in autoLiabilities" :key="`l${item.name}`">
              <RouterLink :to="item.to">{{ item.name }}</RouterLink>
              <span class="text-bad">−{{ formatBaht(item.amount) }}</span>
            </li>
          </ul>
        </section>
      </div>

      <div class="grid grid-2">
        <section v-for="side in (['assets', 'liabilities'] as const)" :key="side" class="card">
          <div class="card-head">
            <div>
              <h3>{{ side === 'assets' ? 'ทรัพย์สิน' : 'หนี้สิน' }}ที่กรอกเอง</h3>
            </div>
          </div>
          <p v-if="!book[side].length" class="muted">ยังไม่มีรายการ</p>
          <ul v-else class="worth-list">
            <li v-for="item in book[side]" :key="item.id">
              <span>
                <strong>{{ item.name }}</strong>
                <small class="muted"> · {{ kindLabel(side, item.kind) }}</small>
              </span>
              <span class="worth-edit">
                <input
                  v-model.number="item.amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputmode="decimal"
                  :aria-label="`มูลค่าของ ${item.name}`"
                />
                <button class="btn btn-ghost btn-sm" type="button" :aria-label="`ลบ ${item.name}`" @click="removeItem(side, item.id)">
                  <AppIcon name="trash" :size="16" />
                </button>
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.worth-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.worth-summary dt {
  font-size: 13px;
  color: var(--text-dim);
}
.worth-summary dd {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 700;
}
.worth-summary p {
  margin: 2px 0 0;
}
.worth-bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 120px;
  margin-top: 16px;
}
.worth-bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  min-width: 0;
}
.worth-bar span {
  width: 100%;
  max-width: 36px;
  border-radius: 6px 6px 0 0;
  background: var(--accent);
}
.worth-bar span.negative {
  background: var(--bad);
}
.worth-bar small {
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
}
.worth-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.worth-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.worth-edit {
  display: flex;
  align-items: center;
  gap: 4px;
}
.worth-edit input {
  width: 130px;
  text-align: right;
}
@media (max-width: 560px) {
  .worth-summary {
    grid-template-columns: 1fr;
  }
}
</style>
