import './assets/style.css'
import './assets/shell.css'
import './assets/fx.css'
import './assets/mobile.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { initTheme } from './composables/useTheme'
import { setupPwa } from './composables/usePwaInstall'
import { installFx } from './services/fx'
import { installTableLabels } from './services/tableLabels'

// ใส่ธีมและชุดสีที่ผู้ใช้เลือกไว้ก่อนวาดหน้าแรก จะได้ไม่กะพริบเป็นสีตั้งต้น
initTheme()
// ติดตั้งเป็นแอปบนมือถือ/คอมพิวเตอร์ และเปิดได้ตอนไม่มีเน็ต
setupPwa()
// ระลอกคลื่นตอนกดปุ่ม และจำจุดที่กดไว้เป็นจุดตั้งต้นของลูกเล่นอื่น ๆ
installFx()
// มือถือ: ตารางกว้างวางเป็นการ์ดทีละแถว ต้องรู้ชื่อคอลัมน์ของแต่ละช่อง
installTableLabels()

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
