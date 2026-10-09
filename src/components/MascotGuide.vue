<script setup lang="ts">
/**
 * ตัวการ์ตูนผู้ช่วยมุมขวาล่าง — ถามว่า "วันนี้จะทำเรื่องอะไรเอ่ย?" แล้วแนะนำต่อเป็นขั้น ๆ
 * ใช้ตัวการ์ตูนที่ผู้ใช้เลือกในธีม และสร้างคำแนะนำจากตัวเลขจริงของผู้ใช้
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import MascotFigure from './MascotFigure.vue'
import { useGameStore } from '@/stores/game'
import { GUIDE_FLOW, type GuideAction, type GuideContext, type GuideOption } from '@/data/guideFlow'
import { findMascot } from '@/data/mascot'
import { HOVER_LINES, IDLE_LINES, MASCOT_SOUND, TICKLE_LINES, pick } from '@/data/mascotLines'
import { burst, centerOf, motionAllowed } from '@/services/fx'
import { useMascotFxStore } from '@/stores/mascotFx'
import { useTheme } from '@/composables/useTheme'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { useToastStore } from '@/stores/toast'
import { daysUntilYearEnd, suggestDeductions } from '@/services/deductionAdvisor'
import { upcomingDeadlines } from '@/services/taxCalendar'
import { useAuthStore } from '@/stores/auth'
import { useFilingStore } from '@/stores/filing'
import { useLedgerStore } from '@/stores/ledger'

/** เวลาที่แสดงจุดกำลังพิมพ์ก่อนตอบ — เทสต์ส่ง 0 มาเพื่อตอบทันที */
const props = withDefaults(defineProps<{ typingDelay?: number }>(), { typingDelay: 550 })

interface Message {
  id: number
  from: 'bot' | 'user'
  text: string
  actions?: GuideAction[]
}

const theme = useTheme()
const game = useGameStore()
const auth = useAuthStore()
const filing = useFilingStore()
const ledger = useLedgerStore()
const router = useRouter()
const route = useRoute()
const pwa = usePwaInstall()
const toast = useToastStore()

const mascot = computed(() => findMascot(theme.mascot.value))

const open = ref(false)
const typing = ref(false)
const messages = ref<Message[]>([])
const options = ref<GuideOption[]>([])
const scroller = ref<HTMLElement | null>(null)
let nextId = 1
let timer: ReturnType<typeof setTimeout> | undefined

/** ข้อมูลจริงของผู้ใช้ที่ใช้แต่งคำแนะนำ — คำนวณตอนตอบแต่ละครั้ง ตัวเลขจึงเป็นปัจจุบันเสมอ */
function context(): GuideContext {
  const first = ledger.workspaces[0] ?? null
  return {
    loggedIn: auth.isLoggedIn,
    workspaceId: first?.id ?? null,
    workspaceName: first?.name ?? '',
    advice: suggestDeductions(filing.income, filing.deductions, filing.withholdingTax, 5, filing.taxOptions),
    daysToYearEnd: daysUntilYearEnd(),
    nearest: upcomingDeadlines([...new Set(ledger.workspaces.map((w) => w.mode))])[0] ?? null,
    app: { installed: pwa.installed.value, canPrompt: !!pwa.canInstall.value, hint: pwa.hint() },
  }
}

async function scrollToBottom() {
  await nextTick()
  // ตั้ง scrollTop ตรง ๆ (ความนุ่มมาจาก scroll-behavior ใน CSS) เพราะ element.scrollTo ไม่มีในบางเบราว์เซอร์
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

function reply(nodeId: string) {
  const build = GUIDE_FLOW[nodeId] ?? GUIDE_FLOW.root!
  const answer = () => {
    const node = build(context())
    typing.value = false
    messages.value.push({ id: nextId++, from: 'bot', text: node.text, actions: node.actions })
    options.value = node.options
    scrollToBottom()
  }
  options.value = []
  if (props.typingDelay <= 0) return answer()
  typing.value = true
  scrollToBottom()
  timer = setTimeout(answer, props.typingDelay)
}

function choose(option: GuideOption) {
  messages.value.push({ id: nextId++, from: 'user', text: option.label })
  reply(option.next)
}

async function go(action: GuideAction) {
  if (action.run === 'install') {
    if (await pwa.install()) {
      toast.success('ติดตั้ง Jodwise เป็นแอปแล้ว')
      open.value = false
    } else {
      // กดยกเลิก หรือเบราว์เซอร์ไม่ให้หน้าต่างติดตั้งแล้ว — ตอบใหม่ด้วยวิธีติดตั้งเอง
      reply('install')
    }
    return
  }
  open.value = false
  if (action.to && route.fullPath !== action.to) router.push(action.to)
}

/** เริ่มบทสนทนาใหม่ */
function restart() {
  clearTimeout(timer)
  messages.value = []
  reply('root')
}

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  // สมาชิกที่ยังไม่เคยเปิดหน้าสมุด ต้องโหลดรายชื่อสมุดก่อน คำแนะนำจะได้พาไปเล่มที่มีจริง
  if (auth.isLoggedIn && !ledger.workspaces.length) {
    try {
      await ledger.loadWorkspaces()
    } catch {
      /* โหลดไม่ได้ก็ยังแนะนำแบบทั่วไปได้ */
    }
  }
  if (!messages.value.length) reply('root')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})

// ล็อกเอาต์หรือเปลี่ยนบัญชีแล้ว บทสนทนาเดิมอ้างถึงสมุดของอีกคน ต้องเริ่มใหม่
watch(
  () => auth.user?.id,
  () => {
    clearTimeout(timer)
    messages.value = []
    options.value = []
  },
)

onBeforeUnmount(() => {
  clearTimeout(timer)
  document.removeEventListener('keydown', onKeydown)
})

/* =========================================================
   ลูกเล่นของตัวการ์ตูน: ชี้แล้วพูด · จี้แล้วหัวเราะ · หันตามเมาส์ · ง่วงเมื่อปล่อยไว้นาน · ตอบสนองต่อสิ่งที่ผู้ใช้ทำ
   ========================================================= */

const fx = useMascotFxStore()
const fab = ref<HTMLButtonElement | null>(null)
const say = ref('')
const move = ref<'' | 'hop' | 'jump' | 'shake' | 'spin' | 'tickle' | 'sleepy'>('')
/** มุมเอียงหน้าไปทางเมาส์ (องศา) */
const look = ref(0)
let sayTimer: ReturnType<typeof setTimeout> | undefined
let moveTimer: ReturnType<typeof setTimeout> | undefined

function speak(text: string, ms = 2800) {
  if (open.value) return
  say.value = `${MASCOT_SOUND[mascot.value.key]} ${text}`
  clearTimeout(sayTimer)
  sayTimer = setTimeout(() => (say.value = ''), ms)
}
function play(kind: typeof move.value, ms = 900) {
  if (!motionAllowed()) return
  // ล้างก่อนแล้วใส่ใหม่ในเฟรมถัดไป ท่าเดิมซ้ำติดกันจะได้เล่นใหม่
  move.value = ''
  clearTimeout(moveTimer)
  requestAnimationFrame(() => {
    move.value = kind
    moveTimer = setTimeout(() => (move.value = ''), ms)
  })
}

/* ชี้ */
function onEnter() {
  wakeUp()
  if (open.value) return
  speak(pick(HOVER_LINES))
  play('hop', 600)
}

/* จี้: ส่ายเมาส์ไปมาบนตัว (คอม) หรือกดค้าง (มือถือ) */
let wiggle = { dist: 0, since: 0, x: 0, y: 0 }
let tickleCooldown = 0
let pressTimer: ReturnType<typeof setTimeout> | undefined
let suppressClick = false

function tickle() {
  if (Date.now() < tickleCooldown) return
  tickleCooldown = Date.now() + 2500
  speak(pick(TICKLE_LINES), 2200)
  play('tickle', 1100)
  burst(centerOf(fab.value), { items: ['💗', '✨', '💕'], count: 8, spread: 70, upward: false, size: 16 })
}
function onFabMove(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  const now = Date.now()
  if (now - wiggle.since > 1200) wiggle = { dist: 0, since: now, x: event.clientX, y: event.clientY }
  wiggle.dist += Math.hypot(event.clientX - wiggle.x, event.clientY - wiggle.y)
  wiggle.x = event.clientX
  wiggle.y = event.clientY
  if (wiggle.dist > 380) {
    wiggle.dist = 0
    tickle()
  }
}
function onFabDown(event: PointerEvent) {
  if (event.pointerType === 'mouse') return
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    suppressClick = true
    tickle()
  }, 480)
}
function onFabUp() {
  clearTimeout(pressTimer)
}
function onFabClick() {
  // กดค้างเพื่อจี้แล้ว ไม่ต้องเปิดแชทตามมา
  if (suppressClick) {
    suppressClick = false
    return
  }
  say.value = ''
  play('hop', 500)
  void toggle()
}

/* หันตามเมาส์ */
let lookFrame = 0
function onWindowMove(event: MouseEvent) {
  cancelAnimationFrame(lookFrame)
  lookFrame = requestAnimationFrame(() => {
    if (!fab.value || open.value) return (look.value = 0)
    const c = centerOf(fab.value)
    // ยิ่งเมาส์ไกลไปทางไหน ยิ่งเอียงหน้าไปทางนั้น สูงสุด 14 องศา
    look.value = Math.max(-14, Math.min(14, (event.clientX - c.x) / 40))
  })
}

/* ง่วงเมื่อปล่อยไว้นาน */
const IDLE_MS = 75_000
let idleTimer: ReturnType<typeof setTimeout> | undefined
let sleeping = false
function wakeUp() {
  clearTimeout(idleTimer)
  if (sleeping) {
    sleeping = false
    if (move.value === 'sleepy') move.value = ''
  }
  idleTimer = setTimeout(() => {
    sleeping = true
    speak(pick(IDLE_LINES), 4000)
    if (motionAllowed()) move.value = 'sleepy'
  }, IDLE_MS)
}

/* ตอบสนองต่อสิ่งที่ผู้ใช้ทำทั้งเว็บ */
watch(
  () => fx.last?.id,
  () => {
    const r = fx.last
    if (!r) return
    wakeUp()
    speak(r.line, 2600)
    play(r.move, r.move === 'spin' ? 1000 : 800)
  },
)

const ACTIVITY = ['pointerdown', 'keydown', 'scroll'] as const
onMounted(() => {
  window.addEventListener('mousemove', onWindowMove, { passive: true })
  for (const e of ACTIVITY) window.addEventListener(e, wakeUp, { passive: true })
  wakeUp()
})
onBeforeUnmount(() => {
  clearTimeout(sayTimer)
  clearTimeout(moveTimer)
  clearTimeout(idleTimer)
  clearTimeout(pressTimer)
  cancelAnimationFrame(lookFrame)
  window.removeEventListener('mousemove', onWindowMove)
  for (const e of ACTIVITY) window.removeEventListener(e, wakeUp)
})
</script>

<template>
  <div class="guide no-print">
    <Transition name="guide-pop">
      <section
        v-if="open"
        class="guide-panel"
        role="dialog"
        :aria-label="`${mascot.label} ผู้ช่วยแนะนำ`"
      >
        <header class="guide-head">
          <MascotFigure class="guide-face" :mascot="mascot.key" :size="40" :mood="game.mood.mood" :accessory="game.equipped" />
          <span class="guide-title">
            <strong>{{ mascot.label }}</strong>
            <small>ผู้ช่วยแนะนำ</small>
          </span>
          <button class="guide-icon-btn" type="button" title="เริ่มใหม่" aria-label="เริ่มบทสนทนาใหม่" @click="restart">
            <AppIcon name="history" :size="17" />
          </button>
          <button class="guide-icon-btn" type="button" aria-label="ปิดผู้ช่วย" @click="open = false">
            <AppIcon name="close" :size="18" />
          </button>
        </header>

        <div ref="scroller" class="guide-body" aria-live="polite">
          <TransitionGroup name="guide-msg">
            <div v-for="message in messages" :key="message.id" class="guide-msg" :class="message.from">
              <p>{{ message.text }}</p>
              <div v-if="message.actions?.length" class="guide-actions">
                <button
                  v-for="action in message.actions"
                  :key="(action.to ?? action.run) + action.label"
                  class="btn btn-primary btn-sm"
                  type="button"
                  @click="go(action)"
                >
                  {{ action.label }}
                  <AppIcon name="arrowRight" :size="15" />
                </button>
              </div>
            </div>
          </TransitionGroup>
          <div v-if="typing" class="guide-msg bot typing" aria-label="กำลังพิมพ์">
            <i></i><i></i><i></i>
          </div>
        </div>

        <div v-if="options.length" class="guide-options">
          <button
            v-for="option in options"
            :key="option.next + option.label"
            class="chip"
            type="button"
            @click="choose(option)"
          >
            {{ option.label }}
          </button>
        </div>
      </section>
    </Transition>

    <!-- คำพูดเล่น ๆ ของตัวการ์ตูน เป็นของตกแต่ง โปรแกรมอ่านหน้าจอไม่ต้องอ่าน (ข้อความสำคัญมี toast อยู่แล้ว) -->
    <Transition name="say-pop">
      <span v-if="say && !open" :key="say" class="guide-say" aria-hidden="true">{{ say }}</span>
    </Transition>
    <button
      ref="fab"
      class="guide-fab"
      :class="[{ active: open }, move ? `do-${move}` : '']"
      :style="{ '--look': `${look}deg` }"
      type="button"
      :aria-expanded="open"
      :aria-label="open ? 'ปิดผู้ช่วย' : `คุยกับ${mascot.label}`"
      @pointerenter="onEnter"
      @pointermove="onFabMove"
      @pointerdown="onFabDown"
      @pointerup="onFabUp"
      @pointercancel="onFabUp"
      @click="onFabClick"
    >
      <span class="guide-fab-body">
        <MascotFigure
          :mascot="mascot.key"
          :size="50"
          :mood="move === 'tickle' || move === 'jump' ? 'happy' : move === 'sleepy' ? 'sleepy' : game.mood.mood"
          :accessory="game.equipped"
        />
      </span>
    </button>
  </div>
</template>
