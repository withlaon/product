'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  Truck, CheckCircle2, Search, Save, Package, Printer,
  CheckSquare, Square, Trash2, FileDown, Upload,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  loadInvoiceQueue, removeInvoiceQueueByIds,
  loadShippedOrders, upsertShippedOrders,
  loadMappings, lookupMapping, extractColor,
} from '@/lib/orders'
import type { Order, ShippedOrder, MappingStore } from '@/lib/orders'

/** [색상=베이지, 사이즈=FREE] → [베이지,FREE] 변환 */
function formatOption(option: string): string {
  if (!option) return ''
  const inner = option.replace(/^\[|\]$/g, '').trim()
  const parts = inner.split(',').map(part => {
    const eq = part.indexOf('=')
    return eq !== -1 ? part.slice(eq + 1).trim() : part.trim()
  })
  const result = parts.join(',')
  return option.startsWith('[') ? `[${result}]` : result
}

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shiftDate(dateStr: string, delta: number): string {
  if (!dateStr) return dateStr
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/* ─── 색상명 → CSS 색상 ───────────────────────────────────── */
const COLOR_CSS_MAP: Record<string, string> = {
  '블랙': '#111827',    '화이트': '#9ca3af',  '레드': '#dc2626',
  '블루': '#2563eb',    '그린': '#16a34a',    '옐로우': '#ca8a04',
  '핑크': '#db2777',    '퍼플': '#7c3aed',    '오렌지': '#ea580c',
  '그레이': '#6b7280',  '네이비': '#1e3a8a',  '베이지': '#a16207',
  '아이보리': '#78716c','브라운': '#92400e',   '카키': '#4d7c0f',
  '민트': '#0d9488',    '라벤더': '#8b5cf6',  '골드': '#b45309',
  '실버': '#71717a',    '샴페인': '#a16207',
}
/* 합포장 그룹용 글씨 색상 팔레트 */
const DUP_NAME_COLORS = [
  '#1d4ed8','#dc2626','#7c3aed','#059669','#d97706','#c2410c','#0369a1','#9333ea',
]

/* ─── 피킹리스트 출력 ─────────────────────────────────────── */
function printPickingList(orders: Order[], mappings: MappingStore) {
  interface PickRow {
    order_number: string
    customer_name: string
    shipping_address: string
    abbreviation: string
    color: string
    quantity: number
    loca: string
  }

  // 상품 캐시 로드 (바코드 → 색상명 자동 조회)
  type CacheOpt  = { barcode: string; korean_name: string }
  type CacheProd = { id: string; options?: CacheOpt[] }
  let productCache: CacheProd[] = []
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (raw) {
      const { data } = JSON.parse(raw) as { ts: number; data: CacheProd[] }
      if (Array.isArray(data)) productCache = data
    }
  } catch {}

  const rows: PickRow[] = []
  for (const order of orders) {
    for (const item of order.items) {
      const m = lookupMapping(mappings, item.product_name, item.option)

      // 색상: 바코드 기준 캐시 조회 → fallback: option 텍스트 추출
      let color = ''
      if (m.product_id && m.barcode) {
        const prod = productCache.find(p => p.id === m.product_id)
        const opt  = prod?.options?.find(o => o.barcode === m.barcode)
        if (opt?.korean_name) color = opt.korean_name
      }
      if (!color) color = extractColor(item.option ?? '')

      rows.push({
        order_number:     order.order_number,
        customer_name:    order.customer_name,
        shipping_address: order.shipping_address,
        abbreviation:     m.abbreviation || item.product_name,
        color,
        quantity: item.quantity,
        loca:     m.loca ?? '',
      })
    }
  }

  // LOCA 내림차순 정렬
  rows.sort((a, b) => b.loca.localeCompare(a.loca, 'ko'))

  // 합포장 카운트 (같은 수령인+주소)
  const addrCount: Record<string, number> = {}
  for (const r of rows) {
    const k = `${r.customer_name}||${r.shipping_address}`
    addrCount[k] = (addrCount[k] ?? 0) + 1
  }

  // 합포장 그룹별 수령인 이름 글씨 색상 할당
  const groupColor: Record<string, string> = {}
  let dupColorIdx = 0
  for (const r of rows) {
    const k = `${r.customer_name}||${r.shipping_address}`
    if (addrCount[k] > 1 && !groupColor[k]) {
      groupColor[k] = DUP_NAME_COLORS[dupColorIdx % DUP_NAME_COLORS.length]
      dupColorIdx++
    }
  }

  const today = getToday()
  const trRows = rows.map((r, i) => {
    const k      = `${r.customer_name}||${r.shipping_address}`
    const isDup  = addrCount[k] > 1
    const isQty2 = r.quantity >= 2
    let bg = ''
    if (isDup && isQty2) bg = 'background:#bbf7d0'
    else if (isDup)      bg = 'background:#bfdbfe'
    else if (isQty2)     bg = 'background:#fef9c3'

    const nameStyle = isDup
      ? `color:${groupColor[k]};font-weight:900`
      : 'font-weight:700'
    const qtyStyle  = isQty2
      ? 'text-align:center;font-weight:900;color:#dc2626'
      : 'text-align:center;font-weight:700'
    const colorCss  = COLOR_CSS_MAP[r.color] ?? '#374151'

    return `<tr style="${bg}">
      <td style="text-align:center">${i + 1}</td>
      <td><span style="${nameStyle}">${r.customer_name}</span></td>
      <td>${r.abbreviation}</td>
      <td contenteditable="true" style="color:${colorCss};font-weight:700;cursor:text">${r.color}</td>
      <td style="${qtyStyle}">${r.quantity}</td>
      <td style="text-align:center;font-family:monospace">${r.loca}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>피킹리스트 ${today}</title>
<style>
  @page{size:A4 portrait;margin:12mm 10mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:'Malgun Gothic',sans-serif;margin:0;padding:10px}
  h2{margin:0 0 10px;font-size:14px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #475569;padding:5px 8px}
  th{background:#1e293b;color:#fff;font-weight:800;text-align:left}
  [contenteditable]{outline:none;border-bottom:1px dashed #cbd5e1}
  [contenteditable]:focus{background:rgba(255,251,235,0.9);border-radius:2px;border-bottom-color:#f59e0b}
  .btn{padding:8px 18px;background:#1e293b;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;margin-bottom:12px}
  @media print{.btn{display:none}body{padding:0}h2{font-size:13px}[contenteditable]{border-bottom:none}}
</style></head><body>
<h2>📋 피킹리스트 — ${today} (${rows.length}건)</h2>
<button class="btn" onclick="window.print()">🖨 인쇄</button>
<table>
  <thead><tr>
    <th style="width:36px">NO</th>
    <th>수령인</th>
    <th>상품약어</th>
    <th style="width:64px">색상</th>
    <th style="width:46px">수량</th>
    <th style="width:70px">LOCA</th>
  </tr></thead>
  <tbody>${trRows}</tbody>
</table>
<div style="margin-top:14px;font-size:10.5px;color:#64748b;line-height:1.8">
  ● 파란배경: 합포장(동일 수령인·주소) — 수령인 이름 색상으로 그룹 구분<br>
  ● 노란배경: 수량 2개 이상(수량 빨간색) &nbsp; ● 초록배경: 합포장+2개이상<br>
  ※ 색상 칸 클릭 → 직접 수정 가능 · 수정 후 인쇄 버튼 클릭
</div>
</body></html>`

  const w = window.open('', '_blank', 'width=900,height=720')
  if (w) { w.document.write(html); w.document.close() }
}

const CARRIERS = ['CJ대한통운', '롯데택배', '한진택배', '우체국택배', '로젠택배', '쿠팡로켓', '직접입력']

const SENDER_NAME    = '위드라온'
const SENDER_PHONE   = '070-8949-7469'
const SENDER_ADDRESS = '경기도 부천시 소사구 성주로 96, 제일빌딩 5층'

export default function InvoicePrintPage() {
  const [orders, setOrders]             = useState<Order[]>([])
  const [search, setSearch]             = useState('')
  const [saved, setSaved]               = useState<Record<string, boolean>>({})
  const [edits, setEdits]               = useState<Record<string, { carrier: string; tracking: string }>>({})
  const [checkedPrint, setCheckedPrint] = useState<Set<string>>(new Set())
  const bulkFileRef = useRef<HTMLInputElement>(null)
  const [dateFilter, setDateFilter] = useState(getToday())
  const [showAllDates, setShowAllDates] = useState(false)

  useEffect(() => {
    setOrders(loadInvoiceQueue())
  }, [])

  const filtered = useMemo(() => {
    let list = orders
    if (!showAllDates && dateFilter) list = list.filter(o => o.order_date === dateFilter)
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(o =>
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.items[0]?.product_name?.toLowerCase().includes(q)
    )
  }, [orders, search, dateFilter, showAllDates])

  /* 체크박스 */
  const allPrintChecked = filtered.length > 0 && filtered.every(o => checkedPrint.has(o.id))
  const togglePrintAll = () => {
    if (allPrintChecked) {
      setCheckedPrint(prev => { const n = new Set(prev); filtered.forEach(o => n.delete(o.id)); return n })
    } else {
      setCheckedPrint(prev => { const n = new Set(prev); filtered.forEach(o => n.add(o.id)); return n })
    }
  }
  const togglePrintOne = (id: string) => setCheckedPrint(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const getEdit = (id: string) =>
    edits[id] ?? { carrier: 'CJ대한통운', tracking: '' }

  const setEdit = (id: string, field: 'carrier' | 'tracking', value: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...getEdit(id), [field]: value } }))

  /** 운송장 저장 → 큐에서 제거 + 출고내역(pm_shipped_orders_v1)에 추가 */
  const addToShippedAndRemoveFromQueue = (shippedOrders: Order[]) => {
    const now = new Date().toISOString()
    const existing = loadShippedOrders()
    const existingIds = new Set(existing.map(o => o.id))
    const newEntries: ShippedOrder[] = shippedOrders
      .filter(o => !existingIds.has(o.id))
      .map(o => ({ ...o, status: 'shipped' as const, shipped_at: now }))
    if (newEntries.length > 0) upsertShippedOrders(newEntries)

    // 큐에서 제거
    const savedIds = new Set(shippedOrders.map(o => o.id))
    removeInvoiceQueueByIds([...savedIds])
    const remaining = loadInvoiceQueue()
    setOrders(remaining)
    setCheckedPrint(new Set())
  }

  const handleSave = (order: Order) => {
    const edit = getEdit(order.id)
    if (!edit.tracking.trim()) return
    const updated = { ...order, tracking_number: edit.tracking.trim(), carrier: edit.carrier, status: 'shipped' as const }
    addToShippedAndRemoveFromQueue([updated])
    setSaved(prev => ({ ...prev, [order.id]: true }))
    setTimeout(() => setSaved(prev => ({ ...prev, [order.id]: false })), 2000)
  }

  /** 일괄저장: 운송장 입력된 주문만 송장전송파일로 이동 */
  const handleSaveAll = () => {
    const toSave: Order[] = []
    filtered.forEach(order => {
      const edit = getEdit(order.id)
      if (!edit.tracking.trim()) return
      toSave.push({ ...order, tracking_number: edit.tracking.trim(), carrier: edit.carrier, status: 'shipped' as const })
    })
    if (toSave.length === 0) return alert('입력된 운송장번호가 없습니다.')
    addToShippedAndRemoveFromQueue(toSave)
    const newSaved: Record<string, boolean> = {}
    toSave.forEach(o => { newSaved[o.id] = true })
    setSaved(prev => ({ ...prev, ...newSaved }))
    setTimeout(() => setSaved(prev => {
      const n = { ...prev }
      toSave.forEach(o => delete n[o.id])
      return n
    }), 2500)
    alert(`${toSave.length}건이 송장전송파일 탭으로 이동되었습니다.`)
  }

  /* CJ 송장파일 업로드 → 운송장번호 자동입력 */
  const handleBulkInvoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const wb   = XLSX.read(evt.target?.result, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

        const dataRows = rows.slice(1).filter(r => String(r[7] ?? '').trim())

        const normalizePhone = (p: string) => String(p ?? '').replace(/\D/g, '')
        const addrKey = (a: string) => a.trim().replace(/\s+/g, ' ').slice(0, 15)

        let matchCount = 0
        const newEdits: Record<string, { carrier: string; tracking: string }> = { ...edits }

        dataRows.forEach(row => {
          const tracking   = String(row[7]  ?? '').trim()
          const excelPhone = normalizePhone(String(row[21] ?? ''))
          const excelName  = String(row[20] ?? '').trim()
          const excelAddr  = addrKey(String(row[23] ?? ''))

          if (!tracking) return

          const matches = filtered.filter(o => {
            const oPhone = normalizePhone(o.customer_phone ?? '')
            if (oPhone && excelPhone && oPhone === excelPhone) return true
            if (excelName && o.customer_name === excelName) {
              const oAddr = addrKey(o.shipping_address)
              if (!excelAddr) return true
              return oAddr === excelAddr || oAddr.startsWith(excelAddr.slice(0,10)) || excelAddr.startsWith(oAddr.slice(0,10))
            }
            return false
          })

          matches.forEach(match => {
            if (!newEdits[match.id]?.tracking) {
              newEdits[match.id] = { carrier: newEdits[match.id]?.carrier ?? 'CJ대한통운', tracking }
              matchCount++
            }
          })
        })

        setEdits(newEdits)
        alert(`${matchCount}건 운송장번호가 자동 입력되었습니다.\n확인 후 [일괄 저장] 버튼을 눌러 저장하세요.`)
      } catch {
        alert('파일을 읽는 중 오류가 발생했습니다.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  /* 선택 항목 삭제 */
  const handleDelete = () => {
    if (checkedPrint.size === 0) return
    if (!confirm(`선택된 ${checkedPrint.size}건을 큐에서 삭제하시겠습니까?`)) return
    removeInvoiceQueueByIds([...checkedPrint])
    setOrders(loadInvoiceQueue())
    setCheckedPrint(new Set())
  }

  /* 피킹리스트 출력 */
  const handlePickingList = () => {
    const targets = checkedPrint.size > 0
      ? filtered.filter(o => checkedPrint.has(o.id))
      : filtered
    if (targets.length === 0) return alert('출력할 주문이 없습니다.')
    printPickingList(targets, loadMappings())
  }

  /* 전체 다운로드 (CJ 양식) */
  const downloadPrintFile = () => {
    const targets = checkedPrint.size > 0
      ? filtered.filter(o => checkedPrint.has(o.id))
      : filtered
    if (targets.length === 0) return alert('다운로드할 주문이 없습니다.')

    const mappings = loadMappings()
    const rows = targets.map(o => {
      const item    = o.items[0]
      const pname   = item?.product_name ?? ''
      const opt     = item?.option ?? ''
      const m       = lookupMapping(mappings, pname, opt)
      const abbr    = m.abbreviation || pname
      const 품목명  = abbr + (opt ? formatOption(opt.startsWith('[') ? opt : `[${opt}]`) : '')
      return {
        '보내는분성명':           SENDER_NAME,
        '보내는분전화번호':       SENDER_PHONE,
        '보내는분주소(전체, 분할)': SENDER_ADDRESS,
        '받는분성명':             o.customer_name,
        '받는분전화번호':         o.customer_phone ?? '',
        '받는분주소(전체, 분할)': o.shipping_address,
        '품목명':                 품목명,
        '내품수량':               item?.quantity ?? 1,
        '배송메세지1':            o.memo ?? '',
        '고객주문번호':           '',
        '운송장번호':             '',
      }
    })

    const ws  = XLSX.utils.json_to_sheet(rows)
    const wb  = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '송장출력')
    const out  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const blob = new Blob([out], { type: 'application/octet-stream' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `송장출력_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* 송장출력용 파일 (새 창 인쇄) */
  const printInvoices = () => {
    const printItems = filtered.filter(o => getEdit(o.id).tracking.trim() || saved[o.id])
    if (printItems.length === 0) {
      alert('출력할 운송장이 없습니다. 운송장번호를 먼저 입력하세요.')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const rows = printItems.map(o => {
      const edit     = getEdit(o.id)
      const tracking = edit.tracking.trim() || o.tracking_number || ''
      const carrier  = edit.carrier || o.carrier || ''
      return `<tr>
        <td>${o.order_number}</td>
        <td><b>${o.customer_name}</b></td>
        <td>${o.customer_phone || ''}</td>
        <td>${o.shipping_address}</td>
        <td>${o.items[0]?.product_name ?? ''}</td>
        <td style="font-family:monospace;font-weight:800">${tracking}</td>
        <td>${carrier}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>송장 목록 ${today}</title>
<style>
  body{font-family:'Malgun Gothic',sans-serif;margin:20px}
  h2{margin:0 0 12px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #475569;padding:6px 8px}
  th{background:#1e293b;color:#fff;font-weight:800;text-align:left}
  .btn{padding:8px 18px;background:#1e293b;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;margin-bottom:14px}
  @media print{.btn{display:none}}
</style></head><body>
<h2>📦 송장 목록 — ${today} (${printItems.length}건)</h2>
<button class="btn" onclick="window.print()">🖨 인쇄</button>
<table>
  <thead><tr>
    <th>주문번호</th><th>수취인</th><th>연락처</th><th>배송주소</th><th>상품명</th><th>운송장번호</th><th>택배사</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table></body></html>`
    const w = window.open('', '_blank', 'width=1100,height=700')
    if (w) { w.document.write(html); w.document.close() }
  }

  const checkedCount = checkedPrint.size
  const GRID = '36px 130px 68px 1fr 82px 140px 180px 72px'

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '송장출력/등록 대기', value: orders.length,   color: '#dc2626', bg: '#fef2f2' },
          { label: '현재 필터 건수',     value: filtered.length, color: '#2563eb', bg: '#eff6ff' },
        ].map(k => (
          <div key={k.label} className="pm-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Truck size={18} style={{ color: k.color }} />
            </div>
            <div>
              <p style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{k.value}</p>
              <p style={{ fontSize: '11.5px', color: k.color, fontWeight: 800, marginTop: 3 }}>{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 검색 + 날짜 네비게이션 + 액션 바 */}
      <div className="pm-card" style={{ padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="주문번호 · 수취인 · 상품명 검색..."
          style={{ flex: 1, height: 34, fontSize: '13px', border: 'none', outline: 'none', background: 'transparent', minWidth: 160 }}
        />

        {/* 날짜 좌우 네비게이션 */}
        {!showAllDates && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button onClick={() => setDateFilter(d => shiftDate(d, -1))}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={14} />
            </button>
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              style={{ height: 32, fontSize: '12.5px', fontWeight: 700, border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '0 8px', color: '#0f172a', cursor: 'pointer', outline: 'none' }}
            />
            <button onClick={() => setDateFilter(d => shiftDate(d, 1))}
              disabled={dateFilter >= getToday()}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: dateFilter >= getToday() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: dateFilter >= getToday() ? 0.4 : 1 }}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        <button onClick={() => setShowAllDates(v => !v)}
          style={{ padding: '4px 10px', borderRadius: 7, background: showAllDates ? '#1e293b' : '#f1f5f9', color: showAllDates ? '#fff' : '#64748b', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
          {showAllDates ? '날짜별' : '전체'}
        </button>

        {/* 선택 삭제 */}
        {checkedCount > 0 && (
          <button onClick={handleDelete}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', background: '#fef2f2', color: '#dc2626', borderRadius: 9, fontSize: '12px', fontWeight: 800, border: '1.5px solid #fecaca', cursor: 'pointer' }}>
            <Trash2 size={13} />삭제 ({checkedCount})
          </button>
        )}

        {/* 전체 다운로드 */}
        <button onClick={downloadPrintFile}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', background: '#ecfdf5', color: '#059669', borderRadius: 9, fontSize: '12px', fontWeight: 800, border: '1.5px solid #bbf7d0', cursor: 'pointer' }}>
          <FileDown size={13} />
          {checkedCount > 0 ? `선택 ${checkedCount}건 다운로드` : '전체 다운로드'}
        </button>

        {/* 피킹리스트 출력 */}
        <button onClick={handlePickingList}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', background: '#059669', color: 'white', borderRadius: 9, fontSize: '12px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
          <Printer size={13} />피킹리스트 출력
        </button>

        {/* 송장출력용 파일 */}
        <button onClick={printInvoices}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', background: '#7c3aed', color: 'white', borderRadius: 9, fontSize: '12px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
          <Printer size={13} />송장출력용 파일
        </button>

        {/* 송장파일 업로드 */}
        <button onClick={() => bulkFileRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', background: '#2563eb', color: 'white', borderRadius: 9, fontSize: '12px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
          <Upload size={13} />송장파일 업로드
        </button>
        <input ref={bulkFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleBulkInvoiceUpload} />

        {/* 일괄 저장 */}
        <button onClick={handleSaveAll}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', background: '#059669', color: 'white', borderRadius: 9, fontSize: '12px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
          <Save size={13} />일괄 저장
        </button>
      </div>

      {/* 목록 */}
      <div className="pm-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={15} style={{ color: '#64748b' }} />
          <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>송장출력/등록 대기 주문</span>
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>({filtered.length}건)</span>
          {checkedCount > 0 && (
            <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 700 }}>{checkedCount}건 선택됨</span>
          )}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Package size={40} style={{ margin: '0 auto 14px', opacity: 0.15, display: 'block' }} />
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8' }}>
              {orders.length === 0 ? '주문관리에서 CJ송장출력 파일을 통해 주문을 이동해주세요' : '검색 결과가 없습니다'}
            </p>
          </div>
        ) : (
          <div>
            {/* 헤더 */}
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '8px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
              <span onClick={togglePrintAll} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                {allPrintChecked
                  ? <CheckSquare size={14} style={{ color: '#2563eb' }} />
                  : <Square size={14} style={{ color: '#cbd5e1' }} />}
              </span>
              {['주문번호', '날짜', '상품명', '수취인', '택배사', '운송장번호', ''].map(h => (
                <span key={h} style={{ fontSize: '10.5px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>

            {filtered.map(order => {
              const edit      = getEdit(order.id)
              const isSaved   = saved[order.id]
              const isChecked = checkedPrint.has(order.id)
              return (
                <div key={order.id}
                  style={{
                    display: 'grid', gridTemplateColumns: GRID,
                    gap: 8, padding: '10px 20px',
                    borderBottom: '1px solid #f8fafc',
                    alignItems: 'center',
                    background: isSaved ? '#f0fdf4' : isChecked ? '#eff6ff' : 'transparent',
                    transition: 'background 200ms',
                  }}
                >
                  <span onClick={() => togglePrintOne(order.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    {isChecked
                      ? <CheckSquare size={14} style={{ color: '#2563eb' }} />
                      : <Square size={14} style={{ color: '#cbd5e1' }} />}
                  </span>

                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563eb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.order_number}
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>{order.order_date}</span>
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                      {order.items[0]?.product_name}{order.items.length > 1 ? ` 외 ${order.items.length - 1}건` : ''}
                    </p>
                    {order.items[0]?.option && (
                      <p style={{ fontSize: '10.5px', color: '#94a3b8', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.items[0].option}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>{order.customer_name}</span>

                  <select value={edit.carrier} onChange={e => setEdit(order.id, 'carrier', e.target.value)}
                    style={{ height: 32, borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '11.5px', fontWeight: 600, color: '#334155', padding: '0 6px', background: 'white', width: '100%' }}>
                    {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <input value={edit.tracking}
                    onChange={e => setEdit(order.id, 'tracking', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(order) }}
                    placeholder="운송장번호 입력"
                    style={{ height: 32, borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '12px', fontWeight: 600, color: '#334155', padding: '0 10px', width: '100%', outline: 'none' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#2563eb')}
                    onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                  />

                  <button onClick={() => handleSave(order)}
                    disabled={!edit.tracking.trim() || isSaved}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '0 8px', height: 32,
                      background: isSaved ? '#059669' : edit.tracking.trim() ? '#2563eb' : '#e2e8f0',
                      color: isSaved || edit.tracking.trim() ? 'white' : '#94a3b8',
                      borderRadius: 8, border: 'none', cursor: edit.tracking.trim() ? 'pointer' : 'default',
                      fontSize: '11.5px', fontWeight: 800, transition: 'background 200ms',
                      width: '100%', justifyContent: 'center',
                    }}>
                    {isSaved ? <><CheckCircle2 size={11} />완료</> : <><Save size={11} />등록</>}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
