'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { formatDateTime } from '@/lib/utils'
import { ArrowDownCircle, ArrowUpCircle, Search, AlertTriangle } from 'lucide-react'

type InvItem = { id: string; sku: string; name: string; stock: number; min: number; category: string }
type TxItem  = { id: string; date: string; type: string; product: string; sku: string; quantity: number; reason: string; reference: string; notes: string }
const inventory: InvItem[] = []
const txList: TxItem[] = []

const TX: Record<string, { label:string; bg:string; color:string; dot:string }> = {
  in:         { label:'입고', bg:'#f0fdf4', color:'#15803d', dot:'#22c55e' },
  out:        { label:'출고', bg:'#fff1f2', color:'#be123c', dot:'#ef4444' },
  adjustment: { label:'조정', bg:'#eff6ff', color:'#1d4ed8', dot:'#3b82f6' },
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:12, fontWeight:800, color:'#475569', marginBottom:6 }}>{children}</label>
}

export default function InventoryPage() {
  const [tab, setTab] = useState<'stock'|'tx'>('stock')
  const [inModal, setInModal] = useState(false)
  const [outModal, setOutModal] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = inventory.filter(p=>p.name.includes(search)||p.sku.includes(search))
  const total = inventory.reduce((s,p)=>s+p.stock,0)
  const low   = inventory.filter(p=>p.stock>0&&p.stock<=p.min).length
  const out   = inventory.filter(p=>p.stock===0).length

  return (
    <div className="pm-page space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'전체 품목',  v:inventory.length+'개', bg:'#eff6ff', color:'#1d4ed8' },
          { label:'총 재고량',  v:total.toLocaleString()+'개', bg:'#faf5ff', color:'#7e22ce' },
          { label:'재고 부족',  v:low+'개', bg:'#fffbeb', color:'#d97706' },
          { label:'품절',       v:out+'개', bg:'#fff1f2', color:'#be123c' },
        ].map(c=>(
          <div key={c.label} className="pm-card p-5" style={{ background: c.bg }}>
            <p style={{ fontSize:11, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em' }}>{c.label}</p>
            <p style={{ fontSize:32, fontWeight:900, color: c.color, marginTop:4, lineHeight:1 }}>{c.v}</p>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:10 }}>
        <Button variant="success" size="sm" onClick={()=>setInModal(true)}>
          <ArrowDownCircle size={14} />입고 등록
        </Button>
        <Button variant="destructive" size="sm" onClick={()=>setOutModal(true)}>
          <ArrowUpCircle size={14} />출고 등록
        </Button>
      </div>

      <div className="pm-card overflow-hidden">
        {/* 탭 */}
        <div style={{ display:'flex', borderBottom:'1px solid rgba(15,23,42,0.07)' }}>
          {[{id:'stock',label:'재고 현황'},{id:'tx',label:'입출고 내역'}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id as 'stock'|'tx')}
              style={{
                padding:'12px 20px',
                fontSize:13, fontWeight:800,
                borderBottom: `2px solid ${tab===t.id ? '#2563eb' : 'transparent'}`,
                color: tab===t.id ? '#2563eb' : '#94a3b8',
                background: tab===t.id ? 'rgba(37,99,235,0.04)' : 'transparent',
                cursor:'pointer',
                transition: 'all 150ms ease',
              }}
            >{t.label}</button>
          ))}
        </div>

        {tab==='stock'&&(
          <>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid rgba(15,23,42,0.06)' }}>
              <div className="relative" style={{ width:240 }}>
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:'#94a3b8' }} />
                <Input placeholder="상품명, SKU..." value={search} onChange={e=>setSearch(e.target.value)} className="pm-input-icon" />
              </div>
            </div>
            <div className="pm-table-wrap">
              <table className="pm-table">
                <thead><tr>
                  {['상품명','SKU','카테고리','현재 재고','최소 재고','상태',''].map(h=><th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign:'center', padding:'3.5rem 1rem', color:'#94a3b8' }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                          <ArrowDownCircle size={36} style={{ opacity:0.2 }} />
                          <p style={{ fontSize:13.5, fontWeight:700 }}>재고 데이터가 없습니다</p>
                          <p style={{ fontSize:12, fontWeight:500, color:'#cbd5e1' }}>상품을 먼저 등록하고 입고를 진행하세요</p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filtered.map(item=>{
                    const isZero=item.stock===0, isLow=item.stock>0&&item.stock<=item.min
                    const pct=Math.min((item.stock/Math.max(item.min*2,10))*100,100)
                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            {(isZero||isLow)&&<AlertTriangle size={13} color={isZero?'#dc2626':'#d97706'} />}
                            <span style={{ fontWeight:800, color:'#1e293b', fontSize:13 }}>{item.name}</span>
                          </div>
                        </td>
                        <td><span style={{ fontFamily:'monospace', fontSize:11.5, background:'#f1f5f9', color:'#475569', padding:'3px 8px', borderRadius:6, fontWeight:700 }}>{item.sku}</span></td>
                        <td style={{ fontSize:12.5, fontWeight:700, color:'#64748b' }}>{item.category}</td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <span style={{ fontSize:17, fontWeight:900, color: isZero?'#dc2626':isLow?'#d97706':'#1e293b' }}>{item.stock.toLocaleString()}</span>
                            <div style={{ width:52, height:5, background:'rgba(0,0,0,0.07)', borderRadius:99 }}>
                              <div style={{ width:`${pct}%`, height:'100%', background: isZero?'#ef4444':isLow?'#f59e0b':'#22c55e', borderRadius:99 }} />
                            </div>
                          </div>
                        </td>
                        <td style={{ fontWeight:700, color:'#64748b', fontSize:12.5 }}>{item.min}개</td>
                        <td>
                          <span className={isZero?'pm-badge pm-badge-red':isLow?'pm-badge pm-badge-yellow':'pm-badge pm-badge-green'}>
                            {isZero?'품절':isLow?'부족':'정상'}
                          </span>
                        </td>
                        <td>
                          <Button variant="outline" size="sm"
                            style={{ fontSize:11, color:'#059669', borderColor:'rgba(22,163,74,0.25)', height:26, padding:'0 10px' }}
                            onClick={()=>setInModal(true)}>
                            <ArrowDownCircle size={11} />입고
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab==='tx'&&(
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead><tr>{['일시','유형','상품명','SKU','수량','사유','참조번호','비고'].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {txList.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign:'center', padding:'3.5rem 1rem', color:'#94a3b8' }}>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                        <ArrowUpCircle size={36} style={{ opacity:0.2 }} />
                        <p style={{ fontSize:13.5, fontWeight:700 }}>입출고 내역이 없습니다</p>
                        <p style={{ fontSize:12, fontWeight:500, color:'#cbd5e1' }}>입고/출고를 등록하면 여기에 표시됩니다</p>
                      </div>
                    </td>
                  </tr>
                )}
                {txList.map(tx=>{
                  const ts=TX[tx.type]
                  return (
                    <tr key={tx.id}>
                      <td style={{ fontSize:11.5, color:'#94a3b8', whiteSpace:'nowrap' }}>{formatDateTime(tx.date)}</td>
                      <td>
                        <span className="pm-badge" style={{ background:ts.bg, color:ts.color, boxShadow:`inset 0 0 0 1px ${ts.dot}30` }}>
                          <span style={{ width:5,height:5,borderRadius:'50%',background:ts.dot,display:'inline-block',marginRight:4 }} />
                          {ts.label}
                        </span>
                      </td>
                      <td style={{ fontWeight:800, color:'#1e293b', fontSize:13 }}>{tx.product}</td>
                      <td><span style={{ fontFamily:'monospace', fontSize:11.5, background:'#f1f5f9', color:'#475569', padding:'3px 8px', borderRadius:6, fontWeight:700 }}>{tx.sku}</span></td>
                      <td><span style={{ fontSize:16, fontWeight:900, color:ts.color }}>{tx.type==='in'?'+':tx.quantity<0?'':'-'}{Math.abs(tx.quantity)}</span></td>
                      <td style={{ fontWeight:700, color:'#334155', fontSize:12.5 }}>{tx.reason}</td>
                      <td><span style={{ fontFamily:'monospace', fontSize:11.5, fontWeight:700, color:'#2563eb' }}>{tx.reference}</span></td>
                      <td style={{ fontSize:12, color:'#94a3b8' }}>{tx.notes}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={inModal} onClose={()=>setInModal(false)} title="입고 등록">
        <div className="space-y-4">
          <div><Label>상품 선택 *</Label><Select className="w-full">{inventory.map(p=><option key={p.id}>{p.name} ({p.sku})</option>)}</Select></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><Label>입고 수량 *</Label><Input type="number" placeholder="0" min="1" /></div>
            <div><Label>입고 단가</Label><Input type="number" placeholder="0" /></div>
          </div>
          <div><Label>입고 사유</Label><Select className="w-full"><option>정기 발주</option><option>긴급 발주</option><option>반품 재입고</option><option>재고 조정</option></Select></div>
          <div><Label>발주번호</Label><Input placeholder="PO-2026-0001" /></div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Button variant="outline" onClick={()=>setInModal(false)}>취소</Button>
            <Button variant="success">입고 처리</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={outModal} onClose={()=>setOutModal(false)} title="출고 등록">
        <div className="space-y-4">
          <div><Label>상품 선택 *</Label><Select className="w-full">{inventory.map(p=><option key={p.id}>{p.name} ({p.sku}) - 재고: {p.stock}개</option>)}</Select></div>
          <div><Label>출고 수량 *</Label><Input type="number" placeholder="0" min="1" /></div>
          <div><Label>출고 사유</Label><Select className="w-full"><option>주문 출고</option><option>샘플 출고</option><option>폐기</option><option>반품</option><option>재고 조정</option></Select></div>
          <div><Label>참조번호</Label><Input placeholder="ORD-2026-0001" /></div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Button variant="outline" onClick={()=>setOutModal(false)}>취소</Button>
            <Button variant="destructive">출고 처리</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
