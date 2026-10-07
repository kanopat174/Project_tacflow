/**
 * ตัวเลขนับขึ้นจาก 0 ถึงค่าจริงตอนเปิดหน้า และไหลไปค่าใหม่เมื่อค่าเปลี่ยน
 * ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหว หรือสภาพแวดล้อมที่ไม่มี requestAnimationFrame (เทสต์) เห็นค่าจริงทันที
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { motionAllowed } from '@/services/fx'

export function useCountUp(source: Ref<number> | (() => number), duration = 900): Ref<number> {
  const read = typeof source === 'function' ? source : () => source.value
  const shown = ref(0)
  let frame = 0

  function animate(to: number) {
    cancelAnimationFrame(frame)
    if (!motionAllowed() || typeof requestAnimationFrame === 'undefined') {
      shown.value = to
      return
    }
    const from = shown.value
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // ease-out: เร็วตอนต้น ช้าลงตอนใกล้ถึง
      const eased = 1 - Math.pow(1 - t, 3)
      // ระหว่างนับปัดเป็นบาทเต็ม ไม่ให้เห็นเศษสตางค์วิ่ง ค่าสุดท้ายเป็นค่าจริงเสมอ
      shown.value = Math.round(from + (to - from) * eased)
      if (t < 1) frame = requestAnimationFrame(step)
      else shown.value = to
    }
    frame = requestAnimationFrame(step)
  }

  watch(read, animate, { immediate: true })
  onBeforeUnmount(() => cancelAnimationFrame(frame))
  return shown
}
