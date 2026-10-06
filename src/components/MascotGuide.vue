<script setup lang="ts">
/**
 * ตัวการ์ตูนผู้ช่วยมุมขวาล่าง — ถามว่า "วันนี้จะทำเรื่องอะไรเอ่ย?" แล้วแนะนำต่อเป็นขั้น ๆ
 * ใช้ตัวการ์ตูนที่ผู้ใช้เลือกในธีม และสร้างคำแนะนำจากตัวเลขจริงของผู้ใช้
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import MascotFigure from './MascotFigure.vue'
import { useGameStore } from '@/stores/game'
import { GUIDE_FLOW, type GuideAction, type GuideContext, type GuideOption } from '@/data/guideFlow'
import { findMascot } from '@/data/mascot'
import { useTheme } from '@/composables/useTheme'
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

function go(action: GuideAction) {
  open.value = false
  if (route.fullPath !== action.to) router.push(action.to)
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
                  :key="action.to + action.label"
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

    <button
      class="guide-fab"
      :class="{ active: open }"
      type="button"
      :aria-expanded="open"
      :aria-label="open ? 'ปิดผู้ช่วย' : `คุยกับ${mascot.label}`"
      :title="open ? 'ปิดผู้ช่วย' : 'วันนี้จะทำเรื่องอะไรเอ่ย?'"
      @click="toggle"
    >
      <MascotFigure :mascot="mascot.key" :size="50" :mood="game.mood.mood" :accessory="game.equipped" />
    </button>
  </div>
</template>
