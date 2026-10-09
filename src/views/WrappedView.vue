<script setup lang="ts">
/**
 * สรุปทั้งปีแบบเล่าเรื่อง เลื่อนดูทีละหน้าเหมือนสตอรี่
 * หน้าสุดท้ายบันทึกเป็นรูป (วาดบน canvas เอง ไม่ต้องใช้ไลบรารี) หรือแชร์ได้
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MascotFigure from '@/components/MascotFigure.vue'
import { findMascot, mascotDataUrl } from '@/data/mascot'
import { useTheme } from '@/composables/useTheme'
import { buildWrapped, wrappedYears } from '@/services/wrapped'
import { formatBaht, formatPercent, thaiDate } from '@/services/taxEngine'
import { useGameStore } from '@/stores/game'
import { useToastStore } from '@/stores/toast'

const SLIDE_MS = 6000

const game = useGameStore()
const theme = useTheme()
const toast = useToastStore()

onMounted(() => void game.refresh())

const years = computed(() => wrappedYears(game.entries))
const year = ref(new Date().getFullYear())
watch(years, (list) => {
  if (list.length && !list.includes(year.value)) year.value = list[0]!
}, { immediate: true })

const summary = computed(() => buildWrapped(game.entries, game.workspaces, game.filings, year.value))

const monthName = (m: string) => {
  const [y, mm] = m.split('-').map(Number)
  return y && mm ? new Date(y, mm - 1, 1).toLocaleDateString('th-TH', { month: 'long' }) : m
}

interface Slide {
  key: string
  eyebrow: string
  big: string
  text: string
  mood: 'normal' | 'happy' | 'worried' | 'sleepy'
}

const slides = computed<Slide[]>(() => {
  const s = summary.value
  const list: Slide[] = [
    {
      key: 'intro',
      eyebrow: `ปี ${s.year + 543}`,
      big: 'มาดูกันว่าปีนี้เงินไปไหนบ้าง',
      text: `คุณจดไป ${s.entryCount} รายการ ใน ${s.activeDays} วัน`,
      mood: 'happy',
    },
    {
      key: 'totals',
      eyebrow: 'ทั้งปีมีเงินเข้า',
      big: formatBaht(s.income),
      text: `ใช้ไป ${formatBaht(s.expense)} เหลือเก็บ ${formatBaht(s.net)}`,
      mood: s.net >= 0 ? 'happy' : 'worried',
    },
  ]
  if (s.topCategory) {
    list.push({
      key: 'top',
      eyebrow: 'หมวดที่ใช้เงินมากที่สุด',
      big: s.topCategory.label,
      text: `${formatBaht(s.topCategory.amount)} คิดเป็น ${formatPercent(s.topCategory.share, 0)} ของรายจ่ายทั้งปี`,
      mood: 'normal',
    })
  }
  if (s.biggestExpense) {
    list.push({
      key: 'biggest',
      eyebrow: 'จ่ายก้อนใหญ่ที่สุด',
      big: formatBaht(s.biggestExpense.amount),
      text: `${s.biggestExpense.note || s.biggestExpense.label} เมื่อ ${thaiDate(s.biggestExpense.date)}`,
      mood: 'worried',
    })
  }
  if (s.frugalMonth) {
    list.push({
      key: 'frugal',
      eyebrow: 'เดือนที่ประหยัดที่สุด',
      big: monthName(s.frugalMonth.month),
      text: `ใช้ไปแค่ ${formatBaht(s.frugalMonth.expense)}`,
      mood: 'happy',
    })
  }
  list.push({
    key: 'streak',
    eyebrow: 'จดต่อเนื่องนานที่สุด',
    big: `${s.bestStreak} วัน`,
    text: s.bestStreak >= 7 ? 'วินัยดีมาก!' : 'ปีหน้าลองจดให้ต่อเนื่องขึ้นอีกนิดนะ',
    mood: s.bestStreak >= 7 ? 'happy' : 'normal',
  })
  const f = s.filing
  if (f) {
    list.push({
      key: 'tax',
      eyebrow: `ภาษีปี ${s.year + 543}`,
      big: f.balance < 0 ? `ได้คืน ${formatBaht(-f.balance)}` : formatBaht(f.tax),
      text: f.balance < 0 ? 'เงินคืนภาษีก้อนนี้ เอาไปออมต่อเลย!' : 'ภาษีที่ต้องเสียทั้งปีตามสรุปที่บันทึกไว้',
      mood: f.balance < 0 ? 'happy' : 'normal',
    })
  }
  list.push({
    key: 'outro',
    eyebrow: 'สรุปปีของคุณ',
    big: `ออมได้ ${formatPercent(Math.max(0, s.savingsRate), 0)}`,
    text: 'บันทึกเป็นรูปเก็บไว้ หรือแชร์ให้เพื่อนดูได้เลย',
    mood: 'happy',
  })
  return list
})

/* ---------- เลื่อนสไลด์ ---------- */

const index = ref(0)
const paused = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
const current = computed(() => slides.value[Math.min(index.value, slides.value.length - 1)]!)
const isLast = computed(() => index.value >= slides.value.length - 1)

function schedule() {
  clearTimeout(timer)
  if (paused.value || isLast.value) return
  timer = setTimeout(() => go(1), SLIDE_MS)
}
function go(delta: number) {
  index.value = Math.min(slides.value.length - 1, Math.max(0, index.value + delta))
  schedule()
}
watch([index, paused, year], schedule)
watch(year, () => (index.value = 0))
onMounted(schedule)
onBeforeUnmount(() => clearTimeout(timer))

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') go(1)
  if (event.key === 'ArrowLeft') go(-1)
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

/* ---------- บันทึกเป็นรูป ---------- */

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value && !value.startsWith('color-mix') ? value : fallback
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function renderImage(): Promise<Blob | null> {
  const s = summary.value
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  await document.fonts?.ready

  const from = cssVar('--accent', '#0f8f86')
  const to = cssVar('--accent-strong', '#0b6b64')
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350)
  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 1080, 1350)

  const font = getComputedStyle(document.body).fontFamily || 'sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = `600 44px ${font}`
  ctx.fillText(`Jodwise · สรุปปี ${s.year + 543}`, 540, 120)

  const mascot = await loadImage(mascotDataUrl(theme.mascot.value).slice(5, -2))
  if (mascot) ctx.drawImage(mascot, 390, 160, 300, 300)

  const stats: [string, string][] = [
    ['รายรับทั้งปี', formatBaht(s.income)],
    ['รายจ่ายทั้งปี', formatBaht(s.expense)],
    ['เหลือเก็บ', `${formatBaht(s.net)} (${formatPercent(Math.max(0, s.savingsRate), 0)})`],
    ['หมวดที่ใช้มากสุด', s.topCategory?.label ?? '-'],
    ['จดต่อเนื่องสูงสุด', `${s.bestStreak} วัน`],
  ]
  stats.forEach(([label, value], i) => {
    const y = 560 + i * 140
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.beginPath()
    ctx.roundRect?.(120, y - 70, 840, 118, 28)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.font = `500 32px ${font}`
    ctx.fillText(label, 540, y - 22)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 46px ${font}`
    ctx.fillText(value, 540, y + 32)
  })

  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = `500 28px ${font}`
  ctx.fillText(`${findMascot(theme.mascot.value).label} ชวนออมต่อปีหน้า!`, 540, 1290)

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

const busy = ref(false)

async function saveImage() {
  busy.value = true
  try {
    const blob = await renderImage()
    if (!blob) throw new Error('canvas')
    const file = new File([blob], `taxflow-wrapped-${summary.value.year + 543}.png`, { type: 'image/png' })
    // มือถือที่แชร์ไฟล์ได้ เปิดหน้าแชร์ให้เลย ไม่งั้นดาวน์โหลดไฟล์
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'สรุปปีของฉันจาก Jodwise' })
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('บันทึกรูปแล้ว')
    }
  } catch (error) {
    if ((error as Error)?.name !== 'AbortError') toast.error('สร้างรูปไม่สำเร็จ ลองใหม่อีกครั้ง')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container-narrow">
      <div class="section-head text-center">
        <span class="eyebrow">สรุปปีของฉัน</span>
        <h2>ปีนี้เงินของคุณเล่าเรื่องอะไรบ้าง</h2>
        <div v-if="years.length > 1" class="chip-row mt-1" style="justify-content: center">
          <button
            v-for="y in years"
            :key="y"
            type="button"
            class="chip"
            :class="{ selected: y === year }"
            @click="year = y"
          >
            ปี {{ y + 543 }}
          </button>
        </div>
      </div>

      <div v-if="!game.loaded" class="card" aria-busy="true">
        <div class="skeleton skeleton-row"></div>
        <div class="skeleton skeleton-row"></div>
      </div>

      <div v-else-if="!summary.entryCount" class="empty-state">
        <span class="ico-big"><AppIcon name="chart" :size="26" /></span>
        <h3>ยังไม่มีรายการในปีนี้</h3>
        <p>บันทึกรายรับรายจ่ายในสมุดบัญชี แล้วกลับมาดูสรุปปีได้เลย</p>
        <RouterLink class="btn btn-primary" to="/workspaces">ไปสมุดบัญชี</RouterLink>
      </div>

      <section
        v-else
        class="story"
        @mouseenter="paused = true"
        @mouseleave="paused = false"
      >
        <div class="story-bars" aria-hidden="true">
          <span v-for="(s, i) in slides" :key="s.key" :class="{ done: i < index, active: i === index && !paused }">
            <i :style="i === index ? { animationDuration: `${SLIDE_MS}ms` } : {}"></i>
          </span>
        </div>

        <Transition name="tab" mode="out-in">
          <div :key="current.key + year" class="story-slide" aria-live="polite">
            <MascotFigure :mascot="theme.mascot.value" :size="120" :mood="current.mood" :accessory="game.equipped" />
            <span class="story-eyebrow">{{ current.eyebrow }}</span>
            <strong class="story-big">{{ current.big }}</strong>
            <p class="story-text">{{ current.text }}</p>
            <div v-if="isLast" class="cta-row" style="justify-content: center">
              <button class="btn btn-primary" type="button" :disabled="busy" @click="saveImage">
                <AppIcon name="download" :size="17" />
                {{ busy ? 'กำลังสร้างรูป...' : 'บันทึก / แชร์เป็นรูป' }}
              </button>
              <button class="btn btn-ghost" type="button" @click="index = 0">ดูอีกรอบ</button>
            </div>
          </div>
        </Transition>

        <button class="story-nav prev" type="button" aria-label="หน้าก่อนหน้า" :disabled="index === 0" @click="go(-1)">
          <AppIcon name="arrowLeft" :size="20" />
        </button>
        <button class="story-nav next" type="button" aria-label="หน้าถัดไป" :disabled="isLast" @click="go(1)">
          <AppIcon name="arrowRight" :size="20" />
        </button>
      </section>
    </div>
  </main>
</template>
