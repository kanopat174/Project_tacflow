<script setup lang="ts">
/** ปลายทางของการแชร์ไฟล์จากแอปอื่น: หยิบไฟล์ที่ service worker เก็บไว้ แล้วเปิดตัวอ่านที่เหมาะสม */
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { planShared, takeSharedFiles } from '@/services/sharedFiles'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'

const router = useRouter()
const ui = useUiStore()
const toast = useToastStore()
const message = ref('กำลังเปิดไฟล์ที่แชร์มา...')

onMounted(async () => {
  try {
    const { single, bulk, ignored } = planShared(await takeSharedFiles())
    await router.replace({ name: 'dashboard' })
    if (bulk.length) ui.openBulkSlips(bulk)
    else if (single) ui.openQuickAdd('', single)
    else {
      toast.error('ไม่พบรูปสลิปหรือไฟล์ PDF ที่ใช้ได้ในสิ่งที่แชร์มา')
      return
    }
    if (ignored) toast.push(`ข้าม ${ignored} ไฟล์ที่ไม่ใช่รูปสลิปหรือ PDF`)
  } catch {
    message.value = 'เปิดไฟล์ที่แชร์มาไม่สำเร็จ ลองแชร์ใหม่อีกครั้ง'
  }
})
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <p class="muted">{{ message }}</p>
    </div>
  </main>
</template>
