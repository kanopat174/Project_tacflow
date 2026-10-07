/**
 * ลูกเล่นตามเหตุการณ์ — หน้าไหนบันทึก ลบ หรือนำเข้ารายการ เรียกที่นี่ที่เดียว
 * ได้ทั้งเอฟเฟกต์บนจอ (เหรียญ ตัวเลขลอย ควัน) และตัวการ์ตูนมุมขวาล่างตอบสนอง
 */
import { burst, centerOf, floatText, lastPointer } from '@/services/fx'
import { formatBaht } from '@/services/taxEngine'
import { useMascotFxStore } from '@/stores/mascotFx'

export function useFx() {
  const mascot = useMascotFxStore()

  return {
    /** บันทึกรายการเสร็จ: เหรียญเด้ง + ยอดลอยขึ้น */
    entrySaved(type: 'income' | 'expense', amount: number) {
      const at = lastPointer()
      const income = type === 'income'
      burst(at, { items: income ? ['🪙', '💰', '✨'] : ['🪙', '🧾', '✨'], count: income ? 14 : 10 })
      floatText(at, `${income ? '+' : '−'}${formatBaht(amount)}`, income ? 'ok' : 'bad')
      mascot.react(income ? 'save-income' : 'save-expense')
    },
    /** นำเข้าหลายรายการพร้อมกัน */
    entriesImported(count: number) {
      const at = lastPointer()
      burst(at, { items: ['🪙', '📥', '✨', '💰'], count: Math.min(24, 8 + count), spread: 130 })
      floatText(at, `+${count} รายการ`, 'accent')
      mascot.react('save-many')
    },
    deleted() {
      burst(lastPointer(), { items: ['💨'], count: 5, spread: 40, upward: false, size: 22 })
      mascot.react('delete')
    },
    undone() {
      burst(lastPointer(), { items: ['✨', '↩️'], count: 6, spread: 50 })
      mascot.react('undo')
    },
    sparkle(point = lastPointer()) {
      burst(point, { items: ['✨', '⭐', '💫'], count: 10, spread: 80, upward: false, size: 18 })
    },
    /** สลับธีมมืด/สว่าง: ดาวหรือพระอาทิตย์เด้งออกจากปุ่ม */
    themeSwitched(dark: boolean, from: Element | null) {
      burst(centerOf(from), { items: dark ? ['🌙', '⭐', '✨'] : ['☀️', '🌤️', '✨'], count: 8, spread: 60, upward: false, size: 16 })
      mascot.react('theme')
    },
    /**
     * ของลับ: กดโลโก้ 5 ครั้งติดกันภายใน 2 วินาที → ปาร์ตี้ทั้งจอ
     * กดแต่ละครั้งโลโก้เด้งเบา ๆ ให้รู้ว่ามีอะไรอยู่
     */
    logoTap(mark: HTMLElement | null) {
      const now = Date.now()
      logoTaps = logoTaps.filter((t) => now - t < 2000)
      logoTaps.push(now)
      if (mark) {
        mark.classList.remove('pop')
        void mark.offsetWidth
        mark.classList.add('pop')
      }
      if (logoTaps.length < 5) return
      logoTaps = []
      const w = window.innerWidth
      const h = window.innerHeight
      for (const x of [0.2, 0.5, 0.8]) {
        burst({ x: w * x, y: h * 0.45 }, { items: ['🎉', '🎊', '✨', '🪙', '💖'], count: 16, spread: 180, upward: false, size: 22 })
      }
      mascot.react('party')
    },
  }
}

let logoTaps: number[] = []
