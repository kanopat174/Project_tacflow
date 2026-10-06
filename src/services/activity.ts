/**
 * นับงานที่กำลังทำอยู่ (เปลี่ยนหน้า เรียก API) เพื่อแสดงแถบโหลดด้านบนของเว็บ
 *
 * แยกเป็นโมดูลเล็ก ๆ ที่ทั้ง router และชั้น API เรียกได้โดยไม่ต้องพึ่ง Pinia
 * เพราะ api.ts ถูกเรียกก่อน Pinia พร้อมได้ (เช่นตอนกู้ session ใน route guard)
 */
import { computed, ref } from 'vue'

const pending = ref(0)

export const isBusy = computed(() => pending.value > 0)

export function beginActivity(): void {
  pending.value += 1
}

export function endActivity(): void {
  pending.value = Math.max(0, pending.value - 1)
}
