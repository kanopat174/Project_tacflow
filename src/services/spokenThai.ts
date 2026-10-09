/**
 * แปลงคำพูดภาษาไทยเป็นประโยคที่ตัวแยกรายการ (parseQuickEntry) อ่านได้ — ฟังก์ชันบริสุทธิ์
 *
 * ตัวรู้จำเสียงบางครั้งคืนตัวเลขเป็นคำ: "ข้าวมันไก่ หกสิบ บาท" → "ข้าวมันไก่ 60 บาท"
 * รองรับแบบพูดย่อที่ใช้กับเงิน: "พันห้า" = 1,500 · "สองหมื่นห้า" = 25,000 · "ร้อยห้า" = 150
 *
 * กันแปลงผิด: เลขโดด ๆ ที่ไม่มีหน่วย (สิบ ร้อย พัน ...) แปลงเฉพาะเมื่อตามด้วย "บาท" หรืออยู่ท้ายประโยค
 * "ค่ารถสองแถว 10" จึงไม่กลายเป็น "ค่ารถ 2 แถว 10"
 */

const DIGITS: Record<string, number> = {
  ศูนย์: 0,
  หนึ่ง: 1,
  เอ็ด: 1,
  สอง: 2,
  ยี่: 2,
  สาม: 3,
  สี่: 4,
  ห้า: 5,
  หก: 6,
  เจ็ด: 7,
  แปด: 8,
  เก้า: 9,
}

const UNITS: Record<string, number> = {
  สิบ: 10,
  ร้อย: 100,
  พัน: 1_000,
  หมื่น: 10_000,
  แสน: 100_000,
  ล้าน: 1_000_000,
}

// คำยาวก่อน ("หนึ่ง" ก่อน "หน") และไม่ให้ "สิบ" ใน "สิบเอ็ด" ถูกตัดผิด
const WORDS = [...Object.keys(DIGITS), ...Object.keys(UNITS)].sort((a, b) => b.length - a.length)
const TOKEN = new RegExp(`(?:${WORDS.join('|')}|\\d+(?:\\.\\d+)?)`, 'y')
const RUN = new RegExp(`(?:${WORDS.join('|')})(?:\\s*(?:${WORDS.join('|')}|\\d+))*|\\d+(?:\\.\\d+)?\\s*(?:${Object.keys(UNITS).join('|')})(?:\\s*(?:${WORDS.join('|')}))*`, 'g')

function tokenize(run: string): string[] {
  const tokens: string[] = []
  const text = run.replace(/\s+/g, '')
  let at = 0
  while (at < text.length) {
    TOKEN.lastIndex = at
    const m = TOKEN.exec(text)
    if (!m) return []
    tokens.push(m[0])
    at += m[0].length
  }
  return tokens
}

/** แปลงคำตัวเลขหนึ่งช่วงเป็นค่า — null คืออ่านไม่ได้ */
export function thaiWordsToNumber(run: string): number | null {
  const tokens = tokenize(run)
  if (!tokens.length) return null
  let total = 0
  let section = 0
  let pending: number | null = null
  let lastUnit = 0
  for (const token of tokens) {
    const digit = token in DIGITS ? DIGITS[token]! : /^\d/.test(token) ? Number(token) : null
    if (digit !== null) {
      if (pending !== null) return null
      pending = digit
      continue
    }
    const unit = UNITS[token]!
    if (unit === 1_000_000) {
      total += (section + (pending ?? 0)) * 1_000_000 || 1_000_000
      section = 0
    } else {
      section += (pending ?? 1) * unit
    }
    pending = null
    lastUnit = unit
  }
  if (pending !== null) {
    // เลขที่ตามหลังหน่วยตั้งแต่ร้อยขึ้นไปคือแบบพูดย่อ: พันห้า = 1,000 + 500
    section += lastUnit >= 100 ? (pending * lastUnit) / 10 : pending
  }
  return total + section
}

/** แปลงคำตัวเลขในประโยคที่ได้จากเสียงพูดเป็นตัวเลข */
export function normaliseSpokenEntry(text: string): string {
  let out = text.replace(RUN, (run, offset: number, whole: string) => {
    const hasUnit = Object.keys(UNITS).some((u) => run.includes(u))
    const after = whole.slice(offset + run.length)
    const standalone = /^\s*(?:บาท|$)/.test(after)
    if (!hasUnit && !standalone) return run
    const value = thaiWordsToNumber(run)
    return value === null ? run : ` ${value} `
  })
  // ตัวรู้จำเสียงชอบพูด "บวก" แทนเครื่องหมาย + ของรายรับ
  out = out.replace(/^\s*บวก\s*/, '+')
  return out.replace(/\s+/g, ' ').trim()
}
