/**
 * ติดตามเงินยืม — ใครติดเงินเรา และเราติดเงินใคร — ฟังก์ชันบริสุทธิ์
 *
 * รวมรายการที่ติดป้ายเงินยืม (LoanTag) ตามชื่อคู่ยืม ชื่อเขียนต่างกันเล็กน้อย
 * ("นาง สมศรี" กับ "สมศรี ใจดี xxx-1234") นับเป็นคนเดียวกันด้วยกุญแจเดียวกับระบบความจำรายการ
 *
 * ตอนบันทึกสลิปรับเงินจากคนที่ติดเงินเรา ระบบเสนอให้นับเป็น "ได้คืน" อัตโนมัติ (suggestLoanRole)
 */

import type { EntryType } from '@/data/workspaceModes'
import { memoryKey } from './entryMemory'
import type { LoanRole, LoanTag } from './ledgerEngine'
import { roundMoney } from './taxEngine'

export const LOAN_ROLE_LABELS: Record<LoanRole, string> = {
  lend: 'ให้ยืม',
  collect: 'ได้เงินคืน',
  borrow: 'ยืมมา',
  repay: 'คืนเงินที่ยืม',
}

/** บทบาทที่ใช้ได้กับทิศทางเงิน — เงินออกคือให้ยืมหรือคืนเขา เงินเข้าคือได้คืนหรือยืมมา */
export const LOAN_ROLES_FOR: Record<EntryType, LoanRole[]> = {
  expense: ['lend', 'repay'],
  income: ['collect', 'borrow'],
}

export interface LoanEntry {
  id: string
  date: string
  amount: number
  note: string
  loan?: LoanTag
}

export interface LoanBalance {
  key: string
  /** ชื่อที่ใช้ล่าสุด */
  party: string
  /** เขาติดเรา (ให้ยืม − ได้คืน) ติดลบคือคืนเกิน */
  owedToMe: number
  /** เราติดเขา (ยืมมา − คืนแล้ว) */
  iOwe: number
  lastDate: string
  entries: LoanEntry[]
}

export function loanBalances(entries: LoanEntry[]): LoanBalance[] {
  const byKey = new Map<string, LoanBalance>()
  const sorted = [...entries].filter((e) => e.loan).sort((a, b) => a.date.localeCompare(b.date))
  for (const entry of sorted) {
    const tag = entry.loan!
    const key = memoryKey(tag.party)
    if (!key) continue
    const row = byKey.get(key) ?? { key, party: tag.party, owedToMe: 0, iOwe: 0, lastDate: entry.date, entries: [] }
    const amount = Number(entry.amount) || 0
    if (tag.role === 'lend') row.owedToMe += amount
    else if (tag.role === 'collect') row.owedToMe -= amount
    else if (tag.role === 'borrow') row.iOwe += amount
    else row.iOwe -= amount
    row.party = tag.party
    row.lastDate = entry.date
    row.entries.push(entry)
    byKey.set(key, row)
  }
  return [...byKey.values()]
    .map((r) => ({ ...r, owedToMe: roundMoney(r.owedToMe), iOwe: roundMoney(r.iOwe), entries: [...r.entries].reverse() }))
    .sort((a, b) => Math.abs(b.owedToMe) + Math.abs(b.iOwe) - (Math.abs(a.owedToMe) + Math.abs(a.iOwe)))
}

/** คนที่ยังค้างกันอยู่ (ไม่นับที่เคลียร์แล้ว) */
export function openBalances(balances: LoanBalance[]): LoanBalance[] {
  return balances.filter((b) => Math.abs(b.owedToMe) >= 0.01 || Math.abs(b.iOwe) >= 0.01)
}

export interface LoanSuggestion {
  tag: LoanTag
  /** ยอดค้างก่อนรายการนี้ */
  outstanding: number
}

/**
 * เสนอบทบาทเงินยืมจากคู่โอน — เงินเข้าจากคนที่ติดเรา = ได้คืน · เงินออกให้คนที่เราติด = คืนเขา
 * ไม่ค้างกันอยู่ไม่เสนอ (เงินออกให้คนทั่วไปส่วนใหญ่คือค่าใช้จ่าย ไม่ใช่ให้ยืม)
 */
export function suggestLoanRole(balances: LoanBalance[], type: EntryType, party: string): LoanSuggestion | null {
  const key = memoryKey(party)
  if (!key) return null
  const row = balances.find((b) => b.key === key)
  if (!row) return null
  if (type === 'income' && row.owedToMe > 0) return { tag: { role: 'collect', party: row.party }, outstanding: row.owedToMe }
  if (type === 'expense' && row.iOwe > 0) return { tag: { role: 'repay', party: row.party }, outstanding: row.iOwe }
  return null
}

export function loanTotals(balances: LoanBalance[]): { owedToMe: number; iOwe: number } {
  return {
    owedToMe: roundMoney(balances.reduce((s, b) => s + Math.max(0, b.owedToMe), 0)),
    iOwe: roundMoney(balances.reduce((s, b) => s + Math.max(0, b.iOwe), 0)),
  }
}
