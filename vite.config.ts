import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * ใส่รหัสบิลด์แทน __BUILD_ID__ ใน dist/sw.js ให้ชื่อแคชของ service worker เปลี่ยนเมื่อไฟล์ในบิลด์เปลี่ยน
 * รหัสมาจาก hash ของชื่อไฟล์ทั้งหมดในบิลด์ บิลด์ที่เหมือนเดิมจึงได้รหัสเดิม แคชไม่ถูกล้างโดยไม่จำเป็น
 */
function swBuildId(): Plugin {
  let outDir = 'dist'
  let buildId = ''
  return {
    name: 'sw-build-id',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    generateBundle(_options, bundle) {
      buildId = createHash('sha256').update(Object.keys(bundle).sort().join('\n')).digest('hex').slice(0, 10)
    },
    closeBundle() {
      const file = resolve(outDir, 'sw.js')
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__BUILD_ID__', buildId))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    swBuildId(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
