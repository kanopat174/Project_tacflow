<script setup lang="ts">
/** ควิซภาษี 1 นาที — สุ่ม 5 ข้อ ตอบแล้วเห็นเฉลยพร้อมลิงก์มาตราทันที */
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MascotFigure from '@/components/MascotFigure.vue'
import { pickQuestions, QUIZ_ROUND_SIZE, type QuizQuestion } from '@/data/taxQuiz'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { useFx } from '@/composables/useFx'
import { centerOf } from '@/services/fx'
import { useMascotFxStore } from '@/stores/mascotFx'

const theme = useTheme()
const auth = useAuthStore()
const game = useGameStore()
const fx = useFx()
const mascotFx = useMascotFxStore()

const questions = ref<QuizQuestion[]>(pickQuestions())
const index = ref(0)
/** คำตอบที่เลือกของแต่ละข้อ — null คือยังไม่ตอบ */
const picked = ref<(number | null)[]>(questions.value.map(() => null))
const finished = ref(false)

const current = computed(() => questions.value[index.value]!)
const answer = computed(() => picked.value[index.value] ?? null)
const answered = computed(() => answer.value !== null)
const score = computed(() => picked.value.filter((p, i) => p === questions.value[i]!.answer).length)

const verdict = computed(() => {
  if (score.value === QUIZ_ROUND_SIZE) return { mood: 'happy' as const, text: 'ถูกหมดเลย! เซียนภาษีตัวจริง' }
  if (score.value >= 3) return { mood: 'happy' as const, text: 'เก่งมาก! อีกนิดเดียวก็ครบ' }
  return { mood: 'normal' as const, text: 'ไม่เป็นไร ลองอีกรอบ คำถามจะสุ่มใหม่' }
})

function choose(i: number, event?: Event) {
  if (answered.value) return
  picked.value[index.value] = i
  // ถูก: ดาวกระจายตรงปุ่มที่ตอบ · ผิด: ปุ่มส่ายหัว · ตัวการ์ตูนมุมขวาล่างชมหรือให้กำลังใจ
  const button = event?.currentTarget as HTMLElement | undefined
  if (i === current.value.answer) {
    fx.sparkle(centerOf(button))
    mascotFx.react('quiz-right')
  } else {
    button?.classList.remove('fx-shake')
    void button?.offsetWidth // เริ่มแอนิเมชันใหม่ถ้ากดซ้ำ
    button?.classList.add('fx-shake')
    mascotFx.react('quiz-wrong')
  }
}

function next() {
  if (index.value < questions.value.length - 1) {
    index.value += 1
    return
  }
  finished.value = true
  if (auth.isLoggedIn) game.recordQuiz(score.value)
}

function restart() {
  questions.value = pickQuestions()
  picked.value = questions.value.map(() => null)
  index.value = 0
  finished.value = false
}
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container-narrow">
      <div class="section-head text-center">
        <span class="eyebrow">ควิซภาษี 1 นาที</span>
        <h2>ภาษีเรื่องนี้ รู้จริงหรือเปล่า?</h2>
        <p style="margin-inline: auto">ตอบ {{ QUIZ_ROUND_SIZE }} ข้อ ตอบแล้วเห็นเฉลยพร้อมมาตราที่เกี่ยวข้องทันที</p>
      </div>

      <section v-if="!finished" class="card quiz-card">
        <div class="quiz-progress" aria-hidden="true">
          <span
            v-for="(q, i) in questions"
            :key="q.id"
            :class="{
              done: picked[i] !== null && picked[i] === q.answer,
              wrong: picked[i] !== null && picked[i] !== q.answer,
              current: i === index,
            }"
          ></span>
        </div>
        <p class="small muted">ข้อ {{ index + 1 }} จาก {{ questions.length }}</p>

        <Transition name="tab" mode="out-in">
          <div :key="current.id">
            <h3 class="quiz-question">{{ current.question }}</h3>
            <div class="quiz-choices" role="radiogroup" :aria-label="current.question">
              <button
                v-for="(choice, i) in current.choices"
                :key="choice"
                type="button"
                role="radio"
                class="quiz-choice"
                :aria-checked="answer === i"
                :disabled="answered"
                :class="{
                  correct: answered && i === current.answer,
                  wrong: answered && answer === i && i !== current.answer,
                }"
                @click="choose(i, $event)"
              >
                <span class="quiz-letter">{{ 'กขค'[i] }}</span>
                {{ choice }}
              </button>
            </div>

            <div v-if="answered" class="notice mt-2" :class="answer === current.answer ? 'notice-accent' : 'notice-warn'">
              <strong>{{ answer === current.answer ? 'ถูกต้อง!' : 'ยังไม่ใช่' }}</strong>
              {{ current.explanation }}
              <a v-if="current.law" :href="current.law.url" target="_blank" rel="noopener noreferrer">
                อ่าน{{ current.law.label }}
              </a>
            </div>

            <div class="row mt-2" style="justify-content: flex-end">
              <button class="btn btn-primary" type="button" :disabled="!answered" @click="next">
                {{ index < questions.length - 1 ? 'ข้อต่อไป' : 'ดูคะแนน' }}
                <AppIcon name="arrowRight" :size="18" />
              </button>
            </div>
          </div>
        </Transition>
      </section>

      <section v-else class="card quiz-result text-center">
        <MascotFigure
          :mascot="theme.mascot.value"
          :size="130"
          :mood="verdict.mood"
          :accessory="game.equipped"
          class="quiz-mascot"
        />
        <p class="quiz-score">
          <strong class="num">{{ score }}</strong>
          <span>/ {{ QUIZ_ROUND_SIZE }}</span>
        </p>
        <h3>{{ verdict.text }}</h3>
        <p v-if="auth.isLoggedIn" class="muted">คะแนนดีที่สุดของคุณ {{ game.quizBest }} / {{ QUIZ_ROUND_SIZE }}</p>
        <p v-else class="muted">เข้าสู่ระบบเพื่อเก็บคะแนนและรับเหรียญ "เซียนภาษี"</p>
        <div class="cta-row mt-2" style="justify-content: center">
          <button class="btn btn-primary" type="button" @click="restart">เล่นอีกรอบ</button>
          <RouterLink v-if="auth.isLoggedIn" class="btn btn-ghost" to="/achievements">ดูเหรียญรางวัล</RouterLink>
        </div>
      </section>
    </div>
  </main>
</template>
