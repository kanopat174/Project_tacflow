<script setup lang="ts">
/** เหรียญรางวัล บันทึกต่อเนื่อง เลเวลของตัวการ์ตูน และของแต่งตัว */
import { computed, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MascotFigure from '@/components/MascotFigure.vue'
import { findMascot } from '@/data/mascot'
import { useTheme } from '@/composables/useTheme'
import { thaiDate } from '@/services/taxEngine'
import { useGameStore } from '@/stores/game'

const theme = useTheme()
const game = useGameStore()

onMounted(() => void game.refresh())

const mascot = computed(() => findMascot(theme.mascot.value))
const unlockedCount = computed(() => game.achievements.filter((a) => a.unlockedAt).length)
const sorted = computed(() =>
  [...game.achievements].sort((a, b) => Number(Boolean(b.unlockedAt)) - Number(Boolean(a.unlockedAt))),
)
const xpToNext = computed(() =>
  game.levelInfo.next === null ? 0 : game.levelInfo.next - game.levelInfo.xp,
)
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">ความสำเร็จ</span>
        <h2>เหรียญรางวัลและเลเวลของ{{ mascot.label }}</h2>
        <p>จดรายการต่อเนื่อง ตั้งงบ ถึงเป้า และเตรียมภาษี เพื่อสะสมเหรียญ ยิ่งได้เยอะ ตัวการ์ตูนยิ่งได้ของแต่งตัวใหม่</p>
      </div>

      <div class="grid grid-2 mb-3">
        <!-- เลเวลและตัวการ์ตูน -->
        <section class="card level-card">
          <MascotFigure :mascot="mascot.key" :size="132" :mood="game.mood.mood" :accessory="game.equipped" />
          <div class="level-info">
            <span class="eyebrow">เลเวล</span>
            <strong class="level-number">{{ game.levelInfo.level }}</strong>
            <div class="xp-bar" role="img" :aria-label="`XP ${game.levelInfo.xp}`">
              <span :style="{ width: `${game.levelInfo.progress * 100}%` }"></span>
            </div>
            <p class="small muted">
              {{ game.levelInfo.xp }} XP
              <template v-if="game.levelInfo.next !== null"> · อีก {{ xpToNext }} XP ขึ้นเลเวล {{ game.levelInfo.level + 1 }}</template>
              <template v-else> · เลเวลสูงสุดแล้ว!</template>
            </p>
          </div>
        </section>

        <!-- บันทึกต่อเนื่อง -->
        <section class="card streak-card">
          <span class="streak-flame" :class="{ lit: game.streak.current > 0 }" aria-hidden="true">🔥</span>
          <div>
            <span class="eyebrow">บันทึกต่อเนื่อง</span>
            <strong class="streak-number">{{ game.streak.current }} วัน</strong>
            <p class="small muted">สถิติดีที่สุด {{ game.streak.best }} วัน</p>
            <p class="small" :class="game.streak.todayDone ? 'text-ok' : 'text-warn'">
              {{
                game.streak.todayDone
                  ? 'วันนี้จดแล้ว เยี่ยม!'
                  : game.streak.current > 0
                    ? 'วันนี้ยังไม่ได้จด จดก่อนหมดวันเพื่อรักษาสถิติ'
                    : 'จดรายการวันนี้เพื่อเริ่มนับใหม่'
              }}
            </p>
          </div>
        </section>
      </div>

      <!-- ของแต่งตัว -->
      <section class="card">
        <div class="card-head">
          <div>
            <h3>แต่งตัวให้{{ mascot.label }}</h3>
            <p>ปลดล็อกของใหม่ทุกครั้งที่เลเวลอัป ของที่ใส่จะแสดงทุกที่ที่ตัวการ์ตูนปรากฏ</p>
          </div>
        </div>
        <div class="wardrobe">
          <button
            v-for="item in game.accessoryList"
            :key="item.key"
            type="button"
            class="wardrobe-item"
            :class="{ active: game.equipped === item.key, locked: !game.accessories.includes(item.key) }"
            :disabled="!game.accessories.includes(item.key)"
            :aria-pressed="game.equipped === item.key"
            @click="game.equip(item.key)"
          >
            <MascotFigure :mascot="mascot.key" :size="64" :accessory="item.key" />
            <span>{{ item.label }}</span>
            <small v-if="!game.accessories.includes(item.key)">
              <AppIcon name="lock" :size="12" /> เลเวล {{ item.level }}
            </small>
          </button>
        </div>
      </section>

      <!-- เหรียญรางวัล -->
      <section class="card">
        <div class="card-head">
          <div>
            <h3>เหรียญรางวัล</h3>
            <p>ได้แล้ว {{ unlockedCount }} จาก {{ game.achievements.length }} เหรียญ</p>
          </div>
          <div class="row" style="gap: 8px">
            <RouterLink class="btn btn-ghost btn-sm" to="/quiz">ควิซภาษี</RouterLink>
            <RouterLink class="btn btn-ghost btn-sm" to="/wrapped">สรุปปีของฉัน</RouterLink>
          </div>
        </div>
        <div class="badge-grid">
          <div
            v-for="a in sorted"
            :key="a.id"
            class="badge-tile"
            :class="{ unlocked: a.unlockedAt }"
          >
            <span class="badge-icon" aria-hidden="true">{{ a.icon }}</span>
            <strong>{{ a.title }}</strong>
            <small>{{ a.description }}</small>
            <span class="badge-meta">
              <template v-if="a.unlockedAt">ได้เมื่อ {{ thaiDate(a.unlockedAt) }} · +{{ a.xp }} XP</template>
              <template v-else><AppIcon name="lock" :size="12" /> +{{ a.xp }} XP</template>
            </span>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
