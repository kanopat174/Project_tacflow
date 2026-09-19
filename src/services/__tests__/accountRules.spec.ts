import { describe, expect, it } from 'vitest'
import { api, resetMockDatabase } from '../api'
import {
  formatCitizenId,
  formatPhone,
  isCitizenIdChecksumValid,
  isValidCitizenId,
  isValidFullName,
  isValidPhone,
  isValidUsername,
  usernameKey,
} from '@/data/accountRules'

// jsdom ในชุดนี้ไม่ให้ localStorage มา ชั้น API จึงต้องมีตัวจำลอง
const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size
    },
  },
})

function account(overrides: Record<string, string> = {}) {
  return {
    username: 'testuser',
    password: 'password123',
    fullName: 'ผู้ทดสอบ',
    email: `u${Math.random().toString(36).slice(2, 9)}@example.com`,
    citizenId: '1234567890123',
    phone: '',
    ...overrides,
  }
}

describe('กติกาของ username', () => {
  it('รับเฉพาะตัวอักษรอังกฤษ ตัวเลข จุด ขีดล่าง ขีดกลาง ยาว 4–20 ตัว', () => {
    expect(isValidUsername('somchai')).toBe(true)
    expect(isValidUsername('somchai.dev')).toBe(true)
    expect(isValidUsername('som_chai-01')).toBe(true)
    expect(isValidUsername('  spaced  ')).toBe(true) // ตัดช่องว่างหัวท้ายก่อนตรวจ

    expect(isValidUsername('abc')).toBe(false) // สั้นไป
    expect(isValidUsername('a'.repeat(21))).toBe(false) // ยาวไป
    expect(isValidUsername('som chai')).toBe(false) // มีช่องว่างตรงกลาง
    expect(isValidUsername('สมชาย')).toBe(false) // ไม่ใช่ตัวอักษรอังกฤษ
    expect(isValidUsername('somchai!')).toBe(false) // อักขระพิเศษ
  })

  it('คีย์สำหรับเทียบความซ้ำไม่สนตัวพิมพ์เล็กใหญ่', () => {
    expect(usernameKey(' SomChai ')).toBe('somchai')
  })
})

describe('สมัครสมาชิก', () => {
  it('ปฏิเสธ username ที่ผิดกติกา แทนที่จะรับไปเงียบ ๆ', async () => {
    resetMockDatabase()
    await expect(api.register(account({ username: 'ส ม ช า ย!!' }))).rejects.toThrow(/username ต้องเป็น/)
    await expect(api.register(account({ username: 'abc' }))).rejects.toThrow(/username ต้องเป็น/)
  })

  it('เก็บ username ตามที่ผู้ใช้พิมพ์ ไม่แปลงเป็นตัวพิมพ์เล็กเงียบ ๆ', async () => {
    resetMockDatabase()
    const result = await api.register(account({ username: 'SomchaiDev' }))
    expect(result.user.username).toBe('SomchaiDev')
  })

  it('ยังกัน username ซ้ำแบบไม่สนตัวพิมพ์เล็กใหญ่', async () => {
    resetMockDatabase()
    await api.register(account({ username: 'SomchaiDev' }))
    await expect(api.register(account({ username: 'somchaidev' }))).rejects.toThrow(/ถูกใช้งานแล้ว/)
  })

  it('ปฏิเสธอีเมลที่รูปแบบไม่ถูกต้อง', async () => {
    resetMockDatabase()
    await expect(api.register(account({ email: 'not-an-email' }))).rejects.toThrow(/อีเมล/)
  })
})

describe('เข้าสู่ระบบ', () => {
  it('ล็อกอินด้วย username ที่พิมพ์คนละตัวพิมพ์ก็เข้าได้', async () => {
    resetMockDatabase()
    await api.register(account({ username: 'SomchaiDev' }))
    await api.logout()

    const lower = await api.login({ username: 'somchaidev', password: 'password123' })
    expect(lower.user.username).toBe('SomchaiDev')
    await api.logout()

    const upper = await api.login({ username: 'SOMCHAIDEV', password: 'password123' })
    expect(upper.user.username).toBe('SomchaiDev')
  })

  it('ล็อกอินด้วยอีเมลและมีช่องว่างหัวท้ายก็ยังเข้าได้', async () => {
    resetMockDatabase()
    const created = await api.register(account({ username: 'SomchaiDev', email: 'Dev@Example.com' }))
    await api.logout()

    const result = await api.login({ username: '  dev@example.com  ', password: 'password123' })
    expect(result.user.id).toBe(created.user.id)
  })

  it('บัญชีตั้งต้นที่ระบบสร้างให้ยังล็อกอินได้ตามเดิม', async () => {
    resetMockDatabase()
    const result = await api.login({ username: 'somchai', password: 'somchai123' })
    expect(result.user.username).toBe('somchai')
  })
})

describe('อีเมลซ้ำ', () => {
  it('กันอีเมลซ้ำแบบไม่สนตัวพิมพ์เล็กใหญ่', async () => {
    resetMockDatabase()
    await expect(
      api.register(account({ username: 'newuser', email: 'Somchai@Example.com' })),
    ).rejects.toThrow(/ถูกใช้สมัครไปแล้ว/)
  })
})

describe('ชื่อ-นามสกุล เลขประจำตัวประชาชน และเบอร์โทรศัพท์', () => {
  it('ชื่อ-นามสกุลต้องไม่ว่างและไม่ยาวเกินไป', () => {
    expect(isValidFullName('สมชาย ใจดี')).toBe(true)
    expect(isValidFullName('  ')).toBe(false)
    expect(isValidFullName('ก')).toBe(false)
    expect(isValidFullName('ก'.repeat(101))).toBe(false)
  })

  it('เลขประจำตัวประชาชนต้องมี 13 หลัก และตัดขีดคั่นออกให้', () => {
    expect(isValidCitizenId('1-2345-67890-12-3')).toBe(true)
    expect(isValidCitizenId('1234567890123')).toBe(true)
    expect(isValidCitizenId('7')).toBe(false)
    expect(isValidCitizenId('abcdefghijklm')).toBe(false)
    expect(isValidCitizenId('12345678901234')).toBe(false)
  })

  it('ตรวจหลักสุดท้ายของเลขบัตรได้', () => {
    expect(isCitizenIdChecksumValid('1101700207030')).toBe(true)
    expect(isCitizenIdChecksumValid('1101700207031')).toBe(false)
    expect(isCitizenIdChecksumValid('123')).toBe(false)
  })

  it('จัดรูปแบบเลขบัตรตามหน้าบัตรประชาชน', () => {
    expect(formatCitizenId('1101700207030')).toBe('1-1017-00207-03-0')
    expect(formatCitizenId('110')).toBe('1-10')
    expect(formatCitizenId('')).toBe('')
  })

  it('เบอร์โทรต้องมี 9 หรือ 10 หลักและขึ้นต้นด้วย 0', () => {
    expect(isValidPhone('081-234-5678')).toBe(true)
    expect(isValidPhone('0812345678')).toBe(true)
    expect(isValidPhone('02-000-0000')).toBe(true)
    expect(isValidPhone('ไม่ใช่เบอร์โทร')).toBe(false)
    expect(isValidPhone('812345678')).toBe(false) // ไม่ขึ้นต้นด้วย 0
    expect(isValidPhone('08123')).toBe(false)
  })

  it('จัดรูปแบบเบอร์มือถือและเบอร์บ้านต่างกัน', () => {
    expect(formatPhone('0812345678')).toBe('081-234-5678')
    expect(formatPhone('020000000')).toBe('02-000-0000')
  })
})

describe('API ต้องปฏิเสธข้อมูลระบุตัวตนที่ผิดรูปแบบ', () => {
  it('สมัครสมาชิกด้วยชื่อว่าง เลขบัตรไม่ครบ หรือเบอร์มั่ว ไม่ผ่าน', async () => {
    resetMockDatabase()
    await expect(api.register(account({ fullName: '  ' }))).rejects.toThrow(/ชื่อ-นามสกุล/)
    await expect(api.register(account({ citizenId: '7' }))).rejects.toThrow(/13 หลัก/)
    await expect(api.register(account({ phone: 'ไม่ใช่เบอร์โทร' }))).rejects.toThrow(/เบอร์โทรศัพท์/)
  })

  it('เบอร์โทรเว้นว่างได้ เพราะไม่ใช่ช่องบังคับ', async () => {
    resetMockDatabase()
    const r = await api.register(account({ username: 'nophone', phone: '' }))
    expect(r.user.phone).toBe('')
  })

  it('เก็บเลขบัตรและเบอร์เป็นตัวเลขล้วน ไม่ว่าจะพิมพ์ขีดมาแบบไหน', async () => {
    resetMockDatabase()
    const r = await api.register(
      account({ username: 'dashes', citizenId: '1-1017-00207-03-0', phone: '081-234-5678' }),
    )
    expect(r.user.citizenId).toBe('1101700207030')
    expect(r.user.phone).toBe('0812345678')
  })

  it('แก้โปรไฟล์ก็ต้องผ่านกติกาเดียวกัน', async () => {
    resetMockDatabase()
    await api.login({ username: 'somchai', password: 'somchai123' })

    await expect(api.updateProfile({ fullName: '' })).rejects.toThrow(/ชื่อ-นามสกุล/)
    await expect(api.updateProfile({ citizenId: 'abc' })).rejects.toThrow(/13 หลัก/)
    await expect(api.updateProfile({ phone: '!!!' })).rejects.toThrow(/เบอร์โทรศัพท์/)
    await expect(api.updateProfile({ email: 'not-an-email' })).rejects.toThrow(/อีเมล/)

    const ok = await api.updateProfile({ fullName: 'สมชาย ใจงาม', citizenId: '1-1017-00207-03-0' })
    expect(ok.fullName).toBe('สมชาย ใจงาม')
    expect(ok.citizenId).toBe('1101700207030')
  })
})
