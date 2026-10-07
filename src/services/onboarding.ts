/**
 * เริ่มต้นใช้งานด้วย 5 คำถาม — ฟังก์ชันบริสุทธิ์ที่แปลงคำตอบเป็นแผนตั้งต้น
 * สร้างสมุดให้ตรงโหมด เติมแบบร่างภาษี และบอกสิ่งที่ควรทำต่อเรียงตามความสำคัญ
 * ตัวเลขทั้งหมดเป็นค่าประมาณจากคำตอบ ผู้ใช้แก้ได้ทุกช่องภายหลัง
 */

import type { WorkspaceMode } from '@/data/workspaceModes'
import type { Dependents } from '@/data/dependents'
import type { AmountMap } from './taxEngine'

export type WorkKind = 'employee' | 'freelancer' | 'seller' | 'company' | 'investor' | 'trader'
export type Holding = 'socialSecurity' | 'providentFund' | 'lifeInsurance' | 'healthInsurance' | 'retirementFund' | 'mortgage'
export type MainGoal = 'refund' | 'save' | 'organise'

export interface OnboardingAnswers {
  work: WorkKind
  /** รายได้ต่อเดือนโดยประมาณ */
  monthlyIncome: number
  married: boolean
  spouseHasIncome: boolean
  children: number
  parents: number
  holdings: Holding[]
  goal: MainGoal
}

export interface OnboardingPlan {
  workspace: { name: string; mode: WorkspaceMode }
  maritalStatus: string
  income: AmountMap
  deductions: AmountMap
  dependents: Pick<Dependents, 'children' | 'parents'>
  /** เป้าหมายแรกของสมุด */
  goal: { name: string; kind: 'save' | 'runway'; target: number } | null
  todos: { title: string; detail: string; to: string }[]
}

const WORK: Record<WorkKind, { mode: WorkspaceMode; name: string; incomeKey: string | null }> = {
  employee: { mode: 'personal', name: 'การเงินส่วนตัว', incomeKey: 'salary' },
  freelancer: { mode: 'freelancer', name: 'งานฟรีแลนซ์', incomeKey: 'freelance' },
  seller: { mode: 'sme', name: 'ร้านของฉัน', incomeKey: 'business' },
  company: { mode: 'company', name: 'บริษัทของฉัน', incomeKey: null },
  investor: { mode: 'investor', name: 'พอร์ตลงทุน', incomeKey: 'investment' },
  trader: { mode: 'trader', name: 'บัญชีเทรด', incomeKey: null },
}

/** เงินสมทบประกันสังคมของลูกจ้าง 5% ของค่าจ้าง ไม่เกิน 750 บาทต่อเดือน (เพดานจริงของปีให้ engine ตัดอีกชั้น) */
function socialSecurityOf(monthly: number): number {
  return Math.min(750, Math.round(monthly * 0.05)) * 12
}

export function buildOnboardingPlan(a: OnboardingAnswers): OnboardingPlan {
  const work = WORK[a.work]
  const monthly = Math.max(0, Number(a.monthlyIncome) || 0)
  const income: AmountMap = {}
  if (work.incomeKey && monthly > 0) income[work.incomeKey] = monthly * 12

  const deductions: AmountMap = {}
  if (a.holdings.includes('socialSecurity') && monthly > 0) deductions.socialSecurity = socialSecurityOf(monthly)
  if (a.married && !a.spouseHasIncome) deductions.spouse = 60_000

  const todos: OnboardingPlan['todos'] = []
  const has = (h: Holding) => a.holdings.includes(h)

  if (a.work === 'company') {
    todos.push({ title: 'คำนวณภาษีนิติบุคคล', detail: 'บริษัทเสียภาษีจากกำไรสุทธิ คนละแบบกับภาษีบุคคลธรรมดา', to: '/calculator/corporate' })
  }
  if (a.work === 'employee' || a.work === 'freelancer') {
    todos.push({ title: 'อ่านใบ 50 ทวิ เข้าแบบภาษี', detail: 'ถ่ายรูปหรือใช้ PDF ระบบเติมเงินได้และภาษีที่ถูกหักให้', to: '/filing' })
  }
  const missingAmounts = (['lifeInsurance', 'healthInsurance', 'providentFund', 'retirementFund', 'mortgage'] as Holding[]).filter(has)
  if (missingAmounts.length) {
    todos.push({ title: 'ใส่ยอดประกัน กองทุน และดอกเบี้ยบ้านที่จ่ายจริง', detail: 'สิทธิที่คุณมีอยู่แล้ว ใส่ยอดแล้วภาษีลดลงทันที', to: '/filing' })
  }
  if (a.goal === 'refund' || !missingAmounts.length) {
    todos.push({ title: 'ดูว่าซื้อลดหย่อนอะไรคุ้มที่สุด', detail: 'ผู้ช่วยบอกว่าซื้ออะไรเท่าไร ประหยัดภาษีได้กี่บาท', to: '/deductions' })
  }
  if (a.work === 'freelancer' || a.work === 'seller') {
    todos.push({ title: 'นำเข้า statement ธนาคาร', detail: 'ดึงรายรับรายจ่ายย้อนหลังเข้าสมุดในครั้งเดียว', to: '/workspaces' })
  }
  todos.push({ title: 'จดรายการแรกด้วยปุ่ม +', detail: 'พิมพ์สั้น ๆ เช่น "ข้าว 60" ก็บันทึกได้', to: '/workspaces' })
  if (a.goal === 'organise') {
    todos.push({ title: 'ตั้งงบรายหมวด', detail: 'ระบบเตือนเมื่อหมวดไหนใกล้เกินงบ', to: '/workspaces' })
  }

  const goal: OnboardingPlan['goal'] =
    a.goal === 'save' && monthly > 0
      ? (() => {
          const months = work.mode === 'personal' || work.mode === 'investor' ? 6 : 12
          return { name: `เงินสำรองฉุกเฉิน ${months} เดือน`, kind: 'runway' as const, target: months }
        })()
      : null

  return {
    workspace: { name: work.name, mode: work.mode },
    maritalStatus: a.married ? (a.spouseHasIncome ? 'married_separate' : 'married_joint') : 'single',
    income,
    deductions,
    dependents: { children: Math.max(0, Math.round(a.children)), parents: Math.max(0, Math.min(4, Math.round(a.parents))) },
    goal,
    todos,
  }
}
