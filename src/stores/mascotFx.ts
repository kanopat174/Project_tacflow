import { ref } from 'vue'
import { defineStore } from 'pinia'
import { REACTIONS, pick, type MascotReaction } from '@/data/mascotLines'

export interface ReactionEvent {
  id: number
  kind: MascotReaction
  line: string
  move: (typeof REACTIONS)[MascotReaction]['move']
}

/**
 * ช่องทางให้ทุกส่วนของเว็บบอกตัวการ์ตูนว่าเกิดอะไรขึ้น — ตัวการ์ตูนมุมขวาล่างฟังแล้วขยับและพูด
 * ใครเรียกก็ได้ เช่น บันทึกรายการเสร็จ ลบรายการ ตอบควิซถูก
 */
export const useMascotFxStore = defineStore('mascotFx', () => {
  const last = ref<ReactionEvent | null>(null)
  let seq = 0

  function react(kind: MascotReaction, line?: string) {
    const def = REACTIONS[kind]
    last.value = { id: ++seq, kind, line: line ?? pick(def.lines), move: def.move }
  }

  return { last, react }
})
