/**
 * ชั้นเรียก API — ทุกหน้าเรียกผ่านอ็อบเจกต์ `api` นี้เท่านั้น
 * (เลียนแบบโครงของ astra-motors/frontend/js/api.js เพื่อให้สลับไปใช้ backend จริงได้โดยแก้ที่ไฟล์เดียว)
 *
 * ตอนนี้ยังไม่มี backend — ข้อมูลทั้งหมดเก็บใน localStorage ของเบราว์เซอร์
 * และหน่วงเวลาเล็กน้อยให้เหมือนเรียกผ่านเครือข่ายจริง
 *
 * คำเตือน: การเก็บรหัสผ่านในฝั่งเบราว์เซอร์แบบนี้ "ไม่ปลอดภัย" และใช้ได้เฉพาะ prototype
 * เมื่อเชื่อม backend จริงต้องย้ายการตรวจรหัสผ่านไปฝั่งเซิร์ฟเวอร์ (เช่น PBKDF2 + bearer token)
 */

import type { WorkspaceMode } from '@/data/workspaceModes'
import type { Evidence, Goal, LedgerEntry } from './ledgerEngine'
import { fileStore } from './fileStore'
import {
  CITIZEN_ID_ERROR,
  EMAIL_PATTERN,
  FULL_NAME_ERROR,
  PASSWORD_ERROR,
  PASSWORD_MIN_LENGTH,
  PHONE_ERROR,
  USERNAME_ERROR,
  digitsOnly,
  isValidCitizenId,
  isValidFullName,
  isValidPhone,
  isValidUsername,
  usernameKey,
} from '@/data/accountRules'

const DB_KEY = 'taxflow_db_v1'
const TOKEN_KEY = 'taxflow_token'
const LATENCY_MS = 260

export type Role = 'user' | 'admin'

export interface User {
  id: string
  username: string
  fullName: string
  email: string
  citizenId: string
  phone: string
  address: string
  role: Role
  createdAt: string
}

export interface StoredUser extends User {
  passwordHash: string
}

export type FilingStatus = 'submitted' | 'received' | 'reviewing' | 'completed'

export interface Filing {
  id: string
  /** เลขอ้างอิงที่ผู้ใช้เห็น เช่น TF-2568-0042 */
  reference: string
  userId: string
  taxYear: string
  formType: string
  grossIncome: number
  netIncome: number
  tax: number
  withholdingTax: number
  /** > 0 ต้องชำระเพิ่ม, < 0 ขอคืนได้ */
  balance: number
  submittedAt: string
  status: FilingStatus
  /** สแนปช็อตข้อมูลที่ยื่น เพื่อเปิดดูย้อนหลังได้ */
  snapshot: Record<string, unknown>
}

export interface DocumentRecord {
  id: string
  userId: string
  taxYear: string
  type: string
  name: string
  size: number
  uploadedAt: string
}

export interface Workspace {
  id: string
  userId: string
  name: string
  mode: WorkspaceMode
  /** เงินทุนตั้งต้นของสมุดเล่มนี้ */
  capital: number
  createdAt: string
}

export interface EntryRecord extends LedgerEntry {
  workspaceId: string
  userId: string
}

export interface GoalRecord extends Goal {
  workspaceId: string
  userId: string
}

export interface EvidenceRecord extends Evidence {
  workspaceId: string
  userId: string
}

interface Database {
  users: StoredUser[]
  filings: Filing[]
  documents: DocumentRecord[]
  workspaces: Workspace[]
  entries: EntryRecord[]
  goals: GoalRecord[]
  evidence: EvidenceRecord[]
  sessions: Record<string, string>
  sequence: number
}

/* ---------- ตัวช่วยระดับล่าง ---------- */

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))
}

/**
 * แฮชรหัสผ่านแบบง่าย (djb2 + salt) — พอสำหรับ prototype ที่ไม่มีเซิร์ฟเวอร์
 * ไม่ใช่การเข้ารหัสที่ปลอดภัย ห้ามนำไปใช้กับข้อมูลจริง
 */
function hashPassword(password: string): string {
  let hash = 5381
  const salted = `taxflow::${password}`
  for (let i = 0; i < salted.length; i++) {
    hash = (hash * 33) ^ salted.charCodeAt(i)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

/* ---------- ฐานข้อมูลจำลองใน localStorage ---------- */

function seedDatabase(): Database {
  const now = new Date().toISOString()
  return {
    users: [
      {
        id: 'u_admin',
        username: 'admin',
        fullName: 'ผู้ดูแลระบบ TaxFlow',
        email: 'admin@taxflow.local',
        citizenId: '1000000000001',
        phone: '020000000',
        address: 'กรมสรรพากร ถนนพหลโยธิน เขตพญาไท กรุงเทพมหานคร 10400',
        role: 'admin',
        createdAt: now,
        passwordHash: hashPassword('admin1234'),
      },
      {
        id: 'u_somchai',
        username: 'somchai',
        fullName: 'สมชาย ใจดี',
        email: 'somchai@example.com',
        citizenId: '1234567890123',
        phone: '0812345678',
        address: '99/9 ถนนสุขุมวิท แขวงคลองตัน เขตวัฒนา กรุงเทพมหานคร 10110',
        role: 'user',
        createdAt: now,
        passwordHash: hashPassword('somchai123'),
      },
      {
        id: 'u_nattaya',
        username: 'nattaya',
        fullName: 'ณัฐธยาน์ ศรีสุข',
        email: 'nattaya@example.com',
        citizenId: '3456789012345',
        phone: '0898765432',
        address: '145 ถนนนิมมานเหมินท์ ตำบลสุเทพ อำเภอเมือง จังหวัดเชียงใหม่ 50200',
        role: 'user',
        createdAt: now,
        passwordHash: hashPassword('nattaya123'),
      },
    ],
    filings: [
      {
        id: 'f_seed_1',
        reference: 'TF-2567-0001',
        userId: 'u_somchai',
        taxYear: '2567',
        formType: 'ภ.ง.ด.91',
        grossIncome: 620_000,
        netIncome: 373_000,
        tax: 19_800,
        withholdingTax: 24_000,
        balance: -4_200,
        submittedAt: '2025-03-14T09:12:00.000Z',
        status: 'completed',
        snapshot: {},
      },
      {
        id: 'f_seed_2',
        reference: 'TF-2566-0007',
        userId: 'u_somchai',
        taxYear: '2566',
        formType: 'ภ.ง.ด.91',
        grossIncome: 540_000,
        netIncome: 311_000,
        tax: 15_050,
        withholdingTax: 15_050,
        balance: 0,
        submittedAt: '2024-03-08T04:40:00.000Z',
        status: 'completed',
        snapshot: {},
      },
    ],
    documents: [],
    // สมุดตัวอย่างของ somchai เพื่อให้เปิดมาแล้วเห็นตัวเลขทันที
    workspaces: [
      {
        id: 'w_seed_personal',
        userId: 'u_somchai',
        name: 'การเงินส่วนตัว',
        mode: 'personal',
        capital: 100_000,
        createdAt: now,
      },
    ],
    entries: seedEntries(),
    evidence: [],
    goals: [
      {
        id: 'g_seed_1',
        workspaceId: 'w_seed_personal',
        userId: 'u_somchai',
        name: 'เงินสำรองฉุกเฉิน 6 เดือน',
        kind: 'runway',
        target: 6,
        deadline: '',
      },
      {
        id: 'g_seed_2',
        workspaceId: 'w_seed_personal',
        userId: 'u_somchai',
        name: 'คุมรายจ่ายไม่เกินเดือนละ 12,000',
        kind: 'expenseCap',
        target: 12_000,
        deadline: '',
      },
    ],
    sessions: {},
    sequence: 42,
  }
}

/**
 * รายการตัวอย่างสองเดือน จงใจใส่ตัวเลขให้รายจ่ายสูงเกือบเท่ารายรับ
 * เพื่อให้หน้าวิเคราะห์ความเสี่ยงมีอะไรให้ดูตั้งแต่เปิดครั้งแรก
 */
function seedEntries(): EntryRecord[] {
  const base = { workspaceId: 'w_seed_personal', userId: 'u_somchai' }
  const rows: [string, 'income' | 'expense', string, number, string][] = [
    ['2026-07-01', 'income', 'salary', 15_000, 'เงินเดือนกรกฎาคม'],
    ['2026-07-03', 'expense', 'housing', 5_500, 'ค่าเช่าห้อง'],
    ['2026-07-05', 'expense', 'food', 4_200, 'ค่าอาหารทั้งเดือน'],
    ['2026-07-08', 'expense', 'transport', 1_600, 'ค่าเดินทาง'],
    ['2026-07-12', 'expense', 'utilities', 1_200, 'ค่าน้ำค่าไฟและอินเทอร์เน็ต'],
    ['2026-07-20', 'expense', 'lifestyle', 1_500, 'ดูหนังและกินข้าวนอกบ้าน'],
    ['2026-08-01', 'income', 'salary', 15_000, 'เงินเดือนสิงหาคม'],
    ['2026-08-04', 'expense', 'housing', 5_500, 'ค่าเช่าห้อง'],
    ['2026-08-06', 'expense', 'food', 4_400, 'ค่าอาหารทั้งเดือน'],
    ['2026-08-09', 'expense', 'transport', 1_500, 'ค่าเดินทาง'],
    ['2026-08-14', 'expense', 'utilities', 1_150, 'ค่าน้ำค่าไฟและอินเทอร์เน็ต'],
    ['2026-08-22', 'expense', 'lifestyle', 1_450, 'ของใช้และบันเทิง'],
  ]
  return rows.map(([date, type, categoryKey, amount, note], i) => ({
    ...base,
    id: `e_seed_${i}`,
    date,
    type,
    categoryKey,
    amount,
    note,
  }))
}

function readDatabase(): Database {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Database
      // ข้อมูลที่บันทึกไว้ก่อนมีฟีเจอร์สมุดบัญชีจะไม่มีสามคีย์นี้ เติมให้ก่อนใช้งาน
      parsed.workspaces ??= []
      parsed.entries ??= []
      parsed.goals ??= []
      parsed.evidence ??= []
      return parsed
    }
  } catch {
    /* ข้อมูลเสียหาย — เริ่มใหม่จากชุดตั้งต้น */
  }
  const seeded = seedDatabase()
  writeDatabase(seeded)
  return seeded
}

function writeDatabase(db: Database): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    /* พื้นที่เก็บเต็มหรือถูกปิดใช้งาน — ข้อมูลรอบนี้จะไม่ถูกบันทึก */
  }
}

function publicUser(user: StoredUser): User {
  const { passwordHash: _passwordHash, ...rest } = user
  return rest
}

function currentUserOrThrow(db: Database): StoredUser {
  const token = localStorage.getItem(TOKEN_KEY)
  const userId = token ? db.sessions[token] : undefined
  const user = userId ? db.users.find((u) => u.id === userId) : undefined
  if (!user) throw new ApiError('กรุณาเข้าสู่ระบบก่อนใช้งานส่วนนี้', 401)
  return user
}

/**
 * เลื่อนสถานะแบบภาษีตามเวลาที่ผ่านไป — จำลองการทำงานของสรรพากร
 * เพื่อให้เดโมเห็นสถานะเปลี่ยนจริงภายในไม่กี่นาที
 */
function progressStatus(filing: Filing): Filing {
  if (filing.status === 'completed') return filing
  const minutes = (Date.now() - new Date(filing.submittedAt).getTime()) / 60_000
  const status: FilingStatus =
    minutes >= 3 ? 'completed' : minutes >= 2 ? 'reviewing' : minutes >= 1 ? 'received' : 'submitted'
  return { ...filing, status }
}

/* ---------- API ---------- */

export interface RegisterInput {
  username: string
  password: string
  fullName: string
  email: string
  citizenId: string
  phone: string
}

export interface LoginInput {
  username: string
  password: string
}

export interface CreateFilingInput {
  taxYear: string
  formType: string
  grossIncome: number
  netIncome: number
  tax: number
  withholdingTax: number
  balance: number
  snapshot: Record<string, unknown>
}

export const api = {
  /* ---------- ระบบสมาชิก ---------- */

  async register(input: RegisterInput): Promise<{ token: string; user: User }> {
    const db = readDatabase()
    // เก็บตามที่ผู้ใช้พิมพ์เพื่อเอาไว้แสดงผล แต่เทียบความซ้ำแบบไม่สนตัวพิมพ์เล็กใหญ่
    const username = input.username.trim()

    if (!isValidUsername(username)) throw new ApiError(USERNAME_ERROR)
    if (input.password.length < PASSWORD_MIN_LENGTH) throw new ApiError(PASSWORD_ERROR)
    if (!EMAIL_PATTERN.test(input.email.trim())) throw new ApiError('รูปแบบอีเมลไม่ถูกต้อง')
    if (!isValidFullName(input.fullName)) throw new ApiError(FULL_NAME_ERROR)
    if (!isValidCitizenId(input.citizenId)) throw new ApiError(CITIZEN_ID_ERROR)
    if (input.phone.trim() && !isValidPhone(input.phone)) throw new ApiError(PHONE_ERROR)
    if (db.users.some((u) => usernameKey(u.username) === usernameKey(username))) {
      throw new ApiError('username นี้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น', 409)
    }
    if (db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
      throw new ApiError('อีเมลนี้ถูกใช้สมัครไปแล้ว', 409)
    }

    const user: StoredUser = {
      id: randomId('u'),
      username,
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      citizenId: digitsOnly(input.citizenId),
      phone: digitsOnly(input.phone),
      address: '',
      role: 'user',
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(input.password),
    }

    const token = randomId('tk')
    db.users.push(user)
    db.sessions[token] = user.id
    writeDatabase(db)
    localStorage.setItem(TOKEN_KEY, token)
    return delay({ token, user: publicUser(user) })
  },

  async login(input: LoginInput): Promise<{ token: string; user: User }> {
    const db = readDatabase()
    // ล็อกอินด้วย username หรืออีเมลก็ได้ และไม่สนตัวพิมพ์เล็กใหญ่ทั้งคู่
    const identifier = input.username.trim().toLowerCase()
    const user = db.users.find(
      (u) => usernameKey(u.username) === identifier || u.email.toLowerCase() === identifier,
    )

    if (!user || user.passwordHash !== hashPassword(input.password)) {
      throw new ApiError('username หรือรหัสผ่านไม่ถูกต้อง', 401)
    }

    const token = randomId('tk')
    db.sessions[token] = user.id
    writeDatabase(db)
    localStorage.setItem(TOKEN_KEY, token)
    return delay({ token, user: publicUser(user) })
  },

  async logout(): Promise<null> {
    const db = readDatabase()
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      delete db.sessions[token]
      writeDatabase(db)
    }
    localStorage.removeItem(TOKEN_KEY)
    return delay(null)
  },

  /** อ่านข้อมูลผู้ใช้จาก token ที่ค้างอยู่ — ใช้ตอนเปิดเว็บใหม่ */
  async me(): Promise<User | null> {
    const db = readDatabase()
    try {
      return publicUser(currentUserOrThrow(db))
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      return null
    }
  },

  async updateProfile(patch: Partial<Omit<User, 'id' | 'role' | 'createdAt'>>): Promise<User> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)

    // ก่อนหน้านี้หน้าโปรไฟล์บันทึกค่าอะไรก็ได้ ต้องตรวจด้วยกติกาชุดเดียวกับตอนสมัคร
    if (patch.email !== undefined) {
      const email = patch.email.trim().toLowerCase()
      if (!EMAIL_PATTERN.test(patch.email.trim())) throw new ApiError('รูปแบบอีเมลไม่ถูกต้อง')
      if (db.users.some((u) => u.id !== user.id && u.email.toLowerCase() === email)) {
        throw new ApiError('อีเมลนี้ถูกใช้โดยบัญชีอื่นแล้ว', 409)
      }
    }
    if (patch.fullName !== undefined && !isValidFullName(patch.fullName)) {
      throw new ApiError(FULL_NAME_ERROR)
    }
    if (patch.citizenId !== undefined && !isValidCitizenId(patch.citizenId)) {
      throw new ApiError(CITIZEN_ID_ERROR)
    }
    if (patch.phone !== undefined && patch.phone.trim() && !isValidPhone(patch.phone)) {
      throw new ApiError(PHONE_ERROR)
    }

    Object.assign(user, patch)
    // เก็บเป็นตัวเลขล้วนเสมอ ไม่ว่าผู้ใช้จะพิมพ์ขีดคั่นมาแบบไหน
    if (patch.citizenId !== undefined) user.citizenId = digitsOnly(patch.citizenId)
    if (patch.phone !== undefined) user.phone = digitsOnly(patch.phone)
    writeDatabase(db)
    return delay(publicUser(user))
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<null> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)

    if (user.passwordHash !== hashPassword(currentPassword)) {
      throw new ApiError('รหัสผ่านปัจจุบันไม่ถูกต้อง', 401)
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) throw new ApiError(PASSWORD_ERROR)

    user.passwordHash = hashPassword(newPassword)
    // เปลี่ยนรหัสผ่านแล้วยกเลิก session อื่นทั้งหมด เหลือไว้เฉพาะเครื่องปัจจุบัน
    const activeToken = localStorage.getItem(TOKEN_KEY)
    for (const [token, userId] of Object.entries(db.sessions)) {
      if (userId === user.id && token !== activeToken) delete db.sessions[token]
    }
    writeDatabase(db)
    return delay(null)
  },

  /* ---------- แบบภาษี ---------- */

  async filings(): Promise<Filing[]> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const mine = db.filings
      .filter((f) => f.userId === user.id)
      .map(progressStatus)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    return delay(mine)
  },

  async filing(reference: string): Promise<Filing> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const found = db.filings.find((f) => f.reference === reference && f.userId === user.id)
    if (!found) throw new ApiError('ไม่พบแบบภาษีตามเลขอ้างอิงนี้', 404)
    return delay(progressStatus(found))
  },

  async createFiling(input: CreateFilingInput): Promise<Filing> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)

    if (db.filings.some((f) => f.userId === user.id && f.taxYear === input.taxYear)) {
      throw new ApiError(`คุณยื่นแบบภาษีของปี ${input.taxYear} ไปแล้ว — ดูได้ที่หน้าประวัติการยื่น`, 409)
    }

    db.sequence += 1
    const filing: Filing = {
      id: randomId('f'),
      reference: `TF-${input.taxYear}-${String(db.sequence).padStart(4, '0')}`,
      userId: user.id,
      taxYear: input.taxYear,
      formType: input.formType,
      grossIncome: input.grossIncome,
      netIncome: input.netIncome,
      tax: input.tax,
      withholdingTax: input.withholdingTax,
      balance: input.balance,
      submittedAt: new Date().toISOString(),
      status: 'submitted',
      snapshot: input.snapshot,
    }

    db.filings.push(filing)
    writeDatabase(db)
    return delay(filing)
  },

  /* ---------- เอกสารแนบ ---------- */

  async documents(taxYear?: string): Promise<DocumentRecord[]> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const mine = db.documents
      .filter((d) => d.userId === user.id && (!taxYear || d.taxYear === taxYear))
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    return delay(mine)
  },

  async addDocument(input: {
    taxYear: string
    type: string
    name: string
    size: number
  }): Promise<DocumentRecord> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)

    const record: DocumentRecord = {
      id: randomId('d'),
      userId: user.id,
      taxYear: input.taxYear,
      type: input.type,
      name: input.name,
      size: input.size,
      uploadedAt: new Date().toISOString(),
    }

    db.documents.push(record)
    writeDatabase(db)
    return delay(record)
  },


  /* ---------- สมุดบัญชี ---------- */

  async workspaces(): Promise<Workspace[]> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    return delay(
      db.workspaces
        .filter((w) => w.userId === user.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    )
  },

  async workspace(id: string): Promise<Workspace> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const found = db.workspaces.find((w) => w.id === id && w.userId === user.id)
    if (!found) throw new ApiError('ไม่พบสมุดบัญชีเล่มนี้', 404)
    return delay(found)
  },

  async createWorkspace(input: {
    name: string
    mode: WorkspaceMode
    capital: number
  }): Promise<Workspace> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const name = input.name.trim()
    if (!name) throw new ApiError('กรุณาตั้งชื่อสมุดบัญชี')

    const workspace: Workspace = {
      id: randomId('w'),
      userId: user.id,
      name,
      mode: input.mode,
      capital: Math.max(0, Number(input.capital) || 0),
      createdAt: new Date().toISOString(),
    }
    db.workspaces.push(workspace)
    writeDatabase(db)
    return delay(workspace)
  },

  async updateWorkspace(
    id: string,
    patch: Partial<Pick<Workspace, 'name' | 'capital'>>,
  ): Promise<Workspace> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const found = db.workspaces.find((w) => w.id === id && w.userId === user.id)
    if (!found) throw new ApiError('ไม่พบสมุดบัญชีเล่มนี้', 404)

    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new ApiError('กรุณาตั้งชื่อสมุดบัญชี')
      found.name = name
    }
    if (patch.capital !== undefined) found.capital = Math.max(0, Number(patch.capital) || 0)

    writeDatabase(db)
    return delay(found)
  },

  async deleteWorkspace(id: string): Promise<null> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const index = db.workspaces.findIndex((w) => w.id === id && w.userId === user.id)
    if (index === -1) throw new ApiError('ไม่พบสมุดบัญชีเล่มนี้', 404)

    // ลบรายการและเป้าหมายที่ผูกกับสมุดเล่มนี้ไปด้วย ไม่งั้นจะเหลือข้อมูลกำพร้า
    db.workspaces.splice(index, 1)
    db.entries = db.entries.filter((e) => e.workspaceId !== id)
    db.goals = db.goals.filter((g) => g.workspaceId !== id)

    const orphaned = db.evidence.filter((e) => e.workspaceId === id)
    db.evidence = db.evidence.filter((e) => e.workspaceId !== id)
    writeDatabase(db)
    await fileStore.removeMany(orphaned.map((e) => e.id))
    return delay(null)
  },

  /* ---------- รายการรายรับรายจ่าย ---------- */

  async entries(workspaceId: string): Promise<EntryRecord[]> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    return delay(
      db.entries
        .filter((e) => e.workspaceId === workspaceId && e.userId === user.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    )
  },

  /** รายการของทุกสมุดรวมกัน ใช้ทำแดชบอร์ดโดยไม่ต้องยิงทีละเล่ม */
  async allEntries(): Promise<EntryRecord[]> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    return delay(
      db.entries
        .filter((e) => e.userId === user.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    )
  },

  async addEntry(
    workspaceId: string,
    input: Omit<LedgerEntry, 'id'>,
  ): Promise<EntryRecord> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    if (!db.workspaces.some((w) => w.id === workspaceId && w.userId === user.id)) {
      throw new ApiError('ไม่พบสมุดบัญชีเล่มนี้', 404)
    }
    const amount = Number(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new ApiError('จำนวนเงินต้องมากกว่า 0')
    if (!input.date) throw new ApiError('กรุณาเลือกวันที่ของรายการ')
    if (!input.categoryKey) throw new ApiError('กรุณาเลือกหมวดของรายการ')

    const record: EntryRecord = {
      ...input,
      amount,
      note: (input.note ?? '').trim(),
      id: randomId('e'),
      workspaceId,
      userId: user.id,
    }
    db.entries.push(record)
    writeDatabase(db)
    return delay(record)
  },

  async deleteEntry(id: string): Promise<null> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const index = db.entries.findIndex((e) => e.id === id && e.userId === user.id)
    if (index === -1) throw new ApiError('ไม่พบรายการนี้', 404)
    db.entries.splice(index, 1)

    const attached = db.evidence.filter((e) => e.entryId === id)
    db.evidence = db.evidence.filter((e) => e.entryId !== id)
    writeDatabase(db)
    await fileStore.removeMany(attached.map((e) => e.id))
    return delay(null)
  },


  /* ---------- หลักฐานประกอบรายการ ---------- */

  async evidence(workspaceId: string): Promise<EvidenceRecord[]> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    return delay(
      db.evidence
        .filter((e) => e.workspaceId === workspaceId && e.userId === user.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.uploadedAt.localeCompare(a.uploadedAt)),
    )
  },

  /**
   * บันทึกหลักฐานหนึ่งชิ้น
   * ข้อมูลอธิบายไฟล์เก็บใน localStorage ส่วนตัวไฟล์เก็บใน IndexedDB
   * ถ้าเก็บตัวไฟล์ไม่สำเร็จจะไม่บันทึกข้อมูลอธิบายด้วย เพื่อไม่ให้เหลือรายการที่เปิดดูไม่ได้
   */
  async addEvidence(
    workspaceId: string,
    input: Omit<Evidence, 'id' | 'uploadedAt'>,
    blob: Blob,
  ): Promise<EvidenceRecord> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    if (!db.workspaces.some((w) => w.id === workspaceId && w.userId === user.id)) {
      throw new ApiError('ไม่พบสมุดบัญชีเล่มนี้', 404)
    }
    if (!input.date) throw new ApiError('กรุณาระบุวันที่ของหลักฐาน')

    const id = randomId('ev')
    const stored = await fileStore.put(id, blob)
    if (!stored) {
      throw new ApiError('เบราว์เซอร์นี้เก็บไฟล์แนบไม่ได้ กรุณาลองเบราว์เซอร์อื่นหรือปิดโหมดส่วนตัว')
    }

    const record: EvidenceRecord = {
      ...input,
      note: (input.note ?? '').trim(),
      id,
      workspaceId,
      userId: user.id,
      uploadedAt: new Date().toISOString(),
    }
    db.evidence.push(record)
    writeDatabase(db)
    return delay(record)
  },

  /** ตัวไฟล์จริงสำหรับเปิดดู */
  async evidenceBlob(id: string): Promise<Blob | null> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    if (!db.evidence.some((e) => e.id === id && e.userId === user.id)) return null
    return fileStore.get(id)
  },

  async deleteEvidence(id: string): Promise<null> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const index = db.evidence.findIndex((e) => e.id === id && e.userId === user.id)
    if (index === -1) throw new ApiError('ไม่พบหลักฐานนี้', 404)
    db.evidence.splice(index, 1)
    writeDatabase(db)
    await fileStore.remove(id)
    return delay(null)
  },

  /* ---------- เป้าหมาย ---------- */

  async goals(workspaceId: string): Promise<GoalRecord[]> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    return delay(db.goals.filter((g) => g.workspaceId === workspaceId && g.userId === user.id))
  },

  async addGoal(workspaceId: string, input: Omit<Goal, 'id'>): Promise<GoalRecord> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    if (!db.workspaces.some((w) => w.id === workspaceId && w.userId === user.id)) {
      throw new ApiError('ไม่พบสมุดบัญชีเล่มนี้', 404)
    }
    if (!input.name.trim()) throw new ApiError('กรุณาตั้งชื่อเป้าหมาย')
    const target = Number(input.target)
    if (!Number.isFinite(target) || target <= 0) throw new ApiError('เป้าหมายต้องมากกว่า 0')

    const record: GoalRecord = {
      ...input,
      name: input.name.trim(),
      target,
      id: randomId('g'),
      workspaceId,
      userId: user.id,
    }
    db.goals.push(record)
    writeDatabase(db)
    return delay(record)
  },

  async deleteGoal(id: string): Promise<null> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const index = db.goals.findIndex((g) => g.id === id && g.userId === user.id)
    if (index === -1) throw new ApiError('ไม่พบเป้าหมายนี้', 404)
    db.goals.splice(index, 1)
    writeDatabase(db)
    return delay(null)
  },

  async removeDocument(id: string): Promise<null> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const index = db.documents.findIndex((d) => d.id === id && d.userId === user.id)
    if (index === -1) throw new ApiError('ไม่พบเอกสารที่ต้องการลบ', 404)
    db.documents.splice(index, 1)
    writeDatabase(db)
    return delay(null)
  },
}

/** ล้างข้อมูลจำลองทั้งหมด — ใช้ตอนอยากเริ่มเดโมใหม่ */
export function resetMockDatabase(): void {
  localStorage.removeItem(DB_KEY)
  localStorage.removeItem(TOKEN_KEY)
}
