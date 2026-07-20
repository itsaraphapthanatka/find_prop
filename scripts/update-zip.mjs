// แนบ dist ทั้งก้อนเป็น zip + manifest สำหรับ live-update ของแอปมือถือ
// (ดูฝั่งแอปที่ src/lib/appUpdate.ts) — รันต่อท้าย vite build เสมอผ่านสคริปต์ "build"
// จึงได้ผลเหมือนกันทั้งบน Vercel, GitHub Actions และเครื่อง dev
import AdmZip from 'adm-zip'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

// ต้องคำนวณเหมือนกันกับ buildId() ใน vite.config.ts — ค่าเดียวกันทั้งใน bundle และ manifest
function buildId() {
  const fromEnv = process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA
  if (fromEnv) return fromEnv
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

// เวอร์ชัน APK ปัจจุบันของ commit นี้ — แอปตัวเก่ากว่าจะเด้งแถบชวนดาวน์โหลด (ดู appUpdate.ts)
function apkVersion() {
  try {
    const gradle = readFileSync('android/app/build.gradle', 'utf8')
    return gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? null
  } catch {
    return null
  }
}

const APK_URL = 'https://github.com/itsaraphapthanatka/find_prop/releases/download/app-latest/hob.apk'

const version = buildId()
const zip = new AdmZip()
zip.addLocalFolder('dist', undefined, (entry) => !entry.startsWith('app-update.'))
zip.writeZip('dist/app-update.zip')
// builtAt ใช้กันดาวน์เกรด: แอปจะโหลดเฉพาะ bundle ที่ build ใหม่กว่าตัวเอง (ดู appUpdate.ts)
writeFileSync(
  'dist/app-update.json',
  JSON.stringify(
    { version, url: '/app-update.zip', builtAt: Date.now(), apkVersion: apkVersion(), apkUrl: APK_URL },
    null,
    2,
  ) + '\n',
)
console.log(`app-update ready: ${version} (apk ${apkVersion()})`)
