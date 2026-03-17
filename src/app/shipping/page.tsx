'use client'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { formatDateTime } from '@/lib/utils'
import { Truck, Search, Download, Printer, Upload, Package, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

export const SHIPPING_STORAGE_KEY = 'pm_shipping_v1'

type ShipItem = {
  id: string; order_number: string; channel: string
  channel_key: string          // 쇼핑몰 키 (API 송장전송에 필요)
  channel_order_id: string     // 쇼핑몰 고유 주문 ID
  customer_name: string; customer_phone: string; shipping_address: string
  items: string; status: string; tracking_number: string|null; carrier: string|null
  weight: string; shipped_at: string|null; created_at: string
}

function loadShipping(): ShipItem[] {
  try {
    const r = localStorage.getItem(SHIPPING_STORAGE_KEY)
    if (!r) return []
    const list: ShipItem[] = JSON.parse(r)
    // 레거시 데이터 마이그레이션: channel_key/channel_order_id 없는 경우 보완
    return list.map(o => ({
      ...o,
      channel_key      : o.channel_key      || o.id?.split('_')?.[0] || 'manual',
      channel_order_id : o.channel_order_id || o.order_number || o.id || '',
    }))
  } catch { return [] }
}
function saveShipping(data: ShipItem[]) {
  try { localStorage.setItem(SHIPPING_STORAGE_KEY, JSON.stringify(data)) } catch {}
}

/** localStorage에서 해당 쇼핑몰의 credentials 로드 */
function loadCredentialsForMall(mallKey: string): Record<string, string> {
  const creds: Record<string, string> = {}
  try {
    const keys = ['pm_mall_channels_v5', 'pm_mall_channels_v4', 'pm_mall_channels_v3']
    for (const k of keys) {
      const raw = localStorage.getItem(k)
      if (!raw) continue
      const list: Array<Record<string, string>> = JSON.parse(raw)
      const ch = list.find(c => c.channel_key === mallKey || c.mall_key === mallKey || c.id === mallKey)
      if (ch) {
        // 모든 credentials 필드 복사
        const CRED_FIELDS = ['api_key','api_secret','seller_id','login_id','login_pw',
          'site_name','refresh_token','access_key','access_token','mall_id','trader_code',
          'client_id','client_secret','vendor_id']
        for (const f of CRED_FIELDS) {
          if (ch[f]) creds[f] = ch[f]
        }
        break
      }
    }
  } catch {}
  return creds
}

const ST: Record<string, { label:string; dot:string; cls:string; icon:React.ReactNode }> = {
  pending:   { label:'대기',     dot:'bg-amber-400',   cls:'bg-amber-50 text-amber-700 ring-1 ring-amber-200',   icon:<AlertCircle size={11}/> },
  ready:     { label:'발송 준비',dot:'bg-blue-400',    cls:'bg-blue-50 text-blue-700 ring-1 ring-blue-200',     icon:<Package size={11}/> },
  shipped:   { label:'배송중',   dot:'bg-violet-400',  cls:'bg-violet-50 text-violet-700 ring-1 ring-violet-200',icon:<Truck size={11}/> },
  delivered: { label:'배송완료', dot:'bg-emerald-400', cls:'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',icon:<CheckCircle2 size={11}/> },
}

export default function ShippingPage() {
  const [items, setItems] = useState<ShipItem[]>([])
  const [mounted, setMounted] = useState(false)
  const [search, setSearch] = useState('')
  const [sf, setSf] = useState('전체')
  const [sel, setSel] = useState<string[]>([])
  const [trackModal, setTrackModal] = useState(false)
  const [bulkModal, setBulkModal] = useState(false)
  const [trackItem, setTrackItem] = useState<ShipItem|null>(null)
  const [trackCarrier, setTrackCarrier] = useState('CJ대한통운')
  const [trackNum, setTrackNum] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; manual?: boolean } | null>(null)

  useEffect(() => {
    setMounted(true)
    setItems(loadShipping())
  }, [])

  useEffect(() => {
    if (!mounted) return
    const onStorage = () => setItems(loadShipping())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [mounted])

  const filtered = items
    .filter(o =>
      (o.order_number.includes(search) || o.customer_name.includes(search) || (o.tracking_number||'').includes(search)) &&
      (sf === '전체' || o.status === sf)
    )
    .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const toggle = (id:string) => setSel(p=>p.includes(id)?p.filter(i=>i!==id):[...p,id])
  const counts = {
    pending:   items.filter(o=>o.status==='pending').length,
    ready:     items.filter(o=>o.status==='ready').length,
    shipped:   items.filter(o=>o.status==='shipped').length,
    delivered: items.filter(o=>o.status==='delivered').length,
  }

  /** 단건 송장 등록 + 쇼핑몰 API 전송 */
  const handleTrackSave = useCallback(async () => {
    if (!trackItem || !trackNum.trim()) return
    setUploading(true)
    setUploadResult(null)

    const mallKey = trackItem.channel_key || 'manual'
    const credentials = loadCredentialsForMall(mallKey)

    let apiResult: { success: boolean; message: string; manual?: boolean } = {
      success: true,
      message: '송장이 등록되었습니다.',
    }

    // 쇼핑몰 API 전송 (수동 등록이 아닐 때)
    if (mallKey !== 'manual') {
      try {
        const res = await fetch('/api/orders/invoice', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({
            mall_key        : mallKey,
            credentials,
            channel_order_id: trackItem.channel_order_id || trackItem.order_number,
            carrier_name    : trackCarrier,
            invoice_no      : trackNum.trim(),
          }),
        })
        const data = await res.json()
        apiResult = {
          success: data.success,
          message: data.message || (data.success ? '송장 전송 완료' : '전송 실패'),
          manual : data.manual,
        }
      } catch (e) {
        apiResult = { success: false, message: `네트워크 오류: ${e instanceof Error ? e.message : String(e)}` }
      }
    }

    // 성공 여부에 관계없이 로컬 상태는 업데이트
    setItems(prev => {
      const updated = prev.map(o => o.id === trackItem.id
        ? { ...o, tracking_number: trackNum.trim(), carrier: trackCarrier, status: 'shipped', shipped_at: new Date().toISOString() }
        : o
      )
      saveShipping(updated)
      return updated
    })

    setUploading(false)
    setUploadResult(apiResult)

    // 성공 시 1.5초 후 모달 닫기
    if (apiResult.success) {
      setTimeout(() => { setTrackModal(false); setUploadResult(null) }, 1500)
    }
  }, [trackItem, trackNum, trackCarrier])

  const handleStatusChange = (id: string, status: string) => {
    setItems(prev => {
      const updated = prev.map(o => o.id === id ? { ...o, status } : o)
      saveShipping(updated)
      return updated
    })
  }

  if (!mounted) return null

  return (
    <div className="space-y-5 max-w-[1600px]">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'처리 대기', v:counts.pending,   cls:'text-amber-600 bg-amber-50' },
          { label:'발송 준비', v:counts.ready,     cls:'text-blue-600 bg-blue-50' },
          { label:'배송중',    v:counts.shipped,   cls:'text-violet-600 bg-violet-50' },
          { label:'배송완료',  v:counts.delivered, cls:'text-emerald-600 bg-emerald-50' },
        ].map(c=>(
          <div key={c.label} className={`rounded-2xl border border-slate-200/80 shadow-sm p-5 ${c.cls}`}>
            <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-[32px] font-extrabold mt-1 leading-none">{c.v}</p>
          </div>
        ))}
      </div>

      {/* 일괄 작업 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
        <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wide mb-3">일괄 작업</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={()=>setBulkModal(true)} disabled={sel.length===0}>
            <Upload size={14}/>일괄 송장 등록 ({sel.length})
          </Button>
          <Button variant="outline"><Download size={14}/>송장 양식</Button>
          <Button variant="outline"><Upload size={14}/>엑셀 업로드</Button>
          <Button variant="outline" disabled={sel.length===0}><Printer size={14}/>운송장 출력 ({sel.length})</Button>
        </div>
      </div>

      {/* 검색/필터 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
            <Input placeholder="주문번호, 고객명, 송장번호..." value={search} onChange={e=>setSearch(e.target.value)} className="pl-9"/>
          </div>
          <Select value={sf} onChange={e=>setSf(e.target.value)} className="sm:w-40">
            <option value="전체">전체</option>
            <option value="pending">처리 대기</option>
            <option value="ready">발송 준비</option>
            <option value="shipped">배송중</option>
            <option value="delivered">배송완료</option>
          </Select>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" className="rounded"
                    onChange={e=>setSel(e.target.checked ? filtered.map(o=>o.id) : [])}
                    checked={filtered.length > 0 && sel.length === filtered.length}
                  />
                </th>
                {['주문번호','채널','수령인','상품','배송주소','상태','송장정보','접수일시','관리'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-extrabold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign:'center', padding:'3.5rem 1rem', color:'#94a3b8' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                      <Truck size={36} style={{ opacity:0.2 }} />
                      <p style={{ fontSize:13.5, fontWeight:700 }}>배송 데이터가 없습니다</p>
                      <p style={{ fontSize:12, fontWeight:500, color:'#cbd5e1' }}>주문관리에서 [배송준비] 버튼으로 목록을 이동해주세요</p>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map(o=>{
                const st = ST[o.status] ?? ST['pending']
                return (
                  <tr key={o.id} className={`transition-colors group ${sel.includes(o.id)?'bg-blue-50/50':'hover:bg-slate-50/60'}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" checked={sel.includes(o.id)} onChange={()=>toggle(o.id)}/>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-extrabold text-blue-600 text-[12px]">{o.order_number}</span>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-600 text-[12.5px]">{o.channel}</td>
                    <td className="px-4 py-3">
                      <p className="font-extrabold text-slate-800 text-[12.5px]">{o.customer_name}</p>
                      <p className="text-[11px] text-slate-400">{o.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-slate-600 font-bold max-w-[160px] truncate">{o.items}</td>
                    <td className="px-4 py-3 text-[12px] text-slate-500 max-w-[140px] truncate">{o.shipping_address}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${st.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}/>{st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {o.tracking_number
                        ? <div>
                            <p className="font-mono font-extrabold text-slate-700 text-[11.5px]">{o.tracking_number}</p>
                            <p className="text-[10.5px] text-slate-400">{o.carrier}</p>
                          </div>
                        : <button onClick={()=>{setTrackItem(o);setTrackModal(true);setTrackNum('');setTrackCarrier('CJ대한통운');setUploadResult(null)}}
                            className="text-[11.5px] font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1">
                            <Truck size={11}/>등록
                          </button>
                      }
                    </td>
                    <td className="px-4 py-3 text-[11.5px] text-slate-400 whitespace-nowrap">{formatDateTime(o.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!o.tracking_number && (
                          <button onClick={()=>{setTrackItem(o);setTrackModal(true);setTrackNum('');setTrackCarrier('CJ대한통운');setUploadResult(null)}}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                            <Truck size={13}/>
                          </button>
                        )}
                        {o.status === 'ready' && (
                          <button onClick={()=>handleStatusChange(o.id,'shipped')}
                            style={{ fontSize:10.5, fontWeight:800, padding:'3px 7px', background:'#f5f3ff', color:'#6d28d9', border:'none', borderRadius:6, cursor:'pointer' }}>
                            배송중
                          </button>
                        )}
                        {o.status === 'shipped' && (
                          <button onClick={()=>handleStatusChange(o.id,'delivered')}
                            style={{ fontSize:10.5, fontWeight:800, padding:'3px 7px', background:'#ecfdf5', color:'#15803d', border:'none', borderRadius:6, cursor:'pointer' }}>
                            완료
                          </button>
                        )}
                        {o.tracking_number && (
                          <button className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                            <Printer size={13}/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <p className="text-[12px] font-bold text-slate-400">총 {filtered.length}건 · {sel.length}건 선택</p>
        </div>
      </div>

      {/* 단건 송장 등록 */}
      {trackItem && (
        <Modal isOpen={trackModal} onClose={()=>{ if (!uploading) { setTrackModal(false); setUploadResult(null) }}} title="송장번호 등록">
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl">
              <p className="font-mono font-extrabold text-blue-600">{trackItem.order_number}</p>
              <p className="text-[12.5px] text-slate-600 mt-1 font-bold">{trackItem.customer_name} · {trackItem.customer_phone}</p>
              <p className="text-[12px] text-slate-500 mt-0.5">{trackItem.shipping_address}</p>
              <p className="text-[12.5px] font-extrabold text-slate-700 mt-2">{trackItem.items}</p>
              {/* 쇼핑몰 정보 표시 */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400">채널</span>
                <span className="text-[11px] font-extrabold text-slate-600">{trackItem.channel}</span>
                {trackItem.channel_key === 'manual' && (
                  <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full">수동등록</span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-extrabold text-slate-600 mb-1.5">택배사 *</label>
              <Select className="w-full" value={trackCarrier} onChange={e=>setTrackCarrier(e.target.value)} disabled={uploading}>
                {['CJ대한통운','롯데택배','한진택배','우체국택배','로젠택배','경동택배','편의점택배'].map(v=><option key={v}>{v}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-[12px] font-extrabold text-slate-600 mb-1.5">송장번호 *</label>
              <Input placeholder="송장번호 입력" className="font-mono" value={trackNum} onChange={e=>setTrackNum(e.target.value)} disabled={uploading} />
            </div>

            {/* 안내 / 결과 박스 */}
            {!uploadResult && !uploading && (
              <div className="p-3.5 bg-blue-50 rounded-xl text-[12px] font-bold text-blue-700">
                {trackItem.channel_key === 'manual'
                  ? '📦 수동 등록 주문 — 로컬에만 저장됩니다 (쇼핑몰 API 전송 없음)'
                  : `📦 등록 시 자동 처리: 로컬 저장 · ${trackItem.channel} API 송장 전송`}
              </div>
            )}
            {uploading && (
              <div className="p-3.5 bg-slate-50 rounded-xl text-[12px] font-bold text-slate-600 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin"/>
                {trackItem.channel} API에 송장 전송 중...
              </div>
            )}
            {uploadResult && (
              <div className={`p-3.5 rounded-xl text-[12px] font-bold flex items-center gap-2 ${
                uploadResult.success
                  ? uploadResult.manual ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'
              }`}>
                {uploadResult.success
                  ? (uploadResult.manual ? '⚠️' : <CheckCircle2 size={14}/>)
                  : <AlertCircle size={14}/>}
                {uploadResult.message}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>{ if(!uploading){ setTrackModal(false); setUploadResult(null) }}} disabled={uploading}>취소</Button>
              <Button onClick={handleTrackSave} disabled={uploading || !trackNum.trim()}>
                {uploading ? <Loader2 size={14} className="animate-spin"/> : <Truck size={14}/>}
                {uploading ? '전송 중...' : '등록 및 전송'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 일괄 송장 등록 */}
      <Modal isOpen={bulkModal} onClose={()=>setBulkModal(false)} title="일괄 송장 등록">
        <div className="space-y-4">
          <p className="text-[13px] font-bold text-slate-600">{sel.length}건 주문에 대해 일괄 송장을 등록합니다.</p>
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-blue-300 transition-colors cursor-pointer">
            <Upload size={28} className="text-slate-300 mx-auto mb-2"/>
            <p className="text-[13px] font-bold text-slate-400">엑셀 파일을 드래그하거나 클릭하세요</p>
            <p className="text-[11px] text-slate-300 mt-1">.xlsx, .xls 지원</p>
          </div>
          <div>
            <label className="block text-[12px] font-extrabold text-slate-600 mb-1.5">공통 택배사</label>
            <Select className="w-full">
              <option value="">선택 (일괄 적용)</option>
              {['CJ대한통운','롯데택배','한진택배','우체국택배'].map(v=><option key={v}>{v}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={()=>setBulkModal(false)}>취소</Button>
            <Button><Upload size={14}/>일괄 등록</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
