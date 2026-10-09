/**
 * รับเสียงพูดภาษาไทยเป็นข้อความ — Web Speech API (Chrome/Edge/Android)
 * Safari บน iPhone รองรับไม่ครบ ปุ่มไมค์จึงซ่อนเมื่อเบราว์เซอร์ไม่มี API นี้
 * เสียงถูกส่งไปประมวลผลที่เซิร์ฟเวอร์ของผู้ผลิตเบราว์เซอร์ (เช่น Google) ไม่ได้ทำในเครื่อง
 */
import { onBeforeUnmount, ref } from 'vue'

interface RecognitionResult {
  0: { transcript: string }
  isFinal: boolean
}
interface Recognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechSupported(): boolean {
  return recognitionClass() !== null
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน เปิดสิทธิ์ในการตั้งค่าเบราว์เซอร์',
  'service-not-allowed': 'เบราว์เซอร์นี้ไม่อนุญาตให้ใช้การรู้จำเสียง',
  'no-speech': 'ไม่ได้ยินเสียง ลองพูดใกล้ไมค์อีกครั้ง',
  network: 'การรู้จำเสียงต้องต่ออินเทอร์เน็ต',
  'audio-capture': 'ไม่พบไมโครโฟน',
}

/** ฟังนานสุดต่อครั้ง กันไมค์ค้างเปิดถ้าเบราว์เซอร์ไม่ตัดเอง */
const MAX_LISTEN_MS = 15_000
/** กดหยุดแล้วเบราว์เซอร์ต้องส่ง onend ภายในเวลานี้ ไม่งั้นถือว่าจบเอง */
const STOP_GRACE_MS = 1_500

/**
 * onFinal ถูกเรียกเมื่อพูดจบพร้อมข้อความทั้งหมด
 * interim คือข้อความระหว่างพูด ใช้แสดงให้เห็นว่าระบบได้ยินอะไร
 *
 * กันปัญหา "ใช้ได้ครั้งแรก ครั้งต่อไปกดไม่ติด":
 *  - บางเครื่อง (Chrome บน Android) ไม่ส่ง onend หลังหยุด สถานะ listening เลยค้าง
 *    และ QuickAdd ไม่เคยถูกถอดออกจากหน้า จึงค้างจนรีเฟรช — ตั้งเวลาปิดให้เองเสมอ
 *  - start() โยน error ถ้าตัวเก่ายังไม่ปิดสนิท — ยกเลิกตัวเก่าก่อน และจับ error คืนสถานะ
 *  - event ที่มาช้าจากตัวเก่าไม่ไปทับสถานะของตัวใหม่
 *  - Android ส่งผลลัพธ์ซ้ำสะสม — ประกอบข้อความใหม่จากผลลัพธ์ทั้งหมดทุกครั้ง ไม่ต่อท้าย
 */
export function useSpeechInput(onFinal: (text: string) => void, onError: (message: string) => void) {
  const listening = ref(false)
  const interim = ref('')
  let recognition: Recognition | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let finish: ((deliver: boolean) => void) | null = null

  function start() {
    const Klass = recognitionClass()
    if (!Klass || listening.value) return
    cancel()
    const current = new Klass()
    recognition = current
    current.lang = 'th-TH'
    current.interimResults = true
    current.maxAlternatives = 1
    let finalText = ''
    let liveText = ''
    let done = false

    const end = (deliver: boolean) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (recognition === current) {
        recognition = null
        finish = null
        listening.value = false
        interim.value = ''
      }
      // บางเครื่องจบโดยไม่ติดธง isFinal ใช้ข้อความล่าสุดที่ได้ยินแทน
      const text = (finalText || liveText).trim()
      if (deliver && text) onFinal(text)
    }
    finish = end

    current.onresult = (event) => {
      if (done) return
      let final = ''
      let live = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]!
        if (result.isFinal) final += result[0].transcript
        else live += result[0].transcript
      }
      finalText = final
      liveText = final + live
      interim.value = liveText
    }
    current.onerror = (event) => {
      if (done) return
      if (event.error !== 'aborted') onError(ERRORS[event.error] ?? 'รู้จำเสียงไม่สำเร็จ ลองอีกครั้ง')
      if (event.error !== 'no-speech') end(false)
    }
    current.onend = () => end(true)

    listening.value = true
    try {
      current.start()
    } catch {
      end(false)
      onError('เปิดไมค์ไม่สำเร็จ ลองกดอีกครั้ง')
      return
    }
    timer = setTimeout(stop, MAX_LISTEN_MS)
  }

  /** หยุดฟังแล้วส่งข้อความที่ได้ยิน */
  function stop() {
    const current = recognition
    const end = finish
    if (!current || !end) return
    try {
      current.stop()
    } catch {
      /* ปิดไปแล้ว */
    }
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        current.abort()
      } catch {
        /* ปิดไปแล้ว */
      }
      end(true)
    }, STOP_GRACE_MS)
  }

  /** ยกเลิกโดยไม่ส่งข้อความ เช่น ปิดหน้าต่าง */
  function cancel() {
    const current = recognition
    const end = finish
    if (!current || !end) return
    try {
      current.abort()
    } catch {
      /* ปิดไปแล้ว */
    }
    end(false)
  }

  onBeforeUnmount(cancel)

  return { listening, interim, start, stop, cancel, supported: speechSupported() }
}
