'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Purchase, PmProduct,
  getThisMonth, shiftMonth,
  fmtMonthLabel, fmtDateShort,
  apiFetchPurchases, isUnresolved,
  DEFAULT_EXCHANGE_RATE, unitToOrderKrw,
} from './_shared'
import { ChevronLeft, ChevronRight, PackagePlus, ChevronDown, ChevronUp, Truck } from 'lucide-react'

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

function calcOrderKrw(purchase: Purchase, products: FP[], exchangeRate: number): number {
  return purchase.items.reduce((sum, item) => {
    const prod = products.find(p => p.code === item.product_code)
    if (!prod?.cost_price) return sum
    return sum + unitToOrderKrw(prod.cost_price, prod.cost_currency || '원', exchangeRate) * item.ordered
  }, 0)
}

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
  const [purchases,    setPurchases]    = useState<Purchase[]>([])
  const [products,     setProducts]     = useState<FP[]>([])
  const [exchangeRate, setExchangeRate] = useState(DEFAULT_EXCHANGE_RATE)

  /* 좌측: 발주 목록 */
  const [poMonth,      setPoMonth]      = useState(getThisMonth())
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null)

  /* 우측: 미입고 리스트 (전체·바코드순) */

  const loadPurchases = useCallback(async () => {
    const data = await apiFetchPurchases()
    setPurchases(data)
  }, [])

  useEffect(() => {
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

  /* ── 발주 목록: 해당 월의 ordered 상태 발주 ── */
  const poList = useMemo(() =>
    purchases
      .filter(p => p.status === 'ordered' && p.order_date.startsWith(poMonth))
      .sort((a, b) => a.order_date.localeCompare(b.order_date))
  , [purchases, poMonth])

  /* ── 미입고 리스트: 미입고 수량이 있는 품목을 바코드 오름차순으로 flatten ── */
  const miItems = useMemo(() => {
    const rows: {
      barcode: string; productCode: string; optionName: string
      orderDate: string; supplier: string
      ordered: number; received: number; missing: number
    }[] = []
    for (const p of purchases) {
      if (!isUnresolved(p)) continue
      for (const item of p.items) {
        const mis = Math.max(0, item.ordered - item.received)
        if (mis <= 0) continue
        rows.push({
          barcode:     item.barcode     || '',
          productCode: item.product_code,
          optionName:  item.option_name  || '',
          orderDate:   p.order_date,
          supplier:    p.supplier        || '',
          ordered:     item.ordered,
          received:    item.received,
          missing:     mis,
        })
      }
    }
    return rows.sort((a, b) => a.barcode.localeCompare(b.barcode))
  }, [purchases])

  /* KPI */
  const poOrderedQty = useMemo(() =>
    poList.reduce((s,p) => s + p.items.reduce((ss,i) => ss + i.ordered, 0), 0)
  , [poList])

  const poMonthKrw = useMemo(() =>
    poList.reduce((s,p) => s + calcOrderKrw(p, products, exchangeRate), 0)
  , [poList, products, exchangeRate])

  const miTotalQty = useMemo(() =>
    miItems.reduce((s, r) => s + r.missing, 0)
  , [miItems])

  const thStyle = (align: 'left'|'center' = 'center'): React.CSSProperties => ({
    padding:'6px 8px', fontWeight:800, color:'#64748b', fontSize:10.5, textAlign:align,
    borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap',
  })
  const tdStyle = (align: 'left'|'center' = 'center'): React.CSSProperties => ({
    padding:'7px 8px', textAlign:align, verticalAlign:'middle',
  })

  return (
    <div className="pm-page" style={{ display:'flex', flexDirection:'column', height:'100%', gap:0 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, flex:1, overflow:'hidden' }}>

        {/* ── 좌측: 발주 목록 ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, overflow:'hidden' }}>

          {/* KPI 카드 */}
          <div className="pm-card" style={{ padding:'10px 14px', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:14, fontWeight:900, color:'#0f172a' }}>📦 발주 목록</span>
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
                <p style={{ fontSize: poMonthKrw > 0 ? 14 : 18, fontWeight:900,
                  color: poMonthKrw > 0 ? '#92400e' : '#cbd5e1', lineHeight:1,
                  marginTop: poMonthKrw > 0 ? 3 : 0 }}>
                  {poMonthKrw > 0 ? `₩${Math.round(poMonthKrw).toLocaleString()}` : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* 목록 테이블 */}
          <div className="pm-card" style={{ flex:1, overflow:'auto', padding:0 }}>
            {poList.length === 0
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
                  <PackagePlus size={28} style={{ opacity:0.2, margin:'0 auto 8px' }}/>
                  <p style={{ fontSize:13, fontWeight:700 }}>이 달의 발주 내역이 없습니다</p>
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
                      const tOrd    = p.items.reduce((s,i) => s + i.ordered, 0)
                      const lineKrw = calcOrderKrw(p, products, exchangeRate)
                      const isOpen  = expandedPoId === p.id
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

        {/* ── 우측: 미입고 리스트 (전체·바코드순) ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, overflow:'hidden' }}>

          {/* KPI 카드 */}
          <div className="pm-card" style={{ padding:'10px 14px', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:14, fontWeight:900, color:'#0f172a' }}>🚚 미입고 리스트</span>
              <span style={{ fontSize:11, color:'#94a3b8' }}>전체 {miItems.length}건</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6 }}>
              <div style={{ background:'#fff7ed', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>미입고 품목 수</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#d97706', lineHeight:1 }}>{miItems.length}</p>
              </div>
              <div style={{ background:'#f8fafc', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>미입고 수량</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#1e293b', lineHeight:1 }}>{miTotalQty.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* 목록 테이블 */}
          <div className="pm-card" style={{ flex:1, overflow:'auto', padding:0 }}>
            {miItems.length === 0
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
                  <Truck size={28} style={{ opacity:0.2, margin:'0 auto 8px' }}/>
                  <p style={{ fontSize:13, fontWeight:700 }}>미입고 항목이 없습니다</p>
                </div>
              : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                    <tr style={{ background:'#f8fafc' }}>
                      <th style={thStyle()}>바코드</th>
                      <th style={thStyle('left')}>상품코드</th>
                      <th style={thStyle('left')}>옵션명</th>
                      <th style={thStyle('left')}>발주일</th>
                      <th style={thStyle()}>발주</th>
                      <th style={thStyle()}>입고</th>
                      <th style={thStyle()}>미입고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {miItems.map((row, idx) => (
                      <tr key={idx}
                        style={{ borderBottom:'1px solid #f8fafc' }}
                        onMouseEnter={e => { e.currentTarget.style.background='#fffbeb' }}
                        onMouseLeave={e => { e.currentTarget.style.background='' }}
                      >
                        <td style={{ ...tdStyle(), fontFamily:'monospace', fontSize:10.5, color:'#475569', whiteSpace:'nowrap' }}>
                          {row.barcode || '-'}
                        </td>
                        <td style={{ ...tdStyle('left'), fontFamily:'monospace', fontSize:11, color:'#059669', fontWeight:800 }}>
                          {row.productCode}
                        </td>
                        <td style={{ ...tdStyle('left'), fontSize:11, color:'#475569', maxWidth:100 }}>
                          <span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {row.optionName || '-'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle('left') }}>
                          <span style={{ fontSize:11.5, fontWeight:700, color:'#334155' }}>{fmtDateShort(row.orderDate)}</span>
                          <span style={{ display:'block', fontSize:10, color:'#94a3b8' }}>{row.supplier||'-'}</span>
                        </td>
                        <td style={{ ...tdStyle(), fontWeight:700, color:'#64748b' }}>{row.ordered}</td>
                        <td style={{ ...tdStyle(), fontWeight:700, color:'#059669' }}>{row.received}</td>
                        <td style={{ ...tdStyle() }}>
                          <span style={{ fontSize:12, fontWeight:900, background:'#fff7ed', color:'#d97706',
                            padding:'2px 8px', borderRadius:6 }}>
                            {row.missing}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </div>
        </div>

      </div>
    </div>
  )
}
