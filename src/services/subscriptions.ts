/**
 * ตรวจค่าบริการรายเดือน/รายปี (subscription) จากรายการที่จด — ฟังก์ชันบริสุทธิ์ + เก็บสถานะในเครื่อง
 *
 * นับเป็น subscription เมื่อ
 *  - จ่ายให้ต้นทางเดียวกัน (ผู้รับบนสลิป หรือรายละเอียด) อย่างน้อย 2 ครั้ง ห่างกันราวหนึ่งเดือน (25–35 วัน)
 *    หรือราวหนึ่งปี (350–380 วัน) และยอดใกล้เคียงกัน (ต่างไม่เกิน 20% — ค่าบริการขึ้นราคาได้)
 *  - หรือเป็นชื่อบริการที่รู้จัก (Netflix Spotify YouTube ...) แม้จ่ายครั้งเดียว ถือเป็นรายเดือน
 * แจ้งรอบตัดเงินครั้งหน้า ราคาที่เปลี่ยน และรวมค่าใช้จ่ายต่อปี
 * ผู้ใช้บอกได้ว่า "ยังใช้" "ไม่ค่อยได้ใช้" (เสนอให้ยกเลิก) หรือ "ยกเลิกแล้ว" (ไม่นับและไม่เตือน)
 */

import { memoryKey } from './entryMemory'
import { roundMoney } from './taxEngine'

export interface SubEntry {
  date: string
  type: 'income' | 'expense'
  amount: number
  note: string
  slip?: { recipient?: string | null } | null
}

export type Cycle = 'monthly' | 'yearly'
export type SubStatus = 'keep' | 'unused' | 'cancelled'

export interface Subscription {
  key: string
  name: string
  amount: number
  cycle: Cycle
  lastDate: string
  /** รอบตัดเงินครั้งหน้าโดยประมาณ */
  nextDate: string
  /** วันจนถึงรอบหน้า (ติดลบ = เลยรอบแล้วยังไม่เห็นรายการ) */
  daysUntil: number
  yearlyCost: number
  count: number
  /** ราคาล่าสุดต่างจากครั้งก่อน */
  priceChange: { from: number; to: number } | null
  /** เป็นบริการที่รู้จักชื่อ */
  known: boolean
  /** ไม่พบการจ่ายเกินหนึ่งรอบครึ่ง — อาจเลิกจ่ายไปแล้ว */
  stale: boolean
}

/** บริการที่คนไทยจ่ายรายเดือนบ่อย */
const KNOWN =
  /netflix|spotify|youtube|yt\s*premium|apple\.com|icloud|apple\s*(?:music|one|tv)|google\s*(?:one|play|storage)|disney|hotstar|prime\s*video|amazon\s*prime|viu|wetv|iqiyi|hbo|max\b|trueid|true\s*id|monomax|bilibili|joox|line\s*(?:music|man\s*plus)|tinder|bumble|chatgpt|openai|claude|anthropic|midjourney|canva|adobe|microsoft\s*365|office\s*365|notion|dropbox|github|figma|duolingo|fitness|ฟิตเนส|ยิม|gym|grab\s*unlimited|ค่าสมาชิก|สมาชิกรายเดือน/i

const DAY = 86_400_000
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)

function addInterval(date: string, cycle: Cycle): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const next = cycle === 'monthly' ? new Date(Date.UTC(y, m, d)) : new Date(Date.UTC(y + 1, m - 1, d))
  return next.toISOString().slice(0, 10)
}

const sourceOf = (e: SubEntry) => (e.slip?.recipient || e.note || '').trim()

function cycleOf(gaps: number[]): Cycle | null {
  if (!gaps.length) return null
  const monthly = gaps.filter((g) => g >= 25 && g <= 35).length
  const yearly = gaps.filter((g) => g >= 350 && g <= 380).length
  if (monthly >= Math.ceil(gaps.length / 2) && monthly > 0) return 'monthly'
  if (yearly >= Math.ceil(gaps.length / 2) && yearly > 0) return 'yearly'
  return null
}

export function detectSubscriptions(entries: SubEntry[], today: string): Subscription[] {
  const groups = new Map<string, SubEntry[]>()
  for (const e of entries) {
    if (e.type !== 'expense' || !(e.amount > 0)) continue
    const k = memoryKey(sourceOf(e))
    if (!k) continue
    groups.set(k, [...(groups.get(k) ?? []), e])
  }

  const out: Subscription[] = []
  for (const [k, list] of groups) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
    const latest = sorted[sorted.length - 1]!
    // ใช้เฉพาะรายการที่ยอดใกล้ครั้งล่าสุด ตัดการซื้อของครั้งคราวที่ร้านเดียวกันออก
    const similar = sorted.filter((e) => Math.abs(e.amount - latest.amount) <= latest.amount * 0.2)
    const gaps = similar.slice(1).map((e, i) => days(similar[i]!.date, e.date))
    const known = KNOWN.test(sourceOf(latest))
    const cycle = cycleOf(gaps) ?? (known ? 'monthly' : null)
    if (!cycle) continue
    // ซื้อบ่อยกว่ารายเดือนมาก (เช่นร้านกาแฟทุกวัน) ไม่ใช่ subscription
    if (gaps.filter((g) => g < 20).length > gaps.length / 2) continue

    const nextDate = addInterval(latest.date, cycle)
    const daysUntil = days(today, nextDate)
    const previous = similar[similar.length - 2]
    out.push({
      key: k,
      name: sourceOf(latest),
      amount: latest.amount,
      cycle,
      lastDate: latest.date,
      nextDate,
      daysUntil,
      yearlyCost: roundMoney(cycle === 'monthly' ? latest.amount * 12 : latest.amount),
      count: similar.length,
      priceChange: previous && Math.abs(previous.amount - latest.amount) >= 0.01 ? { from: previous.amount, to: latest.amount } : null,
      known,
      stale: daysUntil < -(cycle === 'monthly' ? 15 : 60),
    })
  }
  return out.sort((a, b) => b.yearlyCost - a.yearlyCost)
}

export interface SubSummary {
  /** ค่าบริการต่อเดือนที่ยังจ่ายอยู่ (รายปีหาร 12) */
  monthly: number
  yearly: number
  /** ถ้ายกเลิกที่ "ไม่ค่อยได้ใช้" จะประหยัดต่อปี */
  unusedYearly: number
  /** ยกเลิกไปแล้วประหยัดต่อปี */
  cancelledYearly: number
}

export function summarize(subs: Subscription[], statuses: Record<string, SubStatus>): SubSummary {
  const active = subs.filter((s) => statuses[s.key] !== 'cancelled' && !s.stale)
  const yearly = active.reduce((sum, s) => sum + s.yearlyCost, 0)
  return {
    monthly: roundMoney(yearly / 12),
    yearly: roundMoney(yearly),
    unusedYearly: roundMoney(active.filter((s) => statuses[s.key] === 'unused').reduce((sum, s) => sum + s.yearlyCost, 0)),
    cancelledYearly: roundMoney(subs.filter((s) => statuses[s.key] === 'cancelled').reduce((sum, s) => sum + s.yearlyCost, 0)),
  }
}

/** รอบตัดเงินที่ใกล้ถึง (ภายใน withinDays วัน) และยังไม่ยกเลิก */
export function upcomingCharges(subs: Subscription[], statuses: Record<string, SubStatus>, withinDays = 3): Subscription[] {
  return subs.filter((s) => statuses[s.key] !== 'cancelled' && !s.stale && s.daysUntil >= 0 && s.daysUntil <= withinDays)
}

/* ---------- สถานะที่ผู้ใช้ตั้ง แยกต่อผู้ใช้ ---------- */

const key = (userId: string) => `taxflow_subscriptions_${userId}`

export function loadSubStatuses(userId: string): Record<string, SubStatus> {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(raw).filter((e): e is [string, SubStatus] => e[1] === 'keep' || e[1] === 'unused' || e[1] === 'cancelled'),
    )
  } catch {
    return {}
  }
}

export function saveSubStatuses(userId: string, statuses: Record<string, SubStatus>): boolean {
  try {
    localStorage.setItem(key(userId), JSON.stringify(statuses))
    return true
  } catch {
    return false
  }
}
