<script setup lang="ts">
/** เช็กลิสต์เอกสารตามรายการที่กรอกในแบบ พร้อมติ๊กให้เมื่อแนบไฟล์ประเภทนั้นไว้แล้ว */
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { buildChecklist } from '@/data/documentChecklist'
import { api, type DocumentRecord } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useFilingStore } from '@/stores/filing'

const filing = useFilingStore()
const auth = useAuthStore()
const documents = ref<DocumentRecord[]>([])

async function load() {
  if (!auth.isLoggedIn) return
  try {
    documents.value = await api.documents(filing.taxpayer.taxYear)
  } catch {
    documents.value = []
  }
}
onMounted(load)
watch(() => filing.taxpayer.taxYear, load)

const items = computed(() =>
  buildChecklist(filing.result, {
    withholdingTax: filing.withholdingTax,
    actualExpenseKeys: Object.keys(filing.taxOptions.actualExpenses),
  }).map((item) => ({ ...item, done: documents.value.some((d) => d.type === item.docType) })),
)
const doneCount = computed(() => items.value.filter((i) => i.done).length)
</script>

<template>
  <section v-if="items.length" class="card doc-checklist">
    <div class="card-head">
      <div>
        <h3>เอกสารที่ต้องเก็บไว้</h3>
        <p>ตามรายการที่ใช้สิทธิในแบบนี้ สรรพากรเรียกตรวจย้อนหลังได้ · แนบแล้ว {{ doneCount }} จาก {{ items.length }}</p>
      </div>
      <RouterLink class="btn btn-ghost btn-sm" to="/documents">ไปหน้าเอกสาร</RouterLink>
    </div>
    <ul>
      <li v-for="item in items" :key="item.id" :class="{ done: item.done }">
        <span class="check-dot" aria-hidden="true">
          <AppIcon v-if="item.done" name="check" :size="14" />
        </span>
        <span>
          <strong>{{ item.title }}</strong>
          <small>{{ item.detail }}</small>
          <small class="because">เพราะใช้สิทธิ: {{ item.because }}</small>
        </span>
        <span class="sr-only">{{ item.done ? 'แนบแล้ว' : 'ยังไม่ได้แนบ' }}</span>
      </li>
    </ul>
  </section>
</template>
