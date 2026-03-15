'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Search, Download, RefreshCw, Eye, Truck, Play, Clock, X, CheckSquare, Package, Trash2 } from 'lucide-react'

/* ── 공유 스토리지 키 ── */
export const CHANNEL_STORAGE_KEY = 'pm_mall_channels_v3'
export const ORDERS_STORAGE_KEY  = 'pm_orders_v1'
export const SHIPPING_STORAGE_KEY = 'pm_shipping_v1'
export const CS_NEW_KEY = 'pm_cs_new_flag'

/* ── 타입 ── */
type OrderItem = { name: string; sku: string; quantity: number; price: number }
export type Order = {
  id: string; order_number: string; channel: string; channel_order_id: string
  customer_name: string; customer_phone: string; shipping_address: string
  status: string; total_amount: number; shipping_fee: number
  tracking_number: string|null; carrier: string|null
  created_at: string; items: OrderItem[]
  is_claim?: boolean  // 반품/교환/취소 클레임 여부
}

export type ShipItem = {
  id: string; order_number: string; channel: string
  customer_name: string; customer_phone: string; shipping_address: string
  items: string; status: string; tracking_number: string|null; carrier: string|null
  weight: string; shipped_at: string|null; created_at: string
}

const ST: Record<string, { label:string; dot:string; cls:string }> = {
  pending:    { label:'대기중',  dot:'#f59e0b', cls:'pm-badge pm-badge-yellow' },
  confirmed:  { label:'확인됨',  dot:'#3b82f6', cls:'pm-badge pm-badge-blue' },
  processing: { label:'처리중',  dot:'#6366f1', cls:'pm-badge pm-badge-indigo' },
  shipped:    { label:'배송중',  dot:'#a855f7', cls:'pm-badge pm-badge-purple' },
  delivered:  { label:'완료',    dot:'#22c55e', cls:'pm-badge pm-badge-green' },
  cancelled:  { label:'취소',    dot:'#ef4444', cls:'pm-badge pm-badge-red' },
}

const statCards = [
  { label:'주문 대기', key:'pending',    bg:'#fffbeb', color:'#d97706' },
  { label:'처리중',    key:'processing', bg:'#eef2ff', color:'#4338ca' },
  { label:'배송중',    key:'shipped',    bg:'#faf5ff', color:'#7e22ce' },
  { label:'배송완료',  key:'delivered',  bg:'#f0fdf4', color:'#15803d' },
]

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:12, fontWeight:800, color:'#475569', marginBottom:6 }}>{children}</label>
}

function loadOrders(): Order[] {
  try { const r = localStorage.getItem(ORDERS_STORAGE_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}
function saveOrders(data: Order[]) {
  try { localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(data)) } catch {}
}
function loadShipping(): ShipItem[] {
  try { const r = localStorage.getItem(SHIPPING_STORAGE_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}
function saveShipping(data: ShipItem[]) {
  try { localStorage.setItem(SHIPPING_STORAGE_KEY, JSON.stringify(data)) } catch {}
}

/* ── 샘플 주문 생성 (수집 시뮬레이션) ── */
function makeSampleOrders(channelName: string, count = 3): Order[] {
  const names = ['김민준','이서연','박지훈','최수아','정예준','윤지아','강민서','오하은']
  const products = ['스웨이드 백', '가벼운 캔버스 가방', '심플 베이직 가방', '딜라이트 캔버스백', '작고 가벼운 백팩']
  const skus = ['BE','BK','WH','BR','IV','GR']
  return Array.from({ length: count }, (_, i) => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - i * 7)
    const isClaim = Math.random() < 0.2
    return {
      id: `${channelName}_${Date.now()}_${i}`,
      order_number: `ORD-${Date.now()}-${String(i).padStart(3,'0')}`,
      channel: channelName,
      channel_order_id: `CH-${Math.floor(Math.random()*900000+100000)}`,
      customer_name: names[Math.floor(Math.random()*names.length)],
      customer_phone: `010-${Math.floor(Math.random()*9000+1000)}-${Math.floor(Math.random()*9000+1000)}`,
      shipping_address: `서울시 강남구 테헤란로 ${Math.floor(Math.random()*400+1)}`,
      status: isClaim ? 'cancelled' : 'pending',
      total_amount: Math.floor(Math.random()*80000+15000),
      shipping_fee: 3000,
      tracking_number: null,
      carrier: null,
      created_at: now.toISOString(),
      items: [{ name: products[Math.floor(Math.random()*products.length)], sku: skus[Math.floor(Math.random()*skus.length)], quantity: Math.floor(Math.random()*2)+1, price: Math.floor(Math.random()*50000+10000) }],
      is_claim: isClaim,
    }
  })
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [search, setSearch] = useState('')
  const [sf, setSf] = useState('전체')
  const [cf, setCf] = useState('전체')
  const [sel, setSel] = useState<Order|null>(null)
  const [trackModal, setTrackModal] = useState(false)
  const [trackOrder, setTrackOrder] = useState<Order|null>(null)
  const [trackCarrier, setTrackCarrier] = useState('CJ대한통운')
  const [trackNum, setTrackNum] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)

  // 연동 쇼핑몰
  const [connectedMalls, setConnectedMalls] = useState<{key:string;name:string}[]>([])

  // 주문 수집 모달
  const [collectModal, setCollectModal] = useState(false)
  const [collectSelected, setCollectSelected] = useState<Set<string>>(new Set())
  const [collecting, setCollecting] = useState(false)
  const [collectDone, setCollectDone] = useState(false)
  // 수집 기간 선택
  const [collectRange, setCollectRange] = useState<'1'|'3'|'5'|'7'|'custom'>('1')
  const [collectCustomDate, setCollectCustomDate] = useState('')

  // 자동 수집 설정 모달
  const [autoModal, setAutoModal] = useState(false)
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoInterval, setAutoInterval] = useState('30')
  const [autoUnit, setAutoUnit] = useState<'분'|'시간'>('분')
  const [autoMalls, setAutoMalls] = useState<Set<string>>(new Set())
  const autoTimerRef = useRef<ReturnType<typeof setInterval>|null>(null)
  const [autoNextAt, setAutoNextAt] = useState<string>('')

  useEffect(() => {
    setMounted(true)
    setOrders(loadOrders())
    try {
      const raw = localStorage.getItem(CHANNEL_STORAGE_KEY)
      if (raw) {
        const parsed: {key:string;name:string;active:boolean}[] = JSON.parse(raw)
        const arr = Array.isArray(parsed)
          ? parsed.filter(c => c.active).map(c => ({ key:c.key, name:c.name }))
          : []
        setConnectedMalls(arr)
      }
    } catch {}
    // 자동수집 설정 복원
    try {
      const saved = localStorage.getItem('pm_auto_collect')
      if (saved) {
        const v = JSON.parse(saved)
        setAutoEnabled(v.enabled); setAutoInterval(v.interval); setAutoUnit(v.unit)
        setAutoMalls(new Set(v.malls))
      }
    } catch {}
  }, [])

  /* 자동수집 타이머 */
  const runCollect = useCallback((malls: string[]) => {
    if (!malls.length) return
    const newOrd: Order[] = []
    malls.forEach(key => {
      const mall = connectedMalls.find(m => m.key === key)
      if (!mall) return
      newOrd.push(...makeSampleOrders(mall.name, 2))
    })
    setOrders(prev => {
      const merged = [...newOrd, ...prev].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      saveOrders(merged)
      // 클레임 있으면 CS NEW 플래그
      if (newOrd.some(o => o.is_claim)) {
        localStorage.setItem(CS_NEW_KEY, 'true')
      }
      return merged
    })
  }, [connectedMalls])

  useEffect(() => {
    if (!mounted) return
    if (autoTimerRef.current) clearInterval(autoTimerRef.current)
    if (!autoEnabled || !autoMalls.size) return
    const ms = autoUnit === '분' ? Number(autoInterval)*60000 : Number(autoInterval)*3600000
    const next = new Date(Date.now() + ms)
    setAutoNextAt(next.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }))
    autoTimerRef.current = setInterval(() => {
      runCollect(Array.from(autoMalls))
      const n2 = new Date(Date.now() + ms)
      setAutoNextAt(n2.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }))
    }, ms)
    return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current) }
  }, [autoEnabled, autoInterval, autoUnit, autoMalls, mounted, runCollect])

  const saveAutoSettings = () => {
    const v = { enabled:autoEnabled, interval:autoInterval, unit:autoUnit, malls:Array.from(autoMalls) }
    localStorage.setItem('pm_auto_collect', JSON.stringify(v))
    setAutoModal(false)
  }

  /* 주문 수집 */
  const handleCollect = () => {
    if (!collectSelected.size) return
    setCollecting(true)
    setTimeout(() => {
      // 수집 시작일 계산
      let startDate: Date
      if (collectRange === 'custom' && collectCustomDate) {
        startDate = new Date(collectCustomDate)
      } else {
        const days = parseInt(collectRange)
        startDate = new Date()
        startDate.setDate(startDate.getDate() - days)
        startDate.setHours(0, 0, 0, 0)
      }

      const newOrd: Order[] = []
      collectSelected.forEach(key => {
        const mall = connectedMalls.find(m => m.key === key)
        if (!mall) return
        const samples = makeSampleOrders(mall.name)
        // 신규주문(pending)만 수집 - 배송준비/배송중/배송완료 제외
        const newOnly = samples.filter(o => o.status === 'pending' && !o.is_claim)
        // 수집 기간 내 주문만 포함 (시뮬레이션이므로 created_at을 수집 기간 내로 설정)
        newOnly.forEach(o => {
          const orderDate = new Date()
          orderDate.setDate(orderDate.getDate() - Math.floor(Math.random() * parseInt(collectRange === 'custom' ? '1' : collectRange)))
          o.created_at = orderDate.toISOString()
        })
        newOrd.push(...newOnly)
      })

      // 이미 수집된 주문과 중복 제거 (order_number 기준)
      const existingNums = new Set(orders.map(o => o.order_number))
      const deduped = newOrd.filter(o => !existingNums.has(o.order_number))

      setOrders(prev => {
        const merged = [...deduped, ...prev].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        saveOrders(merged)
        if (deduped.some(o => o.is_claim)) localStorage.setItem(CS_NEW_KEY, 'true')
        return merged
      })
      setCollecting(false)
      setCollectDone(true)
    }, 1200)
  }

  /* 배송준비 이동 */
  const handleReadyShipping = () => {
    if (!selectedIds.size) return
    const chosen = orders.filter(o => selectedIds.has(o.id))
    const shipItems: ShipItem[] = chosen.map(o => ({
      id: o.id, order_number: o.order_number, channel: o.channel,
      customer_name: o.customer_name, customer_phone: o.customer_phone,
      shipping_address: o.shipping_address,
      items: o.items.map(i => `${i.name}(${i.sku}×${i.quantity})`).join(', '),
      status: 'ready', tracking_number: null, carrier: null,
      weight: '', shipped_at: null, created_at: o.created_at,
    }))
    const existing = loadShipping()
    const existingIds = new Set(existing.map(s => s.id))
    const toAdd = shipItems.filter(s => !existingIds.has(s.id))
    saveShipping([...toAdd, ...existing])
    // 주문 상태 업데이트
    setOrders(prev => {
      const updated = prev.map(o => selectedIds.has(o.id) ? { ...o, status:'processing' } : o)
      saveOrders(updated)
      return updated
    })
    setSelectedIds(new Set())
    alert(`${toAdd.length}건이 배송/송장 탭으로 이동되었습니다.`)
  }

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(filtered.map(o => o.id)) : new Set())
  }

  const handleDeleteOrder = (id: string) => {
    setOrders(prev => {
      const updated = prev.filter(o => o.id !== id)
      saveOrders(updated)
      return updated
    })
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const handleDeleteSelected = () => {
    if (!selectedIds.size) return
    setOrders(prev => {
      const updated = prev.filter(o => !selectedIds.has(o.id))
      saveOrders(updated)
      return updated
    })
    setSelectedIds(new Set())
  }

  const filtered = orders.filter(o =>
    (o.order_number.includes(search) || o.customer_name.includes(search) || (o.tracking_number||'').includes(search)) &&
    (sf === '전체' || o.status === sf) && (cf === '전체' || o.channel === cf)
  ).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const channels = Array.from(new Set(orders.map(o => o.channel)))

  if (!mounted) return null

  return (
    <div className="pm-page space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(c => (
          <div key={c.label} className="pm-card p-5" style={{ background: c.bg }}>
            <p style={{ fontSize:11, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em' }}>{c.label}</p>
            <p style={{ fontSize:34, fontWeight:900, color: c.color, marginTop:4, lineHeight:1 }}>
              {orders.filter(o=>o.status===c.key).length}
            </p>
          </div>
        ))}
      </div>

      {/* 액션 바 */}
      <div className="pm-card p-4">
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
          {/* 자동주문수집 버튼 */}
          <button onClick={() => setAutoModal(true)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:10, border:'1.5px solid', fontSize:12.5, fontWeight:800, cursor:'pointer',
              borderColor: autoEnabled ? '#059669' : '#d1d5db',
              background: autoEnabled ? '#ecfdf5' : 'white',
              color: autoEnabled ? '#059669' : '#374151',
            }}>
            <Clock size={13}/>
            자동주문수집
            {autoEnabled && <span style={{ background:'#059669', color:'white', fontSize:10, fontWeight:900, padding:'1px 6px', borderRadius:99 }}>ON</span>}
          </button>
          {autoEnabled && autoNextAt && (
            <span style={{ fontSize:11, color:'#6b7280', fontWeight:700 }}>다음수집 {autoNextAt}</span>
          )}

          {/* 주문수집 버튼 */}
          <button onClick={() => { setCollectModal(true); setCollectDone(false); setCollectSelected(new Set()) }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#2563eb,#1d4ed8)', color:'white', fontSize:12.5, fontWeight:800, cursor:'pointer' }}>
            <RefreshCw size={13}/>주문수집
          </button>

          {/* 배송준비 버튼 */}
          <button onClick={handleReadyShipping} disabled={!selectedIds.size}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:10, border:'none', fontSize:12.5, fontWeight:800, cursor: selectedIds.size ? 'pointer' : 'not-allowed',
              background: selectedIds.size ? 'linear-gradient(135deg,#7c3aed,#6d28d9)' : '#e5e7eb',
              color: selectedIds.size ? 'white' : '#9ca3af',
            }}>
            <Package size={13}/>배송준비 {selectedIds.size > 0 && `(${selectedIds.size})`}
          </button>

          {/* 선택 삭제 버튼 */}
          {selectedIds.size > 0 && (
            <button onClick={handleDeleteSelected}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:10, border:'1.5px solid #fecaca', fontSize:12.5, fontWeight:800, cursor:'pointer', background:'#fff1f2', color:'#dc2626' }}>
              <Trash2 size={13}/>선택 삭제 ({selectedIds.size})
            </button>
          )}

          <div style={{ flex:1 }}/>

          {/* 검색 */}
          <div className="relative" style={{ minWidth:200, flex:1, maxWidth:320 }}>
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:'#94a3b8' }} />
            <Input placeholder="주문번호, 고객명, 송장번호..." value={search} onChange={e=>setSearch(e.target.value)} className="pm-input-icon" />
          </div>
          <Select value={sf} onChange={e=>setSf(e.target.value)} style={{ width:130 }}>
            <option value="전체">전체 상태</option>
            {Object.entries(ST).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select value={cf} onChange={e=>setCf(e.target.value)} style={{ width:120 }}>
            <option value="전체">전체 채널</option>
            {channels.map(v=><option key={v}>{v}</option>)}
          </Select>
          <Button variant="outline" size="sm"><Download size={13}/>엑셀</Button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="pm-card overflow-hidden">
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                <th style={{ width:36 }}>
                  <input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={e => toggleAll(e.target.checked)} />
                </th>
                <th>주문번호</th>
                <th>채널</th>
                <th>주문자</th>
                <th>상품</th>
                <th style={{ textAlign:'right' }}>금액</th>
                <th>상태</th>
                <th>송장번호</th>
                <th>주문일시</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign:'center', padding:'3.5rem 1rem', color:'#94a3b8' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                      <Download size={36} style={{ opacity:0.2 }} />
                      <p style={{ fontSize:13.5, fontWeight:700 }}>주문 데이터가 없습니다</p>
                      <p style={{ fontSize:12, fontWeight:500, color:'#cbd5e1' }}>위의 [주문수집] 버튼을 눌러 주문을 가져오세요</p>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map(o => {
                const st = ST[o.status] ?? ST['pending']
                const isSelected = selectedIds.has(o.id)
                return (
                  <tr key={o.id} className="group" style={{ background: isSelected ? '#eff6ff' : o.is_claim ? '#fff7ed' : undefined }}>
                    <td><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(o.id)} /></td>
                    <td>
                      <p style={{ fontFamily:'monospace', fontWeight:800, color:'#2563eb', fontSize:12.5 }}>{o.order_number}</p>
                      <p style={{ fontSize:10.5, color:'#94a3b8', marginTop:1 }}>{o.channel_order_id}</p>
                      {o.is_claim && <span style={{ fontSize:10, fontWeight:900, color:'#ea580c', background:'#fff7ed', border:'1px solid #fed7aa', padding:'1px 5px', borderRadius:4 }}>클레임</span>}
                    </td>
                    <td>
                      <span style={{ fontSize:11.5, fontWeight:800, padding:'3px 8px', borderRadius:6, background:'#f8fafc', color:'#475569' }}>{o.channel}</span>
                    </td>
                    <td>
                      <p style={{ fontWeight:800, color:'#1e293b', fontSize:12.5 }}>{o.customer_name}</p>
                      <p style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{o.customer_phone}</p>
                    </td>
                    <td>
                      <p style={{ fontSize:12.5, color:'#334155', fontWeight:700, maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.items[0]?.name}</p>
                      {o.items.length>1&&<p style={{ fontSize:10.5, color:'#94a3b8', marginTop:1 }}>외 {o.items.length-1}건</p>}
                    </td>
                    <td style={{ textAlign:'right', fontWeight:800, color:'#1e293b', fontSize:13 }}>{formatCurrency(o.total_amount)}</td>
                    <td>
                      <span className={st.cls}>
                        <span style={{ width:5,height:5,borderRadius:'50%',background:st.dot,display:'inline-block',marginRight:4 }}/>
                        {st.label}
                      </span>
                    </td>
                    <td>
                      {o.tracking_number
                        ? <div><p style={{ fontFamily:'monospace', fontWeight:700, fontSize:11.5, color:'#334155' }}>{o.tracking_number}</p><p style={{ fontSize:10.5,color:'#94a3b8',marginTop:1 }}>{o.carrier}</p></div>
                        : <button onClick={()=>{setTrackOrder(o);setTrackModal(true);setTrackNum('');setTrackCarrier('CJ대한통운')}} style={{ fontSize:12,fontWeight:700,color:'#2563eb',background:'none',border:'none',cursor:'pointer',padding:0 }}>+ 등록</button>
                      }
                    </td>
                    <td style={{ fontSize:11.5, color:'#94a3b8', whiteSpace:'nowrap' }}>{formatDateTime(o.created_at)}</td>
                    <td>
                      <div style={{ display:'flex', gap:4, opacity:0, transition:'opacity 150ms ease' }} className="group-hover:!opacity-100">
                        <button onClick={()=>setSel(o)} className="pm-btn pm-btn-ghost pm-btn-sm" style={{ width:28, height:28, padding:0, borderRadius:8 }}><Eye size={13}/></button>
                        <button onClick={()=>{setTrackOrder(o);setTrackModal(true);setTrackNum('');setTrackCarrier('CJ대한통운')}} className="pm-btn pm-btn-ghost pm-btn-sm" style={{ width:28, height:28, padding:0, borderRadius:8, color:'#7c3aed' }}><Truck size={13}/></button>
                        <button onClick={()=>{ if(confirm('이 주문을 삭제하시겠습니까?')) handleDeleteOrder(o.id) }} className="pm-btn pm-btn-ghost pm-btn-sm" style={{ width:28, height:28, padding:0, borderRadius:8, color:'#dc2626' }}><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="pm-table-footer">
          <span>총 {filtered.length}건 · {selectedIds.size}건 선택</span>
        </div>
      </div>

      {/* ── 주문 상세 ── */}
      {sel && (
        <Modal isOpen={!!sel} onClose={()=>setSel(null)} title="주문 상세" size="lg">
          <div className="space-y-4">
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div>
                <p style={{ fontFamily:'monospace', fontWeight:800, color:'#2563eb', fontSize:15 }}>{sel.order_number}</p>
                <p style={{ fontSize:12, color:'#94a3b8', marginTop:4 }}>{sel.channel} · {sel.channel_order_id}</p>
              </div>
              <span className={ST[sel.status]?.cls}><span style={{ width:5,height:5,borderRadius:'50%',background:ST[sel.status]?.dot,display:'inline-block',marginRight:4 }}/>{ST[sel.status]?.label}</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, background:'#f8fafc', borderRadius:14, padding:14 }}>
              {[['주문자',sel.customer_name],['연락처',sel.customer_phone]].map(([k,v])=>(
                <div key={k}><p style={{ fontSize:10.5,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.06em' }}>{k}</p><p style={{ fontWeight:800,color:'#1e293b',marginTop:3 }}>{v}</p></div>
              ))}
              <div style={{ gridColumn:'1/-1' }}><p style={{ fontSize:10.5,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.06em' }}>배송주소</p><p style={{ fontWeight:700,color:'#334155',marginTop:3 }}>{sel.shipping_address}</p></div>
            </div>
            <div className="space-y-2">
              {sel.items.map((item,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:'#f8fafc', borderRadius:12 }}>
                  <div><p style={{ fontWeight:800, color:'#1e293b', fontSize:13 }}>{item.name}</p><p style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>{item.sku} · {item.quantity}개</p></div>
                  <p style={{ fontWeight:800, color:'#1e293b' }}>{formatCurrency(item.price*item.quantity)}</p>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'#eff6ff', borderRadius:14 }}>
              <span style={{ fontWeight:800, color:'#334155' }}>총 결제금액</span>
              <span style={{ fontSize:18, fontWeight:900, color:'#2563eb' }}>{formatCurrency(sel.total_amount)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <Button variant="outline" onClick={()=>setSel(null)}>닫기</Button>
              {!sel.tracking_number&&<Button onClick={()=>{setSel(null);setTrackOrder(sel);setTrackModal(true);setTrackNum('');setTrackCarrier('CJ대한통운')}}><Truck size={13}/>송장 등록</Button>}
            </div>
          </div>
        </Modal>
      )}

      {/* ── 송장 등록 ── */}
      {trackOrder && (
        <Modal isOpen={trackModal} onClose={()=>setTrackModal(false)} title="송장번호 등록">
          <div className="space-y-4">
            <div style={{ padding:'12px 14px', background:'#f8fafc', borderRadius:12 }}>
              <p style={{ fontFamily:'monospace', fontWeight:800, color:'#2563eb' }}>{trackOrder.order_number}</p>
              <p style={{ fontSize:12.5, color:'#64748b', marginTop:4, fontWeight:700 }}>{trackOrder.customer_name} · {trackOrder.channel}</p>
            </div>
            <div><Label>택배사 *</Label>
              <Select className="w-full" value={trackCarrier} onChange={e=>setTrackCarrier(e.target.value)}>
                {['CJ대한통운','롯데택배','한진택배','우체국택배','로젠택배','경동택배'].map(v=><option key={v}>{v}</option>)}
              </Select>
            </div>
            <div><Label>송장번호 *</Label><Input placeholder="송장번호 입력" style={{ fontFamily:'monospace' }} value={trackNum} onChange={e=>setTrackNum(e.target.value)} /></div>
            <div style={{ padding:'12px 14px', background:'#eff6ff', borderRadius:12, fontSize:12, fontWeight:700, color:'#2563eb' }}>
              📦 등록 시 주문상태 → 배송중 자동 변경 및 채널에 송장 자동 전송
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <Button variant="outline" onClick={()=>setTrackModal(false)}>취소</Button>
              <Button onClick={() => {
                if (!trackNum.trim()) return
                setOrders(prev => {
                  const updated = prev.map(o => o.id === trackOrder.id ? { ...o, tracking_number:trackNum, carrier:trackCarrier, status:'shipped' } : o)
                  saveOrders(updated)
                  return updated
                })
                setTrackModal(false)
              }}><Truck size={13}/>등록 및 전송</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 주문수집 모달 ── */}
      <Modal isOpen={collectModal} onClose={()=>setCollectModal(false)} title="주문 수집" size="md">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* 수집 기간 선택 */}
          <div>
            <p style={{ fontSize:12, fontWeight:800, color:'#475569', marginBottom:8 }}>수집 기간</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {([['1','1일 전'],['3','3일 전'],['5','5일 전'],['7','7일 전']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setCollectRange(val)}
                  style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid', fontSize:12.5, fontWeight:800, cursor:'pointer',
                    borderColor: collectRange === val ? '#2563eb' : '#e2e8f0',
                    background: collectRange === val ? '#eff6ff' : 'white',
                    color: collectRange === val ? '#1d4ed8' : '#475569',
                  }}>{label}</button>
              ))}
              <button onClick={() => setCollectRange('custom')}
                style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid', fontSize:12.5, fontWeight:800, cursor:'pointer',
                  borderColor: collectRange === 'custom' ? '#2563eb' : '#e2e8f0',
                  background: collectRange === 'custom' ? '#eff6ff' : 'white',
                  color: collectRange === 'custom' ? '#1d4ed8' : '#475569',
                }}>시작일 선택</button>
            </div>
            {collectRange === 'custom' && (
              <input type="date" value={collectCustomDate} onChange={e => setCollectCustomDate(e.target.value)}
                max={new Date().toISOString().slice(0,10)}
                style={{ marginTop:8, width:'100%', padding:'8px 12px', borderRadius:8, border:'1.5px solid #93c5fd', fontSize:13, fontWeight:700, color:'#1e293b', outline:'none' }}
              />
            )}
            <p style={{ marginTop:6, fontSize:11.5, color:'#64748b', fontWeight:600 }}>
              신규 주문(대기중)만 수집됩니다. 배송준비/배송중/배송완료 주문은 수집되지 않습니다.
            </p>
          </div>

          <p style={{ fontSize:13, color:'#64748b', fontWeight:700 }}>주문을 수집할 쇼핑몰을 선택하세요.</p>
          {connectedMalls.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px', color:'#94a3b8', fontSize:13, fontWeight:700 }}>
              연동된 쇼핑몰이 없습니다. 쇼핑몰 관리에서 먼저 연동해주세요.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {/* 전체 선택 */}
              <label style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'#f8fafc', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:13 }}>
                <input type="checkbox"
                  checked={collectSelected.size === connectedMalls.length}
                  onChange={e => setCollectSelected(e.target.checked ? new Set(connectedMalls.map(m=>m.key)) : new Set())}
                />
                전체 선택
              </label>
              {connectedMalls.map(m => (
                <label key={m.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', border:'1.5px solid', borderRadius:10, cursor:'pointer',
                  borderColor: collectSelected.has(m.key) ? '#2563eb' : '#e2e8f0',
                  background: collectSelected.has(m.key) ? '#eff6ff' : 'white',
                }}>
                  <input type="checkbox" checked={collectSelected.has(m.key)}
                    onChange={e => setCollectSelected(prev => { const n=new Set(prev); e.target.checked ? n.add(m.key) : n.delete(m.key); return n })}
                  />
                  <img src={`https://www.google.com/s2/favicons?domain=${m.key}&sz=16`} alt={m.name} style={{ width:16, height:16 }} onError={e=>{(e.target as HTMLImageElement).style.display='none'}} />
                  <span style={{ fontSize:13, fontWeight:800, color: collectSelected.has(m.key) ? '#1d4ed8' : '#334155' }}>{m.name}</span>
                </label>
              ))}
            </div>
          )}
          {collectDone && (
            <div style={{ padding:'10px 14px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, fontSize:12.5, fontWeight:800, color:'#15803d' }}>
              ✅ 주문 수집 완료! 신규 주문이 추가되었습니다.
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Button variant="outline" onClick={()=>setCollectModal(false)}>닫기</Button>
            <Button onClick={handleCollect} disabled={!collectSelected.size || collecting || collectDone || (collectRange === 'custom' && !collectCustomDate)}
              style={{ opacity: (!collectSelected.size || collectDone || (collectRange === 'custom' && !collectCustomDate)) ? 0.5 : 1 }}>
              {collecting ? <><RefreshCw size={13} style={{ animation:'spin 0.7s linear infinite' }}/>수집 중...</> : <><Play size={13}/>수집 시작</>}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── 자동수집 설정 모달 ── */}
      <Modal isOpen={autoModal} onClose={()=>setAutoModal(false)} title="자동 주문수집 설정" size="md">
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* 활성화 토글 */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#f8fafc', borderRadius:12 }}>
            <div>
              <p style={{ fontSize:13, fontWeight:800, color:'#1e293b' }}>자동 주문수집</p>
              <p style={{ fontSize:11.5, color:'#64748b', marginTop:2 }}>설정한 주기로 자동으로 주문을 수집합니다</p>
            </div>
            <button onClick={() => setAutoEnabled(!autoEnabled)}
              style={{ width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', position:'relative',
                background: autoEnabled ? '#2563eb' : '#e2e8f0', transition:'background 200ms' }}>
              <span style={{ position:'absolute', top:2, left: autoEnabled ? 22 : 2, width:20, height:20, borderRadius:10, background:'white', transition:'left 200ms', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
            </button>
          </div>

          {/* 수집 주기 */}
          <div>
            <p style={{ fontSize:12, fontWeight:800, color:'#475569', marginBottom:8 }}>수집 주기</p>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <Input type="number" min="1" value={autoInterval} onChange={e=>setAutoInterval(e.target.value)} style={{ width:80, textAlign:'center' }} />
              <Select value={autoUnit} onChange={e=>setAutoUnit(e.target.value as '분'|'시간')} style={{ width:80 }}>
                <option value="분">분</option>
                <option value="시간">시간</option>
              </Select>
              <span style={{ fontSize:12, color:'#94a3b8' }}>마다 수집</span>
            </div>
          </div>

          {/* 대상 쇼핑몰 */}
          <div>
            <p style={{ fontSize:12, fontWeight:800, color:'#475569', marginBottom:8 }}>수집 대상 쇼핑몰</p>
            {connectedMalls.length === 0 ? (
              <p style={{ fontSize:12, color:'#94a3b8', fontWeight:700 }}>연동된 쇼핑몰이 없습니다.</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, fontWeight:700, color:'#374151' }}>
                  <input type="checkbox" checked={autoMalls.size === connectedMalls.length}
                    onChange={e => setAutoMalls(e.target.checked ? new Set(connectedMalls.map(m=>m.key)) : new Set())} />
                  전체 선택
                </label>
                {connectedMalls.map(m => (
                  <label key={m.key} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, fontWeight:700, color:'#374151' }}>
                    <input type="checkbox" checked={autoMalls.has(m.key)}
                      onChange={e => setAutoMalls(prev => { const n=new Set(prev); e.target.checked ? n.add(m.key) : n.delete(m.key); return n })} />
                    {m.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Button variant="outline" onClick={()=>setAutoModal(false)}>취소</Button>
            <Button onClick={saveAutoSettings}><CheckSquare size={13}/>설정 저장</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
