import { describe, expect, it } from 'vitest'
import { inAppBrowser } from '@/composables/usePwaInstall'

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

describe('ติดตั้งเป็นแอป: แยกเบราว์เซอร์ในแอปแชต', () => {
  it('เบราว์เซอร์จริงไม่นับเป็นเบราว์เซอร์ในแอป', () => {
    expect(inAppBrowser(ANDROID_CHROME)).toBeNull()
    expect(inAppBrowser(IOS_SAFARI)).toBeNull()
  })

  it('จับ LINE, Facebook และ Instagram ได้ทั้ง iPhone และ Android', () => {
    expect(inAppBrowser(`${IOS_SAFARI} Line/14.10.0`)).toBe('line')
    expect(inAppBrowser(`${ANDROID_CHROME} Line/14.10.0/IAB`)).toBe('line')
    expect(inAppBrowser(`${IOS_SAFARI} [FBAN/FBIOS;FBAV/480.0]`)).toBe('facebook')
    expect(inAppBrowser(`${ANDROID_CHROME} Instagram 350.0.0`)).toBe('instagram')
  })

  it('WebView ทั่วไปของ Android ก็ติดตั้งไม่ได้', () => {
    const webview = ANDROID_CHROME.replace('Pixel 8)', 'Pixel 8; wv)')
    expect(inAppBrowser(webview)).toBe('other')
  })
})
