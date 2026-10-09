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

import { categoriesOf, type WorkspaceMode } from '@/data/workspaceModes'
import {
  dueRecurringDates,
  type Evidence,
  type Goal,
  type LedgerEntry,
  type LoanRole,
  type LoanTag,
  type RecurringTemplate,
} from './ledgerEngine'
import { fileStore } from './fileStore'
import { sanitizeSlipMeta } from './slipParse'
import { INSTALLMENT_COUNT, canPayInInstallments, type PaymentPlan } from './latePayment'
import {
  backupCounts,
  blobToDataUrl,
  dataUrlToBlob,
  remapBackup,
  type BackupData,
  type BackupFile,
} from './backup'
import { beginActivity, endActivity } from './activity'
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
  /** รูปโปรไฟล์เป็น data URL ที่ย่อแล้ว — ว่างคือยังไม่ตั้งรูป */
  avatarUrl?: string
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
  /** แผนการชำระภาษีที่ต้องจ่ายเพิ่ม (ครั้งเดียวหรือผ่อน 3 งวด) — ไม่มีคือยังไม่ได้ตั้ง */
  payment?: PaymentPlan
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
  /** คำอธิบายสั้น ๆ ของสมุด */
  description?: string
  /** รูปประจำสมุด (วงกลม) เป็น data URL */
  avatarUrl?: string
  /** รูปปกด้านบนของสมุด เป็น data URL */
  coverUrl?: string
  /** งบรายจ่ายต่อเดือนแยกหมวด: คีย์หมวด → จำนวนเงิน */
  budgets?: Record<string, number>
  createdAt: string
}

export type WorkspacePatch = Partial<
  Pick<Workspace, 'name' | 'capital' | 'description' | 'avatarUrl' | 'coverUrl' | 'budgets'>
>

/** ยาวสุดของ data URL รูปที่ยอมให้เก็บ — รูปที่ย่อแล้วจริงเล็กกว่านี้มาก */
const MAX_PHOTO_LENGTH = 600_000
const DESCRIPTION_MAX_LENGTH = 200

/** รูปต้องเป็น data URL ของภาพเท่านั้น ว่างคือลบรูป กันการฝังลิงก์หรือสคริปต์แปลกปลอม */
function checkPhoto(value: string | undefined, label: string): string {
  const url = (value ?? '').trim()
  if (!url) return ''
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(url)) {
    throw new ApiError(`${label}ต้องเป็นไฟล์ภาพ JPG, PNG หรือ WebP`)
  }
  if (url.length > MAX_PHOTO_LENGTH) throw new ApiError(`${label}มีขนาดใหญ่เกินไป`)
  return url
}

export type ChallengeKind = 'week52' | 'daily' | 'nospend'

/** ภารกิจออมเงินของสมุดเล่มหนึ่ง */
export interface ChallengeRecord {
  id: string
  workspaceId: string
  userId: string
  kind: ChallengeKind
  title: string
  /** YYYY-MM-DD */
  startDate: string
  /** ยอดฐาน (52 สัปดาห์) หรือยอดต่อวัน (ออมทุกวัน) */
  amount: number
  /** จำนวนวันของภารกิจ */
  days: number
  /** หมวดที่งดใช้จ่าย (ภารกิจงดใช้จ่าย) */
  categoryKey: string
  /** รอบที่ออมแล้ว: เลขสัปดาห์ หรือวันที่ */
  checkins: string[]
}

export interface RecurringRecord extends RecurringTemplate {
  workspaceId: string
  userId: string
}

export interface EntryRecord extends LedgerEntry {
  /** สร้างจากรายการประจำตัวไหน */
  recurringId?: string
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
  recurring: RecurringRecord[]
  challenges: ChallengeRecord[]
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
  // ทุกคำตอบของ API ผ่านจุดนี้ จึงนับเป็นงานที่กำลังโหลดเพื่อแสดงแถบโหลดด้านบนของเว็บ
  beginActivity()
  return new Promise((resolve) =>
    setTimeout(() => {
      endActivity()
      resolve(value)
    }, LATENCY_MS),
  )
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

const LOAN_ROLES: LoanRole[] = ['lend', 'collect', 'borrow', 'repay']

/** ป้ายเงินยืมต้องมีบทบาทที่รู้จักและชื่อคู่ยืม ไม่งั้นไม่เก็บ */
function sanitizeLoan(loan: unknown): LoanTag | null {
  if (!loan || typeof loan !== 'object') return null
  const { role, party } = loan as Partial<LoanTag>
  const name = typeof party === 'string' ? party.trim().slice(0, 80) : ''
  return role && LOAN_ROLES.includes(role) && name ? { role, party: name } : null
}

/** YYYY-MM-DD ที่มีอยู่จริงในปฏิทิน (กัน 2026-02-31 ซึ่งบางเบราว์เซอร์เลื่อนเป็นมีนาคมให้เอง) */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/* ---------- ฐานข้อมูลจำลองใน localStorage ---------- */

function seedDatabase(): Database {
  const now = new Date().toISOString()
  return {
    users: [
      {
        id: 'u_admin',
        username: 'admin',
        fullName: 'ผู้ดูแลระบบ Jodwise',
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
    recurring: [],
    challenges: [],
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
      parsed.recurring ??= []
      parsed.challenges ??= []
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

/**
 * บันทึกแล้วแจ้งผู้ใช้เมื่อพื้นที่เต็ม — ใช้กับการบันทึกที่มีรูปภาพ
 * ซึ่งมีโอกาสทำให้โควตา localStorage เต็มจริง ไม่งั้นผู้ใช้จะเห็นว่าบันทึกสำเร็จทั้งที่ไม่ได้บันทึก
 */
function writeDatabaseOrThrow(db: Database): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    throw new ApiError('พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม ลองใช้รูปที่เล็กลงหรือลบรูปเดิมออกก่อน', 507)
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

const FILING_STATUSES: FilingStatus[] = ['submitted', 'received', 'reviewing', 'completed']

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

    const avatarUrl = patch.avatarUrl !== undefined ? checkPhoto(patch.avatarUrl, 'รูปโปรไฟล์') : undefined

    Object.assign(user, patch)
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl
    // เก็บเป็นตัวเลขล้วนเสมอ ไม่ว่าผู้ใช้จะพิมพ์ขีดคั่นมาแบบไหน
    if (patch.citizenId !== undefined) user.citizenId = digitsOnly(patch.citizenId)
    if (patch.phone !== undefined) user.phone = digitsOnly(patch.phone)
    writeDatabaseOrThrow(db)
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
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    return delay(mine)
  },

  async filing(reference: string): Promise<Filing> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const found = db.filings.find((f) => f.reference === reference && f.userId === user.id)
    if (!found) throw new ApiError('ไม่พบแบบภาษีตามเลขอ้างอิงนี้', 404)
    return delay({ ...found })
  },

  /**
   * ผู้ใช้อัปเดตความคืบหน้าเอง หลังไปยื่นจริงที่ e-Filing ของกรมสรรพากร
   * ระบบไม่ได้เชื่อมกับกรมสรรพากร จึงไม่เลื่อนสถานะให้เองอีกต่อไป
   */
  async updateFilingStatus(reference: string, status: FilingStatus): Promise<Filing> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    if (!FILING_STATUSES.includes(status)) throw new ApiError('สถานะไม่ถูกต้อง')
    const found = db.filings.find((f) => f.reference === reference && f.userId === user.id)
    if (!found) throw new ApiError('ไม่พบแบบภาษีตามเลขอ้างอิงนี้', 404)
    found.status = status
    writeDatabase(db)
    return delay({ ...found })
  },

  /** ตั้งแผนการชำระ และบันทึกว่างวดไหนจ่ายแล้ว */
  async updatePayment(reference: string, plan: PaymentPlan): Promise<Filing> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const found = db.filings.find((f) => f.reference === reference && f.userId === user.id)
    if (!found) throw new ApiError('ไม่พบแบบภาษีตามเลขอ้างอิงนี้', 404)
    if (found.balance <= 0) throw new ApiError('แบบภาษีนี้ไม่มียอดที่ต้องชำระเพิ่ม')
    if (!['single', 'installments'].includes(plan.mode)) throw new ApiError('รูปแบบการชำระไม่ถูกต้อง')
    if (!['online', 'paper'].includes(plan.channel)) throw new ApiError('ช่องทางยื่นไม่ถูกต้อง')
    if (plan.mode === 'installments' && !canPayInInstallments(found.balance)) {
      throw new ApiError('ผ่อนชำระได้เมื่อภาษีที่ต้องชำระตั้งแต่ 3,000 บาทขึ้นไป')
    }
    const count = plan.mode === 'installments' ? INSTALLMENT_COUNT : 1
    const paidDates = Array.from({ length: count }, (_, i) => plan.paidDates[i] ?? '')
    if (paidDates.some((d) => d && !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new ApiError('วันที่ชำระไม่ถูกต้อง')

    found.payment = { mode: plan.mode, channel: plan.channel, paidDates }
    writeDatabase(db)
    return delay({ ...found })
  },

  async createFiling(input: CreateFilingInput): Promise<Filing> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)

    if (db.filings.some((f) => f.userId === user.id && f.taxYear === input.taxYear)) {
      throw new ApiError(`คุณบันทึกแบบภาษีของปี ${input.taxYear} ไว้แล้ว — ดูได้ที่หน้าประวัติแบบภาษี`, 409)
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

  async updateWorkspace(id: string, patch: WorkspacePatch): Promise<Workspace> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const found = db.workspaces.find((w) => w.id === id && w.userId === user.id)
    if (!found) throw new ApiError('ไม่พบสมุดบัญชีเล่มนี้', 404)

    // ตรวจทุกช่องให้ผ่านก่อนแล้วค่อยเขียนทับ จะได้ไม่บันทึกครึ่ง ๆ กลาง ๆ เมื่อมีช่องที่ผิด
    const next: WorkspacePatch = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new ApiError('กรุณาตั้งชื่อสมุดบัญชี')
      if (name.length > 60) throw new ApiError('ชื่อสมุดบัญชียาวได้ไม่เกิน 60 ตัวอักษร')
      next.name = name
    }
    if (patch.capital !== undefined) {
      const capital = Number(patch.capital)
      if (!Number.isFinite(capital) || capital < 0) {
        throw new ApiError('เงินทุนตั้งต้นต้องเป็น 0 หรือมากกว่า')
      }
      next.capital = Math.round(capital * 100) / 100
    }
    if (patch.description !== undefined) {
      const description = patch.description.trim()
      if (description.length > DESCRIPTION_MAX_LENGTH) {
        throw new ApiError(`คำอธิบายยาวได้ไม่เกิน ${DESCRIPTION_MAX_LENGTH} ตัวอักษร`)
      }
      next.description = description
    }
    if (patch.avatarUrl !== undefined) next.avatarUrl = checkPhoto(patch.avatarUrl, 'รูปสมุดบัญชี')
    if (patch.coverUrl !== undefined) next.coverUrl = checkPhoto(patch.coverUrl, 'รูปปก')
    if (patch.budgets !== undefined) {
      // รับเฉพาะหมวดรายจ่ายของโหมดสมุดนี้ ยอด 0 หรือว่างคือยกเลิกงบของหมวดนั้น
      const expenseKeys = new Set(categoriesOf(found.mode, 'expense').map((c) => c.key))
      const budgets: Record<string, number> = {}
      for (const [key, raw] of Object.entries(patch.budgets)) {
        if (!expenseKeys.has(key)) throw new ApiError('หมวดของงบประมาณไม่ถูกต้อง')
        const amount = Number(raw)
        if (!Number.isFinite(amount) || amount < 0) throw new ApiError('งบประมาณต้องเป็น 0 หรือมากกว่า')
        if (amount > 0) budgets[key] = Math.round(amount * 100) / 100
      }
      next.budgets = budgets
    }

    Object.assign(found, next)
    writeDatabaseOrThrow(db)
    return delay({ ...found })
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
    db.recurring = db.recurring.filter((r) => r.workspaceId !== id)
    db.challenges = db.challenges.filter((c) => c.workspaceId !== id)

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
    // เก็บเป็นวันที่ตามปฏิทินล้วน (ไม่มีเวลา/โซนเวลา) วันที่จึงไม่เลื่อนไม่ว่าเปิดจากโซนเวลาไหน
    if (!isCalendarDate(input.date)) {
      throw new ApiError('วันที่ของรายการไม่ถูกต้อง')
    }
    if (!input.categoryKey) throw new ApiError('กรุณาเลือกหมวดของรายการ')

    const { slip, loan, ...rest } = input
    const record: EntryRecord = {
      ...rest,
      amount,
      note: (input.note ?? '').trim(),
      id: randomId('e'),
      workspaceId,
      userId: user.id,
    }
    // ข้อมูลจากสลิปมาจาก OCR — ตรวจรูปแบบทุกช่องก่อนเก็บ
    const meta = slip === undefined ? undefined : sanitizeSlipMeta(slip)
    if (meta) record.slip = meta
    const loanTag = sanitizeLoan(loan)
    if (loanTag) record.loan = loanTag
    db.entries.push(record)
    writeDatabase(db)
    return delay(record)
  },

  /** เพิ่มหลายรายการในครั้งเดียว (นำเข้า statement) — ตรวจครบทุกแถวก่อน แถวไหนผิดจะไม่บันทึกเลยสักแถว */
  async addEntries(workspaceId: string, inputs: Omit<LedgerEntry, 'id'>[]): Promise<EntryRecord[]> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const ws = db.workspaces.find((w) => w.id === workspaceId && w.userId === user.id)
    if (!ws) throw new ApiError('ไม่พบสมุดบัญชีเล่มนี้', 404)
    if (inputs.length > 5_000) throw new ApiError('นำเข้าได้ครั้งละไม่เกิน 5,000 รายการ')

    const records = inputs.map((input, i): EntryRecord => {
      const amount = Number(input.amount)
      if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(`แถวที่ ${i + 1}: จำนวนเงินต้องมากกว่า 0`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new ApiError(`แถวที่ ${i + 1}: วันที่ไม่ถูกต้อง`)
      if (!categoriesOf(ws.mode, input.type).some((c) => c.key === input.categoryKey)) {
        throw new ApiError(`แถวที่ ${i + 1}: หมวดไม่ตรงกับประเภทรายการ`)
      }
      return {
        ...input,
        amount,
        note: (input.note ?? '').trim().slice(0, 200),
        id: randomId('e'),
        workspaceId,
        userId: user.id,
      }
    })
    db.entries.push(...records)
    writeDatabaseOrThrow(db)
    return delay(records)
  },

  /** แก้รายการที่บันทึกไปแล้ว — หลักฐานที่แนบไว้ยังผูกอยู่กับรายการเดิม ไม่หายไปไหน */
  async updateEntry(id: string, patch: Omit<LedgerEntry, 'id'>): Promise<EntryRecord> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const found = db.entries.find((e) => e.id === id && e.userId === user.id)
    if (!found) throw new ApiError('ไม่พบรายการนี้', 404)
    const amount = Number(patch.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new ApiError('จำนวนเงินต้องมากกว่า 0')
    if (!patch.date) throw new ApiError('กรุณาเลือกวันที่ของรายการ')
    if (!patch.categoryKey) throw new ApiError('กรุณาเลือกหมวดของรายการ')

    // เขียนทับเฉพาะข้อมูลรายการ ช่องเสริมที่ไม่ได้ส่งมาให้ลบออก (เช่นเปลี่ยนจากรายรับเป็นรายจ่าย)
    delete found.withholdingTax
    delete found.vatAmount
    delete found.symbol
    Object.assign(found, { ...patch, amount, note: (patch.note ?? '').trim() })
    writeDatabase(db)
    return delay({ ...found })
  },

  /* ---------- รายการประจำ ---------- */

  async recurring(workspaceId: string): Promise<RecurringRecord[]> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    return delay(db.recurring.filter((r) => r.workspaceId === workspaceId && r.userId === user.id))
  },

  async addRecurring(
    workspaceId: string,
    input: Omit<RecurringTemplate, 'id'>,
  ): Promise<RecurringRecord> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    if (!db.workspaces.some((w) => w.id === workspaceId && w.userId === user.id)) {
      throw new ApiError('ไม่พบสมุดบัญชีเล่มนี้', 404)
    }
    const amount = Number(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new ApiError('จำนวนเงินต้องมากกว่า 0')
    const day = Math.round(Number(input.dayOfMonth))
    if (!(day >= 1 && day <= 31)) throw new ApiError('วันที่ของทุกเดือนต้องอยู่ระหว่าง 1–31')
    if (!/^\d{4}-\d{2}$/.test(input.startMonth)) throw new ApiError('เดือนเริ่มต้นไม่ถูกต้อง')

    const record: RecurringRecord = {
      ...input,
      amount,
      dayOfMonth: day,
      note: (input.note ?? '').trim(),
      id: randomId('r'),
      workspaceId,
      userId: user.id,
    }
    db.recurring.push(record)
    writeDatabase(db)
    return delay(record)
  },

  async deleteRecurring(id: string): Promise<null> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const index = db.recurring.findIndex((r) => r.id === id && r.userId === user.id)
    if (index === -1) throw new ApiError('ไม่พบรายการประจำนี้', 404)
    // ลบแค่ต้นแบบ รายการที่สร้างไปแล้วยังอยู่ในสมุดตามเดิม
    db.recurring.splice(index, 1)
    writeDatabase(db)
    return delay(null)
  },

  /**
   * สร้างรายการจากรายการประจำที่ถึงกำหนดแล้วแต่ยังไม่ได้สร้าง
   * เรียกทุกครั้งที่เปิดสมุด คืนจำนวนรายการที่สร้างใหม่
   */
  async syncRecurring(workspaceId: string, today: string): Promise<number> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    let created = 0
    for (const template of db.recurring) {
      if (template.workspaceId !== workspaceId || template.userId !== user.id) continue
      for (const date of dueRecurringDates(template, today)) {
        db.entries.push({
          id: randomId('e'),
          workspaceId,
          userId: user.id,
          date,
          type: template.type,
          categoryKey: template.categoryKey,
          amount: template.amount,
          note: template.note,
          recurringId: template.id,
        })
        template.lastMonth = date.slice(0, 7)
        created += 1
      }
    }
    if (created) writeDatabase(db)
    return delay(created)
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

  /** เป้าหมายของทุกสมุด ใช้คิดเหรียญรางวัลโดยไม่ต้องยิงทีละเล่ม */
  async allGoals(): Promise<GoalRecord[]> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    return delay(db.goals.filter((g) => g.userId === user.id))
  },

  /* ---------- ภารกิจออมเงิน ---------- */

  async challenges(workspaceId?: string): Promise<ChallengeRecord[]> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    return delay(
      db.challenges.filter((c) => c.userId === user.id && (!workspaceId || c.workspaceId === workspaceId)),
    )
  },

  async addChallenge(
    workspaceId: string,
    input: Pick<ChallengeRecord, 'kind' | 'title' | 'startDate' | 'amount' | 'days' | 'categoryKey'>,
  ): Promise<ChallengeRecord> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const ws = db.workspaces.find((w) => w.id === workspaceId && w.userId === user.id)
    if (!ws) throw new ApiError('ไม่พบสมุดบัญชีเล่มนี้', 404)
    if (!['week52', 'daily', 'nospend'].includes(input.kind)) throw new ApiError('ประเภทภารกิจไม่ถูกต้อง')
    const amount = Number(input.amount)
    const days = Math.round(Number(input.days))
    if (input.kind !== 'nospend' && !(amount > 0)) throw new ApiError('ยอดออมต้องมากกว่า 0')
    if (!(days >= 1 && days <= 400)) throw new ApiError('จำนวนวันต้องอยู่ระหว่าง 1–400 วัน')
    if (input.kind === 'nospend' && !categoriesOf(ws.mode, 'expense').some((c) => c.key === input.categoryKey)) {
      throw new ApiError('กรุณาเลือกหมวดรายจ่ายที่จะงด')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new ApiError('วันเริ่มต้นไม่ถูกต้อง')

    const record: ChallengeRecord = {
      ...input,
      title: input.title.trim() || 'ภารกิจออมเงิน',
      amount: input.kind === 'nospend' ? 0 : amount,
      days: input.kind === 'week52' ? 364 : days,
      categoryKey: input.kind === 'nospend' ? input.categoryKey : '',
      checkins: [],
      id: randomId('c'),
      workspaceId,
      userId: user.id,
    }
    db.challenges.push(record)
    writeDatabase(db)
    return delay(record)
  },

  /** กด "ออมแล้ว" ของรอบนี้ กดซ้ำคือยกเลิก */
  async toggleCheckin(id: string, key: string): Promise<ChallengeRecord> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const found = db.challenges.find((c) => c.id === id && c.userId === user.id)
    if (!found) throw new ApiError('ไม่พบภารกิจนี้', 404)
    found.checkins = found.checkins.includes(key)
      ? found.checkins.filter((k) => k !== key)
      : [...found.checkins, key]
    writeDatabase(db)
    return delay({ ...found, checkins: [...found.checkins] })
  },

  async deleteChallenge(id: string): Promise<null> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const index = db.challenges.findIndex((c) => c.id === id && c.userId === user.id)
    if (index === -1) throw new ApiError('ไม่พบภารกิจนี้', 404)
    db.challenges.splice(index, 1)
    writeDatabase(db)
    return delay(null)
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

/* ---------- สำรองและกู้คืนข้อมูล ---------- */

export const backupApi = {
  /** ข้อมูลทั้งหมดของบัญชีที่ล็อกอินอยู่ พร้อมไฟล์หลักฐาน (ไม่รวมรหัสผ่าน) */
  async exportData(): Promise<Pick<BackupFile, 'account' | 'data' | 'files'>> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const mine = <T extends { userId: string }>(rows: T[]) =>
      rows.filter((r) => r.userId === user.id) as unknown as BackupData[keyof BackupData]
    const data: BackupData = {
      filings: mine(db.filings),
      documents: mine(db.documents),
      workspaces: mine(db.workspaces),
      entries: mine(db.entries),
      goals: mine(db.goals),
      evidence: mine(db.evidence),
      recurring: mine(db.recurring),
      challenges: mine(db.challenges),
    }
    const files: Record<string, string> = {}
    for (const ev of data.evidence) {
      const blob = await fileStore.get(ev.id)
      if (blob) files[ev.id] = await blobToDataUrl(blob)
    }
    return delay({ account: { username: user.username, fullName: user.fullName }, data, files })
  },

  /** แทนที่ข้อมูลทั้งหมดของบัญชีที่ล็อกอินอยู่ด้วยข้อมูลจากไฟล์สำรอง คืนจำนวนรายการที่กู้คืน */
  async importData(backup: BackupFile): Promise<Record<keyof BackupData, number>> {
    const db = readDatabase()
    const user = currentUserOrThrow(db)
    const { data, files } = remapBackup(backup, user.id, randomId)
    // รูปถูกนำไปแสดงเป็น <img src> ต้องผ่านกติกาเดียวกับตอนอัปโหลด ไฟล์ที่ถูกแก้มาให้ตัดรูปทิ้ง
    for (const ws of data.workspaces) {
      for (const field of ['avatarUrl', 'coverUrl'] as const) {
        try {
          ws[field] = checkPhoto(typeof ws[field] === 'string' ? ws[field] : '', '')
        } catch {
          ws[field] = ''
        }
      }
    }

    // เก็บไฟล์ใหม่ให้ได้ก่อน ถ้าพังกลางทางข้อมูลเดิมยังอยู่ครบ
    const stored: string[] = []
    for (const [id, url] of Object.entries(files)) {
      if (!(await fileStore.put(id, dataUrlToBlob(url)))) {
        await fileStore.removeMany(stored)
        throw new ApiError('เบราว์เซอร์นี้เก็บไฟล์หลักฐานไม่ได้ ลองปิดโหมดส่วนตัวแล้วกู้คืนใหม่')
      }
      stored.push(id)
    }

    const oldEvidence = db.evidence.filter((e) => e.userId === user.id).map((e) => e.id)
    const others = <T extends { userId: string }>(rows: T[]) => rows.filter((r) => r.userId !== user.id)
    db.filings = [...others(db.filings), ...(data.filings as unknown as Filing[])]
    db.documents = [...others(db.documents), ...(data.documents as unknown as DocumentRecord[])]
    db.workspaces = [...others(db.workspaces), ...(data.workspaces as unknown as Workspace[])]
    db.entries = [...others(db.entries), ...(data.entries as unknown as EntryRecord[])]
    db.goals = [...others(db.goals), ...(data.goals as unknown as GoalRecord[])]
    db.evidence = [...others(db.evidence), ...(data.evidence as unknown as EvidenceRecord[])]
    db.recurring = [...others(db.recurring), ...(data.recurring as unknown as RecurringRecord[])]
    db.challenges = [...others(db.challenges), ...(data.challenges as unknown as ChallengeRecord[])]
    try {
      writeDatabaseOrThrow(db)
    } catch (error) {
      await fileStore.removeMany(stored)
      throw error
    }
    await fileStore.removeMany(oldEvidence)
    return delay(backupCounts(data))
  },
}

/** ล้างข้อมูลจำลองทั้งหมด — ใช้ตอนอยากเริ่มเดโมใหม่ */
export function resetMockDatabase(): void {
  localStorage.removeItem(DB_KEY)
  localStorage.removeItem(TOKEN_KEY)
}
