import { describe, expect, it } from 'vitest'
import { enhanceForOcr, GOOD_ENOUGH_SCORE, ocrScore, pickBestOrientation, targetScale } from '../slipReader'

function rgba(values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values.flatMap((v) => [v, v, v, 255]))
}
const grays = (data: Uint8ClampedArray) => [...data].filter((_, i) => i % 4 === 0)

describe('เตรียมภาพก่อน OCR', () => {
  it('ขยายรูปเล็ก ย่อรูปใหญ่ รูปขนาดพอดีไม่แตะ', () => {
    expect(targetScale(400, 800)).toBe(2)
    expect(targetScale(200, 300)).toBe(3) // ขยายไม่เกิน 3 เท่า ภาพแตกเกินไปก็อ่านไม่ออก
    expect(targetScale(1080, 2340)).toBe(1)
    expect(targetScale(3000, 5600)).toBe(0.5)
  })

  it('ยืดคอนทราสต์ภาพซีดให้เต็มช่วง', () => {
    // สลิปถ่ายจากจอ: ตัวอักษรเทาอ่อน พื้นเทา
    const data = rgba([...Array(50).fill(150), ...Array(50).fill(200)])
    expect(enhanceForOcr(data)).toEqual({ inverted: false })
    expect(Math.min(...grays(data))).toBe(0)
    expect(Math.max(...grays(data))).toBe(255)
  })

  it('สลิปโหมดมืดกลับสีเป็นตัวดำบนพื้นขาว', () => {
    const data = rgba([...Array(90).fill(20), ...Array(10).fill(230)]) // พื้นดำ ตัวขาว
    expect(enhanceForOcr(data)).toEqual({ inverted: true })
    expect(grays(data)[0]).toBe(255) // พื้นกลายเป็นขาว
    expect(grays(data)[99]).toBe(0) // ตัวอักษรกลายเป็นดำ
  })

  it('ภาพสีเป็นขาวดำ และทึบทั้งภาพ', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 10, 0, 0, 255, 128])
    enhanceForOcr(data)
    expect(data[0]).toBe(data[1])
    expect(data[1]).toBe(data[2])
    expect(data[3]).toBe(255)
  })
})

describe('เลือกแนวการหมุนของรูป', () => {
  const upright = { text: 'โอนเงินสำเร็จ\nจำนวนเงิน 500.00 บาท\nรหัสอ้างอิง 1234567\n14:32', confidence: 78, rotation: 0 }
  const sideways = { text: '| l ~ I ; ,', confidence: 31, rotation: 90 }

  it('รูปตั้งตรงได้คะแนนสูงพอ ไม่ต้องลองหมุน', () => {
    expect(ocrScore(upright)).toBeGreaterThanOrEqual(GOOD_ENOUGH_SCORE)
    expect(ocrScore(sideways)).toBeLessThan(GOOD_ENOUGH_SCORE)
  })

  it('รูปตะแคง: เลือกแนวที่อ่านคำของสลิปออก ไม่ใช่แค่ความมั่นใจสูง', () => {
    const noise = { text: 'IIII llll', confidence: 70, rotation: 180 }
    expect(pickBestOrientation([sideways, noise, upright]).rotation).toBe(0)
  })
})
