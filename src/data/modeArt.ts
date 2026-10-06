/**
 * ภาพการ์ตูนประจำโหมดสมุดบัญชี ใช้แทนไอคอนเส้นเมื่อเลือกธีมน่ารัก
 * วาดบน viewBox 64×64 เส้นขอบสีเดียวกับตัวการ์ตูน ภาพทั้งเว็บจึงเป็นชุดเดียวกัน
 * SVG เป็นค่าคงที่ในโค้ด ไม่ได้มาจากผู้ใช้ จึงแสดงด้วย v-html ได้ปลอดภัย
 */

import type { WorkspaceMode } from './workspaceModes'

const INK = '#5b3a4a'
const S = `stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`

const sparkle = (x: number, y: number) =>
  `<path d="M${x} ${y - 4} v8 M${x - 4} ${y} h8" stroke="#ffb84d" stroke-width="2.2" stroke-linecap="round"/>`

export const MODE_ART: Record<WorkspaceMode, string> = {
  // กระเป๋าเงินสีชมพูมีเหรียญโผล่
  personal: svg(`
    <circle cx="40" cy="15" r="8" fill="#ffd866" ${S}/>
    <text x="40" y="19" text-anchor="middle" font-size="10" font-weight="700" font-family="sans-serif" fill="#8a5a00">฿</text>
    <rect x="9" y="22" width="44" height="32" rx="9" fill="#ffc2d4" ${S}/>
    <path d="M53 32 h-12 a5 5 0 0 0 0 10 h12 Z" fill="#ff9fbf" ${S}/>
    <circle cx="42" cy="37" r="2" fill="${INK}"/>
    <path d="M17 31 q4 3 8 0" fill="none" ${S}/>
  `),
  // แล็ปท็อปมีหัวใจบนจอ
  freelancer: svg(`
    <rect x="13" y="14" width="38" height="26" rx="4" fill="#cfe6ff" ${S}/>
    <path d="M32 33 l-6 -6 a3.6 3.6 0 0 1 6 -4 a3.6 3.6 0 0 1 6 4 Z" fill="#ff8fb3"/>
    <path d="M7 46 h50 l-4 6 h-42 Z" fill="#e3d9ff" ${S}/>
    ${sparkle(54, 12)}
  `),
  // ร้านค้ากันสาดลายทาง
  sme: svg(`
    <rect x="12" y="28" width="40" height="26" rx="3" fill="#fff4e0" ${S}/>
    <path d="M8 28 l5 -12 h38 l5 12 Z" fill="#ffd3a8" ${S}/>
    <path d="M18 16 l-3 12 M27 16 l-1 12 M37 16 l1 12 M46 16 l3 12" ${S}/>
    <rect x="27" y="38" width="10" height="16" rx="2" fill="#a8d8b0" ${S}/>
    <rect x="16" y="34" width="7" height="7" rx="1.5" fill="#cfe6ff" ${S}/>
    <rect x="41" y="34" width="7" height="7" rx="1.5" fill="#cfe6ff" ${S}/>
  `),
  // ตึกบริษัทมีธง
  company: svg(`
    <path d="M32 6 v8" ${S}/>
    <path d="M32 6 l9 3 l-9 3 Z" fill="#ff8fb3" ${S}/>
    <rect x="18" y="14" width="28" height="42" rx="3" fill="#d9e8ff" ${S}/>
    <g fill="#ffffff" ${S}>
      <rect x="23" y="20" width="6" height="6" rx="1"/><rect x="35" y="20" width="6" height="6" rx="1"/>
      <rect x="23" y="31" width="6" height="6" rx="1"/><rect x="35" y="31" width="6" height="6" rx="1"/>
    </g>
    <rect x="28" y="44" width="8" height="12" rx="1.5" fill="#ffd866" ${S}/>
  `),
  // ต้นไม้งอกเหรียญในกระถาง
  investor: svg(`
    <path d="M32 40 V22" ${S}/>
    <path d="M32 30 q-12 -2 -12 -12 q12 0 12 12 Z" fill="#a8e0a0" ${S}/>
    <path d="M32 24 q10 -2 11 -12 q-11 1 -11 12 Z" fill="#c6efb8" ${S}/>
    <circle cx="46" cy="22" r="6" fill="#ffd866" ${S}/>
    <path d="M18 40 h28 l-4 16 h-20 Z" fill="#ffb48a" ${S}/>
    <path d="M16 40 h32" ${S}/>
  `),
  // กราฟแท่งเทียนพุ่งขึ้น
  trader: svg(`
    <rect x="8" y="10" width="48" height="44" rx="8" fill="#f1ecff" ${S}/>
    <path d="M20 22 v24 M32 18 v26 M44 14 v22" ${S}/>
    <rect x="16" y="30" width="8" height="10" rx="2" fill="#ff9f9f" ${S}/>
    <rect x="28" y="24" width="8" height="14" rx="2" fill="#a8e0a0" ${S}/>
    <rect x="40" y="18" width="8" height="12" rx="2" fill="#a8e0a0" ${S}/>
    ${sparkle(52, 44)}
  `),
}
