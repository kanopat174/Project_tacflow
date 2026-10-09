/**
 * คำแนะนำเมื่อเข้าฟีเจอร์ครั้งแรก — ตัวการ์ตูนพาดูทีละจุดว่าหน้านี้ทำอะไรได้
 *
 * แต่ละหน้ามี 2–4 ขั้น สั้น ๆ ไม่เกินสองบรรทัด อ่านจบในไม่กี่วินาที
 * target คือ CSS selector ของจุดที่จะส่องไฟให้ดู ใส่หลายตัวคั่นด้วยจุลภาคได้ (ใช้ตัวแรกที่มองเห็นบนจอ
 * เช่น ปุ่มบันทึกในเมนูด้านข้างบนคอม กับปุ่ม + บนแถบล่างของมือถือ)
 * ขั้นไหนหาจุดไม่เจอ (เช่นยังไม่มีข้อมูล) จะถูกข้ามไปเอง ขั้นที่ไม่มี target แสดงเป็นการ์ดกลางจอ
 */

export interface IntroStep {
  title: string
  text: string
  target?: string
}

export interface FeatureIntro {
  /** ชื่อ route ที่ใช้คำแนะนำชุดนี้ */
  routes: string[]
  steps: IntroStep[]
}

export const FEATURE_INTROS: Record<string, FeatureIntro> = {
  dashboard: {
    routes: ['dashboard'],
    steps: [
      {
        title: 'ยินดีต้อนรับสู่แดชบอร์ด!',
        text: 'ที่นี่คือภาพรวมเงินของคุณจากทุกสมุด พร้อมเรื่องภาษีที่ควรรู้ เดี๋ยวพาดูทีละจุดนะ',
      },
      { title: 'ตัวเลขสำคัญ', text: 'เงินทุน รายรับ รายจ่าย และเงินที่เหลือเก็บ รวมจากทุกสมุดไว้ตรงนี้', target: '.grid-4' },
      {
        title: 'ภาษีปีนี้แบบสด',
        text: 'คาดการณ์ให้ว่าสิ้นปีจะได้เงินคืนหรือต้องจ่ายเพิ่ม จดรายรับเยอะขึ้นตัวเลขยิ่งแม่น',
        target: '.live-tax',
      },
      {
        title: 'จดรายการได้ทุกเมื่อ',
        text: 'กดปุ่มนี้ แล้วพิมพ์สั้น ๆ อย่าง "กาแฟ 65" ก็บันทึกได้เลย',
        target: '.side-add, .tab-add',
      },
    ],
  },
  workspaces: {
    routes: ['workspaces'],
    steps: [
      {
        title: 'สมุดบัญชีคืออะไร?',
        text: 'แยกเงินเป็นเล่ม ๆ เช่น เงินส่วนตัว งานฟรีแลนซ์ ร้านค้า แต่ละเล่มวิเคราะห์ตามโหมดของมันเอง',
      },
      { title: 'สมุดของคุณ', text: 'แตะการ์ดเพื่อเปิดดูรายการ ความเสี่ยง และเป้าหมายของเล่มนั้น', target: '.ws-card' },
      { title: 'เลือกโหมดให้ตรงกับงาน', text: 'โหมดกำหนดหมวดรายการและเกณฑ์ความเสี่ยง เลือกให้ตรงกับรูปแบบรายได้ของคุณ', target: '.mode-card' },
    ],
  },
  'workspace-overview': {
    routes: ['workspace-overview'],
    steps: [
      { title: 'หน้าภาพรวมของสมุด', text: 'บอกว่ารายจ่ายสูงไปไหม และเงินทุนอยู่ได้อีกกี่เดือน ตามเกณฑ์ของโหมดนี้' },
      { title: 'สลับดูส่วนต่าง ๆ', text: 'รายการ หลักฐาน และเป้าหมาย อยู่ในแท็บเหล่านี้', target: '.tab-bar' },
    ],
  },
  'workspace-entries': {
    routes: ['workspace-entries'],
    steps: [
      { title: 'บันทึกรายรับรายจ่าย', text: 'กรอกที่ฟอร์มนี้ แนบรูปใบเสร็จ และตั้งให้ทำซ้ำทุกเดือนได้', target: '.entry-form' },
      { title: 'ค้นหาและกรอง', text: 'หาตามคำ หมวด หรือช่วงวันที่ แล้วส่งออกเป็น CSV ได้', target: '.entry-search' },
      { title: 'ลบผิดไม่ต้องกลัว', text: 'ลบรายการแล้วกด "เลิกทำ" ได้ภายในไม่กี่วินาที' },
    ],
  },
  'workspace-evidence': {
    routes: ['workspace-evidence'],
    steps: [
      { title: 'เก็บหลักฐานไว้ที่เดียว', text: 'ใบเสร็จ สลิป และเอกสารเรียงตามวันที่ เผื่อสรรพากรขอดูย้อนหลัง', target: '.upload-zone' },
    ],
  },
  'workspace-goals': {
    routes: ['workspace-goals'],
    steps: [
      { title: 'ตั้งเป้าหมาย', text: 'เก็บเงิน คุมรายจ่าย หรือสะสมเงินสำรอง ระบบติดตามความคืบหน้าให้เอง' },
      { title: 'งบรายหมวด', text: 'ตั้งงบแต่ละหมวด แล้วระบบเตือนเมื่อใกล้เกินงบ', target: '.budget-panel' },
      { title: 'ภารกิจออมเงิน', text: 'ลองออม 52 สัปดาห์หรืองดใช้จ่าย เก็บเหรียญไปพร้อมกัน', target: '.challenges' },
    ],
  },
  calculator: {
    routes: ['calculator'],
    steps: [
      { title: 'เครื่องคำนวณภาษี', text: 'เลือกหมวดที่ตรงกับเรื่องของคุณ แต่ละหมวดคิดคนละแบบกัน', target: '.category-card' },
    ],
  },
  'calculator-personal': {
    routes: ['calculator-personal'],
    steps: [
      { title: 'คำนวณภาษีบุคคลธรรมดา', text: 'กรอกเงินได้ทั้งปีและค่าลดหย่อน ตัวเลขด้านขวาเปลี่ยนตามทันที' },
      { title: 'ผลคำนวณสด', text: 'คำที่มีเส้นประใต้ แตะเพื่อดูความหมายได้', target: '.summary-card' },
      { title: 'ใช้ตัวเลขนี้ยื่นต่อ', text: 'พอใจแล้วส่งตัวเลขเข้าแบบยื่นภาษีได้เลย ไม่ต้องพิมพ์ซ้ำ', target: '.actions-bar' },
    ],
  },
  'calculator-tools': {
    routes: [
      'calculator-corporate',
      'calculator-dividend',
      'calculator-vat',
      'calculator-withholding',
      'calculator-capital-gains',
      'calculator-half-year',
      'calculator-what-if',
      'calculator-late-payment',
    ],
    steps: [
      { title: 'เครื่องคำนวณเฉพาะเรื่อง', text: 'กรอกตัวเลขทางซ้าย ผลสรุปอยู่อีกฝั่ง และบันทึกเป็น PDF ได้' },
      { title: 'สลับหมวดได้ตลอด', text: 'แถบนี้พาไปเครื่องคำนวณหมวดอื่น', target: '.tab-bar' },
    ],
  },
  deductions: {
    routes: ['deductions'],
    steps: [
      { title: 'คู่มือค่าลดหย่อน', text: 'ทุกรายการพร้อมเพดาน ใส่ยอดแล้วรู้ทันทีว่าประหยัดภาษีได้กี่บาท' },
      { title: 'ผู้ช่วยแนะนำ', text: 'บอกว่าควรซื้ออะไรเพิ่ม เท่าไร ถึงคุ้มที่สุด', target: '.advisor' },
    ],
  },
  filing: {
    routes: ['filing'],
    steps: [
      { title: 'เตรียมแบบภาษี 4 ขั้นตอน', text: 'กรอกทีละขั้น ระบบบันทึกแบบร่างให้อัตโนมัติ ปิดเว็บแล้วกลับมาต่อได้' },
      { title: 'ขั้นตอนทั้งหมด', text: 'แตะเพื่อย้อนไปแก้ขั้นไหนก็ได้', target: '.stepper-bar' },
      { title: 'ภาษีของคุณ', text: 'เปลี่ยนตามที่กรอกทันที ได้คืนหรือต้องจ่ายเพิ่มดูได้ตรงนี้', target: '.summary-card' },
      { title: 'สุดท้ายยื่นที่ e-Filing', text: 'Jodwise ช่วยคำนวณและสรุปเท่านั้น ต้องนำตัวเลขไปยื่นจริงที่เว็บกรมสรรพากร' },
    ],
  },
  documents: {
    routes: ['documents'],
    steps: [
      { title: 'เอกสารประกอบการยื่น', text: 'แนบ 50 ทวิ ใบเสร็จประกัน และเอกสารลดหย่อน แยกตามปีภาษี', target: '.upload-zone' },
    ],
  },
  history: {
    routes: ['history'],
    steps: [
      { title: 'ประวัติแบบภาษี', text: 'ทุกปีที่บันทึกไว้อยู่ที่นี่ แตะเพื่อดูสถานะและแผนการชำระ' },
      { title: 'เทียบกับปีก่อน', text: 'ภาษีเพิ่มหรือลดเพราะอะไร ดูได้ในการ์ดนี้', target: '.year-compare' },
    ],
  },
  status: {
    routes: ['status'],
    steps: [
      { title: 'ติดตามแบบภาษี', text: 'ยื่นจริงแล้วกลับมากดอัปเดตสถานะ ถ้าต้องจ่ายเพิ่มเลือกผ่อน 3 งวดได้ที่หน้านี้' },
    ],
  },
  achievements: {
    routes: ['achievements'],
    steps: [
      { title: 'เหรียญและเลเวล', text: 'จดรายการต่อเนื่องและทำเป้าหมายสำเร็จ จะได้ XP และเหรียญ', target: '.level-card' },
      { title: 'แต่งตัวการ์ตูน', text: 'เลเวลขึ้นแล้วปลดล็อกของแต่งตัว บางชิ้นมีแค่ช่วงเทศกาลนะ', target: '.wardrobe' },
    ],
  },
  wrapped: {
    routes: ['wrapped'],
    steps: [{ title: 'สรุปปีแบบสตอรี่', text: 'แตะซ้ายขวาเพื่อเลื่อน หน้าสุดท้ายบันทึกเป็นรูปไปแชร์ได้' }],
  },
  quiz: {
    routes: ['quiz'],
    steps: [{ title: 'ควิซภาษี 1 นาที', text: 'ตอบ 5 ข้อ ได้ครบได้เหรียญ "เซียนภาษี" เล่นซ้ำได้ไม่จำกัด' }],
  },
  glossary: {
    routes: ['glossary'],
    steps: [{ title: 'คำศัพท์ภาษี', text: 'ศัพท์ยาก ๆ อธิบายแบบภาษาคน ค้นหาได้ และแตะคำที่มีเส้นประใต้ในเว็บเพื่อดูได้ทุกที่' }],
  },
  profile: {
    routes: ['profile'],
    steps: [
      { title: 'โปรไฟล์และการตั้งค่า', text: 'แก้ข้อมูลส่วนตัว เปลี่ยนรหัสผ่าน และติดตั้งเป็นแอปได้ที่นี่' },
      { title: 'สำรองข้อมูลไว้เสมอ', text: 'ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น ดาวน์โหลดไฟล์สำรองไว้กันหาย', target: '.backup-panel' },
    ],
  },
}

/** คำแนะนำของหน้านี้ — คืน key ด้วยเพื่อจำว่าดูแล้ว */
export function introForRoute(routeName: string | undefined | null): { key: string; intro: FeatureIntro } | null {
  if (!routeName) return null
  for (const [key, intro] of Object.entries(FEATURE_INTROS)) {
    if (intro.routes.includes(routeName)) return { key, intro }
  }
  return null
}

/* ---------- จำว่าดูอะไรไปแล้ว ---------- */

export interface IntroProgress {
  seen: string[]
  /** ผู้ใช้กด "ไม่ต้องแนะนำอีก" */
  off: boolean
}

export const introStorageKey = (userId: string | null | undefined) => `taxflow_intro_${userId || 'guest'}`

export function parseIntroProgress(raw: string | null): IntroProgress {
  try {
    const value = raw ? JSON.parse(raw) : null
    return {
      seen: Array.isArray(value?.seen) ? value.seen.filter((k: unknown) => typeof k === 'string') : [],
      off: value?.off === true,
    }
  } catch {
    return { seen: [], off: false }
  }
}

export function shouldShowIntro(progress: IntroProgress, key: string): boolean {
  return !progress.off && !progress.seen.includes(key)
}
