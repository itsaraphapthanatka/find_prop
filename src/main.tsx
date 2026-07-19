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
