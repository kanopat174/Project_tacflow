<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { formatBaht, formatPercent } from '@/services/taxEngine'
import { useLedgerStore } from '@/stores/ledger'

const ledger = useLedgerStore()

const RISK_BADGE: Record<string, string> = {
  healthy: 'badge-ok',
  comfortable: 'badge-ok',
  watch: 'badge-warn',
  risky: 'badge-bad',
  deficit: 'badge-bad',
}

const RUNWAY_BADGE: Record<string, string> = {
  positive: 'badge-ok',
  healthy: 'badge-ok',
  watch: 'badge-warn',
  tight: 'badge-warn',
  critical: 'badge-bad',
}

const hasData = computed(() => ledger.summary.entryCount > 0)

/** สเกลกราฟแท่งรายเดือน อิงยอดสูงสุดที่พบ */
const chartMax = computed(() =>
  Math.max(1, ...ledger.months.flatMap((m) => [m.income, m.expense])),
)

const runwayMonthsText = computed(() =>
  Number.isFinite(ledger.runway.months) ? `${ledger.runway.months.toFixed(1)} เดือน` : 'ไม่จำกัด',
)

/** สัดส่วนความคืบหน้าเทียบเดือนที่แนะนำ ใช้วาดแถบ */
const runwayPercent = computed(() => {
  if (!Number.isFinite(ledger.runway.months)) return 100
  return Math.min(100, (ledger.runway.months / ledger.runway.recommendedMonths) * 100)
})
</script>

<template>
  <div>
    <div v-if="!hasData" class="empty-state mb-3">
      <span class="ico-big"><AppIcon name="receipt" :size="26" /></span>
      <h3>ยังไม่มีรายการในสมุดเล่มนี้</h3>
      <p>บันทึกรายรับและรายจ่ายอย่างน้อยหนึ่งเดือน ระบบจึงจะวิเคราะห์ความเสี่ยงและเงินสำรองให้ได้</p>
      <RouterLink class="btn btn-primary" :to="`/workspace/${ledger.active?.id}/entries`">
        เริ่มบันทึกรายการ
      </RouterLink>
    </div>

    <template v-else>
      <!-- ตัวเลขสรุป -->
      <div class="grid grid-4 mb-3">
        <div class="card stat">
          <span class="eyebrow">รายรับเฉลี่ยต่อเดือน</span>
          <strong class="num">{{ formatBaht(ledger.averages.income) }}</strong>
          <span class="muted small">จากข้อมูล {{ ledger.averages.months }} เดือน</span>
        </div>
        <div class="card stat">
          <span class="eyebrow">รายจ่ายเฉลี่ยต่อเดือน</span>
          <strong class="num">{{ formatBaht(ledger.averages.expense) }}</strong>
          <span class="muted small">
            จำเป็น {{ formatBaht(ledger.averages.essentialExpense) }}
          </span>
        </div>
        <div class="card stat">
          <span class="eyebrow">เหลือเก็บต่อเดือน</span>
          <strong class="num" :class="ledger.averages.net >= 0 ? 'text-ok' : 'text-bad'">
            {{ formatBaht(ledger.averages.net) }}
          </strong>
          <span class="muted small">อัตราการออม {{ formatPercent(ledger.risk.savingsRate) }}</span>
        </div>
        <div class="card stat">
          <span class="eyebrow">เงินทุนคงเหลือ</span>
          <strong class="num">{{ formatBaht(ledger.currentCapital) }}</strong>
          <span class="muted small">
            ตั้งต้น {{ formatBaht(ledger.capital) }} + คงเหลือสะสม
          </span>
        </div>
      </div>

      <!-- วิเคราะห์ความเสี่ยงของรายจ่าย -->
      <section class="card">
        <div class="card-head">
          <div>
            <h3>รายจ่ายสูงเกินไปหรือยัง</h3>
            <p>เทียบรายจ่ายกับรายรับ และกับเป้าการออมของโหมด{{ ledger.definition.label }}</p>
          </div>
          <span class="badge" :class="RISK_BADGE[ledger.risk.level]">{{ ledger.risk.headline }}</span>
        </div>

        <div class="ratio-bar" role="img"
          :aria-label="`รายจ่ายคิดเป็น ${formatPercent(ledger.risk.ratio)} ของรายรับ`">
          <span
            class="fill"
            :class="ledger.risk.level"
            :style="{ width: `${Math.min(100, ledger.risk.ratio * 100)}%` }"
          ></span>
          <span
            class="marker"
            :style="{ left: `${(1 - ledger.risk.targetSavingsRate) * 100}%` }"
            :title="`เพดานที่ยังออมได้ตามเป้า ${formatPercent(ledger.risk.targetSavingsRate, 0)}`"
          ></span>
        </div>
        <div class="row small muted" style="justify-content: space-between; margin-top: 6px">
          <span>รายจ่าย {{ formatPercent(ledger.risk.ratio) }} ของรายรับ</span>
          <span>เส้นประคือเพดานที่ยังออมได้ตามเป้า {{ formatBaht(ledger.risk.sustainableExpense) }}</span>
        </div>

        <p class="mt-2">{{ ledger.risk.detail }}</p>

        <div v-if="ledger.risk.expenseToCut > 0" class="notice notice-warn mt-2">
          <strong>ต้องลดรายจ่ายอีกเดือนละ {{ formatBaht(ledger.risk.expenseToCut) }}</strong>
          ลองดูหมวดที่ใช้มากที่สุดด้านล่างว่าตัดตรงไหนได้บ้าง
        </div>
      </section>

      <!-- วิเคราะห์เงินทุน -->
      <section class="card">
        <div class="card-head">
          <div>
            <h3>เงินทุนอยู่ได้อีกกี่เดือน</h3>
            <p>คิดจากเงินทุนคงเหลือหารด้วยเงินที่ไหลออกสุทธิต่อเดือน</p>
          </div>
          <span class="badge" :class="RUNWAY_BADGE[ledger.runway.level]">
            {{ runwayMonthsText }}
          </span>
        </div>

        <div class="runway-scale">
          <div class="track">
            <span class="fill" :class="ledger.runway.level" :style="{ width: `${runwayPercent}%` }"></span>
          </div>
          <div class="row small muted" style="justify-content: space-between">
            <span>0 เดือน</span>
            <span>เกณฑ์ที่แนะนำ {{ ledger.runway.recommendedMonths }} เดือน</span>
          </div>
        </div>

        <div class="price-lines mt-2">
          <div class="price-line">
            <span class="lbl">
              {{ ledger.runway.netBurn > 0 ? 'เงินไหลออกสุทธิต่อเดือน' : 'เงินไหลเข้าสุทธิต่อเดือน' }}
            </span>
            <span class="val">{{ formatBaht(Math.abs(ledger.runway.netBurn)) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">เงินสำรองที่ควรมี</span>
            <span class="val">{{ formatBaht(ledger.runway.requiredCapital) }}</span>
          </div>
          <div class="price-line total">
            <span class="lbl">{{ ledger.runway.shortfall > 0 ? 'ยังขาดอีก' : 'เกินเกณฑ์' }}</span>
            <span class="val">
              {{ formatBaht(ledger.runway.shortfall > 0 ? ledger.runway.shortfall : ledger.currentCapital - ledger.runway.requiredCapital) }}
            </span>
          </div>
          <div v-if="ledger.runway.depletionDate" class="price-line">
            <span class="lbl">เงินทุนจะหมดประมาณ</span>
            <span class="val">{{ ledger.runway.depletionDate }}</span>
          </div>
        </div>

        <p class="mt-2">{{ ledger.runway.detail }}</p>
      </section>

      <!-- กราฟรายเดือน -->
      <section v-if="ledger.months.length > 1" class="card">
        <div class="card-head">
          <div>
            <h3>รายรับรายจ่ายรายเดือน</h3>
            <p>แท่งซ้ายคือรายรับ แท่งขวาคือรายจ่าย</p>
          </div>
        </div>
        <div class="bar-chart">
          <div v-for="point in ledger.months" :key="point.month" class="bar-group">
            <div class="bars">
              <span
                class="bar income"
                :style="{ height: `${(point.income / chartMax) * 100}%` }"
                :title="`รายรับ ${formatBaht(point.income)}`"
              ></span>
              <span
                class="bar expense"
                :style="{ height: `${(point.expense / chartMax) * 100}%` }"
                :title="`รายจ่าย ${formatBaht(point.expense)}`"
              ></span>
            </div>
            <span class="label small muted">{{ point.month }}</span>
            <span class="small" :class="point.net >= 0 ? 'text-ok' : 'text-bad'">
              {{ formatBaht(point.net) }}
            </span>
          </div>
        </div>
      </section>

      <!-- หมวดที่ใช้เงินมากที่สุด -->
      <section class="card">
        <div class="card-head">
          <div>
            <h3>แยกตามหมวด</h3>
            <p>เรียงจากยอดมากไปน้อย เพื่อหาว่าตัดรายจ่ายตรงไหนได้ผลที่สุด</p>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>หมวด</th>
                <th>ประเภท</th>
                <th class="right">จำนวนรายการ</th>
                <th class="right">ยอดรวม</th>
                <th class="right">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in ledger.summary.byCategory" :key="row.key">
                <td>{{ row.label }}</td>
                <td>
                  <span class="badge" :class="row.type === 'income' ? 'badge-ok' : 'badge-muted'">
                    {{ row.type === 'income' ? 'รายรับ' : 'รายจ่าย' }}
                  </span>
                </td>
                <td class="money">{{ row.count }}</td>
                <td class="money">{{ formatBaht(row.amount) }}</td>
                <td class="money">{{ formatPercent(row.share) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ตัวชี้วัดเฉพาะโหมด -->
      <section v-if="ledger.definition.features.grossProfit" class="card">
        <div class="card-head">
          <div>
            <h3>กำไรขั้นต้น</h3>
            <p>รายรับหักต้นทุนขาย ก่อนหักค่าใช้จ่ายดำเนินงาน</p>
          </div>
        </div>
        <div class="price-lines">
          <div class="price-line">
            <span class="lbl">รายรับรวม</span>
            <span class="val">{{ formatBaht(ledger.summary.income) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">หัก ต้นทุนขาย</span>
            <span class="val">− {{ formatBaht(ledger.summary.cogs) }}</span>
          </div>
          <div class="price-line total">
            <span class="lbl">กำไรขั้นต้น</span>
            <span class="val">{{ formatBaht(ledger.summary.grossProfit) }}</span>
          </div>
          <div class="price-line">
            <span class="lbl">อัตรากำไรขั้นต้น</span>
            <span class="val">{{ formatPercent(ledger.summary.grossMargin) }}</span>
          </div>
        </div>
      </section>

      <section v-if="ledger.definition.features.withholdingTax && ledger.summary.withholdingTax > 0" class="card">
        <div class="notice notice-accent">
          <strong>ภาษีหัก ณ ที่จ่ายสะสม {{ formatBaht(ledger.summary.withholdingTax) }}</strong>
          ยอดนี้นำไปกรอกในช่อง "ภาษีหัก ณ ที่จ่าย" ของเครื่องคำนวณภาษีบุคคลธรรมดาได้เลย
          <RouterLink to="/calculator/personal">เปิดเครื่องคำนวณ</RouterLink>
        </div>
      </section>

      <section v-if="ledger.definition.features.tradingStats && ledger.trading.trades > 0" class="card">
        <div class="card-head">
          <div>
            <h3>สถิติการเทรด</h3>
            <p>นับเฉพาะไม้ที่ปิดแล้ว ไม่รวมค่าคอมมิชชันและค่าข้อมูล</p>
          </div>
        </div>
        <div class="grid grid-4">
          <div class="card stat">
            <span class="eyebrow">อัตราชนะ</span>
            <strong class="num">{{ formatPercent(ledger.trading.winRate) }}</strong>
            <span class="muted small">{{ ledger.trading.wins }} ชนะ / {{ ledger.trading.losses }} แพ้</span>
          </div>
          <div class="card stat">
            <span class="eyebrow">Profit factor</span>
            <strong class="num" :class="ledger.trading.profitFactor >= 1 ? 'text-ok' : 'text-bad'">
              {{ Number.isFinite(ledger.trading.profitFactor) ? ledger.trading.profitFactor.toFixed(2) : '∞' }}
            </strong>
            <span class="muted small">เกิน 1.0 คือระบบทำเงินได้</span>
          </div>
          <div class="card stat">
            <span class="eyebrow">กำไรคาดหวังต่อไม้</span>
            <strong class="num" :class="ledger.trading.expectancy >= 0 ? 'text-ok' : 'text-bad'">
              {{ formatBaht(ledger.trading.expectancy) }}
            </strong>
            <span class="muted small">จาก {{ ledger.trading.trades }} ไม้</span>
          </div>
          <div class="card stat">
            <span class="eyebrow">กำไรสุทธิ</span>
            <strong class="num" :class="ledger.trading.netPnl >= 0 ? 'text-ok' : 'text-bad'">
              {{ formatBaht(ledger.trading.netPnl) }}
            </strong>
            <span class="muted small">
              ชนะเฉลี่ย {{ formatBaht(ledger.trading.avgWin) }} · แพ้เฉลี่ย {{ formatBaht(ledger.trading.avgLoss) }}
            </span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
