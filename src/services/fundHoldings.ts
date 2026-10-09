/**
 * ติดตามระยะถือกองทุนลดหย่อนภาษี — ฟังก์ชันบริสุทธิ์ (รับวันนี้เข้ามา) เทสต์ได้
 *
 * ขายคืนก่อนครบเงื่อนไขต้องคืนภาษีที่เคยได้ลดหย่อนทุกปี พร้อมเงินเพิ่ม 1.5% ต่อเดือน
 * จึงบอกผู้ใช้ให้ชัดว่าแต่ละก้อนขายได้เมื่อไร (นับวันชนวัน)
 *  - SSF: ถือ 10 ปีนับจากวันซื้อแต่ละครั้ง
 *  - Thai ESG: ซื้อปี 2566 ถือ 8 ปี · ซื้อตั้งแต่ 1 ม.ค. 2567 ถือ 5 ปี
 *  - Thai ESGX (เงินใหม่และสับเปลี่ยนจาก LTF): ถือ 5 ปี
 *  - RMF: ถือไม่น้อยกว่า 5 ปีนับจากวันซื้อ RMF ครั้งแรก และอายุครบ 55 ปีบริบูรณ์ — ขายได้ทั้งก้อนพร้อมกัน
 *    และห้ามเว้นการซื้อเกิน 1 ปีติดต่อกัน
 */

import { roundMoney } from './taxEngine'

export type FundKind = 'rmf' | 'ssf' | 'thaiEsg' | 'thaiEsgx'

export interface FundLot {
  id: string
  kind: FundKind
  /** ชื่อกองทุน เช่น K-ESGSI-ThaiESG */
  name: string
  /** วันที่ซื้อ (ค.ศ.) YYYY-MM-DD */
  buyDate: string
  amount: number
}

export interface FundKindInfo {
  label: string
  rule: string
}

export const FUND_KINDS: Record<FundKind, FundKindInfo> = {
  rmf: { label: 'RMF', rule: 'ถือครบ 5 ปีนับจากวันซื้อครั้งแรก และอายุครบ 55 ปี · ห้ามเว้นการซื้อเกิน 1 ปีติดต่อกัน' },
  ssf: { label: 'SSF', rule: 'ถือครบ 10 ปีนับจากวันซื้อแต่ละครั้ง (วันชนวัน)' },
  thaiEsg: { label: 'Thai ESG', rule: 'ซื้อปี 2566 ถือ 8 ปี · ซื้อตั้งแต่ปี 2567 ถือ 5 ปี (วันชนวัน)' },
  thaiEsgx: { label: 'Thai ESGX', rule: 'ถือครบ 5 ปีนับจากวันซื้อหรือวันสับเปลี่ยนจาก LTF (วันชนวัน)' },
}

export const RMF_SELL_AGE = 55

/** วันที่ห่างไป n ปีแบบวันชนวัน — 29 ก.พ. ที่ปีปลายทางไม่มี ใช้ 1 มี.ค. */
export function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y! + years, m! - 1, d!))
  return date.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** ระยะถือ (ปี) ของกองที่นับแยกทีละก้อน */
export function holdingYears(lot: Pick<FundLot, 'kind' | 'buyDate'>): number {
  if (lot.kind === 'ssf') return 10
  if (lot.kind === 'thaiEsg') return lot.buyDate < '2024-01-01' ? 8 : 5
  return 5
}

export interface LotStatus {
  lot: FundLot
  /** วันที่ขายได้โดยไม่ผิดเงื่อนไข — null คือยังบอกไม่ได้ (RMF ที่ยังไม่รู้วันเกิด) */
  sellableOn: string | null
  sellable: boolean
  daysLeft: number | null
  /** เหตุที่ยังขายไม่ได้หรือข้อควรระวัง */
  note: string
}

/**
 * สถานะของทุกก้อน เรียงตามวันที่ขายได้ (ใกล้สุดก่อน)
 * birthDate ใช้กับ RMF เท่านั้น ไม่กรอกก็ยังคำนวณกองอื่นได้
 */
export function lotStatuses(lots: FundLot[], today: string, birthDate: string | null): LotStatus[] {
  const rmfLots = lots.filter((l) => l.kind === 'rmf')
  const firstRmf = rmfLots.map((l) => l.buyDate).sort()[0] ?? null
  const age55 = birthDate ? addYears(birthDate, RMF_SELL_AGE) : null
  const fiveYears = firstRmf ? addYears(firstRmf, 5) : null
  const rmfDate = fiveYears && age55 ? (fiveYears > age55 ? fiveYears : age55) : null

  const statuses = lots.map((lot): LotStatus => {
    if (lot.kind === 'rmf') {
      const note = !birthDate
        ? 'ใส่วันเกิดเพื่อคำนวณวันที่ขาย RMF ได้ (ต้องอายุครบ 55 ปี)'
        : rmfDate === age55
          ? `ขายได้เมื่ออายุครบ ${RMF_SELL_AGE} ปี`
          : 'ขายได้เมื่อครบ 5 ปีนับจาก RMF ก้อนแรก'
      return status(lot, rmfDate, today, note)
    }
    const years = holdingYears(lot)
    return status(lot, addYears(lot.buyDate, years), today, `ถือครบ ${years} ปี (วันชนวัน)`)
  })
  return statuses.sort(
    (a, b) => (a.sellableOn ?? '9999').localeCompare(b.sellableOn ?? '9999') || a.lot.buyDate.localeCompare(b.lot.buyDate),
  )
}

function status(lot: FundLot, sellableOn: string | null, today: string, note: string): LotStatus {
  if (!sellableOn) return { lot, sellableOn, sellable: false, daysLeft: null, note }
  const daysLeft = Math.max(0, daysBetween(today, sellableOn))
  return { lot, sellableOn, sellable: daysLeft === 0, daysLeft, note }
}

/**
 * ปี ค.ศ. ที่ RMF ขาดการซื้อเกิน 1 ปีติดต่อกัน (ผิดเงื่อนไขการลงทุนต่อเนื่อง)
 * นับตั้งแต่ปีที่ซื้อครั้งแรกจนถึงปีก่อนปีปัจจุบัน — ปีนี้ยังซื้อทัน จึงยังไม่นับ
 * คืนรายการคู่ปีที่ไม่ได้ซื้อติดกัน เช่น [[2023, 2024]]
 */
export function rmfGaps(lots: FundLot[], today: string): [number, number][] {
  const years = new Set(lots.filter((l) => l.kind === 'rmf').map((l) => Number(l.buyDate.slice(0, 4))))
  if (!years.size) return []
  const first = Math.min(...years)
  const lastClosed = Number(today.slice(0, 4)) - 1
  const gaps: [number, number][] = []
  for (let y = first + 1; y < lastClosed; y++) {
    if (!years.has(y) && !years.has(y + 1)) gaps.push([y, y + 1])
  }
  return gaps
}

/** ยอดซื้อรวมของแต่ละกองในปีภาษี (พ.ศ.) — ใช้เติมช่องลดหย่อนในแบบภาษี */
export function purchasesInTaxYear(lots: FundLot[], taxYearBE: string): Partial<Record<FundKind, number>> {
  const year = String(Number(taxYearBE) - 543)
  const totals: Partial<Record<FundKind, number>> = {}
  for (const lot of lots) {
    if (lot.buyDate.slice(0, 4) !== year) continue
    totals[lot.kind] = roundMoney((totals[lot.kind] ?? 0) + lot.amount)
  }
  return totals
}

/* ---------- ที่เก็บ (localStorage แยกต่อบัญชี) ---------- */

export interface FundBook {
  lots: FundLot[]
  /** วันเกิด (ค.ศ.) สำหรับเงื่อนไขอายุ 55 ปีของ RMF */
  birthDate: string
}

export const fundStorageKey = (userId: string) => `taxflow_funds_${userId}`

export function loadFunds(userId: string): FundBook {
  try {
    const raw = localStorage.getItem(fundStorageKey(userId))
    const parsed = raw ? (JSON.parse(raw) as Partial<FundBook>) : {}
    return { lots: Array.isArray(parsed.lots) ? parsed.lots : [], birthDate: parsed.birthDate ?? '' }
  } catch {
    return { lots: [], birthDate: '' }
  }
}

export function saveFunds(userId: string, book: FundBook): boolean {
  try {
    localStorage.setItem(fundStorageKey(userId), JSON.stringify(book))
    return true
  } catch {
    return false
  }
}
