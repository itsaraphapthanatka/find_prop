import { PushNotifications } from '@capacitor/push-notifications'
import { isNativeApp } from './native'
import { supabase } from './supabase'

// ลงทะเบียนรับแจ้งเตือน (เฉพาะในแอป เรียกหลังล็อกอินแล้ว) —
// FCM token ถูกผูกกับผู้ใช้+องค์กรในตาราง device_tokens ให้ฝั่งส่ง (api/push-cron.js)
// เลือกยิงเฉพาะสมาชิกองค์กรที่มีแผนเยี่ยมชม
export async function initPush(userId: string, orgId: string | null) {
  if (!isNativeApp) return
  try {
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return

    await PushNotifications.removeAllListeners() // กัน listener ซ้อนเมื่อ login ใหม่/สลับองค์กร
    await PushNotifications.addListener('registration', (t) => {
      void supabase.from('device_tokens').upsert({
        token: t.value,
        user_id: userId,
        org_id: orgId,
        platform: 'android',
        updated_at: new Date().toISOString(),
      })
    })
    // แตะการแจ้งเตือน → เปิดหน้าแผนเยี่ยมชม
    await PushNotifications.addListener('pushNotificationActionPerformed', () => {
      window.location.hash = '#/plans'
    })
    await PushNotifications.register()
  } catch {
    // เครื่องไม่มี Google Play services หรือปลั๊กอินยังไม่มีใน APK เก่า — ข้ามเงียบๆ
  }
}
