<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import Mascot from '@/components/Mascot.vue'
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="empty-state">
        <Mascot class="notfound-mascot" :size="110" line="notFound" />
        <span class="ico-big"><AppIcon name="search" :size="26" /></span>
        <h3>ไม่พบหน้าที่คุณกำลังมองหา</h3>
        <p>ลิงก์อาจถูกเปลี่ยนหรือพิมพ์ที่อยู่ไม่ครบ ลองเริ่มจากหน้าแรกหรือเครื่องคำนวณภาษี</p>
        <div class="cta-row" style="justify-content: center">
          <RouterLink class="btn btn-primary" to="/">กลับหน้าแรก</RouterLink>
          <RouterLink class="btn btn-ghost" to="/calculator">เครื่องคำนวณภาษี</RouterLink>
        </div>
      </div>
    </div>
  </main>
</template>
