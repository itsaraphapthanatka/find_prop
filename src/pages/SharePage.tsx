// หน้าดูชอร์ตลิสต์ที่นายหน้าแชร์ให้ลูกค้า — เปิดด้วยลิงก์ /#/share/<token> โดยไม่ต้องล็อกอิน
// ข้อมูลมาจาก RPC public_shortlist (SECURITY DEFINER) ซึ่งส่งเฉพาะฟิลด์ในเอกสารเปรียบเทียบ
// ฝั่งนี้จึงไม่มีทางแสดงเบอร์เจ้าของ/บ้านเลขที่/พิกัด แม้เขียนโค้ดผิด — ดู supabase/shortlist-share.sql
import { useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import type { CompareResult, Property, SharedItem } from '../types'
import CompareSheet from '../components/CompareSheet'
import { IconPrint } from '../components/icons'
import { printPage } from '../lib/native'

interface PublicShortlist {
  ok: boolean
  reason?: 'notfound' | 'expired'
  title?: string
  customer_name?: string | null
  requirement?: string | null
  ai?: CompareResult | null
  org_name?: string | null
  expires_at?: string | null
  /** วันที่ของข้อมูลในเอกสาร = วันที่นายหน้าเสนอ (ราคาถูกตรึงไว้ ณ วันนี้) */
  offered_at?: string | null
  items?: SharedItem[]
}

export default function SharePage({ token }: { token: string }) {
  const [data, setData] = useState<PublicShortlist | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseConfigured || !token) return
    void supabase.rpc('public_shortlist', { p_token: token }).then(({ data, error }) => {
      if (error) {
        setError(
          error.message.includes('public_shortlist')
            ? 'ลิงก์นี้ยังใช้ไม่ได้ — ผู้ดูแลระบบยังไม่ได้เปิดระบบลิงก์แชร์'
            : 'เปิดลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง',
        )
      } else {
        setData(data as PublicShortlist)
      }
    })
  }, [token])

  const shell = (children: React.ReactNode) => (
    <div className="share-page">{children}</div>
  )

  if (!supabaseConfigured) return shell(<div className="banner-warn">ยังไม่ได้ตั้งค่าระบบ</div>)
  if (error) return shell(<div className="banner-warn">{error}</div>)
  if (!data) return shell(<div className="loading" style={{ paddingTop: 60 }}>กำลังเปิดเอกสาร…</div>)

  if (!data.ok) {
    return shell(
      <div className="share-gone">
        <h2>{data.reason === 'expired' ? 'ลิงก์นี้หมดอายุแล้ว' : 'ไม่พบเอกสารนี้'}</h2>
        <p>
          {data.reason === 'expired'
            ? 'ลิงก์ดูชอร์ตลิสต์มีวันหมดอายุเพื่อความปลอดภัยของข้อมูล — ติดต่อผู้ที่ส่งลิงก์ให้คุณเพื่อขอลิงก์ใหม่'
            : 'ลิงก์อาจถูกยกเลิก หรือคัดลอกมาไม่ครบ — ติดต่อผู้ที่ส่งลิงก์ให้คุณอีกครั้ง'}
        </p>
      </div>,
    )
  }

  // ข้อมูลจาก RPC เป็นชุดย่อยของ Property (เฉพาะฟิลด์ในเอกสาร) — เติม id/code ให้ครบรูปแบบที่ตารางใช้
  const picked = (data.items ?? []).map((it, i) => ({ id: String(i), ...it })) as Property[]
  // วันที่บนหัวเอกสาร = วันที่เสนอ (ราคาตรึงไว้วันนั้น) ไม่ใช่วันที่ลูกค้าเปิดดู
  const offered = data.offered_at
    ? new Date(data.offered_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : undefined

  return shell(
    <>
      <div className="share-bar">
        <div>
          <b>{data.title}</b>
          {data.org_name && <span className="stop-sub"> · จัดทำโดย {data.org_name}</span>}
        </div>
        <button className="btn sm" onClick={() => void printPage()}>
          <IconPrint size={15} /> พิมพ์ / บันทึก PDF
        </button>
      </div>
      {picked.length === 0 ? (
        <div className="banner-warn">เอกสารนี้ยังไม่มีรายการทรัพย์</div>
      ) : (
        <CompareSheet
          picked={picked}
          customer={data.customer_name}
          requirement={data.requirement}
          ai={data.ai ?? null}
          dateText={offered}
          asOfNote={offered ? `ราคาและข้อมูลในเอกสารนี้เป็นข้อมูล ณ วันที่ ${offered}` : undefined}
        />
      )}
      <p className="share-foot">
        สนใจใช้ระบบจัดการทรัพย์แบบนี้? <a href="#/">HOP — ระบบจัดการอสังหาริมทรัพย์</a>
      </p>
    </>,
  )
}
