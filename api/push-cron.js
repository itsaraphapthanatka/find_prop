// ส่งแจ้งเตือน (1) แผนเยี่ยมชมของ "พรุ่งนี้" (2) นัดติดตามที่ครบกำหนด "วันนี้"
// (3) สัญญาเช่าใกล้หมด (ล่วงหน้าตามตั้งค่า 'contract_alert' — มาตรฐาน 60/30 วัน) — เวลาไทย ผ่าน FCM
// รันอัตโนมัติโดย Vercel Cron ทุก 07:00 น. ไทย (ดู "crons" ใน vercel.json)
// ทดสอบเอง: GET /api/push-cron?test=1 พร้อม header  Authorization: Bearer <CRON_SECRET>
//
// ENV ที่ต้องตั้งใน Vercel (ความลับทั้งหมด — ห้ามอยู่ในโค้ด):
//   FCM_SERVICE_ACCOUNT      JSON ทั้งก้อนจาก Firebase → Project settings → Service accounts
//   SUPABASE_SERVICE_ROLE_KEY  จาก Supabase → Settings → API (service_role)
//   CRON_SECRET              สตริงสุ่มยาวๆ — Vercel จะแนบให้ cron เองอัตโนมัติ
import crypto from 'node:crypto'
import { effectivePlan, isProPlan } from './_lib/plan.js'
import { fetchSetting } from './_lib/settings.js'

const b64url = (buf) => Buffer.from(buf).toString('base64url')

// ขอ OAuth2 access token ของ service account ด้วย JWT RS256 (ไม่ต้องพึ่ง library)
async function fcmAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  )
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key)
  const jwt = `${header}.${claims}.${b64url(sig)}`
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  })
  const data = await res.json().catch(() => null)
  if (!data?.access_token) throw new Error('ขอ access token จาก Google ไม่สำเร็จ')
  return data.access_token
}

/** ส่ง 1 ข้อความ — คืน 'ok' | 'gone' (token ตายแล้ว ควรลบ) | 'error' */
async function sendFcm(sa, accessToken, token, title, body) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ message: { token, notification: { title, body } } }),
  })
  if (res.ok) return 'ok'
  if (res.status === 404) return 'gone'
  const err = await res.json().catch(() => null)
  return err?.error?.status === 'NOT_FOUND' || err?.error?.status === 'UNREGISTERED' ? 'gone' : 'error'
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret || (req.headers.authorization || '') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const saRaw = process.env.FCM_SERVICE_ACCOUNT
  const supaUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!saRaw || !supaUrl || !serviceKey) {
    return res.status(500).json({
      error: 'ตั้ง env ไม่ครบ — ต้องมี FCM_SERVICE_ACCOUNT, SUPABASE_SERVICE_ROLE_KEY (และ VITE_SUPABASE_URL)',
    })
  }
  const sa = JSON.parse(saRaw)
  const sbHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const sb = async (path) => (await fetch(`${supaUrl}/rest/v1/${path}`, { headers: sbHeaders })).json()

  const tokens = await sb('device_tokens?select=token,org_id')
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return res.status(200).json({ sent: 0, note: 'ยังไม่มีเครื่องลงทะเบียนรับแจ้งเตือน' })
  }

  // งานที่จะส่ง: โหมดทดสอบยิงหาทุกเครื่อง / โหมดจริงเฉพาะองค์กรที่มีแผนพรุ่งนี้
  const isTest = /[?&]test=1/.test(req.url || '')
  const jobs = []
  if (isTest) {
    for (const t of tokens) {
      jobs.push({ token: t.token, title: 'HOB — ทดสอบแจ้งเตือน', body: 'ระบบแจ้งเตือนทำงานแล้ว 🎉' })
    }
  } else {
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10) // วันนี้ เวลาไทย
    const tomorrow = new Date(Date.now() + (7 + 24) * 3600e3).toISOString().slice(0, 10) // พรุ่งนี้ เวลาไทย
    const plans = await sb(
      `visit_plans?select=org_id,title,customer_name,stops&visit_date=eq.${tomorrow}`,
    )
    if (!Array.isArray(plans)) return res.status(502).json({ error: 'อ่านแผนเยี่ยมชมไม่สำเร็จ' })
    for (const plan of plans) {
      const stops = Array.isArray(plan.stops) ? plan.stops.length : 0
      const body =
        [plan.customer_name && `ลูกค้า ${plan.customer_name}`, stops > 0 && `${stops} จุดนัดหมาย`]
          .filter(Boolean)
          .join(' · ') || 'เปิดดูรายละเอียดในแอป'
      for (const t of tokens) {
        if (t.org_id && plan.org_id && t.org_id === plan.org_id) {
          jobs.push({ token: t.token, title: `พรุ่งนี้: ${plan.title}`, body })
        }
      }
    }
    // นัดติดตาม (follow_ups) ที่ครบกำหนด "วันนี้" — สรุปเป็น 1 ข้อความต่อองค์กร
    // เฉพาะองค์กรที่เป็น Pro จริงตอนนี้ (นัดติดตาม = ฟีเจอร์ Pro · รวมช่วงทดลองใช้)
    // (ตารางยังไม่ถูกสร้าง → ไม่ใช่ array → ข้ามไปเงียบๆ ไม่ทำให้ cron ล้ม)
    const fus = await sb(
      `follow_ups?select=org_id,title,organizations(plan,trial_plan,trial_expires_at)&status=eq.pending&due_date=eq.${today}`,
    )
    if (Array.isArray(fus) && fus.length > 0) {
      const byOrg = new Map()
      for (const f of fus) {
        if (!f.org_id) continue
        if (!isProPlan(effectivePlan(f.organizations))) continue
        const arr = byOrg.get(f.org_id) ?? []
        arr.push(f.title)
        byOrg.set(f.org_id, arr)
      }
      for (const [orgId, titles] of byOrg) {
        const body = titles.length === 1 ? titles[0] : `${titles[0]} และอีก ${titles.length - 1} รายการ`
        for (const t of tokens) {
          if (t.org_id === orgId) {
            jobs.push({ token: t.token, title: `วันนี้ครบกำหนดติดตาม ${titles.length} นัด`, body })
          }
        }
      }
    }
    // สัญญาเช่าใกล้หมด — แจ้งเมื่อวันสิ้นสุดสัญญาตรงกับ "วันนี้ + N วัน" พอดี (ยิงครั้งเดียวต่อเกณฑ์)
    // เกณฑ์ N: องค์กรตั้งเองได้ (organizations.contract_alert_days — แอดมิน org แก้จากหน้าโปรไฟล์)
    // ไม่ตั้ง = ใช้ค่ามาตรฐานระบบ (app_settings 'contract_alert' — super admin) = 60/30 วัน
    // เฉพาะองค์กร Pro (รวมช่วงทดลองใช้) เหมือนนัดติดตาม · คอลัมน์ยังไม่มี → ข้ามเงียบๆ ไม่ทำให้ cron ล้ม
    const validDays = (arr) =>
      (Array.isArray(arr) ? arr : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 365)
    const alertCfg = await fetchSetting(supaUrl, serviceKey, 'contract_alert')
    const globalDays = validDays(alertCfg?.days)
    const defaultDays = globalDays.length > 0 ? globalDays : [60, 30]
    {
      // ดึงทรัพย์ที่สัญญาจะหมดภายใน 365 วัน แล้วเช็คกับเกณฑ์ของแต่ละองค์กร
      const until = new Date(Date.now() + (7 + 365 * 24) * 3600e3).toISOString().slice(0, 10)
      const props = await sb(
        `properties?select=org_id,code,contract_end,organizations(plan,trial_plan,trial_expires_at,contract_alert_days)` +
          `&contract_end=gte.${today}&contract_end=lte.${until}`,
      )
      if (Array.isArray(props) && props.length > 0) {
        const byOrg = new Map()
        for (const p of props) {
          if (!p.org_id) continue
          if (!isProPlan(effectivePlan(p.organizations))) continue
          const orgDays = validDays(p.organizations?.contract_alert_days)
          const days = orgDays.length > 0 ? orgDays : defaultDays
          const left = Math.round((new Date(`${p.contract_end}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400e3)
          if (!days.includes(left)) continue
          const arr = byOrg.get(p.org_id) ?? []
          arr.push(`${p.code} เหลือ ${left} วัน`)
          byOrg.set(p.org_id, arr)
        }
        for (const [orgId, lines] of byOrg) {
          const body = lines.length <= 3 ? lines.join(' · ') : `${lines.slice(0, 3).join(' · ')} และอีก ${lines.length - 3} รายการ`
          for (const t of tokens) {
            if (t.org_id === orgId) {
              jobs.push({
                token: t.token,
                title: `⏰ สัญญาเช่าใกล้หมด ${lines.length} รายการ`,
                body: `${body} — ได้เวลาคุยต่อสัญญา/หาผู้เช่าใหม่`,
              })
            }
          }
        }
      }
    }
  }
  if (jobs.length === 0) return res.status(200).json({ sent: 0, note: 'ไม่มีแผนเยี่ยมชมพรุ่งนี้/นัดติดตามวันนี้/สัญญาใกล้หมดตามเกณฑ์' })

  const accessToken = await fcmAccessToken(sa)
  let sent = 0
  const gone = []
  for (const j of jobs) {
    const r = await sendFcm(sa, accessToken, j.token, j.title, j.body)
    if (r === 'ok') sent++
    else if (r === 'gone') gone.push(j.token)
  }
  // ล้าง token ของเครื่องที่ถอนแอปไปแล้ว
  for (const t of gone) {
    await fetch(`${supaUrl}/rest/v1/device_tokens?token=eq.${encodeURIComponent(t)}`, {
      method: 'DELETE',
      headers: sbHeaders,
    })
  }
  return res.status(200).json({ sent, cleaned: gone.length, jobs: jobs.length })
}
