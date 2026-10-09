/**
 * ไฟล์สำรองข้อมูลของผู้ใช้ — ฟังก์ชันบริสุทธิ์สำหรับตรวจรูปแบบและย้ายข้อมูลเข้าบัญชีปลายทาง
 *
 * ยังไม่มี backend ข้อมูลทั้งหมดอยู่ในเบราว์เซอร์เครื่องเดียว ไฟล์นี้จึงเป็นทางเดียวที่จะย้ายเครื่อง
 * หรือกันข้อมูลหายตอนล้างเบราว์เซอร์ การตัดสินใจสำคัญ:
 *  - กู้คืนแบบแทนที่ข้อมูลเดิมของบัญชีที่ล็อกอินอยู่ทั้งหมด ไม่รวมกับของเดิม (รวมแล้วจะได้รายการซ้ำ)
 *  - สร้าง id ใหม่ทุกชิ้นแล้วโยงความสัมพันธ์ให้ใหม่ จะได้กู้เข้าบัญชีอื่นในเบราว์เซอร์เดียวกันได้
 *    โดย id ไม่ชนกับข้อมูลของบัญชีต้นทางที่ยังอยู่
 *  - ไม่เก็บรหัสผ่านและไม่แก้ข้อมูลส่วนตัวของบัญชีปลายทาง
 */

export const BACKUP_APP = 'taxflow'
export const BACKUP_VERSION = 1

type Row = Record<string, unknown> & { id: string }

export interface BackupData {
  filings: Row[]
  documents: Row[]
  workspaces: Row[]
  entries: Row[]
  goals: Row[]
  evidence: Row[]
  recurring: Row[]
  challenges: Row[]
}

export const BACKUP_COLLECTIONS: (keyof BackupData)[] = [
  'filings',
  'documents',
  'workspaces',
  'entries',
  'goals',
  'evidence',
  'recurring',
  'challenges',
]

export interface BackupFile {
  app: typeof BACKUP_APP
  version: typeof BACKUP_VERSION
  exportedAt: string
  /** บัญชีต้นทาง ใช้แสดงให้ผู้ใช้ยืนยันก่อนกู้คืนเท่านั้น */
  account: { username: string; fullName: string }
  data: BackupData
  /** ไฟล์หลักฐาน: id ของหลักฐาน → data URL */
  files: Record<string, string>
  /** ข้อมูลเสริมในเครื่อง: แบบร่างแบบภาษี และความคืบหน้าของเกม (เก็บเป็นข้อความ JSON ตามเดิม) */
  extras: { draft: string | null; game: string | null }
}

export class BackupError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** ตรวจว่าเป็นไฟล์สำรองของ Jodwise ที่อ่านได้ — ไม่ผ่านให้โยน BackupError พร้อมเหตุผลภาษาไทย */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('ไฟล์นี้ไม่ใช่ JSON')
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP) throw new BackupError('ไฟล์นี้ไม่ใช่ไฟล์สำรองข้อมูลของ Jodwise')
  if (raw.version !== BACKUP_VERSION) throw new BackupError(`ไฟล์สำรองรุ่น ${String(raw.version)} ใช้กับเว็บรุ่นนี้ไม่ได้`)
  if (!isObject(raw.data)) throw new BackupError('ไฟล์สำรองไม่มีข้อมูล')

  const data = {} as BackupData
  for (const key of BACKUP_COLLECTIONS) {
    const list = raw.data[key] ?? []
    if (!Array.isArray(list) || !list.every((r) => isObject(r) && typeof r.id === 'string')) {
      throw new BackupError(`ข้อมูลส่วน ${key} เสียหาย`)
    }
    data[key] = list as Row[]
  }

  const files: Record<string, string> = {}
  if (isObject(raw.files)) {
    for (const [id, url] of Object.entries(raw.files)) {
      // รับเฉพาะชนิดที่หน้าหลักฐานรับอัปโหลด — blob URL ใช้ origin เดียวกับเว็บ ห้ามปล่อย HTML/SVG เข้ามา
      if (typeof url === 'string' && /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(url)) {
        files[id] = url
      }
    }
  }
  const extras = isObject(raw.extras) ? raw.extras : {}
  const account = isObject(raw.account) ? raw.account : {}

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    account: {
      username: typeof account.username === 'string' ? account.username : '',
      fullName: typeof account.fullName === 'string' ? account.fullName : '',
    },
    data,
    files,
    extras: {
      draft: typeof extras.draft === 'string' ? extras.draft : null,
      game: typeof extras.game === 'string' ? extras.game : null,
    },
  }
}

export interface RemappedBackup {
  data: BackupData
  /** ไฟล์หลักฐานที่ใช้ id ใหม่แล้ว */
  files: Record<string, string>
}

/**
 * สร้าง id ใหม่และเปลี่ยนเจ้าของเป็นบัญชีปลายทาง
 * รายการที่อ้างถึงสมุดที่ไม่มีในไฟล์จะถูกตัดทิ้ง ไม่งั้นจะกลายเป็นข้อมูลกำพร้าที่เปิดดูไม่ได้
 */
export function remapBackup(backup: BackupFile, userId: string, newId: (prefix: string) => string): RemappedBackup {
  const { data } = backup
  const workspaceIds = new Map(data.workspaces.map((w) => [w.id, newId('w')]))
  const entryIds = new Map(data.entries.map((e) => [e.id, newId('e')]))
  const recurringIds = new Map(data.recurring.map((r) => [r.id, newId('r')]))
  const evidenceIds = new Map(data.evidence.map((e) => [e.id, newId('ev')]))

  const own = <T extends Row>(row: T, id: string): T => ({ ...row, id, userId })
  const inWorkspace = (row: Row) => workspaceIds.has(String(row.workspaceId))
  const withWorkspace = <T extends Row>(row: T, id: string): T => ({
    ...own(row, id),
    workspaceId: workspaceIds.get(String(row.workspaceId)),
  })

  const remapped: BackupData = {
    filings: data.filings.map((f) => own(f, newId('f'))),
    documents: data.documents.map((d) => own(d, newId('d'))),
    workspaces: data.workspaces.map((w) => own(w, workspaceIds.get(w.id)!)),
    entries: data.entries.filter(inWorkspace).map((e) => {
      const row = withWorkspace(e, entryIds.get(e.id)!)
      if (typeof e.recurringId === 'string') {
        if (recurringIds.has(e.recurringId)) row.recurringId = recurringIds.get(e.recurringId)
        else delete row.recurringId
      }
      return row
    }),
    goals: data.goals.filter(inWorkspace).map((g) => withWorkspace(g, newId('g'))),
    evidence: data.evidence.filter(inWorkspace).map((e) => ({
      ...withWorkspace(e, evidenceIds.get(e.id)!),
      // หลักฐานที่ไม่ผูกรายการ หรือรายการถูกลบไปแล้ว ให้เป็นหลักฐานลอย
      entryId: typeof e.entryId === 'string' ? (entryIds.get(e.entryId) ?? null) : null,
    })),
    recurring: data.recurring.filter(inWorkspace).map((r) => withWorkspace(r, recurringIds.get(r.id)!)),
    challenges: data.challenges.filter(inWorkspace).map((c) => withWorkspace(c, newId('c'))),
  }

  const files: Record<string, string> = {}
  for (const [oldId, url] of Object.entries(backup.files)) {
    const id = evidenceIds.get(oldId)
    if (id) files[id] = url
  }
  return { data: remapped, files }
}

/** สรุปจำนวนข้อมูลในไฟล์ ใช้แสดงก่อนยืนยันกู้คืน */
export function backupCounts(data: BackupData): Record<keyof BackupData, number> {
  return Object.fromEntries(BACKUP_COLLECTIONS.map((k) => [k, data[k].length])) as Record<keyof BackupData, number>
}

/* ---------- แปลงไฟล์ ---------- */

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function dataUrlToBlob(url: string): Blob {
  const [head, body = ''] = url.split(',', 2)
  const mime = head!.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream'
  const bytes = atob(body)
  const buffer = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i)
  return new Blob([buffer], { type: mime })
}
