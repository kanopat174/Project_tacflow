/**
 * จดจำรายการที่ผู้ใช้เคยบันทึก แล้วเติมให้ครั้งหน้า — ไม่ต้องกรอกซ้ำ
 *
 * กุญแจคือ "ต้นทาง" ของรายการที่ปรับรูปแล้ว: ชื่อคู่โอนบนสลิป ชื่อร้านบนใบเสร็จ
 * ข้อความใน statement หรือรายละเอียดที่พิมพ์เอง
 *  - คู่โอนเดิม ยอดเดิม → เติมหมวดและรายละเอียดเหมือนครั้งล่าสุด
 *  - คู่โอนเดิม ยอดต่าง → เติมหมวดและรายละเอียดที่ใช้บ่อยที่สุดกับคู่โอนนี้
 * ผู้ใช้แก้หมวดเมื่อไร ครั้งหน้าระบบใช้หมวดที่แก้ (จำค่าสุดท้ายที่บันทึกเสมอ)
 *
 * หมวดขึ้นกับโหมดของสมุด จึงจำแยกตามโหมด ฟังก์ชันจับคู่เป็นฟังก์ชันบริสุทธิ์ เทสต์ได้
 */

import type { EntryType, WorkspaceMode } from '@/data/workspaceModes'
import { roundMoney } from './taxEngine'

export interface MemoryItem {
  key: string
  type: EntryType
  mode: WorkspaceMode
  amount: number
  categoryKey: string
  note: string
  uses: number
  /** YYYY-MM-DD */
  lastUsed: string
}

export interface MemoryInput {
  source: string
  type: EntryType
  mode: WorkspaceMode
  amount: number
  categoryKey: string
  note: string
}

export interface Recall {
  categoryKey: string
  note: string
  /** เคยบันทึกยอดนี้กับต้นทางนี้มาก่อน */
  sameAmount: boolean
  uses: number
}

/** จำได้สูงสุดกี่รายการ เกินแล้วลบที่ไม่ได้ใช้นานที่สุด */
export const MEMORY_LIMIT = 400

/** คำนำหน้าภาษาไทยมักติดกับชื่อบนสลิป (นางสมศรี) จึงตัดเป็นคำนำหน้า ส่วนภาษาอังกฤษตัดเฉพาะทั้งคำ */
const THAI_TITLES = /^(?:นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง|คุณ)/
const ENGLISH_TITLES = /^(?:mrs|mr|ms|miss)$/i

/**
 * ปรับข้อความต้นทางให้เทียบกันได้ — ตัดคำนำหน้าชื่อ เลขบัญชีที่ปิดบางหลัก (xxx-x-x1234-x)
 * เครื่องหมาย และช่องว่างซ้ำ ข้อความสั้นเกินไปถือว่าไม่มีกุญแจ
 */
export function memoryKey(source: string): string {
  let text = source.normalize('NFC').toLowerCase().trim()
  text = text.replace(/[x*•\d]{2,}[-x*•\d]*/gi, ' ')
  text = text.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  // คำนำหน้าอาจอยู่หลังคำว่า "โอนให้/จาก" จึงตัดทุกคำ ไม่ใช่เฉพาะต้นข้อความ
  text = text
    .split(' ')
    .map((word) => (ENGLISH_TITLES.test(word) ? '' : word.replace(THAI_TITLES, '')))
    .filter(Boolean)
    .join(' ')
  return text.length >= 2 ? text : ''
}

const sameGroup = (item: MemoryItem, key: string, type: EntryType, mode: WorkspaceMode) =>
  item.key === key && item.type === type && item.mode === mode

/** หาข้อมูลที่เคยบันทึกกับต้นทางนี้ — null คือไม่เคย */
export function recallEntry(
  items: MemoryItem[],
  query: { source: string; type: EntryType; mode: WorkspaceMode; amount?: number },
): Recall | null {
  const key = memoryKey(query.source)
  if (!key) return null
  const group = items.filter((item) => sameGroup(item, key, query.type, query.mode))
  if (!group.length) return null

  const amount = query.amount ? roundMoney(query.amount) : 0
  const exact = amount ? group.filter((item) => item.amount === amount) : []
  const pool = exact.length ? exact : group
  // ยอดตรง: ใช้ครั้งล่าสุด (ผู้ใช้อาจเพิ่งแก้หมวด) · ยอดไม่ตรง: ใช้ที่บ่อยที่สุด เสมอกันใช้ล่าสุด
  const best = [...pool].sort((a, b) =>
    exact.length
      ? b.lastUsed.localeCompare(a.lastUsed) || b.uses - a.uses
      : b.uses - a.uses || b.lastUsed.localeCompare(a.lastUsed),
  )[0]!
  return { categoryKey: best.categoryKey, note: best.note, sameAmount: exact.length > 0, uses: best.uses }
}

/** บันทึกรายการลงความจำ — คืนรายการใหม่ ไม่แก้ของเดิม */
export function rememberEntry(items: MemoryItem[], input: MemoryInput, today: string): MemoryItem[] {
  const key = memoryKey(input.source)
  if (!key || !input.categoryKey || !(input.amount > 0)) return items
  const amount = roundMoney(input.amount)
  const note = input.note.trim().slice(0, 200)

  const index = items.findIndex((item) => sameGroup(item, key, input.type, input.mode) && item.amount === amount)
  const next = [...items]
  if (index >= 0) {
    const old = next[index]!
    next[index] = { ...old, categoryKey: input.categoryKey, note, uses: old.uses + 1, lastUsed: today }
  } else {
    next.push({ key, type: input.type, mode: input.mode, amount, categoryKey: input.categoryKey, note, uses: 1, lastUsed: today })
  }
  // ผู้ใช้เปลี่ยนหมวดของต้นทางนี้ ยอดอื่นของต้นทางเดียวกันก็ควรใช้หมวดใหม่ด้วย
  for (let i = 0; i < next.length; i++) {
    const item = next[i]!
    if (sameGroup(item, key, input.type, input.mode) && item.categoryKey !== input.categoryKey) {
      next[i] = { ...item, categoryKey: input.categoryKey }
    }
  }
  if (next.length <= MEMORY_LIMIT) return next
  return [...next].sort((a, b) => b.lastUsed.localeCompare(a.lastUsed)).slice(0, MEMORY_LIMIT)
}

/* ---------- ที่เก็บ (localStorage แยกต่อบัญชี) ---------- */

export const memoryStorageKey = (userId: string) => `taxflow_entry_memory_${userId}`

export function loadMemory(userId: string): MemoryItem[] {
  try {
    const raw = localStorage.getItem(memoryStorageKey(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as MemoryItem[]) : []
  } catch {
    return []
  }
}

export function saveMemory(userId: string, items: MemoryItem[]): void {
  try {
    localStorage.setItem(memoryStorageKey(userId), JSON.stringify(items))
  } catch {
    /* พื้นที่เต็ม — ไม่จำก็ไม่เสียข้อมูลรายการ */
  }
}

/** จำหลายรายการพร้อมกัน แล้วเขียนลงที่เก็บครั้งเดียว */
export function rememberMany(userId: string, inputs: MemoryInput[], today: string): void {
  if (!inputs.length) return
  let items = loadMemory(userId)
  for (const input of inputs) items = rememberEntry(items, input, today)
  saveMemory(userId, items)
}
