<script setup lang="ts">
/** งบรายจ่ายต่อเดือนแยกหมวด พร้อมแถบว่าใช้ไปแล้วเท่าไร และโหมดแก้ไขงบ */
import { computed, reactive, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import MoneyField from './MoneyField.vue'
import { categoriesOf } from '@/data/workspaceModes'
import { ApiError } from '@/services/api'
import { formatBaht } from '@/services/taxEngine'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const ledger = useLedgerStore()
const toast = useToastStore()

const editing = ref(false)
const saving = ref(false)
const draft = reactive<Record<string, number>>({})

const expenseCategories = computed(() => categoriesOf(ledger.mode, 'expense'))
const hasBudgets = computed(() => ledger.budgetProgress.length > 0)

const totals = computed(() => {
  const limit = ledger.budgetProgress.reduce((sum, b) => sum + b.limit, 0)
  const spent = ledger.budgetProgress.reduce((sum, b) => sum + b.spent, 0)
  return { limit, spent, ratio: limit > 0 ? spent / limit : 0 }
})

/** ค่าเฉลี่ยรายจ่ายต่อเดือนของแต่ละหมวด ใช้เป็นตัวช่วยตั้งงบครั้งแรก */
const averageByKey = computed(() => {
  const months = Math.max(1, ledger.averages.months)
  return new Map(
    ledger.summary.byCategory
      .filter((row) => row.type === 'expense')
      .map((row) => [row.key, Math.round(row.amount / months)]),
  )
})

const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
}

function startEdit() {
  for (const key of Object.keys(draft)) delete draft[key]
  for (const c of expenseCategories.value) draft[c.key] = ledger.budgets[c.key] ?? 0
  editing.value = true
}

/** เติมงบทุกหมวดจากค่าเฉลี่ยจริง ปัดขึ้นเป็นหลักร้อย */
function fillFromAverage() {
  for (const c of expenseCategories.value) {
    const avg = averageByKey.value.get(c.key) ?? 0
    if (avg > 0) draft[c.key] = Math.ceil(avg / 100) * 100
  }
}

async function save() {
  saving.value = true
  try {
    await ledger.saveBudgets({ ...draft })
    toast.success('บันทึกงบประมาณแล้ว')
    editing.value = false
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'บันทึกงบประมาณไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="card budget-panel">
    <div class="card-head">
      <div>
        <h3>งบประมาณรายหมวด</h3>
        <p>ตั้งเพดานรายจ่ายต่อเดือนของแต่ละหมวด ระบบเตือนเมื่อใช้ไปถึง 80%</p>
      </div>
      <div class="row" style="gap: 8px">
        <select
          v-if="hasBudgets && !editing"
          v-model="ledger.budgetMonth"
          class="month-select"
          aria-label="เลือกเดือน"
        >
          <option v-for="month in ledger.budgetMonths" :key="month" :value="month">
            {{ monthLabel(month) }}
          </option>
        </select>
        <button v-if="!editing" class="btn btn-ghost btn-sm" type="button" @click="startEdit">
          <AppIcon name="edit" :size="15" />
          {{ hasBudgets ? 'แก้ไขงบ' : 'ตั้งงบประมาณ' }}
        </button>
      </div>
    </div>

    <!-- โหมดแก้ไข -->
    <form v-if="editing" novalidate @submit.prevent="save">
      <div class="row mb-2" style="justify-content: space-between">
        <p class="small muted">ใส่ 0 หรือเว้นว่างคือไม่ตั้งงบให้หมวดนั้น</p>
        <button
          v-if="averageByKey.size"
          class="btn btn-ghost btn-sm"
          type="button"
          @click="fillFromAverage"
        >
          <AppIcon name="spark" :size="15" />
          ตั้งตามค่าเฉลี่ยที่ใช้จริง
        </button>
      </div>
      <div class="field-grid">
        <MoneyField
          v-for="category in expenseCategories"
          :key="category.key"
          v-model="draft[category.key]"
          :label="category.label"
          :hint="
            averageByKey.get(category.key)
              ? `เฉลี่ยใช้จริงเดือนละ ${formatBaht(averageByKey.get(category.key)!)}`
              : ''
          "
        />
      </div>
      <div class="row" style="justify-content: flex-end; gap: 8px">
        <button class="btn btn-ghost" type="button" @click="editing = false">ยกเลิก</button>
        <button class="btn btn-primary" type="submit" :disabled="saving">
          {{ saving ? 'กำลังบันทึก...' : 'บันทึกงบประมาณ' }}
        </button>
      </div>
    </form>

    <!-- โหมดดู -->
    <template v-else>
      <div v-if="!hasBudgets" class="empty-state">
        <span class="ico-big"><AppIcon name="wallet" :size="24" /></span>
        <h3>ยังไม่ได้ตั้งงบประมาณ</h3>
        <p>ตั้งเพดานรายจ่ายต่อเดือน เช่น อาหารไม่เกิน 6,000 บาท แล้วดูว่าแต่ละหมวดใช้ไปแล้วเท่าไร</p>
      </div>

      <template v-else>
        <div class="budget-total">
          <span>
            {{ monthLabel(ledger.budgetMonth) }} ใช้ไป
            <strong class="num">{{ formatBaht(totals.spent) }}</strong>
            จากงบ {{ formatBaht(totals.limit) }}
          </span>
          <span class="badge" :class="totals.ratio > 1 ? 'badge-bad' : totals.ratio >= 0.8 ? 'badge-warn' : 'badge-ok'">
            {{ Math.round(totals.ratio * 100) }}%
          </span>
        </div>

        <div v-for="item in ledger.budgetProgress" :key="item.categoryKey" class="budget-row">
          <div class="budget-head">
            <strong>{{ item.label }}</strong>
            <span class="small">
              <span class="num">{{ formatBaht(item.spent) }}</span>
              <span class="muted"> / {{ formatBaht(item.limit) }}</span>
            </span>
          </div>
          <div class="budget-bar" :class="item.status" role="img" :aria-label="`${item.label} ใช้ไป ${Math.round(item.ratio * 100)}% ของงบ`">
            <span :style="{ width: `${Math.min(100, item.ratio * 100)}%` }"></span>
          </div>
          <p class="small" :class="item.status === 'over' ? 'text-bad' : item.status === 'warn' ? 'text-warn' : 'muted'">
            <template v-if="item.status === 'over'">เกินงบมาแล้ว {{ formatBaht(-item.remaining) }}</template>
            <template v-else-if="item.status === 'warn'">ใกล้เต็มงบ เหลืออีก {{ formatBaht(item.remaining) }}</template>
            <template v-else>เหลืออีก {{ formatBaht(item.remaining) }}</template>
          </p>
        </div>
      </template>
    </template>
  </section>
</template>
