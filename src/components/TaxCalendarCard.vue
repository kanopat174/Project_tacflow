<script setup lang="ts">
/** ปฏิทินภาษี: กำหนดที่ใกล้ที่สุดเด่นอยู่ด้านบน ตามด้วยรายการถัดไป */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import type { WorkspaceMode } from '@/data/workspaceModes'
import { downloadText } from '@/services/download'
import { buildTaxCalendarIcs } from '@/services/icsCalendar'
import { upcomingDeadlines } from '@/services/taxCalendar'
import { thaiDate } from '@/services/taxEngine'
import { useToastStore } from '@/stores/toast'

const props = withDefaults(defineProps<{ modes: WorkspaceMode[]; limit?: number }>(), { limit: 6 })

const deadlines = computed(() => upcomingDeadlines(props.modes).slice(0, props.limit))
const nearest = computed(() => deadlines.value[0] ?? null)
const rest = computed(() => deadlines.value.slice(1))

function urgency(days: number): string {
  if (days <= 7) return 'bad'
  if (days <= 30) return 'warn'
  return 'ok'
}

const toast = useToastStore()

/** ส่งออกกำหนดทั้งหมดเป็นไฟล์ .ics ให้แอปปฏิทินในเครื่องเตือนแทน แม้ไม่ได้เปิดเว็บ */
function addToCalendar() {
  downloadText('jodwise-tax-calendar.ics', buildTaxCalendarIcs(props.modes), 'text/calendar')
  toast.success('ดาวน์โหลดปฏิทินแล้ว เปิดไฟล์เพื่อเพิ่มลงแอปปฏิทิน จะเตือนก่อนกำหนด 7 วันและ 1 วัน')
}

function countdown(days: number): string {
  if (days === 0) return 'วันนี้'
  if (days === 1) return 'พรุ่งนี้'
  return `อีก ${days} วัน`
}
</script>

<template>
  <section class="card tax-calendar">
    <div class="card-head">
      <div>
        <h3>
          <AppIcon name="clock" :size="19" />
          ปฏิทินภาษี
        </h3>
        <p>กำหนดยื่นแบบและชำระภาษีที่เกี่ยวกับคุณ ตามโหมดของสมุดบัญชีที่มี</p>
      </div>
      <button class="btn btn-ghost btn-sm" type="button" @click="addToCalendar">
        <AppIcon name="download" :size="16" />
        เพิ่มลงปฏิทิน
      </button>
    </div>

    <p v-if="!nearest" class="muted">ไม่มีกำหนดภาษีในช่วง 4 เดือนข้างหน้า</p>

    <template v-else>
      <component
        :is="nearest.to ? 'RouterLink' : 'div'"
        :to="nearest.to"
        class="deadline-hero"
        :class="urgency(nearest.daysLeft)"
      >
        <span class="countdown">
          <strong>{{ nearest.daysLeft }}</strong>
          <small>{{ nearest.daysLeft === 0 ? 'วันนี้' : 'วัน' }}</small>
        </span>
        <span class="deadline-text">
          <b>{{ countdown(nearest.daysLeft) }}ถึงกำหนด · {{ thaiDate(nearest.date) }}</b>
          <span>{{ nearest.title }}</span>
          <small>{{ nearest.detail }}</small>
        </span>
        <AppIcon v-if="nearest.to" name="arrowRight" :size="18" />
      </component>

      <ul v-if="rest.length" class="deadline-list">
        <li v-for="item in rest" :key="item.key + item.date">
          <span class="date-chip" :class="urgency(item.daysLeft)">
            {{ thaiDate(item.date) }}
          </span>
          <span class="deadline-text">
            <RouterLink v-if="item.to" :to="item.to">{{ item.title }}</RouterLink>
            <span v-else>{{ item.title }}</span>
            <small>{{ item.detail }}</small>
          </span>
          <span class="small muted nowrap">{{ countdown(item.daysLeft) }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>
