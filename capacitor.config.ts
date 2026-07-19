import type { CapacitorConfig } from '@capacitor/cli'

// appId เป็นรหัสถาวรของแอปบน Play Store/App Store — เปลี่ยนไม่ได้หลังเผยแพร่แล้ว
// (ระหว่างทดสอบภายในยังเปลี่ยนได้ แค่ต้องถอนแอปเก่าออกก่อนลงใหม่)
const config: CapacitorConfig = {
  appId: 'com.hobproperty.app',
  appName: 'HOB',
  webDir: 'dist',
  plugins: {
    // live-update ควบคุมเองที่ src/lib/appUpdate.ts — ปิดโหมดอัตโนมัติของปลั๊กอิน
    // (ค่าเริ่มต้นของมันผูกกับบริการ cloud ของ Capgo ซึ่งเราไม่ได้ใช้)
    CapacitorUpdater: { autoUpdate: false },
  },
}

export default config
