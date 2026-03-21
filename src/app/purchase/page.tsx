'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Purchase, PmProduct,
  getThisMonth, shiftMonth,
  fmtMonthLabel, fmtDateShort,
  apiFetchPurchases,
} from './_shared'
import { ChevronLeft, ChevronRight, PackagePlus, ChevronDown, ChevronUp } from 'lucide-react'

type FP = PmProduct & { cost_price?: number; cost_currency?: string }

const CACHE_KEY = 'pm_products_cache_v1'

function loadCachedProducts(): FP[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const { data } = JSON.parse(raw)
    return Array.isArray(data) ? (data as FP[]) : []
  } catch { return [] }
}

/** 발주 1건의 원화 합계금액 계산 */
function calcOrderKrw(purchase: Purchase, products: FP[], exchangeRate: number): number {
  return purchase.items.reduce((sum, item) => {
    const prod = products.find(p => p.code === item.product_code)
    if (!prod?.cost_price) return sum
    const rate = (prod.cost_currency || '원') === '원' ? 1 : exchangeRate
    return sum + prod.cost_price * rate * item.ordered
  }, 0)
}

/* ── 월별 전용 날짜 네비 ── */
function MonthNav({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const thisMonth = getThisMonth()
  const isFuture  = month >= thisMonth
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <button onClick={() => setMonth(shiftMonth(month, -1))}
        style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #e2e8f0', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <ChevronLeft size={12}/>
      </button>
      <span style={{ fontSize:12, fontWeight:800, color:'#0f172a', minWidth:80, textAlign:'center', whiteSpace:'nowrap' }}>
        {fmtMonthLabel(month)}
      </span>
      <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={isFuture}
        style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #e2e8f0', background:'white', cursor:isFuture?'not-allowed':'pointer', opacity:isFuture?0.4:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <ChevronRight size={12}/>
      </button>
      <button onClick={() => setMonth(thisMonth)}
        style={{ fontSize:10.5, fontWeight:700, color:'#2563eb', background:'#eff6ff', border:'none', borderRadius:6, padding:'4px 9px', cursor:'pointer' }}>
        이번달
      </button>
    </div>
  )
}

export default function PurchaseMainPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [products,  setProducts]  = useState<FP[]>([])
  const [exchangeRate, setExchangeRate] = useState(190)

  /* 발주내역 날짜 (월별 전용) */
  const [poMonth, setPoMonth] = useState(getThisMonth())
  /* 입고내역 날짜 (월별 전용) */
  const [rcMonth, setRcMonth] = useState(getThisMonth())

  /* 펼친 행 ID */
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null)
  const [expandedRcId, setExpandedRcId] = useState<string | null>(null)

  const loadPurchases = useCallback(async () => {
    const data = await apiFetchPurchases()
    setPurchases(data)
  }, [])

  useEffect(() => {
    // 상품 캐시 + 환율 불러오기
    setProducts(loadCachedProducts())
    try {
      const er = Number(localStorage.getItem('pm_exchange_rate'))
      if (er > 0) setExchangeRate(er)
    } catch { /* ignore */ }

    loadPurchases()
    const onVisible = () => { if (document.visibilityState === 'visible') loadPurchases() }
    const onStorage = (e: StorageEvent) => {
      if (e.key === CACHE_KEY) setProducts(loadCachedProducts())
      if (e.key === 'pm_exchange_rate') {
        const er = Number(e.newValue)
        if (er > 0) setExchangeRate(er)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
    }
  }, [loadPurchases])

  /* 발주내역: status='ordered' + 해당 월 + 오름차순 */
  const poList = useMemo(() =>
    purchases
      .filter(p => p.status === 'ordered' && p.order_date.startsWith(poMonth))
      .sort((a, b) => a.order_date.localeCompare(b.order_date))
  , [purchases, poMonth])

  /* 입고내역: status='completed' + 해당 월 + 오름차순 */
  const rcList = useMemo(() =>
    purchases
      .filter(p => p.status === 'completed')
      .filter(p => {
        const ref = (p.received_at ?? p.order_date).slice(0, rcMonth.length)
        return ref === rcMonth
      })
      .sort((a, b) => {
        const aD = (a.received_at ?? a.order_date).slice(0, 10)
        const bD = (b.received_at ?? b.order_date).slice(0, 10)
        return aD.localeCompare(bD)
      })
  , [purchases, rcMonth])

  /* KPI */
  const poOrderedQty  = useMemo(() => poList.reduce((s,p) => s+p.items.reduce((ss,i) => ss+i.ordered,0), 0), [poList])
  const rcReceivedQty = useMemo(() => rcList.reduce((s,p) => s+p.items.reduce((ss,i) => ss+i.received,0), 0), [rcList])
  /* 월 누적 발주금액 (원화) */
  const poMonthKrw = useMemo(() =>
    poList.reduce((s, p) => s + calcOrderKrw(p, products, exchangeRate), 0)
  , [poList, products, exchangeRate])

  const thStyle = (align: 'left'|'center' = 'center'): React.CSSProperties => ({
    padding:'6px 8px', fontWeight:800, color:'#64748b', fontSize:10.5, textAlign:align, borderBottom:'1px solid #f1f5f9',
  })
  const tdStyle = (align: 'left'|'center' = 'center'): React.CSSProperties => ({
    padding:'7px 8px', textAlign:align, verticalAlign:'middle',
  })

  return (
    <div className="pm-page" style={{ display:'flex', flexDirection:'column', height:'100%', gap:0 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, flex:1, overflow:'hidden' }}>

        {/* ── 왼쪽: 발주내역 ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, overflow:'hidden' }}>
          <div className="pm-card" style={{ padding:'10px 14px', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:14, fontWeight:900, color:'#0f172a' }}>📦 발주내역</span>
              <span style={{ fontSize:11, color:'#94a3b8' }}>발주확정 {poList.length}건</span>
            </div>
            <MonthNav month={poMonth} setMonth={v => { setPoMonth(v); setExpandedPoId(null) }}/>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginTop:10 }}>
              <div style={{ background:'#eff6ff', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>발주확정 건수</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#2563eb', lineHeight:1 }}>{poList.length}</p>
              </div>
              <div style={{ background:'#f8fafc', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>발주 수량</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#1e293b', lineHeight:1 }}>{poOrderedQty.toLocaleString()}</p>
              </div>
              <div style={{ background:'#fefce8', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>발주금액 (월누적)</p>
                <p style={{ fontSize: poMonthKrw > 0 ? 14 : 18, fontWeight:900, color: poMonthKrw > 0 ? '#92400e' : '#cbd5e1', lineHeight:1, marginTop: poMonthKrw > 0 ? 3 : 0 }}>
                  {poMonthKrw > 0 ? `₩${Math.round(poMonthKrw).toLocaleString()}` : '-'}
                </p>
              </div>
            </div>
          </div>

          <div className="pm-card" style={{ flex:1, overflow:'auto', padding:0 }}>
            {poList.length === 0
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
                  <PackagePlus size={28} style={{ opacity:0.2, margin:'0 auto 8px' }}/>
                  <p style={{ fontSize:13, fontWeight:700 }}>발주확정 내역이 없습니다</p>
                </div>
              : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                    <tr style={{ background:'#f8fafc' }}>
                      <th style={thStyle('left')}>발주일</th>
                      <th style={thStyle('left')}>구매처</th>
                      <th style={thStyle()}>품목</th>
                      <th style={thStyle()}>발주수량</th>
                      <th style={thStyle()}>발주금액</th>
                      <th style={{ ...thStyle(), width:28 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {poList.map(p => {
                      const tOrd = p.items.reduce((s,i) => s+i.ordered, 0)
                      const lineKrw = calcOrderKrw(p, products, exchangeRate)
                      const isOpen = expandedPoId === p.id
                      return (
                        <>
                          <tr key={p.id}
                            onClick={() => setExpandedPoId(isOpen ? null : p.id)}
                            style={{ borderBottom:'1px solid #f8fafc', cursor:'pointer', background:isOpen?'#eff6ff':undefined }}
                            onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background='#f8fafc' }}
                            onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background='' }}
                          >
                            <td style={tdStyle('left')}>
                              <span style={{ fontSize:11.5, fontWeight:700, color:'#334155' }}>{fmtDateShort(p.order_date)}</span>
                              <span style={{ display:'block', fontSize:10, color:'#94a3b8' }}>{p.order_date}</span>
                            </td>
                            <td style={{ ...tdStyle('left'), fontSize:11.5, color:'#475569' }}>{p.supplier||'-'}</td>
                            <td style={{ ...tdStyle(), color:'#64748b' }}>{p.items.length}건</td>
                            <td style={{ ...tdStyle(), fontWeight:800, color:'#1e293b' }}>{tOrd.toLocaleString()}</td>
                            <td style={{ ...tdStyle(), fontWeight:900, color: lineKrw > 0 ? '#92400e' : '#cbd5e1', fontSize:11.5 }}>
                              {lineKrw > 0 ? `₩${Math.round(lineKrw).toLocaleString()}` : '-'}
                            </td>
                            <td style={tdStyle()}>
                              {isOpen ? <ChevronUp size={13} color="#94a3b8"/> : <ChevronDown size={13} color="#94a3b8"/>}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${p.id}-detail`}>
                              <td colSpan={6} style={{ padding:0, background:'#f0f9ff' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                  <thead>
                                    <tr style={{ background:'#dbeafe' }}>
                                      {['상품코드','옵션명','바코드','발주수량'].map(h => (
                                        <th key={h} style={{ padding:'4px 8px', fontWeight:800, color:'#1d4ed8', textAlign:'center', fontSize:10 }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {p.items.map((item, i) => (
                                      <tr key={i} style={{ borderBottom:'1px solid #e0f2fe' }}>
                                        <td style={{ padding:'4px 8px', color:'#334155', fontFamily:'monospace', fontSize:10.5 }}>{item.product_code}</td>
                                        <td style={{ padding:'4px 8px', color:'#475569', fontSize:10.5 }}>{item.option_name||'-'}</td>
                                        <td style={{ padding:'4px 8px', color:'#64748b', fontFamily:'monospace', fontSize:10 }}>{item.barcode||'-'}</td>
                                        <td style={{ padding:'4px 8px', textAlign:'center', fontWeight:800, color:'#1d4ed8' }}>{item.ordered}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
            }
          </div>
        </div>

        {/* ── 오른쪽: 입고내역 ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, overflow:'hidden' }}>
          <div className="pm-card" style={{ padding:'10px 14px', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:14, fontWeight:900, color:'#0f172a' }}>✅ 입고내역</span>
              <span style={{ fontSize:11, color:'#94a3b8' }}>입고확정 {rcList.length}건</span>
            </div>
            <MonthNav month={rcMonth} setMonth={v => { setRcMonth(v); setExpandedRcId(null) }}/>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6, marginTop:10 }}>
              <div style={{ background:'#f0fdf4', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>입고확정 건수</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#059669', lineHeight:1 }}>{rcList.length}</p>
              </div>
              <div style={{ background:'#f8fafc', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>입고 수량</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#1e293b', lineHeight:1 }}>{rcReceivedQty.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="pm-card" style={{ flex:1, overflow:'auto', padding:0 }}>
            {rcList.length === 0
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
                  <PackagePlus size={28} style={{ opacity:0.2, margin:'0 auto 8px' }}/>
                  <p style={{ fontSize:13, fontWeight:700 }}>입고확정 내역이 없습니다</p>
                </div>
              : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                    <tr style={{ background:'#f8fafc' }}>
                      <th style={thStyle('left')}>입고일</th>
                      <th style={thStyle('left')}>구매처</th>
                      <th style={thStyle()}>품목</th>
                      <th style={thStyle()}>입고수량</th>
                      <th style={{ ...thStyle(), width:28 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rcList.map(p => {
                      const tRcv  = p.items.reduce((s,i) => s+i.received, 0)
                      const rcDate = p.received_at ? p.received_at.slice(0,10) : p.order_date
                      const isOpen = expandedRcId === p.id
                      return (
                        <>
                          <tr key={p.id}
                            onClick={() => setExpandedRcId(isOpen ? null : p.id)}
                            style={{ borderBottom:'1px solid #f8fafc', cursor:'pointer', background:isOpen?'#f0fdf4':undefined }}
                            onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background='#f8fafc' }}
                            onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background='' }}
                          >
                            <td style={tdStyle('left')}>
                              <span style={{ fontSize:11.5, fontWeight:700, color:'#334155' }}>{fmtDateShort(rcDate)}</span>
                              <span style={{ display:'block', fontSize:10, color:'#94a3b8' }}>{rcDate}</span>
                            </td>
                            <td style={{ ...tdStyle('left'), fontSize:11.5, color:'#475569' }}>{p.supplier||'-'}</td>
                            <td style={{ ...tdStyle(), color:'#64748b' }}>{p.items.length}건</td>
                            <td style={{ ...tdStyle(), fontWeight:800, color:'#059669' }}>{tRcv.toLocaleString()}</td>
                            <td style={tdStyle()}>
                              {isOpen ? <ChevronUp size={13} color="#94a3b8"/> : <ChevronDown size={13} color="#94a3b8"/>}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${p.id}-detail`}>
                              <td colSpan={5} style={{ padding:0, background:'#f0fdf4' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                  <thead>
                                    <tr style={{ background:'#bbf7d0' }}>
                                      {['상품코드','옵션명','바코드','입고수량'].map(h => (
                                        <th key={h} style={{ padding:'4px 8px', fontWeight:800, color:'#166534', textAlign:'center', fontSize:10 }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {p.items.map((item, i) => (
                                      <tr key={i} style={{ borderBottom:'1px solid #dcfce7' }}>
                                        <td style={{ padding:'4px 8px', color:'#334155', fontFamily:'monospace', fontSize:10.5 }}>{item.product_code}</td>
                                        <td style={{ padding:'4px 8px', color:'#475569', fontSize:10.5 }}>{item.option_name||'-'}</td>
                                        <td style={{ padding:'4px 8px', color:'#64748b', fontFamily:'monospace', fontSize:10 }}>{item.barcode||'-'}</td>
                                        <td style={{ padding:'4px 8px', textAlign:'center', fontWeight:800, color:'#059669' }}>{item.received}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
            }
          </div>
        </div>

      </div>
    </div>
  )
}
