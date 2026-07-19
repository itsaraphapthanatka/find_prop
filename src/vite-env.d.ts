/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// ค่าที่ inject ตอน build (vite.config.ts → define) — ใช้โดย live-update
declare const __BUILD_ID__: string // commit ของโค้ดชุดนี้
declare const __BUILT_AT__: number // เวลาที่ build (epoch ms) — ไว้เทียบว่าอะไรใหม่กว่า
