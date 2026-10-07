<script setup lang="ts">
/**
 * ตัวการ์ตูนแนะนำฟีเจอร์เมื่อเข้าหน้านั้นครั้งแรก
 *
 * - รอหน้าโหลดข้อมูลเสร็จสักครู่ก่อนโผล่ ไม่แย่งความสนใจตอนหน้ากำลังขึ้น
 * - ขั้นที่มีจุดให้ดู: เลื่อนจุดนั้นมากลางจอ ส่องไฟให้ (ฉากหลังมืด เว้นช่องตรงจุดนั้น) แล้ววางกล่องคำพูดข้าง ๆ
 * - ขั้นที่ไม่มีจุด: การ์ดกลางจอ
 * - ปุ่ม ถัดไป / ย้อนกลับ / ข้าม · คีย์บอร์ด → ← Esc · "ไม่ต้องแนะนำอีก" ปิดทุกหน้า
 * - ไม่โผล่ทับหน้าต่างอื่น (บันทึกด่วน ค้นหา เมนูลิ้นชัก การฉลอง) รอให้ปิดก่อน
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import MascotFigure from './MascotFigure.vue'
import { introForRoute, type IntroStep } from '@/data/featureIntros'
import { findMascot } from '@/data/mascot'
import { useTheme } from '@/composables/useTheme'
import { useCelebrateStore } from '@/stores/celebrate'
import { useGameStore } from '@/stores/game'
import { useIntroStore } from '@/stores/intro'
import { useUiStore } from '@/stores/ui'

/** รอให้หน้าโหลดก่อนโผล่ — เทสต์ส่ง 0 */
const props = withDefaults(defineProps<{ startDelay?: number }>(), { startDelay: 900 })

const route = useRoute()
const theme = useTheme()
const game = useGameStore()
const intro = useIntroStore()
const ui = useUiStore()
const celebrate = useCelebrateStore()

const mascot = computed(() => findMascot(theme.mascot.value))

const activeKey = ref<string | null>(null)
const steps = ref<IntroStep[]>([])
const index = ref(0)
const rect = ref<DOMRect | null>(null)
const primary = ref<HTMLButtonElement | null>(null)
let startTimer: ReturnType<typeof setTimeout> | undefined
let settleTimer: ReturnType<typeof setTimeout> | undefined

const step = computed(() => steps.value[index.value] ?? null)
const isLast = computed(() => index.value >= steps.value.length - 1)
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** หน้าต่างอื่นที่กำลังเปิดอยู่ — คำแนะนำต้องรอ */
const busy = computed(() => ui.quickAddOpen || ui.paletteOpen || ui.navOpen || celebrate.queue.length > 0)

/**
 * ตัวแรกในรายการ selector ที่มองเห็นบนจอจริง
 * ข้ามตัวที่ถูกซ่อน (display:none) และตัวที่อยู่นอกจอด้านข้าง เช่นปุ่มในเมนูลิ้นชักที่ปิดอยู่บนมือถือ
 * ส่วนตัวที่อยู่นอกจอด้านบน/ล่างยังใช้ได้ เพราะเลื่อนจอไปหาได้
 */
function findTarget(selector: string | undefined): HTMLElement | null {
  if (!selector) return null
  for (const one of selector.split(',')) {
    for (const el of document.querySelectorAll<HTMLElement>(one.trim())) {
      const r = el.getBoundingClientRect()
      const onScreenX = r.right > 0 && r.left < window.innerWidth
      if (r.width > 0 && r.height > 0 && onScreenX && getComputedStyle(el).visibility !== 'hidden') return el
    }
  }
  return null
}

function schedule(force = false) {
  clearTimeout(startTimer)
  close(false)
  const found = introForRoute(route.name as string | undefined)
  if (!found || (!force && !intro.shouldShow(found.key))) return
  startTimer = setTimeout(() => tryStart(found.key, found.intro.steps), props.startDelay)
}

function tryStart(key: string, all: IntroStep[]) {
  // มีหน้าต่างอื่นเปิดอยู่ รอแล้วลองใหม่
  if (busy.value) {
    startTimer = setTimeout(() => tryStart(key, all), 800)
    return
  }
  // ตัดขั้นที่หาจุดไม่เจอ (เช่นยังไม่มีข้อมูลให้ดู) — ขั้นที่ไม่มีจุดแสดงได้เสมอ
  const usable = all.filter((s) => !s.target || findTarget(s.target))
  if (!usable.length) return intro.markSeen(key)
  activeKey.value = key
  steps.value = usable
  index.value = 0
  void show()
}

async function show() {
  rect.value = null
  const el = findTarget(step.value?.target)
  if (el) {
    // จุดที่สูงเกินครึ่งจอ เลื่อนให้หัวของมันอยู่บนจอ กล่องคำพูดจะได้บังแค่ส่วนท้าย
    const tall = el.getBoundingClientRect().height > window.innerHeight * 0.5
    el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
    // รอเลื่อนจอเสร็จก่อนวัดตำแหน่ง
    clearTimeout(settleTimer)
    await new Promise<void>((r) => (settleTimer = setTimeout(r, reducedMotion() ? 0 : 380)))
    if (!activeKey.value) return
    rect.value = el.getBoundingClientRect()
  }
  await nextTick()
  primary.value?.focus({ preventScroll: true })
}

function measure() {
  const el = findTarget(step.value?.target)
  rect.value = el ? el.getBoundingClientRect() : null
}

function next() {
  if (isLast.value) return close(true)
  index.value += 1
  void show()
}
function back() {
  if (index.value === 0) return
  index.value -= 1
  void show()
}
function close(markSeen = true) {
  clearTimeout(settleTimer)
  if (activeKey.value && markSeen) intro.markSeen(activeKey.value)
  activeKey.value = null
  steps.value = []
  rect.value = null
}
function turnOff() {
  intro.setOff(true)
  close(true)
}

function onKeydown(event: KeyboardEvent) {
  if (!activeKey.value) return
  if (event.key === 'Escape') close(true)
  else if (event.key === 'ArrowRight') next()
  else if (event.key === 'ArrowLeft') back()
}

let frame = 0
function onViewportChange() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(measure)
}

function unlisten() {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
}
watch(activeKey, (active) => {
  unlisten()
  if (!active) return
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onViewportChange)
  // จับ scroll ของทุกกล่อง (capture) จุดส่องไฟจะได้ตามติดเวลาผู้ใช้เลื่อนจอ
  window.addEventListener('scroll', onViewportChange, true)
})

watch(() => route.name, () => schedule(), { immediate: true })
watch(() => intro.replayTick, () => schedule(true))

onBeforeUnmount(() => {
  clearTimeout(startTimer)
  close(false)
  unlisten()
})

/* ---------- ตำแหน่ง ---------- */

const PAD = 8
const spot = computed(() => {
  const r = rect.value
  if (!r) return null
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
})

/**
 * วางกล่องคำพูดไม่ให้บังจุดที่ส่องไฟ ลองตามลำดับ: ใต้จุด → เหนือจุด → ขวาของจุด → ซ้ายของจุด
 * ถ้าไม่มีที่ว่างเลย (จุดใหญ่เกือบเต็มจอบนมือถือ) วางชิดล่างจอ เหนือแถบล่าง
 */
const bubbleStyle = computed(() => {
  const s = spot.value
  if (!s) return {}
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(380, vw - 24)
  const estimate = 230
  const gap = 12
  const left = Math.min(Math.max(12, s.left), vw - width - 12)
  const sideTop = Math.min(Math.max(12, s.top), vh - estimate - 12)
  if (s.top + s.height + gap + estimate < vh) return { top: `${s.top + s.height + gap}px`, left: `${left}px`, width: `${width}px` }
  if (s.top - gap - estimate > 0) return { bottom: `${vh - s.top + gap}px`, left: `${left}px`, width: `${width}px` }
  if (vw - (s.left + s.width) - gap * 2 >= width) return { top: `${sideTop}px`, left: `${s.left + s.width + gap}px`, width: `${width}px` }
  if (s.left - gap * 2 >= width) return { top: `${sideTop}px`, left: `${s.left - gap - width}px`, width: `${width}px` }
  return { bottom: '96px', left: `${(vw - width) / 2}px`, width: `${width}px` }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="intro-fade">
      <div v-if="activeKey && step" class="intro-layer no-print" :class="{ centered: !spot }">
        <!-- ฉากหลังมืด กันการกดโดนของข้างหลังโดยไม่ตั้งใจ -->
        <div class="intro-dim" :class="{ clear: spot }"></div>
        <div v-if="spot" class="intro-spot" :style="{ top: `${spot.top}px`, left: `${spot.left}px`, width: `${spot.width}px`, height: `${spot.height}px` }"></div>

        <section
          class="intro-bubble"
          :style="bubbleStyle"
          role="dialog"
          aria-modal="true"
          aria-labelledby="intro-title"
          aria-describedby="intro-text"
        >
          <div class="intro-head">
            <MascotFigure :mascot="mascot.key" :size="56" mood="happy" :accessory="game.equipped" />
            <div>
              <small>{{ mascot.label }} แนะนำ · {{ index + 1 }}/{{ steps.length }}</small>
              <h3 id="intro-title">{{ step.title }}</h3>
            </div>
          </div>
          <p id="intro-text">{{ step.text }}</p>

          <div class="intro-dots" aria-hidden="true">
            <span v-for="(s, i) in steps" :key="i" :class="{ on: i === index }"></span>
          </div>

          <div class="intro-actions">
            <button type="button" class="intro-link" @click="turnOff">ไม่ต้องแนะนำอีก</button>
            <span class="intro-spacer"></span>
            <button v-if="index > 0" type="button" class="btn btn-ghost btn-sm" @click="back">ย้อนกลับ</button>
            <button v-else type="button" class="btn btn-ghost btn-sm" @click="close(true)">ข้าม</button>
            <button ref="primary" type="button" class="btn btn-primary btn-sm" @click="next">
              {{ isLast ? 'เข้าใจแล้ว' : 'ถัดไป' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.intro-layer {
  position: fixed;
  inset: 0;
  z-index: 140;
}
.intro-dim {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
}
/* มีจุดส่องไฟ: ฉากหลังมืดมาจากเงาของช่องส่องไฟแทน พื้นนี้แค่กันคลิก */
.intro-dim.clear {
  background: transparent;
}
.intro-spot {
  position: absolute;
  border-radius: 14px;
  box-shadow:
    0 0 0 3px var(--accent),
    0 0 0 9999px rgba(15, 23, 42, 0.5);
  pointer-events: none;
  transition: top 0.3s var(--ease-out), left 0.3s var(--ease-out), width 0.3s var(--ease-out), height 0.3s var(--ease-out);
}
.intro-bubble {
  position: absolute;
  display: grid;
  gap: 10px;
  padding: 16px 18px 14px;
  border-radius: 18px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-lg);
}
.intro-layer.centered .intro-bubble {
  top: 50%;
  left: 50%;
  width: min(420px, calc(100% - 24px));
  transform: translate(-50%, -50%);
}
.intro-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.intro-head small {
  color: var(--text-dim);
  font-size: 12.5px;
}
.intro-head h3 {
  margin: 0;
  font-size: 18px;
  line-height: 1.35;
}
.intro-bubble p {
  margin: 0;
  line-height: 1.6;
}
.intro-dots {
  display: flex;
  gap: 6px;
}
.intro-dots span {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--line-strong);
  transition: width 0.2s ease;
}
.intro-dots span.on {
  width: 20px;
  background: var(--accent);
}
.intro-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.intro-spacer {
  flex: 1;
}
.intro-link {
  border: 0;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
  padding: 6px 0;
}
.intro-fade-enter-active,
.intro-fade-leave-active {
  transition: opacity 0.2s ease;
}
.intro-fade-enter-from,
.intro-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .intro-spot {
    transition: none;
  }
}
</style>
