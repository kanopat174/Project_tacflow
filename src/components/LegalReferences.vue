<script setup lang="ts">
/** กล่องข้อกฎหมายที่เกี่ยวข้องกับขั้นตอนที่ผู้ใช้กำลังทำอยู่ เปิด/ปิดได้ */
import AppIcon from './AppIcon.vue'
import { REVENUE_CODE_SOURCE, type LegalReference } from '@/data/taxLaw'

withDefaults(defineProps<{ references: LegalReference[]; title?: string }>(), {
  title: 'ข้อกฎหมายที่เกี่ยวข้องกับขั้นตอนนี้',
})
</script>

<template>
  <details class="card legal-refs" open>
    <summary>
      <span class="ico"><AppIcon name="scale" :size="20" /></span>
      <span class="txt">
        <strong>{{ title }}</strong>
        <small>{{ references.length }} หัวข้อ · อ้างอิงประมวลรัษฎากร</small>
      </span>
    </summary>

    <ol class="legal-list">
      <li v-for="item in references" :key="item.law">
        <span class="badge badge-accent">{{ item.law }}</span>
        <div>
          <h4>{{ item.title }}</h4>
          <p>{{ item.summary }}</p>
        </div>
      </li>
    </ol>

    <p class="legal-note">
      สรุปเพื่อความเข้าใจเท่านั้น ตัวบทจริงมีเงื่อนไขมากกว่านี้และอาจเปลี่ยนตามปีภาษี — ดูฉบับเต็มที่
      <a :href="REVENUE_CODE_SOURCE.url" target="_blank" rel="noopener noreferrer">
        {{ REVENUE_CODE_SOURCE.label }}
      </a>
    </p>
  </details>
</template>
