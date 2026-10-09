/**
 * Service worker ของ Jodwise (จดไว้) — ให้ติดตั้งเป็นแอปและเปิดได้ตอนไม่มีอินเทอร์เน็ต
 *
 * ข้อมูลผู้ใช้อยู่ใน localStorage/IndexedDB ของเบราว์เซอร์อยู่แล้ว ไฟล์นี้จึงแค่เก็บไฟล์ของเว็บไว้
 *  - หน้าเว็บ (navigation): ลองโหลดจากเน็ตก่อน ไม่ได้ค่อยใช้หน้าที่เก็บไว้ จะได้ได้เวอร์ชันใหม่เสมอเมื่อออนไลน์
 *  - ไฟล์ JS/CSS/ฟอนต์/รูป: ใช้ที่เก็บไว้ก่อน แล้วอัปเดตเบื้องหลัง (ไฟล์ของ Vite มี hash ในชื่ออยู่แล้ว)
 *
 * ชื่อแคชมีรหัสบิลด์ต่อท้าย (vite.config.ts แทน __BUILD_ID__ ตอนบิลด์) deploy ใหม่ทุกครั้ง
 * แคชเก่าจึงถูกลบตอน activate ไม่สะสมไฟล์ hash เก่าจนเต็มโควตา
 * เก็บเฉพาะ response ที่ ok — response แบบ opaque ถูกนับโควตาเกินจริง (~7MB ต่อไฟล์ใน Chrome)
 * และหน้า error ต้องไม่กลายเป็นหน้าที่เปิดตอนออฟไลน์
 */
const CACHE = 'jodwise-__BUILD_ID__'
const SHARE_CACHE = 'jodwise-share'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // ไฟล์ที่แชร์มารอให้หน้าเว็บหยิบไปอยู่ใน SHARE_CACHE — ห้ามลบตอนอัปเดตเวอร์ชัน
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/**
 * Web Share Target (Android): แชร์สลิปหรือ e-Tax จากแอปอื่นมาที่ Jodwise
 * เบราว์เซอร์ส่งไฟล์มาเป็น POST — เก็บไว้ใน SHARE_CACHE แล้วพาไปหน้า /share-target ให้แอปหยิบไฟล์ไปอ่าน
 */
async function receiveShare(request) {
  const form = await request.formData()
  const files = form.getAll('files').filter((f) => typeof f !== 'string')
  const cache = await caches.open(SHARE_CACHE)
  for (const key of await cache.keys()) await cache.delete(key)
  await Promise.all(
    files.map((file, i) =>
      cache.put(
        `/shared/${i}`,
        new Response(file, { headers: { 'content-type': file.type, 'x-file-name': encodeURIComponent(file.name) } }),
      ),
    ),
  )
  return Response.redirect(`/share-target?count=${files.length}`, 303)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method === 'POST' && new URL(request.url).pathname === '/share-target') {
    event.respondWith(receiveShare(request))
    return
  }
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  if (!sameOrigin && !isFont) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy))
          }
          return response
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
