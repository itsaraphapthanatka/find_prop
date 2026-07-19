import type { CapacitorConfig } from '@capacitor/cli'

// appId เป็นรหัสถาวรของแอปบน Play Store/App Store — เปลี่ยนไม่ได้หลังเผยแพร่แล้ว
// (ระหว่างทดสอบภายในยังเปลี่ยนได้ แค่ต้องถอนแอปเก่าออกก่อนลงใหม่)
const config: CapacitorConfig = {
  appId: 'com.hobproperty.app',
  appName: 'HOB',
  webDir: 'dist',
}

export default config
