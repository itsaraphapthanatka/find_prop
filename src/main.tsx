import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './lib/auth'
import './styles.css'
import 'leaflet/dist/leaflet.css'

// service worker มีไว้เพื่อเว็บ (offline + ติดตั้งเป็น PWA) — ในแอป Capacitor ไฟล์ทั้งหมด
// อยู่ในเครื่องอยู่แล้ว และ SW ที่แคชค้างคือสาเหตุคลาสสิกของจอขาวหลังอัปเดตแอป จึงไม่ลงทะเบียน
if (!Capacitor.isNativePlatform()) {
  registerSW({ immediate: true })
  // Vercel Speed Insights + Web Analytics — เก็บ Core Web Vitals และยอดเข้าชมจากผู้ใช้จริง
  // (เว็บเท่านั้น — ในแอป Capacitor ไม่มี Vercel อยู่เบื้องหลัง ส่งข้อมูลไม่ได้)
  void import('@vercel/speed-insights')
    .then((m) => m.injectSpeedInsights({ framework: 'react' }))
    .catch(() => {})
  void import('@vercel/analytics')
    .then((m) => m.inject())
    .catch(() => {})
} else {
  // ในแอปใช้ live-update แทน SW: ตามเว็บ prod อัตโนมัติโดยไม่ต้องลง APK ใหม่ (ดู lib/appUpdate.ts)
  void import('./lib/appUpdate')
    .then((m) => m.initAppUpdate())
    .catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
)
