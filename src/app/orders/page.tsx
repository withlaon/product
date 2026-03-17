'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { formatDateTime } from '@/lib/utils'
import {
  Search, RefreshCw, Play, Clock, CheckSquare, Package,
  GitMerge, FileSpreadsheet, Upload, Eye,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

/* ── Storage Keys ── */
export const CHANNEL_STORAGE_KEY  = 'pm_mall_channels_v5'
export const ORDERS_STORAGE_KEY   = 'pm_orders_v1'
export const SHIPPING_STORAGE_KEY = 'pm_shipping_v1'
export const MAPPING_STORAGE_KEY  = 'pm_order_mapping_v1'
export const CS_NEW_KEY           = 'pm_cs_new_flag'

/* ── Types ── */
type OrderItem = {
  name: string; sku: string; quantity: number; price: number
  option_name?: string; abbreviation?: string; loca?: string
}
export type Order = {
  id: string; order_number: string; channel: string; channel_order_id: string
  customer_name: string; customer_phone: string; shipping_address: string
  status: string; mapped_status?: 'new' | 'mapped'
  total_amount: number; shipping_fee: number
  tracking_number: string | null; carrier: string | null
  created_at: string; items: OrderItem[]; is_claim?: boolean
}
type ShipItem = {
  id: string; order_number: string; channel: string
  customer_name: string; customer_phone: string; shipping_address: string
  items: string; status: string; tracking_number: string | null; carrier: string | null
  weight: string; shipped_at: string | null; created_at: string
}
type MappingEntry  = { abbreviation: string; loca: string }
type MappingStore  = Record<string, MappingEntry>
type MappingRow    = { name: string; abbr: string; loca: string; matched: boolean }

/* ── Storage helpers ── */
const loadOrders   = (): Order[]        => { try { const r = localStorage.getItem(ORDERS_STORAGE_KEY);   return r ? JSON.parse(r) : [] } catch { return [] } }
const saveOrders   = (d: Order[])       => { try { localStorage.setItem(ORDERS_STORAGE_KEY,   JSON.stringify(d)) } catch {} }
const loadShipping = (): ShipItem[]     => { try { const r = localStorage.getItem(SHIPPING_STORAGE_KEY); return r ? JSON.parse(r) : [] } catch { return [] } }
const saveShipping = (d: ShipItem[])    => { try { localStorage.setItem(SHIPPING_STORAGE_KEY, JSON.stringify(d)) } catch {} }
const loadMapping  = (): MappingStore  => { try { const r = localStorage.getItem(MAPPING_STORAGE_KEY);  return r ? JSON.parse(r) : {} } catch { return {} } }
const saveMapping  = (d: MappingStore) => { try { localStorage.setItem(MAPPING_STORAGE_KEY,  JSON.stringify(d)) } catch {} }

/* ── Apply mapping to single order ── */
function applyMapping(order: Order, m: MappingStore): Order {
  const items = order.items.map(item => {
    const entry = m[item.name] ?? m[item.sku]
    return entry ? { ...item, abbreviation: entry.abbreviation, loca: entry.loca } : item
  })
  const allMapped = items.every(i => i.abbreviation)
  return { ...order, items, mapped_status: allMapped ? 'mapped' : 'new' }
}

/* ── 채널 credentials 로드 (pm_mall_channels_v5 기준) ── */
type ChannelCredentials = { key: string; name: string; credentials: Record<string, string> }
function loadChannelCredentials(): ChannelCredentials[] {
  try {
    const raw = localStorage.getItem('pm_mall_channels_v5')
      || localStorage.getItem('pm_mall_channels_v4')
      || localStorage.getItem('pm_mall_channels_v3')
    if (!raw) return []
    const arr: Record<string, string>[] = JSON.parse(raw)
    return arr
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((c: any) => c.active === true || c.active === 'true')
      .map(c => ({
        key : c.key,
        name: c.name,
        credentials: {
          api_key      : c.api_key       || '',
          api_secret   : c.api_secret    || '',
          seller_id    : c.seller_id     || '',
          login_id     : c.login_id      || '',
          login_pw     : c.login_pw      || '',
          site_name    : c.site_name     || '',
          refresh_token: c.refresh_token || '',
          access_key   : c.access_key    || '',
          // Cafe24: access_token 필드명으로도 매핑 (access_key 우선 사용)
          access_token : c.access_token  || c.access_key || '',
          mall_id      : c.mall_id       || c.site_name  || '',
          trader_code  : c.trader_code   || '',
        },
      }))
  } catch { return [] }
}

/** 수집 기간 → ISO date string 변환 */
function buildDateRange(range: '1'|'3'|'5'|'7'|'custom', custom?: string): { start: string; end: string } {
  const today = new Date()
  const end   = today.toISOString().slice(0, 10)
  if (range === 'custom' && custom) {
    return { start: custom, end }
  }
  const days = Number(range)
  const from = new Date(today)
  from.setDate(from.getDate() - days)
  return { start: from.toISOString().slice(0, 10), end }
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:12, fontWeight:800, color:'#475569', marginBottom:6 }}>{children}</label>
}

export default function OrdersPage() {
  const [orders,   setOrders]   = useState<Order[]>([])
  const [mapping,  setMapping]  = useState<MappingStore>({})
  const [mounted,  setMounted]  = useState(false)
  const [viewTab,  setViewTab]  = useState<'new'|'all'>('new')
  const [search,   setSearch]   = useState('')
  const [cf,       setCf]       = useState('전체')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [connectedMalls, setConnectedMalls] = useState<{key:string;name:string}[]>([])

  /* collect modal */
  const [collectModal,   setCollectModal]   = useState(false)
  const [collectSel,     setCollectSel]     = useState<Set<string>>(new Set())
  const [collecting,     setCollecting]     = useState(false)
  const [collectDone,    setCollectDone]    = useState(false)
  const [collectRange,   setCollectRange]   = useState<'1'|'3'|'5'|'7'|'custom'>('1')
  const [collectCustom,  setCollectCustom]  = useState('')
  const [collectResult,  setCollectResult]  = useState<{ added: number; skipped: number } | null>(null)
  const [collectErrors,  setCollectErrors]  = useState<{ mall: string; error: string }[]>([])

  /* auto collect modal */
  const [autoModal,    setAutoModal]    = useState(false)
  const [autoEnabled,  setAutoEnabled]  = useState(false)
  const [autoInterval, setAutoInterval] = useState('30')
  const [autoUnit,     setAutoUnit]     = useState<'분'|'시간'>('분')
  const [autoMalls,    setAutoMalls]    = useState<Set<string>>(new Set())
  const [autoNextAt,   setAutoNextAt]   = useState('')
  const autoTimerRef = useRef<ReturnType<typeof setInterval>|null>(null)

  /* manual order modal */
  const [manualModal,  setManualModal]  = useState(false)
  const [manualRows,   setManualRows]   = useState<Order[]>([])
  const manualFileRef = useRef<HTMLInputElement>(null)

  /* mapping modal */
  const [mappingModal, setMappingModal] = useState(false)
  const [mappingRows,  setMappingRows]  = useState<MappingRow[]>([])

  /* detail modal */
  const [sel, setSel] = useState<Order|null>(null)

  useEffect(() => {
    setMounted(true)
    const rawOrders  = loadOrders()
    const rawMapping = loadMapping()
    setMapping(rawMapping)
    setOrders(rawOrders.map(o => applyMapping(o, rawMapping)))
    try {
      // v3 → v4 → v5 순으로 병합: 더 새로운 버전이 같은 key를 덮어씀
      // → 어느 버전이든 active:true 인 쇼핑몰이 모두 표시됨
      const parse = (k: string): {key:string;name:string;active:boolean}[] | null => {
        try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null } catch { return null }
      }
      const mallMap = new Map<string, {key:string;name:string;active:boolean}>()
      ;[parse('pm_mall_channels_v3'), parse('pm_mall_channels_v4'), parse('pm_mall_channels_v5')]
        .forEach(arr => arr?.forEach(c => mallMap.set(c.key, c)))
      const active = Array.from(mallMap.values()).filter(c => c.active).map(c => ({key:c.key, name:c.name}))
      setConnectedMalls(active)
    } catch {}
    try {
      const saved = localStorage.getItem('pm_auto_collect')
      if (saved) {
        const v = JSON.parse(saved)
        setAutoEnabled(v.enabled); setAutoInterval(v.interval); setAutoUnit(v.unit); setAutoMalls(new Set(v.malls))
      }
    } catch {}
  }, [])

  /* auto collect – 실제 API 호출 (1일치 신규주문) */
  const runCollect = useCallback(async (mallKeys: string[]) => {
    if (!mallKeys.length) return
    const allCreds = loadChannelCredentials()
    const malls = mallKeys
      .map(key => allCreds.find(c => c.key === key))
      .filter(Boolean) as ChannelCredentials[]
    if (!malls.length) return
    const { start, end } = buildDateRange('1')
    try {
      const res = await fetch('/api/orders/collect', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ malls, start_date: start, end_date: end }),
      })
      if (!res.ok) return
      const json = await res.json()
      if (!json.success) return
      const raw: Order[] = json.orders || []
      setOrders(prev => {
        const m = loadMapping()
        const applied = raw.map(o => applyMapping(o, m))
        const existSet = new Set(prev.map(o => o.order_number))
        const deduped  = applied.filter(o => !existSet.has(o.order_number))
        const merged   = [...deduped, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        saveOrders(merged)
        if (deduped.some(o => o.is_claim || o.status === 'cancelled')) localStorage.setItem(CS_NEW_KEY, 'true')
        return merged
      })
    } catch {}
  }, [connectedMalls])

  useEffect(() => {
    if (!mounted) return
    if (autoTimerRef.current) clearInterval(autoTimerRef.current)
    if (!autoEnabled || !autoMalls.size) return
    const ms = autoUnit === '분' ? Number(autoInterval)*60000 : Number(autoInterval)*3600000
    setAutoNextAt(new Date(Date.now()+ms).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}))
    autoTimerRef.current = setInterval(() => {
      runCollect(Array.from(autoMalls))
      setAutoNextAt(new Date(Date.now()+ms).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}))
    }, ms)
    return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current) }
  }, [autoEnabled, autoInterval, autoUnit, autoMalls, mounted, runCollect])

  /* manual collect – 실제 API 호출 */
  const handleCollect = async () => {
    if (!collectSel.size) return
    setCollecting(true)
    setCollectErrors([])
    setCollectResult(null)
    try {
      const allCreds = loadChannelCredentials()
      const malls = Array.from(collectSel)
        .map(key => allCreds.find(c => c.key === key))
        .filter(Boolean) as ChannelCredentials[]

      const { start, end } = buildDateRange(collectRange, collectCustom)

      const res = await fetch('/api/orders/collect', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ malls, start_date: start, end_date: end }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message || '수집 실패')

      const raw: Order[] = json.orders || []
      const errs: { mall: string; error: string }[] = json.errors || []
      setCollectErrors(errs)

      const m = loadMapping()
      const applied = raw.map(o => applyMapping(o, m))
      let added = 0
      setOrders(prev => {
        const existSet = new Set(prev.map(o => o.order_number))
        const deduped  = applied.filter(o => !existSet.has(o.order_number))
        added = deduped.length
        const merged   = [...deduped, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        saveOrders(merged)
        if (deduped.some(o => o.is_claim || o.status === 'cancelled')) localStorage.setItem(CS_NEW_KEY, 'true')
        return merged
      })
      setCollectResult({ added, skipped: raw.length - added })
      setCollectDone(true)
    } catch (e: unknown) {
      setCollectErrors([{ mall: '전체', error: e instanceof Error ? e.message : String(e) }])
    } finally {
      setCollecting(false)
    }
  }

  /* 주문 전체 초기화 */
  const handleClearOrders = () => {
    if (!confirm('수집된 주문을 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return
    saveOrders([])
    setOrders([])
    setSelectedIds(new Set())
  }

  /* 배송준비 → 배송/송장등록 탭 이동 */
  const handleReadyShipping = () => {
    if (!selectedIds.size) return
    const chosen = orders.filter(o => selectedIds.has(o.id))
    const shipItems: ShipItem[] = chosen.map(o => ({
      id: o.id, order_number: o.order_number, channel: o.channel,
      customer_name: o.customer_name, customer_phone: o.customer_phone,
      shipping_address: o.shipping_address,
      items: o.items.map(i => `${i.abbreviation||i.name}(${i.option_name||i.sku}×${i.quantity})`).join(', '),
      status: 'ready', tracking_number: null, carrier: null,
      weight: '', shipped_at: null, created_at: o.created_at,
    }))
    const existing = loadShipping()
    const existIds = new Set(existing.map(s=>s.id))
    const toAdd = shipItems.filter(s=>!existIds.has(s.id))
    saveShipping([...toAdd,...existing])
    setOrders(prev => {
      const updated = prev.map(o => selectedIds.has(o.id) ? {...o, status:'processing'} : o)
      saveOrders(updated); return updated
    })
    setSelectedIds(new Set())
    alert(`${toAdd.length}건이 배송/송장등록 탭으로 이동되었습니다.`)
  }

  /* 매핑 모달 열기 */
  const openMappingModal = () => {
    const m = loadMapping()
    const uniqueMap = new Map<string, MappingRow>()
    orders.filter(o => o.status === 'pending').forEach(o => {
      o.items.forEach(item => {
        if (!uniqueMap.has(item.name)) {
          const e = m[item.name]
          uniqueMap.set(item.name, { name: item.name, abbr: e?.abbreviation||'', loca: e?.loca||'', matched: !!e?.abbreviation })
        }
      })
    })
    setMappingRows(Array.from(uniqueMap.values()))
    setMappingModal(true)
  }

  /* pm_channel_mappings_v1 로드/저장 헬퍼 */
  const CHANNEL_MAPPING_KEY = 'pm_channel_mappings_v1'
  type ChannelMappedRow = {
    mall_product_id: string; mall_product_name: string; mall_option: string
    matched_product_id: string|null; matched_product_name: string|null
    matched_option: string|null; matched_barcode: string|null
    mall_price: number|null; status: 'matched'|'unmatched'
  }
  const loadChannelMappings = (): Record<string, ChannelMappedRow[]> => {
    try { const r = localStorage.getItem(CHANNEL_MAPPING_KEY); return r ? JSON.parse(r) : {} } catch { return {} }
  }
  const saveChannelMappings = (d: Record<string, ChannelMappedRow[]>) => {
    try { localStorage.setItem(CHANNEL_MAPPING_KEY, JSON.stringify(d)) } catch {}
  }

  /* 매핑 저장 + 매핑관리탭·상품관리탭 동기화 */
  const handleSaveMapping = async () => {
    const current = loadMapping()
    const updated: MappingStore = { ...current }
    mappingRows.forEach(r => { if (r.abbr) updated[r.name] = { abbreviation: r.abbr, loca: r.loca } })
    saveMapping(updated)
    setMapping(updated)
    setOrders(prev => {
      const applied = prev.map(o => applyMapping(o, updated))
      saveOrders(applied); return applied
    })
    setMappingModal(false)

    // ── 매핑관리탭(pm_channel_mappings_v1) + 상품관리탭(registered_malls) 동기화 ──
    const channelMappings = loadChannelMappings()
    const toSync = mappingRows.filter(r => r.abbr)

    for (const row of toSync) {
      // 이 item name 을 포함한 신규주문의 채널 목록 수집
      const channelNames = Array.from(new Set(
        orders.filter(o => o.status === 'pending' && o.items.some(i => i.name === row.name))
              .map(o => o.channel)
      ))

      // 채널명 → key 변환 (connectedMalls 활용)
      const channelKeys = channelNames.map(name => ({
        name,
        key: connectedMalls.find(m => m.name === name)?.key || name,
      }))

      // Supabase에서 abbr로 상품 검색
      type ProdMatch = { id: string; name: string; options: { name: string; barcode: string }[] }
      let matched: ProdMatch | null = null
      try {
        const { data } = await supabase.from('pm_products')
          .select('id,name,options')
          .eq('abbr', row.abbr)
          .limit(1)
          .maybeSingle()
        if (data) matched = data as unknown as ProdMatch
      } catch {}
      // abbr로 못 찾으면 name으로 재시도
      if (!matched) {
        try {
          const { data } = await supabase.from('pm_products')
            .select('id,name,options')
            .ilike('name', `%${row.name}%`)
            .limit(1)
            .maybeSingle()
          if (data) matched = data as unknown as ProdMatch
        } catch {}
      }

      const matchedOpt = matched?.options?.[0] ?? null

      // pm_channel_mappings_v1 업데이트
      for (const ch of channelKeys) {
        const existing = channelMappings[ch.key] || []
        const idx = existing.findIndex(r => r.mall_product_name === row.name)
        const newRow: ChannelMappedRow = {
          mall_product_id: '',
          mall_product_name: row.name,
          mall_option: orders.find(o => o.channel === ch.name && o.items.some(i => i.name === row.name))
            ?.items.find(i => i.name === row.name)?.option_name || '',
          matched_product_id:   matched?.id   || null,
          matched_product_name: matched?.name || null,
          matched_option:       matchedOpt?.name   || null,
          matched_barcode:      matchedOpt?.barcode || null,
          mall_price: null,
          status: matched ? 'matched' : 'unmatched',
        }
        if (idx >= 0) existing[idx] = newRow
        else existing.push(newRow)
        channelMappings[ch.key] = existing
      }

      // Supabase registered_malls 업데이트
      if (matched) {
        try {
          const { data: prodData } = await supabase.from('pm_products')
            .select('registered_malls').eq('id', matched.id).single()
          const current: string[] = prodData?.registered_malls ?? []
          const toAdd = channelKeys.map(c => c.name).filter(n => !current.includes(n))
          if (toAdd.length > 0) {
            await supabase.from('pm_products')
              .update({ registered_malls: [...current, ...toAdd] })
              .eq('id', matched.id)
          }
        } catch {}
      }
    }
    saveChannelMappings(channelMappings)
    alert('매핑이 저장되었습니다. 매핑관리탭과 상품관리탭에도 반영되었습니다.')
  }

  /* 패킹리스트 다운로드 */
  const handlePackingList = async () => {
    const mappedOrders = orders.filter(o => o.mapped_status === 'mapped' && o.status === 'pending')
    if (!mappedOrders.length) { alert('매핑 완료된 주문이 없습니다.'); return }

    type Row = { customer:string; mall:string; abbr:string; option:string; loca:string }
    const rows: Row[] = []
    mappedOrders.forEach(o => {
      o.items.forEach(item => {
        for (let q = 0; q < item.quantity; q++) {
          rows.push({ customer: o.customer_name, mall: o.channel, abbr: item.abbreviation||item.name, option: item.option_name||item.sku||'', loca: item.loca||'' })
        }
      })
    })
    rows.sort((a,b) => (a.loca||'').localeCompare(b.loca||''))

    const ExcelJSLib = (await import('exceljs')).default
    const wb = new ExcelJSLib.Workbook()
    const ws = wb.addWorksheet('패킹리스트')
    ws.columns = [
      { header:'주문자',   key:'customer', width:12 },
      { header:'쇼핑몰',   key:'mall',     width:14 },
      { header:'상품약어', key:'abbr',     width:18 },
      { header:'옵션명',   key:'option',   width:16 },
      { header:'LOCA',     key:'loca',     width:12 },
    ]
    const hRow = ws.getRow(1)
    hRow.height = 22
    hRow.eachCell(c => {
      c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1E3A5F' } }
      c.font = { bold:true, color:{ argb:'FFFFFFFF' }, size:11 }
      c.alignment = { horizontal:'center', vertical:'middle' }
    })

    const PALETTE = ['FFFDE68A','FFBFDBFE','FFD9F99D','FFFECACA','FFEDE9FE','FFE0F2FE','FFDCFCE7','FFFBD38D']
    const colorMap = new Map<string,string>(); let ci = 0
    const keyCounts = new Map<string,number>()
    rows.forEach(r => { const k = `${r.customer}__${r.mall}`; keyCounts.set(k, (keyCounts.get(k)||0)+1) })
    rows.forEach(row => {
      const k = `${row.customer}__${row.mall}`
      if ((keyCounts.get(k)||0) > 1 && !colorMap.has(k)) { colorMap.set(k, PALETTE[ci++ % PALETTE.length]) }
      const dr = ws.addRow(row)
      const color = colorMap.get(k)
      dr.eachCell(c => {
        if (color) c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb: color } }
        c.alignment = { horizontal:'center', vertical:'middle' }
        c.border = { top:{style:'thin',color:{argb:'FFD1D5DB'}}, left:{style:'thin',color:{argb:'FFD1D5DB'}}, bottom:{style:'thin',color:{argb:'FFD1D5DB'}}, right:{style:'thin',color:{argb:'FFD1D5DB'}} }
      })
    })

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `패킹리스트_${new Date().toLocaleDateString('ko-KR').replace(/\. /g,'-').replace('.','')}`.replace(/\s/g,'') + '.xlsx'
    a.click(); URL.revokeObjectURL(url)
  }

  /* 수동주문 Excel 파싱 */
  const handleManualFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type:'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<Record<string,string>>(ws, { defval:'' })
        const get = (row: Record<string,string>, candidates: string[]) => {
          for (const c of candidates) {
            const k = Object.keys(row).find(k2 => k2.toLowerCase().includes(c))
            if (k) return String(row[k]||'')
          }
          return ''
        }
        const parsed: Order[] = raw.map((row, i) => ({
          id: `manual_${Date.now()}_${i}`,
          order_number: get(row,['주문번호','order_no']) || `MNL-${Date.now()}-${i}`,
          channel: get(row,['쇼핑몰','채널','channel','mall']) || '수동등록',
          channel_order_id: get(row,['채널주문번호','channel_order']) || '',
          customer_name: get(row,['주문자','수취인','받는분','customer','name','고객']) || '',
          customer_phone: get(row,['전화','phone','연락처','휴대폰']) || '',
          shipping_address: get(row,['주소','address','배송지']) || '',
          status: 'pending', mapped_status: 'new' as const,
          total_amount: Number(get(row,['결제금액','금액','amount','price'])) || 0,
          shipping_fee: 0, tracking_number: null, carrier: null,
          created_at: new Date().toISOString(),
          items: [{
            name: get(row,['상품명','상품','product','item']) || '수동등록상품',
            option_name: get(row,['옵션','option','옵션명']) || '',
            sku: get(row,['sku','바코드','barcode','상품코드']) || '',
            quantity: Number(get(row,['수량','qty','quantity'])) || 1,
            price: Number(get(row,['단가','price'])) || 0,
          }],
          is_claim: false,
        }))
        setManualRows(parsed)
      } catch { alert('파일을 읽는 중 오류가 발생했습니다.') }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleManualRegister = () => {
    const m = loadMapping()
    const applied = manualRows.map(o => applyMapping(o, m))
    setOrders(prev => {
      const existing = new Set(prev.map(o=>o.order_number))
      const deduped = applied.filter(o=>!existing.has(o.order_number))
      const merged = [...deduped,...prev].sort((a,b) => new Date(b.created_at).getTime()-new Date(a.created_at).getTime())
      saveOrders(merged); return merged
    })
    setManualRows([]); setManualModal(false)
    alert('수동 주문이 등록되었습니다.')
  }

  const toggleSel   = (id:string) => setSelectedIds(p => { const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n })
  const toggleAll   = (c:boolean) => setSelectedIds(c ? new Set(filtered.map(o=>o.id)) : new Set())
  const channels    = Array.from(new Set(orders.map(o=>o.channel)))
  const newCount    = orders.filter(o=>o.status==='pending').length
  const hasMapped   = orders.some(o=>o.mapped_status==='mapped'&&o.status==='pending')

  const filtered = orders.filter(o => {
    if (viewTab==='new' && o.status!=='pending') return false
    if (cf!=='전체' && o.channel!==cf) return false
    if (search) return o.order_number.includes(search)||o.customer_name.includes(search)||o.items.some(i=>i.name.includes(search))
    return true
  }).sort((a,b) => new Date(b.created_at).getTime()-new Date(a.created_at).getTime())

  if (!mounted) return null

  return (
    <div className="pm-page space-y-4">

      {/* ─── 탭 (신규주문 / 전체주문) ─── */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {([['new','신규주문','#2563eb','#eff6ff','#1d4ed8',newCount],['all','전체주문','#7c3aed','#f5f3ff','#7c3aed',orders.length]] as const).map(([tab, label, border, bg, color, cnt]) => (
          <button key={tab} onClick={() => setViewTab(tab)}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 20px', borderRadius:12, border:`2px solid ${viewTab===tab ? border : '#e2e8f0'}`, fontSize:13.5, fontWeight:900, cursor:'pointer', background: viewTab===tab ? bg : 'white', color: viewTab===tab ? color : '#64748b', transition:'all 150ms' }}>
            <Package size={14}/>
            {label}
            <span style={{ background: viewTab===tab ? border : '#e2e8f0', color: viewTab===tab ? 'white' : '#64748b', fontSize:12, fontWeight:900, padding:'2px 8px', borderRadius:99, minWidth:24, textAlign:'center' }}>{cnt}</span>
          </button>
        ))}
      </div>

      {/* ─── 액션 바 ─── */}
      <div className="pm-card p-4">
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'flex-start' }}>
          {/* 자동주문수집 */}
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <button onClick={() => setAutoModal(true)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:10, border:'1.5px solid', fontSize:12.5, fontWeight:800, cursor:'pointer', borderColor:autoEnabled?'#059669':'#d1d5db', background:autoEnabled?'#ecfdf5':'white', color:autoEnabled?'#059669':'#374151' }}>
              <Clock size={13}/>자동주문수집
              {autoEnabled && <span style={{ background:'#059669', color:'white', fontSize:10, fontWeight:900, padding:'1px 6px', borderRadius:99 }}>ON</span>}
            </button>
            {autoEnabled && autoNextAt && <span style={{ fontSize:10.5, color:'#6b7280', fontWeight:700, paddingLeft:2 }}>다음 {autoNextAt}</span>}
          </div>

          <div style={{ width:1, height:34, background:'#e2e8f0', alignSelf:'center' }}/>

          {/* 주문수집 */}
          <button onClick={() => { setCollectModal(true); setCollectDone(false); setCollectSel(new Set()) }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#2563eb,#1d4ed8)', color:'white', fontSize:12.5, fontWeight:800, cursor:'pointer' }}>
            <RefreshCw size={13}/>주문수집
          </button>

          {/* 수동주문등록 */}
          <button onClick={() => setManualModal(true)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:10, border:'1.5px solid #e2e8f0', background:'white', color:'#374151', fontSize:12.5, fontWeight:800, cursor:'pointer' }}>
            <Upload size={13}/>수동주문등록
          </button>

          <div style={{ width:1, height:34, background:'#e2e8f0', alignSelf:'center' }}/>

          {/* 매핑하기 */}
          <button onClick={openMappingModal}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:10, border:'1.5px solid #a855f7', background:'#faf5ff', color:'#7c3aed', fontSize:12.5, fontWeight:800, cursor:'pointer' }}>
            <GitMerge size={13}/>매핑하기
          </button>

          {/* 패킹리스트 */}
          <button onClick={handlePackingList} disabled={!hasMapped}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:10, border:'1.5px solid', fontSize:12.5, fontWeight:800, cursor:hasMapped?'pointer':'not-allowed', borderColor:hasMapped?'#0891b2':'#e2e8f0', background:hasMapped?'#ecfeff':'#f8fafc', color:hasMapped?'#0e7490':'#9ca3af' }}>
            <FileSpreadsheet size={13}/>패킹리스트
          </button>

          {/* 배송준비 */}
          <button onClick={handleReadyShipping} disabled={!selectedIds.size}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:10, border:'none', fontSize:12.5, fontWeight:800, cursor:selectedIds.size?'pointer':'not-allowed', background:selectedIds.size?'linear-gradient(135deg,#7c3aed,#6d28d9)':'#e5e7eb', color:selectedIds.size?'white':'#9ca3af' }}>
            <Package size={13}/>배송준비 {selectedIds.size>0 && `(${selectedIds.size})`}
          </button>

          {/* 주문 초기화 */}
          {orders.length > 0 && (
            <button onClick={handleClearOrders}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 13px', borderRadius:10, border:'1.5px solid #fca5a5', background:'#fff5f5', color:'#dc2626', fontSize:12, fontWeight:800, cursor:'pointer' }}>
              🗑 초기화
            </button>
          )}

          <div style={{ flex:1 }}/>

          {/* 검색 & 채널 필터 */}
          <div className="relative" style={{ minWidth:180, flex:1, maxWidth:280 }}>
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:'#94a3b8' }}/>
            <Input placeholder="주문번호, 고객명, 상품명..." value={search} onChange={e=>setSearch(e.target.value)} className="pm-input-icon"/>
          </div>
          <Select value={cf} onChange={e=>setCf(e.target.value)} style={{ width:120 }}>
            <option value="전체">전체 채널</option>
            {channels.map(v=><option key={v}>{v}</option>)}
          </Select>
        </div>
      </div>

      {/* ─── 주문 목록 테이블 ─── */}
      <div className="pm-card overflow-hidden">
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                <th style={{ width:36 }}>
                  <input type="checkbox" checked={filtered.length>0 && selectedIds.size===filtered.length} onChange={e=>toggleAll(e.target.checked)}/>
                </th>
                <th>주문일시</th>
                <th>쇼핑몰</th>
                <th>상품명</th>
                <th>상품약어</th>
                <th>옵션명</th>
                <th>주문자</th>
                <th>상태</th>
                <th style={{ width:40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign:'center', padding:'3.5rem 1rem', color:'#94a3b8' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                      <RefreshCw size={36} style={{ opacity:0.2 }}/>
                      <p style={{ fontSize:13.5, fontWeight:700 }}>주문 데이터가 없습니다</p>
                      <p style={{ fontSize:12, color:'#cbd5e1' }}>[주문수집] 버튼을 눌러 주문을 가져오세요</p>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map(o => {
                const isSel    = selectedIds.has(o.id)
                const isMapped = o.mapped_status === 'mapped'
                const item     = o.items[0]
                return (
                  <tr key={o.id} className="group" style={{ background: isSel ? '#eff6ff' : undefined }}>
                    <td><input type="checkbox" checked={isSel} onChange={() => toggleSel(o.id)}/></td>
                    <td style={{ fontSize:11.5, color:'#64748b', whiteSpace:'nowrap' }}>{formatDateTime(o.created_at)}</td>
                    <td>
                      <span style={{ fontSize:11.5, fontWeight:800, padding:'2px 8px', borderRadius:6, background:'#f8fafc', color:'#475569' }}>{o.channel}</span>
                    </td>
                    <td style={{ maxWidth:140 }}>
                      <p style={{ fontSize:12.5, fontWeight:700, color:'#334155', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item?.name}</p>
                      {o.items.length>1 && <p style={{ fontSize:10.5, color:'#94a3b8', marginTop:1 }}>외 {o.items.length-1}건</p>}
                    </td>
                    <td>
                      {item?.abbreviation
                        ? <span style={{ fontSize:12, fontWeight:800, color:'#0e7490', background:'#ecfeff', padding:'2px 8px', borderRadius:6 }}>{item.abbreviation}</span>
                        : <span style={{ fontSize:11, color:'#94a3b8' }}>—</span>
                      }
                    </td>
                    <td style={{ fontSize:12, color:'#475569', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {item?.option_name || item?.sku || '—'}
                    </td>
                    <td>
                      <p style={{ fontWeight:800, color:'#1e293b', fontSize:12.5 }}>{o.customer_name}</p>
                      <p style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{o.customer_phone}</p>
                    </td>
                    <td>
                      {isMapped
                        ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, fontWeight:800, padding:'3px 10px', borderRadius:8, background:'#dcfce7', color:'#15803d' }}>✓ 매핑완료</span>
                        : <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, fontWeight:800, padding:'3px 10px', borderRadius:8, background:'#fef9c3', color:'#854d0e' }}>신규주문</span>
                      }
                    </td>
                    <td>
                      <button onClick={()=>setSel(o)} className="pm-btn pm-btn-ghost pm-btn-sm group-hover:!opacity-100" style={{ width:28, height:28, padding:0, borderRadius:8, opacity:0, transition:'opacity 150ms' }}>
                        <Eye size={13}/>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="pm-table-footer">
          <span>총 {filtered.length}건 · {selectedIds.size}건 선택</span>
        </div>
      </div>

      {/* ─── 주문 상세 모달 ─── */}
      {sel && (
        <Modal isOpen={!!sel} onClose={()=>setSel(null)} title="주문 상세" size="lg">
          <div className="space-y-4">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <p style={{ fontFamily:'monospace', fontWeight:800, color:'#2563eb', fontSize:15 }}>{sel.order_number}</p>
                <p style={{ fontSize:12, color:'#94a3b8', marginTop:4 }}>{sel.channel} · {sel.channel_order_id}</p>
              </div>
              <span style={{ fontSize:11.5, fontWeight:800, padding:'3px 10px', borderRadius:8, background: sel.mapped_status==='mapped'?'#dcfce7':'#fef9c3', color: sel.mapped_status==='mapped'?'#15803d':'#854d0e' }}>
                {sel.mapped_status==='mapped'?'✓ 매핑완료':'신규주문'}
              </span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, background:'#f8fafc', borderRadius:14, padding:14 }}>
              {[['주문자',sel.customer_name],['연락처',sel.customer_phone]].map(([k,v])=>(
                <div key={k}><p style={{ fontSize:10.5, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>{k}</p><p style={{ fontWeight:800, color:'#1e293b', marginTop:3 }}>{v}</p></div>
              ))}
              <div style={{ gridColumn:'1/-1' }}><p style={{ fontSize:10.5, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>배송주소</p><p style={{ fontWeight:700, color:'#334155', marginTop:3 }}>{sel.shipping_address}</p></div>
            </div>
            <div className="space-y-2">
              {sel.items.map((item,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:'#f8fafc', borderRadius:12 }}>
                  <div>
                    <p style={{ fontWeight:800, color:'#1e293b', fontSize:13 }}>{item.name}</p>
                    <p style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>
                      {item.option_name||item.sku} · {item.quantity}개
                      {item.abbreviation && <span style={{ marginLeft:8, color:'#0e7490', fontWeight:800 }}>약어: {item.abbreviation}</span>}
                      {item.loca && <span style={{ marginLeft:8, color:'#7c3aed', fontWeight:800 }}>LOCA: {item.loca}</span>}
                    </p>
                  </div>
                  <p style={{ fontWeight:800, color:'#1e293b' }}>₩{(item.price*item.quantity).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'#eff6ff', borderRadius:14 }}>
              <span style={{ fontWeight:800, color:'#334155' }}>총 결제금액</span>
              <span style={{ fontSize:18, fontWeight:900, color:'#2563eb' }}>₩{sel.total_amount.toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <Button variant="outline" onClick={()=>setSel(null)}>닫기</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── 주문수집 모달 ─── */}
      <Modal isOpen={collectModal} onClose={()=>setCollectModal(false)} title="주문 수집" size="md">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <p style={{ fontSize:12, fontWeight:800, color:'#475569', marginBottom:8 }}>수집 기간</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {([['1','1일 전'],['3','3일 전'],['5','5일 전'],['7','7일 전']] as const).map(([val,label])=>(
                <button key={val} onClick={()=>setCollectRange(val)} style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid', fontSize:12.5, fontWeight:800, cursor:'pointer', borderColor:collectRange===val?'#2563eb':'#e2e8f0', background:collectRange===val?'#eff6ff':'white', color:collectRange===val?'#1d4ed8':'#475569' }}>{label}</button>
              ))}
              <button onClick={()=>setCollectRange('custom')} style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid', fontSize:12.5, fontWeight:800, cursor:'pointer', borderColor:collectRange==='custom'?'#2563eb':'#e2e8f0', background:collectRange==='custom'?'#eff6ff':'white', color:collectRange==='custom'?'#1d4ed8':'#475569' }}>시작일 선택</button>
            </div>
            {collectRange==='custom' && (
              <input type="date" value={collectCustom} onChange={e=>setCollectCustom(e.target.value)} max={new Date().toISOString().slice(0,10)}
                style={{ marginTop:8, width:'100%', padding:'8px 12px', borderRadius:8, border:'1.5px solid #93c5fd', fontSize:13, fontWeight:700, color:'#1e293b', outline:'none' }}/>
            )}
          </div>
          <p style={{ fontSize:13, color:'#64748b', fontWeight:700 }}>수집할 쇼핑몰을 선택하세요.</p>
          {connectedMalls.length===0 ? (
            <div style={{ textAlign:'center', padding:24, color:'#94a3b8', fontSize:13, fontWeight:700 }}>연동된 쇼핑몰이 없습니다.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'#f8fafc', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:13 }}>
                <input type="checkbox" checked={collectSel.size===connectedMalls.length} onChange={e=>setCollectSel(e.target.checked?new Set(connectedMalls.map(m=>m.key)):new Set())}/>
                전체 선택
              </label>
              {connectedMalls.map(m=>(
                <label key={m.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', border:'1.5px solid', borderRadius:10, cursor:'pointer', borderColor:collectSel.has(m.key)?'#2563eb':'#e2e8f0', background:collectSel.has(m.key)?'#eff6ff':'white' }}>
                  <input type="checkbox" checked={collectSel.has(m.key)} onChange={e=>setCollectSel(p=>{const n=new Set(p);e.target.checked?n.add(m.key):n.delete(m.key);return n})}/>
                  <span style={{ fontSize:13, fontWeight:800, color:collectSel.has(m.key)?'#1d4ed8':'#334155' }}>{m.name}</span>
                </label>
              ))}
            </div>
          )}
          {/* 수집 결과 */}
          {collectDone && collectResult && (
            <div style={{ padding:'12px 14px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, fontSize:12.5, fontWeight:800, color:'#15803d' }}>
              ✅ 수집 완료 — 신규 {collectResult.added}건 추가 {collectResult.skipped > 0 ? `(중복 ${collectResult.skipped}건 제외)` : ''}
            </div>
          )}
          {/* 에러 */}
          {collectErrors.length > 0 && (
            <div style={{ padding:'10px 14px', background:'#fff5f5', border:'1px solid #fca5a5', borderRadius:10, display:'flex', flexDirection:'column', gap:4 }}>
              {collectErrors.map((e, i) => (
                <p key={i} style={{ fontSize:12, fontWeight:700, color:'#dc2626' }}>
                  ⚠ {e.mall}: {e.error}
                </p>
              ))}
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Button variant="outline" onClick={()=>{ setCollectModal(false); setCollectDone(false); setCollectResult(null); setCollectErrors([]) }}>닫기</Button>
            <Button onClick={handleCollect} disabled={!collectSel.size||collecting||collectDone}>
              {collecting ? <><RefreshCw size={13} style={{ animation:'spin 0.7s linear infinite' }}/>수집 중...</> : <><Play size={13}/>수집 시작</>}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── 자동수집 설정 모달 ─── */}
      <Modal isOpen={autoModal} onClose={()=>setAutoModal(false)} title="자동 주문수집 설정" size="md">
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#f8fafc', borderRadius:12 }}>
            <div>
              <p style={{ fontSize:13, fontWeight:800, color:'#1e293b' }}>자동 주문수집</p>
              <p style={{ fontSize:11.5, color:'#64748b', marginTop:2 }}>설정한 주기로 자동 수집합니다</p>
            </div>
            <button onClick={()=>setAutoEnabled(!autoEnabled)} style={{ width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', position:'relative', background:autoEnabled?'#2563eb':'#e2e8f0', transition:'background 200ms' }}>
              <span style={{ position:'absolute', top:2, left:autoEnabled?22:2, width:20, height:20, borderRadius:10, background:'white', transition:'left 200ms', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
            </button>
          </div>
          <div>
            <p style={{ fontSize:12, fontWeight:800, color:'#475569', marginBottom:8 }}>수집 주기</p>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <Input type="number" min="1" value={autoInterval} onChange={e=>setAutoInterval(e.target.value)} style={{ width:80, textAlign:'center' }}/>
              <Select value={autoUnit} onChange={e=>setAutoUnit(e.target.value as '분'|'시간')} style={{ width:80 }}>
                <option value="분">분</option><option value="시간">시간</option>
              </Select>
              <span style={{ fontSize:12, color:'#94a3b8' }}>마다</span>
            </div>
          </div>
          <div>
            <p style={{ fontSize:12, fontWeight:800, color:'#475569', marginBottom:8 }}>수집 쇼핑몰</p>
            {connectedMalls.length===0 ? <p style={{ fontSize:12, color:'#94a3b8' }}>연동된 쇼핑몰이 없습니다.</p> : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, fontWeight:700, color:'#374151' }}>
                  <input type="checkbox" checked={autoMalls.size===connectedMalls.length} onChange={e=>setAutoMalls(e.target.checked?new Set(connectedMalls.map(m=>m.key)):new Set())}/>
                  전체 선택
                </label>
                {connectedMalls.map(m=>(
                  <label key={m.key} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, fontWeight:700, color:'#374151' }}>
                    <input type="checkbox" checked={autoMalls.has(m.key)} onChange={e=>setAutoMalls(p=>{const n=new Set(p);e.target.checked?n.add(m.key):n.delete(m.key);return n})}/>
                    {m.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Button variant="outline" onClick={()=>setAutoModal(false)}>취소</Button>
            <Button onClick={()=>{ localStorage.setItem('pm_auto_collect',JSON.stringify({enabled:autoEnabled,interval:autoInterval,unit:autoUnit,malls:Array.from(autoMalls)})); setAutoModal(false) }}>
              <CheckSquare size={13}/>설정 저장
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── 수동주문등록 모달 ─── */}
      <Modal isOpen={manualModal} onClose={()=>{ setManualModal(false); setManualRows([]) }} title="수동 주문등록" size="lg">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ padding:'12px 16px', background:'#f8fafc', borderRadius:12, fontSize:12.5, fontWeight:700, color:'#475569', lineHeight:1.8 }}>
            <p style={{ fontWeight:900, color:'#1e293b', marginBottom:4 }}>📁 쇼핑몰 Excel 파일 업로드</p>
            <p>• 각 쇼핑몰에서 다운로드한 주문 엑셀 파일을 그대로 등록 가능합니다</p>
            <p>• 인식 가능 열: 주문번호, 쇼핑몰, 주문자/수취인, 상품명, 옵션, 수량, 결제금액, 배송주소 등</p>
          </div>
          <div>
            <input ref={manualFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleManualFile} style={{ display:'none' }}/>
            <button onClick={()=>manualFileRef.current?.click()}
              style={{ width:'100%', padding:'20px', border:'2px dashed #93c5fd', borderRadius:12, background:'#f0f9ff', cursor:'pointer', fontSize:13.5, fontWeight:800, color:'#1d4ed8', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              <Upload size={18}/>파일 선택 (.xlsx / .xls / .csv)
            </button>
          </div>
          {manualRows.length > 0 && (
            <>
              <div style={{ padding:'8px 12px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, fontSize:12.5, fontWeight:800, color:'#15803d' }}>
                ✅ {manualRows.length}건 파싱 완료 — 아래 목록 확인 후 [등록] 버튼을 누르세요
              </div>
              <div style={{ maxHeight:260, overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:10 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['주문번호','쇼핑몰','주문자','상품명','수량','금액'].map(h=>(
                        <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontWeight:800, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {manualRows.map((o,i)=>(
                      <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'7px 10px', fontFamily:'monospace', color:'#2563eb', fontWeight:700 }}>{o.order_number}</td>
                        <td style={{ padding:'7px 10px', color:'#475569' }}>{o.channel}</td>
                        <td style={{ padding:'7px 10px', fontWeight:700 }}>{o.customer_name}</td>
                        <td style={{ padding:'7px 10px', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.items[0]?.name}</td>
                        <td style={{ padding:'7px 10px', textAlign:'center' }}>{o.items[0]?.quantity}</td>
                        <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700 }}>₩{o.total_amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Button variant="outline" onClick={()=>{ setManualModal(false); setManualRows([]) }}>취소</Button>
            <Button onClick={handleManualRegister} disabled={!manualRows.length}>
              <Upload size={13}/>등록 ({manualRows.length}건)
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── 매핑 모달 ─── */}
      <Modal isOpen={mappingModal} onClose={()=>setMappingModal(false)} title="상품 매핑" size="lg">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ padding:'10px 14px', background:'#f8fafc', borderRadius:10, fontSize:12.5, fontWeight:700, color:'#475569', lineHeight:1.7 }}>
            <p style={{ fontWeight:900, color:'#1e293b', marginBottom:2 }}>📦 상품 매핑 안내</p>
            <p>• 주문 상품명 기준으로 <b>상품약어</b>와 <b>LOCA(위치코드)</b>를 매핑합니다</p>
            <p>• 한 번 매핑하면 저장되어 다음 수집 시 자동으로 적용됩니다</p>
            <p>• 패킹리스트 다운로드 시 LOCA 기준으로 자동 정렬됩니다</p>
          </div>
          {mappingRows.length === 0 ? (
            <div style={{ textAlign:'center', padding:24, color:'#94a3b8', fontSize:13, fontWeight:700 }}>신규주문(대기중) 상품이 없습니다.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
              {/* 헤더 */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 130px 120px 80px', gap:8, padding:'8px 12px', background:'#f1f5f9', borderRadius:8 }}>
                {['주문 상품명','상품약어 *','LOCA','매핑상태'].map(h=>(
                  <span key={h} style={{ fontSize:11, fontWeight:800, color:'#475569', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</span>
                ))}
              </div>
              {/* 매핑 행들 */}
              <div style={{ maxHeight:380, overflowY:'auto', display:'flex', flexDirection:'column', gap:4 }}>
                {mappingRows.map((row, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 130px 120px 80px', gap:8, padding:'8px 12px', borderRadius:8, border:'1.5px solid', borderColor:row.abbr?'#a5f3fc':'#e2e8f0', background:row.abbr?'#ecfeff':'white', alignItems:'center' }}>
                    <span style={{ fontSize:12.5, fontWeight:700, color:'#334155', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={row.name}>{row.name}</span>
                    <input value={row.abbr} onChange={e=>setMappingRows(p=>p.map((r,j)=>j===i?{...r,abbr:e.target.value,matched:!!e.target.value}:r))}
                      placeholder="약어 입력 *" style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid', borderColor:row.abbr?'#0891b2':'#fca5a5', fontSize:12.5, fontWeight:700, outline:'none', color:'#1e293b' }}/>
                    <input value={row.loca} onChange={e=>setMappingRows(p=>p.map((r,j)=>j===i?{...r,loca:e.target.value}:r))}
                      placeholder="예) A-01" style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid #e2e8f0', fontSize:12.5, fontWeight:700, outline:'none', color:'#1e293b' }}/>
                    <span style={{ fontSize:11.5, fontWeight:800, padding:'2px 8px', borderRadius:6, background:row.abbr?'#dcfce7':'#fef9c3', color:row.abbr?'#15803d':'#854d0e', textAlign:'center' }}>
                      {row.abbr?'완료':'미완료'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:12, color:'#64748b', fontWeight:700 }}>
              완료 {mappingRows.filter(r=>r.abbr).length} / 전체 {mappingRows.length}건
            </span>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="outline" onClick={()=>setMappingModal(false)}>취소</Button>
              <Button onClick={handleSaveMapping} disabled={!mappingRows.some(r=>r.abbr)}>
                <GitMerge size={13}/>매핑 저장
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
