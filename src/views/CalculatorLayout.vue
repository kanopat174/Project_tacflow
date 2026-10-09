<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { CALCULATOR_CATEGORIES } from '@/data/calculatorCategories'

const route = useRoute()

const active = computed(() => CALCULATOR_CATEGORIES.find((c) => c.to === route.path))

/* มือถือ: แถบหมวดเลื่อนข้างได้ เลื่อนแท็บที่เลือกมาไว้กลางแถบ จะได้เห็นว่าอยู่หมวดไหน (คอมแท็บพอดีแถบ ไม่ขยับ) */
const tabBar = ref<HTMLElement | null>(null)
function centerActiveTab() {
  const bar = tabBar.value
  const tab = bar?.querySelector<HTMLElement>('.tab-active, .router-link-active')
  if (!bar || !tab || bar.scrollWidth <= bar.clientWidth) return
  bar.scrollTo({ left: tab.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2 })
}
onMounted(centerActiveTab)
watch(() => route.path, () => nextTick(centerActiveTab))
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

      <nav ref="tabBar" class="tab-bar tab-bar-scroll no-print" aria-label="หมวดเครื่องคำนวณ">
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
