/**
 * อ่าน QR ตรวจสอบสลิป (mini QR มุมสลิป) ตามมาตรฐานของธนาคารแห่งประเทศไทย — ฟังก์ชันบริสุทธิ์
 *
 * สลิปโอนเงินของธนาคารไทยแทบทุกเจ้าฝัง QR ที่มีรหัสธนาคารผู้โอนและเลขอ้างอิงรายการ (transRef)
 * เป็นข้อความ TLV: [รหัส 2 หลัก][ความยาว 2 หลัก][ค่า] เช่น
 *   00 46 [00 06 000001][01 03 004][02 22 015282143250BTF04512]  51 02 TH  91 04 B1C6
 * เลขจาก QR แม่นกว่าการอ่านตัวอักษรจากรูป จึงใช้แทนเลขอ้างอิงที่ OCR อ่านได้
 */

/** รหัสธนาคาร 3 หลักของ ธปท. */
export const BANK_CODES: Record<string, string> = {
  '002': 'กรุงเทพ',
  '004': 'กสิกรไทย',
  '006': 'กรุงไทย',
  '011': 'ทีทีบี',
  '014': 'ไทยพาณิชย์',
  '017': 'ซิตี้แบงก์',
  '020': 'สแตนดาร์ดชาร์เตอร์ด',
  '022': 'ซีไอเอ็มบี ไทย',
  '024': 'ยูโอบี',
  '025': 'กรุงศรีอยุธยา',
  '030': 'ออมสิน',
  '033': 'อาคารสงเคราะห์',
  '034': 'ธ.ก.ส.',
  '052': 'แห่งประเทศจีน',
  '066': 'อิสลามแห่งประเทศไทย',
  '067': 'ทิสโก้',
  '069': 'เกียรตินาคินภัทร',
  '070': 'ไอซีบีซี (ไทย)',
  '071': 'ไทยเครดิต',
  '073': 'แลนด์ แอนด์ เฮ้าส์',
}

export interface SlipQr {
  reference: string
  /** ธนาคารผู้โอน — null ถ้าไม่รู้จักรหัส */
  bank: string | null
}

function readTlv(text: string): Map<string, string> | null {
  const out = new Map<string, string>()
  let at = 0
  while (at < text.length) {
    if (at + 4 > text.length) return null
    const id = text.slice(at, at + 2)
    const len = Number(text.slice(at + 2, at + 4))
    if (!/^\d{2}$/.test(id) || !Number.isInteger(len)) return null
    const value = text.slice(at + 4, at + 4 + len)
    if (value.length !== len) return null
    out.set(id, value)
    at += 4 + len
  }
  return out
}

/** คืน null ถ้าไม่ใช่ QR ตรวจสอบสลิป */
export function parseSlipQr(payload: string | null | undefined): SlipQr | null {
  const text = (payload ?? '').trim()
  if (!/^\d{4}/.test(text) || text.length > 512) return null
  const top = readTlv(text)
  const inner = top?.get('00')
  if (!inner) return null
  const fields = readTlv(inner)
  const reference = fields?.get('02')?.trim() ?? ''
  if (!/^[A-Za-z0-9]{6,40}$/.test(reference) || (reference.match(/\d/g) ?? []).length < 4) return null
  const code = fields?.get('01') ?? ''
  return { reference, bank: BANK_CODES[code] ?? null }
}
