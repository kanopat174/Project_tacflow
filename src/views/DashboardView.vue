<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import TrendChart from '@/components/TrendChart.vue'
import TaxCalendarCard from '@/components/TaxCalendarCard.vue'
import Mascot from '@/components/Mascot.vue'
import { useGameStore } from '@/stores/game'
import DonutChart, { type Slice } from '@/components/DonutChart.vue'
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

/** เงินทุนกระจายอยู่ในสมุดเล่มไหนบ้าง — ภาพรวมพอร์ตของผู้ใช้ */
const allocation = computed<Slice[]>(() =>
  perWorkspace.value
    .filter((row) => row.capital > 0)
    .map((row) => ({ label: row.workspace.name, value: row.capital })),
)

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
const topExpenses = computed<Slice[]>(() => {
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
  // รวมหมวดที่เหลือเป็นก้อนเดียว ไม่งั้นสัดส่วนในโดนัทคิดจากแค่ 5 หมวด
  // และผลบวกในคำอธิบายจะไม่เท่ารายจ่ายรวมตรงกลางวง
  const rest = roundMoney(sorted.slice(5).reduce((sum, s) => sum + s.value, 0))
  return rest > 0 ? [...top, { label: 'หมวดอื่น ๆ', value: rest }] : top
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
    <div class="container">
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
          <RouterLink class="btn btn-primary" to="/workspaces">สร้างสมุดบัญชี</RouterLink>
          <RouterLink class="btn btn-ghost" to="/calculator">ลองคำนวณภาษีก่อน</RouterLink>
        </div>
      </div>

      <template v-else>
        <!-- ตัวเลขหลัก -->
        <div class="grid grid-4 mb-3">
          <div class="card stat">
            <span class="eyebrow">เงินทุนรวมทุกสมุด</span>
            <strong class="num">{{ formatBaht(totalCapital) }}</strong>
            <span class="muted small">{{ workspaces.length }} เล่ม</span>
          </div>
          <div class="card stat">
            <span class="eyebrow">รายรับสะสม</span>
            <strong class="num text-ok">{{ formatBaht(overall.income) }}</strong>
            <span class="muted small">จาก {{ overall.entryCount }} รายการ</span>
          </div>
          <div class="card stat">
            <span class="eyebrow">รายจ่ายสะสม</span>
            <strong class="num text-bad">{{ formatBaht(overall.expense) }}</strong>
            <span class="muted small">
              คิดเป็น {{ formatPercent(overall.income > 0 ? overall.expense / overall.income : 0) }} ของรายรับ
            </span>
          </div>
          <div class="card stat">
            <span class="eyebrow">คงเหลือสุทธิ</span>
            <strong class="num" :class="overall.net >= 0 ? 'text-ok' : 'text-bad'">
              {{ formatBaht(overall.net) }}
            </strong>
            <span class="muted small">อัตราการออม {{ formatPercent(overall.savingsRate) }}</span>
          </div>
        </div>

        <!-- กำหนดภาษีที่ใกล้ที่สุด -->
        <TaxCalendarCard :modes="workspaceModes" />

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
        <section v-if="trend.length > 1" class="card">
          <div class="card-head">
            <div>
              <h3>รายรับและรายจ่ายรายเดือน</h3>
              <p>รวมทุกสมุด {{ trend.length }} เดือนล่าสุด</p>
            </div>
          </div>
          <TrendChart :points="trend" />
        </section>

        <!-- พอร์ตและรายจ่าย -->
        <div class="grid grid-2">
          <section class="card">
            <div class="card-head">
              <div>
                <h3>เงินทุนกระจายอยู่ที่ไหน</h3>
                <p>สัดส่วนตามสมุดแต่ละเล่ม</p>
              </div>
            </div>
            <DonutChart
              :slices="allocation"
              center-label="เงินทุนรวม"
              :center-value="formatBaht(totalCapital)"
            />
          </section>

          <section class="card">
            <div class="card-head">
              <div>
                <h3>หมวดที่ใช้เงินมากที่สุด</h3>
                <p>5 อันดับแรกจากทุกสมุด</p>
              </div>
            </div>
            <DonutChart
              :slices="topExpenses"
              center-label="รายจ่ายรวม"
              :center-value="formatBaht(overall.expense)"
            />
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
      </template>

      <!-- ยังไม่มีสมุดก็ยังเห็นกำหนดภาษีของผู้มีเงินได้ทั่วไป -->
      <TaxCalendarCard v-if="!loading && !workspaces.length" :modes="[]" class="mt-3" />
    </div>
  </main>
</template>
