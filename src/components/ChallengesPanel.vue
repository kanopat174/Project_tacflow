<script setup lang="ts">
/**
 * ภารกิจออมเงินของสมุดเล่มนี้: ออม 52 สัปดาห์ / ออมทุกวัน / งดใช้จ่ายหมวดเดียว
 * สองแบบแรกกด "ออมแล้ว" ทีละรอบ ส่วนงดใช้จ่ายระบบตรวจจากรายการในสมุดให้เอง
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import MascotFigure from './MascotFigure.vue'
import MoneyField from './MoneyField.vue'
import { categoriesOf } from '@/data/workspaceModes'
import { useTheme } from '@/composables/useTheme'
import { ApiError, api, type ChallengeKind, type ChallengeRecord } from '@/services/api'
import { CHALLENGE_TYPES, challengeProgress, type ChallengeProgress } from '@/services/gamification'
import { formatBaht, thaiDate } from '@/services/taxEngine'
import { useGameStore } from '@/stores/game'
import { localToday, useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const ledger = useLedgerStore()
const game = useGameStore()
const theme = useTheme()
const toast = useToastStore()

const list = ref<ChallengeRecord[]>([])
const adding = ref(false)
const saving = ref(false)
const today = localToday()

const form = reactive({ kind: 'daily' as ChallengeKind, title: '', amount: 20, days: 30, categoryKey: '', startDate: today })
const typeOf = (kind: ChallengeKind) => CHALLENGE_TYPES.find((t) => t.kind === kind)!
const expenseCategories = computed(() => categoriesOf(ledger.mode, 'expense'))

watch(
  () => form.kind,
  (kind) => {
    const t = typeOf(kind)
    form.amount = t.defaultAmount
    form.days = t.defaultDays
    if (kind === 'nospend' && !form.categoryKey) form.categoryKey = expenseCategories.value[0]?.key ?? ''
  },
)

async function load() {
  if (!ledger.active) return
  try {
    list.value = await api.challenges(ledger.active.id)
  } catch {
    list.value = []
  }
}
onMounted(load)
watch(() => ledger.active?.id, load)

const rows = computed(() =>
  list.value.map((c) => ({ challenge: c, progress: challengeProgress(c, ledger.entries, today) })),
)

/** ตัวการ์ตูนเชียร์ตามความคืบหน้า */
function cheer(p: ChallengeProgress): string {
  if (p.status === 'completed') return 'สำเร็จแล้ว! เก่งที่สุดเลย'
  if (p.status === 'broken') return `มีรายจ่ายในหมวดนี้ ${p.brokenDays.length} วัน ไม่เป็นไร เริ่มใหม่ได้เสมอ`
  if (p.status === 'ended') return 'หมดเวลาแล้ว ลองตั้งภารกิจใหม่กันไหม'
  if (p.currentKey && !p.currentDone) return 'รอบนี้ยังไม่ได้ออมนะ สู้ ๆ!'
  if (p.percent >= 0.5) return 'ผ่านครึ่งทางแล้ว อีกนิดเดียว!'
  return 'เริ่มได้ดีมาก ทำต่อไปเรื่อย ๆ นะ'
}

async function create() {
  if (!ledger.active) return
  saving.value = true
  try {
    const created = await api.addChallenge(ledger.active.id, {
      kind: form.kind,
      title: form.title || typeOf(form.kind).label,
      startDate: form.startDate,
      amount: form.amount,
      days: form.days,
      categoryKey: form.categoryKey,
    })
    list.value = [...list.value, created]
    adding.value = false
    form.title = ''
    toast.success('เริ่มภารกิจแล้ว สู้ ๆ!')
    game.scheduleRefresh()
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'เริ่มภารกิจไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

async function checkin(c: ChallengeRecord, key: string) {
  try {
    const updated = await api.toggleCheckin(c.id, key)
    list.value = list.value.map((x) => (x.id === c.id ? updated : x))
    game.scheduleRefresh()
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'บันทึกไม่สำเร็จ')
  }
}

async function remove(c: ChallengeRecord) {
  if (!confirm(`เลิกภารกิจ "${c.title}"?`)) return
  try {
    await api.deleteChallenge(c.id)
    list.value = list.value.filter((x) => x.id !== c.id)
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'ลบไม่สำเร็จ')
  }
}

function roundLabel(c: ChallengeRecord, p: ChallengeProgress): string {
  return c.kind === 'week52' ? `สัปดาห์ที่ ${p.currentKey}` : 'วันนี้'
}
</script>

<template>
  <section class="card challenges">
    <div class="card-head">
      <div>
        <h3>ภารกิจออมเงิน</h3>
        <p>ตั้งภารกิจสนุก ๆ แล้วให้ตัวการ์ตูนเชียร์ ทำสำเร็จได้เหรียญด้วย</p>
      </div>
      <button v-if="!adding" class="btn btn-ghost btn-sm" type="button" @click="adding = true">
        <AppIcon name="plus" :size="15" />
        เริ่มภารกิจ
      </button>
    </div>

    <!-- ฟอร์มเริ่มภารกิจ -->
    <form v-if="adding" class="challenge-form" novalidate @submit.prevent="create">
      <div class="challenge-types" role="radiogroup" aria-label="ประเภทภารกิจ">
        <button
          v-for="t in CHALLENGE_TYPES"
          :key="t.kind"
          type="button"
          role="radio"
          class="mode-card"
          :class="{ selected: form.kind === t.kind }"
          :aria-checked="form.kind === t.kind"
          @click="form.kind = t.kind"
        >
          <strong>{{ t.label }}</strong>
          <span class="muted small">{{ t.description }}</span>
        </button>
      </div>
      <div class="field-grid mt-2">
        <div class="field">
          <label for="ch-title">ชื่อภารกิจ</label>
          <input id="ch-title" v-model="form.title" type="text" :placeholder="typeOf(form.kind).label" maxlength="40" />
        </div>
        <div class="field">
          <label for="ch-start">เริ่มวันที่</label>
          <input id="ch-start" v-model="form.startDate" type="date" />
        </div>
        <MoneyField
          v-if="form.kind !== 'nospend'"
          v-model="form.amount"
          :label="form.kind === 'week52' ? 'ยอดฐานต่อสัปดาห์' : 'ออมวันละ'"
          :hint="
            form.kind === 'week52'
              ? `ครบปีได้ ${formatBaht(form.amount * 1378)}`
              : `ครบ ${form.days} วันได้ ${formatBaht(form.amount * form.days)}`
          "
        />
        <div v-if="form.kind === 'nospend'" class="field">
          <label for="ch-cat">หมวดที่จะงด</label>
          <select id="ch-cat" v-model="form.categoryKey">
            <option v-for="c in expenseCategories" :key="c.key" :value="c.key">{{ c.label }}</option>
          </select>
        </div>
        <div v-if="form.kind !== 'week52'" class="field">
          <label for="ch-days">จำนวนวัน</label>
          <input id="ch-days" v-model.number="form.days" type="number" min="1" max="400" />
        </div>
      </div>
      <div class="row" style="justify-content: flex-end; gap: 8px">
        <button class="btn btn-ghost" type="button" @click="adding = false">ยกเลิก</button>
        <button class="btn btn-primary" type="submit" :disabled="saving">เริ่มเลย</button>
      </div>
    </form>

    <div v-else-if="!rows.length" class="empty-state">
      <span class="ico-big"><AppIcon name="spark" :size="24" /></span>
      <h3>ยังไม่มีภารกิจ</h3>
      <p>ลอง "ออมทุกวัน วันละ 20 บาท 30 วัน" หรือ "งดช้อปปิ้ง 30 วัน" ดูสิ</p>
    </div>

    <template v-else>
    <div v-for="{ challenge: c, progress: p } in rows" :key="c.id" class="challenge-row" :class="p.status">
      <MascotFigure
        class="challenge-mascot"
        :mascot="theme.mascot.value"
        :size="56"
        :mood="p.status === 'completed' ? 'happy' : p.status === 'broken' ? 'worried' : 'normal'"
        :accessory="game.equipped"
      />
      <div class="challenge-body">
        <div class="challenge-head">
          <strong>{{ c.title }}</strong>
          <span class="small muted">เริ่ม {{ thaiDate(c.startDate) }}</span>
        </div>
        <div class="budget-bar" :class="p.status === 'broken' ? 'over' : p.status === 'completed' ? '' : 'warn'">
          <span :style="{ width: `${Math.min(100, p.percent * 100)}%` }"></span>
        </div>
        <p class="small">
          {{ p.done }} / {{ p.total }} {{ c.kind === 'week52' ? 'สัปดาห์' : 'วัน' }}
          <template v-if="c.kind !== 'nospend'"> · ออมแล้ว {{ formatBaht(p.saved) }} จาก {{ formatBaht(p.target) }}</template>
        </p>
        <p class="challenge-cheer small">{{ cheer(p) }}</p>
      </div>
      <div class="challenge-actions">
        <button
          v-if="p.currentKey && p.status === 'active'"
          class="btn btn-sm"
          :class="p.currentDone ? 'btn-ghost' : 'btn-primary'"
          type="button"
          @click="checkin(c, p.currentKey)"
        >
          <AppIcon v-if="p.currentDone" name="check" :size="15" />
          {{ p.currentDone ? `${roundLabel(c, p)}ออมแล้ว` : `ออม ${formatBaht(p.currentAmount)}` }}
        </button>
        <button class="btn btn-ghost btn-sm" type="button" :aria-label="`เลิกภารกิจ ${c.title}`" @click="remove(c)">
          <AppIcon name="trash" :size="15" />
        </button>
      </div>
    </div>
    </template>
  </section>
</template>
