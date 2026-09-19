<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { ApiError } from '@/services/api'
import { formatBaht } from '@/services/taxEngine'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const ledger = useLedgerStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

async function load(id: string) {
  try {
    await ledger.open(id)
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'เปิดสมุดบัญชีไม่สำเร็จ')
    router.push('/workspaces')
  }
}

onMounted(() => load(String(route.params.id)))
// เปลี่ยนสมุดจากลิงก์อื่นโดยไม่ผ่านการ mount ใหม่ ต้องโหลดข้อมูลใหม่ด้วย
watch(() => route.params.id, (id) => id && load(String(id)))
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head no-print">
        <RouterLink to="/workspaces" class="small">
          <AppIcon name="arrowLeft" :size="15" />
          สมุดทั้งหมด
        </RouterLink>
        <h2>{{ ledger.active?.name ?? 'กำลังโหลด...' }}</h2>
        <p>
          โหมด{{ ledger.definition.label }} ·
          {{ ledger.definition.capitalLabel }} {{ formatBaht(ledger.capital) }} ·
          บันทึกแล้ว {{ ledger.summary.entryCount }} รายการ
        </p>
      </div>

      <nav class="tab-bar no-print" aria-label="ส่วนของสมุดบัญชี">
        <RouterLink :to="`/workspace/${route.params.id}`" class="tab" exact-active-class="tab-active" active-class="">
          <AppIcon name="chart" :size="17" />
          ภาพรวมและความเสี่ยง
        </RouterLink>
        <RouterLink :to="`/workspace/${route.params.id}/entries`" class="tab">
          <AppIcon name="receipt" :size="17" />
          รายการ
        </RouterLink>
        <RouterLink :to="`/workspace/${route.params.id}/evidence`" class="tab">
          <AppIcon name="folder" :size="17" />
          หลักฐาน
        </RouterLink>
        <RouterLink :to="`/workspace/${route.params.id}/goals`" class="tab">
          <AppIcon name="spark" :size="17" />
          เป้าหมาย
        </RouterLink>
      </nav>

      <div v-if="ledger.loading" class="card" aria-busy="true">
        <span class="sr-only">กำลังโหลดข้อมูลสมุดบัญชี</span>
        <div class="skeleton skeleton-line w40"></div>
        <div class="skeleton skeleton-row"></div>
        <div class="skeleton skeleton-row"></div>
      </div>

      <RouterView v-else />
    </div>
  </main>
</template>
