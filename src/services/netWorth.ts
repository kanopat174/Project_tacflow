/**
 * มูลค่าสุทธิ (Net worth) = ทรัพย์สิน − หนี้สิน — ฟังก์ชันบริสุทธิ์ + เก็บในเครื่อง
 *
 * ผู้ใช้กรอกทรัพย์สินและหนี้สินเอง ระบบเติมรายการที่รู้อยู่แล้วให้อัตโนมัติ (แก้ไม่ได้ ไปแก้ที่หน้าต้นทาง):
 *  - กองทุนลดหย่อน (หน้ากองทุนของฉัน) → ทรัพย์สิน
 *  - เงินที่คนอื่นยืมเรา / เรายืมคนอื่น (ระบบเงินยืม) → ทรัพย์สิน / หนี้สิน
 *  - หนี้ในแผนปลดหนี้ → หนี้สิน
 * จดภาพรวมไว้เดือนละหนึ่งจุด (เดือนเดิมเขียนทับ) ใช้ดูแนวโน้ม
 */

import { roundMoney } from './taxEngine'

export type AssetKind = 'cash' | 'bank' | 'investment' | 'property' | 'vehicle' | 'other'
export type LiabilityKind = 'credit' | 'personal' | 'mortgage' | 'car' | 'other'

export const ASSET_KINDS: Record<AssetKind, string> = {
  cash: 'เงินสด',
  bank: 'เงินฝากธนาคาร',
  investment: 'การลงทุน (หุ้น กองทุน ทอง คริปโต)',
  property: 'บ้าน ที่ดิน คอนโด',
  vehicle: 'รถ',
  other: 'อื่น ๆ',
}

export const LIABILITY_KINDS: Record<LiabilityKind, string> = {
  credit: 'บัตรเครดิต / บัตรกดเงินสด',
  personal: 'สินเชื่อส่วนบุคคล',
  mortgage: 'สินเชื่อบ้าน',
  car: 'สินเชื่อรถ',
  other: 'อื่น ๆ',
}

export interface WorthItem {
  id: string
  name: string
  kind: string
  amount: number
}

/** รายการที่ระบบเติมให้จากหน้าอื่น */
export interface AutoItem {
  name: string
  amount: number
  /** หน้าที่ไปแก้ได้ */
  to: string
}

export interface Snapshot {
  /** YYYY-MM */
  month: string
  assets: number
  liabilities: number
}

export interface WorthBook {
  assets: WorthItem[]
  liabilities: WorthItem[]
  snapshots: Snapshot[]
}

export interface WorthTotals {
  assets: number
  liabilities: number
  net: number
}

const sum = (items: { amount: number }[]) => items.reduce((s, i) => s + (Number(i.amount) || 0), 0)

export function worthTotals(book: WorthBook, autoAssets: AutoItem[], autoLiabilities: AutoItem[]): WorthTotals {
  const assets = roundMoney(sum(book.assets) + sum(autoAssets))
  const liabilities = roundMoney(sum(book.liabilities) + sum(autoLiabilities))
  return { assets, liabilities, net: roundMoney(assets - liabilities) }
}

/** จดภาพรวมเดือนนี้ — เดือนเดิมเขียนทับ เรียงตามเดือน เก็บย้อนหลังไม่เกิน 10 ปี */
export function withSnapshot(book: WorthBook, month: string, totals: WorthTotals): WorthBook {
  const snapshots = [...book.snapshots.filter((s) => s.month !== month), { month, assets: totals.assets, liabilities: totals.liabilities }]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-120)
  return { ...book, snapshots }
}

/** เทียบกับเดือนก่อนหน้าที่มีข้อมูล */
export function changeSincePrevious(book: WorthBook, month: string, net: number): number | null {
  const previous = [...book.snapshots].filter((s) => s.month < month).pop()
  return previous ? roundMoney(net - (previous.assets - previous.liabilities)) : null
}

/* ---------- เก็บในเครื่อง แยกต่อผู้ใช้ ---------- */

const key = (userId: string) => `taxflow_networth_${userId}`

function items(raw: unknown): WorthItem[] {
  return Array.isArray(raw)
    ? raw.filter(
        (i): i is WorthItem =>
          !!i && typeof i.id === 'string' && typeof i.name === 'string' && typeof i.kind === 'string' && Number.isFinite(i.amount),
      )
    : []
}

export function loadWorth(userId: string): WorthBook {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? 'null') as Partial<WorthBook> | null
    const snapshots = Array.isArray(raw?.snapshots)
      ? raw.snapshots.filter(
          (s): s is Snapshot => !!s && /^\d{4}-\d{2}$/.test(s.month) && Number.isFinite(s.assets) && Number.isFinite(s.liabilities),
        )
      : []
    return { assets: items(raw?.assets), liabilities: items(raw?.liabilities), snapshots }
  } catch {
    return { assets: [], liabilities: [], snapshots: [] }
  }
}

export function saveWorth(userId: string, book: WorthBook): boolean {
  try {
    localStorage.setItem(key(userId), JSON.stringify(book))
    return true
  } catch {
    return false
  }
}
