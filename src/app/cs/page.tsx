'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { formatDateTime } from '@/lib/utils'
import { MessageSquare, Search, Plus, AlertTriangle, CheckCircle2, Clock, Trash2 } from 'lucide-react'

export const CS_STORAGE_KEY = 'pm_cs_tickets_v1'
export const CS_NEW_KEY = 'pm_cs_new_flag'
const ORDERS_STORAGE_KEY = 'pm_orders_v1'

type Ticket = {
  id: string; ticket_number: string; type: string; status: string; priority: string
  channel: string; order_id: string|null; customer_name: string; customer_phone: string
  subject: string; content: string; response: string|null; created_at: string
  is_auto?: boolean  // 자동수집된 클레임
}

function loadTickets(): Ticket[] {
  try { const r = localStorage.getItem(CS_STORAGE_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}
function saveTickets(data: Ticket[]) {
  try { localStorage.setItem(CS_STORAGE_KEY, JSON.stringify(data)) } catch {}
}

const ST: Record<string, { label:string; cls:string; icon:React.ReactNode }> = {
  open:        { label:'미처리', cls:'bg-red-50 text-red-700 ring-1 ring-red-200',       icon:<AlertTriangle size={11}/> },
  in_progress: { label:'처리중', cls:'bg-amber-50 text-amber-700 ring-1 ring-amber-200', icon:<Clock size={11}/> },
  resolved:    { label:'해결됨', cls:'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', icon:<CheckCircle2 size={11}/> },
  closed:      { label:'종료',   cls:'bg-slate-100 text-slate-500 ring-1 ring-slate-200', icon:<CheckCircle2 size={11}/> },
}
const PR: Record<string, { label:string; cls:string }> = {
  urgent: { label:'긴급', cls:'bg-red-100 text-red-700' },
  high:   { label:'높음', cls:'bg-orange-100 text-orange-700' },
  medium: { label:'보통', cls:'bg-blue-100 text-blue-700' },
  low:    { label:'낮음', cls:'bg-slate-100 text-slate-500' },
}
const TY: Record<string, { label:string; cls:string }> = {
  inquiry:               { label:'문의',           cls:'bg-blue-100 text-blue-700' },
  complaint:             { label:'불만',           cls:'bg-orange-100 text-orange-700' },
  return:                { label:'반품',           cls:'bg-red-100 text-red-700' },
  exchange:              { label:'교환',           cls:'bg-purple-100 text-purple-700' },
  refund:                { label:'환불',           cls:'bg-pink-100 text-pink-700' },
  claim:                 { label:'클레임',         cls:'bg-rose-100 text-rose-700' },
  cancel_before_invoice: { label:'주문취소(송장전송전)', cls:'bg-amber-100 text-amber-700' },
  other:                 { label:'기타',           cls:'bg-slate-100 text-slate-500' },
}

export default function CSPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [hasNew, setHasNew] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [search, setSearch] = useState('')
  const [sf, setSf] = useState('전체')
  const [tf, setTf] = useState('전체')
  // CS 접수일 필터: 기본 10일 전부터 표시
  const defaultDateFrom = () => {
    const d = new Date(); d.setDate(d.getDate() - 10); return d.toISOString().slice(0, 10)
  }
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [sel, setSel] = useState<Ticket|null>(null)
  const [resp, setResp] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [newStatus, setNewStatus] = useState('처리중으로 변경')
  // 체크박스 선택
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  // 신규 등록 폼
  const [newForm, setNewForm] = useState({ customer_name:'', customer_phone:'', type:'inquiry', priority:'medium', channel:'', order_id:'', subject:'', content:'' })

  useEffect(() => {
    setMounted(true)
    let t = loadTickets()

    // 주문관리의 클레임/취소 주문을 CS로 자동 변환
    try {
      const ordersRaw = localStorage.getItem(ORDERS_STORAGE_KEY)
      if (ordersRaw) {
        const orders = JSON.parse(ordersRaw)
        // is_claim=true 이거나 status=cancelled/return/exchange 인 주문 자동 변환
        const claimOrders = orders.filter((o: {is_claim?:boolean; status:string}) =>
          o.is_claim || ['cancelled', 'return', 'exchange'].includes(o.status)
        )
        const existingOrderIds = new Set(t.map((tk: Ticket) => tk.order_id))
        const newFromClaims: Ticket[] = claimOrders
          .filter((o: {id:string; order_number:string}) => !existingOrderIds.has(o.order_number))
          .map((o: {id:string; order_number:string; channel:string; customer_name:string; customer_phone:string; created_at:string; status:string}) => {
            const csType = o.status === 'cancelled' ? 'cancel_before_invoice'
                         : o.status === 'return'    ? 'return'
                         : o.status === 'exchange'  ? 'exchange'
                         : 'claim'
            const csSubject = o.status === 'cancelled' ? '주문 취소 요청'
                            : o.status === 'return'    ? '반품 요청'
                            : o.status === 'exchange'  ? '교환 요청'
                            : '클레임 접수'
            return {
              id: `cs_${o.id}`,
              ticket_number: `CS-${o.order_number}`,
              type: csType,
              status: 'open',
              priority: 'high',
              channel: o.channel,
              order_id: o.order_number,
              customer_name: o.customer_name,
              customer_phone: o.customer_phone,
              subject: `[자동수집] ${csSubject}`,
              content: `주문번호 ${o.order_number}에 대한 ${csSubject}이 접수되었습니다.`,
              response: null,
              created_at: o.created_at,
              is_auto: true,
            }
          })
        if (newFromClaims.length > 0) {
          t = [...newFromClaims, ...t]
          saveTickets(t)
          localStorage.setItem(CS_NEW_KEY, 'true')
        }
      }
    } catch {}

    setTickets(t)

    // NEW 플래그 확인
    const flag = localStorage.getItem(CS_NEW_KEY)
    if (flag === 'true') setHasNew(true)
  }, [])

  const clearNew = () => {
    setHasNew(false)
    localStorage.removeItem(CS_NEW_KEY)
  }

  const filtered = tickets
    .filter(t => {
      const matchSearch = t.ticket_number.includes(search) || t.customer_name.includes(search) || t.subject.includes(search)
      const matchStatus = sf === '전체' || t.status === sf
      const matchType = tf === '전체' || t.type === tf
      // 접수일 필터: dateFrom 이후
      const matchDate = !dateFrom || new Date(t.created_at) >= new Date(dateFrom)
      return matchSearch && matchStatus && matchType && matchDate
    })
    .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const openCnt = tickets.filter(t=>t.status==='open').length
  const inPrCnt = tickets.filter(t=>t.status==='in_progress').length
  const urgCnt  = tickets.filter(t=>t.priority==='urgent'&&t.status!=='closed').length

  const handleStatusSave = () => {
    if (!sel) return
    const statusMap: Record<string,string> = {
      '처리중으로 변경':'in_progress', '해결됨으로 변경':'resolved', '종료로 변경':'closed'
    }
    const newSt = statusMap[newStatus] || sel.status
    setTickets(prev => {
      const updated = prev.map(t => t.id === sel.id ? { ...t, status: newSt, response: resp } : t)
      saveTickets(updated)
      return updated
    })

    // 주문취소(송장전송전) + 처리완료(resolved/closed) 시 주문관리/배송탭에서 삭제
    if (sel.type === 'cancel_before_invoice' && (newSt === 'resolved' || newSt === 'closed')) {
      // 주문관리에서 삭제 (order_id 기준)
      try {
        const ordersRaw = localStorage.getItem(ORDERS_STORAGE_KEY)
        if (ordersRaw && sel.order_id) {
          const orders = JSON.parse(ordersRaw)
          const filtered = orders.filter((o: {order_number: string}) => o.order_number !== sel.order_id)
          localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(filtered))
        }
      } catch {}
      // 배송/송장에서도 삭제
      try {
        const shippingRaw = localStorage.getItem('pm_shipping_v1')
        if (shippingRaw && sel.order_id) {
          const shipping = JSON.parse(shippingRaw)
          const filtered = shipping.filter((s: {order_number: string}) => s.order_number !== sel.order_id)
          localStorage.setItem('pm_shipping_v1', JSON.stringify(filtered))
        }
      } catch {}
    }

    setSel(null)
  }

  const handleDeleteTicket = (id: string) => {
    setTickets(prev => { const updated = prev.filter(t => t.id !== id); saveTickets(updated); return updated })
    setCheckedIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const handleDeleteSelected = () => {
    if (!checkedIds.size) return
    setTickets(prev => { const updated = prev.filter(t => !checkedIds.has(t.id)); saveTickets(updated); return updated })
    setCheckedIds(new Set())
  }

  const toggleCheck = (id: string) => setCheckedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleAll = (checked: boolean) => setCheckedIds(checked ? new Set(filtered.map(t => t.id)) : new Set())

  const handleNewSubmit = () => {    if (!newForm.customer_name || !newForm.subject || !newForm.content) return
    const ticket: Ticket = {
      id: `cs_${Date.now()}`,
      ticket_number: `CS-${Date.now()}`,
      type: newForm.type,
      status: 'open',
      priority: newForm.priority,
      channel: newForm.channel,
      order_id: newForm.order_id || null,
      customer_name: newForm.customer_name,
      customer_phone: newForm.customer_phone,
      subject: newForm.subject,
      content: newForm.content,
      response: null,
      created_at: new Date().toISOString(),
    }
    setTickets(prev => {
      const updated = [ticket, ...prev]
      saveTickets(updated)
      return updated
    })
    setIsNew(false)
    setNewForm({ customer_name:'', customer_phone:'', type:'inquiry', priority:'medium', channel:'', order_id:'', subject:'', content:'' })
  }

  if (!mounted) return null

  return (
    <div className="space-y-5 max-w-[1600px]">
      {/* NEW 알림 배너 */}
      {hasNew && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', background:'linear-gradient(135deg,#fef2f2,#fff1f2)', border:'1.5px solid #fecdd3', borderRadius:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>🔴</span>
            <div>
              <p style={{ fontSize:13.5, fontWeight:900, color:'#be123c' }}>새 클레임이 수집되었습니다!</p>
              <p style={{ fontSize:12, color:'#f43f5e', marginTop:2 }}>주문수집에서 클레임 주문이 CS관리로 자동 등록되었습니다.</p>
            </div>
          </div>
          <button onClick={clearNew} style={{ padding:'5px 12px', background:'#be123c', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer' }}>확인</button>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'미처리', v:openCnt, cls:'text-red-600 bg-red-50' },
          { label:'처리중', v:inPrCnt, cls:'text-amber-600 bg-amber-50' },
          { label:'긴급',   v:urgCnt,  cls:'text-red-700 bg-red-50' },
          { label:'전체',   v:tickets.length, cls:'text-blue-600 bg-blue-50' },
        ].map(c=>(
          <div key={c.label} className={`rounded-2xl border border-slate-200/80 shadow-sm p-5 ${c.cls}`}>
            <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-[32px] font-extrabold mt-1 leading-none">{c.v}</p>
          </div>
        ))}
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1" style={{ minWidth:200 }}>
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
            <Input placeholder="티켓번호, 고객명, 제목..." value={search} onChange={e=>setSearch(e.target.value)} className="pl-9"/>
          </div>
          <Select value={sf} onChange={e=>setSf(e.target.value)} className="sm:w-36">
            <option value="전체">전체 상태</option>
            <option value="open">미처리</option><option value="in_progress">처리중</option><option value="resolved">해결됨</option><option value="closed">종료</option>
          </Select>
          <Select value={tf} onChange={e=>setTf(e.target.value)} className="sm:w-36">
            <option value="전체">전체 유형</option>
            <option value="inquiry">문의</option><option value="complaint">불만</option><option value="return">반품</option><option value="exchange">교환</option><option value="refund">환불</option><option value="claim">클레임</option><option value="cancel_before_invoice">주문취소(송장전송전)</option>
          </Select>
          {/* 접수일 필터 */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <label style={{ fontSize:11.5, fontWeight:800, color:'#64748b', whiteSpace:'nowrap' }}>접수일 이후:</label>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              max={new Date().toISOString().slice(0,10)}
              style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid #e2e8f0', fontSize:12.5, fontWeight:700, color:'#1e293b', outline:'none', cursor:'pointer' }}
            />
            <button onClick={()=>setDateFrom('')}
              style={{ fontSize:11.5, fontWeight:700, color:'#94a3b8', background:'#f1f5f9', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', whiteSpace:'nowrap' }}>
              전체
            </button>
          </div>
          <Button onClick={()=>setIsNew(true)}><Plus size={14}/>CS 등록</Button>
          {checkedIds.size > 0 && (
            <button onClick={handleDeleteSelected}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:10, border:'1.5px solid #fecaca', fontSize:12.5, fontWeight:800, cursor:'pointer', background:'#fff1f2', color:'#dc2626', whiteSpace:'nowrap' }}>
              <Trash2 size={13}/>선택 삭제 ({checkedIds.size})
            </button>
          )}
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-3 w-8">
                  <input type="checkbox"
                    checked={filtered.length > 0 && checkedIds.size === filtered.length}
                    onChange={e => toggleAll(e.target.checked)}
                    className="rounded"
                  />
                </th>
                {['티켓번호','유형','고객','제목','채널','우선순위','상태','접수일시',''].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-extrabold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign:'center', padding:'3.5rem 1rem', color:'#94a3b8' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                      <MessageSquare size={36} style={{ opacity:0.2 }} />
                      <p style={{ fontSize:13.5, fontWeight:700 }}>CS 티켓이 없습니다</p>
                      <p style={{ fontSize:12, fontWeight:500, color:'#cbd5e1' }}>처리할 문의가 없습니다</p>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map(t=>{
                const st = ST[t.status] ?? ST['open']
                const pr = PR[t.priority] ?? PR['medium']
                const ty = TY[t.type] ?? TY['other']
                const isUrgentOpen = t.status==='open' && t.priority==='urgent'
                const isAutoNew = t.is_auto && t.status === 'open'
                return (
                  <tr key={t.id} onClick={()=>{setSel(t);setResp(t.response||'');setNewStatus('처리중으로 변경')}}
                    className={`transition-colors cursor-pointer group ${isUrgentOpen?'bg-red-50/30 hover:bg-red-50/50':isAutoNew?'bg-orange-50/40 hover:bg-orange-50/60':checkedIds.has(t.id)?'bg-blue-50/50':'hover:bg-slate-50/60'}`}>
                    <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" className="rounded" checked={checkedIds.has(t.id)} onChange={()=>toggleCheck(t.id)}/>
                    </td>
                    <td className="px-4 py-3">
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span className="font-mono font-extrabold text-blue-600 text-[12px]">{t.ticket_number}</span>
                        {isAutoNew && (
                          <span style={{ fontSize:9, fontWeight:900, background:'#dc2626', color:'white', padding:'1px 5px', borderRadius:4, letterSpacing:'0.05em' }}>NEW</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ty.cls}`}>{ty.label}</span></td>
                    <td className="px-4 py-3">
                      <p className="font-extrabold text-slate-800 text-[12.5px]">{t.customer_name}</p>
                      <p className="text-[11px] text-slate-400">{t.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[12.5px] font-bold text-slate-700 max-w-[200px] truncate">{t.subject}</p>
                      {t.order_id&&<p className="text-[10.5px] text-blue-500 font-mono mt-0.5">{t.order_id}</p>}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] font-bold text-slate-500">{t.channel||'-'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${pr.cls}`}>
                        {t.priority==='urgent'&&<AlertTriangle size={9} className="inline mr-0.5"/>}{pr.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${st.cls}`}>
                        {st.icon}{st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11.5px] text-slate-400 whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                    <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                      <button
                        onClick={() => { if(confirm('이 CS를 삭제하시겠습니까?')) handleDeleteTicket(t.id) }}
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:8, border:'none', background:'transparent', cursor:'pointer', color:'#94a3b8', opacity:0, transition:'opacity 150ms' }}
                        className="group-hover:!opacity-100"
                      ><Trash2 size={13}/></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CS 상세/답변 */}
      {sel && (
        <Modal isOpen={!!sel} onClose={()=>setSel(null)} title="CS 상세 및 답변" size="lg">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono font-extrabold text-blue-600 text-[14px]">{sel.ticket_number}</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {[TY[sel.type]??TY['other'], PR[sel.priority]??PR['medium']].map((t,i)=><span key={i} className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${t.cls}`}>{t.label}</span>)}
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${(ST[sel.status]??ST['open']).cls}`}>{(ST[sel.status]??ST['open']).icon}{(ST[sel.status]??ST['open']).label}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">{formatDateTime(sel.created_at)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl">
              <div><p className="text-[10px] font-extrabold text-slate-400 uppercase">고객명</p><p className="font-extrabold text-slate-800 mt-1">{sel.customer_name}</p></div>
              <div><p className="text-[10px] font-extrabold text-slate-400 uppercase">연락처</p><p className="font-extrabold text-slate-800 mt-1">{sel.customer_phone}</p></div>
              {sel.order_id&&<div><p className="text-[10px] font-extrabold text-slate-400 uppercase">연관 주문</p><p className="font-extrabold text-blue-600 font-mono mt-1">{sel.order_id}</p></div>}
              <div><p className="text-[10px] font-extrabold text-slate-400 uppercase">채널</p><p className="font-extrabold text-slate-800 mt-1">{sel.channel||'-'}</p></div>
            </div>
            <div>
              <p className="text-[11px] font-extrabold text-slate-400 uppercase mb-2">제목</p>
              <p className="font-extrabold text-slate-800 text-[14px]">{sel.subject}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl">
              <p className="text-[11px] font-extrabold text-slate-400 uppercase mb-2">고객 문의 내용</p>
              <p className="text-[13px] text-slate-700 leading-relaxed font-bold">{sel.content}</p>
            </div>
            <div>
              <label className="block text-[12px] font-extrabold text-slate-700 mb-1.5">답변 작성</label>
              <textarea className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-[13px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none" rows={4} placeholder="고객에게 전달할 답변을 입력하세요..." value={resp} onChange={e=>setResp(e.target.value)}/>
            </div>
            {sel.type === 'cancel_before_invoice' && (
              <div style={{ padding:'10px 14px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, fontSize:12, fontWeight:700, color:'#92400e' }}>
                ⚠️ <b>주문취소(송장전송전)</b> 유형입니다. 해결됨/종료로 변경 시 해당 주문이 <b>주문관리</b> 및 <b>배송/송장</b> 목록에서 자동 삭제됩니다.
              </div>
            )}
            <div className="flex justify-between items-center pt-2">
              <Select className="w-44" value={newStatus} onChange={e=>setNewStatus(e.target.value)}>
                <option>처리중으로 변경</option><option>해결됨으로 변경</option><option>종료로 변경</option>
              </Select>
              <div className="flex gap-2">
                <Button variant="outline" onClick={()=>setSel(null)}>닫기</Button>
                <Button onClick={handleStatusSave}>답변 저장</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* CS 신규 등록 */}
      <Modal isOpen={isNew} onClose={()=>setIsNew(false)} title="CS 등록">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[12px] font-extrabold text-slate-600 mb-1.5">고객명 *</label><Input placeholder="고객명" value={newForm.customer_name} onChange={e=>setNewForm(f=>({...f,customer_name:e.target.value}))}/></div>
            <div><label className="block text-[12px] font-extrabold text-slate-600 mb-1.5">연락처</label><Input placeholder="010-0000-0000" value={newForm.customer_phone} onChange={e=>setNewForm(f=>({...f,customer_phone:e.target.value}))}/></div>
            <div><label className="block text-[12px] font-extrabold text-slate-600 mb-1.5">유형 *</label><Select className="w-full" value={newForm.type} onChange={e=>setNewForm(f=>({...f,type:e.target.value}))}><option value="inquiry">문의</option><option value="complaint">불만</option><option value="return">반품</option><option value="exchange">교환</option><option value="refund">환불</option><option value="claim">클레임</option><option value="cancel_before_invoice">주문취소(송장전송전)</option><option value="other">기타</option></Select></div>
            <div><label className="block text-[12px] font-extrabold text-slate-600 mb-1.5">우선순위</label><Select className="w-full" value={newForm.priority} onChange={e=>setNewForm(f=>({...f,priority:e.target.value}))}><option value="low">낮음</option><option value="medium">보통</option><option value="high">높음</option><option value="urgent">긴급</option></Select></div>
            <div><label className="block text-[12px] font-extrabold text-slate-600 mb-1.5">채널</label><Input placeholder="쿠팡, 네이버 등" value={newForm.channel} onChange={e=>setNewForm(f=>({...f,channel:e.target.value}))}/></div>
            <div><label className="block text-[12px] font-extrabold text-slate-600 mb-1.5">연관 주문번호</label><Input placeholder="ORD-2026-XXXX" value={newForm.order_id} onChange={e=>setNewForm(f=>({...f,order_id:e.target.value}))}/></div>
          </div>
          <div><label className="block text-[12px] font-extrabold text-slate-600 mb-1.5">제목 *</label><Input placeholder="CS 제목" value={newForm.subject} onChange={e=>setNewForm(f=>({...f,subject:e.target.value}))}/></div>
          <div><label className="block text-[12px] font-extrabold text-slate-600 mb-1.5">내용 *</label><textarea className="w-full rounded-2xl border border-slate-200 px-3.5 py-2.5 text-[13px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none" rows={4} placeholder="고객 문의 내용 입력" value={newForm.content} onChange={e=>setNewForm(f=>({...f,content:e.target.value}))}/></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={()=>setIsNew(false)}>취소</Button>
            <Button onClick={handleNewSubmit}>등록하기</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
