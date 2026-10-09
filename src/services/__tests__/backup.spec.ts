import { describe, expect, it } from 'vitest'
import { BackupError, dataUrlToBlob, parseBackup, remapBackup, type BackupFile } from '../backup'

function sample(): BackupFile {
  return {
    app: 'taxflow',
    version: 1,
    exportedAt: '2026-10-06T00:00:00.000Z',
    account: { username: 'somchai', fullName: 'สมชาย ใจดี' },
    data: {
      filings: [{ id: 'f1', userId: 'u_old', taxYear: '2567' }],
      documents: [],
      workspaces: [{ id: 'w1', userId: 'u_old', name: 'ส่วนตัว' }],
      entries: [
        { id: 'e1', userId: 'u_old', workspaceId: 'w1', recurringId: 'r1' },
        { id: 'e2', userId: 'u_old', workspaceId: 'w_missing' },
      ],
      goals: [{ id: 'g1', userId: 'u_old', workspaceId: 'w1' }],
      evidence: [
        { id: 'ev1', userId: 'u_old', workspaceId: 'w1', entryId: 'e1' },
        { id: 'ev2', userId: 'u_old', workspaceId: 'w1', entryId: 'e_deleted' },
      ],
      recurring: [{ id: 'r1', userId: 'u_old', workspaceId: 'w1' }],
      challenges: [],
    },
    files: { ev1: 'data:image/png;base64,iVBORw0KGgo=' },
    extras: { draft: null, game: null },
  }
}

describe('ตรวจไฟล์สำรอง', () => {
  it('อ่านไฟล์ที่ถูกต้องได้', () => {
    const parsed = parseBackup(JSON.stringify(sample()))
    expect(parsed.data.entries).toHaveLength(2)
    expect(parsed.files.ev1).toMatch(/^data:image\/png/)
  })

  it('ปฏิเสธไฟล์ที่ไม่ใช่ของ Jodwise หรือคนละรุ่น', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError)
    expect(() => parseBackup('{"app":"other"}')).toThrow('ไม่ใช่ไฟล์สำรองข้อมูลของ Jodwise')
    expect(() => parseBackup(JSON.stringify({ ...sample(), version: 99 }))).toThrow('รุ่น 99')
    const broken = sample() as unknown as { data: { entries: unknown } }
    broken.data.entries = [{ noId: true }]
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('entries')
  })

  it('ทิ้งไฟล์แนบที่ไม่ใช่รูปหรือ PDF', () => {
    const file = sample()
    file.files.ev2 = 'data:text/html;base64,PHNjcmlwdD4='
    expect(Object.keys(parseBackup(JSON.stringify(file)).files)).toEqual(['ev1'])
  })
})

describe('ย้ายข้อมูลเข้าบัญชีปลายทาง', () => {
  let n = 0
  const newId = (prefix: string) => `${prefix}_new${++n}`
  const { data, files } = remapBackup(sample(), 'u_me', newId)

  it('เปลี่ยนเจ้าของและ id ทั้งหมด', () => {
    const all = Object.values(data).flat()
    expect(all.every((r) => r.userId === 'u_me')).toBe(true)
    expect(all.some((r) => ['f1', 'w1', 'e1', 'g1', 'ev1', 'r1'].includes(r.id))).toBe(false)
  })

  it('โยงความสัมพันธ์ไปที่ id ใหม่', () => {
    const ws = data.workspaces[0]!
    const entry = data.entries[0]!
    expect(entry.workspaceId).toBe(ws.id)
    expect(entry.recurringId).toBe(data.recurring[0]!.id)
    expect(data.goals[0]!.workspaceId).toBe(ws.id)
    expect(data.evidence[0]!.entryId).toBe(entry.id)
    // ไฟล์ตาม id ใหม่ของหลักฐาน
    expect(Object.keys(files)).toEqual([data.evidence[0]!.id])
  })

  it('ตัดรายการกำพร้า และหลักฐานที่รายการหายไปกลายเป็นหลักฐานลอย', () => {
    expect(data.entries).toHaveLength(1)
    expect(data.evidence[1]!.entryId).toBeNull()
  })
})

describe('แปลง data URL กลับเป็นไฟล์', () => {
  it('ได้ชนิดและขนาดถูกต้อง', () => {
    const blob = dataUrlToBlob('data:image/png;base64,iVBORw0KGgo=')
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(8)
  })
})
