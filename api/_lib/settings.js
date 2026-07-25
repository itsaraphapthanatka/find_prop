// อ่านค่าตั้งระบบจากตาราง app_settings (ฝั่งเซิร์ฟเวอร์) — super admin แก้ได้จากหน้า Super Admin
// ทนทาน: คอลัมน์เคยเป็น text มาก่อน (review.sql) → ถ้าค่าเป็น string ให้ลอง parse ซ้ำ
// และไม่ throw เด็ดขาด (อ่านพลาด → null ให้ผู้เรียกตัดสินใจ default เอง)

export async function fetchSetting(supaUrl, apiKey, key) {
  try {
    const res = await fetch(
      `${supaUrl}/rest/v1/app_settings?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` } },
    )
    const rows = await res.json().catch(() => null)
    if (!res.ok || !Array.isArray(rows) || !rows[0]) return null
    let v = rows[0].value
    if (typeof v === 'string') {
      try { v = JSON.parse(v) } catch { /* ค่าเป็นข้อความธรรมดา (เช่น 'on') — คืนตามนั้น */ }
    }
    return v
  } catch {
    return null
  }
}

/** แพ็กเกจทดสอบ ฿1 เปิดอยู่ไหม — ไม่มีค่า/อ่านพลาด = ปิด (fail-safe ฝั่งเก็บเงิน) */
export async function paymentTestEnabled(supaUrl, apiKey) {
  const v = await fetchSetting(supaUrl, apiKey, 'payment_test')
  return Boolean(v && typeof v === 'object' && v.enabled === true)
}
