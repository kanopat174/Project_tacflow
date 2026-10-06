/**
 * บทสนทนาของตัวการ์ตูนผู้ช่วย — เป็นต้นไม้คำถามสั้น ๆ
 *
 * แต่ละโหนดมีข้อความ ตัวเลือกถัดไป และปุ่มพาไปหน้าที่เกี่ยวข้อง
 * บางโหนดสร้างข้อความจากข้อมูลจริงของผู้ใช้ (ค่าลดหย่อน กำหนดภาษี สมุดบัญชี) ผ่าน GuideContext
 * แยกเป็นข้อมูลไว้ไฟล์เดียว แก้คำพูดหรือเพิ่มหัวข้อได้โดยไม่ต้องแตะคอมโพเนนต์
 */

import type { AdvisorResult } from '@/services/deductionAdvisor'
import type { Deadline } from '@/services/taxCalendar'
import { formatBaht } from '@/services/taxEngine'

export interface GuideContext {
  loggedIn: boolean
  /** สมุดเล่มแรกของผู้ใช้ — null คือยังไม่มีสมุด */
  workspaceId: string | null
  workspaceName: string
  /** คำแนะนำลดหย่อนจากตัวเลขในแบบภาษีที่กรอกไว้ */
  advice: AdvisorResult
  daysToYearEnd: number
  nearest: Deadline | null
}

export interface GuideAction {
  label: string
  to: string
}

export interface GuideOption {
  label: string
  next: string
}

export interface GuideReply {
  text: string
  actions: GuideAction[]
  options: GuideOption[]
}

type Build = (ctx: GuideContext) => GuideReply

const BACK: GuideOption = { label: 'ถามเรื่องอื่น', next: 'root' }

/** ปุ่มเข้าสมุด ถ้ายังไม่มีสมุดพาไปสร้างเล่มแรก */
function bookAction(ctx: GuideContext, tab: '' | 'entries' | 'goals', label: string): GuideAction {
  if (!ctx.workspaceId) return { label: 'สร้างสมุดเล่มแรก', to: '/workspaces' }
  return { label, to: `/workspace/${ctx.workspaceId}${tab ? `/${tab}` : ''}` }
}

function noBook(ctx: GuideContext): string {
  return ctx.loggedIn
    ? 'แต่ตอนนี้ยังไม่มีสมุดบัญชีเลย สร้างเล่มแรกก่อนนะ เลือกโหมดให้ตรงกับตัวเอง เช่น การเงินส่วนบุคคล หรือฟรีแลนซ์'
    : 'เข้าสู่ระบบก่อนนะ แล้วสร้างสมุดบัญชีเล่มแรกได้เลย'
}

const deadlineText = (d: Deadline) =>
  d.daysLeft === 0 ? `วันนี้เป็นกำหนด "${d.title}"` : `อีก ${d.daysLeft} วันถึงกำหนด "${d.title}"`

export const GUIDE_FLOW: Record<string, Build> = {
  root: () => ({
    text: 'วันนี้จะทำเรื่องอะไรเอ่ย?',
    actions: [],
    options: [
      { label: 'จัดการเงิน', next: 'money' },
      { label: 'เรื่องภาษี', next: 'tax' },
      { label: 'ยังไม่รู้เลย แนะนำหน่อย', next: 'suggest' },
      { label: 'เล่นสนุก ๆ', next: 'fun' },
    ],
  }),

  /* ---------- เล่นสนุก ---------- */

  fun: () => ({
    text: 'อยากเล่นอะไรดี?',
    actions: [],
    options: [
      { label: 'ควิซภาษี 1 นาที', next: 'fun-quiz' },
      { label: 'เหรียญรางวัลของฉัน', next: 'fun-badges' },
      { label: 'ภารกิจออมเงิน', next: 'fun-challenge' },
      { label: 'สรุปปีของฉัน', next: 'fun-wrapped' },
    ],
  }),

  'fun-quiz': () => ({
    text: 'ตอบคำถามภาษีสั้น ๆ 5 ข้อ ตอบถูกครบได้เหรียญ "เซียนภาษี" ด้วยนะ!',
    actions: [{ label: 'เล่นควิซ', to: '/quiz' }],
    options: [BACK],
  }),

  'fun-badges': (ctx) => ({
    text: ctx.loggedIn
      ? 'จดรายการต่อเนื่อง ตั้งงบ ถึงเป้า ได้เหรียญหมดเลย ยิ่งได้เหรียญเยอะ ฉันยิ่งเลเวลอัป ได้ของแต่งตัวใหม่ด้วย'
      : 'เข้าสู่ระบบก่อนนะ แล้วมาสะสมเหรียญกัน',
    actions: [{ label: ctx.loggedIn ? 'ดูเหรียญรางวัล' : 'เข้าสู่ระบบ', to: ctx.loggedIn ? '/achievements' : '/login' }],
    options: [BACK],
  }),

  'fun-challenge': (ctx) => ({
    text: ctx.workspaceId
      ? 'มีภารกิจออม 52 สัปดาห์ ออมทุกวัน และงดใช้จ่ายหมวดเดียว อยู่ในแท็บเป้าหมายและงบประมาณของสมุด'
      : `ภารกิจออมเงินอยู่ในสมุดบัญชี ${noBook(ctx)}`,
    actions: [bookAction(ctx, 'goals', 'ไปเริ่มภารกิจ')],
    options: [BACK],
  }),

  'fun-wrapped': (ctx) => ({
    text: 'สรุปทั้งปีแบบเล่าเรื่อง ใช้เงินกับอะไรมากที่สุด เดือนไหนประหยัดที่สุด บันทึกเป็นรูปไว้แชร์ได้ด้วย',
    actions: [{ label: ctx.loggedIn ? 'ดูสรุปปีของฉัน' : 'เข้าสู่ระบบ', to: ctx.loggedIn ? '/wrapped' : '/login' }],
    options: [BACK],
  }),

  /* ---------- จัดการเงิน ---------- */

  money: () => ({
    text: 'อยากจัดการเงินเรื่องไหนดี?',
    actions: [],
    options: [
      { label: 'บันทึกรายรับรายจ่าย', next: 'money-record' },
      { label: 'คุมงบไม่ให้เกิน', next: 'money-budget' },
      { label: 'เงินเก็บพอใช้กี่เดือน', next: 'money-runway' },
      { label: 'ตั้งเป้าเก็บเงิน', next: 'money-goal' },
    ],
  }),

  'money-record': (ctx) => ({
    text: ctx.workspaceId
      ? `เปิดสมุด "${ctx.workspaceName}" แล้วไปแท็บรายการได้เลย จดตอนใช้เงินเสร็จจะไม่ลืม ถ่ายรูปสลิปแนบไว้ด้วยก็ได้นะ`
      : `บันทึกรายรับรายจ่ายต้องมีสมุดบัญชีก่อน ${noBook(ctx)}`,
    actions: [bookAction(ctx, 'entries', 'ไปบันทึกรายการ')],
    options: [BACK],
  }),

  'money-budget': (ctx) => ({
    text: ctx.workspaceId
      ? 'ตั้งเพดานรายจ่ายต่อเดือนแยกหมวดได้ที่แท็บเป้าหมายและงบประมาณ กด "ตั้งตามค่าเฉลี่ยที่ใช้จริง" ให้ระบบช่วยตั้งก็ได้ ใช้ถึง 80% เมื่อไรจะเตือนนะ'
      : `อยากคุมงบต้องมีสมุดบัญชีก่อน ${noBook(ctx)}`,
    actions: [bookAction(ctx, 'goals', 'ไปตั้งงบประมาณ')],
    options: [BACK],
  }),

  'money-runway': (ctx) => ({
    text: ctx.workspaceId
      ? 'หน้าภาพรวมของสมุดบอกว่าเงินทุนอยู่ได้อีกกี่เดือน และรายจ่ายสูงเกินไปหรือยัง เทียบกับเกณฑ์ของโหมดที่เลือกไว้'
      : `ต้องมีสมุดบัญชีก่อนถึงจะคำนวณได้ ${noBook(ctx)}`,
    actions: [bookAction(ctx, '', 'ดูภาพรวมสมุด')],
    options: [BACK],
  }),

  'money-goal': (ctx) => ({
    text: ctx.workspaceId
      ? 'ตั้งเป้าได้ 4 แบบ: เก็บเงินให้ถึงยอด รายรับต่อเดือน คุมรายจ่าย และเงินสำรองกี่เดือน ระบบติดตามความคืบหน้าให้เอง'
      : `ตั้งเป้าต้องมีสมุดบัญชีก่อน ${noBook(ctx)}`,
    actions: [bookAction(ctx, 'goals', 'ไปตั้งเป้าหมาย')],
    options: [BACK],
  }),

  /* ---------- ภาษี ---------- */

  tax: () => ({
    text: 'เรื่องภาษีอะไรดีเอ่ย?',
    actions: [],
    options: [
      { label: 'ต้องเสียภาษีเท่าไร', next: 'tax-calc' },
      { label: 'ลดหย่อนยังไงให้คุ้ม', next: 'tax-deduct' },
      { label: 'เตรียมยื่นแบบ', next: 'tax-file' },
      { label: 'ต้องยื่นอะไรเมื่อไร', next: 'tax-deadline' },
      { label: 'ลองถ้าขึ้นเงินเดือน', next: 'tax-whatif' },
    ],
  }),

  'tax-calc': () => ({
    text: 'กรอกเงินเดือนกับรายได้อื่นในเครื่องคำนวณได้เลย ระบบหักค่าใช้จ่ายตามมาตรา 40 และคุมเพดานลดหย่อนให้เอง ตัวเลขส่งต่อไปเตรียมแบบได้ทันที',
    actions: [{ label: 'เปิดเครื่องคำนวณ', to: '/calculator/personal' }],
    options: [{ label: 'ลดหย่อนยังไงให้คุ้ม', next: 'tax-deduct' }, BACK],
  }),

  'tax-deduct': (ctx) => {
    const { advice } = ctx
    if (advice.reason === 'no-income') {
      return {
        text: 'บอกเงินได้ก่อนนะ จะได้รู้ว่าอยู่ขั้นภาษีไหน แล้วค่อยคำนวณว่าซื้ออะไรเพิ่มคุ้มที่สุด',
        actions: [{ label: 'กรอกเงินได้', to: '/calculator/personal' }],
        options: [BACK],
      }
    }
    if (advice.reason === 'no-tax') {
      return {
        text: 'ตามตัวเลขที่กรอกไว้ ตอนนี้ยังไม่ต้องเสียภาษีเลย ลดหย่อนเพิ่มก็ไม่ช่วยแล้วนะ',
        actions: [{ label: 'ดูค่าลดหย่อนทั้งหมด', to: '/deductions' }],
        options: [BACK],
      }
    }
    if (advice.reason === 'maxed' || !advice.suggestions[0]) {
      return {
        text: 'ใช้สิทธิลดหย่อนที่ซื้อเพิ่มเองได้ครบแล้ว เก่งมาก! อย่าลืมเก็บใบเสร็จกับหนังสือรับรองไว้ให้ครบนะ',
        actions: [{ label: 'ไปหน้าเอกสาร', to: '/documents' }],
        options: [BACK],
      }
    }
    const top = advice.suggestions[0]
    const total = advice.currentTax - advice.taxIfAll
    return {
      text:
        `ถ้าซื้อ${top.label}เพิ่มอีก ${formatBaht(top.amount)} จะประหยัดภาษีได้ ${formatBaht(top.saving)} ` +
        `ถ้าทำครบทุกข้อที่แนะนำประหยัดรวม ${formatBaht(total)} เหลืออีก ${ctx.daysToYearEnd} วันก่อนสิ้นปีภาษีนะ`,
      actions: [{ label: 'ดูคำแนะนำทั้งหมด', to: '/deductions' }],
      options: [BACK],
    }
  },

  'tax-file': () => ({
    text: 'เตรียมแบบ 4 ขั้นตอน ถ้ามีสมุดบัญชีกดดึงตัวเลขจากสมุดได้เลยไม่ต้องพิมพ์ซ้ำ เสร็จแล้วบันทึกสรุปไว้ แล้วนำไปยื่นเองที่ระบบ e-Filing ของกรมสรรพากรนะ',
    actions: [{ label: 'เริ่มเตรียมแบบ', to: '/filing' }],
    options: [{ label: 'ต้องยื่นอะไรเมื่อไร', next: 'tax-deadline' }, BACK],
  }),

  'tax-deadline': (ctx) => ({
    text: ctx.nearest
      ? `${deadlineText(ctx.nearest)} (${ctx.nearest.detail}) ดูกำหนดอื่น ๆ ได้ที่ปฏิทินภาษีบนแดชบอร์ด`
      : 'ช่วง 4 เดือนข้างหน้ายังไม่มีกำหนดภาษีที่เกี่ยวกับคุณ สบายใจได้',
    actions: [
      ...(ctx.nearest?.to ? [{ label: 'เตรียมเรื่องนี้', to: ctx.nearest.to }] : []),
      ...(ctx.loggedIn ? [{ label: 'ดูปฏิทินภาษี', to: '/dashboard' }] : []),
    ],
    options: [BACK],
  }),

  'tax-whatif': () => ({
    text: 'ลองเลื่อนแถบดูว่าถ้าขึ้นเงินเดือน รับงานเสริม หรือซื้อกองทุนเพิ่ม ภาษีจะเปลี่ยนไปเท่าไร เทียบรับงานเองกับจดบริษัทก็ได้นะ',
    actions: [{ label: 'ลองจำลองสถานการณ์', to: '/calculator/what-if' }],
    options: [BACK],
  }),

  /* ---------- แนะนำให้เอง: เลือกเรื่องที่สำคัญที่สุดตอนนี้ ---------- */

  suggest: (ctx) => {
    if (ctx.nearest && ctx.nearest.daysLeft <= 30) {
      return {
        text: `เรื่องด่วนก่อนเลย! ${deadlineText(ctx.nearest)} เตรียมไว้แต่เนิ่น ๆ จะได้ไม่ต้องรีบนะ`,
        actions: ctx.nearest.to ? [{ label: 'เตรียมเรื่องนี้', to: ctx.nearest.to }] : [],
        options: [{ label: 'เรื่องภาษีอื่น ๆ', next: 'tax' }, BACK],
      }
    }
    if (ctx.advice.suggestions.length && ctx.daysToYearEnd <= 120) {
      return {
        text: `ใกล้สิ้นปีแล้ว เหลือ ${ctx.daysToYearEnd} วัน ลองดูว่าลดหย่อนเพิ่มอะไรได้บ้าง ตามตัวเลขที่กรอกไว้ยังประหยัดภาษีได้อีกนะ`,
        actions: [{ label: 'ดูคำแนะนำลดหย่อน', to: '/deductions' }],
        options: [{ label: 'ประหยัดได้เท่าไร', next: 'tax-deduct' }, BACK],
      }
    }
    if (!ctx.workspaceId) {
      return {
        text: 'เริ่มจากจดรายรับรายจ่ายก่อนเลย พอมีข้อมูลสักเดือน จะรู้ว่าเงินไปไหน ตั้งงบได้ และดึงตัวเลขไปเตรียมแบบภาษีได้ด้วย',
        actions: [{ label: 'สร้างสมุดบัญชี', to: '/workspaces' }],
        options: [BACK],
      }
    }
    return {
      text: `วันนี้จดรายจ่ายลงสมุด "${ctx.workspaceName}" สักหน่อยไหม ทำทุกวันวันละนิด สิ้นเดือนจะเห็นภาพชัดเลย`,
      actions: [bookAction(ctx, 'entries', 'ไปบันทึกรายการ')],
      options: [{ label: 'ดูงบเดือนนี้', next: 'money-budget' }, BACK],
    }
  },
}
