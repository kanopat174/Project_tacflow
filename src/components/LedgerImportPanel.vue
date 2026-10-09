<script setup lang="ts">
/**
 * ดึงรายรับและภาษีหัก ณ ที่จ่ายจากสมุดบัญชีทุกเล่มมาเติมแบบภาษี
 * แสดงตัวอย่างให้ตรวจก่อนเสมอ ผู้ใช้กดยืนยันแล้วจึงเขียนทับช่องในแบบ
 */
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { ApiError, api } from '@/services/api'
import { buildFilingImport, type FilingImport } from '@/services/ledgerImport'
import { formatBaht } from '@/services/taxEngine'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{ taxYear: string }>()
const emit = defineEmits<{ apply: [result: FilingImport] }>()

const toast = useToastStore()
const loading = ref(false)
const preview = ref<FilingImport | null>(null)
const hasWorkspaces = ref(true)

const total = computed(() => preview.value?.lines.reduce((sum, l) => sum + l.amount, 0) ?? 0)

// เปลี่ยนปีภาษีแล้วตัวอย่างเดิมไม่ตรงปี ต้องดึงใหม่
watch(
  () => props.taxYear,
  () => (preview.value = null),
)

async function load() {
  loading.value = true
  try {
    const [workspaces, entries] = await Promise.all([api.workspaces(), api.allEntries()])
    hasWorkspaces.value = workspaces.length > 0
    preview.value = buildFilingImport(workspaces, entries, props.taxYear)
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'โหลดสมุดบัญชีไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

function apply() {
  if (!preview.value) return
  emit('apply', preview.value)
  toast.success('เติมเงินได้จากสมุดบัญชีแล้ว ตรวจตัวเลขอีกครั้งก่อนไปขั้นถัดไป')
  preview.value = null
}
</script>

<template>
  <section class="card import-panel">
    <div class="card-head">
      <div>
        <h3>
          <AppIcon name="wallet" :size="19" />
          ดึงตัวเลขจากสมุดบัญชี
        </h3>
        <p>
          รวมรายรับปี {{ taxYear }} จากสมุดทุกเล่ม จับคู่กับประเภทเงินได้ตามมาตรา 40
          พร้อมภาษีหัก ณ ที่จ่ายที่บันทึกไว้ ไม่ต้องพิมพ์ซ้ำ
        </p>
      </div>
      <button v-if="!preview" class="btn btn-ghost btn-sm" type="button" :disabled="loading" @click="load">
        {{ loading ? 'กำลังรวมยอด...' : 'ดูตัวเลขจากสมุด' }}
      </button>
    </div>

    <template v-if="preview">
      <div v-if="!hasWorkspaces" class="notice">
        <strong>ยังไม่มีสมุดบัญชี</strong>
        สร้างสมุดและบันทึกรายรับก่อน แล้วกลับมาดึงตัวเลขได้
        <RouterLink to="/workspaces">ไปหน้าสมุดบัญชี</RouterLink>
      </div>
      <div v-else-if="!preview.lines.length && !preview.skipped.length" class="notice">
        <strong>ไม่พบรายรับในปี {{ taxYear }}</strong>
        สมุดบัญชีมีเฉพาะรายการของปีอื่น (ปี ค.ศ. {{ preview.calendarYear }} คือปีภาษี {{ taxYear }})
      </div>

      <template v-else>
        <div v-if="preview.lines.length" class="table-wrap table-fit">
          <table>
            <thead>
              <tr>
                <th>ประเภทเงินได้</th>
                <th>มาจาก</th>
                <th class="right">ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in preview.lines" :key="line.incomeKey">
                <td>
                  <strong>{{ line.label }}</strong>
                  <span class="badge badge-accent" style="margin-left: 6px">{{ line.code }}</span>
                </td>
                <td class="small muted">
                  <div v-for="source in line.sources" :key="source.workspace + source.category">
                    {{ source.workspace }} · {{ source.category }} {{ formatBaht(source.amount) }}
                  </div>
                </td>
                <td class="money">{{ formatBaht(line.amount) }}</td>
              </tr>
              <tr>
                <td colspan="2">ภาษีหัก ณ ที่จ่าย</td>
                <td class="money">{{ formatBaht(preview.withholdingTax) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="preview.skipped.length" class="notice notice-warn mt-2">
          <strong>รายการที่ไม่ได้ดึงมาให้</strong>
          <ul class="skipped-list">
            <li v-for="row in preview.skipped" :key="row.workspace + row.category">
              {{ row.workspace }} · {{ row.category }} {{ formatBaht(row.amount) }} — {{ row.reason }}
            </li>
          </ul>
        </div>

        <div class="row mt-2" style="justify-content: flex-end; gap: 8px">
          <button class="btn btn-ghost btn-sm" type="button" @click="preview = null">ยกเลิก</button>
          <button
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="!preview.lines.length"
            @click="apply"
          >
            ใช้ตัวเลขนี้ ({{ formatBaht(total) }})
          </button>
        </div>
        <p class="small muted mt-1">
          ช่องประเภทเงินได้ที่ดึงมาจะถูกเขียนทับ ช่องอื่นคงค่าเดิม
          รายการในสมุดเป็นยอดที่บันทึกเอง ตรวจกับหนังสือรับรอง 50 ทวิ อีกครั้งก่อนยื่นจริง
        </p>
      </template>
    </template>
  </section>
</template>
