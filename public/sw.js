/**
 * Service worker ของ Jodwise (จดไว้) — ให้ติดตั้งเป็นแอปและเปิดได้ตอนไม่มีอินเทอร์เน็ต
 *
 * ข้อมูลผู้ใช้อยู่ใน localStorage/IndexedDB ของเบราว์เซอร์อยู่แล้ว ไฟล์นี้จึงแค่เก็บไฟล์ของเว็บไว้
 *  - หน้าเว็บ (navigation): ลองโหลดจากเน็ตก่อน ไม่ได้ค่อยใช้หน้าที่เก็บไว้ จะได้ได้เวอร์ชันใหม่เสมอเมื่อออนไลน์
 *  - ไฟล์ JS/CSS/ฟอนต์/รูป: ใช้ที่เก็บไว้ก่อน แล้วอัปเดตเบื้องหลัง (ไฟล์ของ Vite มี hash ในชื่ออยู่แล้ว)
 */
const CACHE = 'jodwise-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  if (!sameOrigin && !isFont) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy))
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
          if (response.ok || response.type === 'opaque') {
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
