<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import { CALCULATOR_CATEGORIES } from '@/data/calculatorCategories'
</script>

<template>
  <div>
    <div class="grid grid-3">
      <RouterLink
        v-for="category in CALCULATOR_CATEGORIES"
        :key="category.key"
        :to="category.to"
        class="category-card"
      >
        <span class="ico"><AppIcon :name="category.icon" :size="24" /></span>
        <h3>{{ category.headline }}</h3>
        <p>{{ category.description }}</p>
        <ul>
          <li v-for="point in category.points" :key="point">
            <AppIcon name="check" :size="15" />
            <span>{{ point }}</span>
          </li>
        </ul>
        <span class="go">
          เปิดเครื่องคำนวณ
          <AppIcon name="arrowRight" :size="17" />
        </span>
      </RouterLink>
    </div>

    <div class="notice notice-warn mt-3">
      <strong>ทุกหมวดออกเอกสาร PDF ได้</strong>
      เมื่อคำนวณเสร็จ กดปุ่มบันทึกเป็น PDF เพื่อเก็บใบสรุปการคำนวณไว้เป็นหลักฐานประกอบการวางแผนภาษี
      หรือส่งต่อให้ผู้ทำบัญชี
    </div>
  </div>
</template>
