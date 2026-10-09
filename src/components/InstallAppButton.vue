<script setup lang="ts">
/**
 * ปุ่ม "ติดตั้งเป็นแอป" ที่ใช้ร่วมกันทุกที่ — กดแล้วพยายามติดตั้งจริงก่อนเสมอ
 *  - Chrome/Edge/Samsung Internet: เปิดหน้าต่างติดตั้งของเบราว์เซอร์ทันที (ยังไม่พร้อมก็รอให้สักครู่)
 *  - เปิดจาก LINE/Facebook ฯลฯ: พาไปเปิดหน้าเดิมใน Chrome/Safari ก่อน เพราะในแอปพวกนั้นติดตั้งไม่ได้
 *  - iPhone/iPad: Apple ไม่ให้เว็บติดตั้งตัวเอง จึงเปิดแผ่นวิธีทำทีละขั้นพร้อมรูปปุ่มที่ต้องกด
 */
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import {
  inAppBrowser,
  installPlatform,
  openInRealBrowser,
  usePwaInstall,
} from '@/composables/usePwaInstall'
import { useToastStore } from '@/stores/toast'

withDefaults(defineProps<{ buttonClass?: string }>(), { buttonClass: 'btn btn-ghost btn-block' })
const emit = defineEmits<{ done: [] }>()

const pwa = usePwaInstall()
const toast = useToastStore()
const busy = ref(false)
const sheet = ref(false)
const copied = ref(false)

const platform = installPlatform()
const inApp = inAppBrowser()

interface Step {
  icon: string
  text: string
}

/** วิธีติดตั้งเองตามเครื่อง — ใช้เมื่อกดปุ่มแล้วเบราว์เซอร์ไม่มีหน้าต่างติดตั้งให้ */
const guide = computed<{ title: string; intro: string; steps: Step[] }>(() => {
  if (inApp) {
    const browser = platform === 'ios' ? 'Safari' : 'Chrome'
    return {
      title: `เปิดใน ${browser} ก่อนนะ`,
      intro: 'เบราว์เซอร์ในแอปแชตติดตั้งเว็บเป็นแอปไม่ได้',
      steps: [
        { icon: 'menu', text: 'กดปุ่ม ⋯ หรือ ⋮ มุมขวาของหน้าจอนี้' },
        { icon: 'arrowRight', text: `เลือก "เปิดใน ${browser}" หรือ "Open in browser"` },
        { icon: 'download', text: 'กดปุ่ม "ติดตั้งเป็นแอป" อีกครั้งในหน้าที่เปิดขึ้นมา' },
      ],
    }
  }
  if (platform === 'ios') {
    return {
      title: 'เพิ่ม Jodwise ลงหน้าจอโฮม',
      intro: 'iPhone/iPad ติดตั้งผ่านปุ่มแชร์ของ Safari ใช้เวลาไม่ถึง 10 วินาที',
      steps: [
        { icon: 'share', text: 'กดปุ่มแชร์ ที่แถบล่างของ Safari (iPad และ Chrome อยู่มุมขวาบน)' },
        { icon: 'plusSquare', text: 'เลื่อนลงแล้วเลือก "เพิ่มไปยังหน้าจอโฮม"' },
        { icon: 'check', text: 'กด "เพิ่ม" มุมขวาบน — ไอคอน Jodwise จะอยู่บนหน้าจอโฮมทันที' },
      ],
    }
  }
  if (platform === 'android') {
    return {
      title: 'ติดตั้งจากเมนูของเบราว์เซอร์',
      intro: 'เบราว์เซอร์ยังไม่เปิดหน้าต่างติดตั้งให้ (อาจเคยกดยกเลิกไปแล้ว) ติดตั้งจากเมนูแทนได้',
      steps: [
        { icon: 'menu', text: 'กดเมนู ⋮ มุมขวาบนของ Chrome' },
        { icon: 'download', text: 'เลือก "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"' },
        { icon: 'check', text: 'กด "ติดตั้ง" — ไอคอน Jodwise จะอยู่ในหน้าแอปของเครื่อง' },
      ],
    }
  }
  return {
    title: 'ติดตั้งจากเบราว์เซอร์',
    intro: 'ใช้ Chrome หรือ Edge ติดตั้งได้ (Firefox และ Safari บน Mac ยังไม่รองรับ)',
    steps: [
      { icon: 'download', text: 'กดไอคอนติดตั้งท้ายช่อง URL หรือเมนู ⋮ มุมขวาบน' },
      { icon: 'arrowRight', text: 'เลือก "ติดตั้ง Jodwise"' },
      { icon: 'check', text: 'กด "ติดตั้ง" — Jodwise จะเปิดเป็นหน้าต่างแอปของตัวเอง' },
    ],
  }
})

async function onClick() {
  if (busy.value) return
  // อยู่ในแอปแชต: พาไปเบราว์เซอร์จริง ทำไม่ได้ (iPhone ในแอปอื่น) ค่อยบอกวิธีเปิดเอง
  if (inApp) {
    if (!openInRealBrowser()) sheet.value = true
    return
  }
  busy.value = true
  try {
    const outcome = await pwa.install()
    if (outcome === 'accepted') {
      toast.success('ติดตั้ง Jodwise เป็นแอปแล้ว เปิดได้จากไอคอนบนหน้าจอ')
      emit('done')
    } else if (outcome === 'dismissed') {
      toast.push('ยกเลิกการติดตั้งแล้ว — กดปุ่มนี้อีกครั้งเมื่อพร้อม')
    } else {
      sheet.value = true
    }
  } finally {
    busy.value = false
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.origin + window.location.pathname)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <button v-if="!pwa.installed.value" :class="buttonClass" type="button" :disabled="busy" @click="onClick">
    <AppIcon name="download" :size="17" />
    <slot>{{ busy ? 'กำลังเปิดหน้าต่างติดตั้ง…' : 'ติดตั้งเป็นแอปบนเครื่องนี้' }}</slot>
  </button>

  <Teleport to="body">
    <Transition name="fade">
      <div v-if="sheet" class="modal-backdrop install-backdrop no-print" @click.self="sheet = false">
        <div class="modal install-sheet" role="dialog" aria-modal="true" aria-labelledby="install-title">
          <span class="ico-big"><AppIcon name="phone" :size="26" /></span>
          <h3 id="install-title">{{ guide.title }}</h3>
          <p>{{ guide.intro }}</p>
          <ol class="install-steps">
            <li v-for="(step, i) in guide.steps" :key="i">
              <span class="install-step-no">{{ i + 1 }}</span>
              <span class="install-step-ico"><AppIcon :name="step.icon" :size="20" /></span>
              <span>{{ step.text }}</span>
            </li>
          </ol>
          <div class="actions">
            <button v-if="inApp" class="btn btn-ghost" type="button" @click="copyLink">
              {{ copied ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกลิงก์ไปเปิดเอง' }}
            </button>
            <button class="btn btn-primary" type="button" @click="sheet = false">เข้าใจแล้ว</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.install-backdrop {
  z-index: 140;
}
.install-steps {
  display: grid;
  gap: 10px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}
.install-steps li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: 15px;
  line-height: 1.45;
}
.install-step-no {
  flex: none;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 13px;
  font-weight: 700;
}
.install-step-ico {
  flex: none;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--accent-strong);
}
/* มือถือ: แผ่นเลื่อนขึ้นจากล่างจอ กดถึงด้วยนิ้วโป้ง */
@media (max-width: 620px) {
  .install-backdrop {
    align-items: flex-end;
    padding: 0;
  }
  .install-sheet {
    width: 100%;
    border-radius: var(--radius) var(--radius) 0 0;
    padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
  }
  .install-sheet .actions .btn {
    flex: 1 1 auto;
  }
}
</style>
