/**
 * กิจกรรมตามเทศกาล — ฟังก์ชันบริสุทธิ์ (รับวันที่เข้ามา จึงเทสต์ได้ทุกฤดู)
 *
 *  - ของแต่งตัวตามเทศกาล: เปิดเว็บช่วงเทศกาลแล้วได้เก็บไว้ถาวร พลาดแล้วต้องรอปีหน้า
 *  - ภารกิจหน้ายื่นภาษี (1 ม.ค. – 8 เม.ย.): เช็กลิสต์ทีละขั้นจนยื่นเสร็จ
 */

export interface SeasonalAccessory {
  key: 'santa' | 'garland'
  label: string
  /** MM-DD ช่วงที่แจก ข้ามปีได้ (เช่น 12-20 ถึง 01-05) */
  from: string
  to: string
  period: string
}

export const SEASONAL_ACCESSORIES: SeasonalAccessory[] = [
  { key: 'santa', label: 'หมวกซานต้า', from: '12-20', to: '01-05', period: '20 ธ.ค. – 5 ม.ค.' },
  { key: 'garland', label: 'พวงมาลัยสงกรานต์', from: '04-10', to: '04-20', period: '10 – 20 เม.ย.' },
]

export function inSeason(today: string, from: string, to: string): boolean {
  const md = today.slice(5, 10)
  return from <= to ? md >= from && md <= to : md >= from || md <= to
}

/** ของเทศกาลที่แจกอยู่วันนี้ */
export function activeSeasonalAccessories(today: string): SeasonalAccessory[] {
  return SEASONAL_ACCESSORIES.filter((s) => inSeason(today, s.from, s.to))
}

/* ---------- ภารกิจหน้ายื่นภาษี ---------- */

/** กำหนดยื่นออนไลน์ที่ใช้ทั้งเว็บ */
export const TAX_SEASON_END = '04-08'

export interface TaxSeason {
  /** ปีภาษีที่ต้องยื่นในฤดูนี้ (พ.ศ.) */
  taxYear: string
  deadline: string
  daysLeft: number
}

export function taxSeason(today: string): TaxSeason | null {
  const md = today.slice(5, 10)
  if (md > TAX_SEASON_END) return null
  const year = Number(today.slice(0, 4))
  const deadline = `${year}-${TAX_SEASON_END}`
  const daysLeft = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  return { taxYear: String(year - 1 + 543), deadline, daysLeft }
}

export interface MissionStep {
  key: string
  title: string
  done: boolean
  to: string
}

interface FilingLike {
  reference: string
  taxYear: string
  status: string
  balance: number
  payment?: { paidDates: string[] }
}

/**
 * เช็กลิสต์ของฤดูยื่นภาษี
 * draftIncome คือเงินได้ในแบบร่าง (ยังไม่บันทึก) ของปีภาษีเดียวกัน
 */
export function taxSeasonMission(season: TaxSeason, filings: FilingLike[], draftIncome: number): MissionStep[] {
  const filing = filings.find((f) => f.taxYear === season.taxYear)
  const filed = Boolean(filing && filing.status !== 'submitted')
  const paidAll = filing ? filing.balance <= 0 || (filing.payment?.paidDates.length ?? 0) > 0 && filing.payment!.paidDates.every(Boolean) : false
  return [
    { key: 'draft', title: `กรอกเงินได้ปี ${season.taxYear} ในแบบร่าง`, done: Boolean(filing) || draftIncome > 0, to: '/filing' },
    { key: 'summary', title: 'บันทึกสรุปแบบภาษี', done: Boolean(filing), to: filing ? `/status/${filing.reference}` : '/filing' },
    { key: 'filed', title: 'ยื่นจริงที่ e-Filing แล้วกดอัปเดตสถานะ', done: filed, to: filing ? `/status/${filing.reference}` : '/filing' },
    {
      key: 'paid',
      title: filing && filing.balance < 0 ? 'รอรับเงินคืน' : 'ชำระภาษี (หรือตั้งแผนผ่อน 3 งวด)',
      done: filed && (paidAll || (filing?.balance ?? 0) <= 0),
      to: filing ? `/status/${filing.reference}` : '/filing',
    },
  ]
}

/** ยื่นเสร็จ (เลยสถานะบันทึกสรุปแล้ว) โดยบันทึกสรุปก่อน 1 มีนาคม — เงื่อนไขเหรียญ "นักยื่นไว" */
export function isEarlyFiler(filings: { taxYear: string; status: string; submittedAt: string }[]): boolean {
  return filings.some((f) => {
    if (f.status === 'submitted') return false
    const nextYear = Number(f.taxYear) - 543 + 1
    return f.submittedAt.slice(0, 10) < `${nextYear}-03-01`
  })
}
