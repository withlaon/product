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
  size: string           // 사이즈 (기본: FREE)
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
interface ChannelPrice { channel: string; price: number; tag_price?: number }
interface MallCategory { channel: string; category: string; category_code: string }
interface BasicInfo {
  // ── 기본 상품정보
  title       : string
  brand       : string
  origin      : string
  manufacturer: string
  material    : string
  model_name  : string
  color       : string
  // ── 가격 정보
  sale_price     : string
  original_price : string
  supply_price   : string
  // ── 패션 추가정보
  gender      : string
  season      : string
  fit         : string
  thickness   : string
  elasticity  : string
  transparency: string
  age_group   : string
  wash_method : string
  // ── 배송 정보
  shipping_fee   : string
  shipping_origin: string
  courier        : string
  shipping_days  : string
  // ── 정책 정보
  description   : string
  as_info       : string
  return_policy : string
  handling      : string
  // ── 의류 상품고시 (법적 필수)
  notice_material    : string
  notice_color       : string
  notice_size        : string
  notice_manufacturer: string
  notice_country     : string
  notice_wash        : string
  notice_year_month  : string
  notice_warranty    : string
  notice_as          : string
  // ── 내부 메모
  legal_notice: string
  notes       : string
}
interface Product {
  id: string; code: string; name: string; abbr: string; category: string; loca: string
  options: ProductOption[]
  cost_price: number; cost_currency: CostCurrency
  channel_prices: ChannelPrice[]
  mall_categories: MallCategory[]
  basic_info: BasicInfo | null
  status: ProductStatus; supplier: string
  registered_malls: (string | { mall: string; code: string })[]   // 등록된 쇼핑몰 이름 및 상품코드
  promo_text?: string
  created_at?: string
}
const DEF_BASIC_INFO: BasicInfo = {
  title:'', brand:'', origin:'', manufacturer:'', material:'', model_name:'', color:'',
  sale_price:'', original_price:'', supply_price:'',
  gender:'', season:'', fit:'', thickness:'', elasticity:'', transparency:'', age_group:'', wash_method:'',
  shipping_fee:'', shipping_origin:'', courier:'', shipping_days:'',
  description:'', as_info:'', return_policy:'', handling:'',
  notice_material:'', notice_color:'', notice_size:'', notice_manufacturer:'', notice_country:'',
  notice_wash:'', notice_year_month:'', notice_warranty:'', notice_as:'',
  legal_notice:'', notes:'',
}

const CNY_TO_KRW = 210
const DEFAULT_CATS = ['전체'] // '전체' 탭은 항상 고정, 나머지는 extraCats로 관리
const INIT_EXTRA_CATS = ['가방', '의류', '잡화'] // 앱 최초 실행 시 기본 카테고리
const CATS_STORAGE_KEY = 'pm_categories_v1'

// 캐시 상수를 컴포넌트 바깥에 두어 useState 초기화 함수에서도 참조 가능
const PRODUCTS_CACHE_KEY = 'pm_products_cache_v1'
const PRODUCTS_CACHE_TTL = 30 * 60 * 1000 // 30분

/** TTL 관계없이 저장된 캐시 데이터 반환 (스테일 포함) */
function loadProductsAnyCached(): Product[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY)
    if (!raw) return []
    const { data: cached } = JSON.parse(raw)
    if (Array.isArray(cached) && cached.length > 0) return cached
  } catch {}
  return []
}

function loadProductsFromCache(): Product[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY)
    if (!raw) return []
    const { ts, data: cached } = JSON.parse(raw)
    if (Date.now() - ts < PRODUCTS_CACHE_TTL && Array.isArray(cached)) return cached
  } catch {}
  return []
}

function hasFreshCache(): boolean {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY)
    if (!raw) return false
    const { ts, data: cached } = JSON.parse(raw)
    return Date.now() - ts < PRODUCTS_CACHE_TTL && Array.isArray(cached) && cached.length > 0
  } catch { return false }
}


function loadSavedCats(): string[] | null {
  try { const r = localStorage.getItem(CATS_STORAGE_KEY); return r ? JSON.parse(r) : null } catch { return null }
}
function saveCats(cats: string[]) {
  try { localStorage.setItem(CATS_STORAGE_KEY, JSON.stringify(cats)) } catch {}
}

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

/* ─── 연동 채널 로드 (localStorage pm_mall_channels_v5) ─────── */
function loadConnectedChannels(): { name: string; bg: string; color: string }[] {
  const MALL_COLORS: Record<string, { bg: string; color: string }> = {
    '쿠팡':    { bg:'#fff7ed', color:'#c2410c' },
    '네이버':  { bg:'#f0fdf4', color:'#15803d' },
    '11번가':  { bg:'#fff1f2', color:'#be123c' },
    '에이블리':{ bg:'#fdf4ff', color:'#7e22ce' },
    '지그재그':{ bg:'#eff6ff', color:'#2563eb' },
    'G마켓':   { bg:'#fefce8', color:'#854d0e' },
    '옥션':    { bg:'#f0fdf4', color:'#166534' },
    '스마트스토어': { bg:'#f0fdf4', color:'#15803d' },
  }
  try {
    const raw = localStorage.getItem('pm_mall_channels_v5')
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((c: { active?: boolean }) => c.active)
      .map((c: { name: string }) => ({
        name: c.name,
        ...(MALL_COLORS[c.name] ?? { bg:'#f1f5f9', color:'#475569' }),
      }))
  } catch { return [] }
}

/* ─── 쇼핑몰 판매가 모달 ────────────────────────────────────── */
function ChannelPriceModal({
  product, onClose, onSave,
}: { product: Product; onClose: () => void; onSave: (prices: ChannelPrice[]) => void }) {
  const channels = loadConnectedChannels()
  const [prices, setPrices] = useState<Record<string, string>>(
    () => Object.fromEntries(
      channels.map(ch => [ch.name, String(product.channel_prices.find(cp => cp.channel === ch.name)?.price ?? '')])
    )
  )
  const [tagPrices, setTagPrices] = useState<Record<string, string>>(
    () => Object.fromEntries(
      channels.map(ch => [ch.name, String(product.channel_prices.find(cp => cp.channel === ch.name)?.tag_price ?? '')])
    )
  )
  const costKrw = product.cost_currency === 'CNY' ? Math.round(product.cost_price * CNY_TO_KRW) : product.cost_price
  const handleSave = () => {
    const result: ChannelPrice[] = channels
      .filter(ch => prices[ch.name] && Number(prices[ch.name]) > 0)
      .map(ch => ({
        channel: ch.name,
        price: Number(prices[ch.name]),
        ...(tagPrices[ch.name] && Number(tagPrices[ch.name]) > 0
          ? { tag_price: Number(tagPrices[ch.name]) }
          : {}),
      }))
    onSave(result)
  }
  return (
    <Modal isOpen onClose={onClose} title={`쇼핑몰별 판매가 — ${product.name}`} size="xl">
      <div style={{ marginBottom:16 }}>
        {/* 원가 + 컬럼 헤더 */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <p style={{ fontSize:11.5, fontWeight:700, color:'#64748b' }}>
            원가: {product.cost_currency==='CNY' ? `¥${product.cost_price} (≈ ${formatCurrency(costKrw)})` : formatCurrency(product.cost_price)}
          </p>
        </div>

        {channels.length === 0 ? (
          <div style={{ padding:'20px', textAlign:'center', color:'#94a3b8', fontSize:13, fontWeight:700 }}>
            연동된 쇼핑몰이 없습니다.<br/>
            <a href="/channels" style={{ color:'#2563eb', fontWeight:800 }}>쇼핑몰 관리에서 연동</a>해 주세요.
          </div>
        ) : (
          <div style={{ border:'1px solid #e2e8f0', borderRadius:12, overflow:'hidden' }}>
            {/* 헤더 행 */}
            <div style={{ display:'grid', gridTemplateColumns:'160px 1fr 1fr 150px', gap:0, background:'#f1f5f9', borderBottom:'1px solid #e2e8f0', padding:'8px 14px', alignItems:'center' }}>
              <span style={{ fontSize:10.5, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em' }}>쇼핑몰</span>
              <span style={{ fontSize:10.5, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>🏷️ TAG가 (정가·소비자가)</span>
              <span style={{ fontSize:10.5, fontWeight:800, color:'#2563eb', textTransform:'uppercase', letterSpacing:'0.06em' }}>💰 판매가 (실제 판매)</span>
              <span style={{ fontSize:10.5, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'right' }}>할인율 / 마진</span>
            </div>

            {/* 채널 행 */}
            {channels.map((ch, idx) => {
              const price    = Number(prices[ch.name])    || 0
              const tagPrice = Number(tagPrices[ch.name]) || 0
              const margin   = costKrw > 0 && price > 0 ? (((price - costKrw) / price) * 100).toFixed(1) : null
              const below    = price > 0 && price < costKrw
              const discount = tagPrice > 0 && price > 0 && tagPrice > price
                ? Math.round((1 - price / tagPrice) * 100) : null
              return (
                <div key={ch.name} style={{
                  display:'grid', gridTemplateColumns:'160px 1fr 1fr 150px', gap:0,
                  padding:'10px 14px', alignItems:'center',
                  background: idx % 2 === 0 ? 'white' : '#fafbfc',
                  borderBottom: idx < channels.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}>
                  {/* 쇼핑몰명 */}
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:12.5, fontWeight:800, background:ch.bg, color:ch.color, padding:'3px 10px', borderRadius:6, whiteSpace:'nowrap' }}>
                      {ch.name}
                    </span>
                    {below && <span style={{ fontSize:10, fontWeight:800, color:'#dc2626' }}>⚠️</span>}
                  </div>

                  {/* TAG가 입력 */}
                  <div style={{ paddingRight:10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5, background:'white', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'5px 9px' }}>
                      <span style={{ fontSize:12, fontWeight:700, color:'#94a3b8', flexShrink:0 }}>₩</span>
                      <input
                        type="number" placeholder="0"
                        value={tagPrices[ch.name]}
                        onChange={e => setTagPrices(prev => ({ ...prev, [ch.name]: e.target.value }))}
                        style={{ border:'none', outline:'none', width:'100%', fontSize:13, fontWeight:800, color:'#64748b', background:'transparent' }}
                      />
                    </div>
                  </div>

                  {/* 판매가 입력 */}
                  <div style={{ paddingRight:10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5, background:'white', border:'1.5px solid #bfdbfe', borderRadius:8, padding:'5px 9px' }}>
                      <span style={{ fontSize:12, fontWeight:700, color:'#2563eb', flexShrink:0 }}>₩</span>
                      <input
                        type="number" placeholder="0"
                        value={prices[ch.name]}
                        onChange={e => setPrices(prev => ({ ...prev, [ch.name]: e.target.value }))}
                        style={{ border:'none', outline:'none', width:'100%', fontSize:13, fontWeight:800, color:'#1e40af', background:'transparent' }}
                      />
                    </div>
                  </div>

                  {/* 할인율 / 마진 */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6 }}>
                    {discount !== null && (
                      <span style={{ fontSize:11, fontWeight:800, color:'#7c3aed', background:'#f5f3ff', padding:'2px 7px', borderRadius:5, whiteSpace:'nowrap' }}>
                        -{discount}%
                      </span>
                    )}
                    {margin && (
                      <span style={{ fontSize:11.5, fontWeight:800, color: below ? '#dc2626' : '#059669', whiteSpace:'nowrap' }}>
                        {margin}%
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <Button variant="outline" onClick={onClose}>취소</Button>
        {channels.length > 0 && <Button onClick={handleSave}>저장</Button>}
      </div>
    </Modal>
  )
}

/* ─── 쇼핑몰 매핑 모달 ──────────────────────────────────────── */
const LOCAL_MAPPING_KEY  = 'pm_channel_mappings_v2'
const LOCAL_CHANNEL_KEY  = 'pm_mall_channels_v5'

interface LocalMappedRow {
  mall_product_id: string; mall_product_name: string; mall_option: string
  matched_product_id: string | null; matched_product_code: string | null
  matched_product_name: string | null
  matched_option: string | null; matched_barcode: string | null
  mall_price: number | null; status: 'matched' | 'unmatched'
}
function loadMallChannels(): { key: string; name: string }[] {
  try {
    const raw = localStorage.getItem(LOCAL_CHANNEL_KEY)
    if (!raw) return PRICE_CHANNELS.map(n => ({ key: n, name: n }))
    const arr = JSON.parse(raw)
    const active = Array.isArray(arr) ? arr.filter((c: { active: boolean }) => c.active) : []
    return active.length > 0
      ? active.map((c: { key: string; name: string }) => ({ key: c.key, name: c.name }))
      : PRICE_CHANNELS.map(n => ({ key: n, name: n }))
  } catch { return PRICE_CHANNELS.map(n => ({ key: n, name: n })) }
}
function loadLocalMappings(): Record<string, LocalMappedRow[]> {
  try { const r = localStorage.getItem(LOCAL_MAPPING_KEY); return r ? JSON.parse(r) : {} }
  catch { return {} }
}
function saveLocalMappings(data: Record<string, LocalMappedRow[]>) {
  try { localStorage.setItem(LOCAL_MAPPING_KEY, JSON.stringify(data)) } catch {}
}

/** localStorage 매핑에서 productId → 매핑된 쇼핑몰명[] 맵 생성 */
function buildLocalMallsMap(): Record<string, string[]> {
  const mappings = loadLocalMappings()
  const channels = loadMallChannels()
  const result: Record<string, string[]> = {}
  for (const [mallKey, rows] of Object.entries(mappings)) {
    const mallName = channels.find(c => c.key === mallKey)?.name || mallKey
    for (const row of rows) {
      if (row.status === 'matched' && row.matched_product_id) {
        if (!result[row.matched_product_id]) result[row.matched_product_id] = []
        if (!result[row.matched_product_id].includes(mallName)) {
          result[row.matched_product_id].push(mallName)
        }
      }
    }
  }
  return result
}

/** localStorage 매핑에서 productId → { 쇼핑몰명: 쇼핑몰상품ID } 맵 생성 (hover 시 코드 표시용) */
function buildLocalMallCodesMap(): Record<string, Record<string, string>> {
  const mappings = loadLocalMappings()
  const channels = loadMallChannels()
  const result: Record<string, Record<string, string>> = {}
  for (const [mallKey, rows] of Object.entries(mappings)) {
    const mallName = channels.find(c => c.key === mallKey)?.name || mallKey
    for (const row of rows) {
      if (row.status === 'matched' && row.matched_product_id && row.mall_product_id) {
        if (!result[row.matched_product_id]) result[row.matched_product_id] = {}
        result[row.matched_product_id][mallName] = row.mall_product_id
      }
    }
  }
  return result
}

interface MappingRow { mallKey:string; mall:string; productId:string; productName:string; tagPrice:string; price:string }
function MallMappingModal({
  product, onClose, onSave,
}: { product: Product; onClose: () => void; onSave: (cp: ChannelPrice[], rm: (string|{mall:string;code:string})[]) => void }) {
  const channels = useMemo(() => loadMallChannels(), [])
  const existingMappings = useMemo(() => loadLocalMappings(), [])

  const [rows, setRows] = useState<MappingRow[]>(() =>
    channels.map(ch => {
      const priceEntry = product.channel_prices.find(cp => cp.channel === ch.name)
      const mallEntry  = (product.registered_malls ?? []).find(m =>
        typeof m === 'object' ? m.mall === ch.name : m === ch.name
      )
      // localStorage pm_channel_mappings_v2 에서도 기존 매핑 조회
      const localRow = (existingMappings[ch.key] || []).find(r => r.matched_product_id === product.id)
      return {
        mallKey:     ch.key,
        mall:        ch.name,
        productId:   typeof mallEntry === 'object'
          ? (mallEntry.code || localRow?.mall_product_id || '')
          : (localRow?.mall_product_id || ''),
        productName: localRow?.mall_product_name || '',
        tagPrice: priceEntry?.tag_price ? String(priceEntry.tag_price) : '',
        price: priceEntry
          ? String(priceEntry.price)
          : (localRow?.mall_price ? String(localRow.mall_price) : ''),
      }
    })
  )

  const handleSave = () => {
    // productId가 비어있으면 해당 쇼핑몰의 판매가·등록현황도 함께 제거
    const cp = rows.filter(r => r.productId.trim() && r.price && Number(r.price) > 0)
                   .map(r => ({
                     channel:   r.mall,
                     price:     Number(r.price),
                     ...(r.tagPrice && Number(r.tagPrice) > 0 ? { tag_price: Number(r.tagPrice) } : {}),
                   }))
    const rm = rows.filter(r => r.productId.trim())
                   .map(r => ({ mall: r.mall, code: r.productId.trim() }))

    // localStorage pm_channel_mappings_v2 도 동기화
    const allMaps = { ...existingMappings }
    for (const row of rows) {
      const mallRows = [...(allMaps[row.mallKey] || [])]
      if (row.productId.trim()) {
        const idx = mallRows.findIndex(r => r.matched_product_id === product.id)
        const entry: LocalMappedRow = {
          mall_product_id:   row.productId.trim(),
          mall_product_name: row.productName || product.name,
          mall_option:       '',
          matched_product_id:   product.id,
          matched_product_code: product.code || null,
          matched_product_name: product.name,
          matched_option:   null,
          matched_barcode:  null,
          mall_price: row.price && Number(row.price) > 0 ? Number(row.price) : null,
          status: 'matched',
        }
        if (idx >= 0) mallRows[idx] = entry; else mallRows.push(entry)
      } else {
        // productId 비어있으면 해당 상품의 매핑 제거
        mallRows.splice(0, mallRows.length, ...mallRows.filter(r => r.matched_product_id !== product.id))
      }
      allMaps[row.mallKey] = mallRows
    }
    saveLocalMappings(allMaps)
    // 매핑관리 탭이 같은 탭(SPA)에 마운트돼 있을 경우 실시간 갱신
    try { window.dispatchEvent(new CustomEvent('pm_mapping_updated')) } catch {}
    onSave(cp, rm)
  }

  const thS: React.CSSProperties = { fontSize:10.5, fontWeight:800, color:'#64748b', padding:'4px 0' }
  return (
    <Modal isOpen onClose={onClose} title={`쇼핑몰 매핑 — ${product.name}`} size="xl">
      <div style={{ display:'grid', gridTemplateColumns:'130px 1fr 1.5fr 110px 110px', gap:8, marginBottom:6 }}>
        {['쇼핑몰','상품ID','쇼핑몰 상품명 (참고)','🏷️ TAG가','💰 판매가'].map(h => <span key={h} style={thS}>{h}</span>)}
      </div>
      {rows.map((row, i) => (
        <div key={row.mallKey} style={{ display:'grid', gridTemplateColumns:'130px 1fr 1.5fr 110px 110px', gap:8, marginBottom:6, alignItems:'center' }}>
          <span style={{ fontSize:12.5, fontWeight:800, color:'#334155', background:'#f1f5f9', padding:'6px 10px', borderRadius:7, textAlign:'center' }}>{row.mall}</span>
          <Input placeholder="상품ID" value={row.productId}
            onChange={e => { const r=[...rows]; r[i]={...r[i],productId:e.target.value}; setRows(r) }}/>
          <Input placeholder="상품명 (선택)" value={row.productName}
            onChange={e => { const r=[...rows]; r[i]={...r[i],productName:e.target.value}; setRows(r) }}/>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',fontSize:12,color:'#94a3b8',fontWeight:700,pointerEvents:'none' }}>₩</span>
            <Input type="number" placeholder="0" value={row.tagPrice} style={{ paddingLeft:22 }}
              onChange={e => { const r=[...rows]; r[i]={...r[i],tagPrice:e.target.value}; setRows(r) }}/>
          </div>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',fontSize:12,color:'#94a3b8',fontWeight:700,pointerEvents:'none' }}>₩</span>
            <Input type="number" placeholder="0" value={row.price} style={{ paddingLeft:22 }}
              onChange={e => { const r=[...rows]; r[i]={...r[i],price:e.target.value}; setRows(r) }}/>
          </div>
        </div>
      ))}
      <p style={{ fontSize:11, color:'#94a3b8', marginTop:10 }}>
        * 상품ID 입력한 쇼핑몰 → 쇼핑몰 등록현황·판매가 표시 + 매핑관리탭에도 자동 반영됩니다.<br/>
        * 상품ID를 비우면 해당 쇼핑몰의 매핑·등록현황·판매가가 모두 삭제됩니다.
      </p>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={handleSave}>매핑 완료</Button>
      </div>
    </Modal>
  )
}

/* ─── 폼 초기값 ─────────────────────────────────────────────── */
const genBarcode = (code: string, opt: string) =>
  code && opt ? `${code.trim()} ${opt.trim().toUpperCase()}FFF` : ''

const INIT_OPT  = { name:'', size:'FREE', korean_name:'', chinese_name:'', barcode:'', image:'' }
const INIT_MALL_CAT = { channel:'', category:'', category_code:'' }
const PRICE_CHANNELS = ['쿠팡', '네이버 스마트스토어', '11번가', '마켓플러스', '토스쇼핑', 'G마켓', '지에스샵', '올웨이즈']

const INIT_FORM = {
  code:'', name:'', abbr:'', category:'', supplier:'', loca:'',
  cost_price:'', cost_currency:'CNY' as CostCurrency,
  newCat:'', status:'active' as ProductStatus,
  options:[{ ...INIT_OPT }],
  promo_text:'',
}

/* ─── 이미지 압축 (Canvas, 200×200, JPEG 70%) ───────────────── */
async function compressImage(dataUrl: string, maxPx = 200, quality = 0.7): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale  = Math.min(maxPx / img.width, maxPx / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(dataUrl); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

/** 이미지를 Supabase Storage 에 업로드하고 public URL 반환. 실패 시 null */
async function uploadToStorage(base64: string, path: string): Promise<string | null> {
  try {
    const res = await fetch('/api/pm-upload-image', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ base64, path }),
    })
    if (!res.ok) return null
    const { url } = await res.json()
    return url ?? null
  } catch {
    return null
  }
}

/* ─── 옵션 이미지 파일→압축 base64 (상품 등록 폼용) ─────────── */
function useOptImageUpload(setForm: React.Dispatch<React.SetStateAction<typeof INIT_FORM>>) {
  return (idx: number, file: File) => {
    const reader = new FileReader()
    reader.onload = async e => {
      const raw        = e.target?.result as string ?? ''
      const compressed = await compressImage(raw)
      setForm(f => {
        const opts = f.options.map((o, i) => i === idx ? { ...o, image: compressed } : o)
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
      size: o.size ?? 'FREE',
      korean_name: o.korean_name || getKoreanColor(o.name),
    })),
    channel_prices: (row.channel_prices ?? []) as ChannelPrice[],
    mall_categories: (row.mall_categories ?? []) as MallCategory[],
    basic_info: (row.basic_info ?? null) as BasicInfo | null,
    registered_malls: (row.registered_malls ?? []) as (string | { mall: string; code: string })[],
    promo_text: row.promo_text ?? '',
    created_at: row.created_at ?? '',
  }
}

/* ─── API 헬퍼 (service role key 서버 API → RLS 완전 우회) ────── */
const PM_API = '/api/pm-products'
const jsonHeaders = { 'Content-Type': 'application/json' }

async function pmPatch(id: string, fields: Record<string, unknown>) {
  const res = await fetch(PM_API, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ id, ...fields }) })
  const json = await res.json()
  return { error: res.ok ? null : (json.error ?? '수정 실패'), code: json.code }
}
async function pmPatchByCategory(filterCategory: string, newCategory: string) {
  await fetch(PM_API, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ filter_category: filterCategory, category: newCategory }) })
}
async function pmInsert(payload: Record<string, unknown>) {
  const res = await fetch(PM_API, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) })
  const json = await res.json()
  return { data: res.ok ? json : null, error: res.ok ? null : (json.error ?? '등록 실패'), code: json.code }
}
async function pmDelete(id: string) {
  const res = await fetch(PM_API, { method: 'DELETE', headers: jsonHeaders, body: JSON.stringify({ id }) })
  const json = await res.json()
  return { error: res.ok ? null : (json.error ?? '삭제 실패') }
}
async function pmGetBasicInfo(id: string) {
  const res = await fetch(`${PM_API}?id=${id}`)
  if (!res.ok) return null
  const json = await res.json()
  return json?.basic_info ?? null
}

/** 이미지 포함 전체 상품 데이터 조회 (수정 모달용) */
async function pmGetFullProduct(id: string): Promise<Product | null> {
  try {
    const res = await fetch(`${PM_API}?id=${id}&full=1`)
    if (!res.ok) return null
    const json = await res.json()
    return json ? rowToProduct(json) : null
  } catch { return null }
}

/* ─── 이미지 캐시: 인메모리(빠름) + localStorage 7일 TTL ──── */
const IMG_CACHE_KEY = 'pm_product_images_v1'
const IMG_CACHE_TTL = 7 * 24 * 60 * 60 * 1000

// 모듈 레벨 메모리 캐시 – JSON 파싱 반복 제거
let _imgMem: Record<string, string[]> = {}
let _imgMemLoaded = false

function loadImgCache(): Record<string, string[]> {
  if (_imgMemLoaded) return _imgMem
  _imgMemLoaded = true
  if (typeof window === 'undefined') return _imgMem
  try {
    const raw = localStorage.getItem(IMG_CACHE_KEY)
    if (!raw) return _imgMem
    const { data, ts } = JSON.parse(raw) as { data: Record<string, string[]>; ts: number }
    if (Date.now() - ts > IMG_CACHE_TTL) { localStorage.removeItem(IMG_CACHE_KEY); return _imgMem }
    _imgMem = data ?? {}
  } catch {}
  return _imgMem
}

function mergeImgCache(images: Record<string, string[]>) {
  _imgMem = { ..._imgMem, ...images }
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(IMG_CACHE_KEY, JSON.stringify({ data: _imgMem, ts: Date.now() }))
  } catch {}
}


/* ─── 메인 컴포넌트 ─────────────────────────────────────────── */
export default function ProductsPage() {
  // 스테일 캐시 포함 즉시 초기화 → 첫 렌더부터 목록 표시 (SSR 단계에서는 빈 배열, useEffect에서 덮어씀)
  const [products, setProducts]   = useState<Product[]>([])
  const [extraCats, setExtraCats] = useState<string[]>(INIT_EXTRA_CATS)
  const [activeTab, setActiveTab]     = useState('전체')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('전체')
  // 등록일 필터: 'all' | 'today' | '30' | '365' | 'custom'
  const [dateFilter, setDateFilter]   = useState<'all'|'today'|'30'|'365'|'custom'>('all')
  const [dateCustom, setDateCustom]   = useState('')
  const [showList, setShowList]       = useState(true)
  const [isAdd, setIsAdd]             = useState(false)
  const [detail, setDetail]           = useState<Product | null>(null)
  const [isEdit, setIsEdit]           = useState<Product | null>(null)
  const [channelPriceTarget, setChannelPriceTarget] = useState<Product | null>(null)
  const [mappingTarget,      setMappingTarget]      = useState<Product | null>(null)
  const [editStatusId, setEditStatusId] = useState<string | null>(null)
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10

  // localStorage 매핑 기반 쇼핑몰 현황 (마운트 시 즉시 로드 → Supabase 동기화 타이밍과 무관하게 실시간 반영)
  const [localMallsMap, setLocalMallsMap] = useState<Record<string, string[]>>(() => buildLocalMallsMap())
  // localStorage 매핑 기반 쇼핑몰 상품ID (hover 툴팁 코드 표시용)
  const [localMallCodesMap, setLocalMallCodesMap] = useState<Record<string, Record<string, string>>>(() => buildLocalMallCodesMap())

  // 옵션 이미지 lazy load: localStorage 캐시에서 즉시 초기화, 미캐시 상품만 API 조회
  const [pageImages, setPageImages] = useState<Record<string, string[]>>(() => loadImgCache())

  // 기본정보 팝업 상태
  const [basicInfoTarget, setBasicInfoTarget] = useState<Product | null>(null)
  const [basicInfoForm, setBasicInfoForm]     = useState<BasicInfo>({...DEF_BASIC_INFO})
  const [basicInfoTab, setBasicInfoTab]       = useState<'basic'|'price'|'fashion'|'notice'|'policy'>('basic')

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
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadErrorMsg, setLoadErrorMsg] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const handleOptImage  = useOptImageUpload(setForm)

  // 이미지 마이그레이션 상태
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState<{
    total: number; done: number; migrated: number; errors: number; finished: boolean
  } | null>(null)

  // 클라이언트 사이드 마이그레이션: base64 → Supabase Storage URL
  // 서버 API 대신 클라이언트에서 직접 처리 (서버 타임아웃 없음)
  async function startImageMigration() {
    if (products.length === 0) {
      alert('먼저 상품 목록을 불러와주세요.')
      return
    }
    setMigrating(true)
    setMigrateResult({ total: products.length, done: 0, migrated: 0, errors: 0, finished: false })

    let totalMigrated = 0
    let totalErrors   = 0

    for (let i = 0; i < products.length; i++) {
      const product = products[i]
      try {
        // 이미지가 포함된 전체 옵션 조회 (캐시된 API 사용)
        const res = await fetch(`${PM_API}?imageIds=${product.id}`)
        if (!res.ok) { totalErrors++; continue }

        const arr = await res.json() as Array<{ id: string; options?: Array<{ image?: string; [k: string]: unknown }> }>
        const fullOpts = arr.find(p => p.id === product.id)?.options ?? []
        const hasBase64 = fullOpts.some(o => (o.image ?? '').startsWith('data:'))

        if (!hasBase64) {
          setMigrateResult({ total: products.length, done: i + 1, migrated: totalMigrated, errors: totalErrors, finished: false })
          continue
        }

        // 각 옵션 이미지 압축 → Storage 업로드
        const newOpts = await Promise.all(
          fullOpts.map(async (opt, j) => {
            const img = opt.image ?? ''
            if (!img.startsWith('data:')) return opt
            try {
              const compressed = await compressImage(img, 200, 0.7)
              const path = `${product.id}/${j}.jpg`
              const url  = await uploadToStorage(compressed, path)
              if (url) { totalMigrated++; return { ...opt, image: url } }
              else { totalErrors++; return opt }
            } catch { totalErrors++; return opt }
          })
        )

        // DB 업데이트
        const { error: updateErr } = await supabase
          .from('pm_products')
          .update({ options: newOpts })
          .eq('id', product.id)
        if (updateErr) totalErrors++

      } catch { totalErrors++ }

      setMigrateResult({ total: products.length, done: i + 1, migrated: totalMigrated, errors: totalErrors, finished: false })
    }

    setMigrateResult(prev => prev ? { ...prev, finished: true } : null)
    setMigrating(false)
    try { localStorage.removeItem('pm_products_cache_v1') } catch {}
    handleRefresh()
  }

  // 수정 폼 상태
  type EditOptRow = { name:string; size:string; korean_name:string; chinese_name:string; barcode:string; image:string; ordered:number; received:number; sold:number; current_stock?:number; defective?:number }
  type EditFormState = {
    code:string; name:string; abbr:string; category:string; newCat:string; supplier:string; loca:string
    cost_price:string; cost_currency:CostCurrency; status:ProductStatus; options:EditOptRow[]
    promo_text:string
  }
  const [editForm, setEditForm] = useState<EditFormState | null>(null)

  /* ── 전체 옵션 재고=0 상품 자동 품절 처리 ── */
  const autoMarkSoldout = async (loaded: Product[]) => {
    const toSoldout = loaded.filter(p =>
      p.status !== 'soldout' &&
      p.status !== 'pending_delete' &&
      p.options.length > 0 &&
      p.options.every(o => optStock(o) === 0)
    )
    if (toSoldout.length === 0) return
    await Promise.all(toSoldout.map(p => pmPatch(p.id, { status: 'soldout' })))
    setProducts(prev => prev.map(p =>
      toSoldout.find(s => s.id === p.id) ? { ...p, status: 'soldout' } : p
    ))
  }

  /* ── 수동 새로고침 ── */
  const handleRefresh = () => {
    try { localStorage.removeItem(PRODUCTS_CACHE_KEY) } catch {}
    setRefreshKey(k => k + 1)
    setLoading(true)
    setLoadError(false)
    setLoadErrorMsg('')
  }

  /* ── 상품 로드 ── */
  useEffect(() => {
    const saved = loadSavedCats()
    if (saved && saved.length > 0) setExtraCats(saved)

    // 캐시가 있으면 즉시 표시 (SSR에선 localStorage 없으므로 useEffect에서 처리)
    const anyCache = loadProductsAnyCached()
    if (anyCache.length > 0) {
      setProducts(anyCache)
      setLoading(false)
      setIsRefreshing(false)

      // 신선한 캐시(30분 이내)가 있으면 서버 요청 완전 스킵
      if (hasFreshCache()) return
      setIsRefreshing(true)
    }

    let done = false // 중복 상태 업데이트 방지

    const finish = (loaded: Product[] | null, errMsg: string) => {
      if (done) return
      done = true
      clearTimeout(safetyTimer)
      setIsRefreshing(false)
      if (loaded && loaded.length >= 0) {
        setProducts(loaded)
        setLoadError(false)
        setLoadErrorMsg('')
        autoMarkSoldout(loaded)
        try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: loaded })) } catch {}
        const dbCats = loaded.map((p: Product) => p.category).filter((c: string) => c && c !== '전체')
        setExtraCats(prev => {
          const base = saved && saved.length > 0 ? saved : INIT_EXTRA_CATS
          const merged = [...new Set([...base, ...dbCats])]
          saveCats(merged); return merged
        })
      } else {
        const msg = errMsg || '알 수 없는 오류'
        console.error('상품 로드 최종 실패:', msg)
        setLoadErrorMsg(msg)
        if (loadProductsAnyCached().length === 0) setLoadError(true)
      }
      setLoading(false)
    }

    // 안전 타임아웃: 최대 58초 (Disk IO 스로틀 환경 대응)
    const safetyTimer = setTimeout(() => {
      finish(null, 'Supabase 응답 지연 중입니다.\n잠시 후 새로고침 버튼을 눌러주세요.')
    }, 58000)

    // 타임아웃을 걸 수 있는 fetch 래퍼
    const timedFetch = (url: string, ms: number): Promise<Response> => {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), ms)
      return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t))
    }

    // 타임아웃을 걸 수 있는 Supabase 쿼리 래퍼 (PromiseLike → Promise 변환 포함)
    const timedSupabaseQuery = <T,>(query: PromiseLike<T>, ms: number): Promise<T> =>
      Promise.race([
        Promise.resolve(query),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`supabase timeout ${ms}ms`)), ms)),
      ])

    const runLoad = async () => {
      const API_TIMEOUT    = 55000   // 서버 50s + 여유 (Disk IO 스로틀 대응)
      const DIRECT_TIMEOUT = 50000   // 브라우저→Supabase 직접

      let apiResult:  Product[] | null = null
      let dbResult:   Product[] | null = null
      let apiErr = ''
      let dbErr  = ''

      // ── API route (service_role key, RLS 우회) ──
      const apiFetch = async () => {
        if (done) return
        try {
          const res = await timedFetch('/api/pm-products', API_TIMEOUT)
          if (res.ok) {
            const raw = await res.json()
            if (Array.isArray(raw)) { apiResult = raw.map(rowToProduct); return }
            apiErr = `API 응답형식 오류: ${JSON.stringify(raw).slice(0, 80)}`
          } else {
            const body = await res.text().catch(() => '')
            apiErr = `API HTTP ${res.status}: ${body.slice(0, 80)}`
          }
        } catch (e) {
          apiErr = `API: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      // ── 직접 Supabase 클라이언트 (anon key) ──
      const directFetch = async () => {
        if (done) return
        try {
          const dbPromise = supabase
            .from('pm_products')
            .select('id,code,name,abbr,category,loca,cost_price,cost_currency,status,supplier,options,channel_prices,registered_malls,created_at')
            .order('code', { ascending: true })
            .then(r => r)

          const result = await timedSupabaseQuery(dbPromise, DIRECT_TIMEOUT)
          const { data, error } = result as { data: unknown[] | null; error: { message: string } | null }
          if (!error && Array.isArray(data)) {
            dbResult = data.map(rowToProduct)
          } else {
            dbErr = `Supabase직접: ${error?.message ?? 'no data'}`
          }
        } catch (e) {
          dbErr = `Supabase직접: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      // ── 병렬 실행: 둘 중 하나라도 성공하면 사용 ──
      await Promise.all([apiFetch(), directFetch()])

      if (done) return  // 안전 타이머가 이미 실행한 경우

      const loaded = apiResult ?? dbResult
      if (loaded) {
        finish(loaded, '')
      } else {
        finish(null, `${apiErr} | ${dbErr}`)
      }
    }

    runLoad()

    return () => { done = true; clearTimeout(safetyTimer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  /* ── 매핑관리탭 변경 감지: storage 이벤트(다른 탭) + visibilitychange(같은 탭 복귀) ── */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pm_products_mapping_signal' || e.key === 'pm_channel_mappings_v2') {
        setLocalMallsMap(buildLocalMallsMap())
        setLocalMallCodesMap(buildLocalMallCodesMap())
        if (e.key === 'pm_products_mapping_signal') {
          try { localStorage.removeItem('pm_products_cache_v1') } catch {}
          setRefreshKey(k => k + 1)
        }
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        // visibilitychange 시 localMallsMap 항상 갱신 (탭 전환 후 복귀 시)
        setLocalMallsMap(buildLocalMallsMap())
        setLocalMallCodesMap(buildLocalMallCodesMap())
        const sig = localStorage.getItem('pm_products_mapping_signal')
        if (sig) {
          localStorage.removeItem('pm_products_mapping_signal')
          try { localStorage.removeItem('pm_products_cache_v1') } catch {}
          setRefreshKey(k => k + 1)
        }
      }
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const allCats = useMemo(
    () => ['전체', ...extraCats.filter(c => !deletedCats.includes(c))],
    [extraCats, deletedCats]
  )

  /* ── 카테고리 추가 ── */
  const handleCatAdd = () => {
    const name = catAddInput.trim()
    if (!name || allCats.includes(name)) { setCatAddMode(false); setCatAddInput(''); return }
    setExtraCats(prev => {
      const updated = [...prev, name]
      saveCats(updated)
      return updated
    })
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
    setExtraCats(prev => {
      const updated = prev.map(c => c === catEditTarget ? newName : c)
      saveCats(updated)
      return updated
    })
    setProducts(prev => prev.map(p => p.category === catEditTarget ? { ...p, category: newName } : p))
    pmPatchByCategory(catEditTarget, newName)
    if (activeTab === catEditTarget) setActiveTab(newName)
    setCatEditTarget(null)
  }

  /* ── 카테고리 삭제 ── */
  const handleCatDelete = (cat: string) => {
    setExtraCats(prev => {
      const updated = prev.filter(c => c !== cat)
      saveCats(updated)
      return updated
    })
    setDeletedCats(prev => [...prev, cat])
    if (activeTab === cat) setActiveTab('전체')
    setCatDeleteTarget(null)
  }

  const [basicInfoSaving, setBasicInfoSaving] = useState(false)

  /* ── 기본정보 저장 (상태 → 전송준비) ── */
  const handleBasicInfoSave = async () => {
    if (!basicInfoTarget) return
    setBasicInfoSaving(true)
    const payload = { basic_info: basicInfoForm, status: 'ready_to_ship' as ProductStatus }
    const { error } = await pmPatch(basicInfoTarget.id, payload)
    setBasicInfoSaving(false)
    if (error) { console.error('기본정보 저장 오류:', error); return }
    setProducts(prev => prev.map(p => p.id === basicInfoTarget.id ? { ...p, ...payload } : p))
    setBasicInfoTarget(null)
  }

  /* ── 기본정보 수정 (상태 유지) ── */
  const handleBasicInfoUpdate = async () => {
    if (!basicInfoTarget) return
    setBasicInfoSaving(true)
    const { error } = await pmPatch(basicInfoTarget.id, { basic_info: basicInfoForm })
    setBasicInfoSaving(false)
    if (error) { console.error('기본정보 수정 오류:', error); return }
    setProducts(prev => prev.map(p => p.id === basicInfoTarget.id ? { ...p, basic_info: basicInfoForm } : p))
    setBasicInfoTarget(null)
  }

  /* ── 수정 모달 열기 (이미지 포함 전체 데이터 로드) ── */
  const openEdit = async (p: Product) => {
    const initOptions = (prod: Product) => prod.options.map(o => ({
      name: o.name, size: o.size ?? 'FREE',
      korean_name: o.korean_name || getKoreanColor(o.name),
      chinese_name: o.chinese_name || '',
      barcode: o.barcode, image: o.image ?? '',
      ordered: o.ordered, received: o.received, sold: o.sold,
      current_stock: o.current_stock, defective: o.defective,
    }))
    setEditForm({
      code: p.code, name: p.name, abbr: p.abbr ?? '', category: p.category, newCat: '',
      supplier: p.supplier, loca: p.loca,
      cost_price: String(p.cost_price), cost_currency: p.cost_currency,
      status: p.status,
      options: initOptions(p),
      promo_text: p.promo_text ?? '',
    })
    setIsEdit(p)
    // 이미지 포함 전체 데이터 백그라운드 로드
    const full = await pmGetFullProduct(p.id)
    if (full) {
      setEditForm(prev => prev ? { ...prev, options: initOptions(full) } : prev)
      setIsEdit(full)
      // 이미지 캐시 갱신
      const imgs = full.options.map(o => o.image ?? '')
      mergeImgCache({ [p.id]: imgs })
      setPageImages(prev => ({ ...prev, [p.id]: imgs }))
    }
  }

  const [editSaving, setEditSaving] = useState(false)

  const [editSaveError, setEditSaveError] = useState('')

  /* ── 수정 저장 (supabase 클라이언트 직접 호출 - Vercel 크기 제한 우회) ── */
  const handleEditSave = async () => {
    if (!isEdit || !editForm) return
    const cat = editForm.category === '__new__' ? editForm.newCat.trim() : editForm.category
    if (!editForm.code || !editForm.name || !cat) return
    setEditSaving(true)
    setEditSaveError('')
    const options: ProductOption[] = editForm.options.filter(o => o.name).map(o => ({
      name: o.name, size: o.size ?? 'FREE',
      korean_name: o.korean_name || getKoreanColor(o.name),
      chinese_name: o.chinese_name,
      barcode: o.barcode || genBarcode(editForm.code, o.name),
      image: o.image,
      ordered: Number(o.ordered) || 0,
      received: Number(o.received) || 0,
      sold: Number(o.sold) || 0,
      current_stock: o.current_stock !== undefined ? Number(o.current_stock) : 0,
      defective: Number(o.defective) || 0,
    }))
    const payload = {
      code: editForm.code, name: editForm.name, abbr: editForm.abbr.trim(), category: cat, loca: editForm.loca,
      cost_price: Number(editForm.cost_price) || 0,
      cost_currency: editForm.cost_currency,
      status: editForm.status, supplier: editForm.supplier,
      options,
      promo_text: editForm.promo_text ?? '',
    }
    try {
      const { error } = await supabase
        .from('pm_products')
        .update(payload)
        .eq('id', isEdit.id)
      if (error) {
        setEditSaveError(error.message)
        return
      }
      setProducts(prev => prev.map(p => p.id === isEdit.id ? { ...p, ...payload, channel_prices: p.channel_prices } : p))
      if (cat && cat !== '전체' && !extraCats.includes(cat)) setExtraCats(prev => {
        const updated = [...prev, cat]
        saveCats(updated)
        return updated
      })
      setIsEdit(null)
      setEditForm(null)
    } catch (e: unknown) {
      setEditSaveError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다')
    } finally {
      setEditSaving(false)
    }
  }
  const filtered = useMemo(() => {
    // 등록일 필터 기준일 계산
    let dateFrom: Date | null = null
    if (dateFilter === 'today') {
      dateFrom = new Date(); dateFrom.setHours(0,0,0,0)
    } else if (dateFilter === '30') {
      dateFrom = new Date(); dateFrom.setDate(dateFrom.getDate() - 30); dateFrom.setHours(0,0,0,0)
    } else if (dateFilter === '365') {
      dateFrom = new Date(); dateFrom.setDate(dateFrom.getDate() - 365); dateFrom.setHours(0,0,0,0)
    } else if (dateFilter === 'custom' && dateCustom) {
      dateFrom = new Date(dateCustom); dateFrom.setHours(0,0,0,0)
    }

    return products.filter(p => {
      const q   = search.trim()
      const mS  = !q || p.name.includes(q) || p.code.includes(q) || p.options.some(o => o.barcode.includes(q) || o.name.includes(q))
      const mC  = activeTab === '전체' || p.category === activeTab
      let mSt = true
      if (statusFilter === '__low_stock__') {
        mSt = p.status === 'active' && p.options.some(o => optStock(o) > 0 && optStock(o) <= 2)
      } else if (statusFilter === '__soldout__') {
        mSt = p.status === 'active' && p.options.some(o => optStock(o) === 0) && !p.options.every(o => optStock(o) === 0)
      } else if (statusFilter === '__fully_soldout__') {
        mSt = (p.status === 'soldout' || p.status === 'pending_delete') &&
              p.options.length > 0 && p.options.every(o => optStock(o) === 0)
      } else if (statusFilter !== '전체') {
        mSt = p.status === statusFilter
      }
      // 등록일 필터
      const mDate = !dateFrom || (p.created_at ? new Date(p.created_at) >= dateFrom : false)
      return mS && mC && mSt && mDate
    }).sort((a, b) => a.code.localeCompare(b.code))
  }, [products, search, activeTab, statusFilter, dateFilter, dateCustom])

  // 검색/탭/필터 변경 시에만 1페이지 리셋 (등록·수정 후에는 현재 페이지 유지)
  useEffect(() => { setPage(1) }, [search, activeTab, statusFilter, dateFilter, dateCustom])

  // 페이지 이동 시 스크롤 맨 위로
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [page])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // useMemo로 안정적인 reference 유지 → imgLoadKey 불필요한 재계산 방지
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  )
  const imgLoadKey = useMemo(() => paginated.map(p => p.id).join(','), [paginated])

  // 현재 페이지 이미지 로드: 상품별 개별 REST API 병렬 호출 (프로그레시브 표시)
  useEffect(() => {
    if (!imgLoadKey) return
    const pids = imgLoadKey.split(',').filter(Boolean)
    if (!pids.length) return
    let cancelled = false

    const mem = loadImgCache()
    // 캐시 적중 → 즉시 반영
    const fromCache: Record<string, string[]> = {}
    const toFetch: string[] = []
    pids.forEach(id => {
      if (id in mem) fromCache[id] = mem[id]
      else toFetch.push(id)
    })
    if (Object.keys(fromCache).length > 0) {
      setPageImages(prev => ({ ...prev, ...fromCache }))
    }
    if (toFetch.length === 0) return

    // 미캐시 상품: 1번 배치 API 호출 (service role, Vercel 엣지 캐시 적용)
    fetch(`${PM_API}?imageIds=${toFetch.join(',')}`)
      .then(res => res.ok ? res.json() : [])
      .then((data: Array<{ id: string; options?: Array<{ image?: string }> }>) => {
        if (cancelled || !Array.isArray(data)) return
        const result: Record<string, string[]> = {}
        data.forEach(row => {
          result[row.id] = (row.options ?? []).map(o => o.image ?? '')
        })
        if (Object.keys(result).length > 0) {
          mergeImgCache(result)
          setPageImages(prev => ({ ...prev, ...result }))
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoadKey])


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
    try {
      const options: ProductOption[] = form.options.filter(o => o.name.trim()).map(o => ({
        name: o.name, size: o.size ?? 'FREE',
        korean_name: o.korean_name || getKoreanColor(o.name),
        chinese_name: o.chinese_name,
        barcode: o.barcode || genBarcode(form.code, o.name),
        image: o.image,
        ordered: 0, received: 0, sold: 0,
      }))
      const costPriceVal = Number(form.cost_price) || 0
      const payload = {
        code: form.code.trim(), name: form.name.trim(), abbr: form.abbr.trim(), category: cat, loca: form.loca,
        cost_price: costPriceVal,
        cost_currency: form.cost_currency,
        status: form.status, supplier: form.supplier,
        options, channel_prices: [],
        basic_info: null,
        registered_malls: [],
        promo_text: form.promo_text ?? '',
      }
      const addSuccess = (rawData: unknown) => {
        const row = Array.isArray(rawData) ? rawData[0] : rawData
        const p = rowToProduct(row as Record<string, unknown>)
        setProducts(prev => [...prev, p].sort((a, b) => a.code.localeCompare(b.code)))
        if (cat && cat !== '전체' && !extraCats.includes(cat)) setExtraCats(prev => { const u=[...prev,cat]; saveCats(u); return u })
        setIsAdd(false); setForm(INIT_FORM)
      }
      const { data, error, code } = await pmInsert(payload)
      if (error) {
        console.error('상품 등록 오류:', error)
        // cost_price 정수 변환 재시도
        if (code === '22P02' || error.includes('integer')) {
          const { data: d2, error: e2 } = await pmInsert({ ...payload, cost_price: Math.round(costPriceVal) })
          if (e2) { setAddDbError(`등록 실패: ${e2}`); return }
          addSuccess(d2); return
        }
        // 알 수 없는 컬럼 오류 시 최소 페이로드로 재시도
        if (error.includes('42703') || error.includes('column') || code === '42703') {
          const minPayload = { code: payload.code, name: payload.name, abbr: payload.abbr, category: payload.category, loca: payload.loca, cost_price: payload.cost_price, cost_currency: payload.cost_currency, status: payload.status, supplier: payload.supplier, options: payload.options, registered_malls: [] }
          const { data: d2, error: e2 } = await pmInsert(minPayload)
          if (e2) { setAddDbError(`등록 실패: ${e2}`); return }
          addSuccess(d2); return
        }
        setAddDbError(`등록 실패: ${error}`)
        return
      }
      addSuccess(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setAddDbError(`등록 실패: ${msg}`)
    } finally {
      setAddSubmitting(false)
    }
  }

  const handleChannelPriceSave = async (prices: ChannelPrice[]) => {
    if (!channelPriceTarget) return
    const { error } = await pmPatch(channelPriceTarget.id, { channel_prices: prices })
    if (!error) setProducts(prev => prev.map(p => p.id === channelPriceTarget.id ? { ...p, channel_prices: prices } : p))
    setChannelPriceTarget(null)
  }

  const handleMappingSave = async (cp: ChannelPrice[], rm: (string|{mall:string;code:string})[]) => {
    if (!mappingTarget) return
    const { error } = await pmPatch(mappingTarget.id, { channel_prices: cp, registered_malls: rm })
    if (!error) {
      setProducts(prev => prev.map(p => p.id === mappingTarget!.id ? { ...p, channel_prices: cp, registered_malls: rm } : p))
      // 캐시도 갱신해서 새로고침 없이도 최신 상태 유지
      try {
        const raw = localStorage.getItem('pm_products_cache_v1')
        if (raw) {
          const { ts, data } = JSON.parse(raw)
          const newData = (data as Product[]).map((p: Product) => p.id === mappingTarget!.id ? { ...p, channel_prices: cp, registered_malls: rm } : p)
          localStorage.setItem('pm_products_cache_v1', JSON.stringify({ ts, data: newData }))
        }
      } catch {}
      localStorage.setItem('pm_products_mapping_signal', Date.now().toString())
    }
    // Supabase 성공/실패 상관없이 localStorage는 이미 저장됐으므로 항상 이벤트 발송
    window.dispatchEvent(new CustomEvent('pm_mapping_updated'))
    setMappingTarget(null)
  }

  const handleStatusChange = async (id: string, status: ProductStatus) => {
    const { error } = await pmPatch(id, { status })
    if (!error) setProducts(prev => prev.map(p => p.id === id ? { ...p, status } : p))
    setEditStatusId(null)
  }

  const invalidateProductsCache = () => {
    try { localStorage.removeItem('pm_products_cache_v1') } catch {}
  }

  const handleDelete = async (id: string) => {
    const target = products.find(p => p.id === id)
    const label = target?.abbr || target?.name || '해당 상품'
    if (!window.confirm(`"${label}" 상품을 삭제하시겠습니까?\n\n삭제하면 되돌릴 수 없으며,\n매핑관리의 해당 상품 데이터도 함께 제거됩니다.`)) return
    const { error } = await pmDelete(id)
    if (!error) {
      setProducts(prev => prev.filter(p => p.id !== id))
      invalidateProductsCache()
      // pm_channel_mappings_v2 에서 해당 상품 매핑 행 완전 제거
      try {
        const allMaps = loadLocalMappings()
        for (const key of Object.keys(allMaps)) {
          allMaps[key] = allMaps[key].filter(r => r.matched_product_id !== id)
        }
        saveLocalMappings(allMaps)
        localStorage.setItem('pm_products_mapping_signal', Date.now().toString())
        window.dispatchEvent(new CustomEvent('pm_mapping_updated'))
      } catch { /* 무시 */ }
    }
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

  /* ── 엑셀 일괄등록 양식 다운로드 (이미지 셀 포함) ── */
  const handleDownloadImportTemplate = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wbEx = new ExcelJS.Workbook()
    const wsEx = wbEx.addWorksheet('상품등록양식')

    wsEx.columns = [
      { key:'상품코드', width:13 }, { key:'상품명', width:28 }, { key:'상품약어', width:13 },
      { key:'카테고리', width:10 }, { key:'LOCA', width:8 }, { key:'원가', width:8 },
      { key:'통화', width:7 }, { key:'상태', width:10 }, { key:'구매처', width:28 },
      { key:'옵션코드', width:10 }, { key:'한글명', width:10 }, { key:'중국명', width:10 },
      { key:'바코드', width:16 }, { key:'발주', width:7 }, { key:'입고', width:7 },
      { key:'현재고', width:7 }, { key:'불량', width:7 },
      { key:'옵션이미지', width:14 },
    ]

    // 헤더 행
    const hdr = wsEx.addRow(['상품코드','상품명','상품약어','카테고리','LOCA','원가','통화','상태','구매처','옵션코드','한글명','중국명','바코드','발주','입고','현재고','불량','옵션이미지(URL또는붙여넣기)'])
    hdr.font = { bold:true, size:10 }
    hdr.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFE2E8F0' } }
    hdr.alignment = { vertical:'middle', horizontal:'center', wrapText:true }
    hdr.height = 28

    // 안내 행
    const note = wsEx.addRow(['※ 옵션이미지 열에 이미지 URL을 입력하거나, 셀을 선택한 뒤 이미지를 직접 붙여넣기(Ctrl+V) 해주세요. 동일 상품의 옵션은 상품코드 없이 아래 행에 이어서 입력하세요.','','','','','','','','','','','','','','','','',''])
    note.font = { italic:true, size:9, color:{ argb:'FF6B7280' } }
    wsEx.mergeCells(`A${note.number}:R${note.number}`)

    // 샘플 데이터
    const samples = [
      ['BAG001','스웨이드 백','SB','가방','A-01',25,'CNY','판매중','https://example.com','BK','블랙','黑色','BAG001 BKFFF',10,10,10,0,''],
      ['','','','','','','','','','BE','베이지','米色','BAG001 BEFFF',5,5,5,0,''],
      ['CL001','베이직 티셔츠','BT','의류','B-02',8000,'KRW','판매중','','WH','화이트','白色','CL001 WHFFF',20,20,15,1,''],
    ]
    samples.forEach(r => {
      const row = wsEx.addRow(r)
      row.alignment = { vertical:'middle' }
      row.height = 20
    })

    // 이미지 열 설명 셀 강조
    wsEx.getColumn('옵션이미지').font = { color:{ argb:'FF2563EB' }, bold:true }

    const buf = await wbEx.xlsx.writeBuffer()
    const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download='상품등록양식.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  /* ── 상품요약 다운로드 (코드/명/약어/옵션명+이미지/LOCA) ── */
  const handleSummaryDownload = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('상품요약')

    // 열 너비 설정
    ws.columns = [
      { key: 'code',    width: 14 },
      { key: 'name',    width: 32 },
      { key: 'abbr',    width: 13 },
      { key: 'option',  width: 11 },
      { key: 'korean',  width: 13 },
      { key: 'image',   width: 9  },
      { key: 'loca',    width: 11 },
    ]

    // 헤더 행
    const headerRow = ws.addRow(['상품코드', '상품명', '상품약어', '옵션코드', '한글명', '이미지', 'LOCA'])
    headerRow.font = { bold: true, size: 10 }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 22

    const IMAGE_ROW_HEIGHT = 55

    for (const p of products) {
      if (p.options.length === 0) {
        ws.addRow([p.code, p.name, p.abbr ?? '', '', '', '', p.loca])
        continue
      }
      for (let idx = 0; idx < p.options.length; idx++) {
        const o = p.options[idx]
        const row = ws.addRow([
          idx === 0 ? p.code : '',
          idx === 0 ? p.name : '',
          idx === 0 ? (p.abbr ?? '') : '',
          o.name,
          o.korean_name ?? '',
          '',
          idx === 0 ? p.loca : '',
        ])
        row.alignment = { vertical: 'middle' }

        // 첫 번째 옵션의 이미지만 삽입
        if (idx === 0 && o.image && o.image.startsWith('data:image/')) {
          try {
            const [meta, b64] = o.image.split(',')
            const ext = meta.includes('png') ? 'png' : meta.includes('gif') ? 'gif' : 'jpeg'
            const imgId = wb.addImage({ base64: b64, extension: ext as 'png' | 'jpeg' | 'gif' })
            const rowNum = row.number
            row.height = IMAGE_ROW_HEIGHT
            ws.addImage(imgId, {
              tl: { col: 5, row: rowNum - 1 } as never,
              br: { col: 6, row: rowNum } as never,
              editAs: 'oneCell',
            })
          } catch {
            row.getCell(6).value = 'O'
          }
        }
      }
    }

    // 브라우저에서 Blob으로 다운로드
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `상품요약_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ── 엑셀 가져오기 ── */
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setImportProgress({ current: 0, total: 0 })
    const buf = await file.arrayBuffer()

    // ExcelJS로 파싱 (내장 이미지 추출)
    const ExcelJS = (await import('exceljs')).default
    const wbEx = new ExcelJS.Workbook()
    await wbEx.xlsx.load(buf)
    const wsEx = wbEx.worksheets[0]
    if (!wsEx) { alert('파일에 시트가 없습니다.'); return }

    // 워크시트 내장 이미지 → 시트 행번호(1-based)별 base64 dataUrl 매핑
    // tl.nativeRow는 0-based이므로 +1 해서 1-based 시트 행번호로 변환
    const rowImageMap: Record<number, string> = {}
    wsEx.getImages().forEach(img => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const imgData = (wbEx as any).getImage(img.imageId)
        if (!imgData?.buffer) return
        const ext = imgData.extension || 'jpeg'
        const b64 = Buffer.from(imgData.buffer).toString('base64')
        const dataUrl = `data:image/${ext};base64,${b64}`
        const rowNum = (img.range.tl.nativeRow ?? 0) + 1  // 1-based 시트 행번호
        if (!rowImageMap[rowNum]) rowImageMap[rowNum] = dataUrl
      } catch { /* 이미지 추출 실패 시 무시 */ }
    })

    // 헤더 행에서 '옵션이미지' 컬럼 번호 파악 (URL 텍스트 입력 지원용)
    const headerRow = wsEx.getRow(1)
    let imgColIdx = -1
    headerRow.eachCell((cell, colNum) => {
      if (String(cell.value || '').includes('옵션이미지')) imgColIdx = colNum
    })

    // 옵션이미지 URL 텍스트 행 수집 (이미지가 없는 경우 URL 텍스트 fallback)
    const rowUrlMap: Record<number, string> = {}
    if (imgColIdx > 0) {
      wsEx.eachRow((row, rowNum) => {
        if (rowNum === 1) return
        const val = String(row.getCell(imgColIdx).value || '').trim()
        if (val && /^https?:\/\//i.test(val)) rowUrlMap[rowNum] = val
      })
    }

    // XLSX로 텍스트 데이터 파싱
    const wbXlsx = XLSX.read(buf, { type: 'array' })
    const wsXlsx = wbXlsx.Sheets[wbXlsx.SheetNames[0]]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawAll: any[] = XLSX.utils.sheet_to_json(wsXlsx, { defval: '' })

    // 안내/설명 행 제거: 상품코드·옵션코드 모두 없고 '※' 포함된 행 skip
    const raw = rawAll.filter(r => {
      const code = String(r['상품코드'] || '').trim()
      const opt  = String(r['옵션코드'] || '').trim()
      const name = String(r['상품명'] || '').trim()
      if (!code && !opt && !name) return false
      if (!code && !opt && name.startsWith('※')) return false
      return true
    })

    if (!raw.length) { setImporting(false); alert('파일에 데이터가 없습니다.'); return }

    // raw[i] → 실제 시트 행번호 계산
    // 헤더=1행, 안내행 존재 여부에 따라 offset 결정
    // rawAll[0]과 raw[0]이 다르면 안내행이 있는 것 → rawAll에서의 위치를 추적
    const rawOffset = rawAll.indexOf(raw[0]) // raw[0]이 rawAll에서 몇 번째인지 (0-based)
    const sheetRowOf = (rawIdx: number) => rawOffset + rawIdx + 2 // +2: 헤더 1행 + 0→1 변환

    // 상품코드 기준 그룹핑
    const map = new Map<string, { rows: typeof raw; sheetRowStart: number }>()
    let lastCode = ''
    let lastSheetRowStart = sheetRowOf(0)
    raw.forEach((row, i) => {
      const code = String(row['상품코드'] || '').trim()
      const sr = sheetRowOf(i)
      if (code) {
        lastCode = code
        lastSheetRowStart = sr
        if (!map.has(code)) map.set(code, { rows: [], sheetRowStart: sr })
      }
      if (lastCode) {
        if (!map.has(lastCode)) map.set(lastCode, { rows: [], sheetRowStart: lastSheetRowStart })
        const g = map.get(lastCode)!
        if (!g.rows.includes(row)) g.rows.push(row)
      }
    })

    if (map.size === 0) { setImporting(false); alert('유효한 상품코드가 없습니다.'); return }

    const statusMap: Record<string, ProductStatus> = {
      '판매중':'active','판매예정':'upcoming','품절':'soldout','삭제예정':'pending_delete','전송준비':'ready_to_ship'
    }

    let successCount = 0
    let updateCount = 0
    const errors: string[] = []
    const totalItems = map.size
    let processedCount = 0
    setImportProgress({ current: 0, total: totalItems })

    for (const [code, { rows, sheetRowStart }] of map.entries()) {
      const first = rows[0]
      const options: ProductOption[] = rows
        .filter(r => String(r['옵션코드'] || '').trim())
        .map((r, ri) => {
          const sheetRow = sheetRowStart + ri
          // 이미지: 내장 이미지(base64) > URL 텍스트 순서로 우선
          const image = rowImageMap[sheetRow] || rowUrlMap[sheetRow] || ''
          return {
            name: String(r['옵션코드'] || ''),
            size: String(r['사이즈'] || 'FREE'),
            korean_name: String(r['한글명'] || '') || getKoreanColor(String(r['옵션코드'] || '')),
            chinese_name: String(r['중국명'] || ''),
            barcode: String(r['바코드'] || '') || genBarcode(code, String(r['옵션코드'] || '')),
            image,
            ordered: Number(r['발주']) || 0,
            received: Number(r['입고']) || 0,
            sold: 0,
            current_stock: Number(r['현재고']) || 0,
            defective: Number(r['불량']) || 0,
          }
        })

      const payload = {
        code,
        name: String(first['상품명'] || ''),
        abbr: String(first['상품약어'] || ''),
        category: String(first['카테고리'] || ''),
        loca: String(first['LOCA'] || ''),
        cost_price: Number(first['원가']) || 0,
        cost_currency: (String(first['통화'] || 'CNY') as CostCurrency),
        status: statusMap[String(first['상태'] || '')] || 'active' as ProductStatus,
        supplier: String(first['구매처'] || ''),
        options,
        channel_prices: [] as ChannelPrice[],
        mall_categories: [] as MallCategory[],
        basic_info: null,
        registered_malls: [] as (string | { mall: string; code: string })[],
      }

      if (!payload.name) { errors.push(`${code}: 상품명 없음`); continue }

      // cost_price가 소숫점인데 DB 컬럼이 integer인 경우를 위한 헬퍼
      // 22P02(invalid input syntax for integer) 오류 시 반올림 후 재시도
      const payloadIntCost = { ...payload, cost_price: Math.round(payload.cost_price) }

      const existing = products.find(p => p.code === code)
      if (existing) {
        let { error, code: errCode } = await pmPatch(existing.id, payload)
        if (error) {
          if (errCode === '22P02' || error.includes('integer')) {
            const { error: e2 } = await pmPatch(existing.id, payloadIntCost)
            if (e2) { errors.push(`${code}: ${e2}`); continue }
            setProducts(prev => prev.map(p => p.code === code ? { ...p, ...payloadIntCost } : p))
          } else if (errCode === '42703' || error.includes('mall_categories') || error.includes('basic_info')) {
            const { mall_categories: _mc, basic_info: _bi, ...fallback } = payload; void _mc; void _bi
            const { error: e2, code: ec2 } = await pmPatch(existing.id, fallback)
            if (e2) {
              if (ec2 === '22P02' || e2.includes('integer')) {
                const { mall_categories: _mc2, basic_info: _bi2, ...fallbackInt } = payloadIntCost; void _mc2; void _bi2
                const { error: e3 } = await pmPatch(existing.id, fallbackInt)
                if (e3) { errors.push(`${code}: ${e3}`); continue }
              } else { errors.push(`${code}: ${e2}`); continue }
            }
          } else { errors.push(`${code}: ${error}`); continue }
        }
        setProducts(prev => prev.map(p => p.code === code ? { ...p, ...payload } : p))
        updateCount++
      } else {
        let { data, error, code: errCode } = await pmInsert(payload)
        if (error) {
          if (errCode === '22P02' || error.includes('integer')) {
            const { data: d2, error: e2 } = await pmInsert(payloadIntCost)
            if (e2) { errors.push(`${code}: ${e2}`); continue }
            setProducts(prev => [...prev, rowToProduct(d2)].sort((a,b) => a.code.localeCompare(b.code)))
          } else if (errCode === '42703' || error.includes('mall_categories') || error.includes('basic_info')) {
            const { mall_categories: _mc, basic_info: _bi, ...fallback } = payload; void _mc; void _bi
            const { data: d2, error: e2, code: ec2 } = await pmInsert(fallback)
            if (e2) {
              if (ec2 === '22P02' || e2.includes('integer')) {
                const { mall_categories: _mc2, basic_info: _bi2, ...fallbackInt } = payloadIntCost; void _mc2; void _bi2
                const { data: d3, error: e3 } = await pmInsert(fallbackInt)
                if (e3) { errors.push(`${code}: ${e3}`); continue }
                setProducts(prev => [...prev, rowToProduct(d3)].sort((a,b) => a.code.localeCompare(b.code)))
              } else { errors.push(`${code}: ${e2}`); continue }
            } else if (d2) {
              setProducts(prev => [...prev, rowToProduct(d2)].sort((a,b) => a.code.localeCompare(b.code)))
            }
          } else { errors.push(`${code}: ${error}`); continue }
        } else if (data) {
          setProducts(prev => [...prev, rowToProduct(data)].sort((a,b) => a.code.localeCompare(b.code)))
        }
        successCount++
      }

      const cat = payload.category
      if (cat && cat !== '전체') setExtraCats(prev => {
        if (prev.includes(cat)) return prev
        const updated = [...prev, cat]; saveCats(updated); return updated
      })
      processedCount++
      setImportProgress({ current: processedCount, total: totalItems })
    }

    setImporting(false)
    const msg = [
      successCount > 0 ? `신규 등록: ${successCount}개` : '',
      updateCount > 0 ? `업데이트: ${updateCount}개` : '',
      errors.length > 0 ? `\n실패: ${errors.length}개\n${errors.slice(0,5).join('\n')}${errors.length>5?'\n...':''}` : '',
    ].filter(Boolean).join(' / ')
    alert(`엑셀 일괄등록 완료!\n${msg}`)
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
      // 판매중인 상품 중 옵션 일부가 재고 0개 (전체품절 아님)
      label:'옵션품절', filterKey:'__soldout__',
      value: catProducts.filter(p =>
        p.status === 'active' &&
        p.options.some(o => optStock(o) === 0) &&
        !p.options.every(o => optStock(o) === 0)
      ).length,
      bg:'#fff1f2', activeBg:'#be123c', color:'#be123c', activeColor:'white', icon:AlertTriangle,
    },
    {
      // 모든 옵션 재고 0개 (전체 품절) - 삭제예정 포함
      label:'품절', filterKey:'__fully_soldout__',
      value: catProducts.filter(p =>
        (p.status === 'soldout' || p.status === 'pending_delete') &&
        p.options.length > 0 && p.options.every(o => optStock(o) === 0)
      ).length,
      bg:'#fef2f2', activeBg:'#991b1b', color:'#991b1b', activeColor:'white', icon:X,
    },
  ]

  return (
    <div className="pm-page space-y-4">

      {/* KPI 필터 버튼 */}
      <div className="grid grid-cols-3 xl:grid-cols-7 gap-3">
        {kpis.map(c => {
          const isActive = statusFilter === c.filterKey
          return (
            <button key={c.label}
              onClick={() => { setStatusFilter(isActive ? '전체' : c.filterKey); setShowList(true); clearSearch() }}
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
                <button onClick={() => { setActiveTab(cat); setShowList(true); clearSearch() }} style={{
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
          {/* 등록일 필터 */}
          <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' }}>
            {([['today','오늘'],['30','최근 한달'],['365','최근 1년']] as const).map(([val, label]) => (
              <button key={val} onClick={() => { setDateFilter(val); setDateCustom(''); setShowList(true) }}
                style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid', fontSize:11.5, fontWeight:800, cursor:'pointer', whiteSpace:'nowrap',
                  borderColor: dateFilter === val ? '#2563eb' : '#e2e8f0',
                  background: dateFilter === val ? '#eff6ff' : 'white',
                  color: dateFilter === val ? '#1d4ed8' : '#64748b',
                }}>{label}</button>
            ))}
            <button onClick={() => { setDateFilter('custom'); setShowList(true) }}
              style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid', fontSize:11.5, fontWeight:800, cursor:'pointer', whiteSpace:'nowrap',
                borderColor: dateFilter === 'custom' ? '#2563eb' : '#e2e8f0',
                background: dateFilter === 'custom' ? '#eff6ff' : 'white',
                color: dateFilter === 'custom' ? '#1d4ed8' : '#64748b',
              }}>날짜 선택</button>
            {dateFilter === 'custom' && (
              <input type="date" value={dateCustom} onChange={e => setDateCustom(e.target.value)}
                max={new Date().toISOString().slice(0,10)}
                style={{ padding:'4px 8px', borderRadius:7, border:'1.5px solid #93c5fd', fontSize:12, fontWeight:700, color:'#1e293b', outline:'none', cursor:'pointer' }}
              />
            )}
          </div>
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
            <Button variant="outline" size="sm" onClick={handleDownloadImportTemplate}><Download size={13}/>등록양식</Button>
            <Button size="sm" onClick={() => !importing && importInputRef.current?.click()}
              disabled={importing}
              style={importing ? { opacity:0.7, cursor:'not-allowed', position:'relative' } : {}}>
              {importing
                ? <><span style={{ display:'inline-block', width:11, height:11, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'white', borderRadius:'50%', animation:'spin-slow 0.7s linear infinite', marginRight:4 }}/>
                    등록중 ({importProgress.current}/{importProgress.total})</>
                : <><Upload size={13}/>엑셀 일괄등록</>}
            </Button>
            <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportExcel}/>
            <Button size="sm" onClick={() => setIsAdd(true)}><Plus size={13}/>상품 등록</Button>
            {/* 이미지 Storage 마이그레이션 버튼 */}
            <button
              onClick={() => { if (!migrating) startImageMigration() }}
              disabled={migrating}
              title="기존 base64 이미지를 Supabase Storage(CDN)로 이전합니다"
              style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:7, border:'1px solid #e2e8f0', background: migrating ? '#fef3c7' : '#fffbeb', color:'#92400e', fontSize:12, fontWeight:700, cursor: migrating ? 'not-allowed' : 'pointer', opacity: migrating ? 0.8 : 1 }}>
              {migrating
                ? <><span style={{ display:'inline-block', width:11, height:11, border:'2px solid rgba(0,0,0,0.2)', borderTopColor:'#92400e', borderRadius:'50%', animation:'spin-slow 0.7s linear infinite', marginRight:4 }}/>
                    이미지 이전 중{migrateResult ? ` (${migrateResult.done}/${migrateResult.total})` : '...'}</>
                : <>📦 이미지 Storage 이전</>}
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading || isRefreshing}
              title="캐시를 초기화하고 최신 데이터를 불러옵니다"
              style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:7, border:'1px solid #e2e8f0', background: isRefreshing ? '#f1f5f9' : 'white', color:'#64748b', fontSize:12, fontWeight:700, cursor: (loading || isRefreshing) ? 'not-allowed' : 'pointer', opacity: (loading || isRefreshing) ? 0.6 : 1 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={isRefreshing ? { animation:'spin 1s linear infinite' } : {}}>
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>
              </svg>
              {isRefreshing ? '동기화 중...' : '새로고침'}
            </button>
          </div>
        </div>
      </div>

      {/* ── 테이블 ── */}
      {<div className="pm-card overflow-hidden">
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
                <th style={{ minWidth:160 }}>쇼핑몰판매가</th>
                <th style={{ minWidth:120 }}>쇼핑몰 등록현황</th>
                <th style={{ width:100, textAlign:'center' }}>상태</th>
                <th style={{ width:100 }}>구매처</th>
                <th style={{ width:132, textAlign:'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} style={{ textAlign:'center', padding:'3.5rem 1rem', color:'#94a3b8' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation:'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                      <p style={{ fontSize:13.5, fontWeight:700, color:'#64748b' }}>상품 목록을 불러오는 중입니다...</p>
                      <p style={{ fontSize:11.5, color:'#94a3b8' }}>Disk IO 과부하로 최대 1분 소요될 수 있습니다</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && loadError && (
                <tr>
                  <td colSpan={11} style={{ textAlign:'center', padding:'3rem 1rem' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, maxWidth:520, margin:'0 auto' }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <p style={{ fontSize:13.5, fontWeight:700, color:'#64748b' }}>상품 목록을 불러오지 못했습니다</p>
                      {loadErrorMsg && (
                        <pre style={{ fontSize:11, color:'#ef4444', background:'#fff1f2', border:'1px solid #fecaca', borderRadius:8, padding:'10px 14px', textAlign:'left', whiteSpace:'pre-wrap', wordBreak:'break-all', width:'100%' }}>{loadErrorMsg}</pre>
                      )}
                      <button
                        onClick={() => { setLoading(true); setLoadError(false); setLoadErrorMsg(''); window.location.reload() }}
                        style={{ padding:'6px 18px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:6, fontSize:13, fontWeight:600, cursor:'pointer' }}
                      >다시 시도</button>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && !loadError && filtered.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign:'center', padding:'3.5rem 1rem', color:'#94a3b8' }}>
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
                      <button onClick={async () => {
                          let bi = p.basic_info
                          if (!bi) {
                            bi = await pmGetBasicInfo(p.id)
                            if (bi) setProducts(prev => prev.map(pp => pp.id === p.id ? { ...pp, basic_info: bi } : pp))
                          }
                          setBasicInfoTarget({ ...p, basic_info: bi })
                          setBasicInfoForm({ ...DEF_BASIC_INFO, ...(bi ?? {}), title: bi?.title || p.name })
                          setBasicInfoTab('basic')
                        }}
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
                              {(() => { const img = pageImages[p.id]?.[i] || opt.image || ''; return img
                                ? <img src={img} alt={opt.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}><ImageIcon size={11} color="#cbd5e1" /></div>
                              })()}
                            </div>
                            <span style={{ display:'flex', flexDirection:'column', gap:1, overflow:'hidden' }}>
                              <span style={{ display:'flex', alignItems:'center', gap:4, overflow:'hidden' }}>
                                <span style={{ fontSize:12, fontWeight:800, color: optZero ? '#94a3b8' : '#334155', flexShrink:0 }}>{opt.name}</span>
                                {opt.size && opt.size !== 'FREE' && (
                                  <span style={{ fontSize:10, fontWeight:800, color:'#854d0e', background:'#fef9c3', padding:'0px 5px', borderRadius:4, flexShrink:0 }}>
                                    {opt.size}
                                  </span>
                                )}
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
                      <button onClick={() => setChannelPriceTarget(p)}
                        style={{
                          display:'inline-flex', alignItems:'center', gap:4,
                          fontSize:12, fontWeight:800,
                          color: p.channel_prices.length > 0 ? '#059669' : '#2563eb',
                          background: p.channel_prices.length > 0 ? '#ecfdf5' : '#eff6ff',
                          border:'none', borderRadius:8, padding:'6px 10px', cursor:'pointer',
                        }}>
                        <Store size={12}/>
                        {p.channel_prices.length > 0 ? `판매가 ${p.channel_prices.length}건` : '쇼핑몰판매가'}
                      </button>
                    </td>

                    {/* 쇼핑몰 등록현황 */}
                    <td style={{ paddingTop:10, paddingBottom:10, overflow:'visible' }}>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4, maxWidth:160 }}>
                        {(() => {
                          // Supabase registered_malls + localStorage 매핑 병합
                          const fromSupabase = (p.registered_malls ?? []).map(m => typeof m === 'string' ? m : m.mall)
                          const fromLocal = localMallsMap[p.id] ?? []
                          const merged = [...new Set([...fromSupabase, ...fromLocal])]
                          if (merged.length === 0) return <span style={{ fontSize:11, color:'#cbd5e1', fontWeight:600 }}>-</span>
                          return merged.map((mallName, mi) => {
                          const mallData = (p.registered_malls ?? []).find(m => (typeof m === 'string' ? m : m.mall) === mallName)
                          // Supabase registered_malls 코드 우선, 없으면 localStorage mall_product_id 사용
                          const mallCode = (mallData && typeof mallData === 'object' ? (mallData.code || '') : '')
                            || (localMallCodesMap[p.id]?.[mallName] ?? '')
                          const abbrMap: Record<string,string> = {
                            '쿠팡':    '쿠팡',
                            '네이버':  '네이버',
                            '스마트스토어': '스마트',
                            '11번가':  '11번',
                            '에이블리':'에이블',
                            '지그재그':'지그재',
                            'G마켓':   'G마켓',
                            '옥션':    '옥션',
                          }
                          const abbr = abbrMap[mallName] ?? mallName.replace(/\s/g,'').slice(0,2)
                          const colors: Record<string,{bg:string;color:string}> = {
                            '쿠팡':    { bg:'#fff7ed', color:'#c2410c' },
                            '네이버':  { bg:'#f0fdf4', color:'#15803d' },
                            '스마트스토어': { bg:'#f0fdf4', color:'#15803d' },
                            '11번가':  { bg:'#fff1f2', color:'#be123c' },
                            '에이블리':{ bg:'#fdf4ff', color:'#7e22ce' },
                            '지그재그':{ bg:'#eff6ff', color:'#2563eb' },
                            'G마켓':   { bg:'#fefce8', color:'#854d0e' },
                            '옥션':    { bg:'#f0fdf4', color:'#166534' },
                          }
                          const cs = colors[mallName] ?? { bg:'#f1f5f9', color:'#475569' }
                          const badgeKey = `${p.id}-${mi}`
                          const isHovered = hoveredBadge === badgeKey
                          return (
                            <div
                              key={mi}
                              style={{ position:'relative', display:'inline-block', flexShrink:0 }}
                              onMouseEnter={() => setHoveredBadge(badgeKey)}
                              onMouseLeave={() => setHoveredBadge(null)}
                            >
                              <span
                                style={{
                                  display:'inline-flex', alignItems:'center', justifyContent:'center',
                                  minWidth:28, height:22, borderRadius:5, fontSize:10, fontWeight:900,
                                  padding:'0 5px',
                                  background:cs.bg, color:cs.color,
                                  border:`1px solid ${cs.color}33`, cursor:'default',
                                }}
                              >
                                {abbr}
                              </span>
                              {isHovered && (
                                /* 뱃지와 툴팁 사이 틈을 투명 패딩으로 메워 마우스 이탈 방지 */
                                <div style={{
                                  position:'absolute', bottom:'100%', left:'50%',
                                  transform:'translateX(-50%)',
                                  paddingBottom:6, zIndex:9999,
                                  pointerEvents:'auto',
                                }}>
                                  <div style={{
                                    background:'#1e293b', borderRadius:7,
                                    padding:'6px 10px',
                                    boxShadow:'0 4px 12px rgba(0,0,0,0.25)',
                                    minWidth:120, textAlign:'center',
                                  }}>
                                    <div style={{ fontSize:9, color:'#94a3b8', fontWeight:700, marginBottom:3, whiteSpace:'nowrap' }}>
                                      {mallName}
                                    </div>
                                    <div style={{
                                      fontFamily:'monospace', fontSize:11.5, fontWeight:700,
                                      color: mallCode ? '#e2e8f0' : '#475569',
                                      userSelect:'text', cursor:'text',
                                      whiteSpace:'nowrap',
                                    }}>
                                      {mallCode || '코드 없음'}
                                    </div>
                                    {mallCode && (
                                      <div style={{ fontSize:9, color:'#64748b', marginTop:3, whiteSpace:'nowrap' }}>
                                        드래그하여 복사
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })
                      })()}
                      </div>
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
                        <MgmtBtn onClick={() => setMappingTarget(p)} bg="#eff6ff" color="#2563eb" hoverBg="#dbeafe"><Store size={11}/>매핑</MgmtBtn>
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
      </div>}

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

      {/* ── 이미지 마이그레이션 결과 모달 ── */}
      {migrateResult && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:14, padding:'28px 32px', minWidth:360, maxWidth:480, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
              📦 이미지 Storage 이전
              {migrating && <span style={{ display:'inline-block', width:14, height:14, border:'2.5px solid #e2e8f0', borderTopColor:'#f59e0b', borderRadius:'50%', animation:'spin-slow 0.7s linear infinite' }}/>}
            </div>
            {/* 진행 바 */}
            <div style={{ background:'#f1f5f9', borderRadius:8, height:10, marginBottom:12, overflow:'hidden' }}>
              <div style={{
                height:'100%', borderRadius:8, background: migrateResult.finished ? '#10b981' : '#f59e0b',
                width: migrateResult.total > 0 ? `${Math.round(migrateResult.done / migrateResult.total * 100)}%` : '0%',
                transition:'width 0.4s',
              }}/>
            </div>
            <div style={{ fontSize:13, color:'#475569', lineHeight:2, marginBottom:16 }}>
              <div>전체 상품: <b>{migrateResult.total}</b>개</div>
              <div>처리 완료: <b>{migrateResult.done}</b>개</div>
              <div style={{ color:'#10b981' }}>✅ Storage 이전 성공: <b>{migrateResult.migrated}</b>개 이미지</div>
              {migrateResult.errors > 0 && <div style={{ color:'#ef4444' }}>⚠️ 오류 건수: <b>{migrateResult.errors}</b>개</div>}
            </div>
            {migrateResult.finished
              ? <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => setMigrateResult(null)}
                    style={{ flex:1, padding:'10px 0', borderRadius:8, background:'#10b981', color:'white', border:'none', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                    완료 (닫기)
                  </button>
                </div>
              : <div style={{ fontSize:12, color:'#94a3b8', textAlign:'center' }}>
                  처리 중입니다. 창을 닫지 마세요...
                </div>
            }
          </div>
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
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8 }}>
                    <div>
                      <Label>옵션코드 (영문)</Label>
                      <Input placeholder="BE" value={opt.name}
                        onChange={e => {
                          const val = e.target.value
                          const auto = getKoreanColor(val)
                          const o=[...form.options]
                          // 바코드가 이전 자동생성값과 같으면 새 코드로 재생성, 아니면 수동수정 유지
                          const prevAuto = genBarcode(form.code, o[i].name)
                          const keepBarcode = o[i].barcode && o[i].barcode !== prevAuto
                          o[i]={...o[i], name:val, korean_name: auto || o[i].korean_name, barcode: keepBarcode ? o[i].barcode : genBarcode(form.code,val)}
                          setForm(f=>({...f,options:o}))
                        }}
                      />
                    </div>
                    <div>
                      <Label>사이즈</Label>
                      <Input placeholder="FREE" value={opt.size ?? 'FREE'}
                        style={{ background: (opt.size && opt.size !== 'FREE') ? '#fef9c3' : '#fafbfc' }}
                        onChange={e => { const o=[...form.options];o[i]={...o[i],size:e.target.value};setForm(f=>({...f,options:o}))}}
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
                        onChange={e => {
                          const o=[...form.options];o[i]={...o[i],chinese_name:e.target.value}
                          setForm(f=>({...f,options:o}))
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>바코드 (자동생성, 직접 수정 가능)</Label>
                    <Input
                      value={opt.barcode || genBarcode(form.code, opt.name)}
                      placeholder={genBarcode(form.code, opt.name)}
                      style={{ fontFamily:'monospace', fontSize:12 }}
                      onChange={e => { const o=[...form.options];o[i]={...o[i],barcode:e.target.value};setForm(f=>({...f,options:o}))}}
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

          {/* 홍보문구 */}
          <div style={{ marginTop:16 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#7c3aed', paddingBottom:6, borderBottom:'1px solid #f5f3ff', marginBottom:10 }}>
              📣 홍보문구
            </p>
            <textarea
              value={form.promo_text ?? ''}
              onChange={e => setForm(f => ({ ...f, promo_text: e.target.value }))}
              placeholder="예) 고급 PU 소재, 가볍고 실용적인 데일리백! 지금 구매하면 무료배송 🎁"
              style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:13, outline:'none', resize:'vertical', minHeight:64, lineHeight:1.6 }}
            />
            <p style={{ fontSize:10.5, color:'#94a3b8', fontWeight:600, marginTop:4 }}>쇼핑몰 상품 노출 시 사용되는 짧은 홍보 문구입니다.</p>
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
      {/* ── 쇼핑몰 매핑 모달 ── */}
      {mappingTarget && (
        <MallMappingModal product={mappingTarget} onClose={() => setMappingTarget(null)} onSave={handleMappingSave} />
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
                  const discount = cp.tag_price && cp.tag_price > cp.price
                    ? Math.round((1 - cp.price / cp.tag_price) * 100) : null
                  return (
                    <div key={cp.channel} style={{ background:cs.bg, borderRadius:10, padding:'10px 12px' }}>
                      <p style={{ fontSize:10.5, fontWeight:800, color:cs.color }}>{cp.channel}</p>
                      {cp.tag_price && (
                        <p style={{ fontSize:11, fontWeight:700, color:'#94a3b8', marginTop:4, textDecoration:'line-through' }}>
                          🏷️ {formatCurrency(cp.tag_price)}
                          {discount !== null && (
                            <span style={{ marginLeft:4, fontSize:10, fontWeight:800, color:'#7c3aed', textDecoration:'none' }}>
                              -{discount}%
                            </span>
                          )}
                        </p>
                      )}
                      <p style={{ fontSize:16, fontWeight:900, color:'#1e293b', marginTop:cp.tag_price ? 2 : 3 }}>{formatCurrency(cp.price)}</p>
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
                            reader.onload = async ev => {
                              const raw        = ev.target?.result as string ?? ''
                              const compressed = await compressImage(raw)
                              // Storage 업로드 시도 (isEdit.id 있으므로 경로 확정 가능)
                              const path = `${isEdit.id}/${i}_${Date.now()}.jpg`
                              const url  = await uploadToStorage(compressed, path)
                              const final = url ?? compressed
                              setEditForm(f => f ? ({ ...f, options: f.options.map((o, j) => j===i ? {...o, image:final} : o) }) : f)
                            }
                            reader.readAsDataURL(file)
                          }}
                        />
                      </label>
                    </div>
                    {/* 옵션명 + 사이즈 + 한글명 + 중국명 */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8 }}>
                      <div>
                        <Label>옵션코드 (영문)</Label>
                        <Input placeholder="BE" value={opt.name}
                          onChange={e => {
                            const nm = e.target.value
                            const auto = getKoreanColor(nm)
                            setEditForm(f => {
                              if (!f) return f
                              return { ...f, options: f.options.map((o, j) => {
                                if (j !== i) return o
                                const prevAuto = genBarcode(f.code, o.name)
                                const keepBarcode = o.barcode && o.barcode !== prevAuto
                                return { ...o, name: nm, korean_name: auto || o.korean_name, barcode: keepBarcode ? o.barcode : genBarcode(f.code, nm) }
                              }) }
                            })
                          }}
                        />
                      </div>
                      <div>
                        <Label>사이즈</Label>
                        <Input placeholder="FREE" value={opt.size ?? 'FREE'}
                          style={{ background: (opt.size && opt.size !== 'FREE') ? '#fef9c3' : '#fafbfc' }}
                          onChange={e => setEditForm(f => f ? ({ ...f, options: f.options.map((o, j) => j===i ? {...o, size:e.target.value} : o) }) : f)}
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
                      <Label>바코드 (자동생성, 직접 수정 가능)</Label>
                      <Input
                        value={opt.barcode || genBarcode(editForm.code, opt.name)}
                        placeholder={genBarcode(editForm.code, opt.name)}
                        style={{ fontFamily:'monospace', fontSize:12 }}
                        onChange={e => setEditForm(f => f ? ({ ...f, options: f.options.map((o, j) => j===i ? {...o, barcode:e.target.value} : o) }) : f)}
                      />
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
              <button onClick={() => setEditForm(f => f ? ({ ...f, options:[...f.options,{name:'',size:'FREE',korean_name:'',chinese_name:'',barcode:'',image:'',ordered:0,received:0,sold:0,current_stock:0,defective:0}] }) : f)}
                style={{ fontSize:12,fontWeight:800,color:'#2563eb',background:'#eff6ff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
                <Plus size={12}/>옵션 추가
              </button>
            </div>

            {/* 홍보문구 */}
            <div style={{ marginTop:16 }}>
              <p style={{ fontSize:12, fontWeight:800, color:'#7c3aed', paddingBottom:6, borderBottom:'1px solid #f5f3ff', marginBottom:10 }}>
                📣 홍보문구
              </p>
              <textarea
                value={editForm.promo_text ?? ''}
                onChange={e => setEditForm(f => f ? ({ ...f, promo_text: e.target.value }) : f)}
                placeholder="예) 고급 PU 소재, 가볍고 실용적인 데일리백! 지금 구매하면 무료배송 🎁"
                style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:13, outline:'none', resize:'vertical', minHeight:64, lineHeight:1.6 }}
              />
              <p style={{ fontSize:10.5, color:'#94a3b8', fontWeight:600, marginTop:4 }}>쇼핑몰 상품 노출 시 사용되는 짧은 홍보 문구입니다.</p>
            </div>

          </div>

          {editSaveError && (
            <div style={{ marginTop:12, padding:'8px 12px', background:'#fff1f2', borderRadius:7, fontSize:12, color:'#dc2626', fontWeight:700 }}>
              저장 오류: {editSaveError}
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
            <Button variant="outline" onClick={() => { setIsEdit(null); setEditForm(null); setEditSaving(false); setEditSaveError('') }}>취소</Button>
            <Button onClick={handleEditSave} disabled={editSaving} style={{ opacity: editSaving ? 0.6 : 1 }}>
              {editSaving ? '저장 중...' : '저장하기'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── 기본정보 입력 팝업 (상품명 클릭) ── */}
      {basicInfoTarget && (() => {
        const bi = basicInfoForm
        const setBi = (k: keyof BasicInfo, v: string) => setBasicInfoForm(f => ({ ...f, [k]: v }))
        const selStyle = { width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none', background:'white' } as React.CSSProperties
        const badge = (text: string, color = '#2563eb', bg = '#eff6ff') => (
          <span style={{ marginLeft:4, fontSize:9.5, fontWeight:700, background:bg, color, padding:'1px 5px', borderRadius:4 }}>{text}</span>
        )
        const TABS: { key: typeof basicInfoTab; label: string; icon: string }[] = [
          { key:'basic',   label:'기본정보',   icon:'📦' },
          { key:'price',   label:'가격정보',   icon:'💰' },
          { key:'fashion', label:'패션정보',   icon:'👗' },
          { key:'notice',  label:'상품고시',   icon:'⚖️' },
          { key:'policy',  label:'배송/정책',  icon:'🚚' },
        ]
        return (
        <Modal isOpen onClose={() => setBasicInfoTarget(null)} title={`상품 등록정보 입력 — ${basicInfoTarget.name}`} size="xl">
          {/* 단계 안내 */}
          <div style={{ display:'flex', gap:0, background:'#f8fafc', borderRadius:10, overflow:'hidden', marginBottom:14, border:'1px solid #e2e8f0' }}>
            {TABS.map((t, i) => {
              const active = basicInfoTab === t.key
              return (
                <button key={t.key} onClick={() => setBasicInfoTab(t.key)}
                  style={{ flex:1, padding:'9px 4px', border:'none', cursor:'pointer', borderRight: i < TABS.length-1 ? '1px solid #e2e8f0' : 'none',
                    background: active ? '#7e22ce' : 'white',
                    transition:'all 150ms ease' }}>
                  <div style={{ fontSize:15 }}>{t.icon}</div>
                  <div style={{ fontSize:10.5, fontWeight:800, color: active ? 'white' : '#64748b', marginTop:2, whiteSpace:'nowrap' }}>{t.label}</div>
                </button>
              )
            })}
          </div>

          {/* ── TAB 1: 기본정보 ── */}
          {basicInfoTab === 'basic' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <Label>상품 타이틀 * <span style={{ fontSize:10, color:'#94a3b8', fontWeight:500 }}>(쇼핑몰 노출 상품명)</span></Label>
                <Input placeholder="쇼핑몰에 등록될 상품명" value={bi.title}
                  onChange={e => setBi('title', e.target.value)}
                  style={{ border: !bi.title ? '1.5px solid #fca5a5' : undefined }}/>
              </div>
              {([
                { k:'brand'        as const, l:'브랜드',    p:'브랜드명',             b:'' },
                { k:'model_name'   as const, l:'모델명',    p:'모델번호 / 자체코드',   b:'스마트스토어·쿠팡' },
                { k:'origin'       as const, l:'원산지',    p:'예) 중국',             b:'' },
                { k:'manufacturer' as const, l:'제조사',    p:'제조사명',             b:'' },
                { k:'material'     as const, l:'소재/재질', p:'예) 폴리에스터 100%', b:'' },
                { k:'color'        as const, l:'색상',      p:'예) 블랙, 베이지',     b:'패션필수' },
              ]).map(({k,l,p,b}) => (
                <div key={k}>
                  <Label>{l}{b && badge(b)}</Label>
                  <Input placeholder={p} value={bi[k]} onChange={e => setBi(k, e.target.value)}/>
                </div>
              ))}
              <div style={{ gridColumn:'1/-1' }}>
                <Label>상세 설명 <span style={{ fontSize:9.5, color:'#94a3b8' }}>(HTML 가능)</span></Label>
                <textarea value={bi.description} onChange={e => setBi('description', e.target.value)}
                  placeholder="상품 상세 설명 (쇼핑몰 노출)"
                  style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:13, outline:'none', resize:'vertical', minHeight:72 }}/>
              </div>
            </div>
          )}

          {/* ── TAB 2: 가격정보 ── */}
          {basicInfoTab === 'price' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              <div>
                <Label>판매가 {badge('필수','#dc2626','#fee2e2')}</Label>
                <Input placeholder="0" type="number" value={bi.sale_price} onChange={e => setBi('sale_price', e.target.value)}/>
                <p style={{ fontSize:10.5, color:'#94a3b8', marginTop:3 }}>실제 쇼핑몰 판매 가격</p>
              </div>
              <div>
                <Label>정상가 <span style={{ fontSize:9.5, color:'#94a3b8' }}>(할인 전)</span></Label>
                <Input placeholder="0" type="number" value={bi.original_price} onChange={e => setBi('original_price', e.target.value)}/>
                <p style={{ fontSize:10.5, color:'#94a3b8', marginTop:3 }}>할인 전 원래 가격</p>
              </div>
              <div>
                <Label>공급가 <span style={{ fontSize:9.5, color:'#94a3b8' }}>(도매가)</span></Label>
                <Input placeholder="0" type="number" value={bi.supply_price} onChange={e => setBi('supply_price', e.target.value)}/>
                <p style={{ fontSize:10.5, color:'#94a3b8', marginTop:3 }}>매입 원가</p>
              </div>
              {bi.sale_price && bi.original_price && Number(bi.original_price) > 0 && (
                <div style={{ gridColumn:'1/-1', background:'#f0fdf4', borderRadius:10, padding:'10px 14px', border:'1px solid #bbf7d0' }}>
                  <p style={{ fontSize:12, fontWeight:800, color:'#15803d' }}>
                    할인율: <b style={{ fontSize:15 }}>{Math.round((1 - Number(bi.sale_price)/Number(bi.original_price)) * 100)}%</b>
                    {' '}<span style={{ color:'#94a3b8', fontWeight:500 }}>({Number(bi.original_price).toLocaleString()}원 → {Number(bi.sale_price).toLocaleString()}원)</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: 패션정보 ── */}
          {basicInfoTab === 'fashion' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <Label>성별</Label>
                <select value={bi.gender} onChange={e => setBi('gender', e.target.value)} style={selStyle}>
                  <option value="">선택안함</option>
                  <option value="여성">여성</option><option value="남성">남성</option>
                  <option value="공용">공용</option><option value="아동">아동</option>
                </select>
              </div>
              <div>
                <Label>시즌</Label>
                <select value={bi.season} onChange={e => setBi('season', e.target.value)} style={selStyle}>
                  <option value="">선택안함</option>
                  <option value="SS">SS (봄/여름)</option><option value="FW">FW (가을/겨울)</option><option value="4S">사계절</option>
                </select>
              </div>
              <div>
                <Label>연령대</Label>
                <select value={bi.age_group} onChange={e => setBi('age_group', e.target.value)} style={selStyle}>
                  <option value="">선택안함</option>
                  <option value="10대">10대</option><option value="20대">20대</option>
                  <option value="30대">30대</option><option value="40대 이상">40대 이상</option><option value="전연령">전연령</option>
                </select>
              </div>
              <div>
                <Label>핏</Label>
                <select value={bi.fit} onChange={e => setBi('fit', e.target.value)} style={selStyle}>
                  <option value="">선택안함</option>
                  <option value="루즈핏">루즈핏</option><option value="오버핏">오버핏</option>
                  <option value="레귤러핏">레귤러핏</option><option value="슬림핏">슬림핏</option>
                </select>
              </div>
              <div>
                <Label>두께</Label>
                <select value={bi.thickness} onChange={e => setBi('thickness', e.target.value)} style={selStyle}>
                  <option value="">선택안함</option>
                  <option value="얇음">얇음</option><option value="보통">보통</option><option value="두꺼움">두꺼움</option>
                </select>
              </div>
              <div>
                <Label>신축성</Label>
                <select value={bi.elasticity} onChange={e => setBi('elasticity', e.target.value)} style={selStyle}>
                  <option value="">선택안함</option>
                  <option value="없음">없음</option><option value="약간 있음">약간 있음</option><option value="있음">있음</option>
                </select>
              </div>
              <div>
                <Label>비침</Label>
                <select value={bi.transparency} onChange={e => setBi('transparency', e.target.value)} style={selStyle}>
                  <option value="">선택안함</option>
                  <option value="없음">없음</option><option value="약간 있음">약간 있음</option><option value="있음">있음</option>
                </select>
              </div>
              <div>
                <Label>세탁방법</Label>
                <select value={bi.wash_method} onChange={e => setBi('wash_method', e.target.value)} style={selStyle}>
                  <option value="">선택안함</option>
                  <option value="손세탁">손세탁</option><option value="세탁기">세탁기 사용 가능</option>
                  <option value="드라이클리닝">드라이클리닝</option><option value="세탁기 불가">세탁기 사용불가</option>
                </select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <Label>취급 주의 <span style={{ fontSize:9.5, color:'#94a3b8' }}>(세탁·보관 방법 등 상세 내용)</span></Label>
                <Input placeholder="예) 30°C 이하 손세탁, 직사광선 피해 보관" value={bi.handling} onChange={e => setBi('handling', e.target.value)}/>
              </div>
            </div>
          )}

          {/* ── TAB 4: 상품고시 (의류 법적 필수) ── */}
          {basicInfoTab === 'notice' && (
            <div>
              <div style={{ background:'#fffbeb', borderRadius:10, padding:'10px 14px', marginBottom:12, border:'1px solid #fde68a', fontSize:11.5, color:'#92400e', fontWeight:600 }}>
                ⚠️ 의류·가방·잡화 판매 시 전자상거래법 상 <b>법적으로 필수</b> 기재 사항입니다. 미기재 시 쇼핑몰 등록 거절 또는 패널티 발생 가능합니다.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {([
                  { k:'notice_material'     as const, l:'소재',      p:'예) 폴리에스터 100%',         b:'필수' },
                  { k:'notice_color'        as const, l:'색상',      p:'예) 블랙, 아이보리',           b:'필수' },
                  { k:'notice_size'         as const, l:'치수',      p:'예) 가로30×세로25×높이15cm', b:'필수' },
                  { k:'notice_manufacturer' as const, l:'제조자',    p:'제조사명',                    b:'' },
                  { k:'notice_country'      as const, l:'제조국',    p:'예) 중국',                    b:'필수' },
                  { k:'notice_wash'         as const, l:'세탁방법',  p:'예) 손세탁 권장',             b:'' },
                  { k:'notice_year_month'   as const, l:'제조연월',  p:'예) 2024.01',                b:'' },
                  { k:'notice_warranty'     as const, l:'품질보증',  p:'예) 구매일로부터 1년',        b:'' },
                  { k:'notice_as'           as const, l:'A/S 책임자', p:'고객센터 번호',              b:'필수' },
                ]).map(({k,l,p,b}) => (
                  <div key={k}>
                    <Label>{l}{b && badge(b,'#dc2626','#fee2e2')}</Label>
                    <Input placeholder={p} value={bi[k]} onChange={e => setBi(k, e.target.value)}/>
                  </div>
                ))}
                <div style={{ gridColumn:'1/-1' }}>
                  <Label>법적 고시 전문 <span style={{ fontSize:9.5, color:'#94a3b8' }}>(위 항목을 통합 입력하거나 추가 내용)</span></Label>
                  <textarea value={bi.legal_notice} onChange={e => setBi('legal_notice', e.target.value)}
                    placeholder="예) 소재: 폴리에스터 100% / 치수: 가로30×세로25cm / 색상: 블랙 / 제조국: 중국"
                    style={{ width:'100%', border:'1px solid #fde68a', borderRadius:8, padding:'8px 10px', fontSize:13, outline:'none', resize:'vertical', minHeight:52, background:'#fffbeb' }}/>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 5: 배송/정책 ── */}
          {basicInfoTab === 'policy' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <Label>배송비</Label>
                <select value={bi.shipping_fee} onChange={e => setBi('shipping_fee', e.target.value)} style={selStyle}>
                  <option value="">선택안함</option>
                  <option value="무료">무료배송</option>
                  <option value="유료_3000">유료 3,000원</option>
                  <option value="유료_5000">유료 5,000원</option>
                  <option value="조건부">조건부 무료 (3만원 이상)</option>
                </select>
              </div>
              <div>
                <Label>택배사</Label>
                <select value={bi.courier} onChange={e => setBi('courier', e.target.value)} style={selStyle}>
                  <option value="">선택안함</option>
                  <option value="CJ대한통운">CJ대한통운</option><option value="롯데택배">롯데택배</option>
                  <option value="한진택배">한진택배</option><option value="우체국택배">우체국택배</option>
                  <option value="로젠택배">로젠택배</option>
                </select>
              </div>
              <div>
                <Label>출고지</Label>
                <Input placeholder="예) 서울특별시 강남구" value={bi.shipping_origin} onChange={e => setBi('shipping_origin', e.target.value)}/>
              </div>
              <div>
                <Label>배송기간</Label>
                <select value={bi.shipping_days} onChange={e => setBi('shipping_days', e.target.value)} style={selStyle}>
                  <option value="">선택안함</option>
                  <option value="당일발송">당일 발송</option>
                  <option value="1~2일">1~2일 이내</option>
                  <option value="2~3일">2~3일 이내</option>
                  <option value="3~5일">3~5일 이내</option>
                </select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <Label>A/S 안내 {badge('스마트스토어 필수')}</Label>
                <Input placeholder="예) 제품 이상 시 고객센터 문의 (02-0000-0000)" value={bi.as_info} onChange={e => setBi('as_info', e.target.value)}/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <Label>교환/반품 정책</Label>
                <textarea value={bi.return_policy} onChange={e => setBi('return_policy', e.target.value)}
                  placeholder="예) 수령 후 7일 이내 교환·반품 가능. 단, 착용·세탁 후 반품 불가."
                  style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:13, outline:'none', resize:'vertical', minHeight:64 }}/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <Label>비고 <span style={{ fontSize:9.5, color:'#94a3b8' }}>(내부 메모용)</span></Label>
                <Input placeholder="기타 메모" value={bi.notes} onChange={e => setBi('notes', e.target.value)}/>
              </div>
            </div>
          )}

          {/* 하단 버튼 */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, marginTop:20, paddingTop:14, borderTop:'1px solid #f1f5f9' }}>
            <p style={{ fontSize:11, color:'#94a3b8' }}>
              {basicInfoTarget.basic_info ? '✏️ 기존 정보가 있습니다. 수정 후 저장하세요.' : '🆕 처음 입력합니다. 저장 시 전송준비로 변경됩니다.'}
            </p>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="outline" onClick={() => setBasicInfoTarget(null)}>취소</Button>
              <Button variant="outline" onClick={handleBasicInfoUpdate} disabled={basicInfoSaving}
                style={{ borderColor:'#0ea5e9', color:'#0ea5e9', opacity: basicInfoSaving ? 0.6 : 1 }}>
                {basicInfoSaving ? '저장 중...' : '✏️ 수정'}
              </Button>
              <Button onClick={handleBasicInfoSave} disabled={basicInfoSaving || !basicInfoForm.title}
                style={{ background:'#7e22ce', borderColor:'#7e22ce', opacity: basicInfoSaving || !basicInfoForm.title ? 0.6 : 1 }}>
                {basicInfoSaving ? '저장 중...' : '저장 (전송준비로 변경)'}
              </Button>
            </div>
          </div>
        </Modal>
        )
      })()}
    </div>
  )
}
