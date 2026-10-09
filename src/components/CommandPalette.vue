<script setup lang="ts">
/**
 * แถบค้นหาและสั่งงาน (Ctrl+K หรือ ⌘K) — พิมพ์ชื่อหน้า หมวดเครื่องคำนวณ สมุดบัญชี หรือคำศัพท์ แล้วไปได้ทันที
 * พิมพ์เป็นรายการ เช่น "กาแฟ 65" มีตัวเลือกบันทึกลงสมุดให้อันดับแรก
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { CALCULATOR_CATEGORIES } from '@/data/calculatorCategories'
import { GLOSSARY } from '@/data/glossary'
import { parseQuickEntry } from '@/services/quickParse'
import { formatBaht } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { localToday, useLedgerStore } from '@/stores/ledger'
import { useUiStore } from '@/stores/ui'

interface Command {
  id: string
  label: string
  hint: string
  icon: string
  keywords: string
  run: () => void
}

const router = useRouter()
const auth = useAuthStore()
const ledger = useLedgerStore()
const ui = useUiStore()

const query = ref('')
const index = ref(0)
const input = ref<HTMLInputElement | null>(null)

const go = (to: string) => () => router.push(to)

interface PageCommand extends Omit<Command, 'run'> {
  to: string
  /** แสดงเฉพาะสมาชิก */
  member?: boolean
}

const PAGES: PageCommand[] = [
  { id: 'dashboard', label: 'แดชบอร์ด', hint: 'ภาพรวม', icon: 'home', keywords: 'dashboard หน้าหลัก ภาพรวม', to: '/dashboard', member: true },
  { id: 'filing', label: 'เตรียมแบบภาษี', hint: 'ยื่นภาษี 4 ขั้นตอน', icon: 'file', keywords: 'ยื่น ภงด 90 91 filing', to: '/filing' },
  { id: 'deductions', label: 'คู่มือค่าลดหย่อน', hint: 'วางแผนลดหย่อน', icon: 'shield', keywords: 'ลดหย่อน rmf ssf thai esg ประกัน', to: '/deductions' },
  { id: 'funds', label: 'กองทุนลดหย่อนของฉัน', hint: 'ขายได้เมื่อไร', icon: 'clock', keywords: 'กองทุน rmf ssf thai esg esgx ถือครอง ขาย', to: '/funds', member: true },
  { id: 'workspaces', label: 'สมุดบัญชี', hint: 'รายรับรายจ่าย', icon: 'wallet', keywords: 'สมุด บัญชี ledger', to: '/workspaces' },
  { id: 'history', label: 'ประวัติแบบภาษี', hint: 'ย้อนหลัง', icon: 'history', keywords: 'ประวัติ history', to: '/history' },
  { id: 'documents', label: 'เอกสารแนบ', hint: 'เตรียมเอกสาร', icon: 'folder', keywords: 'เอกสาร 50 ทวิ', to: '/documents' },
  { id: 'achievements', label: 'เหรียญรางวัลและแต่งตัว', hint: 'ความสำเร็จ', icon: 'spark', keywords: 'เหรียญ เลเวล แต่งตัว', to: '/achievements', member: true },
  { id: 'wrapped', label: 'สรุปปีของฉัน', hint: 'สตอรี่', icon: 'chart', keywords: 'wrapped สรุปปี', to: '/wrapped', member: true },
  { id: 'quiz', label: 'ควิซภาษี 1 นาที', hint: 'เล่นสนุก', icon: 'spark', keywords: 'quiz ควิซ เกม', to: '/quiz' },
  { id: 'glossary', label: 'คำศัพท์ภาษี', hint: 'อธิบายคำยาก', icon: 'search', keywords: 'ศัพท์ glossary ความหมาย', to: '/glossary' },
  { id: 'profile', label: 'โปรไฟล์และสำรองข้อมูล', hint: 'ตั้งค่า', icon: 'user', keywords: 'โปรไฟล์ รหัสผ่าน สำรอง backup', to: '/profile', member: true },
]

const commands = computed<Command[]>(() => {
  const list: Command[] = []

  // พิมพ์เป็นรายการ → บันทึกด่วน
  const mode = ledger.active?.mode ?? ledger.workspaces[0]?.mode ?? 'personal'
  const entry = auth.isLoggedIn && query.value.trim() ? parseQuickEntry(query.value, mode, localToday()) : null
  if (entry) {
    list.push({
      id: 'quick-add',
      label: `บันทึก${entry.type === 'income' ? 'รายรับ' : 'รายจ่าย'} ${formatBaht(entry.amount)}${entry.note ? ` · ${entry.note}` : ''}`,
      hint: 'Enter เพื่อตรวจและบันทึก',
      icon: 'plus',
      keywords: query.value,
      run: () => ui.openQuickAdd(query.value),
    })
  }
  if (auth.isLoggedIn) {
    list.push({ id: 'add', label: 'บันทึกรายการด่วน', hint: 'ปุ่ม +', icon: 'plus', keywords: 'เพิ่ม บันทึก จด add', run: () => ui.openQuickAdd() })
  }

  for (const p of PAGES) {
    if (p.member && !auth.isLoggedIn) continue
    list.push({ id: p.id, label: p.label, hint: p.hint, icon: p.icon, keywords: p.keywords, run: go(p.to) })
  }
  for (const c of CALCULATOR_CATEGORIES) {
    list.push({
      id: `calc-${c.key}`,
      label: `คำนวณ${c.label}`,
      hint: 'เครื่องคำนวณ',
      icon: 'calculator',
      keywords: `${c.headline} ${c.description}`,
      run: go(c.to),
    })
  }
  for (const w of ledger.workspaces) {
    list.push({ id: `ws-${w.id}`, label: `สมุด: ${w.name}`, hint: 'เปิดสมุด', icon: 'wallet', keywords: w.name, run: go(`/workspace/${w.id}/entries`) })
  }
  for (const t of GLOSSARY) {
    list.push({ id: `term-${t.key}`, label: `ศัพท์: ${t.term}`, hint: t.short.slice(0, 40) + '…', icon: 'info', keywords: t.short, run: go(`/glossary#${t.key}`) })
  }
  return list
})

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return commands.value.filter((c) => !c.id.startsWith('term-')).slice(0, 9)
  const words = q.split(/\s+/)
  return commands.value
    .map((c) => {
      const label = c.label.toLowerCase()
      const hay = `${label} ${c.keywords.toLowerCase()}`
      if (c.id === 'quick-add') return { c, score: 100 }
      if (!words.every((w) => hay.includes(w))) return { c, score: 0 }
      return { c, score: label.startsWith(q) ? 3 : label.includes(q) ? 2 : 1 }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 9)
    .map((r) => r.c)
})

watch(results, () => (index.value = 0))

function close() {
  ui.paletteOpen = false
}

function run(command: Command | undefined) {
  if (!command) return
  close()
  command.run()
}

function onInputKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    index.value = (index.value + 1) % Math.max(1, results.value.length)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    index.value = (index.value - 1 + results.value.length) % Math.max(1, results.value.length)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    run(results.value[index.value])
  } else if (event.key === 'Escape') {
    close()
  }
}

// คอมโพเนนต์นี้ถูกสร้างตอนเปิดเท่านั้น (โหลดแยกไฟล์ใน App.vue) ปุ่มลัด Ctrl+K อยู่ที่ App.vue
onMounted(async () => {
  if (auth.isLoggedIn && !ledger.workspaces.length) ledger.loadWorkspaces().catch(() => {})
  await nextTick()
  input.value?.focus()
})
</script>

<template>
  <Transition name="guide-pop">
    <div v-if="ui.paletteOpen" class="modal-backdrop palette-backdrop no-print" @click.self="close">
      <section class="modal palette" role="dialog" aria-modal="true" aria-label="ค้นหาและสั่งงาน">
        <div class="palette-input">
          <AppIcon name="search" :size="18" />
          <input
            ref="input"
            v-model="query"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            :aria-activedescendant="results[index] ? `cmd-${results[index]!.id}` : undefined"
            autocomplete="off"
            placeholder="ไปที่หน้า… หรือพิมพ์ “กาแฟ 65” เพื่อบันทึก"
            @keydown="onInputKey"
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" class="palette-list">
          <li
            v-for="(c, i) in results"
            :id="`cmd-${c.id}`"
            :key="c.id"
            role="option"
            :aria-selected="i === index"
            :class="{ active: i === index }"
            @mouseenter="index = i"
            @click="run(c)"
          >
            <AppIcon :name="c.icon" :size="17" />
            <span class="palette-label">{{ c.label }}</span>
            <small class="muted">{{ c.hint }}</small>
          </li>
          <li v-if="!results.length" class="muted palette-empty">ไม่พบ — ลองคำอื่น</li>
        </ul>
        <p class="small muted palette-foot">↑ ↓ เลือก · Enter ไป · Ctrl+K เปิด/ปิด</p>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.palette-backdrop {
  align-items: flex-start;
  padding-top: 12vh;
}
.palette {
  width: min(560px, calc(100% - 32px));
  padding: 0;
  overflow: hidden;
}
.palette-input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
}
.palette-input input {
  flex: 1;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 1.05rem;
  color: var(--text);
  outline: none;
  padding: 0;
  box-shadow: none;
}
.palette-input kbd {
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--line);
  color: var(--text-dim);
}
.palette-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  max-height: 50vh;
  overflow-y: auto;
}
.palette-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
}
.palette-list li.active {
  background: var(--accent-soft);
}
.palette-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.palette-list small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40%;
}
.palette-empty {
  cursor: default;
}
.palette-foot {
  margin: 0;
  padding: 8px 16px 12px;
}
</style>
