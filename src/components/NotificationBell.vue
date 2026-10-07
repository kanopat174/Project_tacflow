<script setup lang="ts">
/** กระดิ่งแจ้งเตือนบนหัวเว็บ รวมกำหนดภาษี งบที่เกิน เป้าหมายที่สำเร็จ และเหรียญใหม่ไว้ที่เดียว */
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { useGameStore, type AppNotification } from '@/stores/game'

const game = useGameStore()
const router = useRouter()

/** แจ้งเตือนใหม่เพิ่มขึ้น กระดิ่งสั่นให้รู้ (ไม่สั่นตอนโหลดครั้งแรก) */
const ringing = ref(false)
let ringTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => game.unreadCount,
  (now, before) => {
    if (before === undefined || now <= before) return
    ringing.value = false
    clearTimeout(ringTimer)
    requestAnimationFrame(() => {
      ringing.value = true
      ringTimer = setTimeout(() => (ringing.value = false), 1900)
    })
  },
)
const open = ref(false)
const root = ref<HTMLElement | null>(null)

function toggle() {
  open.value = !open.value
  if (open.value) void game.refresh()
}

function go(item: AppNotification) {
  open.value = false
  router.push(item.to)
}

function onDocumentClick(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onKeydown)
    // ปิดกล่องแล้วถือว่าเห็นทุกรายการแล้ว ตัวเลขบนกระดิ่งจะได้หายไป
    if (game.notifications.length) game.markAllSeen()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="notify">
    <button
      class="bell-toggle"
      :class="{ 'bell-ring': ringing }"
      type="button"
      :aria-expanded="open"
      :aria-label="game.unreadCount ? `การแจ้งเตือน ${game.unreadCount} รายการใหม่` : 'การแจ้งเตือน'"
      title="การแจ้งเตือน"
      @click="toggle"
    >
      <AppIcon name="bell" :size="18" />
      <span v-if="game.unreadCount" class="bell-badge">{{ game.unreadCount > 9 ? '9+' : game.unreadCount }}</span>
    </button>

    <div v-if="open" class="notify-menu" role="dialog" aria-label="การแจ้งเตือน">
      <div class="notify-head">
        <strong>การแจ้งเตือน</strong>
        <RouterLink to="/achievements" class="small" @click="open = false">เหรียญรางวัล</RouterLink>
      </div>
      <p v-if="!game.notifications.length" class="notify-empty">ไม่มีเรื่องที่ต้องดูตอนนี้ เยี่ยมมาก!</p>
      <ul v-else class="notify-list">
        <li v-for="item in game.notifications" :key="item.id">
          <button type="button" :class="[item.level, { unread: !game.isSeen(item.id) }]" @click="go(item)">
            <span class="notify-icon" aria-hidden="true">{{ item.icon }}</span>
            <span class="notify-text">
              <b>{{ item.title }}</b>
              <small>{{ item.text }}</small>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
