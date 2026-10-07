<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import MoneyField from '@/components/MoneyField.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import ModeIcon from '@/components/ModeIcon.vue'
import { useTheme } from '@/composables/useTheme'
import { usePhotoPicker, type PhotoKind } from '@/composables/usePhotoPicker'
import { ApiError, type WorkspacePatch } from '@/services/api'
import { formatBaht } from '@/services/taxEngine'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const ledger = useLedgerStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()
const theme = useTheme()

async function load(id: string) {
  try {
    await ledger.open(id)
    if (ledger.generatedCount > 0) {
      toast.success(`บันทึกรายการประจำให้อัตโนมัติ ${ledger.generatedCount} รายการ`)
    }
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'เปิดสมุดบัญชีไม่สำเร็จ')
    router.push('/workspaces')
  }
}

/* ---------- แก้ไขรายละเอียดสมุด ---------- */

const editing = ref(false)
const saving = ref(false)
const form = reactive({ name: '', capital: 0, description: '' })

onMounted(() => load(String(route.params.id)))
// เปลี่ยนสมุดจากลิงก์อื่นโดยไม่ผ่านการ mount ใหม่ ต้องโหลดข้อมูลใหม่ด้วย
watch(
  () => route.params.id,
  (id) => {
    editing.value = false
    if (id) load(String(id))
  },
)

function startEdit() {
  form.name = ledger.active?.name ?? ''
  form.capital = ledger.active?.capital ?? 0
  form.description = ledger.active?.description ?? ''
  editing.value = true
}

async function save(patch: WorkspacePatch, message: string): Promise<boolean> {
  saving.value = true
  try {
    await ledger.updateActive(patch)
    toast.success(message)
    return true
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'บันทึกไม่สำเร็จ')
    return false
  } finally {
    saving.value = false
  }
}

async function saveDetails() {
  if (!form.name.trim()) {
    toast.error('กรุณาตั้งชื่อสมุดบัญชี')
    return
  }
  const ok = await save(
    { name: form.name, capital: form.capital, description: form.description },
    'บันทึกรายละเอียดสมุดแล้ว',
  )
  if (ok) editing.value = false
}

/* ---------- รูปปกและรูปประจำสมุด ---------- */

const photo = usePhotoPicker()
const coverInput = ref<HTMLInputElement | null>(null)
const avatarInput = ref<HTMLInputElement | null>(null)

const PHOTO_LABEL: Record<PhotoKind, string> = { avatar: 'รูปสมุด', cover: 'รูปปก' }

async function onPhotoPicked(event: Event, kind: PhotoKind) {
  const input = event.target as HTMLInputElement
  const url = await photo.read(input.files?.[0], kind)
  input.value = ''
  if (!url) return
  await save(kind === 'avatar' ? { avatarUrl: url } : { coverUrl: url }, `เปลี่ยน${PHOTO_LABEL[kind]}แล้ว`)
}

function removePhoto(kind: PhotoKind) {
  if (!confirm(`ลบ${PHOTO_LABEL[kind]}ของสมุดเล่มนี้?`)) return
  save(kind === 'avatar' ? { avatarUrl: '' } : { coverUrl: '' }, `ลบ${PHOTO_LABEL[kind]}แล้ว`)
}
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <RouterLink to="/workspaces" class="back-link small no-print">
        <AppIcon name="arrowLeft" :size="15" />
        สมุดทั้งหมด
      </RouterLink>

      <!-- หัวสมุดแบบหน้าโปรไฟล์: รูปปก + รูปวงกลม + ชื่อ -->
      <section class="ws-profile no-print">
        <div
          class="ws-cover"
          :class="{ empty: !ledger.active?.coverUrl }"
          :style="ledger.active?.coverUrl ? { backgroundImage: `url(${ledger.active.coverUrl})` } : {}"
        >
          <div class="ws-cover-actions">
            <button
              class="photo-btn"
              type="button"
              :disabled="!ledger.active || saving || photo.processing.value"
              @click="coverInput?.click()"
            >
              <AppIcon name="camera" :size="16" />
              {{ ledger.active?.coverUrl ? 'เปลี่ยนรูปปก' : 'เพิ่มรูปปก' }}
            </button>
            <button
              v-if="ledger.active?.coverUrl"
              class="photo-btn"
              type="button"
              aria-label="ลบรูปปก"
              title="ลบรูปปก"
              :disabled="saving"
              @click="removePhoto('cover')"
            >
              <AppIcon name="trash" :size="16" />
            </button>
          </div>
          <input
            ref="coverInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            @change="onPhotoPicked($event, 'cover')"
          />
        </div>

        <div class="ws-identity">
          <div class="avatar-edit ws-avatar">
            <span
              v-if="ledger.active && !ledger.active.avatarUrl && theme.siteStyle.value === 'cute'"
              class="avatar mode-avatar"
              :style="{ width: '112px', height: '112px' }"
            >
              <ModeIcon :mode="ledger.active.mode" :size="40" />
            </span>
            <UserAvatar v-else :src="ledger.active?.avatarUrl" :name="ledger.active?.name" :size="112" />
            <button
              class="photo-btn round"
              type="button"
              aria-label="เปลี่ยนรูปสมุด"
              title="เปลี่ยนรูปสมุด"
              :disabled="!ledger.active || saving || photo.processing.value"
              @click="avatarInput?.click()"
            >
              <AppIcon name="camera" :size="17" />
            </button>
            <input
              ref="avatarInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="sr-only"
              tabindex="-1"
              aria-hidden="true"
              @change="onPhotoPicked($event, 'avatar')"
            />
          </div>

          <div class="ws-title">
            <h2>{{ ledger.active?.name ?? 'กำลังโหลด...' }}</h2>
            <p v-if="ledger.active?.description" class="ws-desc">{{ ledger.active.description }}</p>
            <p class="muted small">
              โหมด{{ ledger.definition.label }} ·
              {{ ledger.definition.capitalLabel }} {{ formatBaht(ledger.capital) }} ·
              บันทึกแล้ว {{ ledger.summary.entryCount }} รายการ
            </p>
          </div>

          <div class="ws-title-actions">
            <button
              v-if="ledger.active?.avatarUrl"
              class="btn btn-ghost btn-sm"
              type="button"
              :disabled="saving"
              @click="removePhoto('avatar')"
            >
              <AppIcon name="trash" :size="15" />
              ลบรูปสมุด
            </button>
            <button
              class="btn btn-primary btn-sm"
              type="button"
              :disabled="!ledger.active"
              :aria-expanded="editing"
              @click="editing ? (editing = false) : startEdit()"
            >
              <AppIcon :name="editing ? 'close' : 'edit'" :size="16" />
              {{ editing ? 'ปิด' : 'แก้ไขรายละเอียด' }}
            </button>
          </div>
        </div>

        <form v-if="editing" class="ws-edit" novalidate @submit.prevent="saveDetails">
          <div class="field-grid">
            <div class="field">
              <label for="ws-edit-name">ชื่อสมุดบัญชี</label>
              <input id="ws-edit-name" v-model="form.name" type="text" :maxlength="60" />
            </div>
            <MoneyField
              v-model="form.capital"
              :label="ledger.definition.capitalLabel"
              hint="แก้แล้วเงินทุนคงเหลือและจำนวนเดือนที่เงินทุนอยู่ได้จะคำนวณใหม่ทันที"
            />
            <div class="field full">
              <label for="ws-edit-desc">คำอธิบาย (ไม่บังคับ)</label>
              <textarea
                id="ws-edit-desc"
                v-model="form.description"
                rows="2"
                :maxlength="200"
                placeholder="เช่น บัญชีค่าใช้จ่ายในบ้าน หรือร้านกาแฟสาขาแรก"
              ></textarea>
              <p class="hint">{{ form.description.length }}/200</p>
            </div>
          </div>
          <div class="row" style="gap: 10px; justify-content: flex-end">
            <button class="btn btn-ghost" type="button" @click="editing = false">ยกเลิก</button>
            <button class="btn btn-primary" type="submit" :disabled="saving">
              {{ saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข' }}
            </button>
          </div>
        </form>
      </section>

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
          เป้าหมายและงบประมาณ
        </RouterLink>
      </nav>

      <div v-if="ledger.loading" class="card" aria-busy="true">
        <span class="sr-only">กำลังโหลดข้อมูลสมุดบัญชี</span>
        <div class="skeleton skeleton-line w40"></div>
        <div class="skeleton skeleton-row"></div>
        <div class="skeleton skeleton-row"></div>
      </div>

      <!-- สลับแท็บแล้วเนื้อหาเลื่อนเข้าจากด้านข้างเบา ๆ -->
      <RouterView v-else v-slot="{ Component }">
        <Transition name="tab" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </div>
  </main>
</template>
