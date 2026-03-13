'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { RefreshCw, Settings, Zap, Plus, CheckCircle2, Unlink, Tag, Truck, Search, X, BookOpen } from 'lucide-react'

/* ─── 전체 쇼핑몰 정의 ────────────────────────────────────────── */
const ALL_MALLS = [
  { key:'coupang',    name:'쿠팡',              domain:'coupang.com',           color:'from-orange-400 to-orange-600' },
  { key:'naver',      name:'스마트스토어',        domain:'smartstore.naver.com',  color:'from-green-400 to-green-600' },
  { key:'11st',       name:'11번가',             domain:'11st.co.kr',            color:'from-red-400 to-red-600' },
  { key:'gmarket',    name:'지마켓',             domain:'gmarket.co.kr',         color:'from-blue-400 to-blue-600' },
  { key:'auction',    name:'옥션',               domain:'auction.co.kr',         color:'from-yellow-400 to-yellow-600' },
  { key:'ablly',      name:'에이블리',            domain:'a-bly.com',             color:'from-pink-400 to-pink-600' },
  { key:'zigzag',     name:'지그재그',            domain:'zigzag.kr',             color:'from-purple-400 to-purple-600' },
  { key:'alwayz',     name:'올웨이즈',            domain:'alwayz.co',             color:'from-teal-400 to-teal-600' },
  { key:'cafe24',     name:'카페24',              domain:'cafe24.com',            color:'from-indigo-400 to-indigo-600' },
  { key:'fashionplus',name:'패션플러스',           domain:'fashionplus.co.kr',     color:'from-rose-400 to-rose-600' },
  { key:'halfclub',   name:'하프클럽',            domain:'halfclub.com',          color:'from-amber-400 to-amber-600' },
  { key:'gsshop',     name:'GS SHOP',            domain:'gsshop.com',            color:'from-lime-400 to-lime-600' },
  { key:'jasondeal',  name:'제이슨딜',            domain:'jasondeal.com',         color:'from-cyan-400 to-cyan-600' },
  { key:'lotteon',    name:'롯데온',              domain:'lotteon.com',           color:'from-red-500 to-red-700' },
  { key:'ssg',        name:'SSG.COM',            domain:'ssg.com',               color:'from-orange-500 to-red-500' },
  { key:'toss',       name:'토스쇼핑',            domain:'shop.toss.im',          color:'from-blue-500 to-indigo-600' },
]

/* ─── 쇼핑몰별 배송정보 기본틀 ───────────────────────────────── */
const DELIVERY_TEMPLATE = {
  method:         '',   // 배송방법 (택배/직배/퀵 등)
  fee_type:       '',   // 배송비 유형 (무료/유료/조건부무료)
  base_fee:       '',   // 기본 배송비
  free_threshold: '',   // 무료배송 기준금액
  jeju_fee:       '',   // 제주 추가배송비
  island_fee:     '',   // 도서산간 추가배송비
  return_fee:     '',   // 반품 배송비
  exchange_fee:   '',   // 교환 배송비
  lead_days:      '',   // 배송기간 (영업일)
  courier:        '',   // 택배사
  warehouse:      '',   // 출고지
  return_addr:    '',   // 반품지
}

/* ─── 쇼핑몰별 카테고리 예시 (검색용) ──────────────────────────── */
const MALL_CATS: Record<string, string[]> = {
  coupang:    ['패션의류 > 여성의류', '패션의류 > 남성의류', '패션잡화 > 가방', '패션잡화 > 지갑', '패션잡화 > 모자', '스포츠/레저 > 스포츠의류'],
  naver:      ['패션의류 > 여성의류 > 원피스', '패션의류 > 여성의류 > 블라우스', '패션잡화 > 가방 > 숄더백', '패션잡화 > 가방 > 크로스백', '패션잡화 > 가방 > 백팩'],
  '11st':     ['여성의류', '남성의류', '가방/잡화', '스포츠/아웃도어'],
  gmarket:    ['여성패션', '남성패션', '가방/잡화', '스포츠/레저'],
  auction:    ['여성의류', '남성의류', '잡화/가방', '스포츠용품'],
  ablly:      ['아우터', '상의', '하의', '원피스/스커트', '가방/지갑', '주얼리/액세서리'],
  zigzag:     ['아우터', '상의', '하의', '원피스', '가방', '신발', '액세서리'],
  alwayz:     ['의류', '패션잡화', '가방', '신발'],
  cafe24:     ['상의', '하의', '아우터', '원피스', '가방', '잡화'],
  fashionplus:['아우터', '상의', '하의', '원피스/치마', '가방/잡화'],
  halfclub:   ['여성의류', '남성의류', '가방/잡화', '아동의류'],
  gsshop:     ['패션의류', '패션잡화', '스포츠'],
  jasondeal:  ['의류', '패션잡화'],
  lotteon:    ['패션의류', '패션잡화', '스포츠/레저'],
  ssg:        ['패션의류 > 여성의류', '패션의류 > 남성의류', '패션잡화 > 가방'],
  toss:       ['패션의류', '패션잡화'],
}

/* ─── 쇼핑몰별 API 입력 필드 정의 ───────────────────────────── */
type ApiField = { key: string; label: string; placeholder: string; type: 'text'|'password' }

const MALL_API_FIELDS: Record<string, ApiField[]> = {
  cafe24: [
    { key:'seller_id',     label:'쇼핑몰 ID',     placeholder:'카페24 쇼핑몰 ID',        type:'text' },
    { key:'api_secret',    label:'패스워드',       placeholder:'카페24 관리자 패스워드',   type:'password' },
    { key:'site_name',     label:'사이트명',       placeholder:'예) myshop (영문)',        type:'text' },
    { key:'refresh_token', label:'Refresh Token', placeholder:'OAuth Refresh Token 입력', type:'password' },
    { key:'access_key',    label:'Access Key',    placeholder:'발급받은 Access Key 입력', type:'password' },
  ],
}

const DEFAULT_API_FIELDS: ApiField[] = [
  { key:'seller_id',  label:'판매자 ID / 계정', placeholder:'판매자 ID 또는 이메일', type:'text' },
  { key:'api_key',    label:'API Key',          placeholder:'API Key 입력',          type:'password' },
  { key:'api_secret', label:'API Secret',       placeholder:'API Secret 입력',       type:'password' },
]

/* ─── 쇼핑몰 연동방법 안내 가이드 ────────────────────────────── */
const MALL_GUIDES: Record<string, { title:string; steps:string[]; links:{label:string; url:string}[] }> = {
  cafe24: {
    title: '카페24 API 연동 방법',
    steps: [
      '① 카페24 관리자 센터(admin.cafe24.com)에 로그인합니다.',
      '② 상단 메뉴에서 [앱스토어] → [개발자센터]로 이동합니다.',
      '③ [내 앱 관리] → [앱 만들기]를 클릭하여 새 앱을 생성합니다.',
      '④ 앱 기본 정보(이름, 설명)와 Redirect URL을 입력하고 저장합니다.',
      '⑤ 생성된 앱의 [클라이언트 아이디 / 시크릿]을 복사합니다.',
      '⑥ OAuth 2.0 인증 흐름으로 Authorization Code를 발급받습니다.',
      '  → https://{사이트명}.cafe24api.com/api/v2/oauth/authorize',
      '⑦ Authorization Code로 Access Token과 Refresh Token을 발급받습니다.',
      '  → POST https://{사이트명}.cafe24api.com/api/v2/oauth/token',
      '⑧ 발급된 쇼핑몰 ID, 패스워드, 사이트명, Refresh Token, Access Key를 위 입력란에 입력합니다.',
      '⑨ [저장하고 연동 시작]을 클릭하면 연동이 완료됩니다.',
    ],
    links: [
      { label:'카페24 개발자센터', url:'https://developers.cafe24.com' },
      { label:'API 문서',          url:'https://developers.cafe24.com/docs/api/admin' },
      { label:'OAuth 2.0 가이드',  url:'https://developers.cafe24.com/docs/api/admin/#oauth-2-0' },
    ],
  },
}

function openGuideWindow(key: string) {
  const guide = MALL_GUIDES[key]
  if (!guide) return
  const html = `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><title>${guide.title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Nanum Gothic', sans-serif; background: #f8fafc; color: #1e293b; padding: 40px 32px; max-width: 640px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 900; color: #1e293b; margin-bottom: 24px; padding-bottom: 14px; border-bottom: 2.5px solid #6366f1; }
  .steps { background: white; border-radius: 14px; padding: 24px 28px; box-shadow: 0 4px 20px rgba(0,0,0,0.07); margin-bottom: 24px; }
  .steps p { font-size: 14px; font-weight: 700; color: #334155; line-height: 1.9; padding: 4px 0; }
  .steps p:not(:last-child) { border-bottom: 1px dashed #f1f5f9; }
  .links { display: flex; flex-direction: column; gap: 10px; }
  .links a { display: inline-flex; align-items: center; gap: 8px; background: #6366f1; color: white; text-decoration: none; font-size: 13px; font-weight: 800; padding: 10px 18px; border-radius: 10px; }
  .links a:hover { background: #4f46e5; }
  .note { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px 16px; font-size: 12.5px; color: #92400e; font-weight: 700; margin-bottom: 20px; }
  h2 { font-size: 13px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
</style></head><body>
<h1>📋 ${guide.title}</h1>
<div class="note">💡 API 연동을 위해 카페24 판매자 계정과 개발자 앱이 필요합니다. 아래 단계를 순서대로 따라하세요.</div>
<div class="steps">
${guide.steps.map(s => `  <p>${s}</p>`).join('\n')}
</div>
<h2>🔗 관련 링크</h2>
<div class="links">
${guide.links.map(l => `  <a href="${l.url}" target="_blank">🔗 ${l.label}</a>`).join('\n')}
</div>
</body></html>`
  const w = window.open('', '_blank', 'width=700,height=680,scrollbars=yes,resizable=yes')
  if (w) { w.document.write(html); w.document.close() }
}

/* ─── 타입 ──────────────────────────────────────────────────── */
type MallCategory = { id:string; displayName:string; mallCat:string; code:string }
type DeliveryInfo = typeof DELIVERY_TEMPLATE
type ChannelData = {
  key:string; name:string; domain:string; color:string
  active:boolean; seller_id:string; api_key:string; api_secret:string
  site_name:string; refresh_token:string; access_key:string
  synced:number; orders:number
  categories: MallCategory[]
  delivery: DeliveryInfo
}

const STORAGE_KEY = 'pm_mall_channels_v2'

function makeChannel(mall: typeof ALL_MALLS[0]): ChannelData {
  return { ...mall, active:false, seller_id:'', api_key:'', api_secret:'', site_name:'', refresh_token:'', access_key:'', synced:0, orders:0, categories:[], delivery:{...DELIVERY_TEMPLATE} }
}

function loadChannels(): ChannelData[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (raw) return JSON.parse(raw)
  } catch {}
  return ALL_MALLS.map(makeChannel)
}
function saveChannels(channels: ChannelData[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(channels)) } catch {}
}

/* ─── 쇼핑몰 로고 컴포넌트 ──────────────────────────────────── */
function MallLogo({ domain, name, size=44 }: { domain:string; name:string; size?:number }) {
  const [err, setErr] = useState(false)
  return (
    <div style={{ width:size, height:size, borderRadius:size*0.3, background:'white', border:'1.5px solid rgba(0,0,0,0.08)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,0.10)' }}>
      {!err
        ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={name}
            style={{ width:size*0.62, height:size*0.62, objectFit:'contain' }}
            onError={() => setErr(true)}/>
        : <span style={{ fontSize:size*0.42 }}>🛒</span>
      }
    </div>
  )
}

/* ─── 메인 ───────────────────────────────────────────────────── */
export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelData[]>([])
  const [mounted, setMounted]   = useState(false)

  // 모달 상태
  const [addOpen, setAddOpen]           = useState(false)
  const [apiTarget, setApiTarget]       = useState<ChannelData|null>(null)
  const [mallInfoTarget, setMallInfoTarget] = useState<ChannelData|null>(null)
  const [mallInfoTab, setMallInfoTab]   = useState<'category'|'delivery'>('category')
  const [confirmDisconnect, setConfirmDisconnect] = useState<ChannelData|null>(null)

  // API 설정 폼
  const [apiForm, setApiForm] = useState({ seller_id:'', api_key:'', api_secret:'', site_name:'', refresh_token:'', access_key:'' })

  // 카테고리 폼
  const [catSearch, setCatSearch]   = useState('')
  const [catDisplay, setCatDisplay] = useState('')
  const [catCode, setCatCode]       = useState('')
  const [catSelected, setCatSelected] = useState('')

  // 배송정보 폼
  const [deliveryForm, setDeliveryForm] = useState<DeliveryInfo>({...DELIVERY_TEMPLATE})

  useEffect(() => {
    setChannels(loadChannels())
    setMounted(true)
  }, [])

  const update = (updated: ChannelData[]) => {
    setChannels(updated)
    saveChannels(updated)
  }

  const active = channels.filter(c => c.active)
  const totalOrders = active.reduce((s,c) => s+c.orders, 0)
  const totalSynced = active.reduce((s,c) => s+c.synced, 0)

  /* ── API 설정 열기/저장 ── */
  const openApi = (ch: ChannelData) => {
    setApiTarget(ch)
    setApiForm({ seller_id:ch.seller_id, api_key:ch.api_key, api_secret:ch.api_secret, site_name:ch.site_name||'', refresh_token:ch.refresh_token||'', access_key:ch.access_key||'' })
  }
  const saveApi = () => {
    if (!apiTarget) return
    const updated = channels.map(c => c.key===apiTarget.key ? { ...c, ...apiForm, active:true } : c)
    update(updated)
    setApiTarget(null)
  }

  /* ── 카테고리/배송정보 열기 ── */
  const openMallInfo = (ch: ChannelData) => {
    setMallInfoTarget(ch)
    setMallInfoTab('category')
    setDeliveryForm({...ch.delivery})
    setCatSearch(''); setCatDisplay(''); setCatCode(''); setCatSelected('')
  }

  /* ── 카테고리 추가 ── */
  const addCategory = () => {
    if (!mallInfoTarget || !catDisplay.trim()) return
    const cat: MallCategory = { id:String(Date.now()), displayName:catDisplay.trim(), mallCat:catSelected||catSearch, code:catCode.trim() }
    const updated = channels.map(c => c.key===mallInfoTarget.key ? { ...c, categories:[...c.categories, cat] } : c)
    update(updated)
    setMallInfoTarget(prev => prev ? { ...prev, categories:[...prev.categories, cat] } : prev)
    setCatSearch(''); setCatDisplay(''); setCatCode(''); setCatSelected('')
  }
  const removeCategory = (catId: string) => {
    if (!mallInfoTarget) return
    const updated = channels.map(c => c.key===mallInfoTarget.key ? { ...c, categories:c.categories.filter(ct=>ct.id!==catId) } : c)
    update(updated)
    setMallInfoTarget(prev => prev ? { ...prev, categories:prev.categories.filter(ct=>ct.id!==catId) } : prev)
  }

  /* ── 배송정보 저장 ── */
  const saveDelivery = () => {
    if (!mallInfoTarget) return
    const updated = channels.map(c => c.key===mallInfoTarget.key ? { ...c, delivery:deliveryForm } : c)
    update(updated)
    setMallInfoTarget(prev => prev ? { ...prev, delivery:deliveryForm } : prev)
    setMallInfoTab('category')
  }

  /* ── 연동 해제 ── */
  const handleDisconnect = (key: string) => {
    const updated = channels.map(c => c.key===key ? { ...c, active:false, seller_id:'', api_key:'', api_secret:'', synced:0, orders:0 } : c)
    update(updated)
    setConfirmDisconnect(null)
  }

  /* ── 추가할 쇼핑몰 목록 (비연동) ── */
  const availableMalls = channels.filter(c => !c.active)

  if (!mounted) return null

  return (
    <div className="pm-page space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:'연동 쇼핑몰', v:active.length+'개',   color:'#2563eb', bg:'#eff6ff' },
          { label:'오늘 주문',   v:totalOrders+'건',     color:'#059669', bg:'#ecfdf5' },
          { label:'연동 상품',   v:totalSynced+'개',     color:'#7e22ce', bg:'#fdf4ff' },
        ].map(c=>(
          <div key={c.label} className="pm-card p-5" style={{ background:c.bg }}>
            <p style={{ fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>{c.label}</p>
            <p style={{ fontSize:28, fontWeight:900, color:c.color, lineHeight:1, marginTop:6 }}>{c.v}</p>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h2 style={{ fontSize:14, fontWeight:900, color:'#1e293b' }}>쇼핑몰 목록 ({active.length}/{channels.length})</h2>
        <Button onClick={() => setAddOpen(true)}><Plus size={14}/>쇼핑몰 추가</Button>
      </div>

      {/* 연동된 쇼핑몰만 표시 */}
      {active.length === 0 ? (
        <div className="pm-card" style={{ textAlign:'center', padding:'3rem 1rem', color:'#94a3b8' }}>
          <p style={{ fontSize:14, fontWeight:700 }}>연동된 쇼핑몰이 없습니다</p>
          <p style={{ fontSize:12, marginTop:4 }}>위의 [쇼핑몰 추가] 버튼을 눌러 연동을 시작하세요</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {active.map(ch => (
            <div key={ch.key} className="pm-card overflow-hidden">
              <div className={`h-1.5 bg-gradient-to-r ${ch.color}`}/>
              <div style={{ padding:20 }}>
                {/* 헤더 */}
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <MallLogo domain={ch.domain} name={ch.name}/>
                    <div>
                      <p style={{ fontWeight:900, color:'#1e293b', fontSize:14 }}>{ch.name}</p>
                      {ch.seller_id && <p style={{ fontSize:11, color:'#94a3b8', marginTop:2, fontFamily:'monospace' }}>ID: {ch.seller_id}</p>}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:800, color:'#15803d', background:'#f0fdf4', padding:'4px 10px', borderRadius:99, border:'1px solid #bbf7d0' }}>
                      <CheckCircle2 size={11}/>연동중
                    </span>
                    <button onClick={() => setConfirmDisconnect(ch)}
                      style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11, fontWeight:800, color:'#be123c', background:'#fff1f2', border:'1px solid #fecdd3', padding:'4px 9px', borderRadius:99, cursor:'pointer' }}>
                      <Unlink size={10}/>해제
                    </button>
                  </div>
                </div>

                {/* 카테고리 태그 */}
                {ch.categories.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:10 }}>
                    {ch.categories.slice(0,3).map(ct=>(
                      <span key={ct.id} style={{ fontSize:10.5, fontWeight:700, background:'#fdf4ff', color:'#7e22ce', padding:'2px 8px', borderRadius:99, border:'1px solid #e9d5ff' }}>
                        {ct.displayName}
                      </span>
                    ))}
                    {ch.categories.length>3 && <span style={{ fontSize:10.5, color:'#94a3b8', fontWeight:700 }}>+{ch.categories.length-3}</span>}
                  </div>
                )}

                {/* 배송정보 요약 */}
                {ch.delivery.fee_type && (
                  <p style={{ fontSize:11, color:'#64748b', marginBottom:10 }}>
                    📦 {ch.delivery.fee_type}{ch.delivery.base_fee?` ₩${ch.delivery.base_fee}`:''}
                    {ch.delivery.courier?` · ${ch.delivery.courier}`:''}
                  </p>
                )}

                {/* 버튼 */}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <Button variant="outline" size="sm" style={{ flex:1, fontSize:12 }}><RefreshCw size={12}/>동기화</Button>
                  <Button variant="outline" size="sm" style={{ flex:1, fontSize:12 }} onClick={() => openApi(ch)}><Settings size={12}/>API설정</Button>
                  <Button variant="outline" size="sm" style={{ fontSize:12 }} onClick={() => openMallInfo(ch)}>
                    <Tag size={12}/>카테고리/배송
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 쇼핑몰 추가 모달 ── */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="쇼핑몰 추가" size="lg">
        <p style={{ fontSize:13, fontWeight:700, color:'#64748b', marginBottom:14 }}>연동할 쇼핑몰을 선택하세요.</p>
        {availableMalls.length === 0 ? (
          <p style={{ textAlign:'center', fontSize:13, fontWeight:700, color:'#94a3b8', padding:'16px 0' }}>모든 쇼핑몰이 연동되어 있습니다.</p>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {availableMalls.map(ch => (
              <button key={ch.key}
                onClick={() => { setAddOpen(false); openApi(ch) }}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', border:'1.5px solid rgba(15,23,42,0.09)', borderRadius:14, background:'white', cursor:'pointer', textAlign:'left', transition:'all 150ms' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#3b82f6'; e.currentTarget.style.background='#eff6ff' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(15,23,42,0.09)'; e.currentTarget.style.background='white' }}
              >
                <MallLogo domain={ch.domain} name={ch.name} size={36}/>
                <span style={{ fontWeight:800, color:'#334155', fontSize:13 }}>{ch.name}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* ── API 설정 모달 ── */}
      {apiTarget && (() => {
        const fields = MALL_API_FIELDS[apiTarget.key] || DEFAULT_API_FIELDS
        const hasGuide = !!MALL_GUIDES[apiTarget.key]
        return (
          <Modal isOpen onClose={() => setApiTarget(null)} title={`${apiTarget.name} API 설정`} size="md">
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* 헤더 배너 */}
              <div className={`bg-gradient-to-r ${apiTarget.color}`} style={{ borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
                <MallLogo domain={apiTarget.domain} name={apiTarget.name} size={44}/>
                <div style={{ flex:1 }}>
                  <p style={{ fontWeight:900, color:'white', fontSize:15 }}>{apiTarget.name}</p>
                  <p style={{ color:'rgba(255,255,255,0.75)', fontSize:12, fontWeight:700, marginTop:2 }}>API 연동 설정</p>
                </div>
                {hasGuide && (
                  <button
                    onClick={() => openGuideWindow(apiTarget.key)}
                    style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.2)', border:'1.5px solid rgba(255,255,255,0.5)', borderRadius:10, padding:'7px 14px', color:'white', fontSize:12, fontWeight:800, cursor:'pointer', backdropFilter:'blur(4px)', whiteSpace:'nowrap' }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.35)'}
                    onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'}
                  >
                    <BookOpen size={13}/>연동방법
                  </button>
                )}
              </div>

              {/* 동적 입력 필드 */}
              {fields.map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label style={{ display:'block', fontSize:12, fontWeight:800, color:'#475569', marginBottom:6 }}>{label}</label>
                  <Input
                    type={type}
                    placeholder={placeholder}
                    value={(apiForm as Record<string,string>)[key] || ''}
                    onChange={e => setApiForm(f => ({...f, [key]:e.target.value}))}
                  />
                </div>
              ))}

              <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'10px 14px', fontSize:12, fontWeight:700, color:'#92400e' }}>
                {hasGuide
                  ? '💡 [연동방법] 버튼을 클릭하면 단계별 API 발급 가이드를 확인할 수 있습니다.'
                  : '💡 API 키는 각 쇼핑몰 판매자센터 → 개발자 API 메뉴에서 발급받을 수 있습니다.'}
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                <Button variant="outline" onClick={() => setApiTarget(null)}>취소</Button>
                <Button onClick={saveApi}><Zap size={13}/>저장하고 연동 시작</Button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* ── 카테고리/배송정보 모달 ── */}
      {mallInfoTarget && (
        <Modal isOpen onClose={() => setMallInfoTarget(null)} title={`${mallInfoTarget.name} — 카테고리/배송정보`} size="xl">
          {/* 탭 */}
          <div style={{ display:'flex', borderBottom:'2px solid #f1f5f9', marginBottom:18 }}>
            {([['category','📂 카테고리 등록'],['delivery','🚚 배송정보']] as const).map(([t,label])=>(
              <button key={t} onClick={() => setMallInfoTab(t)}
                style={{ padding:'8px 20px', fontSize:13, fontWeight:800, background:'none', border:'none', cursor:'pointer',
                  color: mallInfoTab===t ? '#7e22ce' : '#94a3b8',
                  borderBottom: mallInfoTab===t ? '2px solid #7e22ce' : '2px solid transparent', marginBottom:-2 }}>
                {label}
              </button>
            ))}
          </div>

          {/* ── 카테고리 탭 ── */}
          {mallInfoTab === 'category' && (
            <div>
              <p style={{ fontSize:12, color:'#64748b', marginBottom:14 }}>
                상품 등록 시 사용할 <b>{mallInfoTarget.name}</b> 카테고리를 등록하세요.
              </p>

              {/* 입력 영역 */}
              <div style={{ background:'#f8fafc', borderRadius:12, padding:14, marginBottom:16, display:'flex', flexDirection:'column', gap:10 }}>
                {/* 쇼핑몰 카테고리 검색/선택 */}
                <div>
                  <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>
                    쇼핑몰 카테고리 검색 / 직접입력
                  </label>
                  <div style={{ position:'relative' }}>
                    <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}/>
                    <input value={catSearch} onChange={e=>{setCatSearch(e.target.value);setCatSelected('')}}
                      placeholder={`${mallInfoTarget.name} 카테고리 검색 또는 직접 입력`}
                      style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px 7px 30px', fontSize:13, outline:'none' }}/>
                  </div>
                  {/* 자동완성 드롭다운 */}
                  {catSearch && (() => {
                    const suggestions = (MALL_CATS[mallInfoTarget.key] || []).filter(c => c.toLowerCase().includes(catSearch.toLowerCase()))
                    if (!suggestions.length) return null
                    return (
                      <div style={{ border:'1px solid #e2e8f0', borderRadius:8, background:'white', marginTop:4, boxShadow:'0 4px 12px rgba(0,0,0,0.08)', maxHeight:180, overflowY:'auto' }}>
                        {suggestions.map(s => (
                          <button key={s} onClick={() => { setCatSearch(s); setCatSelected(s); if(!catDisplay) setCatDisplay(s.split('>').pop()?.trim()||s) }}
                            style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 14px', fontSize:12, fontWeight:700, color:'#334155', background:'none', border:'none', cursor:'pointer', borderBottom:'1px solid #f1f5f9' }}
                            onMouseEnter={e=>e.currentTarget.style.background='#eff6ff'}
                            onMouseLeave={e=>e.currentTarget.style.background='none'}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* 등록명 + 코드 */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div>
                    <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>등록명 * <span style={{ fontSize:10, color:'#94a3b8', fontWeight:600 }}>(내 시스템에서 표시될 이름)</span></label>
                    <input value={catDisplay} onChange={e=>setCatDisplay(e.target.value)}
                      placeholder="예) 여성가방"
                      style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>카테고리 코드</label>
                    <input value={catCode} onChange={e=>setCatCode(e.target.value)}
                      placeholder="숫자 코드"
                      style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                  </div>
                </div>

                <button onClick={addCategory}
                  style={{ alignSelf:'flex-end', display:'flex', alignItems:'center', gap:5, padding:'7px 16px', background:'#7e22ce', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer' }}>
                  <Plus size={12}/>카테고리 추가
                </button>
              </div>

              {/* 등록된 카테고리 목록 */}
              {mallInfoTarget.categories.length === 0 ? (
                <div style={{ textAlign:'center', padding:'20px 0', color:'#cbd5e1', fontSize:13 }}>등록된 카테고리가 없습니다</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {mallInfoTarget.categories.map(ct => (
                    <div key={ct.id} style={{ display:'flex', alignItems:'center', gap:10, background:'#faf5ff', border:'1px solid #e9d5ff', borderRadius:10, padding:'8px 14px' }}>
                      <Tag size={13} color="#7e22ce" style={{ flexShrink:0 }}/>
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:13, fontWeight:800, color:'#4c1d95' }}>{ct.displayName}</p>
                        {ct.mallCat && <p style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{ct.mallCat}</p>}
                      </div>
                      {ct.code && <span style={{ fontSize:11, fontFamily:'monospace', color:'#7e22ce', background:'#ede9fe', padding:'2px 7px', borderRadius:5 }}>{ct.code}</span>}
                      <button onClick={() => removeCategory(ct.id)}
                        style={{ width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', color:'#dc2626', border:'none', borderRadius:5, cursor:'pointer' }}>
                        <X size={11}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
                <Button onClick={() => setMallInfoTarget(null)}>확인</Button>
              </div>
            </div>
          )}

          {/* ── 배송정보 탭 ── */}
          {mallInfoTab === 'delivery' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <p style={{ fontSize:12, color:'#64748b', marginBottom:2 }}>
                <b>{mallInfoTarget.name}</b> 기본 배송정보를 입력하세요. 상품 전송 시 자동으로 적용됩니다.
              </p>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  { key:'method'        as const, label:'배송방법',           placeholder:'예) 택배, 직배, 퀵' },
                  { key:'courier'       as const, label:'택배사',             placeholder:'예) CJ대한통운, 로젠' },
                  { key:'fee_type'      as const, label:'배송비 유형',         placeholder:'무료 / 유료 / 조건부무료' },
                  { key:'base_fee'      as const, label:'기본 배송비 (원)',    placeholder:'예) 3000' },
                  { key:'free_threshold'as const, label:'무료배송 기준금액',   placeholder:'예) 50000' },
                  { key:'lead_days'     as const, label:'배송기간 (영업일)',   placeholder:'예) 2~3' },
                  { key:'jeju_fee'      as const, label:'제주 추가배송비',     placeholder:'예) 3000' },
                  { key:'island_fee'    as const, label:'도서산간 추가배송비', placeholder:'예) 5000' },
                  { key:'return_fee'    as const, label:'반품 배송비',        placeholder:'예) 3000' },
                  { key:'exchange_fee'  as const, label:'교환 배송비',        placeholder:'예) 6000' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>{label}</label>
                    <input value={deliveryForm[key]} onChange={e=>setDeliveryForm(d=>({...d,[key]:e.target.value}))}
                      placeholder={placeholder}
                      style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                  </div>
                ))}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>출고지</label>
                  <input value={deliveryForm.warehouse} onChange={e=>setDeliveryForm(d=>({...d,warehouse:e.target.value}))}
                    placeholder="출고 창고 주소"
                    style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>반품/교환지</label>
                  <input value={deliveryForm.return_addr} onChange={e=>setDeliveryForm(d=>({...d,return_addr:e.target.value}))}
                    placeholder="반품/교환 주소"
                    style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                </div>
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:4 }}>
                <Button variant="outline" onClick={() => setMallInfoTab('category')}>취소</Button>
                <Button onClick={saveDelivery}><Truck size={13}/>배송정보 저장</Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── 연동 해제 확인 ── */}
      {confirmDisconnect && (
        <Modal isOpen onClose={() => setConfirmDisconnect(null)} title="연동 해제 확인" size="sm">
          <div style={{ textAlign:'center', padding:'8px 0 16px' }}>
            <MallLogo domain={confirmDisconnect.domain} name={confirmDisconnect.name} size={56}/>
            <p style={{ fontSize:15, fontWeight:800, color:'#1e293b', marginBottom:8, marginTop:14 }}>
              {confirmDisconnect.name} 연동을 해제하시겠습니까?
            </p>
            <p style={{ fontSize:12.5, color:'#94a3b8' }}>API 설정 및 연동 정보가 초기화됩니다.</p>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <Button variant="outline" onClick={() => setConfirmDisconnect(null)}>취소</Button>
            <Button onClick={() => handleDisconnect(confirmDisconnect.key)}
              style={{ background:'#dc2626', borderColor:'#dc2626' }}>
              <Unlink size={13}/>연동 해제
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
