'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Purchase,
  ST, isUnresolved,
  getThisMonth, shiftMonth,
  fmtMonthLabel, fmtDateShort,
  apiFetchPurchases,
} from './_shared'
import { ChevronLeft, ChevronRight, PackagePlus } from 'lucide-react'

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

  /* 발주내역 날짜 (월별 전용) */
  const [poMonth, setPoMonth] = useState(getThisMonth())

  /* 입고내역 날짜 (월별 전용) */
  const [rcMonth, setRcMonth] = useState(getThisMonth())

  const loadPurchases = useCallback(async () => {
    const data = await apiFetchPurchases()
    setPurchases(data)
  }, [])

  useEffect(() => {
    loadPurchases()
    /* 탭 포커스 시 자동 새로고침 (하위 탭에서 변경된 데이터 반영) */
    const onVisible = () => { if (document.visibilityState === 'visible') loadPurchases() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadPurchases])

  /* 발주내역 필터 (월별) */
  const poList = useMemo(() =>
    purchases.filter(p => p.order_date.startsWith(poMonth))
      .sort((a,b) => b.order_date.localeCompare(a.order_date))
  , [purchases, poMonth])

  /* 미입고 과거 건 (날짜 외 unresolved) */
  const poUnresolvedOld = useMemo(() =>
    purchases.filter(p => isUnresolved(p) && !p.order_date.startsWith(poMonth))
  , [purchases, poMonth])

  const poAll = useMemo(() => {
    const ids = new Set(poList.map(p => p.id))
    return [...poList, ...poUnresolvedOld.filter(p => !ids.has(p.id))]
  }, [poList, poUnresolvedOld])

  /* 입고내역 필터 (월별) */
  const rcList = useMemo(() =>
    purchases
      .filter(p => p.status !== 'ordered' && p.status !== 'cancelled')
      .filter(p => {
        const ref = (p.received_at ?? p.order_date).slice(0, rcMonth.length)
        return ref === rcMonth
      })
      .sort((a,b) => {
        const aD = (a.received_at ?? a.order_date).slice(0,10)
        const bD = (b.received_at ?? b.order_date).slice(0,10)
        return bD.localeCompare(aD)
      })
  , [purchases, rcMonth])

  /* KPI */
  const poOrderedQty    = useMemo(() => poList.reduce((s,p) => s+p.items.reduce((ss,i) => ss+i.ordered,0),0), [poList])
  const poUnresolvedAll = purchases.filter(isUnresolved)
  const rcReceivedQty   = useMemo(() => rcList.reduce((s,p) => s+p.items.reduce((ss,i) => ss+i.received,0),0), [rcList])

  const thStyle = (align: 'left'|'center' = 'center'): React.CSSProperties => ({
    padding:'6px 8px', fontWeight:800, color:'#64748b', fontSize:10.5, textAlign:align, borderBottom:'1px solid #f1f5f9',
  })
  const tdStyle = (align: 'left'|'center' = 'center'): React.CSSProperties => ({
    padding:'7px 8px', textAlign:align, verticalAlign:'middle',
  })

  return (
    <div className="pm-page" style={{ display:'flex', flexDirection:'column', height:'100%', gap:0 }}>
      {/* 2분할 컨텐츠 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, flex:1, overflow:'hidden' }}>

        {/* ── 왼쪽: 발주내역 ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, overflow:'hidden' }}>
          {/* 헤더 */}
          <div className="pm-card" style={{ padding:'10px 14px', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:14, fontWeight:900, color:'#0f172a' }}>📦 발주내역</span>
              <span style={{ fontSize:11, color:'#94a3b8' }}>
                {poAll.length}건
                {poUnresolvedOld.length > 0 && (
                  <span style={{ marginLeft:6, color:'#d97706', fontWeight:700 }}>⚠ 이전 미입고 {poUnresolvedOld.length}건</span>
                )}
              </span>
            </div>
            <MonthNav month={poMonth} setMonth={setPoMonth}/>
            {/* KPI */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginTop:10 }}>
              <div style={{ background:'#eff6ff', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>이번달 발주</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#2563eb', lineHeight:1 }}>{poList.length}</p>
              </div>
              <div style={{ background:'#f8fafc', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>발주 수량</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#1e293b', lineHeight:1 }}>{poOrderedQty.toLocaleString()}</p>
              </div>
              <div style={{ background: poUnresolvedAll.length>0?'#fffbeb':'#f8fafc', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>미입고(누적)</p>
                <p style={{ fontSize:18, fontWeight:900, color:poUnresolvedAll.length>0?'#d97706':'#94a3b8', lineHeight:1 }}>{poUnresolvedAll.length}</p>
              </div>
            </div>
          </div>

          {/* 발주 목록 */}
          <div className="pm-card" style={{ flex:1, overflow:'auto', padding:0 }}>
            {poAll.length === 0
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
                  <PackagePlus size={28} style={{ opacity:0.2, margin:'0 auto 8px' }}/>
                  <p style={{ fontSize:13, fontWeight:700 }}>발주 내역이 없습니다</p>
                </div>
              : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                    <tr style={{ background:'#f8fafc' }}>
                      <th style={thStyle('left')}>발주일</th>
                      <th style={thStyle('left')}>구매처</th>
                      <th style={thStyle()}>품목</th>
                      <th style={thStyle()}>발주</th>
                      <th style={thStyle()}>입고</th>
                      <th style={thStyle()}>미입고</th>
                      <th style={thStyle()}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poAll.map(p => {
                      const tOrd = p.items.reduce((s,i)=>s+i.ordered,0)
                      const tRcv = p.items.reduce((s,i)=>s+i.received,0)
                      const tMis = tOrd - tRcv
                      const st   = ST[p.status]
                      const old  = isUnresolved(p) && !p.order_date.startsWith(poMonth)
                      return (
                        <tr key={p.id} style={{ borderBottom:'1px solid #f8fafc', background:old?'#fffbeb':undefined }}>
                          <td style={tdStyle('left')}>
                            <span style={{ fontSize:11.5, fontWeight:700, color:'#334155' }}>{fmtDateShort(p.order_date)}</span>
                            <span style={{ display:'block', fontSize:10, color:'#94a3b8' }}>{p.order_date}</span>
                            {old && <span style={{ fontSize:9.5, fontWeight:800, color:'#d97706', background:'#fef3c7', padding:'1px 5px', borderRadius:99 }}>이전↑</span>}
                          </td>
                          <td style={{ ...tdStyle('left'), fontSize:11.5, color:'#475569' }}>{p.supplier||'-'}</td>
                          <td style={{ ...tdStyle(), color:'#64748b' }}>{p.items.length}건</td>
                          <td style={{ ...tdStyle(), fontWeight:800, color:'#1e293b' }}>{tOrd.toLocaleString()}</td>
                          <td style={{ ...tdStyle(), fontWeight:800, color:'#0ea5e9' }}>{tRcv.toLocaleString()}</td>
                          <td style={{ ...tdStyle(), fontWeight:900, color:tMis>0?'#d97706':'#94a3b8' }}>{tMis.toLocaleString()}</td>
                          <td style={tdStyle()}>
                            <span style={{ display:'inline-flex', fontSize:10.5, fontWeight:800, background:st.bg, color:st.color, padding:'2px 7px', borderRadius:99 }}>
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
            }
          </div>
        </div>

        {/* ── 오른쪽: 입고내역 ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, overflow:'hidden' }}>
          {/* 헤더 */}
          <div className="pm-card" style={{ padding:'10px 14px', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:14, fontWeight:900, color:'#0f172a' }}>✅ 입고내역</span>
              <span style={{ fontSize:11, color:'#94a3b8' }}>{rcList.length}건</span>
            </div>
            <MonthNav month={rcMonth} setMonth={setRcMonth}/>
            {/* KPI */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginTop:10 }}>
              <div style={{ background:'#f0fdf4', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>이번달 입고</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#059669', lineHeight:1 }}>{rcList.length}</p>
              </div>
              <div style={{ background:'#f8fafc', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>입고 수량</p>
                <p style={{ fontSize:18, fontWeight:900, color:'#1e293b', lineHeight:1 }}>{rcReceivedQty.toLocaleString()}</p>
              </div>
              <div style={{ background: poUnresolvedAll.length>0?'#fffbeb':'#f8fafc', borderRadius:8, padding:'6px 10px' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:'#94a3b8' }}>전체 미입고</p>
                <p style={{ fontSize:18, fontWeight:900, color:poUnresolvedAll.length>0?'#d97706':'#94a3b8', lineHeight:1 }}>{poUnresolvedAll.length}</p>
              </div>
            </div>
          </div>

          {/* 입고 목록 */}
          <div className="pm-card" style={{ flex:1, overflow:'auto', padding:0 }}>
            {rcList.length === 0
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
                  <PackagePlus size={28} style={{ opacity:0.2, margin:'0 auto 8px' }}/>
                  <p style={{ fontSize:13, fontWeight:700 }}>입고 내역이 없습니다</p>
                </div>
              : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                    <tr style={{ background:'#f8fafc' }}>
                      <th style={thStyle('left')}>발주일</th>
                      <th style={thStyle('left')}>입고일</th>
                      <th style={thStyle('left')}>구매처</th>
                      <th style={thStyle()}>품목</th>
                      <th style={thStyle()}>발주</th>
                      <th style={thStyle()}>입고</th>
                      <th style={thStyle()}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rcList.map(p => {
                      const tOrd = p.items.reduce((s,i)=>s+i.ordered,0)
                      const tRcv = p.items.reduce((s,i)=>s+i.received,0)
                      const st   = ST[p.status]
                      const rcDate = p.received_at ? p.received_at.slice(0,10) : p.order_date
                      return (
                        <tr key={p.id} style={{ borderBottom:'1px solid #f8fafc' }}>
                          <td style={{ ...tdStyle('left'), color:'#94a3b8', fontSize:11 }}>{p.order_date}</td>
                          <td style={tdStyle('left')}>
                            <span style={{ fontSize:11.5, fontWeight:700, color:'#334155' }}>{fmtDateShort(rcDate)}</span>
                            <span style={{ display:'block', fontSize:10, color:'#94a3b8' }}>{rcDate}</span>
                          </td>
                          <td style={{ ...tdStyle('left'), fontSize:11.5, color:'#475569' }}>{p.supplier||'-'}</td>
                          <td style={{ ...tdStyle(), color:'#64748b' }}>{p.items.length}건</td>
                          <td style={{ ...tdStyle(), fontWeight:800, color:'#1e293b' }}>{tOrd.toLocaleString()}</td>
                          <td style={{ ...tdStyle(), fontWeight:800, color:'#0ea5e9' }}>{tRcv.toLocaleString()}</td>
                          <td style={tdStyle()}>
                            <span style={{ display:'inline-flex', fontSize:10.5, fontWeight:800, background:st.bg, color:st.color, padding:'2px 7px', borderRadius:99 }}>
                              {st.label}
                            </span>
                          </td>
                        </tr>
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
