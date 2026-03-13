'use client'
import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  Plus, Search, Download, Upload, Package, TrendingUp, AlertTriangle,
  Edit, Trash2, X, Store, ImageIcon, Link2,
} from 'lucide-react'

/* ─── 연동된 채널 ────────────────────────────────────────────── */
const CONNECTED_CHANNELS = [
  { name:'쿠팡',   emoji:'🛒', color:'#c2410c', bg:'#fff7ed' },
  { name:'네이버', emoji:'🟢', color:'#15803d', bg:'#f0fdf4' },
  { name:'11번가', emoji:'1️⃣', color:'#be123c', bg:'#fff1f2' },
]
const DISCONNECTED_CHANNELS = ['G마켓', '옥션', '티몬', '위메프']

/* ─── 타입 ──────────────────────────────────────────────────── */
type ProductStatus = 'active' | 'soldout' | 'pending_delete' | 'upcoming'
type CostCurrency  = 'KRW' | 'CNY'

interface ProductOption {
  name: string
  chinese_name: string  // 중국명
  barcode: string
  image: string     // 옵션 이미지 (URL 또는 base64)
  ordered: number   // 발주 수량
  received: number  // 입고 수량
  sold: number      // 판매 수량
  // 미입고 = ordered - received  (계산)
  // 현재고 = received - sold     (계산)
}
interface ChannelPrice { channel: string; price: number }
interface Product {
  id: string; code: string; name: string; category: string; loca: string
  options: ProductOption[]
  cost_price: number; cost_currency: CostCurrency
  channel_prices: ChannelPrice[]
  status: ProductStatus; supplier: string
}

const CNY_TO_KRW = 193
const DEFAULT_CATS = ['전체', '가방', '의류', '잡화']

/* ─── 상태 맵 ───────────────────────────────────────────────── */
const ST: Record<ProductStatus, { label:string; bg:string; color:string; dot:string }> = {
  active:         { label:'판매중',   bg:'#f0fdf4', color:'#15803d', dot:'#22c55e' },
  soldout:        { label:'품절',     bg:'#fff1f2', color:'#be123c', dot:'#ef4444' },
  pending_delete: { label:'삭제예정', bg:'#fff7ed', color:'#c2410c', dot:'#f97316' },
  upcoming:       { label:'판매예정', bg:'#eff6ff', color:'#2563eb', dot:'#3b82f6' },
}
const ST_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value:'active',         label:'판매중'   },
  { value:'upcoming',       label:'판매예정' },
  { value:'soldout',        label:'품절'     },
  { value:'pending_delete', label:'삭제예정' },
]
const CH_STYLE: Record<string, { bg:string; color:string }> = {
  '쿠팡':  { bg:'#fff7ed', color:'#c2410c' },
  '네이버':{ bg:'#f0fdf4', color:'#15803d' },
  '11번가':{ bg:'#fff1f2', color:'#be123c' },
  'G마켓': { bg:'#eff6ff', color:'#1d4ed8' },
}

/* ─── 헬퍼 ──────────────────────────────────────────────────── */
const optStock       = (o: ProductOption) => Math.max(0, o.received - o.sold)
const optUndelivered = (o: ProductOption) => Math.max(0, o.ordered - o.received)
const totalCurStock  = (p: Product) => p.options.reduce((s, o) => s + optStock(o), 0)
const isUrl          = (s: string) => /^https?:\/\//i.test(s.trim())

function formatCost(p: Product) {
  if (p.cost_currency === 'CNY') {
    return (
      <div>
        <span style={{ fontSize:12.5, fontWeight:900, color:'#1e293b' }}>¥{p.cost_price.toLocaleString()}</span>
        <span style={{ fontSize:10, fontWeight:700, color:'#94a3b8', marginLeft:3 }}>위안</span>
        <div style={{ fontSize:10.5, fontWeight:700, color:'#64748b', marginTop:1 }}>
          ≈ {formatCurrency(Math.round(p.cost_price * CNY_TO_KRW))}
        </div>
      </div>
    )
  }
  return <span style={{ fontSize:13, fontWeight:800, color:'#1e293b' }}>{formatCurrency(p.cost_price)}</span>
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:5 }}>{children}</label>
}

function MgmtBtn({ onClick, bg, color, hoverBg, children }: { onClick?:()=>void; bg:string; color:string; hoverBg:string; children:React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11.5, fontWeight:800, cursor:'pointer',
        background:bg, color, border:'none', borderRadius:7, padding:'4px 9px', transition:'background 150ms ease', whiteSpace:'nowrap' }}
      onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
      onMouseLeave={e => (e.currentTarget.style.background = bg)}
    >{children}</button>
  )
}

/* ─── 구매처 셀 ─────────────────────────────────────────────── */
function SupplierCell({ supplier }: { supplier: string }) {
  if (!supplier) return <span style={{ color:'#cbd5e1' }}>-</span>
  if (isUrl(supplier)) {
    return (
      <a href={supplier} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, fontWeight:700,
          color:'#2563eb', textDecoration:'none', padding:'3px 8px', background:'#eff6ff',
          borderRadius:6, border:'1px solid rgba(37,99,235,0.15)' }}>
        <Link2 size={11}/>링크
      </a>
    )
  }
  return <span style={{ fontSize:12.5, fontWeight:700, color:'#64748b' }}>{supplier}</span>
}

/* ─── 쇼핑몰 판매가 모달 ────────────────────────────────────── */
function ChannelPriceModal({
  product, onClose, onSave,
}: { product: Product; onClose: () => void; onSave: (prices: ChannelPrice[]) => void }) {
  const [prices, setPrices] = useState<Record<string, string>>(
    () => Object.fromEntries(
      CONNECTED_CHANNELS.map(ch => [ch.name, String(product.channel_prices.find(cp => cp.channel === ch.name)?.price ?? '')])
    )
  )
  const costKrw = product.cost_currency === 'CNY' ? Math.round(product.cost_price * CNY_TO_KRW) : product.cost_price
  const handleSave = () => {
    const result: ChannelPrice[] = CONNECTED_CHANNELS
      .filter(ch => prices[ch.name] && Number(prices[ch.name]) > 0)
      .map(ch => ({ channel: ch.name, price: Number(prices[ch.name]) }))
    onSave(result)
  }
  return (
    <Modal isOpen onClose={onClose} title={`쇼핑몰별 판매가 — ${product.name}`} size="md">
      <div style={{ marginBottom:16 }}>
        <p style={{ fontSize:11.5, fontWeight:700, color:'#64748b', marginBottom:10 }}>
          원가: {product.cost_currency==='CNY' ? `¥${product.cost_price} (≈ ${formatCurrency(costKrw)})` : formatCurrency(product.cost_price)}
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {CONNECTED_CHANNELS.map(ch => {
            const price = Number(prices[ch.name]) || 0
            const margin = costKrw > 0 && price > 0 ? (((price - costKrw) / price) * 100).toFixed(1) : null
            const below  = price > 0 && price < costKrw
            return (
              <div key={ch.name} style={{ background:'#f8fafc', borderRadius:12, padding:'12px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:13, fontWeight:800, background:ch.bg, color:ch.color, padding:'2px 10px', borderRadius:6 }}>
                      {ch.emoji} {ch.name}
                    </span>
                    {below && <span style={{ fontSize:11, fontWeight:800, color:'#dc2626' }}>⚠️ 원가 미만</span>}
                  </div>
                  {margin && <span style={{ fontSize:12.5, fontWeight:800, color: below ? '#dc2626' : '#059669' }}>마진 {margin}%</span>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#64748b', minWidth:14 }}>₩</span>
                  <Input type="number" placeholder="0" value={prices[ch.name]}
                    onChange={e => setPrices(prev => ({...prev, [ch.name]: e.target.value}))}
                    style={{ fontSize:14, fontWeight:800 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {DISCONNECTED_CHANNELS.length > 0 && (
        <p style={{ fontSize:11.5, fontWeight:600, color:'#94a3b8', marginBottom:16, padding:'8px 12px', background:'#f8fafc', borderRadius:8 }}>
          미연동 채널: {DISCONNECTED_CHANNELS.join(', ')} — <a href="/channels" style={{ color:'#2563eb', fontWeight:700 }}>채널 연동하기</a>
        </p>
      )}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={handleSave}>저장</Button>
      </div>
    </Modal>
  )
}

/* ─── 폼 초기값 ─────────────────────────────────────────────── */
const genBarcode = (code: string, opt: string) =>
  code && opt ? `${code.trim()} ${opt.trim().toUpperCase()}FFF` : ''

const INIT_OPT  = { name:'', chinese_name:'', barcode:'', image:'' }
const INIT_FORM = {
  code:'', name:'', category:'', supplier:'', loca:'',
  cost_price:'', cost_currency:'CNY' as CostCurrency,
  newCat:'', status:'active' as ProductStatus,
  options:[{ ...INIT_OPT }],
}

/* ─── 옵션 이미지 파일→base64 ───────────────────────────────── */
function useOptImageUpload(setForm: React.Dispatch<React.SetStateAction<typeof INIT_FORM>>) {
  return (idx: number, file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const result = e.target?.result as string ?? ''
      setForm(f => {
        const opts = f.options.map((o, i) => i === idx ? { ...o, image: result } : o)
        return { ...f, options: opts }
      })
    }
    reader.readAsDataURL(file)
  }
}

/* ─── Supabase row → Product 변환 ──────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProduct(row: any): Product {
  return {
    id: row.id,
    code: row.code ?? '',
    name: row.name ?? '',
    category: row.category ?? '',
    loca: row.loca ?? '',
    cost_price: row.cost_price ?? 0,
    cost_currency: (row.cost_currency ?? 'CNY') as CostCurrency,
    status: (row.status ?? 'active') as ProductStatus,
    supplier: row.supplier ?? '',
    options: (row.options ?? []) as ProductOption[],
    channel_prices: (row.channel_prices ?? []) as ChannelPrice[],
  }
}

/* ─── 메인 컴포넌트 ─────────────────────────────────────────── */
export default function ProductsPage() {
  const [products, setProducts]   = useState<Product[]>([])
  const [extraCats, setExtraCats] = useState<string[]>([])
  const [activeTab, setActiveTab]     = useState('전체')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('전체')
  const [isAdd, setIsAdd]             = useState(false)
  const [detail, setDetail]           = useState<Product | null>(null)
  const [isEdit, setIsEdit]           = useState<Product | null>(null)
  const [channelPriceTarget, setChannelPriceTarget] = useState<Product | null>(null)
  const [editStatusId, setEditStatusId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10

  // 카테고리 관리 상태
  const [catAddMode, setCatAddMode]       = useState(false)
  const [catAddInput, setCatAddInput]     = useState('')
  const [catEditTarget, setCatEditTarget] = useState<string | null>(null)
  const [catEditInput, setCatEditInput]   = useState('')
  const [catDeleteTarget, setCatDeleteTarget] = useState<string | null>(null)

  const [form, setForm] = useState(INIT_FORM)
  const [loading, setLoading] = useState(true)
  const handleOptImage  = useOptImageUpload(setForm)

  /* ── Supabase 로드 ── */
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('pm_products')
        .select('*')
        .order('created_at', { ascending: false })
      if (!error && data) {
        const loaded = data.map(rowToProduct)
        setProducts(loaded)
        const cats = loaded.map(p => p.category).filter(c => c && !DEFAULT_CATS.includes(c))
        setExtraCats([...new Set(cats)] as string[])
      }
      setLoading(false)
    }
    load()
  }, [])

  const allCats  = useMemo(() => [...new Set([...DEFAULT_CATS, ...extraCats])], [extraCats])

  /* ── 카테고리 추가 ── */
  const handleCatAdd = () => {
    const name = catAddInput.trim()
    if (!name || allCats.includes(name)) { setCatAddMode(false); setCatAddInput(''); return }
    setExtraCats(prev => [...prev, name])
    setCatAddMode(false)
    setCatAddInput('')
  }

  /* ── 카테고리 이름변경 ── */
  const handleCatRename = () => {
    if (!catEditTarget) return
    const newName = catEditInput.trim()
    if (!newName || newName === catEditTarget || allCats.includes(newName)) {
      setCatEditTarget(null); return
    }
    // state 업데이트
    setExtraCats(prev => prev.includes(catEditTarget)
      ? prev.map(c => c === catEditTarget ? newName : c)
      : [...prev, newName].filter(c => c !== catEditTarget)
    )
    // 해당 카테고리 상품들 메모리 업데이트 (Supabase는 백그라운드)
    setProducts(prev => prev.map(p => p.category === catEditTarget ? { ...p, category: newName } : p))
    supabase.from('pm_products').update({ category: newName }).eq('category', catEditTarget).then(() => {})
    if (activeTab === catEditTarget) setActiveTab(newName)
    setCatEditTarget(null)
  }

  /* ── 카테고리 삭제 ── */
  const handleCatDelete = (cat: string) => {
    setExtraCats(prev => prev.filter(c => c !== cat))
    if (activeTab === cat) setActiveTab('전체')
    setCatDeleteTarget(null)
  }
  const filtered = useMemo(() => {
    setPage(1)
    return products.filter(p => {
      const q   = search.trim()
      const mS  = !q || p.name.includes(q) || p.code.includes(q) || p.options.some(o => o.barcode.includes(q) || o.name.includes(q))
      const mC  = activeTab === '전체' || p.category === activeTab
      const mSt = statusFilter === '전체' || p.status === statusFilter
      return mS && mC && mSt
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, search, activeTab, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const doSearch    = () => { setSearch(searchInput); setPage(1) }
  const clearSearch = () => { setSearch(''); setSearchInput(''); setPage(1) }

  const handleAdd = async () => {
    const cat = form.category === '__new__' ? form.newCat : form.category
    if (!form.name || !form.code || !cat) return
    const options: ProductOption[] = form.options.filter(o => o.name).map(o => ({
      name: o.name,
      chinese_name: o.chinese_name,
      barcode: o.barcode || genBarcode(form.code, o.name),
      image: o.image,
      ordered: 0, received: 0, sold: 0,
    }))
    const payload = {
      code: form.code, name: form.name, category: cat, loca: form.loca,
      cost_price: Number(form.cost_price) || 0,
      cost_currency: form.cost_currency,
      status: form.status, supplier: form.supplier,
      options, channel_prices: [],
    }
    const { data, error } = await supabase.from('pm_products').insert(payload).select().single()
    if (error) { console.error('상품 등록 오류:', error); return }
    const p = rowToProduct(data)
    setProducts(prev => [p, ...prev])
    if (cat && !DEFAULT_CATS.includes(cat) && !extraCats.includes(cat)) setExtraCats(prev => [...prev, cat])
    setIsAdd(false)
    setForm(INIT_FORM)
  }

  const handleChannelPriceSave = async (prices: ChannelPrice[]) => {
    if (!channelPriceTarget) return
    const { error } = await supabase.from('pm_products').update({ channel_prices: prices }).eq('id', channelPriceTarget.id)
    if (!error) setProducts(prev => prev.map(p => p.id === channelPriceTarget.id ? { ...p, channel_prices: prices } : p))
    setChannelPriceTarget(null)
  }

  const handleStatusChange = async (id: string, status: ProductStatus) => {
    const { error } = await supabase.from('pm_products').update({ status }).eq('id', id)
    if (!error) setProducts(prev => prev.map(p => p.id === id ? { ...p, status } : p))
    setEditStatusId(null)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('pm_products').delete().eq('id', id)
    if (!error) setProducts(prev => prev.filter(p => p.id !== id))
  }

  const kpis = [
    { label:'전체 상품', value:products.length+'개',                                               bg:'#eff6ff', color:'#2563eb', icon:Package },
    { label:'판매중',    value:products.filter(p=>p.status==='active').length+'개',                bg:'#ecfdf5', color:'#059669', icon:TrendingUp },
    { label:'재고 부족', value:products.filter(p=>totalCurStock(p)<=2&&p.status!=='soldout').length+'개', bg:'#fffbeb', color:'#d97706', icon:AlertTriangle },
    { label:'품절',      value:products.filter(p=>p.status==='soldout'||totalCurStock(p)===0).length+'개', bg:'#fff1f2', color:'#be123c', icon:AlertTriangle },
  ]

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300, gap:10, color:'#94a3b8' }}>
      <div style={{ width:22, height:22, borderRadius:'50%', border:'3px solid #e2e8f0', borderTopColor:'#2563eb', animation:'spin-slow 0.7s linear infinite' }}/>
      <span style={{ fontSize:13, fontWeight:700 }}>데이터를 불러오는 중...</span>
    </div>
  )

  return (
    <div className="pm-page space-y-4">

      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(c => (
          <div key={c.label} className="pm-card p-4 flex items-center gap-4">
            <div style={{ width:40, height:40, borderRadius:12, background:c.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <c.icon size={18} color={c.color} />
            </div>
            <div>
              <p style={{ fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>{c.label}</p>
              <p style={{ fontSize:20, fontWeight:900, color:'#0f172a', lineHeight:1, marginTop:4 }}>{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 카테고리 탭 + 검색 */}
      <div className="pm-card overflow-hidden">
        <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid rgba(15,23,42,0.07)', padding:'0 4px', gap:2, overflowX:'auto' }} className="scrollbar-hide">
          {allCats.map(cat => (
            <div key={cat} style={{ flexShrink:0, position:'relative', display:'flex', alignItems:'center' }}>
              {/* 이름 변경 인라인 입력 */}
              {catEditTarget === cat ? (
                <div style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 8px' }}>
                  <input
                    autoFocus
                    value={catEditInput}
                    onChange={e => setCatEditInput(e.target.value)}
                    onBlur={handleCatRename}
                    onKeyDown={e => { if (e.key==='Enter') handleCatRename(); if (e.key==='Escape') setCatEditTarget(null) }}
                    style={{ width:90, fontSize:13, fontWeight:800, border:'1px solid #3b82f6', borderRadius:6, padding:'4px 8px', outline:'none', color:'#1e293b' }}
                  />
                </div>
              ) : (
                <button onClick={() => setActiveTab(cat)} style={{
                  padding: cat==='전체' ? '12px 18px' : '12px 10px 12px 16px',
                  fontSize:13, fontWeight:800,
                  color: activeTab===cat ? '#2563eb' : '#94a3b8',
                  borderBottom:`2px solid ${activeTab===cat ? '#2563eb' : 'transparent'}`,
                  background:'none', border:'none', cursor:'pointer', transition:'all 150ms ease', whiteSpace:'nowrap',
                  display:'flex', alignItems:'center', gap:4,
                }}>
                  {cat}
                  {cat !== '전체' && (
                    <span style={{ fontSize:10.5, fontWeight:800,
                      background: activeTab===cat ? '#eff6ff' : '#f1f5f9',
                      color: activeTab===cat ? '#2563eb' : '#94a3b8',
                      padding:'1px 6px', borderRadius:99 }}>
                      {products.filter(p => p.category===cat).length}
                    </span>
                  )}
                  {/* 편집/삭제 아이콘 — 전체 탭 제외 */}
                  {cat !== '전체' && (
                    <span style={{ display:'inline-flex', gap:2, marginLeft:2 }}
                      onClick={e => e.stopPropagation()}>
                      <span title="이름변경"
                        onClick={() => { setCatEditTarget(cat); setCatEditInput(cat) }}
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', width:16, height:16, borderRadius:3, color:'#94a3b8', cursor:'pointer', fontSize:10 }}>
                        ✏️
                      </span>
                      <span title="삭제"
                        onClick={() => setCatDeleteTarget(cat)}
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', width:16, height:16, borderRadius:3, color:'#94a3b8', cursor:'pointer', fontSize:10 }}>
                        🗑️
                      </span>
                    </span>
                  )}
                </button>
              )}
            </div>
          ))}

          {/* 카테고리 추가 버튼/입력 */}
          {catAddMode ? (
            <div style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 8px', flexShrink:0 }}>
              <input
                autoFocus
                value={catAddInput}
                onChange={e => setCatAddInput(e.target.value)}
                onBlur={handleCatAdd}
                onKeyDown={e => { if (e.key==='Enter') handleCatAdd(); if (e.key==='Escape') { setCatAddMode(false); setCatAddInput('') } }}
                placeholder="카테고리명"
                style={{ width:100, fontSize:13, fontWeight:800, border:'1px solid #3b82f6', borderRadius:6, padding:'4px 8px', outline:'none', color:'#1e293b' }}
              />
            </div>
          ) : (
            <button
              onClick={() => setCatAddMode(true)}
              style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'8px 12px', margin:'4px',
                fontSize:12, fontWeight:800, color:'#2563eb', background:'#eff6ff',
                border:'1px dashed #93c5fd', borderRadius:8, cursor:'pointer', whiteSpace:'nowrap' }}>
              <Plus size={12}/>추가
            </button>
          )}
        </div>

        {/* 카테고리 삭제 확인 */}
        {catDeleteTarget && (
          <div style={{ padding:'10px 16px', background:'#fff1f2', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #fecdd3' }}>
            <span style={{ fontSize:12.5, fontWeight:700, color:'#dc2626', flex:1 }}>
              &quot;<b>{catDeleteTarget}</b>&quot; 카테고리를 삭제하시겠습니까? (해당 카테고리 상품은 &apos;전체&apos;에서만 조회됩니다)
            </span>
            <button onClick={() => handleCatDelete(catDeleteTarget)}
              style={{ fontSize:12, fontWeight:800, color:'#fff', background:'#dc2626', border:'none', borderRadius:7, padding:'5px 14px', cursor:'pointer' }}>
              삭제
            </button>
            <button onClick={() => setCatDeleteTarget(null)}
              style={{ fontSize:12, fontWeight:800, color:'#64748b', background:'#f1f5f9', border:'none', borderRadius:7, padding:'5px 14px', cursor:'pointer' }}>
              취소
            </button>
          </div>
        )}

        <div style={{ padding:'12px 16px', display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
          <div style={{ display:'flex', gap:6, flex:'1 1 280px' }}>
            <div className="relative" style={{ flex:1 }}>
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:'#94a3b8' }} />
              <Input placeholder="상품명, 상품코드, 옵션명, 바코드..."
                value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter') doSearch() }}
                className="pm-input-icon" />
            </div>
            <Button size="sm" onClick={doSearch}><Search size={13}/>검색</Button>
            {search && (
              <button onClick={clearSearch} style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:700, color:'#94a3b8', background:'#f1f5f9', border:'none', borderRadius:8, padding:'0 10px', cursor:'pointer', flexShrink:0 }}>
                <X size={11}/>초기화
              </button>
            )}
          </div>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width:132 }}>
            <option value="전체">전체 상태</option>
            {ST_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
            <Button variant="outline" size="sm"><Download size={13}/>엑셀</Button>
            <Button variant="outline" size="sm"><Upload size={13}/>가져오기</Button>
            <Button size="sm" onClick={() => setIsAdd(true)}><Plus size={13}/>상품 등록</Button>
          </div>
        </div>
      </div>

      {/* ── 테이블 ── */}
      <div className="pm-card overflow-hidden">
        <div className="pm-table-wrap">
          <table className="pm-table" style={{ minWidth:1500 }}>
            <thead>
              <tr>
                <th style={{ width:36 }}><input type="checkbox"/></th>
                <th style={{ width:90 }}>상품코드</th>
                <th style={{ minWidth:150 }}>상품명</th>
                <th style={{ minWidth:420 }}>옵션명 / 바코드 / 재고</th>
                <th style={{ width:90, textAlign:'center' }}>LOCA</th>
                <th style={{ width:110, textAlign:'right' }}>원가</th>
                <th style={{ minWidth:160 }}>쇼핑몰별 판매가</th>
                <th style={{ width:100, textAlign:'center' }}>상태</th>
                <th style={{ width:100 }}>구매처</th>
                <th style={{ width:132, textAlign:'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign:'center', padding:'3.5rem 1rem', color:'#94a3b8' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                      <Package size={36} style={{ opacity:0.25 }} />
                      <p style={{ fontSize:13.5, fontWeight:700 }}>등록된 상품이 없습니다</p>
                      <p style={{ fontSize:12, fontWeight:500, color:'#cbd5e1' }}>상단의 [+ 상품등록] 버튼을 눌러 첫 번째 상품을 등록하세요</p>
                    </div>
                  </td>
                </tr>
              )}
              {paginated.map(p => {
                const st  = ST[p.status]
                const tot = totalCurStock(p)
                const low = tot <= 2

                return (
                  <tr key={p.id} style={{ verticalAlign:'top' }}>
                    <td style={{ paddingTop:14 }}><input type="checkbox"/></td>

                    {/* 상품코드 */}
                    <td style={{ paddingTop:14 }}>
                      <span style={{ fontFamily:'monospace', fontSize:11.5, fontWeight:800, color:'#2563eb', background:'#eff6ff', padding:'3px 7px', borderRadius:6 }}>
                        {p.code}
                      </span>
                    </td>

                    {/* 상품명 */}
                    <td style={{ paddingTop:13 }}>
                      <p style={{ fontSize:13, fontWeight:800, color:'#1e293b', lineHeight:1.4 }}>{p.name}</p>
                      <p style={{ fontSize:11, fontWeight:700, color:'#94a3b8', marginTop:3 }}>{p.category}</p>
                      <p style={{ fontSize:11, fontWeight:800, color: low ? '#dc2626' : '#64748b', marginTop:4 }}>
                        현재고 <span style={{ fontSize:13, fontWeight:900 }}>{tot}</span>개
                        {low && <span style={{ marginLeft:4, fontSize:10, fontWeight:800, background:'#fff1f2', color:'#dc2626', padding:'1px 5px', borderRadius:4 }}>
                          {tot===0 ? '품절':'부족'}
                        </span>}
                      </p>
                    </td>

                    {/* 옵션명/바코드/재고 세분화 */}
                    <td style={{ padding:'8px 10px 8px 12px' }}>
                      {/* 헤더 행 */}
                      <div style={{ display:'grid', gridTemplateColumns:'28px 74px 1fr 36px 36px 38px 36px 40px 36px', gap:'0 6px', paddingBottom:4, marginBottom:2, borderBottom:'1px solid #f1f5f9' }}>
                        {['', '옵션명', '바코드', '발주', '입고', '미입고', '판매', '현재고', ''].map((h, hi) => (
                          <span key={hi} style={{ fontSize:9.5, fontWeight:800, color:'#cbd5e1', textTransform:'uppercase', letterSpacing:'0.04em', textAlign: hi >= 3 ? 'right' : 'left' }}>{h}</span>
                        ))}
                      </div>
                      {p.options.map((opt, i) => {
                        const curStock    = optStock(opt)
                        const undelivered = optUndelivered(opt)
                        const optLow      = curStock <= 2
                        const optZero     = curStock === 0
                        return (
                          <div key={i} style={{
                            display:'grid', gridTemplateColumns:'28px 74px 1fr 36px 36px 38px 36px 40px 36px', gap:'0 6px',
                            padding:'5px 0',
                            borderBottom: i < p.options.length-1 ? '1px solid rgba(15,23,42,0.04)' : 'none',
                            alignItems:'center',
                            background: optLow ? 'rgba(239,68,68,0.03)' : 'transparent',
                          }}>
                            {/* 이미지 */}
                            <div style={{ width:28, height:28, borderRadius:6, overflow:'hidden', background:'#f1f5f9', flexShrink:0 }}>
                              {opt.image
                                ? <img src={opt.image} alt={opt.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                    <ImageIcon size={11} color="#cbd5e1" />
                                  </div>
                              }
                            </div>
                            {/* 옵션명 + 중국명 */}
                            <span style={{ display:'flex', flexDirection:'column', gap:1, overflow:'hidden' }}>
                              <span style={{ fontSize:12, fontWeight:800, color: optZero ? '#94a3b8' : '#334155', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {opt.name}
                              </span>
                              {opt.chinese_name && (
                                <span style={{ fontSize:10.5, color:'#94a3b8', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  {opt.chinese_name}
                                </span>
                              )}
                            </span>
                            {/* 바코드 */}
                            <span style={{ fontFamily:'monospace', fontSize:10.5, color:'#1e293b', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {opt.barcode || '-'}
                            </span>
                            {/* 발주 */}
                            <span style={{ textAlign:'right', fontSize:12, fontWeight:800, color:'#6366f1' }}>{opt.ordered}</span>
                            {/* 입고 */}
                            <span style={{ textAlign:'right', fontSize:12, fontWeight:800, color:'#0ea5e9' }}>{opt.received}</span>
                            {/* 미입고 */}
                            <span style={{ textAlign:'right', fontSize:12, fontWeight:800, color: undelivered > 0 ? '#f59e0b' : '#94a3b8' }}>{undelivered}</span>
                            {/* 판매 */}
                            <span style={{ textAlign:'right', fontSize:12, fontWeight:800, color:'#64748b' }}>{opt.sold}</span>
                            {/* 현재고 */}
                            <span style={{ textAlign:'right', fontSize:13, fontWeight:900, color: optLow ? '#dc2626' : '#334155' }}>{curStock}</span>
                            {/* 뱃지 */}
                            <span>
                              {optZero
                                ? <span style={{ fontSize:9, fontWeight:800, background:'#fff1f2', color:'#dc2626', padding:'1px 5px', borderRadius:4 }}>품절</span>
                                : optLow
                                  ? <span style={{ fontSize:9, fontWeight:800, background:'#fff7ed', color:'#c2410c', padding:'1px 5px', borderRadius:4 }}>부족</span>
                                  : null
                              }
                            </span>
                          </div>
                        )
                      })}
                    </td>

                    {/* LOCA */}
                    <td style={{ paddingTop:14, textAlign:'center' }}>
                      {p.loca
                        ? <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:800, color:'#334155', background:'#f1f5f9', padding:'3px 8px', borderRadius:6, letterSpacing:'0.04em' }}>{p.loca}</span>
                        : <span style={{ color:'#cbd5e1', fontSize:12 }}>-</span>
                      }
                    </td>

                    {/* 원가 */}
                    <td style={{ paddingTop:14, textAlign:'right' }}>{formatCost(p)}</td>

                    {/* 쇼핑몰별 판매가 */}
                    <td style={{ paddingTop:10, paddingBottom:10 }}>
                      {p.channel_prices.length > 0 ? (
                        <button onClick={() => setChannelPriceTarget(p)}
                          style={{ display:'flex', flexDirection:'column', gap:4, cursor:'pointer', background:'none', border:'none', padding:0, textAlign:'left', width:'100%' }}>
                          {p.channel_prices.map(cp => {
                            const cs = CH_STYLE[cp.channel] ?? { bg:'#f8fafc', color:'#475569' }
                            return (
                              <div key={cp.channel} style={{ display:'flex', alignItems:'center', gap:5 }}>
                                <span style={{ fontSize:10, fontWeight:800, background:cs.bg, color:cs.color, padding:'1px 6px', borderRadius:5, minWidth:44, textAlign:'center', flexShrink:0 }}>{cp.channel}</span>
                                <span style={{ fontSize:12.5, fontWeight:800, color:'#334155' }}>{formatCurrency(cp.price)}</span>
                              </div>
                            )
                          })}
                          <span style={{ fontSize:10.5, fontWeight:700, color:'#94a3b8', marginTop:2 }}>✏️ 클릭하여 수정</span>
                        </button>
                      ) : (
                        <button onClick={() => setChannelPriceTarget(p)}
                          style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, fontWeight:800, color:'#2563eb', background:'#eff6ff', border:'none', borderRadius:8, padding:'6px 10px', cursor:'pointer' }}>
                          <Store size={12}/>판매가 등록
                        </button>
                      )}
                    </td>

                    {/* 상태 — 클릭하면 인라인 드롭다운으로 변경 */}
                    <td style={{ paddingTop:12, textAlign:'center' }}>
                      {editStatusId === p.id ? (
                        <select
                          value={p.status}
                          onChange={e => handleStatusChange(p.id, e.target.value as ProductStatus)}
                          onBlur={() => setEditStatusId(null)}
                          autoFocus
                          style={{ fontSize:12, fontWeight:800, border:'1px solid #3b82f6', borderRadius:8, padding:'4px 8px', background:'white', color:'#1e293b', cursor:'pointer', outline:'none', boxShadow:'0 0 0 2px rgba(59,130,246,0.15)' }}
                        >
                          {ST_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      ) : (
                        <button onClick={() => setEditStatusId(p.id)}
                          title="클릭하여 상태 변경"
                          style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:800, background:st.bg, color:st.color, padding:'4px 10px', borderRadius:99, border:'none', cursor:'pointer', transition:'opacity 150ms' }}
                          onMouseEnter={e => (e.currentTarget.style.opacity='0.75')}
                          onMouseLeave={e => (e.currentTarget.style.opacity='1')}
                        >
                          <span style={{ width:5, height:5, borderRadius:'50%', background:st.dot, flexShrink:0 }}/>
                          {st.label}
                        </button>
                      )}
                    </td>

                    {/* 구매처 */}
                    <td style={{ paddingTop:14 }}>
                      <SupplierCell supplier={p.supplier} />
                    </td>

                    {/* 관리 */}
                    <td style={{ paddingTop:12 }}>
                      <div style={{ display:'flex', flexDirection:'column', gap:5, alignItems:'center' }}>
                        <MgmtBtn onClick={() => setIsEdit(p)} bg="#ecfdf5" color="#059669" hoverBg="#d1fae5"><Edit size={11}/>수정</MgmtBtn>
                        <MgmtBtn onClick={() => handleDelete(p.id)} bg="#fff1f2" color="#be123c" hoverBg="#ffe4e6"><Trash2 size={11}/>삭제</MgmtBtn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="pm-table-footer">
          <span>총 {filtered.length}개 상품 (페이지 {page}/{totalPages})</span>
          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
            {/* 이전 */}
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="pm-btn pm-btn-ghost pm-btn-sm"
              style={{ height:28, minWidth:40, fontSize:12, opacity: page === 1 ? 0.35 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
              이전
            </button>

            {/* 페이지 번호 */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
              .reduce<(number | '...')[]>((acc, n, i, arr) => {
                if (i > 0 && (n as number) - (arr[i-1] as number) > 1) acc.push('...')
                acc.push(n)
                return acc
              }, [])
              .map((v, i) =>
                v === '...'
                  ? <span key={`e${i}`} style={{ fontSize:12, color:'#94a3b8', padding:'0 2px' }}>…</span>
                  : <button key={v}
                      onClick={() => setPage(v as number)}
                      className="pm-btn pm-btn-ghost pm-btn-sm"
                      style={{ height:28, minWidth:28, fontSize:12,
                        background: page === v ? '#2563eb' : undefined,
                        color:      page === v ? 'white'   : undefined,
                        fontWeight: page === v ? 900       : undefined,
                      }}>
                      {v}
                    </button>
              )}

            {/* 다음 */}
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="pm-btn pm-btn-ghost pm-btn-sm"
              style={{ height:28, minWidth:40, fontSize:12, opacity: page === totalPages ? 0.35 : 1, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>
              다음
            </button>
          </div>
        </div>
      </div>

      {/* ── 상품 등록 모달 ── */}
      <Modal isOpen={isAdd} onClose={() => setIsAdd(false)} title="상품 등록" size="xl">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#2563eb', paddingBottom:6, borderBottom:'1px solid #eff6ff', marginBottom:10 }}>📦 기본 정보</p>
          </div>

          <div><Label>상품코드 *</Label><Input placeholder="WA5AC001" value={form.code}
            onChange={e => {
              const newCode = e.target.value
              setForm(f => ({
                ...f,
                code: newCode,
                options: f.options.map(o => ({ ...o, barcode: genBarcode(newCode, o.name) })),
              }))
            }}
          /></div>
          <div><Label>상품명 *</Label><Input placeholder="상품명 입력" value={form.name} onChange={e => setForm(f => ({...f,name:e.target.value}))}/></div>

          <div>
            <Label>카테고리 *</Label>
            <Select className="w-full" value={form.category} onChange={e => setForm(f => ({...f,category:e.target.value,newCat:''}))}>
              <option value="">선택하세요</option>
              {allCats.filter(c => c!=='전체').map(c => <option key={c}>{c}</option>)}
              <option value="__new__">+ 새 카테고리 추가</option>
            </Select>
            {form.category==='__new__' && (
              <Input style={{ marginTop:6 }} placeholder="새 카테고리명" value={form.newCat} onChange={e => setForm(f => ({...f,newCat:e.target.value}))}/>
            )}
          </div>
          <div>
            <Label>구매처</Label>
            <Input placeholder="상회명 또는 https://..." value={form.supplier} onChange={e => setForm(f => ({...f,supplier:e.target.value}))}/>
          </div>

          <div>
            <Label>LOCA (창고 위치)</Label>
            <Input placeholder="예) A-01-03" value={form.loca} onChange={e => setForm(f => ({...f,loca:e.target.value}))} style={{ fontFamily:'monospace' }}/>
          </div>

          {/* 원가 — 기본 위안 */}
          <div>
            <Label>원가 *</Label>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <Input type="number" placeholder="0" value={form.cost_price}
                onChange={e => setForm(f => ({...f,cost_price:e.target.value}))} style={{ flex:1 }}/>
              <Select value={form.cost_currency} onChange={e => setForm(f => ({...f,cost_currency:e.target.value as CostCurrency}))} style={{ width:90 }}>
                <option value="CNY">¥ 위안</option>
                <option value="KRW">₩ 원</option>
              </Select>
            </div>
            {form.cost_currency==='CNY' && form.cost_price && (
              <p style={{ fontSize:11.5, fontWeight:700, color:'#64748b', marginTop:5 }}>
                ≈ {formatCurrency(Math.round(Number(form.cost_price) * CNY_TO_KRW))} (환율 {CNY_TO_KRW}원/위안 기준)
              </p>
            )}
          </div>

          <div style={{ gridColumn:'1/-1' }}>
            <Label>판매 상태</Label>
            <Select className="w-full" style={{ maxWidth:200 }} value={form.status} onChange={e => setForm(f => ({...f,status:e.target.value as ProductStatus}))}>
              {ST_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </div>

          {/* 옵션 */}
          <div style={{ gridColumn:'1/-1', marginTop:8 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#2563eb', paddingBottom:6, borderBottom:'1px solid #eff6ff', marginBottom:10 }}>🏷️ 옵션</p>
            {form.options.map((opt, i) => (
              <div key={i} style={{ border:'1px solid rgba(15,23,42,0.07)', borderRadius:12, padding:12, marginBottom:10, background:'#fafbfc' }}>
                {/* Row 1: 이미지 + 이름/중국명 + 바코드(자동) + 삭제 */}
                <div style={{ display:'grid', gridTemplateColumns:'52px 2fr 1.5fr auto', gap:8, marginBottom:8, alignItems:'flex-end' }}>
                  {/* 이미지 업로드 */}
                  <div>
                    <Label>이미지</Label>
                    <label style={{ display:'block', width:44, height:44, borderRadius:8, overflow:'hidden', background:'#f1f5f9', cursor:'pointer', border:'1px dashed #cbd5e1', position:'relative' }}>
                      {opt.image
                        ? <img src={opt.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                        : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:2 }}>
                            <ImageIcon size={14} color="#94a3b8" />
                            <span style={{ fontSize:8, color:'#94a3b8', fontWeight:700 }}>업로드</span>
                          </div>
                      }
                      <input type="file" accept="image/*" style={{ display:'none' }}
                        onChange={e => { const file = e.target.files?.[0]; if(file) handleOptImage(i, file) }} />
                    </label>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div>
                      <Label>옵션명</Label>
                      <Input placeholder="BE" value={opt.name}
                        onChange={e => {
                          const o=[...form.options]
                          o[i]={...o[i],name:e.target.value,barcode:genBarcode(form.code,e.target.value)}
                          setForm(f=>({...f,options:o}))
                        }}
                      />
                    </div>
                    <div>
                      <Label>중국명</Label>
                      <Input placeholder="黑色/M" value={opt.chinese_name}
                        onChange={e => { const o=[...form.options];o[i]={...o[i],chinese_name:e.target.value};setForm(f=>({...f,options:o}))}}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>바코드 (자동)</Label>
                    <Input readOnly value={opt.barcode || genBarcode(form.code, opt.name)}
                      style={{ background:'#f8fafc', color:'#334155', fontFamily:'monospace', fontSize:12 }}
                    />
                  </div>
                  <div style={{ paddingBottom:1 }}>
                    {form.options.length > 1 && (
                      <button onClick={() => setForm(f=>({...f,options:f.options.filter((_,j)=>j!==i)}))}
                        style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', color:'#dc2626', border:'none', borderRadius:8, cursor:'pointer', marginTop:21 }}>
                        <X size={13}/>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => setForm(f=>({...f,options:[...f.options,{...INIT_OPT}]}))}
              style={{ fontSize:12,fontWeight:800,color:'#2563eb',background:'#eff6ff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
              <Plus size={12}/>옵션 추가
            </button>
          </div>

          <div style={{ gridColumn:'1/-1' }}>
            <p style={{ fontSize:11.5, fontWeight:800, color:'#64748b', background:'#f8fafc', borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:8 }}>
              <Store size={13} color="#94a3b8"/>
              <span>쇼핑몰별 판매가는 등록 후 상품 목록에서 <strong style={{ color:'#2563eb' }}>쇼핑몰별 판매가</strong> 셀을 클릭하여 설정할 수 있습니다.</span>
            </p>
          </div>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <Button variant="outline" onClick={() => setIsAdd(false)}>취소</Button>
          <Button onClick={handleAdd}>등록하기</Button>
        </div>
      </Modal>

      {/* ── 쇼핑몰 판매가 편집 모달 ── */}
      {channelPriceTarget && (
        <ChannelPriceModal product={channelPriceTarget} onClose={() => setChannelPriceTarget(null)} onSave={handleChannelPriceSave} />
      )}

      {/* ── 상품 상세 모달 ── */}
      {detail && (
        <Modal isOpen={!!detail} onClose={() => setDetail(null)} title="상품 상세" size="xl">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {[['상품코드',detail.code],['상품명',detail.name],['카테고리',detail.category],['LOCA',detail.loca||'-']].map(([k,v]) => (
              <div key={k} style={{ background:'#f8fafc', borderRadius:12, padding:'12px 14px' }}>
                <p style={{ fontSize:10.5, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>{k}</p>
                <p style={{ fontSize:13.5, fontWeight:800, color:'#1e293b', marginTop:4, fontFamily: k==='LOCA'||k==='상품코드' ? 'monospace':'inherit' }}>{v}</p>
              </div>
            ))}
            <div style={{ background:'#f8fafc', borderRadius:12, padding:'12px 14px' }}>
              <p style={{ fontSize:10.5, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>구매처</p>
              <div style={{ marginTop:4 }}><SupplierCell supplier={detail.supplier} /></div>
            </div>
            <div style={{ background:'#eff6ff', borderRadius:12, padding:'12px 14px' }}>
              <p style={{ fontSize:10.5, fontWeight:800, color:'#60a5fa', textTransform:'uppercase', letterSpacing:'0.06em' }}>원가</p>
              <div style={{ marginTop:4 }}>{formatCost(detail)}</div>
            </div>
            <div style={{ background:ST[detail.status].bg, borderRadius:12, padding:'12px 14px' }}>
              <p style={{ fontSize:10.5, fontWeight:800, color:ST[detail.status].color, textTransform:'uppercase', letterSpacing:'0.06em' }}>상태</p>
              <p style={{ fontSize:16, fontWeight:900, color:ST[detail.status].color, marginTop:4 }}>{ST[detail.status].label}</p>
            </div>

            <div style={{ gridColumn:'1/-1', background:'#f8fafc', borderRadius:12, padding:14 }}>
              <p style={{ fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>옵션 재고 현황</p>
              <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 80px 60px 60px 60px 60px 60px', gap:'0 8px', paddingBottom:6, borderBottom:'1px solid #f1f5f9', marginBottom:4 }}>
                {['','옵션명','바코드','발주','입고','미입고','판매','현재고'].map((h,i) => (
                  <span key={i} style={{ fontSize:10, fontWeight:800, color:'#94a3b8', textTransform:'uppercase' }}>{h}</span>
                ))}
              </div>
              {detail.options.map((opt, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'32px 1fr 80px 60px 60px 60px 60px 60px', gap:'0 8px', padding:'6px 0', borderTop:i>0?'1px solid rgba(15,23,42,0.05)':'none', alignItems:'center' }}>
                  <div style={{ width:28, height:28, borderRadius:6, overflow:'hidden', background:'#f1f5f9' }}>
                    {opt.image ? <img src={opt.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}><ImageIcon size={11} color="#cbd5e1"/></div>}
                  </div>
                  <span style={{ fontWeight:800, color:'#334155', fontSize:13 }}>{opt.name}</span>
                  <span style={{ fontFamily:'monospace', fontSize:11, color:'#64748b' }}>{opt.barcode||'-'}</span>
                  <span style={{ fontSize:13, fontWeight:800, color:'#6366f1', textAlign:'right' }}>{opt.ordered}</span>
                  <span style={{ fontSize:13, fontWeight:800, color:'#0ea5e9', textAlign:'right' }}>{opt.received}</span>
                  <span style={{ fontSize:13, fontWeight:800, color: optUndelivered(opt)>0?'#f59e0b':'#94a3b8', textAlign:'right' }}>{optUndelivered(opt)}</span>
                  <span style={{ fontSize:13, fontWeight:800, color:'#64748b', textAlign:'right' }}>{opt.sold}</span>
                  <span style={{ fontSize:14, fontWeight:900, color: optStock(opt)<=2?'#dc2626':'#1e293b', textAlign:'right' }}>{optStock(opt)}</span>
                </div>
              ))}
            </div>

            <div style={{ gridColumn:'1/-1', background:'#f8fafc', borderRadius:12, padding:14 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <p style={{ fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>쇼핑몰별 판매가</p>
                <button onClick={() => { setDetail(null); setChannelPriceTarget(detail) }}
                  style={{ fontSize:11.5, fontWeight:800, color:'#2563eb', background:'#eff6ff', border:'none', borderRadius:7, padding:'4px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                  <Edit size={11}/>수정
                </button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:8 }}>
                {detail.channel_prices.map(cp => {
                  const cs = CH_STYLE[cp.channel] ?? {bg:'#f8fafc',color:'#475569'}
                  const cost = detail.cost_currency==='CNY' ? Math.round(detail.cost_price*CNY_TO_KRW) : detail.cost_price
                  const margin = cost>0 ? (((cp.price-cost)/cp.price)*100).toFixed(1) : '-'
                  return (
                    <div key={cp.channel} style={{ background:cs.bg, borderRadius:10, padding:'10px 12px' }}>
                      <p style={{ fontSize:10.5, fontWeight:800, color:cs.color }}>{cp.channel}</p>
                      <p style={{ fontSize:16, fontWeight:900, color:'#1e293b', marginTop:3 }}>{formatCurrency(cp.price)}</p>
                      <p style={{ fontSize:10.5, fontWeight:700, color:'#94a3b8', marginTop:2 }}>마진 {margin}%</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
            <Button variant="outline" onClick={() => setDetail(null)}>닫기</Button>
            <Button onClick={() => { setIsEdit(detail); setDetail(null) }}>수정하기</Button>
          </div>
        </Modal>
      )}

      {/* ── 수정 모달 ── */}
      {isEdit && (
        <Modal isOpen={!!isEdit} onClose={() => setIsEdit(null)} title={`상품 수정 — ${isEdit.name}`} size="lg">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div><Label>상품코드</Label><Input defaultValue={isEdit.code}/></div>
            <div><Label>상품명</Label><Input defaultValue={isEdit.name}/></div>
            <div><Label>LOCA</Label><Input defaultValue={isEdit.loca} style={{ fontFamily:'monospace' }}/></div>
            <div><Label>구매처</Label><Input defaultValue={isEdit.supplier} placeholder="상회명 또는 https://..."/></div>
            <div>
              <Label>원가</Label>
              <div style={{ display:'flex', gap:8 }}>
                <Input type="number" defaultValue={isEdit.cost_price} style={{ flex:1 }}/>
                <Select style={{ width:90 }} defaultValue={isEdit.cost_currency}>
                  <option value="CNY">¥ 위안</option>
                  <option value="KRW">₩ 원</option>
                </Select>
              </div>
            </div>
            <div><Label>상태</Label>
              <Select className="w-full" defaultValue={isEdit.status}>
                {ST_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
            <Button variant="outline" onClick={() => setIsEdit(null)}>취소</Button>
            <Button onClick={() => setIsEdit(null)}>저장하기</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
