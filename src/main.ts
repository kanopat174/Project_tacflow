import './assets/style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { initTheme } from './composables/useTheme'
import { setupPwa } from './composables/usePwaInstall'

// ใส่ธีมและชุดสีที่ผู้ใช้เลือกไว้ก่อนวาดหน้าแรก จะได้ไม่กะพริบเป็นสีตั้งต้น
initTheme()
// ติดตั้งเป็นแอปบนมือถือ/คอมพิวเตอร์ และเปิดได้ตอนไม่มีเน็ต
setupPwa()

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
