<script setup lang="ts">
/** การ์ดแนะนำการลดหย่อน: ซื้ออะไรเพิ่ม เท่าไร แล้วประหยัดภาษีได้กี่บาท */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { daysUntilYearEnd, suggestDeductions } from '@/services/deductionAdvisor'
import { formatBaht, formatPercent, type AmountMap, type TaxOptions } from '@/services/taxEngine'

const props = withDefaults(
  defineProps<{ income: AmountMap; deductions: AmountMap; withholdingTax?: number; options?: TaxOptions }>(),
  { withholdingTax: 0, options: () => ({}) },
)

const emit = defineEmits<{ apply: [key: string, amount: number] }>()

const advice = computed(() =>
  suggestDeductions(props.income, props.deductions, props.withholdingTax, 5, props.options),
)
const daysLeft = computed(() => daysUntilYearEnd())
const totalSaving = computed(() => advice.value.currentTax - advice.value.taxIfAll)
</script>

<template>
  <section class="card advisor">
    <div class="card-head">
      <div>
        <h3>
          <AppIcon name="spark" :size="19" />
          ผู้ช่วยแนะนำการลดหย่อน
        </h3>
        <p>คำนวณจากเงินได้และค่าลดหย่อนที่กรอกไว้ เรียงจากรายการที่ประหยัดภาษีได้มากที่สุด</p>
      </div>
      <span v-if="advice.suggestions.length" class="badge" :class="daysLeft <= 30 ? 'badge-warn' : 'badge-accent'">
        <AppIcon name="clock" :size="14" />
        เหลือ {{ daysLeft }} วันก่อนสิ้นปีภาษี
      </span>
    </div>

    <p v-if="advice.reason === 'no-income'" class="muted">
      กรอกเงินได้ก่อน ระบบจึงจะรู้ว่าคุณอยู่ขั้นภาษีไหนและควรลดหย่อนเพิ่มเท่าไร
    </p>
    <p v-else-if="advice.reason === 'no-tax'" class="muted">
      ตอนนี้คุณไม่ต้องเสียภาษีแล้ว ลดหย่อนเพิ่มไม่ช่วยให้ประหยัดได้อีก
    </p>
    <p v-else-if="advice.reason === 'maxed'" class="muted">
      ใช้สิทธิลดหย่อนที่ซื้อเพิ่มเองได้ครบแล้ว หรือส่วนที่เหลือไม่ทำให้ภาษีลดลงอีก
    </p>

    <template v-else>
      <ol class="advice-list">
        <li v-for="(item, index) in advice.suggestions" :key="item.key">
          <span class="rank">{{ index + 1 }}</span>
          <div class="advice-body">
            <p class="advice-title">
              ซื้อ <strong>{{ item.label }}</strong> เพิ่มอีก
              <strong class="num">{{ formatBaht(item.amount) }}</strong>
              ประหยัดภาษีได้ <strong class="num text-ok">{{ formatBaht(item.saving) }}</strong>
            </p>
            <p class="small muted">
              ได้ภาษีคืน {{ formatPercent(item.returnRate, 0) }} ของเงินที่จ่าย · {{ item.note }}
            </p>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" @click="emit('apply', item.key, item.amount)">
            ใส่ยอดนี้
          </button>
        </li>
      </ol>

      <div class="notice notice-accent mt-2">
        <strong>ทำครบทุกข้อ ประหยัดภาษีรวม {{ formatBaht(totalSaving) }}</strong>
        ใช้เงิน {{ formatBaht(advice.amountIfAll) }} ภาษีลดจาก {{ formatBaht(advice.currentTax) }}
        เหลือ {{ formatBaht(advice.taxIfAll) }} — ตัวเลขแต่ละข้อคิดต่อจากข้อก่อนหน้าแล้ว
        จึงรวมผลของเพดานรวมกองทุน 500,000 บาทไว้ด้วย
      </div>
      <p class="small muted mt-1">
        การลดหย่อนช่วยประหยัดภาษีแต่ยังเป็นการใช้เงิน เลือกเฉพาะรายการที่ตรงกับเป้าหมายการเงินของคุณ
        กองทุนมีความเสี่ยงจากการลงทุน
      </p>
    </template>
  </section>
</template>
