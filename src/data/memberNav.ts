/**
 * เมนูของสมาชิก จัดกลุ่มตามสิ่งที่ผู้ใช้อยากทำ ไม่ใช่ตามชื่อหน้า
 * ใช้ร่วมกันทั้งเมนูด้านข้าง (คอม/ไอแพด) และแถบล่าง (มือถือ)
 */

export interface NavLink {
  label: string
  to: string
  icon: string
  /** หน้าย่อยที่ยังนับว่าอยู่ในเมนูนี้ เช่น /calculator/vat อยู่ใต้ "เครื่องคำนวณ" */
  match?: string[]
}

export interface NavGroup {
  title: string
  links: NavLink[]
}

export const MEMBER_NAV: NavGroup[] = [
  {
    title: 'ภาพรวม',
    links: [
      { label: 'แดชบอร์ด', to: '/dashboard', icon: 'home' },
      { label: 'สมุดบัญชี', to: '/workspaces', icon: 'wallet', match: ['/workspace/'] },
    ],
  },
  {
    title: 'วางแผนการเงิน',
    links: [
      { label: 'มูลค่าสุทธิ', to: '/net-worth', icon: 'chart' },
      { label: 'แผนปลดหนี้', to: '/debts', icon: 'scale' },
      { label: 'ค่าบริการรายเดือน', to: '/subscriptions', icon: 'clock' },
    ],
  },
  {
    title: 'ภาษี',
    links: [
      { label: 'ยื่นแบบภาษี', to: '/filing', icon: 'file', match: ['/status/'] },
      { label: 'เครื่องคำนวณ', to: '/calculator', icon: 'calculator', match: ['/calculator/'] },
      { label: 'ค่าลดหย่อน', to: '/deductions', icon: 'shield' },
      { label: 'กองทุนลดหย่อน', to: '/funds', icon: 'clock' },
      { label: 'เอกสาร', to: '/documents', icon: 'folder' },
      { label: 'ประวัติแบบภาษี', to: '/history', icon: 'history' },
    ],
  },
  {
    title: 'สนุกและเรียนรู้',
    links: [
      { label: 'เหรียญรางวัล', to: '/achievements', icon: 'spark' },
      { label: 'สรุปปีของฉัน', to: '/wrapped', icon: 'chart' },
      { label: 'ควิซภาษี', to: '/quiz', icon: 'check' },
      { label: 'คำศัพท์ภาษี', to: '/glossary', icon: 'info' },
    ],
  },
]

/** เมนูนี้ตรงกับหน้าปัจจุบันไหม */
export function isActive(link: NavLink, path: string): boolean {
  return path === link.to || (link.match ?? []).some((prefix) => path.startsWith(prefix))
}
