/**
 * จำว่าชื่อและบัญชีไหนบนสลิปเป็นของผู้ใช้เอง — ใช้ตัดสินว่าสลิปเป็นเงินเข้าหรือออก
 *
 * ชื่อบนสลิปมักไม่ตรงกับชื่อในโปรไฟล์ (สลิปภาษาอังกฤษ "MR. SOMCHAI J" กับโปรไฟล์ "สมชาย ใจดี")
 * ระบบจึงเรียนจากสลิปที่ผู้ใช้กดเลือกประเภทเอง: เลือกรายจ่าย = ผู้โอนคือผู้ใช้ · เลือกรายรับ = ผู้รับคือผู้ใช้
 * เก็บในเครื่องเท่านั้น แยกต่อผู้ใช้
 */

import type { EntryType } from '@/data/workspaceModes'

export interface SelfIdentity {
  names: string[]
  /** เลขบัญชีชุดท้ายที่มองเห็นบนสลิป เช่น "1234" */
  accounts: string[]
}

const MAX_NAMES = 10
const MAX_ACCOUNTS = 20
const key = (userId: string) => `taxflow_self_identity_${userId}`

export function loadSelf(userId: string): SelfIdentity {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? 'null') as Partial<SelfIdentity> | null
    return {
      names: Array.isArray(raw?.names) ? raw.names.filter((n): n is string => typeof n === 'string') : [],
      accounts: Array.isArray(raw?.accounts) ? raw.accounts.filter((a): a is string => typeof a === 'string') : [],
    }
  } catch {
    return { names: [], accounts: [] }
  }
}

/** เพิ่มชื่อ/บัญชีไว้หน้าสุด ไม่ซ้ำ และจำกัดจำนวน — ฟังก์ชันบริสุทธิ์ */
export function addSelf(identity: SelfIdentity, name: string | null, account: string | null): SelfIdentity {
  const cleanName = name?.trim() ?? ''
  const cleanAccount = account && /^\d{3,4}$/.test(account) ? account : ''
  return {
    names: cleanName ? [cleanName, ...identity.names.filter((n) => n !== cleanName)].slice(0, MAX_NAMES) : identity.names,
    accounts: cleanAccount
      ? [cleanAccount, ...identity.accounts.filter((a) => a !== cleanAccount)].slice(0, MAX_ACCOUNTS)
      : identity.accounts,
  }
}

/**
 * ผู้ใช้ยืนยันประเภทของสลิปเอง — จำฝั่งที่เป็นผู้ใช้
 * รายจ่าย: ผู้ใช้เป็นผู้โอน · รายรับ: ผู้ใช้เป็นผู้รับ
 */
export function learnSelfFromSlip(
  userId: string,
  type: EntryType,
  slip: { sender: string | null; recipient: string | null; senderAccount: string | null; recipientAccount: string | null },
): void {
  const name = type === 'expense' ? slip.sender : slip.recipient
  const account = type === 'expense' ? slip.senderAccount : slip.recipientAccount
  if (!name && !account) return
  try {
    localStorage.setItem(key(userId), JSON.stringify(addSelf(loadSelf(userId), name, account)))
  } catch {
    /* จำไม่ได้ก็แค่เดาแบบเดิม */
  }
}
