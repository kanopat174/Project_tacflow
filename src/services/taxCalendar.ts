/**
 * หากำหนดภาษีที่กำลังจะมาถึง — ฟังก์ชันบริสุทธิ์ (รับวันที่ปัจจุบันเข้ามา จึงเทสต์ได้)
 */

import { CALENDAR_RULES, type CalendarRule } from '@/data/taxCalendar'
import type { WorkspaceMode } from '@/data/workspaceModes'

export interface Deadline {
  key: string
  title: string
  detail: string
  to?: string
  /** YYYY-MM-DD */
  date: string
  daysLeft: number
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function iso(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

/** วันที่ครั้งถัดไปของกฎนี้ นับตั้งแต่วันนี้ (วันนี้เองก็นับ) */
function nextOccurrence(rule: CalendarRule['rule'], today: Date): Date {
  if (rule.kind === 'yearly') {
    const thisYear = new Date(today.getFullYear(), rule.month - 1, rule.day)
    return thisYear >= today ? thisYear : new Date(today.getFullYear() + 1, rule.month - 1, rule.day)
  }
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), rule.day)
  return thisMonth >= today ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, rule.day)
}

/**
 * กำหนดที่เกี่ยวกับผู้ใช้ภายใน horizonDays วันข้างหน้า เรียงจากใกล้สุด
 * modes คือโหมดของสมุดบัญชีที่ผู้ใช้มี — กำหนดของผู้มีเงินได้ทั่วไปแสดงเสมอ
 */
export function upcomingDeadlines(
  modes: WorkspaceMode[],
  today: Date = new Date(),
  horizonDays = 120,
): Deadline[] {
  const start = startOfDay(today)
  const owned = new Set<string>(modes)

  return CALENDAR_RULES.filter((rule) =>
    rule.audience.some((a) => a === 'everyone' || owned.has(a)),
  )
    .map((rule) => {
      const date = nextOccurrence(rule.rule, start)
      return {
        key: rule.key,
        title: rule.title,
        detail: rule.detail,
        to: rule.to,
        date: iso(date),
        daysLeft: Math.round((date.getTime() - start.getTime()) / 86_400_000),
      }
    })
    .filter((d) => d.daysLeft <= horizonDays)
    .sort((a, b) => a.daysLeft - b.daysLeft)
}
