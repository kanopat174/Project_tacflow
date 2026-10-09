<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MonthlyChart from '@/components/MonthlyChart.vue'
import TaxCalendarCard from '@/components/TaxCalendarCard.vue'
import LoanSummaryCard from '@/components/LoanSummaryCard.vue'
import YearEndCountdown from '@/components/YearEndCountdown.vue'
import LiveTaxCard from '@/components/LiveTaxCard.vue'
import TaxSeasonCard from '@/components/TaxSeasonCard.vue'
import WeeklyRecapCard from '@/components/WeeklyRecapCard.vue'
import Mascot from '@/components/Mascot.vue'
import { useGameStore } from '@/stores/game'
import RankedBars, { type RankedRow } from '@/components/RankedBars.vue'
import { STATUS_META } from '@/data/filingStatus'
import { categoryLabel, modeDefinition } from '@/data/workspaceModes'
import { ApiError, api, type EntryRecord, type Filing, type Workspace } from '@/services/api'
import {
  analyseExpenseRisk,
  analyseRunway,
  evaluateBudgets,
  monthsWithEntries,
  monthlyBreakdown,
  summarise,
} from '@/services/ledgerEngine'
import { formatBaht, formatPercent, roundMoney, thaiDate } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useCountUp } from '@/composables/useCountUp'

const auth = useAuthStore()
const game = useGameStore()
const toast = useToastStore()

const workspaces = ref<Workspace[]>([])
const entries = ref<EntryRecord[]>([])
const filings = ref<Filing[]>([])
const loading = ref(true)

/**
 * นับเฉพาะรายการของสมุดที่ยังมีอยู่จริง
 * ถ้ามีรายการค้างจากสมุดที่ถูกลบไป ยอดรวมด้านบนจะไม่เท่าผลบวกของตารางรายสมุดด้านล่าง
 */
const ownedEntries = computed(() => {
  const ids = new Set(workspaces.value.map((w) => w.id))
  return entries.value.filter((e) => ids.has(e.workspaceId))
})

/** รวมทุกสมุดเป็นภาพเดียว เพื่อตอบว่า "ตอนนี้ยืนอยู่ตรงไหน" */
const overall = computed(() => summarise(ownedEntries.value, 'personal'))
const trend = computed(() => monthlyBreakdown(ownedEntries.value))

/** เดือนที่ใช้เทียบงบ: เดือนปัจจุบันถ้ามีรายการ ไม่งั้นเดือนล่าสุดที่มีรายการ (เหมือนหน้างบประมาณ) */
function budgetMonthOf(list: EntryRecord[]): string {
  const current = new Date().toISOString().slice(0, 7)
  const months = monthsWithEntries(list)
  return months.includes(current) ? current : (months[0] ?? current)
}

/** สรุปรายสมุด พร้อมผลวิเคราะห์ตามเกณฑ์ของโหมดนั้น ๆ */
const perWorkspace = computed(() =>
  workspaces.value.map((ws) => {
    const own = ownedEntries.value.filter((e) => e.workspaceId === ws.id)
    const s = summarise(own, ws.mode)
    const months = s.monthsCovered
    const avgIncome = roundMoney(s.income / months)
    const avgExpense = roundMoney(s.expense / months)
    const capital = roundMoney(ws.capital + s.net)
    return {
      workspace: ws,
      definition: modeDefinition(ws.mode),
      summary: s,
      capital,
      risk: analyseExpenseRisk(avgIncome, avgExpense, ws.mode),
      runway: analyseRunway(capital, avgExpense, avgIncome, ws.mode),
      points: monthlyBreakdown(own),
      budgets: evaluateBudgets(own, ws.mode, ws.budgets ?? {}, budgetMonthOf(own)),
    }
  }),
)

/** เงินทุนรวม = ผลบวกของเงินทุนคงเหลือทุกเล่มในตาราง ตัวเลขด้านบนกับตารางจึงตรงกันเสมอ */
const totalCapital = computed(() =>
  roundMoney(perWorkspace.value.reduce((sum, row) => sum + row.capital, 0)),
)

/** ตัวเลขสรุปด้านบนนับขึ้นจาก 0 ตอนเปิดหน้า */
const shownCapital = useCountUp(() => totalCapital.value)
const shownIncome = useCountUp(() => overall.value.income)
const shownExpense = useCountUp(() => overall.value.expense)
const shownNet = useCountUp(() => overall.value.net)

/**
 * เงินทุนกระจายอยู่ในสมุดเล่มไหนบ้าง — ภาพรวมพอร์ตของผู้ใช้
 * บอกที่มาของแต่ละก้อนด้วย (ทุนตั้งต้น + เหลือเก็บสะสม) มีสมุดเล่มเดียวก็ยังมีอะไรให้ดู
 */
const allocation = computed<RankedRow[]>(() =>
  perWorkspace.value
    .filter((row) => row.capital > 0)
    .sort((a, b) => b.capital - a.capital)
    .map((row) => ({
      label: row.workspace.name,
      value: row.capital,
      sub: `ทุนตั้งต้น ${formatBaht(row.workspace.capital)} · เหลือเก็บสะสม ${row.summary.net >= 0 ? '+' : '−'}${formatBaht(Math.abs(row.summary.net))}`,
    })),
)

/** ทุนตั้งต้นรวม กับส่วนที่เพิ่ม/ลดจากรายรับรายจ่าย ใช้ทำแถบองค์ประกอบด้านบนการ์ด */
const capitalParts = computed(() => {
  const initial = roundMoney(perWorkspace.value.reduce((s, r) => s + r.workspace.capital, 0))
  return { initial, change: roundMoney(totalCapital.value - initial) }
})

/** เดือนล่าสุดเทียบเดือนก่อน — ตัวเลขสรุปบนกราฟรายเดือน */
const monthStats = computed(() => {
  const sorted = [...trend.value].sort((a, b) => a.month.localeCompare(b.month))
  const last = sorted[sorted.length - 1]
  if (!last) return null
  const prev = sorted[sorted.length - 2] ?? null
  const change = (now: number, before: number | undefined) =>
    before && before > 0 ? (now - before) / before : null
  return {
    month: new Date(`${last.month}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }),
    income: last.income,
    expense: last.expense,
    net: last.net,
    savingsRate: last.income > 0 ? last.net / last.income : 0,
    incomeChange: change(last.income, prev?.income),
    expenseChange: change(last.expense, prev?.expense),
  }
})

function changeText(value: number | null): string {
  if (value === null) return ''
  if (Math.abs(value) < 0.005) return 'เท่าเดือนก่อน'
  return `${value > 0 ? '▲' : '▼'} ${Math.abs(value * 100).toFixed(0)}% จากเดือนก่อน`
}

/** โหมดของสมุดทั้งหมดที่มี ใช้เลือกกำหนดภาษีที่เกี่ยวข้อง */
const workspaceModes = computed(() => [...new Set(workspaces.value.map((w) => w.mode))])

/** โหมดของแต่ละสมุด ใช้แปลชื่อหมวดให้ถูกเล่ม */
const modeOf = computed(() => new Map(workspaces.value.map((w) => [w.id, w.mode])))

/**
 * หมวดที่ใช้เงินมากที่สุด 5 อันดับ รวมทุกสมุด
 *
 * ต้องแปลชื่อหมวดด้วยโหมดของสมุดที่รายการนั้นสังกัด ไม่ใช่โหมดเดียวเหมาไปทั้งหน้า
 * ไม่งั้นหมวดที่มีเฉพาะบางโหมด เช่น ต้นทุนขาย จะแปลไม่ออก
 * จัดกลุ่มด้วยชื่อที่แปลแล้ว หมวดชื่อเดียวกันจากคนละสมุดจึงรวมยอดกัน
 */
const topExpenses = computed<RankedRow[]>(() => {
  const totals = new Map<string, number>()
  for (const e of ownedEntries.value) {
    if (e.type !== 'expense') continue
    const label = categoryLabel(modeOf.value.get(e.workspaceId) ?? 'personal', e.categoryKey)
    totals.set(label, (totals.get(label) ?? 0) + (Number(e.amount) || 0))
  }
  const sorted = [...totals.entries()]
    .map(([label, value]) => ({ label, value: roundMoney(value) }))
    .sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, 5)
  // รวมหมวดที่เหลือเป็นก้อนเดียวไว้ท้ายสุด สัดส่วนทุกแถวจึงคิดจากรายจ่ายทั้งหมดจริง
  const rest = roundMoney(sorted.slice(5).reduce((sum, s) => sum + s.value, 0))
  return rest > 0 ? [...top, { label: 'หมวดอื่น ๆ', value: rest, muted: true }] : top
})

const latestFiling = computed(() => filings.value[0] ?? null)

/** เรื่องที่ควรจัดการก่อน รวบจากทุกสมุด */
const alerts = computed(() => {
  const list: { level: 'bad' | 'warn'; text: string; to: string }[] = []
  for (const row of perWorkspace.value) {
    if (row.summary.entryCount === 0) continue
    if (row.risk.level === 'deficit' || row.risk.level === 'risky') {
      list.push({
        level: row.risk.level === 'deficit' ? 'bad' : 'warn',
        text: `${row.workspace.name}: ${row.risk.headline} — ${row.risk.expenseToCut > 0 ? `ควรลดรายจ่ายอีกเดือนละ ${formatBaht(row.risk.expenseToCut)}` : 'ตรวจสอบรายจ่ายอีกครั้ง'}`,
        to: `/workspace/${row.workspace.id}`,
      })
    }
    for (const budget of row.budgets.filter((b) => b.status === 'over')) {
      list.push({
        level: 'warn',
        text: `${row.workspace.name}: หมวด${budget.label} เกินงบประจำเดือนไปแล้ว ${formatBaht(-budget.remaining)}`,
        to: `/workspace/${row.workspace.id}/goals`,
      })
    }
    if (row.runway.level === 'critical' || row.runway.level === 'tight') {
      list.push({
        level: row.runway.level === 'critical' ? 'bad' : 'warn',
        text: `${row.workspace.name}: เงินทุนอยู่ได้อีก ${row.runway.months.toFixed(1)} เดือน ต่ำกว่าเกณฑ์ ${row.runway.recommendedMonths} เดือน`,
        to: `/workspace/${row.workspace.id}`,
      })
    }
  }
  return list
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'สวัสดีตอนเช้า'
  if (hour < 18) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนค่ำ'
})

onMounted(async () => {
  try {
    const [ws, es, fs] = await Promise.all([api.workspaces(), api.allEntries(), api.filings()])
    workspaces.value = ws
    entries.value = es
    filings.value = fs
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'โหลดข้อมูลแดชบอร์ดไม่สำเร็จ')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <!-- container-type: ให้โครงสองคอลัมน์ขึ้นกับความกว้างของพื้นที่เนื้อหาจริง (หักเมนูด้านข้างแล้ว) ไม่ใช่ความกว้างจอ -->
    <div class="container dash-wrap">
      <div class="section-head greeting-head">
        <!-- น้องออมสินโผล่เฉพาะธีมน่ารัก (ซ่อนด้วย CSS ในธีมอื่น) -->
        <Mascot class="greeting-mascot" :size="88" line="greeting" />
        <span class="eyebrow">แดชบอร์ด</span>
        <h2>{{ greeting }} {{ auth.user?.fullName ?? '' }}</h2>
        <p>ภาพรวมเงินของคุณจากทุกสมุดบัญชี พร้อมสถานะภาษีล่าสุด</p>
      </div>

      <div v-if="loading" class="card" aria-busy="true">
        <span class="sr-only">กำลังโหลดแดชบอร์ด</span>
        <div class="skeleton skeleton-line w40"></div>
        <div class="skeleton skeleton-row"></div>
        <div class="skeleton skeleton-row"></div>
      </div>

      <!-- ยังไม่มีสมุดเลย ชวนให้เริ่ม -->
      <div v-else-if="!workspaces.length" class="empty-state">
        <span class="ico-big"><AppIcon name="wallet" :size="26" /></span>
        <h3>ยังไม่มีสมุดบัญชี</h3>
        <p>
          สร้างสมุดเล่มแรกแล้วบันทึกรายรับรายจ่าย
          แดชบอร์ดจะสรุปให้เห็นภาพรวมเงินทุน ความเสี่ยง และเป้าหมายทั้งหมดที่นี่
        </p>
        <div class="cta-row" style="justify-content: center">
          <RouterLink class="btn btn-primary" to="/welcome">เริ่มด้วย 5 คำถาม</RouterLink>
          <RouterLink class="btn btn-ghost" to="/workspaces">สร้างสมุดเอง</RouterLink>
          <RouterLink class="btn btn-ghost" to="/calculator">ลองคำนวณภาษีก่อน</RouterLink>
        </div>
      </div>

      <template v-else>
        <!-- ตัวเลขหลัก -->
        <div class="grid grid-4 mb-3">
          <div class="card stat">
            <span class="eyebrow">เงินทุนรวมทุกสมุด</span>
            <strong class="num">{{ formatBaht(shownCapital) }}</strong>
            <span class="muted small">{{ workspaces.length }} เล่ม</span>
          </div>
          <div class="card stat">
            <span class="eyebrow">รายรับสะสม</span>
            <strong class="num text-ok">{{ formatBaht(shownIncome) }}</strong>
            <span class="muted small">จาก {{ overall.entryCount }} รายการ</span>
          </div>
          <div class="card stat">
            <span class="eyebrow">รายจ่ายสะสม</span>
            <strong class="num text-bad">{{ formatBaht(shownExpense) }}</strong>
            <span class="muted small">
              คิดเป็น {{ formatPercent(overall.income > 0 ? overall.expense / overall.income : 0) }} ของรายรับ
            </span>
          </div>
          <div class="card stat">
            <span class="eyebrow">คงเหลือสุทธิ</span>
            <strong class="num" :class="overall.net >= 0 ? 'text-ok' : 'text-bad'">
              {{ formatBaht(shownNet) }}
            </strong>
            <span class="muted small">อัตราการออม {{ formatPercent(overall.savingsRate) }}</span>
          </div>
        </div>

        <!-- จอกว้าง: คอลัมน์หลัก (กราฟ ตาราง) + แถบขวา (การ์ดเล็ก) · จอแคบ: เรียงลงมาตามลำดับในโค้ด -->
        <div class="dash-layout">
          <aside class="dash-rail" aria-label="ภาษีและความคืบหน้า">
            <!-- กำหนดภาษีที่ใกล้ที่สุด -->
            <TaxSeasonCard />
            <LiveTaxCard />
            <TaxCalendarCard :modes="workspaceModes" />
            <LoanSummaryCard />
            <YearEndCountdown />
            <WeeklyRecapCard />

            <!-- ความสำเร็จ: บันทึกต่อเนื่อง เลเวล และเหรียญล่าสุด -->
            <RouterLink to="/achievements" class="card progress-strip">
              <span class="strip-item">
                <span class="strip-icon" :class="{ lit: game.streak.current > 0 }" aria-hidden="true">🔥</span>
                <span>
                  <strong>{{ game.streak.current }} วัน</strong>
                  <small>{{ game.streak.todayDone ? 'วันนี้จดแล้ว' : 'จดต่อเนื่อง' }}</small>
                </span>
              </span>
              <span class="strip-item">
                <span class="strip-icon" aria-hidden="true">⭐</span>
                <span>
                  <strong>เลเวล {{ game.levelInfo.level }}</strong>
                  <small>{{ game.levelInfo.xp }} XP</small>
                </span>
              </span>
              <span class="strip-item">
                <span class="strip-icon" aria-hidden="true">🏅</span>
                <span>
                  <strong>{{ game.achievements.filter((a) => a.unlockedAt).length }} เหรียญ</strong>
                  <small>จาก {{ game.achievements.length }}</small>
                </span>
              </span>
              <AppIcon name="arrowRight" :size="18" />
            </RouterLink>

          </aside>

          <div class="dash-main">
            <!-- เรื่องที่ควรจัดการก่อน -->
            <section v-if="alerts.length" class="card">
              <div class="card-head">
                <div>
                  <h3>ควรดูก่อน</h3>
                  <p>รวบจากทุกสมุดที่ตัวเลขเข้าเกณฑ์ต้องระวัง</p>
                </div>
              </div>
              <RouterLink
                v-for="(alert, i) in alerts"
                :key="i"
                :to="alert.to"
                class="alert-row"
                :class="alert.level"
              >
                <AppIcon name="alert" :size="18" />
                <span>{{ alert.text }}</span>
                <AppIcon name="arrowRight" :size="16" />
              </RouterLink>
            </section>

            <!-- กราฟแนวโน้ม -->
            <section v-if="trend.length" class="card dash-chart">
              <div class="card-head">
                <div>
                  <h3>รายรับและรายจ่ายรายเดือน</h3>
                  <p>รวมทุกสมุด · ชี้หรือแตะแท่งเพื่อดูตัวเลขของเดือนนั้น</p>
                </div>
              </div>

              <!-- ตัวเลขเดือนล่าสุด อ่านได้ทันทีโดยไม่ต้องดูกราฟ -->
              <div v-if="monthStats" class="kpi-row">
                <div class="kpi">
                  <small><i class="kpi-dot income"></i>รายรับ {{ monthStats.month }}</small>
                  <strong>{{ formatBaht(monthStats.income) }}</strong>
                  <span class="kpi-change">{{ changeText(monthStats.incomeChange) }}</span>
                </div>
                <div class="kpi">
                  <small><i class="kpi-dot expense"></i>รายจ่าย</small>
                  <strong>{{ formatBaht(monthStats.expense) }}</strong>
                  <span class="kpi-change">{{ changeText(monthStats.expenseChange) }}</span>
                </div>
                <div class="kpi">
                  <small>เหลือเก็บ</small>
                  <strong :class="monthStats.net >= 0 ? 'text-ok' : 'text-bad'">{{ formatBaht(monthStats.net) }}</strong>
                  <span class="kpi-change">ออมได้ {{ formatPercent(Math.max(0, monthStats.savingsRate), 0) }} ของรายรับ</span>
                </div>
              </div>

              <MonthlyChart :points="trend" />
            </section>

            <!-- พอร์ตและรายจ่าย -->
            <div class="grid grid-2 dash-split">
              <section class="card">
                <div class="card-head">
                  <div>
                    <h3>เงินทุนกระจายอยู่ที่ไหน</h3>
                    <p>เงินทุนคงเหลือของแต่ละสมุด = ทุนตั้งต้น + เหลือเก็บสะสม</p>
                  </div>
                </div>

                <div class="share-total">
                  <small>เงินทุนรวม</small>
                  <strong>{{ formatBaht(totalCapital) }}</strong>
                  <span class="kpi-change">
                    ทุนตั้งต้น {{ formatBaht(capitalParts.initial) }}
                    <b :class="capitalParts.change >= 0 ? 'text-ok' : 'text-bad'">
                      {{ capitalParts.change >= 0 ? '+' : '−' }}{{ formatBaht(Math.abs(capitalParts.change)) }}
                    </b>
                    จากรายรับรายจ่าย
                  </span>
                  <div
                    v-if="capitalParts.change > 0 && totalCapital > 0"
                    class="comp-bar"
                    role="img"
                    :aria-label="`ทุนตั้งต้น ${formatPercent(capitalParts.initial / totalCapital, 0)} เหลือเก็บสะสม ${formatPercent(capitalParts.change / totalCapital, 0)}`"
                  >
                    <span class="comp-seg base" :style="{ flexGrow: capitalParts.initial }"></span>
                    <span class="comp-seg gain" :style="{ flexGrow: capitalParts.change }"></span>
                  </div>
                  <div v-if="capitalParts.change > 0 && totalCapital > 0" class="comp-legend" aria-hidden="true">
                    <span><i class="base"></i>ทุนตั้งต้น {{ formatPercent(capitalParts.initial / totalCapital, 0) }}</span>
                    <span><i class="gain"></i>เก็บเพิ่มได้ {{ formatPercent(capitalParts.change / totalCapital, 0) }}</span>
                  </div>
                </div>

                <RankedBars v-if="allocation.length" :rows="allocation" />
                <p v-else class="muted">ยังไม่มีสมุดที่มีเงินทุนคงเหลือ</p>
              </section>

              <section class="card">
                <div class="card-head">
                  <div>
                    <h3>หมวดที่ใช้เงินมากที่สุด</h3>
                    <p>5 อันดับแรกจากทุกสมุด เทียบกับรายจ่ายทั้งหมด</p>
                  </div>
                </div>

                <div class="share-total">
                  <small>รายจ่ายรวม</small>
                  <strong>{{ formatBaht(overall.expense) }}</strong>
                  <span class="kpi-change">จาก {{ trend.length }} เดือนที่มีข้อมูล · เฉลี่ยเดือนละ {{ formatBaht(overall.expense / Math.max(1, trend.length)) }}</span>
                </div>

                <RankedBars v-if="topExpenses.length" :rows="topExpenses" :total="overall.expense" />
                <p v-else class="muted">ยังไม่มีรายจ่าย</p>
              </section>
            </div>

            <!-- รายสมุด -->
            <section class="card">
              <div class="card-head">
                <div>
                  <h3>สมุดของฉัน</h3>
                  <p>ความเสี่ยงและเงินสำรองคิดตามเกณฑ์ของแต่ละโหมด</p>
                </div>
                <RouterLink class="btn btn-ghost btn-sm" to="/workspaces">จัดการสมุด</RouterLink>
              </div>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>สมุด</th>
                      <th>โหมด</th>
                      <th class="right">เงินทุนคงเหลือ</th>
                      <th class="right">เหลือเก็บ/เดือน</th>
                      <th>ความเสี่ยงรายจ่าย</th>
                      <th>เงินทุนอยู่ได้</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in perWorkspace" :key="row.workspace.id">
                      <td>
                        <RouterLink :to="`/workspace/${row.workspace.id}`">
                          {{ row.workspace.name }}
                        </RouterLink>
                      </td>
                      <td>{{ row.definition.label }}</td>
                      <td class="money">{{ formatBaht(row.capital) }}</td>
                      <td class="money" :class="row.risk.surplus >= 0 ? 'text-ok' : 'text-bad'">
                        {{ formatBaht(row.risk.surplus) }}
                      </td>
                      <td>
                        <span
                          class="badge"
                          :class="
                            ['healthy', 'comfortable'].includes(row.risk.level)
                              ? 'badge-ok'
                              : row.risk.level === 'watch'
                                ? 'badge-warn'
                                : 'badge-bad'
                          "
                        >
                          {{ formatPercent(row.risk.ratio) }}
                        </span>
                      </td>
                      <td>
                        <span
                          class="badge"
                          :class="
                            ['positive', 'healthy'].includes(row.runway.level)
                              ? 'badge-ok'
                              : row.runway.level === 'critical'
                                ? 'badge-bad'
                                : 'badge-warn'
                          "
                        >
                          {{
                            Number.isFinite(row.runway.months)
                              ? `${row.runway.months.toFixed(1)} เดือน`
                              : 'ไม่ต้องเผาทุน'
                          }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <!-- สถานะภาษี -->
            <section class="card">
              <div class="card-head">
                <div>
                  <h3>สถานะภาษี</h3>
                  <p>สรุปแบบภาษีล่าสุดที่บันทึกไว้</p>
                </div>
                <RouterLink class="btn btn-ghost btn-sm" to="/history">ดูทั้งหมด</RouterLink>
              </div>

              <div v-if="!latestFiling" class="empty-state" style="padding: var(--space-3)">
                <h3>ยังไม่มีสรุปแบบภาษี</h3>
                <p>เตรียมแบบภาษีให้ครบ 4 ขั้นตอน แล้วบันทึกสรุป ตัวเลขจะมาแสดงที่นี่</p>
                <RouterLink class="btn btn-primary" to="/filing">เริ่มเตรียมแบบภาษี</RouterLink>
              </div>

              <div v-else class="price-lines">
                <div class="price-line">
                  <span class="lbl">เลขอ้างอิง</span>
                  <span class="val">{{ latestFiling.reference }}</span>
                </div>
                <div class="price-line">
                  <span class="lbl">ปีภาษี</span>
                  <span class="val">{{ latestFiling.taxYear }} ({{ latestFiling.formType }})</span>
                </div>
                <div class="price-line">
                  <span class="lbl">บันทึกเมื่อ</span>
                  <span class="val">{{ thaiDate(latestFiling.submittedAt) }}</span>
                </div>
                <div class="price-line total">
                  <span class="lbl">
                    {{ latestFiling.balance < 0 ? 'ขอคืนได้' : 'ต้องชำระเพิ่ม' }}
                  </span>
                  <span class="val">{{ formatBaht(Math.abs(latestFiling.balance)) }}</span>
                </div>
              </div>

              <RouterLink
                v-if="latestFiling"
                class="btn btn-ghost btn-block mt-2"
                :to="`/status/${latestFiling.reference}`"
              >
                <span class="badge" :class="STATUS_META[latestFiling.status].badge">
                  {{ STATUS_META[latestFiling.status].label }}
                </span>
                ดูสรุปแบบ
              </RouterLink>
            </section>
          </div>
        </div>
      </template>

      <!-- ยังไม่มีสมุดก็ยังเห็นกำหนดภาษีของผู้มีเงินได้ทั่วไป -->
      <TaxCalendarCard v-if="!loading && !workspaces.length" :modes="[]" class="mt-3" />
    </div>
  </main>
</template>

<style scoped>
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
/* มือถือ: รายรับคู่รายจ่ายในแถวเดียว เหลือเก็บเต็มแถวล่าง — ไม่ต้องเลื่อนผ่านกล่องสามชั้นก่อนถึงกราฟ */
@media (max-width: 620px) {
  .kpi-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 14px;
  }
  .kpi-row > .kpi:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
  .kpi {
    padding: 10px 12px;
  }
  .kpi strong {
    font-size: 1.15rem;
  }
  .kpi-change {
    font-size: 12px;
  }
}
.kpi {
  display: grid;
  gap: 2px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.kpi small,
.share-total small {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-dim);
  font-size: 13px;
}
.kpi strong {
  font-family: var(--font-data);
  font-size: 1.35rem;
  font-variant-numeric: tabular-nums;
}
.kpi-change {
  font-size: 12.5px;
  color: var(--text-dim);
}
.kpi-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}
.kpi-dot.income {
  background: var(--viz-income);
}
.kpi-dot.expense {
  background: var(--viz-expense);
}
.share-total {
  display: grid;
  gap: 2px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.share-total strong {
  font-family: var(--font-data);
  font-size: 1.6rem;
  font-variant-numeric: tabular-nums;
}
.comp-bar {
  display: flex;
  gap: 2px;
  height: 12px;
  margin-top: 10px;
  border-radius: 999px;
  overflow: hidden;
}
.comp-seg {
  flex-basis: 0;
  min-width: 4px;
}
.comp-seg.base,
.comp-legend i.base {
  background: var(--line-strong);
}
.comp-seg.gain,
.comp-legend i.gain {
  background: var(--accent);
}
.comp-legend {
  display: flex;
  gap: 14px;
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--text-dim);
}
.comp-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.comp-legend i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}
.dash-split {
  align-items: stretch;
}

/*
 * โครงหน้า: ทุกการ์ดเว้นระยะด้วย gap ของคอลัมน์ (ยกเลิก margin จากกฎ .card + .card)
 *  - มือถือ: คอลัมน์เดียว แถบการ์ดเล็กขึ้นก่อน (ภารกิจ ภาษีสด) ตามด้วยกราฟ
 *  - พื้นที่เนื้อหา 700–1149px (ไอแพด โน้ตบุ๊ก): การ์ดเล็กวางสองคอลัมน์ ไม่ยืดยาวเต็มจอ
 *  - พื้นที่เนื้อหา ≥ 1150px (จอคอมใหญ่): คอลัมน์หลัก + แถบขวากว้าง 340–400px
 */
.dash-wrap {
  container: dash / inline-size;
}
.dash-layout {
  display: grid;
  gap: var(--space-2);
}
.dash-rail,
.dash-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
.dash-layout .dash-rail > *,
.dash-layout .dash-main > * {
  margin: 0;
}
@container dash (min-width: 700px) and (max-width: 1149px) {
  .dash-rail {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}
@container dash (min-width: 1150px) {
  .dash-layout {
    grid-template-columns: minmax(0, 1fr) clamp(340px, 26vw, 400px);
    grid-template-areas: 'main rail';
    align-items: start;
  }
  .dash-main {
    grid-area: main;
  }
  .dash-rail {
    grid-area: rail;
  }
}
</style>
