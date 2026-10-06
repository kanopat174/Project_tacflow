/**
 * ที่เก็บไฟล์แนบของสมุดบัญชี
 *
 * ใช้ IndexedDB ไม่ใช่ localStorage เพราะ localStorage เก็บได้แค่สตริง
 * ต้องแปลงไฟล์เป็น base64 ซึ่งทำให้ใหญ่ขึ้นราว 33% และโควตารวมมีแค่ประมาณ 5MB
 * แค่สลิปไม่กี่ใบก็เต็มแล้ว ส่วน IndexedDB เก็บ Blob ได้ตรง ๆ และโควตาสูงกว่ามาก
 *
 * ทุกฟังก์ชันกลืนข้อผิดพลาดเองและคืนค่าว่าง เพื่อให้หน้าเว็บยังทำงานได้
 * ในเบราว์เซอร์ที่ปิด IndexedDB หรือในโหมดส่วนตัวบางตัว
 */

const DB_NAME = 'taxflow_files'
const DB_VERSION = 1
const STORE = 'evidence'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })

  return dbPromise
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDatabase().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null)
          return
        }
        try {
          const tx = db.transaction(STORE, mode)
          const request = action(tx.objectStore(STORE))
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

export const fileStore = {
  async put(id: string, blob: Blob): Promise<boolean> {
    const result = await run('readwrite', (store) => store.put(blob, id) as IDBRequest<IDBValidKey>)
    return result !== null
  },

  async get(id: string): Promise<Blob | null> {
    const result = await run<Blob>('readonly', (store) => store.get(id) as IDBRequest<Blob>)
    return result instanceof Blob ? result : null
  },

  async remove(id: string): Promise<void> {
    await run('readwrite', (store) => store.delete(id) as unknown as IDBRequest<undefined>)
  },

  /** ลบทีละหลายไฟล์ ใช้ตอนลบรายการหรือลบสมุดทั้งเล่ม */
  async removeMany(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => fileStore.remove(id)))
  },

  async available(): Promise<boolean> {
    return (await openDatabase()) !== null
  },
}
