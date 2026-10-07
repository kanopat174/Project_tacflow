/**
 * ลูกเล่นเล็ก ๆ ทั้งเว็บ — เหรียญกระจาย ตัวเลขลอยขึ้น ระลอกคลื่นตอนกดปุ่ม
 *
 * วาดเป็น element ชั่วคราวบน body แล้วลบทิ้งเมื่อแอนิเมชันจบ ไม่ต้องมี canvas หรือไลบรารี
 * ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหว (prefers-reduced-motion) จะไม่เห็นลูกเล่นเหล่านี้เลย
 * ในสภาพแวดล้อมที่ไม่มีหน้าจอจริง (เทสต์) ทุกฟังก์ชันไม่ทำอะไร
 */

export function motionAllowed(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  return !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
}

/* ---------- ตำแหน่งที่ผู้ใช้กดล่าสุด ใช้เป็นจุดตั้งต้นของลูกเล่น ---------- */

let lastPoint = { x: 0, y: 0, at: 0 }

/** จุดที่ผู้ใช้เพิ่งกด — ถ้าไม่ได้กดมานาน (เช่นกด Enter) ใช้กลางจอค่อนล่าง */
export function lastPointer(): { x: number; y: number } {
  if (Date.now() - lastPoint.at < 4000) return lastPoint
  return { x: window.innerWidth / 2, y: window.innerHeight * 0.6 }
}

/** จุดกึ่งกลางของ element */
export function centerOf(el: Element | null | undefined): { x: number; y: number } {
  if (!el) return lastPointer()
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function layer(): HTMLElement {
  let el = document.getElementById('fx-layer')
  if (!el) {
    el = document.createElement('div')
    el.id = 'fx-layer'
    el.setAttribute('aria-hidden', 'true')
    document.body.appendChild(el)
  }
  return el
}

/* ---------- อนุภาคกระจาย ---------- */

export interface BurstOptions {
  /** อีโมจิหรือข้อความสั้นที่จะกระจาย สุ่มเลือกจากรายการ */
  items?: string[]
  count?: number
  /** ระยะกระจาย (px) */
  spread?: number
  /** พุ่งขึ้นเป็นหลัก (เหรียญเด้ง) หรือกระจายรอบทิศ */
  upward?: boolean
  size?: number
}

export function burst(point: { x: number; y: number }, opts: BurstOptions = {}): void {
  if (!motionAllowed()) return
  const { items = ['🪙'], count = 10, spread = 90, upward = true, size = 20 } = opts
  const root = layer()
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span')
    p.className = 'fx-particle'
    p.textContent = items[i % items.length]!
    const angle = upward ? -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9 : Math.random() * Math.PI * 2
    const dist = spread * (0.55 + Math.random() * 0.6)
    p.style.left = `${point.x}px`
    p.style.top = `${point.y}px`
    p.style.fontSize = `${size * (0.75 + Math.random() * 0.5)}px`
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`)
    p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`)
    p.style.setProperty('--rot', `${(Math.random() - 0.5) * 540}deg`)
    p.style.animationDelay = `${Math.random() * 60}ms`
    root.appendChild(p)
    p.addEventListener('animationend', () => p.remove(), { once: true })
  }
}

/** ข้อความลอยขึ้นแล้วจางหาย เช่น "+฿65" */
export function floatText(point: { x: number; y: number }, text: string, tone: 'ok' | 'bad' | 'accent' = 'accent'): void {
  if (!motionAllowed()) return
  const el = document.createElement('span')
  el.className = `fx-float ${tone}`
  el.textContent = text
  el.style.left = `${point.x}px`
  el.style.top = `${point.y}px`
  layer().appendChild(el)
  el.addEventListener('animationend', () => el.remove(), { once: true })
}

/* ---------- ระลอกคลื่นตอนกดปุ่ม ---------- */

const RIPPLE_TARGETS = '.btn, .chip, .tab-btn, .tab-add, .side-link, .side-add, .category-card, .mode-card'

function onPointerDown(event: PointerEvent) {
  lastPoint = { x: event.clientX, y: event.clientY, at: Date.now() }
  if (!motionAllowed()) return
  const target = (event.target as Element | null)?.closest?.(RIPPLE_TARGETS) as HTMLElement | null
  if (!target || (target as HTMLButtonElement).disabled) return
  const r = target.getBoundingClientRect()
  const size = Math.max(r.width, r.height) * 2
  const ripple = document.createElement('span')
  ripple.className = 'fx-ripple'
  ripple.style.width = ripple.style.height = `${size}px`
  ripple.style.left = `${event.clientX - r.left - size / 2}px`
  ripple.style.top = `${event.clientY - r.top - size / 2}px`
  // ระลอกต้องอยู่ในกรอบของปุ่ม
  if (getComputedStyle(target).position === 'static') target.style.position = 'relative'
  target.classList.add('fx-ripple-host')
  target.appendChild(ripple)
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true })
}

let installed = false
/** ติดตั้งครั้งเดียวตอนเปิดเว็บ */
export function installFx(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true })
}
