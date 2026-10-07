import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { introStorageKey, parseIntroProgress, shouldShowIntro, type IntroProgress } from '@/data/featureIntros'
import { useAuthStore } from './auth'

/**
 * จำว่าผู้ใช้ดูคำแนะนำฟีเจอร์ไหนไปแล้ว — แยกตามบัญชี (ผู้เยี่ยมชมใช้ชุด guest)
 * เก็บใน localStorage ถ้าอ่านเขียนไม่ได้ (โหมดส่วนตัว) ก็แค่จะเห็นคำแนะนำซ้ำ ไม่มีอะไรพัง
 */
export const useIntroStore = defineStore('intro', () => {
  const auth = useAuthStore()
  const progress = ref<IntroProgress>({ seen: [], off: false })
  /** เพิ่มค่าทุกครั้งที่ผู้ใช้ขอดูคำแนะนำของหน้านี้อีกครั้ง */
  const replayTick = ref(0)

  function key() {
    return introStorageKey(auth.user?.id)
  }

  function load() {
    try {
      progress.value = parseIntroProgress(localStorage.getItem(key()))
    } catch {
      progress.value = { seen: [], off: false }
    }
  }

  function save() {
    try {
      localStorage.setItem(key(), JSON.stringify(progress.value))
    } catch {
      /* เขียนไม่ได้ก็ไม่เป็นไร */
    }
  }

  watch(() => auth.user?.id, load, { immediate: true })

  function shouldShow(introKey: string) {
    return shouldShowIntro(progress.value, introKey)
  }

  function markSeen(introKey: string) {
    if (progress.value.seen.includes(introKey)) return
    progress.value = { ...progress.value, seen: [...progress.value.seen, introKey] }
    save()
  }

  function setOff(off: boolean) {
    progress.value = { ...progress.value, off }
    save()
  }

  /** เริ่มแนะนำใหม่ทุกหน้า และเปิดคำแนะนำกลับมาถ้าเคยปิดไว้ */
  function resetAll() {
    progress.value = { seen: [], off: false }
    save()
  }

  function replay() {
    replayTick.value += 1
  }

  return { progress, replayTick, shouldShow, markSeen, setOff, resetAll, replay }
})
