<script setup lang="ts">
/** ใครติดเงินเรา และเราติดเงินใคร — รวมจากรายการที่ติดป้ายเงินยืม ซ่อนเมื่อไม่มียอดค้าง */
import { computed, ref } from 'vue'
import { loanBalances, loanTotals, openBalances } from '@/services/loans'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const showAll = ref(false)

const open = computed(() => openBalances(loanBalances(game.entries)))
const totals = computed(() => loanTotals(open.value))
const visible = computed(() => (showAll.value ? open.value : open.value.slice(0, 4)))
</script>

<template>
  <section v-if="open.length" class="card loan-card" data-test="loan-card">
    <div class="card-head">
      <div>
        <h3>🤝 เงินยืม</h3>
        <p>
          <template v-if="totals.owedToMe">คนอื่นติดคุณ {{ formatBaht(totals.owedToMe) }}</template>
          <template v-if="totals.owedToMe && totals.iOwe"> · </template>
          <template v-if="totals.iOwe">คุณติดคนอื่น {{ formatBaht(totals.iOwe) }}</template>
        </p>
      </div>
    </div>
    <ul class="loan-list">
      <li v-for="row in visible" :key="row.key">
        <span>
          <strong>{{ row.party }}</strong>
          <small class="muted">ล่าสุด {{ thaiDate(row.lastDate) }} · {{ row.entries.length }} รายการ</small>
        </span>
        <span class="loan-amount">
          <span v-if="row.owedToMe > 0" class="text-ok">ติดคุณ {{ formatBaht(row.owedToMe) }}</span>
          <span v-else-if="row.owedToMe < 0" class="muted">คืนเกิน {{ formatBaht(-row.owedToMe) }}</span>
          <span v-if="row.iOwe > 0" class="text-warn">คุณติด {{ formatBaht(row.iOwe) }}</span>
        </span>
      </li>
    </ul>
    <button v-if="open.length > 4" class="btn btn-ghost btn-sm mt-1" type="button" @click="showAll = !showAll">
      {{ showAll ? 'ย่อ' : `ดูทั้งหมด ${open.length} คน` }}
    </button>
    <p class="small muted mt-1">สแกนสลิปรับเงินจากคนที่ติดคุณ ระบบนับเป็นเงินคืนให้เอง</p>
  </section>
</template>

<style scoped>
.loan-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.loan-list li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.loan-list li > span:first-child {
  display: grid;
  min-width: 0;
}
.loan-amount {
  display: grid;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
