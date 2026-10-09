<script setup lang="ts">
/**
 * ตัวช่วยกรอก e-Filing: ตัวเลขเรียงตามหน้าจอของกรมสรรพากร กดคัดลอกทีละช่องแล้วไปวาง
 * ช่องที่คัดลอกแล้วติ๊กให้อัตโนมัติ จะได้รู้ว่ากรอกถึงไหน (จำไว้ในเครื่องต่อแบบ)
 */
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { E_FILING_URL } from '@/data/filingStatus'
import { efilingSections } from '@/services/efilingFields'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{ reference: string; snapshot: Record<string, unknown> }>()

const toast = useToastStore()
const sections = computed(() => efilingSections(props.snapshot))
const total = computed(() => sections.value.reduce((n, s) => n + s.fields.length, 0))

const storageKey = computed(() => `taxflow_efiling_done_${props.reference}`)
const done = ref<Set<string>>(new Set())

watch(
  storageKey,
  (key) => {
    try {
      done.value = new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[])
    } catch {
      done.value = new Set()
    }
  },
  { immediate: true },
)

function save() {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify([...done.value]))
  } catch {
    /* จำไม่ได้ก็ยังคัดลอกได้ */
  }
}

function toggle(id: string) {
  const next = new Set(done.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  done.value = next
  save()
}

async function copy(id: string, label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`คัดลอก "${label}" แล้ว ไปวางในช่องเดียวกันที่ e-Filing`)
  } catch {
    toast.error('คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่อนุญาต ลองเลือกข้อความแล้วคัดลอกเอง')
    return
  }
  if (!done.value.has(id)) toggle(id)
}

function reset() {
  done.value = new Set()
  save()
}
</script>

<template>
  <section class="card efiling-helper" data-test="efiling-helper">
    <div class="card-head">
      <div>
        <h3>
          <AppIcon name="file" :size="19" />
          ตัวช่วยกรอก e-Filing
        </h3>
        <p>
          เรียงตามหน้าจอของกรมสรรพากร กด "คัดลอก" แล้วไปวางที่
          <a :href="E_FILING_URL" target="_blank" rel="noopener noreferrer">efiling.rd.go.th</a>
          ทีละช่อง ยอดที่ให้คัดลอกคือยอดจ่ายจริง e-Filing ตัดเพดานเอง
        </p>
      </div>
      <span class="badge" :class="done.size >= total && total ? 'badge-ok' : 'badge-muted'">
        {{ Math.min(done.size, total) }}/{{ total }}
      </span>
    </div>

    <p v-if="!total" class="muted">แบบนี้ไม่มีตัวเลขให้กรอก</p>

    <div v-for="section in sections" :key="section.title" class="efiling-section">
      <h4>{{ section.title }}</h4>
      <ul>
        <li v-for="field in section.fields" :key="field.id" :class="{ done: done.has(field.id) }">
          <input
            type="checkbox"
            :checked="done.has(field.id)"
            :aria-label="`กรอก ${field.label} แล้ว`"
            @change="toggle(field.id)"
          />
          <span class="efiling-label">
            {{ field.label }}
            <small v-if="field.hint" class="muted">{{ field.hint }}</small>
          </span>
          <strong class="efiling-value">{{ field.display }}</strong>
          <button
            class="btn btn-ghost btn-sm"
            type="button"
            :aria-label="`คัดลอก ${field.label}`"
            @click="copy(field.id, field.label, field.copy)"
          >
            คัดลอก
          </button>
        </li>
      </ul>
    </div>

    <button v-if="done.size" class="btn btn-ghost btn-sm mt-1" type="button" @click="reset">เริ่มติ๊กใหม่</button>
  </section>
</template>

<style scoped>
.efiling-section h4 {
  margin: 12px 0 6px;
  font-size: 14.5px;
}
.efiling-section ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.efiling-section li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.efiling-section li.done {
  opacity: 0.6;
}
.efiling-label small {
  display: block;
}
.efiling-value {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
@media (max-width: 520px) {
  .efiling-section li {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .efiling-value {
    grid-column: 2;
  }
}
</style>
