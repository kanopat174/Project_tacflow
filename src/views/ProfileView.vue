<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import BackupPanel from '@/components/BackupPanel.vue'
import IntroSettings from '@/components/IntroSettings.vue'
import IdentityInput from '@/components/IdentityInput.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import InstallAppButton from '@/components/InstallAppButton.vue'
import { usePhotoPicker } from '@/composables/usePhotoPicker'
import {
  CITIZEN_ID_ERROR,
  EMAIL_PATTERN,
  FULL_NAME_ERROR,
  PHONE_ERROR,
  isValidCitizenId,
  isValidFullName,
  isValidPhone,
} from '@/data/accountRules'
import { ApiError, api, resetMockDatabase } from '@/services/api'
import { thaiDate } from '@/services/taxEngine'
import { useAuthStore } from '@/stores/auth'
import { useFilingStore } from '@/stores/filing'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const filing = useFilingStore()
const toast = useToastStore()
const router = useRouter()

const profile = reactive({
  fullName: auth.user?.fullName ?? '',
  email: auth.user?.email ?? '',
  citizenId: auth.user?.citizenId ?? '',
  phone: auth.user?.phone ?? '',
  address: auth.user?.address ?? '',
})

const profileSubmitted = ref(false)

/** ตรวจด้วยกติกาชุดเดียวกับหน้าสมัครสมาชิก ก่อนหน้านี้หน้านี้ไม่ตรวจอะไรเลย */
const profileErrors = computed(() => {
  const result: Record<string, string> = {}
  if (!isValidFullName(profile.fullName)) result.fullName = FULL_NAME_ERROR
  if (!EMAIL_PATTERN.test(profile.email.trim())) result.email = 'รูปแบบอีเมลไม่ถูกต้อง'
  if (!isValidCitizenId(profile.citizenId)) result.citizenId = CITIZEN_ID_ERROR
  if (profile.phone.trim() && !isValidPhone(profile.phone)) result.phone = PHONE_ERROR
  return result
})

const passwords = reactive({ current: '', next: '', confirm: '' })
const savingProfile = ref(false)
const savingPassword = ref(false)

async function saveProfile() {
  profileSubmitted.value = true
  if (Object.keys(profileErrors.value).length > 0) {
    toast.error('กรุณาแก้ไขข้อมูลที่ยังไม่ถูกต้องก่อนบันทึก')
    return
  }

  savingProfile.value = true
  try {
    await auth.updateProfile({ ...profile })
    toast.success('บันทึกข้อมูลส่วนตัวเรียบร้อย')
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'บันทึกข้อมูลไม่สำเร็จ')
  } finally {
    savingProfile.value = false
  }
}

async function changePassword() {
  if (passwords.next !== passwords.confirm) {
    toast.error('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน')
    return
  }

  savingPassword.value = true
  try {
    await api.changePassword(passwords.current, passwords.next)
    passwords.current = ''
    passwords.next = ''
    passwords.confirm = ''
    toast.success('เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นถูกออกจากระบบทั้งหมด')
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'เปลี่ยนรหัสผ่านไม่สำเร็จ')
  } finally {
    savingPassword.value = false
  }
}

/** ล้างข้อมูลจำลองทั้งหมดเพื่อเริ่มเดโมใหม่ตั้งแต่ต้น */
function resetDemo() {
  if (!confirm('ล้างข้อมูลทั้งหมดในเบราว์เซอร์นี้ รวมถึงบัญชี แบบร่าง และประวัติการยื่น?')) return
  filing.resetForm()
  resetMockDatabase()
  toast.success('ล้างข้อมูลจำลองเรียบร้อย')
  window.location.href = '/'
}

/* ---------- รูปโปรไฟล์ ---------- */

const photo = usePhotoPicker()
const avatarInput = ref<HTMLInputElement | null>(null)
const savingAvatar = ref(false)

/** บันทึกรูปทันทีที่เลือก ไม่ผูกกับปุ่มบันทึกข้อมูลส่วนตัว รูปจะได้ไม่หายถ้าฟอร์มด้านล่างยังกรอกไม่ผ่าน */
async function saveAvatar(avatarUrl: string, message: string) {
  savingAvatar.value = true
  try {
    await auth.updateProfile({ avatarUrl })
    toast.success(message)
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'บันทึกรูปโปรไฟล์ไม่สำเร็จ')
  } finally {
    savingAvatar.value = false
  }
}

async function onAvatarPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const url = await photo.read(input.files?.[0], 'avatar')
  input.value = ''
  if (url) await saveAvatar(url, 'เปลี่ยนรูปโปรไฟล์แล้ว')
}

function removeAvatar() {
  if (!confirm('ลบรูปโปรไฟล์?')) return
  saveAvatar('', 'ลบรูปโปรไฟล์แล้ว')
}

function goBackToFiling() {
  router.push('/filing')
}
</script>

<template>
  <main id="main-content" tabindex="-1" class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">บัญชีสมาชิก</span>
        <h2>โปรไฟล์ของฉัน</h2>
        <p>
          ข้อมูลชุดนี้จะถูกเติมให้อัตโนมัติในขั้นตอนที่ 1 ของแบบยื่นภาษี
          แก้ที่นี่ครั้งเดียวใช้ได้ทุกปีภาษี
        </p>
      </div>

      <section class="card profile-photo-card">
        <div class="avatar-edit">
          <UserAvatar
            :src="auth.user?.avatarUrl"
            :name="auth.user?.fullName || auth.user?.username"
            :size="96"
          />
          <button
            class="photo-btn round"
            type="button"
            :disabled="photo.processing.value || savingAvatar"
            aria-label="เปลี่ยนรูปโปรไฟล์"
            title="เปลี่ยนรูปโปรไฟล์"
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
            @change="onAvatarPicked"
          />
        </div>
        <div class="profile-photo-text">
          <h3>{{ auth.user?.fullName || auth.user?.username }}</h3>
          <p class="muted small">@{{ auth.user?.username }}</p>
          <p class="hint">
            {{ photo.processing.value || savingAvatar ? 'กำลังบันทึกรูป...' : 'รูปจะถูกครอปเป็นสี่เหลี่ยมจัตุรัสและย่อให้อัตโนมัติ รองรับ JPG, PNG, WebP' }}
          </p>
          <div class="row mt-1" style="gap: 8px; flex-wrap: wrap">
            <button
              class="btn btn-ghost btn-sm"
              type="button"
              :disabled="photo.processing.value || savingAvatar"
              @click="avatarInput?.click()"
            >
              <AppIcon name="camera" :size="16" />
              {{ auth.user?.avatarUrl ? 'เปลี่ยนรูป' : 'อัปโหลดรูป' }}
            </button>
            <button
              v-if="auth.user?.avatarUrl"
              class="btn btn-ghost btn-sm"
              type="button"
              :disabled="savingAvatar"
              @click="removeAvatar"
            >
              <AppIcon name="trash" :size="16" />
              ลบรูป
            </button>
          </div>
        </div>
      </section>

      <div class="grid grid-2" style="align-items: start">
        <section class="card">
          <div class="card-head">
            <div>
              <h3>ข้อมูลส่วนตัว</h3>
              <p>
                สมัครเมื่อ {{ thaiDate(auth.user?.createdAt ?? '') }} ·
                สิทธิ์ {{ auth.isAdmin ? 'ผู้ดูแลระบบ' : 'สมาชิกทั่วไป' }}
              </p>
            </div>
          </div>

          <form novalidate @submit.prevent="saveProfile">
            <div class="field">
              <label for="pf-username">Username</label>
              <input id="pf-username" :value="auth.user?.username" disabled />
              <p class="hint">username เปลี่ยนไม่ได้หลังสมัครแล้ว</p>
            </div>

            <div class="field" :class="{ invalid: profileSubmitted && profileErrors.fullName }">
              <label for="pf-fullname">ชื่อ-นามสกุล</label>
              <input
                id="pf-fullname"
                v-model="profile.fullName"
                type="text"
                name="name"
                autocomplete="name"
                autocapitalize="words"
                :maxlength="100"
              />
              <p v-if="profileSubmitted && profileErrors.fullName" class="error">
                {{ profileErrors.fullName }}
              </p>
            </div>

            <div class="field" :class="{ invalid: profileSubmitted && profileErrors.email }">
              <label for="pf-email">อีเมล</label>
              <input
                id="pf-email"
                v-model="profile.email"
                type="email"
                name="email"
                autocomplete="email"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
              />
              <p v-if="profileSubmitted && profileErrors.email" class="error">
                {{ profileErrors.email }}
              </p>
            </div>

            <IdentityInput
              id="pf-citizen"
              v-model="profile.citizenId"
              kind="citizenId"
              label="เลขประจำตัวประชาชน"
              :error="profileSubmitted ? profileErrors.citizenId : ''"
            />

            <IdentityInput
              id="pf-phone"
              v-model="profile.phone"
              kind="phone"
              label="เบอร์โทรศัพท์"
              hint="ไม่บังคับกรอก"
              :error="profileSubmitted ? profileErrors.phone : ''"
            />

            <div class="field">
              <label for="pf-address">ที่อยู่ตามทะเบียนบ้าน</label>
              <textarea id="pf-address" v-model="profile.address" rows="3"></textarea>
            </div>

            <button class="btn btn-primary btn-block" type="submit" :disabled="savingProfile">
              {{ savingProfile ? 'กำลังบันทึก...' : 'บันทึกข้อมูลส่วนตัว' }}
            </button>
          </form>
        </section>

        <div>
          <section class="card">
            <div class="card-head">
              <div>
                <h3>เปลี่ยนรหัสผ่าน</h3>
                <p>เปลี่ยนแล้วอุปกรณ์อื่นที่ล็อกอินค้างไว้จะถูกออกจากระบบทั้งหมด</p>
              </div>
            </div>

            <form novalidate @submit.prevent="changePassword">
              <div class="field">
                <label for="pw-current">รหัสผ่านปัจจุบัน</label>
                <input
                  id="pw-current"
                  v-model="passwords.current"
                  type="password"
                  autocomplete="current-password"
                />
              </div>

              <div class="field">
                <label for="pw-next">รหัสผ่านใหม่</label>
                <input
                  id="pw-next"
                  v-model="passwords.next"
                  type="password"
                  autocomplete="new-password"
                />
                <p class="hint">อย่างน้อย 8 ตัวอักษร</p>
              </div>

              <div class="field">
                <label for="pw-confirm">ยืนยันรหัสผ่านใหม่</label>
                <input
                  id="pw-confirm"
                  v-model="passwords.confirm"
                  type="password"
                  autocomplete="new-password"
                />
              </div>

              <button class="btn btn-ghost btn-block" type="submit" :disabled="savingPassword">
                <AppIcon name="lock" :size="17" />
                {{ savingPassword ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน' }}
              </button>
            </form>
          </section>

          <section class="card">
            <div class="card-head">
              <div>
                <h3>ทางลัด</h3>
                <p>ไปยังส่วนที่ใช้บ่อยได้ทันที</p>
              </div>
            </div>
            <div class="stack">
              <button class="btn btn-primary btn-block" type="button" @click="goBackToFiling">
                กลับไปกรอกแบบภาษี
                <AppIcon name="arrowRight" :size="18" />
              </button>
              <RouterLink class="btn btn-ghost btn-block" to="/history">ดูประวัติแบบภาษี</RouterLink>
              <RouterLink class="btn btn-ghost btn-block" to="/achievements">เหรียญรางวัลและเลเวล</RouterLink>
              <RouterLink class="btn btn-ghost btn-block" to="/wrapped">สรุปปีของฉัน</RouterLink>
              <RouterLink class="btn btn-ghost btn-block" to="/quiz">เล่นควิซภาษี</RouterLink>
              <InstallAppButton />
              <RouterLink class="btn btn-ghost btn-block" to="/documents">จัดการเอกสารแนบ</RouterLink>
            </div>
          </section>

          <IntroSettings />

          <BackupPanel />

          <section class="card">
            <div class="card-head">
              <div>
                <h3>ล้างข้อมูลจำลอง</h3>
                <p>ระบบต้นแบบเก็บทุกอย่างไว้ในเบราว์เซอร์ กดปุ่มนี้เพื่อเริ่มเดโมใหม่ตั้งแต่ต้น</p>
              </div>
            </div>
            <button class="btn btn-danger btn-block" type="button" @click="resetDemo">
              <AppIcon name="trash" :size="17" />
              ล้างบัญชี แบบร่าง และประวัติทั้งหมด
            </button>
          </section>
        </div>
      </div>
    </div>
  </main>
</template>
