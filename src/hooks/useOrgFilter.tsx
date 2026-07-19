import { useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import type { Property } from '../types'

/**
 * ตัวกรององค์กรสำหรับ super "โหมดภาพรวม" (เห็นข้อมูลทุกองค์กรปนกัน)
 * — สร้างตัวเลือกจากรายการทรัพย์ที่โหลดมา (id + ชื่อองค์กร)
 * — หน้าอื่นที่ข้อมูลมี org_id (เช่นแผนเยี่ยมชม) ใช้ matches() กรองได้เหมือนกัน
 * — ผู้ใช้ปกติ/ตอนสวมสิทธิ์: show = false และ matches() ผ่านหมด (ไม่กระทบอะไร)
 */
export function useOrgFilter(items: Property[]) {
  const { profile } = useAuth()
  const superOverview = Boolean(profile?.is_super && !profile?.impersonate_org_id)
  const [fOrg, setFOrg] = useState<string | null>(null) // เก็บเป็น org_id

  const orgs = useMemo(() => {
    const byId = new Map<string, string>()
    for (const p of items) if (p.org_id && p.org_name) byId.set(p.org_id, p.org_name)
    return Array.from(byId, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [items])

  const show = superOverview && orgs.length > 0
  const matches = (orgId: string | null | undefined) =>
    !superOverview || !fOrg || orgId === fOrg

  return { superOverview, show, orgs, fOrg, setFOrg, matches }
}

/** dropdown "องค์กร: ทุกองค์กร ▾" — วางในแถบหัวเพจ/แถบตัวกรองได้เลย */
export function OrgFilterSelect({ filter }: { filter: ReturnType<typeof useOrgFilter> }) {
  if (!filter.show) return null
  // ป้าย+ช่องอยู่ใน <label> เดียวกัน — เป็นก้อนเดียวใน flex จะได้ไม่โดนดันแยกคนละแถว
  return (
    <label className="org-filter">
      <span className="filter-label">องค์กร</span>
      <select
        className="filter-select"
        value={filter.fOrg ?? ''}
        onChange={(e) => filter.setFOrg(e.target.value || null)}
      >
        <option value="">ทุกองค์กร</option>
        {filter.orgs.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  )
}
