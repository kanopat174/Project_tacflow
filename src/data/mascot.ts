/**
 * ตัวการ์ตูนของธีมน่ารัก 6 ตัว — แต่ละตัวมีรูป คำพูด ลายพื้นหลัง และฟอนต์หัวข้อของตัวเอง
 *
 * รูปเก็บเป็นสตริง SVG ใช้ได้สองแบบ
 *  - วาดตรง ๆ ในคอมโพเนนต์ Mascot.vue (แดชบอร์ด หน้า 404 ตัวอย่างในเมนูเลือกธีม)
 *  - แปลงเป็น data URL ใส่ในตัวแปร CSS `--mascot` ให้หน้าว่างทุกหน้าใช้แทนไอคอนได้โดยไม่ต้องแก้ทีละหน้า
 * สีเป็นค่าคงที่ เพราะรูปจาก data URL อ่านตัวแปร CSS ของหน้าไม่ได้
 * ทุกตัววาดบน viewBox 120×120 เส้นขอบสีเดียวกัน หน้าตาจึงเป็นชุดเดียวกัน
 */

export type MascotKey = 'piggy' | 'cat' | 'bear' | 'bunny' | 'frog' | 'chick'

const INK = '#5b3a4a'
const EYE = '#3b2733'

/* ---------- ชิ้นส่วนที่ใช้ร่วมกัน ---------- */

const shadow = '<ellipse cx="60" cy="110" rx="34" ry="5" fill="#000" opacity=".08"/>'

function eyes(y: number, gap = 16, r = 5): string {
  const l = 60 - gap
  const rr = 60 + gap
  return `<circle cx="${l}" cy="${y}" r="${r}" fill="${EYE}"/><circle cx="${rr}" cy="${y}" r="${r}" fill="${EYE}"/>
  <circle cx="${l + 1.8}" cy="${y - 1.8}" r="1.8" fill="#fff"/><circle cx="${rr + 1.8}" cy="${y - 1.8}" r="1.8" fill="#fff"/>`
}

function blush(y: number, gap = 26, color = '#ff8fb3'): string {
  return `<ellipse cx="${60 - gap}" cy="${y}" rx="6" ry="3.6" fill="${color}" opacity=".6"/>
  <ellipse cx="${60 + gap}" cy="${y}" rx="6" ry="3.6" fill="${color}" opacity=".6"/>`
}

function smile(y: number, w = 6): string {
  return `<path d="M${60 - w} ${y} q${w} ${w * 0.8} ${w * 2} 0" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`
}

const coin = (x: number, y: number) => `<g transform="translate(${x} ${y})">
  <circle r="10" fill="#ffd866" stroke="#b8860b" stroke-width="2.5"/>
  <text y="4.5" text-anchor="middle" font-size="12" font-weight="700" font-family="sans-serif" fill="#8a5a00">฿</text>
</g>`

const wrap = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${shadow}${body}</svg>`

/* ---------- ตัวการ์ตูน ---------- */

const PIGGY = wrap(`
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
    <rect x="34" y="88" width="12" height="16" rx="6" fill="#ffb3cb"/>
    <rect x="74" y="88" width="12" height="16" rx="6" fill="#ffb3cb"/>
    <path d="M36 34 L30 16 L50 26 Z" fill="#ffb3cb"/>
    <path d="M84 34 L90 16 L70 26 Z" fill="#ffb3cb"/>
    <ellipse cx="60" cy="62" rx="40" ry="34" fill="#ffc9da"/>
    <path d="M98 66 q10 -2 8 -10" fill="none"/>
    <rect x="50" y="29" width="20" height="5" rx="2.5" fill="${INK}"/>
    <ellipse cx="60" cy="70" rx="13" ry="9.5" fill="#ff9fbf"/>
  </g>
  <ellipse cx="55" cy="70" rx="2.6" ry="3.4" fill="${INK}"/>
  <ellipse cx="65" cy="70" rx="2.6" ry="3.4" fill="${INK}"/>
  ${eyes(55)}
  ${smile(83)}
  ${blush(66)}
  ${coin(60, 12)}
`)

const CAT = wrap(`
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
    <path d="M28 46 L30 14 L54 34 Z" fill="#ffcf9e"/>
    <path d="M92 46 L90 14 L66 34 Z" fill="#ffcf9e"/>
    <ellipse cx="60" cy="66" rx="42" ry="36" fill="#ffdcb6"/>
    <path d="M60 30 v10 M50 31 l3 9 M70 31 l-3 9" fill="none"/>
    <rect x="36" y="96" width="16" height="11" rx="5.5" fill="#ffdcb6"/>
    <rect x="68" y="96" width="16" height="11" rx="5.5" fill="#ffdcb6"/>
  </g>
  <path d="M33 22 L35 36 L45 30 Z" fill="#ffb3cb"/>
  <path d="M87 22 L85 36 L75 30 Z" fill="#ffb3cb"/>
  ${eyes(62, 17)}
  <path d="M56 72 h8 l-4 4 Z" fill="#ff8fb3" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M60 76 q-4 6 -9 3 M60 76 q4 6 9 3" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
  <g stroke="${INK}" stroke-width="2" stroke-linecap="round">
    <path d="M24 70 l14 2 M24 79 l14 -2 M96 70 l-14 2 M96 79 l-14 -2"/>
  </g>
  ${blush(74, 28)}
  ${coin(98, 96)}
`)

const BEAR = wrap(`
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <circle cx="28" cy="34" r="14" fill="#c99366"/>
    <circle cx="92" cy="34" r="14" fill="#c99366"/>
    <circle cx="60" cy="66" r="40" fill="#d9a77a"/>
    <ellipse cx="60" cy="78" rx="18" ry="14" fill="#f6dcc0"/>
  </g>
  <circle cx="28" cy="34" r="7" fill="#f3cfa9"/>
  <circle cx="92" cy="34" r="7" fill="#f3cfa9"/>
  ${eyes(60, 17)}
  <ellipse cx="60" cy="72" rx="6" ry="4.5" fill="${EYE}"/>
  <path d="M60 76 v4 M60 80 q-5 5 -9 1 M60 80 q5 5 9 1" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
  ${blush(74, 30, '#ff9f8f')}
  <g transform="translate(96 92)">
    <path d="M-10 -8 h20 v14 a8 8 0 0 1 -8 8 h-4 a8 8 0 0 1 -8 -8 Z" fill="#ffd866" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M-11 -9 h22" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M-4 2 q4 -5 8 0" fill="none" stroke="#b8860b" stroke-width="2" stroke-linecap="round"/>
  </g>
`)

const BUNNY = wrap(`
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <ellipse cx="44" cy="26" rx="10" ry="24" fill="#fff6f8" transform="rotate(-10 44 26)"/>
    <ellipse cx="76" cy="26" rx="10" ry="24" fill="#fff6f8" transform="rotate(10 76 26)"/>
    <ellipse cx="60" cy="72" rx="38" ry="32" fill="#fff6f8"/>
  </g>
  <ellipse cx="44" cy="27" rx="4.5" ry="16" fill="#ffc2d4" transform="rotate(-10 44 27)"/>
  <ellipse cx="76" cy="27" rx="4.5" ry="16" fill="#ffc2d4" transform="rotate(10 76 27)"/>
  ${eyes(68, 15)}
  <ellipse cx="60" cy="77" rx="4" ry="3" fill="#ff8fb3"/>
  <path d="M60 80 v3 M60 83 q-4 4 -7 1 M60 83 q4 4 7 1" fill="none" stroke="${INK}" stroke-width="2.3" stroke-linecap="round"/>
  <rect x="57" y="85" width="6" height="5" rx="1.5" fill="#fff" stroke="${INK}" stroke-width="1.8"/>
  ${blush(80, 25)}
  <g transform="translate(98 94)">
    <path d="M0 -12 l0 -6 M-4 -16 q4 2 8 0" stroke="#4f9a4a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M-7 -12 q7 -4 14 0 l-5 22 q-2 3 -4 0 Z" fill="#ff9f4a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  </g>
`)

const FROG = wrap(`
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <circle cx="38" cy="38" r="15" fill="#a8e0a0"/>
    <circle cx="82" cy="38" r="15" fill="#a8e0a0"/>
    <ellipse cx="60" cy="72" rx="46" ry="32" fill="#a8e0a0"/>
    <ellipse cx="60" cy="84" rx="28" ry="14" fill="#e6f7d9"/>
  </g>
  <circle cx="38" cy="38" r="9" fill="#fff"/>
  <circle cx="82" cy="38" r="9" fill="#fff"/>
  <circle cx="39" cy="39" r="5" fill="${EYE}"/>
  <circle cx="83" cy="39" r="5" fill="${EYE}"/>
  <circle cx="40.6" cy="37.4" r="1.6" fill="#fff"/>
  <circle cx="84.6" cy="37.4" r="1.6" fill="#fff"/>
  <path d="M38 68 q22 16 44 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  ${blush(70, 34)}
  <path d="M52 60 h2 M66 60 h2" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
  ${coin(60, 86)}
`)

const CHICK = wrap(`
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
    <path d="M56 22 q2 -10 8 -6 q-2 4 2 8" fill="#ffe27a"/>
    <path d="M24 72 q-10 4 -8 16 q8 -2 14 -8" fill="#ffd34d"/>
    <path d="M96 72 q10 4 8 16 q-8 -2 -14 -8" fill="#ffd34d"/>
    <ellipse cx="60" cy="66" rx="38" ry="40" fill="#ffe27a"/>
    <path d="M48 104 v6 M44 110 h8 M72 104 v6 M68 110 h8" fill="none" stroke="#e88a1a"/>
    <path d="M52 66 l8 7 l8 -7 Z" fill="#ffad3b"/>
  </g>
  ${eyes(56, 14, 4.6)}
  ${blush(70, 26, '#ff9f6b')}
`)

export interface MascotDefinition {
  key: MascotKey
  label: string
  svg: string
  /** คำพูดบนแดชบอร์ด */
  greeting: string
  /** คำพูดในหน้า 404 */
  notFound: string
  /** ลายพื้นหลังเป็น data URL */
  pattern: string
  /** ชื่อลายสำหรับแสดงในเมนู */
  patternLabel: string
  /** ตำแหน่งบนรูป ใช้วางของแต่งตัวและหน้าตาตามอารมณ์ให้ตรงกับรูปร่างของแต่ละตัว */
  anchors: MascotAnchors
}

export interface MascotAnchors {
  /** ขอบบนของหัว (วางหมวก มงกุฎ โบว์) */
  headTop: number
  eyeY: number
  /** ระยะจากกึ่งกลางถึงตาแต่ละข้าง */
  eyeGap: number
  eyeR: number
  /** ระดับคอ (วางผ้าพันคอ) และความกว้าง */
  neckY: number
  neckW: number
  /** สีตัว ใช้วาดเปลือกตาตอนง่วง */
  body: string
}

/** ลายพื้นหลังเล็ก ๆ วาดเป็นไทล์ สีโปร่งจึงเข้ากับทุกชุดสี */
const tile = (size: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`,
  )}")`

const TINT = 'fill="#8a6a7a" fill-opacity=".14"'

const PATTERNS = {
  dots: tile(24, `<circle cx="12" cy="12" r="1.8" ${TINT}/>`),
  paws: tile(
    44,
    `<g ${TINT} transform="rotate(-15 22 22)"><ellipse cx="22" cy="26" rx="5" ry="4"/><circle cx="16" cy="20" r="2"/><circle cx="20" cy="17" r="2"/><circle cx="25" cy="17" r="2"/><circle cx="29" cy="20" r="2"/></g>`,
  ),
  hearts: tile(36, `<path ${TINT} d="M18 25 l-6 -6 a3.6 3.6 0 0 1 6 -4 a3.6 3.6 0 0 1 6 4 Z"/>`),
  flowers: tile(
    40,
    `<g ${TINT}><circle cx="20" cy="15" r="3.2"/><circle cx="25" cy="19" r="3.2"/><circle cx="23" cy="25" r="3.2"/><circle cx="17" cy="25" r="3.2"/><circle cx="15" cy="19" r="3.2"/></g><circle cx="20" cy="20.5" r="2.2" fill="#e8b84a" fill-opacity=".25"/>`,
  ),
  lilypads: tile(46, `<path ${TINT} d="M23 13 a10 10 0 1 0 8 4 l-8 6 Z"/>`),
  stars: tile(
    38,
    `<path ${TINT} d="M19 11 l2.4 5.2 l5.6 .6 l-4.2 3.8 l1.2 5.6 l-5 -2.9 l-5 2.9 l1.2 -5.6 l-4.2 -3.8 l5.6 -.6 Z"/>`,
  ),
}

export const MASCOTS: MascotDefinition[] = [
  {
    key: 'piggy',
    label: 'น้องออมสิน',
    svg: PIGGY,
    greeting: 'วันนี้มาดูเงินกันนะ!',
    notFound: 'หลงทางเหรอ? ไปทางนี้เลย',
    pattern: PATTERNS.dots,
    patternLabel: 'จุดกลม',
    anchors: { headTop: 28, eyeY: 55, eyeGap: 16, eyeR: 5, neckY: 92, neckW: 52, body: '#ffc9da' },
  },
  {
    key: 'cat',
    label: 'น้องเหมียว',
    svg: CAT,
    greeting: 'เมี้ยว~ เก็บใบเสร็จไว้ครบหรือยัง?',
    notFound: 'เมี้ยว? หน้านี้ไม่มีนะ',
    pattern: PATTERNS.paws,
    patternLabel: 'รอยเท้าแมว',
    anchors: { headTop: 31, eyeY: 62, eyeGap: 17, eyeR: 5, neckY: 99, neckW: 56, body: '#ffdcb6' },
  },
  {
    key: 'bear',
    label: 'น้องหมีเนย',
    svg: BEAR,
    greeting: 'ออมทีละนิด หวานเหมือนน้ำผึ้ง!',
    notFound: 'หมีหาไม่เจอเลย กลับหน้าแรกกัน',
    pattern: PATTERNS.hearts,
    patternLabel: 'หัวใจ',
    anchors: { headTop: 26, eyeY: 60, eyeGap: 17, eyeR: 5, neckY: 103, neckW: 50, body: '#d9a77a' },
  },
  {
    key: 'bunny',
    label: 'น้องกระต่าย',
    svg: BUNNY,
    greeting: 'กระโดดไปวางแผนภาษีกัน!',
    notFound: 'กระโดดผิดทางแล้วล่ะ',
    pattern: PATTERNS.flowers,
    patternLabel: 'ดอกไม้',
    anchors: { headTop: 40, eyeY: 68, eyeGap: 15, eyeR: 5, neckY: 101, neckW: 48, body: '#fff6f8' },
  },
  {
    key: 'frog',
    label: 'น้องกบ',
    svg: FROG,
    greeting: 'อ๊บ ๆ ลดหย่อนครบหรือยัง?',
    notFound: 'อ๊บ? กระโดดหาไม่เจอ',
    pattern: PATTERNS.lilypads,
    patternLabel: 'ใบบัว',
    anchors: { headTop: 23, eyeY: 39, eyeGap: 22, eyeR: 9, neckY: 101, neckW: 62, body: '#a8e0a0' },
  },
  {
    key: 'chick',
    label: 'น้องเจี๊ยบ',
    svg: CHICK,
    greeting: 'เจี๊ยบ ๆ วันนี้ใช้เงินไปเท่าไรน้า?',
    notFound: 'เจี๊ยบหลงทางเหมือนกัน!',
    pattern: PATTERNS.stars,
    patternLabel: 'ดาว',
    anchors: { headTop: 26, eyeY: 56, eyeGap: 14, eyeR: 4.6, neckY: 86, neckW: 50, body: '#ffe27a' },
  },
]

export const DEFAULT_MASCOT: MascotKey = 'piggy'

export function findMascot(key: unknown): MascotDefinition {
  return MASCOTS.find((m) => m.key === key) ?? MASCOTS[0]!
}

export function isMascotKey(value: unknown): value is MascotKey {
  return MASCOTS.some((m) => m.key === value)
}

export function mascotDataUrl(key: MascotKey): string {
  return `url("data:image/svg+xml,${encodeURIComponent(findMascot(key).svg)}")`
}
