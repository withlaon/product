'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight, Truck } from 'lucide-react'

/* ── 타입 ── */
interface LogisticsEntry {
  id: string
  date: string
  amount: number
  memo: string
  created_at?: string
}

/* ── 날짜 헬퍼 ── */
function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getCurYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`
}
function fmtMonthLabel(ym: string) {
  return `${ym.slice(0,4)}년 ${ym.slice(5)}월`
}
function fmtDateKr(d: string) {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  const days = ['일','월','화','수','목','금','토']
  return `${dt.getMonth()+1}월 ${dt.getDate()}일(${days[dt.getDay()]})`
}

/* ── API 헬퍼 ── */
async function apiGet(): Promise<LogisticsEntry[]> {
  try {
    const r = await fetch('/api/pm-logistics')
    if (!r.ok) return []
    const d = await r.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}
async function apiPost(body: Omit<LogisticsEntry, 'id' | 'created_at'>): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('/api/pm-logistics', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    const d = await r.json()
    return r.ok ? { ok: true } : { ok: false, error: d.error ?? `${r.status}` }
  } catch(e) { return { ok:false, error: String(e) } }
}
async function apiPatch(id: string, fields: Partial<LogisticsEntry>): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('/api/pm-logistics', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, ...fields }) })
    const d = await r.json()
    return r.ok ? { ok: true } : { ok: false, error: d.error ?? `${r.status}` }
  } catch(e) { return { ok:false, error: String(e) } }
}
async function apiDelete(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('/api/pm-logistics', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
    const d = await r.json()
    return r.ok ? { ok: true } : { ok: false, error: d.error ?? `${r.status}` }
  } catch(e) { return { ok:false, error: String(e) } }
}

/* ── 빈 폼 ── */
const EMPTY_FORM = () => ({ date: getToday(), amount: '', memo: '' })

/* ── 컴포넌트 ── */
export default function LogisticsPage() {
  const curYM = getCurYM()
  const [entries, setEntries]   = useState<LogisticsEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [selMonth, setSelMonth] = useState(curYM)
  const [isModal, setIsModal]   = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [form, setForm]         = useState(EMPTY_FORM())
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await apiGet()
    setEntries(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /* 선택 월 항목 */
  const monthEntries = useMemo(() =>
    entries
      .filter(e => e.date?.slice(0,7) === selMonth)
      .sort((a, b) => b.date.localeCompare(a.date))
  , [entries, selMonth])

  /* 월별 합계 */
  const monthTotal = useMemo(() =>
    monthEntries.reduce((s, e) => s + (e.amount || 0), 0)
  , [monthEntries])

  /* 최근 6개월 통계 */
  const monthStats = useMemo(() => {
    const months: string[] = []
    for (let i = 5; i >= 0; i--) months.push(shiftMonth(curYM, -i))
    return months.map(ym => ({
      ym,
      total: entries.filter(e => e.date?.slice(0,7) === ym).reduce((s, e) => s + (e.amount || 0), 0),
    }))
  }, [entries, curYM])

  /* 모달 열기 */
  function openAdd() {
    setEditId(null)
    setForm(EMPTY_FORM())
    setIsModal(true)
  }
  function openEdit(e: LogisticsEntry) {
    setEditId(e.id)
    setForm({ date: e.date, amount: String(e.amount), memo: e.memo ?? '' })
    setIsModal(true)
  }
  function closeModal() {
    setIsModal(false)
    setEditId(null)
    setForm(EMPTY_FORM())
  }

  /* 저장 */
  async function handleSave() {
    const amount = Number(form.amount)
    if (!form.date || isNaN(amount) || amount <= 0) {
      alert('날짜와 금액을 올바르게 입력하세요.')
      return
    }
    setSaving(true)
    const payload = { date: form.date, amount, memo: form.memo }
    const result = editId
      ? await apiPatch(editId, payload)
      : await apiPost(payload)
    if (!result.ok) {
      alert(`저장 실패: ${result.error}`)
      setSaving(false)
      return
    }
    await load()
    closeModal()
    setSaving(false)
  }

  /* 삭제 */
  async function handleDelete(id: string) {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return
    const result = await apiDelete(id)
    if (!result.ok) { alert(`삭제 실패: ${result.error}`); return }
    await load()
  }

  const maxStat = Math.max(...monthStats.map(s => s.total), 1)

  return (
    <div className="pm-page" style={{ display:'flex', flexDirection:'column', height:'100%', gap:10 }}>

      {/* ── 헤더 ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:10, background:'#f0f9ff', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Truck size={16} color="#0369a1" />
          </div>
          <div>
            <p style={{ fontSize:'15px', fontWeight:900, color:'#0f172a', lineHeight:1 }}>물류비 관리</p>
            <p style={{ fontSize:'10px', color:'#94a3b8', fontWeight:600, marginTop:1 }}>일별 물류비 등록 및 월별 통계</p>
          </div>
        </div>
        <button onClick={openAdd}
          style={{ display:'flex', alignItems:'center', gap:5, fontSize:'12.5px', fontWeight:800, color:'white', background:'#0369a1', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer' }}>
          <Plus size={13}/>물류비 등록
        </button>
      </div>

      {/* ── 최근 6개월 통계 바 ── */}
      <div className="pm-card" style={{ padding:'14px 18px', flexShrink:0 }}>
        <p style={{ fontSize:'11px', fontWeight:800, color:'#94a3b8', marginBottom:10 }}>최근 6개월 물류비</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
          {monthStats.map(s => (
            <div key={s.ym}
              onClick={() => setSelMonth(s.ym)}
              style={{ cursor:'pointer', textAlign:'center' }}>
              <div style={{ position:'relative', height:60, background:'#f8fafc', borderRadius:8, overflow:'hidden',
                border: selMonth === s.ym ? '2px solid #0369a1' : '1.5px solid #e2e8f0' }}>
                {s.total > 0 && (
                  <div style={{
                    position:'absolute', bottom:0, left:0, right:0,
                    height:`${Math.round((s.total / maxStat) * 100)}%`,
                    background: selMonth === s.ym ? '#0369a1' : '#bae6fd',
                    borderRadius:'6px 6px 0 0',
                    transition: 'height 0.3s ease',
                  }}/>
                )}
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ fontSize:'10px', fontWeight:800, color: selMonth === s.ym ? '#0369a1' : (s.total > 0 ? '#0f172a' : '#94a3b8'), zIndex:1 }}>
                    {s.total > 0 ? (s.total >= 10000 ? `${Math.round(s.total/10000)}만` : s.total.toLocaleString()) : '-'}
                  </span>
                </div>
              </div>
              <p style={{ fontSize:'9.5px', fontWeight:700, color: selMonth === s.ym ? '#0369a1' : '#64748b', marginTop:4 }}>
                {Number(s.ym.slice(5))}월
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 선택 월 목록 ── */}
      <div className="pm-card" style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', padding:0 }}>
        {/* 헤더 */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <button onClick={() => setSelMonth(m => shiftMonth(m, -1))}
                style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #e2e8f0', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <ChevronLeft size={12}/>
              </button>
              <span style={{ fontSize:'13px', fontWeight:800, color:'#0f172a', minWidth:90, textAlign:'center' }}>
                {fmtMonthLabel(selMonth)}
              </span>
              <button onClick={() => setSelMonth(m => shiftMonth(m, 1))} disabled={selMonth >= curYM}
                style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #e2e8f0', background:'white', cursor:selMonth>=curYM?'not-allowed':'pointer', opacity:selMonth>=curYM?0.4:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <ChevronRight size={12}/>
              </button>
              <button onClick={() => setSelMonth(curYM)}
                style={{ fontSize:'10.5px', fontWeight:700, color:'#0369a1', background:'#f0f9ff', border:'none', borderRadius:6, padding:'4px 9px', cursor:'pointer' }}>
                이번달
              </button>
            </div>
            <span style={{ fontSize:'11px', color:'#94a3b8' }}>{monthEntries.length}건</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:'11px', color:'#64748b', fontWeight:700 }}>월 합계</span>
            <span style={{ fontSize:'17px', fontWeight:900, color:'#0369a1' }}>
              ₩{monthTotal.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 목록 */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#94a3b8', fontSize:'13px' }}>로딩 중...</div>
          ) : monthEntries.length === 0 ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:8 }}>
              <Truck size={28} color="#e2e8f0" />
              <p style={{ fontSize:'13px', color:'#94a3b8', fontWeight:600 }}>등록된 물류비가 없습니다</p>
              <button onClick={openAdd}
                style={{ fontSize:'11.5px', fontWeight:700, color:'#0369a1', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:7, padding:'5px 14px', cursor:'pointer' }}>
                + 물류비 등록
              </button>
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {['날짜','금액','메모',''].map(h => (
                    <th key={h} style={{ padding:'7px 14px', fontSize:'10.5px', fontWeight:800, color:'#94a3b8', textAlign: h === '금액' ? 'right' : 'left', borderBottom:'1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthEntries.map(e => (
                  <tr key={e.id} style={{ borderBottom:'1px solid #f8fafc' }}
                    onMouseEnter={ev => (ev.currentTarget.style.background='#f8fafc')}
                    onMouseLeave={ev => (ev.currentTarget.style.background='transparent')}>
                    <td style={{ padding:'10px 14px', fontSize:'13px', fontWeight:700, color:'#0f172a', whiteSpace:'nowrap' }}>
                      {fmtDateKr(e.date)}
                    </td>
                    <td style={{ padding:'10px 14px', fontSize:'14px', fontWeight:900, color:'#0369a1', textAlign:'right', whiteSpace:'nowrap' }}>
                      ₩{(e.amount || 0).toLocaleString()}
                    </td>
                    <td style={{ padding:'10px 14px', fontSize:'12px', color:'#64748b' }}>
                      {e.memo || <span style={{ color:'#e2e8f0' }}>-</span>}
                    </td>
                    <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}>
                      <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                        <button onClick={() => openEdit(e)}
                          style={{ width:26, height:26, borderRadius:6, border:'1px solid #e2e8f0', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Edit2 size={11} color="#64748b"/>
                        </button>
                        <button onClick={() => handleDelete(e.id)}
                          style={{ width:26, height:26, borderRadius:6, border:'1px solid #fee2e2', background:'#fff1f2', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Trash2 size={11} color="#dc2626"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── 등록/수정 모달 ── */}
      <Modal isOpen={isModal} onClose={closeModal} title={editId ? '물류비 수정' : '물류비 등록'} size="sm">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ display:'block', fontSize:'11.5px', fontWeight:800, color:'#475569', marginBottom:5 }}>날짜 *</label>
            <Input type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              max={getToday()}
            />
          </div>
          <div>
            <label style={{ display:'block', fontSize:'11.5px', fontWeight:800, color:'#475569', marginBottom:5 }}>금액 (원) *</label>
            <Input type="number" min={0} placeholder="예: 50000"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div>
            <label style={{ display:'block', fontSize:'11.5px', fontWeight:800, color:'#475569', marginBottom:5 }}>메모</label>
            <select
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              style={{ width:'100%', height:38, padding:'0 10px', fontSize:'13px', fontWeight:700, color: form.memo ? '#0f172a' : '#94a3b8', border:'1.5px solid #e2e8f0', borderRadius:8, background:'white', cursor:'pointer', outline:'none' }}>
              <option value="">선택하세요</option>
              <option value="물류비">물류비</option>
              <option value="화물비">화물비</option>
            </select>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:4 }}>
            <Button variant="outline" onClick={closeModal}>취소</Button>
            <Button onClick={handleSave} disabled={saving}
              style={{ background:'#0369a1', color:'white', border:'none' }}>
              {saving ? '저장 중...' : (editId ? '수정' : '등록')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
