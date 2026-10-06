<script setup lang="ts">
/**
 * แถบโหลดบาง ๆ ชิดขอบบนของเว็บ ขึ้นระหว่างเปลี่ยนหน้าหรือรอข้อมูลจาก API
 *
 * วิ่งช้าลงเรื่อย ๆ ไปค้างแถว 90% จนกว่างานจะเสร็จ แล้ววิ่งเต็มและจางหาย
 * งานที่เสร็จเร็วกว่า SHOW_AFTER_MS จะไม่แสดงเลย หน้าจะได้ไม่กะพริบทุกครั้งที่คลิก
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { isBusy } from '@/services/activity'

const SHOW_AFTER_MS = 120

const width = ref(0)
const visible = ref(false)

let showTimer: ReturnType<typeof setTimeout> | undefined
let trickleTimer: ReturnType<typeof setInterval> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined

function clearTimers() {
  clearTimeout(showTimer)
  clearInterval(trickleTimer)
  clearTimeout(hideTimer)
}

function start() {
  clearTimers()
  showTimer = setTimeout(() => {
    visible.value = true
    width.value = 12
    // ยิ่งใกล้ 90% ยิ่งขยับช้า ให้ความรู้สึกว่ากำลังคืบหน้าแม้ไม่รู้เวลาที่เหลือจริง
    trickleTimer = setInterval(() => {
      width.value += (90 - width.value) * 0.12
    }, 180)
  }, SHOW_AFTER_MS)
}

function finish() {
  clearTimers()
  if (!visible.value) return
  width.value = 100
  hideTimer = setTimeout(() => {
    visible.value = false
    width.value = 0
  }, 320)
}

watch(isBusy, (busy) => (busy ? start() : finish()), { immediate: true })

onBeforeUnmount(clearTimers)
</script>

<template>
  <div
    class="top-progress"
    :class="{ visible }"
    role="progressbar"
    aria-label="กำลังโหลด"
    :aria-hidden="!visible"
    :aria-valuenow="Math.round(width)"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <span :style="{ transform: `scaleX(${width / 100})` }"></span>
  </div>
</template>
