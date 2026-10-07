<script setup lang="ts">
/** คำศัพท์ภาษีทั้งหมดในหน้าเดียว ค้นหาได้ */
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { GLOSSARY } from '@/data/glossary'

const query = ref('')
const terms = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return GLOSSARY
  return GLOSSARY.filter((t) => `${t.term} ${t.short} ${t.example ?? ''}`.toLowerCase().includes(q))
})
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">ภาษีแบบภาษาคน</span>
        <h2>คำศัพท์ภาษี</h2>
        <p>คำที่เจอบ่อยตอนยื่นภาษี อธิบายสั้น ๆ พร้อมตัวอย่าง — คำที่มีเส้นประใต้ในเว็บแตะดูคำอธิบายได้ทันที</p>
      </div>

      <div class="field mb-3" style="max-width: 420px">
        <label for="glossary-search" class="sr-only">ค้นหาคำศัพท์</label>
        <input id="glossary-search" v-model="query" type="search" placeholder="ค้นหา เช่น ลดหย่อน, 50 ทวิ" />
      </div>

      <div v-if="!terms.length" class="empty-state">
        <span class="ico-big"><AppIcon name="search" :size="26" /></span>
        <h3>ไม่พบคำที่ค้นหา</h3>
      </div>

      <div class="glossary-grid">
        <article v-for="t in terms" :id="t.key" :key="t.key" class="card">
          <h3>{{ t.term }}</h3>
          <p>{{ t.short }}</p>
          <p v-if="t.example" class="small muted">ตัวอย่าง: {{ t.example }}</p>
          <RouterLink v-if="t.to" :to="t.to" class="small">ไปที่หน้าที่เกี่ยวข้อง →</RouterLink>
        </article>
      </div>
    </div>
  </main>
</template>

<style scoped>
.glossary-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
}
.glossary-grid .card {
  margin: 0;
}
.glossary-grid h3 {
  margin: 0 0 6px;
}
</style>
