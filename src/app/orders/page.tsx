'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Search, Download, RefreshCw, Eye, Truck } from 'lucide-react'

type OrderItem = { name: string; sku: string; quantity: number; price: number }
type Order = { id: string; order_number: string; channel: string; channel_order_id: string; customer_name: string; customer_phone: string; shipping_address: string; status: string; total_amount: number; shipping_fee: number; tracking_number: string|null; carrier: string|null; created_at: string; items: OrderItem[] }
const orders: Order[] = []

const ST: Record<string, { label:string; dot:string; cls:string }> = {
  pending:    { label:'대기중',  dot:'#f59e0b', cls:'pm-badge pm-badge-yellow' },
  confirmed:  { label:'확인됨',  dot:'#3b82f6', cls:'pm-badge pm-badge-blue' },
  processing: { label:'처리중',  dot:'#6366f1', cls:'pm-badge pm-badge-indigo' },
  shipped:    { label:'배송중',  dot:'#a855f7', cls:'pm-badge pm-badge-purple' },
  delivered:  { label:'완료',    dot:'#22c55e', cls:'pm-badge pm-badge-green' },
  cancelled:  { label:'취소',    dot:'#ef4444', cls:'pm-badge pm-badge-red' },
}
const CH: Record<string, string> = { '쿠팡':'pm-badge pm-badge-orange','네이버':'pm-badge pm-badge-green','11번가':'pm-badge pm-badge-red','G마켓':'pm-badge pm-badge-blue' }

const statCards = [
  { label:'주문 대기', key:'pending',    bg:'#fffbeb', color:'#d97706' },
  { label:'처리중',    key:'processing', bg:'#eef2ff', color:'#4338ca' },
  { label:'배송중',    key:'shipped',    bg:'#faf5ff', color:'#7e22ce' },
  { label:'배송완료',  key:'delivered',  bg:'#f0fdf4', color:'#15803d' },
]

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:12, fontWeight:800, color:'#475569', marginBottom:6 }}>{children}</label>
}

export default function OrdersPage() {
  const [search, setSearch] = useState('')
  const [sf, setSf] = useState('전체')
  const [cf, setCf] = useState('전체')
  const [sel, setSel] = useState<typeof orders[0]|null>(null)
  const [trackModal, setTrackModal] = useState(false)
  const [trackOrder, setTrackOrder] = useState<typeof orders[0]|null>(null)

  const filtered = orders.filter(o =>
    (o.order_number.includes(search)||o.customer_name.includes(search)||(o.tracking_number||'').includes(search)) &&
    (sf==='전체'||o.status===sf) && (cf==='전체'||o.channel===cf)
  )

  return (
    <div className="pm-page space-y-5">
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

      <div className="pm-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:'#94a3b8' }} />
            <Input placeholder="주문번호, 고객명, 송장번호..." value={search} onChange={e=>setSearch(e.target.value)} className="pm-input-icon" />
          </div>
          <Select value={sf} onChange={e=>setSf(e.target.value)} style={{ width:140 }}>
            <option value="전체">전체 상태</option>
            {Object.entries(ST).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select value={cf} onChange={e=>setCf(e.target.value)} style={{ width:128 }}>
            <option value="전체">전체 채널</option>
            {['쿠팡','네이버','11번가','G마켓'].map(v=><option key={v}>{v}</option>)}
          </Select>
          <Button variant="outline" size="sm"><RefreshCw size={13} />동기화</Button>
          <Button variant="outline" size="sm"><Download size={13} />엑셀</Button>
        </div>
      </div>

      <div className="pm-card overflow-hidden">
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                <th style={{ width:36 }}><input type="checkbox" /></th>
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
                  <td colSpan={9} style={{ textAlign:'center', padding:'3.5rem 1rem', color:'#94a3b8' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                      <Download size={36} style={{ opacity:0.2 }} />
                      <p style={{ fontSize:13.5, fontWeight:700 }}>주문 데이터가 없습니다</p>
                      <p style={{ fontSize:12, fontWeight:500, color:'#cbd5e1' }}>쇼핑몰 채널을 연동하면 주문이 자동 수집됩니다</p>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map(o => {
                const st = ST[o.status]
                return (
                  <tr key={o.id} className="group">
                    <td><input type="checkbox" /></td>
                    <td>
                      <p style={{ fontFamily:'monospace', fontWeight:800, color:'#2563eb', fontSize:12.5 }}>{o.order_number}</p>
                      <p style={{ fontSize:10.5, color:'#94a3b8', marginTop:1 }}>{o.channel_order_id}</p>
                    </td>
                    <td><span className={CH[o.channel]??'pm-badge pm-badge-gray'}>{o.channel}</span></td>
                    <td>
                      <p style={{ fontWeight:800, color:'#1e293b', fontSize:12.5 }}>{o.customer_name}</p>
                      <p style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{o.customer_phone}</p>
                    </td>
                    <td>
                      <p style={{ fontSize:12.5, color:'#334155', fontWeight:700 }} className="max-w-[130px] truncate">{o.items[0].name}</p>
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
                        : <button onClick={()=>{setTrackOrder(o);setTrackModal(true)}} style={{ fontSize:12,fontWeight:700,color:'#2563eb',background:'none',border:'none',cursor:'pointer',padding:0 }}>+ 등록</button>
                      }
                    </td>
                    <td style={{ fontSize:11.5, color:'#94a3b8', whiteSpace:'nowrap' }}>{formatDateTime(o.created_at)}</td>
                    <td>
                      <div style={{ display:'flex', gap:4, opacity:0, transition:'opacity 150ms ease' }} className="group-hover:!opacity-100">
                        <button onClick={()=>setSel(o)} className="pm-btn pm-btn-ghost pm-btn-sm" style={{ width:28, height:28, padding:0, borderRadius:8 }}><Eye size={13}/></button>
                        <button onClick={()=>{setTrackOrder(o);setTrackModal(true)}} className="pm-btn pm-btn-ghost pm-btn-sm" style={{ width:28, height:28, padding:0, borderRadius:8, color:'#7c3aed' }}><Truck size={13}/></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="pm-table-footer">
          <span>총 {filtered.length}건</span>
          <div style={{ display:'flex', gap:4 }}>
            {['이전','1','2','다음'].map(v=>(
              <button key={v} className="pm-btn pm-btn-ghost pm-btn-sm" style={{ height:28, minWidth:28, fontSize:12, ...(v==='1'?{background:'#2563eb',color:'white'}:{}) }}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 주문 상세 */}
      {sel&&<Modal isOpen={!!sel} onClose={()=>setSel(null)} title="주문 상세" size="lg">
        <div className="space-y-4">
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
            <div>
              <p style={{ fontFamily:'monospace', fontWeight:800, color:'#2563eb', fontSize:15 }}>{sel.order_number}</p>
              <p style={{ fontSize:12, color:'#94a3b8', marginTop:4 }}>{sel.channel} · {sel.channel_order_id}</p>
            </div>
            <span className={ST[sel.status].cls}><span style={{ width:5,height:5,borderRadius:'50%',background:ST[sel.status].dot,display:'inline-block',marginRight:4 }}/>{ST[sel.status].label}</span>
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
            {!sel.tracking_number&&<Button onClick={()=>{setSel(null);setTrackOrder(sel);setTrackModal(true)}}><Truck size={13}/>송장 등록</Button>}
          </div>
        </div>
      </Modal>}

      {/* 송장 등록 */}
      {trackOrder&&<Modal isOpen={trackModal} onClose={()=>setTrackModal(false)} title="송장번호 등록">
        <div className="space-y-4">
          <div style={{ padding:'12px 14px', background:'#f8fafc', borderRadius:12 }}>
            <p style={{ fontFamily:'monospace', fontWeight:800, color:'#2563eb' }}>{trackOrder.order_number}</p>
            <p style={{ fontSize:12.5, color:'#64748b', marginTop:4, fontWeight:700 }}>{trackOrder.customer_name} · {trackOrder.channel}</p>
          </div>
          <div><Label>택배사 *</Label>
            <Select className="w-full">{['CJ대한통운','롯데택배','한진택배','우체국택배','로젠택배','경동택배'].map(v=><option key={v}>{v}</option>)}</Select>
          </div>
          <div><Label>송장번호 *</Label><Input placeholder="송장번호 입력" style={{ fontFamily:'monospace' }} /></div>
          <div style={{ padding:'12px 14px', background:'#eff6ff', borderRadius:12, fontSize:12, fontWeight:700, color:'#2563eb' }}>
            📦 등록 시 주문상태 → 배송중 자동 변경 및 채널에 송장 자동 전송
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Button variant="outline" onClick={()=>setTrackModal(false)}>취소</Button>
            <Button><Truck size={13}/>등록 및 전송</Button>
          </div>
        </div>
      </Modal>}
    </div>
  )
}
