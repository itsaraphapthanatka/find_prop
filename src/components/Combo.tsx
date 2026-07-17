import { useEffect, useRef, useState } from 'react'

interface ComboProps {
  value: string | null
  onChange: (v: string | null) => void
  options: string[]
  placeholder?: string
  required?: boolean
}

/** Dropdown แบบ "เลือกหรือพิมพ์เพิ่ม" (เทียบ Add or search ของ AppSheet) */
export default function Combo({
  value, onChange, options, placeholder = 'เลือก…', required,
}: ComboProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = text.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options
  const showAdd = q.length > 0 && !options.some((o) => o.toLowerCase() === q)

  const pick = (v: string | null) => {
    onChange(v)
    setOpen(false)
    setText('')
  }

  return (
    <div className={`combo ${open ? 'open' : ''}`} ref={wrapRef}>
      <input
        required={required}
        value={open ? text : value ?? ''}
        placeholder={value ?? placeholder}
        onFocus={() => { setOpen(true); setText('') }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter') {
            e.preventDefault()
            if (filtered.length === 1) pick(filtered[0])
            else if (showAdd) pick(text.trim())
          }
        }}
      />
      <span className="combo-caret" onClick={() => setOpen((o) => !o)}>▾</span>
      {open && (
        <div className="combo-menu">
          {value && (
            <button type="button" className="combo-item muted" onMouseDown={() => pick(null)}>
              ✕ ล้างค่า
            </button>
          )}
          {filtered.map((o) => (
            <button
              type="button"
              key={o}
              className={`combo-item ${o === value ? 'sel' : ''}`}
              onMouseDown={() => pick(o)}
            >
              {o}
            </button>
          ))}
          {showAdd && (
            <button type="button" className="combo-item add" onMouseDown={() => pick(text.trim())}>
              ＋ เพิ่ม "{text.trim()}"
            </button>
          )}
          {filtered.length === 0 && !showAdd && (
            <div className="combo-empty">พิมพ์เพื่อเพิ่มตัวเลือกใหม่</div>
          )}
        </div>
      )}
    </div>
  )
}

interface MultiSelectProps {
  values: string[]
  onChange: (v: string[]) => void
  options: string[]
}

/** เลือกหลายค่าแบบ chip กด + เพิ่มตัวเลือกใหม่ได้ */
export function MultiSelect({ values, onChange, options }: MultiSelectProps) {
  const [extra, setExtra] = useState('')
  const all = Array.from(new Set([...options, ...values]))
  const toggle = (o: string) =>
    onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o])
  const addExtra = () => {
    const v = extra.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setExtra('')
  }
  return (
    <div>
      <div className="chip-select">
        {all.map((o) => (
          <button
            type="button"
            key={o}
            className={`chip-toggle ${values.includes(o) ? 'on' : ''}`}
            onClick={() => toggle(o)}
          >
            {values.includes(o) ? '✓ ' : ''}{o}
          </button>
        ))}
      </div>
      <div className="combo-extra">
        <input
          type="text"
          placeholder="เพิ่มตัวเลือกใหม่…"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addExtra()
            }
          }}
        />
        <button type="button" className="btn" onClick={addExtra}>เพิ่ม</button>
      </div>
    </div>
  )
}
