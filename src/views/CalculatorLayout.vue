<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { CALCULATOR_CATEGORIES } from '@/data/calculatorCategories'

const route = useRoute()

const active = computed(() => CALCULATOR_CATEGORIES.find((c) => c.to === route.path))
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head no-print">
        <span class="eyebrow">เครื่องคำนวณภาษี</span>
        <h2>{{ active ? active.headline : 'เลือกหมวดภาษีที่ต้องการคำนวณ' }}</h2>
        <p>
          {{
            active
              ? active.description
              : 'ระบบแยกเครื่องคำนวณตามประเภทผู้เสียภาษีและประเภทเงินได้ เพราะแต่ละหมวดใช้ฐานภาษีและอัตราคนละชุดกัน'
          }}
        </p>
      </div>

      <nav class="tab-bar no-print" aria-label="หมวดเครื่องคำนวณ">
        <RouterLink to="/calculator" class="tab" active-class="" :class="{ 'tab-active': !active }">
          ทุกหมวด
        </RouterLink>
        <RouterLink
          v-for="category in CALCULATOR_CATEGORIES"
          :key="category.key"
          :to="category.to"
          class="tab"
        >
          <AppIcon :name="category.icon" :size="17" />
          {{ category.label }}
        </RouterLink>
      </nav>

      <RouterView v-slot="{ Component }">
        <Transition name="tab" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </div>
  </main>
</template>
