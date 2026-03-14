'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
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
type ProductStatus = 'active' | 'soldout' | 'pending_delete' | 'upcoming' | 'ready_to_ship'
type CostCurrency  = 'KRW' | 'CNY'

interface ProductOption {
  name: string
  korean_name: string    // 한글 색상명 (자동입력)
  chinese_name: string   // 중국명
  barcode: string
  image: string
  ordered: number
  received: number
  sold: number           // legacy (for backward compat)
  current_stock?: number // 현재 실재고
  defective?: number     // 불량 수량
}
interface ChannelPrice { channel: string; price: number }
interface MallCategory { channel: string; category: string; category_code: string }
interface BasicInfo {
  title: string; brand: string; origin: string; manufacturer: string
  material: string; description: string; handling: string; notes: string
}
interface Product {
  id: string; code: string; name: string; abbr: string; category: string; loca: string
  options: ProductOption[]
  cost_price: number; cost_currency: CostCurrency
  channel_prices: ChannelPrice[]
  mall_categories: MallCategory[]
  basic_info: BasicInfo | null
  status: ProductStatus; supplier: string
}
const DEF_BASIC_INFO: BasicInfo = { title:'', brand:'', origin:'', manufacturer:'', material:'', description:'', handling:'', notes:'' }

const CNY_TO_KRW = 210
const DEFAULT_CATS = ['전체'] // '전체' 탭은 항상 고정, 나머지는 extraCats로 관리
const INIT_EXTRA_CATS = ['가방', '의류', '잡화'] // 앱 최초 실행 시 기본 카테고리

/* ─── 옵션 영문 코드 → 한글 색상명 매핑표 ─────────────────────── */
const OPT_COLOR_MAP: Record<string, string> = {
  BD:'버건디', BE:'베이지', BG:'볼주그린', BI:'볼주인디고', BK:'블랙', BL:'블루',
  BN:'볼루그린', BR:'브라운', CA:'자갈', CB:'코발트블루', CH:'조셋', CL:'스빌',
  CM:'카멜', CO:'코코아', CP:'체리핑크', CR:'크림', DB:'다크브라운', DE:'다크베이지',
  DG:'다크카키', DI:'다크인디고', DN:'다크그린', DO:'다크올리브', DP:'다크핑크',
  DU:'다크블루', GN:'그린', GO:'골드', GP:'그래파이트', GR:'그레이', IV:'아이보리',
  KH:'카키', KN:'카키브라운', LB:'라이트브라운', LE:'레몬', LG:'라이트그레이',
  LK:'라이트카키', LN:'라이트민트', LO:'라이트블루', LP:'라이트핑크', LU:'라이트블루',
  LV:'라이트바이올렛', MC:'모카', MG:'밀리터리그레이', MN:'민트', MT:'머스타드',
  MU:'멀티', NA:'네이비', OC:'올리브그린', OL:'올리브', OR:'오렌지', OT:'오트밀',
  PC:'피치', PH:'핑크', PK:'핑크', RB:'레드브라운', RD:'레드', SK:'스카이블루',
  SI:'실버', SL:'실버', VI:'바이올렛', WH:'화이트', WM:'화이트올란', WN:'와인',
  YC:'옐로우크림', YE:'옐로우',
}
const getKoreanColor = (code: string) => OPT_COLOR_MAP[code.trim().toUpperCase()] || ''

/* ─── 상태 맵 ───────────────────────────────────────────────── */
const ST: Record<ProductStatus, { label:string; bg:string; color:string; dot:string }> = {
  active:         { label:'판매중',   bg:'#f0fdf4', color:'#15803d', dot:'#22c55e' },
  soldout:        { label:'품절',     bg:'#fff1f2', color:'#be123c', dot:'#ef4444' },
  pending_delete: { label:'삭제예정', bg:'#fff7ed', color:'#c2410c', dot:'#f97316' },
  upcoming:       { label:'판매예정', bg:'#eff6ff', color:'#2563eb', dot:'#3b82f6' },
  ready_to_ship:  { label:'전송준비', bg:'#fdf4ff', color:'#7e22ce', dot:'#a855f7' },
}
const ST_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value:'active',         label:'판매중'   },
  { value:'upcoming',       label:'판매예정' },
  { value:'soldout',        label:'품절'     },
  { value:'pending_delete', label:'삭제예정' },
  { value:'ready_to_ship',  label:'전송준비' },
]

/* ─── 연동된 채널 목록 (쇼핑몰 관리 연동) ── */
const ACTIVE_CHANNELS = ['쿠팡', '네이버 스마트스토어', '11번가']
const CH_STYLE: Record<string, { bg:string; color:string }> = {
  '쿠팡':  { bg:'#fff7ed', color:'#c2410c' },
  '네이버':{ bg:'#f0fdf4', color:'#15803d' },
  '11번가':{ bg:'#fff1f2', color:'#be123c' },
  'G마켓': { bg:'#eff6ff', color:'#1d4ed8' },
}

/* ─── 헬퍼 ──────────────────────────────────────────────────── */
// 현재고: current_stock 필드 우선, 없으면 legacy received - sold
const optStock       = (o: ProductOption) =>
  o.current_stock !== undefined ? o.current_stock : Math.max(0, o.received - (o.sold || 0))
// 판매수량 = 입고 - 현재고 (사용자 요청)
const optSold        = (o: ProductOption) => Math.max(0, o.received - optStock(o))
const optDefective   = (o: ProductOption) => o.defective || 0
const optUndelivered = (o: ProductOption) => Math.max(0, o.ordered - o.received)
const totalCurStock  = (p: Product) => p.options.reduce((s, o) => s + optStock(o), 0)
const isUrl          = (s: string) => /^https?:\/\//i.test(s.trim())

function formatCost(p: Product) {
  const priceStr = Number.isInteger(p.cost_price)
    ? p.cost_price.toLocaleString()
    : p.cost_price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })
  if (p.cost_currency === 'CNY') {
    return (
      <div>
        <span style={{ fontSize:12.5, fontWeight:900, color:'#1e293b' }}>¥{priceStr}</span>
        <span style={{ fontSize:10, fontWeight:700, color:'#94a3b8', marginLeft:3 }}>위안</span>
        <div style={{ fontSize:10.5, fontWeight:700, color:'#64748b', marginTop:1 }}>
          ≈ {formatCurrency(Math.round(p.cost_price * CNY_TO_KRW))}
        </div>
      </div>
    )
  }
  return <span style={{ fontSize:13, fontWeight:800, color:'#1e293b' }}>₩{priceStr}</span>
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

const INIT_OPT  = { name:'', korean_name:'', chinese_name:'', barcode:'', image:'' }
const INIT_MALL_CAT = { channel:'', category:'', category_code:'' }
const INIT_FORM = {
  code:'', name:'', abbr:'', category:'', supplier:'', loca:'',
  cost_price:'', cost_currency:'CNY' as CostCurrency,
  newCat:'', status:'active' as ProductStatus,
  options:[{ ...INIT_OPT }],
  mall_categories: [] as { channel:string; category:string; category_code:string }[],
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
    abbr: row.abbr ?? '',
    category: row.category ?? '',
    loca: row.loca ?? '',
    cost_price: row.cost_price ?? 0,
    cost_currency: (row.cost_currency ?? 'CNY') as CostCurrency,
    status: (row.status ?? 'active') as ProductStatus,
    supplier: row.supplier ?? '',
    options: ((row.options ?? []) as ProductOption[]).map(o => ({
      ...o,
      korean_name: o.korean_name || getKoreanColor(o.name),
    })),
    channel_prices: (row.channel_prices ?? []) as ChannelPrice[],
    mall_categories: (row.mall_categories ?? []) as MallCategory[],
    basic_info: (row.basic_info ?? null) as BasicInfo | null,
  }
}

/* ─── 메인 컴포넌트 ─────────────────────────────────────────── */
export default function ProductsPage() {
  const [products, setProducts]   = useState<Product[]>([])
  const [extraCats, setExtraCats] = useState<string[]>(INIT_EXTRA_CATS)
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

  // 기본정보 팝업 상태
  const [basicInfoTarget, setBasicInfoTarget] = useState<Product | null>(null)
  const [basicInfoForm, setBasicInfoForm]     = useState<BasicInfo>({...DEF_BASIC_INFO})

  // 카테고리 관리 상태
  const [catAddMode, setCatAddMode]       = useState(false)
  const [catAddInput, setCatAddInput]     = useState('')
  const [catEditTarget, setCatEditTarget] = useState<string | null>(null)
  const [catEditInput, setCatEditInput]   = useState('')
  const [catDeleteTarget, setCatDeleteTarget] = useState<string | null>(null)
  const [deletedCats, setDeletedCats]     = useState<string[]>([])

  const [form, setForm] = useState(INIT_FORM)
  const [addErrors, setAddErrors] = useState<Set<string>>(new Set())
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addDbError, setAddDbError] = useState('')
  const [loading, setLoading] = useState(true)
  const handleOptImage  = useOptImageUpload(setForm)

  // 수정 폼 상태
  type EditOptRow = { name:string; korean_name:string; chinese_name:string; barcode:string; image:string; ordered:number; received:number; sold:number; current_stock?:number; defective?:number }
  type EditFormState = {
    code:string; name:string; abbr:string; category:string; newCat:string; supplier:string; loca:string
    cost_price:string; cost_currency:CostCurrency; status:ProductStatus; options:EditOptRow[]
  }
  const [editForm, setEditForm] = useState<EditFormState | null>(null)

  /* ── Supabase 로드 ── */
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('pm_products')
        .select('*')
        .order('code', { ascending: true })
      if (!error && data) {
        const loaded = data.map(rowToProduct)
        setProducts(loaded)
        // DB에 있는 카테고리와 기본 카테고리를 합쳐서 extraCats 구성
        const dbCats = loaded.map(p => p.category).filter(c => c && c !== '전체')
        setExtraCats(prev => {
          const merged = [...new Set([...prev, ...dbCats])]
          return merged
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  const allCats = useMemo(
    () => ['전체', ...extraCats.filter(c => !deletedCats.includes(c))],
    [extraCats, deletedCats]
  )

  /* ── 카테고리 추가 ── */
  const handleCatAdd = () => {
    const name = catAddInput.trim()
    if (!name || allCats.includes(name)) { setCatAddMode(false); setCatAddInput(''); return }
    setExtraCats(prev => [...prev, name])
    setDeletedCats(prev => prev.filter(c => c !== name)) // 혹시 삭제목록에 있으면 복구
    setCatAddMode(false)
    setCatAddInput('')
  }

  /* ── 카테고리 이름변경 ── */
  const handleCatRename = () => {
    if (!catEditTarget) return
    const newName = catEditInput.trim()
    if (!newName || newName === catEditTarget) { setCatEditTarget(null); return }
    if (allCats.includes(newName)) { setCatEditTarget(null); return } // 이미 존재하는 이름
    setExtraCats(prev => prev.map(c => c === catEditTarget ? newName : c))
    setProducts(prev => prev.map(p => p.category === catEditTarget ? { ...p, category: newName } : p))
    supabase.from('pm_products').update({ category: newName }).eq('category', catEditTarget).then(() => {})
    if (activeTab === catEditTarget) setActiveTab(newName)
    setCatEditTarget(null)
  }

  /* ── 카테고리 삭제 ── */
  const handleCatDelete = (cat: string) => {
    setExtraCats(prev => prev.filter(c => c !== cat))
    setDeletedCats(prev => [...prev, cat])
    if (activeTab === cat) setActiveTab('전체')
    setCatDeleteTarget(null)
  }

  const [basicInfoSaving, setBasicInfoSaving] = useState(false)

  /* ── 기본정보 저장 ── */
  const handleBasicInfoSave = async () => {
    if (!basicInfoTarget) return
    setBasicInfoSaving(true)
    const payload = { basic_info: basicInfoForm, status: 'ready_to_ship' as ProductStatus }
    const { error } = await supabase.from('pm_products').update(payload).eq('id', basicInfoTarget.id)
    setBasicInfoSaving(false)
    if (error) { console.error('기본정보 저장 오류:', error); return }
    setProducts(prev => prev.map(p => p.id === basicInfoTarget.id ? { ...p, ...payload } : p))
    setBasicInfoTarget(null)
  }

  /* ── 수정 모달 열기 ── */
  const openEdit = (p: Product) => {
    setEditForm({
      code: p.code, name: p.name, abbr: p.abbr ?? '', category: p.category, newCat: '',
      supplier: p.supplier, loca: p.loca,
      cost_price: String(p.cost_price), cost_currency: p.cost_currency,
      status: p.status,
      options: p.options.map(o => ({
        name: o.name, korean_name: o.korean_name || getKoreanColor(o.name),
        chinese_name: o.chinese_name || '',
        barcode: o.barcode, image: o.image,
        ordered: o.ordered, received: o.received, sold: o.sold,
        current_stock: o.current_stock, defective: o.defective,
      })),
    })
    setIsEdit(p)
  }

  const [editSaving, setEditSaving] = useState(false)

  /* ── 수정 저장 ── */
  const handleEditSave = async () => {
    if (!isEdit || !editForm) return
    const cat = editForm.category === '__new__' ? editForm.newCat.trim() : editForm.category
    if (!editForm.code || !editForm.name || !cat) return
    setEditSaving(true)
    const options: ProductOption[] = editForm.options.filter(o => o.name).map(o => ({
      name: o.name, korean_name: o.korean_name || getKoreanColor(o.name),
      chinese_name: o.chinese_name,
      barcode: o.barcode || genBarcode(editForm.code, o.name),
      image: o.image,
      ordered: Number(o.ordered) || 0,
      received: Number(o.received) || 0,
      sold: Number(o.sold) || 0,
      current_stock: o.current_stock !== undefined ? Number(o.current_stock) : 0,
      defective: Number(o.defective) || 0,
    }))
    const editCostPriceInt = Math.round(Number(editForm.cost_price) || 0)
    const payload = {
      code: editForm.code, name: editForm.name, abbr: editForm.abbr.trim(), category: cat, loca: editForm.loca,
      cost_price: editCostPriceInt,
      cost_currency: editForm.cost_currency,
      status: editForm.status, supplier: editForm.supplier,
      options,
    }
    const { error } = await supabase.from('pm_products').update(payload).eq('id', isEdit.id)
    setEditSaving(false)
    if (error) { console.error('수정 오류:', error); return }
    setProducts(prev => prev.map(p => p.id === isEdit.id ? { ...p, ...payload, channel_prices: p.channel_prices } : p))
    if (cat && cat !== '전체' && !extraCats.includes(cat)) setExtraCats(prev => [...prev, cat])
    setIsEdit(null)
    setEditForm(null)
  }
  const filtered = useMemo(() => {
    return products.filter(p => {
      const q   = search.trim()
      const mS  = !q || p.name.includes(q) || p.code.includes(q) || p.options.some(o => o.barcode.includes(q) || o.name.includes(q))
      const mC  = activeTab === '전체' || p.category === activeTab
      let mSt = true
      if (statusFilter === '__low_stock__') {
        mSt = p.status === 'active' && p.options.some(o => optStock(o) > 0 && optStock(o) <= 2)
      } else if (statusFilter === '__soldout__') {
        mSt = p.status === 'active' && p.options.some(o => optStock(o) === 0)
      } else if (statusFilter !== '전체') {
        mSt = p.status === statusFilter
      }
      return mS && mC && mSt
    }).sort((a, b) => a.code.localeCompare(b.code))
  }, [products, search, activeTab, statusFilter])

  // 검색/탭/필터 변경 시에만 1페이지 리셋 (등록·수정 후에는 현재 페이지 유지)
  useEffect(() => { setPage(1) }, [search, activeTab, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const doSearch    = () => { setSearch(searchInput); setPage(1) }
  const clearSearch = () => { setSearch(''); setSearchInput(''); setPage(1) }

  const handleAdd = async () => {
    const cat = form.category === '__new__' ? form.newCat.trim() : form.category
    const errors = new Set<string>()
    if (!form.code.trim()) errors.add('code')
    if (!form.name.trim()) errors.add('name')
    if (!cat) errors.add('category')
    if (errors.size > 0) { setAddErrors(errors); return }
    setAddErrors(new Set())
    setAddDbError('')
    setAddSubmitting(true)
    const options: ProductOption[] = form.options.filter(o => o.name.trim()).map(o => ({
      name: o.name,
      korean_name: o.korean_name || getKoreanColor(o.name),
      chinese_name: o.chinese_name,
      barcode: o.barcode || genBarcode(form.code, o.name),
      image: o.image,
      ordered: 0, received: 0, sold: 0,
    }))
    const costPriceInt = Math.round(Number(form.cost_price) || 0)
    const payload = {
      code: form.code.trim(), name: form.name.trim(), abbr: form.abbr.trim(), category: cat, loca: form.loca,
      cost_price: costPriceInt,
      cost_currency: form.cost_currency,
      status: form.status, supplier: form.supplier,
      options, channel_prices: [],
      mall_categories: form.mall_categories.filter(m => m.channel && m.category),
      basic_info: null,
    }
    const { data, error } = await supabase.from('pm_products').insert(payload).select().single()
    setAddSubmitting(false)
    if (error) {
      console.error('상품 등록 오류:', error)
      // mall_categories/basic_info 컬럼 미존재 시 fallback
      if (error.message?.includes('mall_categories') || error.message?.includes('basic_info') || error.code === '42703') {
        const { mall_categories: _mc, basic_info: _bi, ...fallback } = payload
        void _mc; void _bi
        const { data: d2, error: e2 } = await supabase.from('pm_products').insert(fallback).select().single()
        if (e2) { setAddDbError(`등록 실패: ${e2.message}\n※ Supabase에서 schema.sql의 ALTER TABLE 구문을 실행해주세요.`); return }
        const p = rowToProduct(d2)
        setProducts(prev => [...prev, p].sort((a, b) => a.code.localeCompare(b.code)))
        if (cat && cat !== '전체' && !extraCats.includes(cat)) setExtraCats(prev => [...prev, cat])
        setIsAdd(false); setForm(INIT_FORM); return
      }
      setAddDbError(`등록 실패: ${error.message}`)
      return
    }
    const p = rowToProduct(data)
    setProducts(prev => [...prev, p].sort((a, b) => a.code.localeCompare(b.code)))
    if (cat && cat !== '전체' && !extraCats.includes(cat)) setExtraCats(prev => [...prev, cat])
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

  /* ── 파일 input ref ── */
  const importInputRef = useRef<HTMLInputElement>(null)

  /* ── 전체목록 다운로드 ── */
  const handleFullDownload = () => {
    const rows: Record<string, string|number>[] = []
    products.forEach(p => {
      if (p.options.length === 0) {
        rows.push({
          상품코드: p.code, 상품명: p.name, 상품약어: p.abbr ?? '',
          카테고리: p.category, LOCA: p.loca,
          원가: p.cost_price, 통화: p.cost_currency,
          상태: ST[p.status]?.label ?? p.status,
          옵션코드: '', 한글명: '', 중국명: '', 바코드: '',
          발주: 0, 입고: 0, 현재고: 0, 불량: 0,
        })
      } else {
        p.options.forEach((o, idx) => {
          rows.push({
            상품코드: idx === 0 ? p.code : '',
            상품명: idx === 0 ? p.name : '',
            상품약어: idx === 0 ? (p.abbr ?? '') : '',
            카테고리: idx === 0 ? p.category : '',
            LOCA: idx === 0 ? p.loca : '',
            원가: idx === 0 ? p.cost_price : '',
            통화: idx === 0 ? p.cost_currency : '',
            상태: idx === 0 ? (ST[p.status]?.label ?? p.status) : '',
            옵션코드: o.name, 한글명: o.korean_name ?? '',
            중국명: o.chinese_name ?? '', 바코드: o.barcode ?? '',
            발주: o.ordered ?? 0, 입고: o.received ?? 0,
            현재고: o.current_stock ?? 0, 불량: o.defective ?? 0,
          })
        })
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '상품목록')
    XLSX.writeFile(wb, `상품목록_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  /* ── 상품요약 다운로드 (코드/명/약어/옵션명+이미지여부/LOCA) ── */
  const handleSummaryDownload = () => {
    const rows: Record<string, string>[] = []
    products.forEach(p => {
      if (p.options.length === 0) {
        rows.push({ 상품코드: p.code, 상품명: p.name, 상품약어: p.abbr ?? '', 옵션코드: '', 한글명: '', 이미지: '', LOCA: p.loca })
      } else {
        p.options.forEach((o, idx) => {
          rows.push({
            상품코드: idx === 0 ? p.code : '',
            상품명: idx === 0 ? p.name : '',
            상품약어: idx === 0 ? (p.abbr ?? '') : '',
            옵션코드: o.name,
            한글명: o.korean_name ?? '',
            이미지: o.image ? 'O' : '',
            LOCA: idx === 0 ? p.loca : '',
          })
        })
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    // 컬럼 너비 설정
    ws['!cols'] = [
      { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 6 }, { wch: 10 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '상품요약')
    XLSX.writeFile(wb, `상품요약_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  /* ── 엑셀 가져오기 ── */
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
    if (!raw.length) return

    // 행을 상품코드 기준으로 그룹핑
    const map = new Map<string, typeof raw>()
    raw.forEach(row => {
      const code = String(row['상품코드'] || '').trim()
      if (!code) return
      if (!map.has(code)) map.set(code, [])
      map.get(code)!.push(row)
    })

    for (const [code, rows] of map.entries()) {
      const first = rows[0]
      const options: ProductOption[] = rows
        .filter(r => String(r['옵션코드'] || '').trim())
        .map(r => ({
          name: String(r['옵션코드'] || ''),
          korean_name: String(r['한글명'] || '') || getKoreanColor(String(r['옵션코드'] || '')),
          chinese_name: String(r['중국명'] || ''),
          barcode: String(r['바코드'] || '') || genBarcode(code, String(r['옵션코드'] || '')),
          image: '',
          ordered: Number(r['발주']) || 0,
          received: Number(r['입고']) || 0,
          sold: 0,
          current_stock: Number(r['현재고']) || 0,
          defective: Number(r['불량']) || 0,
        }))
      const statusMap: Record<string, ProductStatus> = {
        '판매중':'active','판매예정':'upcoming','품절':'soldout','삭제예정':'pending_delete','전송준비':'ready_to_ship'
      }
      const payload = {
        code,
        name: String(first['상품명'] || ''),
        abbr: String(first['상품약어'] || ''),
        category: String(first['카테고리'] || ''),
        loca: String(first['LOCA'] || ''),
        cost_price: Math.round(Number(first['원가']) || 0),
        cost_currency: (String(first['통화'] || 'CNY') as CostCurrency),
        status: statusMap[String(first['상태'] || '')] || 'active' as ProductStatus,
        supplier: String(first['구매처'] || ''),
        options,
        channel_prices: [] as ChannelPrice[],
        mall_categories: [] as MallCategory[],
        basic_info: null,
      }
      const { data, error } = await supabase.from('pm_products').insert(payload).select().single()
      if (!error && data) {
        const p = rowToProduct(data)
        setProducts(prev => [...prev, p].sort((a,b) => a.code.localeCompare(b.code)))
        const cat = payload.category
        if (cat && cat !== '전체') setExtraCats(prev => prev.includes(cat) ? prev : [...prev, cat])
      }
    }
    alert(`가져오기 완료! ${map.size}개 상품이 등록되었습니다.`)
  }

  // KPI는 현재 선택된 카테고리 탭 기준으로 카운팅
  const catProducts = activeTab === '전체' ? products : products.filter(p => p.category === activeTab)

  const kpis = [
    {
      label:'전체 상품', filterKey:'전체',
      value: catProducts.length,
      bg:'#eff6ff', activeBg:'#2563eb', color:'#2563eb', activeColor:'white', icon:Package,
    },
    {
      label:'판매중', filterKey:'active',
      value: catProducts.filter(p => p.status === 'active').length,
      bg:'#ecfdf5', activeBg:'#059669', color:'#059669', activeColor:'white', icon:TrendingUp,
    },
    {
      label:'판매예정', filterKey:'upcoming',
      value: catProducts.filter(p => p.status === 'upcoming').length,
      bg:'#eff6ff', activeBg:'#3b82f6', color:'#3b82f6', activeColor:'white', icon:Package,
    },
    {
      label:'삭제예정', filterKey:'pending_delete',
      value: catProducts.filter(p => p.status === 'pending_delete').length,
      bg:'#fff7ed', activeBg:'#c2410c', color:'#c2410c', activeColor:'white', icon:Trash2,
    },
    {
      // 판매중인 상품 중 옵션 하나라도 재고 1~2개
      label:'재고 부족', filterKey:'__low_stock__',
      value: catProducts.filter(p =>
        p.status === 'active' &&
        p.options.some(o => optStock(o) > 0 && optStock(o) <= 2)
      ).length,
      bg:'#fffbeb', activeBg:'#d97706', color:'#d97706', activeColor:'white', icon:AlertTriangle,
    },
    {
      // 판매중인 상품 중 옵션 하나라도 재고 0개
      label:'품절', filterKey:'__soldout__',
      value: catProducts.filter(p =>
        p.status === 'active' &&
        p.options.some(o => optStock(o) === 0)
      ).length,
      bg:'#fff1f2', activeBg:'#be123c', color:'#be123c', activeColor:'white', icon:AlertTriangle,
    },
  ]

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300, gap:10, color:'#94a3b8' }}>
      <div style={{ width:22, height:22, borderRadius:'50%', border:'3px solid #e2e8f0', borderTopColor:'#2563eb', animation:'spin-slow 0.7s linear infinite' }}/>
      <span style={{ fontSize:13, fontWeight:700 }}>데이터를 불러오는 중...</span>
    </div>
  )

  return (
    <div className="pm-page space-y-4">

      {/* KPI 필터 버튼 */}
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(c => {
          const isActive = statusFilter === c.filterKey
          return (
            <button key={c.label}
              onClick={() => setStatusFilter(isActive ? '전체' : c.filterKey)}
              className="pm-card p-4 flex items-center gap-3"
              style={{
                cursor:'pointer', textAlign:'left', border:'none', width:'100%',
                outline: isActive ? `2px solid ${c.activeBg}` : '2px solid transparent',
                background: isActive ? c.activeBg : 'white',
                transition:'all 150ms ease',
                boxShadow: isActive ? `0 4px 14px ${c.activeBg}40` : undefined,
              }}
            >
              <div style={{ width:38, height:38, borderRadius:11, background: isActive ? 'rgba(255,255,255,0.25)' : c.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <c.icon size={17} color={isActive ? 'white' : c.color} />
              </div>
              <div>
                <p style={{ fontSize:10.5, fontWeight:800, color: isActive ? 'rgba(255,255,255,0.8)' : '#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>{c.label}</p>
                <p style={{ fontSize:20, fontWeight:900, color: isActive ? 'white' : '#0f172a', lineHeight:1, marginTop:3 }}>{c.value}<span style={{ fontSize:13, fontWeight:700, marginLeft:2 }}>개</span></p>
              </div>
            </button>
          )
        })}
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
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCatRename()
                      if (e.key === 'Escape') setCatEditTarget(null)
                    }}
                    style={{ width:90, fontSize:13, fontWeight:800, border:'1px solid #3b82f6', borderRadius:6, padding:'4px 8px', outline:'none', color:'#1e293b' }}
                  />
                  <button
                    onMouseDown={e => { e.preventDefault(); handleCatRename() }}
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', width:26, height:26, background:'#2563eb', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:13, flexShrink:0 }}>
                    ✓
                  </button>
                  <button
                    onMouseDown={e => { e.preventDefault(); setCatEditTarget(null) }}
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', width:26, height:26, background:'#f1f5f9', color:'#64748b', border:'none', borderRadius:6, cursor:'pointer', fontSize:12, flexShrink:0 }}>
                    ✕
                  </button>
                </div>
              ) : (
                <button onClick={() => setActiveTab(cat)} style={{
                  padding: cat==='전체' ? '12px 14px' : '12px 10px 12px 16px',
                  fontSize:13, fontWeight:800,
                  color: activeTab===cat ? '#2563eb' : '#94a3b8',
                  borderBottom:`2px solid ${activeTab===cat ? '#2563eb' : 'transparent'}`,
                  background:'none', border:'none', cursor:'pointer', transition:'all 150ms ease', whiteSpace:'nowrap',
                  display:'flex', alignItems:'center', gap:4,
                }}>
                  {cat}
                  <span style={{ fontSize:10.5, fontWeight:800,
                    background: activeTab===cat ? '#eff6ff' : '#f1f5f9',
                    color: activeTab===cat ? '#2563eb' : '#94a3b8',
                    padding:'1px 6px', borderRadius:99 }}>
                    {cat === '전체' ? products.length : products.filter(p => p.category===cat).length}
                  </span>
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
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCatAdd()
                  if (e.key === 'Escape') { setCatAddMode(false); setCatAddInput('') }
                }}
                placeholder="카테고리명"
                style={{ width:100, fontSize:13, fontWeight:800, border:'1px solid #3b82f6', borderRadius:6, padding:'4px 8px', outline:'none', color:'#1e293b' }}
              />
              <button
                onMouseDown={e => { e.preventDefault(); handleCatAdd() }}
                style={{ display:'flex', alignItems:'center', justifyContent:'center', width:26, height:26, background:'#2563eb', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:13, flexShrink:0 }}>
                ✓
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); setCatAddMode(false); setCatAddInput('') }}
                style={{ display:'flex', alignItems:'center', justifyContent:'center', width:26, height:26, background:'#f1f5f9', color:'#64748b', border:'none', borderRadius:6, cursor:'pointer', fontSize:12, flexShrink:0 }}>
                ✕
              </button>
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
          {/* 페이지네이션 */}
          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
            <span style={{ fontSize:11.5, fontWeight:700, color:'#94a3b8', whiteSpace:'nowrap' }}>총 {filtered.length}개</span>
            <button disabled={page===1} onClick={() => setPage(p=>p-1)}
              className="pm-btn pm-btn-ghost pm-btn-sm"
              style={{ height:28, minWidth:40, fontSize:12, opacity:page===1?0.35:1, cursor:page===1?'not-allowed':'pointer' }}>이전</button>
            {Array.from({length:totalPages},(_,i)=>i+1)
              .filter(n=>n===1||n===totalPages||Math.abs(n-page)<=1)
              .reduce<(number|'...')[]>((acc,n,i,arr)=>{
                if(i>0&&(n as number)-(arr[i-1] as number)>1) acc.push('...')
                acc.push(n); return acc
              },[])
              .map((v,i)=>v==='...'
                ?<span key={`e${i}`} style={{fontSize:12,color:'#94a3b8',padding:'0 2px'}}>…</span>
                :<button key={v} onClick={()=>setPage(v as number)}
                    className="pm-btn pm-btn-ghost pm-btn-sm"
                    style={{height:28,minWidth:28,fontSize:12,
                      background:page===v?'#2563eb':undefined,
                      color:page===v?'white':undefined,
                      fontWeight:page===v?900:undefined}}>
                    {v}
                  </button>
              )}
            <button disabled={page===totalPages} onClick={() => setPage(p=>p+1)}
              className="pm-btn pm-btn-ghost pm-btn-sm"
              style={{ height:28, minWidth:40, fontSize:12, opacity:page===totalPages?0.35:1, cursor:page===totalPages?'not-allowed':'pointer' }}>다음</button>
          </div>
          <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
            <Button variant="outline" size="sm" onClick={handleSummaryDownload}><Download size={13}/>상품요약</Button>
            <Button variant="outline" size="sm" onClick={handleFullDownload}><Download size={13}/>전체목록</Button>
            <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()}><Upload size={13}/>가져오기</Button>
            <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportExcel}/>
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
                      <button onClick={() => { setBasicInfoTarget(p); setBasicInfoForm(p.basic_info ?? {...DEF_BASIC_INFO, title:p.name}) }}
                        style={{ background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                          <p style={{ fontSize:13, fontWeight:800, color:'#2563eb', lineHeight:1.4, textDecoration:'underline', textDecorationStyle:'dotted', textUnderlineOffset:3 }}>{p.name}</p>
                          {p.abbr && (
                            <span style={{ fontSize:11, fontWeight:900, color:'#7e22ce', background:'#f3e8ff', padding:'1px 7px', borderRadius:5, letterSpacing:'0.02em', flexShrink:0 }}>
                              {p.abbr}
                            </span>
                          )}
                        </div>
                      </button>
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
                      <div style={{ display:'grid', gridTemplateColumns:'28px 74px 1fr 36px 36px 38px 36px 40px 36px 36px', gap:'0 6px', paddingBottom:4, marginBottom:2, borderBottom:'1px solid #f1f5f9' }}>
                        {['', '옵션명', '바코드', '발주', '입고', '미입고', '판매', '현재고', '불량', ''].map((h, hi) => (
                          <span key={hi} style={{ fontSize:9.5, fontWeight:800, color: h==='불량'?'#fca5a5':'#cbd5e1', textTransform:'uppercase', letterSpacing:'0.04em', textAlign: hi >= 3 ? 'right' : 'left' }}>{h}</span>
                        ))}
                      </div>
                      {p.options.map((opt, i) => {
                        const curStock    = optStock(opt)
                        const undelivered = optUndelivered(opt)
                        const sold        = optSold(opt)
                        const defective   = optDefective(opt)
                        const optLow      = curStock <= 2
                        const optZero     = curStock === 0
                        return (
                          <div key={i} style={{
                            display:'grid', gridTemplateColumns:'28px 74px 1fr 36px 36px 38px 36px 40px 36px 36px', gap:'0 6px',
                            padding:'5px 0',
                            borderBottom: i < p.options.length-1 ? '1px solid rgba(15,23,42,0.04)' : 'none',
                            alignItems:'center',
                            background: optLow ? 'rgba(239,68,68,0.03)' : 'transparent',
                          }}>
                            <div style={{ width:28, height:28, borderRadius:6, overflow:'hidden', background:'#f1f5f9', flexShrink:0 }}>
                              {opt.image
                                ? <img src={opt.image} alt={opt.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}><ImageIcon size={11} color="#cbd5e1" /></div>
                              }
                            </div>
                            <span style={{ display:'flex', flexDirection:'column', gap:1, overflow:'hidden' }}>
                              <span style={{ display:'flex', alignItems:'center', gap:4, overflow:'hidden' }}>
                                <span style={{ fontSize:12, fontWeight:800, color: optZero ? '#94a3b8' : '#334155', flexShrink:0 }}>{opt.name}</span>
                                {(opt.korean_name || getKoreanColor(opt.name)) && (
                                  <span style={{ fontSize:11, fontWeight:700, color:'#2563eb', background:'#eff6ff', padding:'0px 5px', borderRadius:4, flexShrink:0 }}>
                                    {opt.korean_name || getKoreanColor(opt.name)}
                                  </span>
                                )}
                              </span>
                              {opt.chinese_name && <span style={{ fontSize:10.5, color:'#94a3b8', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{opt.chinese_name}</span>}
                            </span>
                            <span style={{ fontFamily:'monospace', fontSize:10.5, color:'#1e293b', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{opt.barcode || '-'}</span>
                            <span style={{ textAlign:'right', fontSize:12, fontWeight:800, color:'#6366f1' }}>{opt.ordered}</span>
                            <span style={{ textAlign:'right', fontSize:12, fontWeight:800, color:'#0ea5e9' }}>{opt.received}</span>
                            <span style={{ textAlign:'right', fontSize:12, fontWeight:800, color: undelivered > 0 ? '#f59e0b' : '#94a3b8' }}>{undelivered}</span>
                            {/* 판매 = 입고 - 현재고 */}
                            <span style={{ textAlign:'right', fontSize:12, fontWeight:800, color:'#64748b' }}>{sold}</span>
                            {/* 현재고 */}
                            <span style={{ textAlign:'right', fontSize:13, fontWeight:900, color: optLow ? '#dc2626' : '#334155' }}>{curStock}</span>
                            {/* 불량 */}
                            <span style={{ textAlign:'right', fontSize:12, fontWeight:800, color: defective > 0 ? '#dc2626' : '#cbd5e1' }}>{defective > 0 ? defective : '-'}</span>
                            <span>
                              {optZero ? <span style={{ fontSize:9, fontWeight:800, background:'#fff1f2', color:'#dc2626', padding:'1px 5px', borderRadius:4 }}>품절</span>
                                : optLow ? <span style={{ fontSize:9, fontWeight:800, background:'#fff7ed', color:'#c2410c', padding:'1px 5px', borderRadius:4 }}>부족</span>
                                : null}
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
                        <MgmtBtn onClick={() => openEdit(p)} bg="#ecfdf5" color="#059669" hoverBg="#d1fae5"><Edit size={11}/>수정</MgmtBtn>
                        <MgmtBtn onClick={() => handleDelete(p.id)} bg="#fff1f2" color="#be123c" hoverBg="#ffe4e6"><Trash2 size={11}/>삭제</MgmtBtn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 하단 페이지네이션 ── */}
      {totalPages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', gap:4, alignItems:'center', padding:'12px 0 4px' }}>
          <button disabled={page===1} onClick={() => setPage(p=>p-1)}
            className="pm-btn pm-btn-ghost pm-btn-sm"
            style={{ height:28, minWidth:40, fontSize:12, opacity:page===1?0.35:1, cursor:page===1?'not-allowed':'pointer' }}>이전</button>
          {Array.from({length:totalPages},(_,i)=>i+1)
            .filter(n=>n===1||n===totalPages||Math.abs(n-page)<=1)
            .reduce<(number|'...')[]>((acc,n,i,arr)=>{
              if(i>0&&(n as number)-(arr[i-1] as number)>1) acc.push('...')
              acc.push(n); return acc
            },[])
            .map((v,i)=>v==='...'
              ?<span key={`e${i}`} style={{fontSize:12,color:'#94a3b8',padding:'0 2px'}}>…</span>
              :<button key={v} onClick={()=>setPage(v as number)}
                  className="pm-btn pm-btn-ghost pm-btn-sm"
                  style={{height:28,minWidth:28,fontSize:12,
                    background:page===v?'#2563eb':undefined,
                    color:page===v?'white':undefined,
                    fontWeight:page===v?900:undefined}}>
                  {v}
                </button>
            )}
          <button disabled={page===totalPages} onClick={() => setPage(p=>p+1)}
            className="pm-btn pm-btn-ghost pm-btn-sm"
            style={{ height:28, minWidth:40, fontSize:12, opacity:page===totalPages?0.35:1, cursor:page===totalPages?'not-allowed':'pointer' }}>다음</button>
        </div>
      )}

      {/* ── 상품 등록 모달 ── */}
      <Modal isOpen={isAdd} onClose={() => { setIsAdd(false); setAddErrors(new Set()); setAddDbError('') }} title="상품 등록" size="xl">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#2563eb', paddingBottom:6, borderBottom:'1px solid #eff6ff', marginBottom:10 }}>📦 기본 정보</p>
          </div>

          <div>
            <Label>상품코드 *</Label>
            <Input placeholder="WA5AC001" value={form.code}
              style={addErrors.has('code') ? { borderColor:'#ef4444', outline:'none' } : undefined}
              onChange={e => {
                const newCode = e.target.value
                setAddErrors(prev => { const n = new Set(prev); n.delete('code'); return n })
                setForm(f => ({
                  ...f,
                  code: newCode,
                  options: f.options.map(o => ({ ...o, barcode: genBarcode(newCode, o.name) })),
                }))
              }}
            />
            {addErrors.has('code') && <p style={{ fontSize:11, color:'#ef4444', marginTop:3 }}>상품코드를 입력해주세요</p>}
          </div>
          <div>
            <Label>상품명 *</Label>
            <Input placeholder="상품명 입력" value={form.name}
              style={addErrors.has('name') ? { borderColor:'#ef4444', outline:'none' } : undefined}
              onChange={e => { setAddErrors(prev => { const n = new Set(prev); n.delete('name'); return n }); setForm(f => ({...f,name:e.target.value})) }}
            />
            {addErrors.has('name') && <p style={{ fontSize:11, color:'#ef4444', marginTop:3 }}>상품명을 입력해주세요</p>}
          </div>

          <div>
            <Label>상품약어</Label>
            <Input placeholder="예) 사각숄더, 미니백" value={form.abbr}
              onChange={e => setForm(f => ({...f, abbr: e.target.value}))}
            />
            <p style={{ fontSize:10.5, color:'#94a3b8', fontWeight:600, marginTop:3 }}>옵션명 앞에 표시되는 짧은 상품 별칭</p>
          </div>

          <div>
            <Label>카테고리 *</Label>
            <Select className="w-full" value={form.category}
              style={addErrors.has('category') ? { borderColor:'#ef4444', outline:'none' } : undefined}
              onChange={e => { setAddErrors(prev => { const n = new Set(prev); n.delete('category'); return n }); setForm(f => ({...f,category:e.target.value,newCat:''})) }}>
              <option value="">선택하세요</option>
              {allCats.filter(c => c!=='전체').map(c => <option key={c}>{c}</option>)}
              <option value="__new__">+ 새 카테고리 추가</option>
            </Select>
            {addErrors.has('category') && <p style={{ fontSize:11, color:'#ef4444', marginTop:3 }}>카테고리를 선택해주세요</p>}
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
              <Input type="number" placeholder="0" min="0" step="0.1" value={form.cost_price}
                onChange={e => setForm(f => ({...f, cost_price: e.target.value}))} style={{ flex:1 }}/>
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
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                    <div>
                      <Label>옵션코드 (영문)</Label>
                      <Input placeholder="BE" value={opt.name}
                        onChange={e => {
                          const val = e.target.value
                          const auto = getKoreanColor(val)
                          const o=[...form.options]
                          o[i]={...o[i], name:val, korean_name: auto || o[i].korean_name, barcode:genBarcode(form.code,val)}
                          setForm(f=>({...f,options:o}))
                        }}
                      />
                    </div>
                    <div>
                      <Label>한글명 (자동입력)</Label>
                      <Input placeholder="베이지" value={opt.korean_name}
                        style={{ background: opt.korean_name ? '#f0fdf4' : '#fafbfc' }}
                        onChange={e => { const o=[...form.options];o[i]={...o[i],korean_name:e.target.value};setForm(f=>({...f,options:o}))}}
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

          {/* 쇼핑몰 카테고리 매핑 */}
          <div style={{ gridColumn:'1/-1', marginTop:4 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#7e22ce', paddingBottom:6, borderBottom:'1px solid #f3e8ff', marginBottom:10 }}>
              🛒 쇼핑몰별 카테고리 매핑
            </p>
            {form.mall_categories.map((mc, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr auto', gap:8, marginBottom:8 }}>
                <div>
                  <Label>쇼핑몰</Label>
                  <select value={mc.channel} onChange={e=>{const m=[...form.mall_categories];m[i]={...m[i],channel:e.target.value};setForm(f=>({...f,mall_categories:m}))}}
                    style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:12, outline:'none', fontWeight:700 }}>
                    <option value="">선택</option>
                    {ACTIVE_CHANNELS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><Label>카테고리명</Label>
                  <Input placeholder="여성패션 > 가방" value={mc.category}
                    onChange={e=>{const m=[...form.mall_categories];m[i]={...m[i],category:e.target.value};setForm(f=>({...f,mall_categories:m}))}}/>
                </div>
                <div><Label>카테고리 코드</Label>
                  <Input placeholder="숫자코드" value={mc.category_code}
                    onChange={e=>{const m=[...form.mall_categories];m[i]={...m[i],category_code:e.target.value};setForm(f=>({...f,mall_categories:m}))}}/>
                </div>
                <div style={{ paddingTop:21 }}>
                  <button onClick={() => setForm(f=>({...f,mall_categories:f.mall_categories.filter((_,j)=>j!==i)}))}
                    style={{ width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:'#fff1f2',color:'#dc2626',border:'none',borderRadius:8,cursor:'pointer' }}>
                    <X size={13}/>
                  </button>
                </div>
              </div>
            ))}
            <button onClick={() => setForm(f=>({...f,mall_categories:[...f.mall_categories,{...INIT_MALL_CAT}]}))}
              style={{ fontSize:12,fontWeight:800,color:'#7e22ce',background:'#fdf4ff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
              <Plus size={12}/>카테고리 추가
            </button>
          </div>

          <div style={{ gridColumn:'1/-1' }}>
            <p style={{ fontSize:11.5, fontWeight:800, color:'#64748b', background:'#f8fafc', borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:8 }}>
              <Store size={13} color="#94a3b8"/>
              <span>쇼핑몰별 판매가는 등록 후 상품 목록에서 <strong style={{ color:'#2563eb' }}>쇼핑몰별 판매가</strong> 셀을 클릭하여 설정할 수 있습니다.</span>
            </p>
          </div>
        </div>

        {addDbError && (
          <div style={{ marginTop:12, padding:'10px 14px', background:'#fff1f2', border:'1.5px solid #fecdd3', borderRadius:10 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#be123c', whiteSpace:'pre-line' }}>{addDbError}</p>
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <Button variant="outline" onClick={() => { setIsAdd(false); setAddErrors(new Set()); setAddDbError('') }}>취소</Button>
          <Button onClick={handleAdd} disabled={addSubmitting} style={{ opacity: addSubmitting ? 0.6 : 1 }}>
            {addSubmitting ? '등록 중...' : '등록하기'}
          </Button>
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
              <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 80px 60px 60px 60px 60px 60px 54px', gap:'0 8px', paddingBottom:6, borderBottom:'1px solid #f1f5f9', marginBottom:4 }}>
                {['','옵션명','바코드','발주','입고','미입고','판매','현재고','불량'].map((h,i) => (
                  <span key={i} style={{ fontSize:10, fontWeight:800, color: h==='불량'?'#fca5a5':'#94a3b8', textTransform:'uppercase' }}>{h}</span>
                ))}
              </div>
              {detail.options.map((opt, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'32px 1fr 80px 60px 60px 60px 60px 60px 54px', gap:'0 8px', padding:'6px 0', borderTop:i>0?'1px solid rgba(15,23,42,0.05)':'none', alignItems:'center' }}>
                  <div style={{ width:28, height:28, borderRadius:6, overflow:'hidden', background:'#f1f5f9' }}>
                    {opt.image ? <img src={opt.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}><ImageIcon size={11} color="#cbd5e1"/></div>}
                  </div>
                  <span style={{ fontWeight:800, color:'#334155', fontSize:13 }}>{opt.name}</span>
                  <span style={{ fontFamily:'monospace', fontSize:11, color:'#64748b' }}>{opt.barcode||'-'}</span>
                  <span style={{ fontSize:13, fontWeight:800, color:'#6366f1', textAlign:'right' }}>{opt.ordered}</span>
                  <span style={{ fontSize:13, fontWeight:800, color:'#0ea5e9', textAlign:'right' }}>{opt.received}</span>
                  <span style={{ fontSize:13, fontWeight:800, color: optUndelivered(opt)>0?'#f59e0b':'#94a3b8', textAlign:'right' }}>{optUndelivered(opt)}</span>
                  <span style={{ fontSize:13, fontWeight:800, color:'#64748b', textAlign:'right' }}>{optSold(opt)}</span>
                  <span style={{ fontSize:14, fontWeight:900, color: optStock(opt)<=2?'#dc2626':'#1e293b', textAlign:'right' }}>{optStock(opt)}</span>
                  <span style={{ fontSize:13, fontWeight:800, color: optDefective(opt)>0?'#dc2626':'#cbd5e1', textAlign:'right' }}>{optDefective(opt)||'-'}</span>
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
            <Button onClick={() => { openEdit(detail); setDetail(null) }}>수정하기</Button>
          </div>
        </Modal>
      )}

      {/* ── 수정 모달 ── */}
      {isEdit && editForm && (
        <Modal isOpen={!!isEdit} onClose={() => { setIsEdit(null); setEditForm(null) }} title={`상품 수정 — ${isEdit.name}`} size="xl">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

            {/* ① 기본 정보 */}
            <div><Label>상품코드 *</Label>
              <Input placeholder="WA5AC001" value={editForm.code}
                onChange={e => {
                  const newCode = e.target.value
                  setEditForm(f => f ? ({
                    ...f, code: newCode,
                    options: f.options.map(o => ({ ...o, barcode: genBarcode(newCode, o.name) })),
                  }) : f)
                }}
              />
            </div>
            <div><Label>상품명 *</Label>
              <Input placeholder="상품명" value={editForm.name}
                onChange={e => setEditForm(f => f ? ({ ...f, name: e.target.value }) : f)}/>
            </div>

            <div><Label>상품약어</Label>
              <Input placeholder="예) 사각숄더, 미니백" value={editForm.abbr}
                onChange={e => setEditForm(f => f ? ({ ...f, abbr: e.target.value }) : f)}/>
              <p style={{ fontSize:10.5, color:'#94a3b8', fontWeight:600, marginTop:3 }}>옵션명 앞에 표시되는 짧은 상품 별칭</p>
            </div>

            <div><Label>카테고리 *</Label>
              <Select value={editForm.category} onChange={e => setEditForm(f => f ? ({ ...f, category: e.target.value }) : f)}>
                <option value="">선택하세요</option>
                {allCats.filter(c => c !== '전체').map(c => <option key={c}>{c}</option>)}
                <option value="__new__">+ 새 카테고리 직접 입력</option>
              </Select>
              {editForm.category === '__new__' && (
                <Input placeholder="새 카테고리 이름" value={editForm.newCat}
                  onChange={e => setEditForm(f => f ? ({ ...f, newCat: e.target.value }) : f)}
                  style={{ marginTop:6 }}/>
              )}
            </div>
            <div><Label>LOCA</Label>
              <Input placeholder="A-1-01" value={editForm.loca} style={{ fontFamily:'monospace' }}
                onChange={e => setEditForm(f => f ? ({ ...f, loca: e.target.value }) : f)}/>
            </div>

            <div><Label>구매처</Label>
              <Input placeholder="상회명 또는 https://..." value={editForm.supplier}
                onChange={e => setEditForm(f => f ? ({ ...f, supplier: e.target.value }) : f)}/>
            </div>
            <div><Label>상태</Label>
              <Select value={editForm.status} onChange={e => setEditForm(f => f ? ({ ...f, status: e.target.value as ProductStatus }) : f)}>
                {ST_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </div>

            <div style={{ gridColumn:'1/-1' }}>
              <Label>원가</Label>
              <div style={{ display:'flex', gap:8 }}>
                <Input type="number" placeholder="0" min="0" step="0.1" value={editForm.cost_price} style={{ flex:1 }}
                  onChange={e => setEditForm(f => f ? ({ ...f, cost_price: e.target.value }) : f)}/>
                <Select style={{ width:110 }} value={editForm.cost_currency}
                  onChange={e => setEditForm(f => f ? ({ ...f, cost_currency: e.target.value as CostCurrency }) : f)}>
                  <option value="CNY">¥ 위안(CNY)</option>
                  <option value="KRW">₩ 원(KRW)</option>
                </Select>
              </div>
              {editForm.cost_currency === 'CNY' && Number(editForm.cost_price) > 0 && (
                <p style={{ fontSize:11.5, color:'#2563eb', fontWeight:700, marginTop:5 }}>
                  ≈ ₩{Math.round(Number(editForm.cost_price) * CNY_TO_KRW).toLocaleString()} (1위안={CNY_TO_KRW}원 기준)
                </p>
              )}
            </div>

            {/* ② 옵션 목록 */}
            <div style={{ gridColumn:'1/-1', marginTop:4 }}>
              <p style={{ fontSize:12, fontWeight:800, color:'#2563eb', paddingBottom:6, borderBottom:'1px solid #eff6ff', marginBottom:10 }}>
                📦 옵션 관리
              </p>
              {editForm.options.map((opt, i) => (
                <div key={i} style={{ border:'1px solid rgba(15,23,42,0.07)', borderRadius:12, padding:12, marginBottom:10, background:'#fafbfc' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'52px 2fr 1.5fr auto', gap:8, alignItems:'flex-end' }}>
                    {/* 이미지 */}
                    <div>
                      <Label>이미지</Label>
                      <label style={{ display:'block', width:44, height:44, borderRadius:8, overflow:'hidden', background:'#f1f5f9', cursor:'pointer', border:'1px dashed #cbd5e1' }}>
                        {opt.image
                          ? <img src={opt.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:2 }}>
                              <ImageIcon size={14} color="#94a3b8"/><span style={{ fontSize:8, color:'#94a3b8', fontWeight:700 }}>업로드</span>
                            </div>
                        }
                        <input type="file" accept="image/*" style={{ display:'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0]; if (!file) return
                            const reader = new FileReader()
                            reader.onload = ev => {
                              const result = ev.target?.result as string ?? ''
                              setEditForm(f => f ? ({ ...f, options: f.options.map((o, j) => j===i ? {...o, image:result} : o) }) : f)
                            }
                            reader.readAsDataURL(file)
                          }}
                        />
                      </label>
                    </div>
                    {/* 옵션명 + 한글명 + 중국명 */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                      <div>
                        <Label>옵션코드 (영문)</Label>
                        <Input placeholder="BE" value={opt.name}
                          onChange={e => {
                            const nm = e.target.value
                            const auto = getKoreanColor(nm)
                            setEditForm(f => f ? ({ ...f, options: f.options.map((o, j) => j===i ? {...o, name:nm, korean_name: auto || o.korean_name, barcode:genBarcode(f.code, nm)} : o) }) : f)
                          }}
                        />
                      </div>
                      <div>
                        <Label>한글명 (자동입력)</Label>
                        <Input placeholder="베이지" value={opt.korean_name}
                          style={{ background: opt.korean_name ? '#f0fdf4' : '#fafbfc' }}
                          onChange={e => setEditForm(f => f ? ({ ...f, options: f.options.map((o, j) => j===i ? {...o, korean_name:e.target.value} : o) }) : f)}
                        />
                      </div>
                      <div>
                        <Label>중국명</Label>
                        <Input placeholder="黑色/M" value={opt.chinese_name}
                          onChange={e => setEditForm(f => f ? ({ ...f, options: f.options.map((o, j) => j===i ? {...o, chinese_name:e.target.value} : o) }) : f)}
                        />
                      </div>
                    </div>
                    {/* 바코드 */}
                    <div>
                      <Label>바코드 (자동)</Label>
                      <Input readOnly value={opt.barcode || genBarcode(editForm.code, opt.name)}
                        style={{ background:'#f8fafc', color:'#334155', fontFamily:'monospace', fontSize:12 }}/>
                    </div>
                    {/* 삭제 */}
                    <div style={{ paddingBottom:1 }}>
                      {editForm.options.length > 1 && (
                        <button onClick={() => setEditForm(f => f ? ({ ...f, options: f.options.filter((_,j)=>j!==i) }) : f)}
                          style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', color:'#dc2626', border:'none', borderRadius:8, cursor:'pointer', marginTop:21 }}>
                          <X size={13}/>
                        </button>
                      )}
                    </div>
                  </div>
                  {/* 수량 직접 수정 */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginTop:10 }}>
                    {([
                      ['발주', 'ordered', '#6366f1'],
                      ['입고', 'received', '#0ea5e9'],
                      ['현재고', 'current_stock', '#059669'],
                      ['불량', 'defective', '#dc2626'],
                    ] as [string, keyof typeof opt, string][]).map(([lbl, field, clr]) => (
                      <div key={lbl}>
                        <p style={{ fontSize:10, fontWeight:800, color:'#94a3b8', marginBottom:4 }}>{lbl}</p>
                        <input
                          type="number" min="0"
                          value={(opt[field] as number) ?? 0}
                          onChange={e => {
                            const val = e.target.value === '' ? 0 : Number(e.target.value)
                            setEditForm(f => f ? ({ ...f, options: f.options.map((o, j) => j===i ? {...o, [field]: val} : o) }) : f)
                          }}
                          style={{ width:'100%', border:`1.5px solid ${clr}44`, borderRadius:8, padding:'5px 8px', fontSize:13, fontWeight:800, color:clr, background:`${clr}0a`, outline:'none', textAlign:'center' }}
                        />
                      </div>
                    ))}
                    <div>
                      <p style={{ fontSize:10, fontWeight:800, color:'#64748b', marginBottom:4 }}>판매 (자동)</p>
                      <div style={{ border:'1.5px solid #e2e8f0', borderRadius:8, padding:'5px 8px', fontSize:13, fontWeight:800, color:'#64748b', background:'#f8fafc', textAlign:'center' }}>
                        {Math.max(0, (opt.received || 0) - (opt.current_stock ?? 0))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => setEditForm(f => f ? ({ ...f, options:[...f.options,{name:'',korean_name:'',chinese_name:'',barcode:'',image:'',ordered:0,received:0,sold:0,current_stock:0,defective:0}] }) : f)}
                style={{ fontSize:12,fontWeight:800,color:'#2563eb',background:'#eff6ff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
                <Plus size={12}/>옵션 추가
              </button>
            </div>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
            <Button variant="outline" onClick={() => { setIsEdit(null); setEditForm(null); setEditSaving(false) }}>취소</Button>
            <Button onClick={handleEditSave} disabled={editSaving} style={{ opacity: editSaving ? 0.6 : 1 }}>
              {editSaving ? '저장 중...' : '저장하기'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── 기본정보 입력 팝업 (상품명 클릭) ── */}
      {basicInfoTarget && (
        <Modal isOpen onClose={() => setBasicInfoTarget(null)} title={`기본정보 입력 — ${basicInfoTarget.name}`} size="lg">
          <div style={{ background:'#fdf4ff', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12, fontWeight:700, color:'#7e22ce' }}>
            💡 한국 쇼핑몰 등록용 기본 정보를 입력하세요. 저장 시 상태가 <b>전송준비</b>로 변경됩니다.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <Label>상품 타이틀 *</Label>
              <Input placeholder="쇼핑몰에 등록될 상품명" value={basicInfoForm.title}
                onChange={e => setBasicInfoForm(f=>({...f,title:e.target.value}))}/>
            </div>
            {([
              { key:'brand' as const,        label:'브랜드',   placeholder:'브랜드명' },
              { key:'origin' as const,       label:'원산지',   placeholder:'예) 중국' },
              { key:'manufacturer' as const, label:'제조사',   placeholder:'제조사명' },
              { key:'material' as const,     label:'소재',     placeholder:'예) 폴리에스터 100%' },
            ]).map(({key, label, placeholder}) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input placeholder={placeholder} value={basicInfoForm[key]}
                  onChange={e => setBasicInfoForm(f=>({...f,[key]:e.target.value}))}/>
              </div>
            ))}
            <div style={{ gridColumn:'1/-1' }}>
              <Label>상세 설명</Label>
              <textarea value={basicInfoForm.description}
                onChange={e => setBasicInfoForm(f=>({...f,description:e.target.value}))}
                placeholder="상품 상세 설명을 입력하세요"
                style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:13, outline:'none', resize:'vertical', minHeight:80 }}/>
            </div>
            <div>
              <Label>취급 주의</Label>
              <Input placeholder="예) 세탁기 사용불가" value={basicInfoForm.handling}
                onChange={e => setBasicInfoForm(f=>({...f,handling:e.target.value}))}/>
            </div>
            <div>
              <Label>비고</Label>
              <Input placeholder="기타 메모" value={basicInfoForm.notes}
                onChange={e => setBasicInfoForm(f=>({...f,notes:e.target.value}))}/>
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
            <Button variant="outline" onClick={() => setBasicInfoTarget(null)}>취소</Button>
            <Button onClick={handleBasicInfoSave} disabled={basicInfoSaving} style={{ background:'#7e22ce', borderColor:'#7e22ce', opacity: basicInfoSaving ? 0.6 : 1 }}>
              {basicInfoSaving ? '저장 중...' : '저장 (전송준비로 변경)'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
