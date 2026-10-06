/**
 * ค่าลดหย่อนผู้อยู่ในอุปการะ แบบกรอกจำนวนคน
 *
 * - บุตรคนละ 30,000 บาท บุตรคนที่ 2 ขึ้นไปที่เกิดตั้งแต่ปี 2561 ได้คนละ 60,000 บาท
 * - บิดามารดา (ของตนเองและคู่สมรสที่ไม่มีเงินได้) คนละ 30,000 บาท สูงสุด 4 คน
 * - อุปการะคนพิการหรือทุพพลภาพ คนละ 60,000 บาท
 */

export interface Dependents {
  /** บุตรทั้งหมดที่ใช้สิทธิได้ */
  children: number
  /** ในจำนวนนั้น เป็นบุตรคนที่ 2 ขึ้นไปที่เกิดตั้งแต่ปี 2561 กี่คน */
  childrenBonus: number
  parents: number
  disabled: number
}

export const CHILD_ALLOWANCE = 30_000
/** ส่วนที่เพิ่มให้บุตรคนที่ 2 ขึ้นไปที่เกิดตั้งแต่ปี 2561 (รวมเป็น 60,000 บาท) */
export const CHILD_BONUS = 30_000
export const PARENT_ALLOWANCE = 30_000
export const MAX_PARENTS = 4
export const DISABLED_ALLOWANCE = 60_000

/** คีย์ค่าลดหย่อนที่กรอกเป็นจำนวนคนแทนยอดเงิน */
export const DEPENDENT_KEYS = ['children', 'parents', 'disabledCare'] as const

export function emptyDependents(): Dependents {
  return { children: 0, childrenBonus: 0, parents: 0, disabled: 0 }
}

const whole = (n: unknown, max = 99) => Math.min(max, Math.max(0, Math.floor(Number(n) || 0)))

/** ทำให้จำนวนคนสมเหตุสมผลเสมอ: บุตรที่ได้ส่วนเพิ่มต้องไม่เกินจำนวนบุตรลบหนึ่ง */
export function normaliseDependents(d: Dependents): Dependents {
  const children = whole(d.children)
  return {
    children,
    childrenBonus: Math.min(whole(d.childrenBonus), Math.max(0, children - 1)),
    parents: whole(d.parents, MAX_PARENTS),
    disabled: whole(d.disabled),
  }
}

export function dependentAmounts(d: Dependents): Record<(typeof DEPENDENT_KEYS)[number], number> {
  const n = normaliseDependents(d)
  return {
    children: n.children * CHILD_ALLOWANCE + n.childrenBonus * CHILD_BONUS,
    parents: n.parents * PARENT_ALLOWANCE,
    disabledCare: n.disabled * DISABLED_ALLOWANCE,
  }
}

/** แปลงยอดเงินจากแบบร่างรุ่นเก่ากลับเป็นจำนวนคน (บุตรคิดเป็นคนละ 30,000 บาท) */
export function inferDependents(amounts: Record<string, number | undefined>): Dependents {
  return normaliseDependents({
    children: Math.round((Number(amounts.children) || 0) / CHILD_ALLOWANCE),
    childrenBonus: 0,
    parents: Math.round((Number(amounts.parents) || 0) / PARENT_ALLOWANCE),
    disabled: Math.round((Number(amounts.disabledCare) || 0) / DISABLED_ALLOWANCE),
  })
}
