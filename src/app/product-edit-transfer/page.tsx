'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Search, PenSquare, RefreshCw, Package } from 'lucide-react'

type ProductStatus = 'active'|'soldout'|'pending_delete'|'upcoming'|'ready_to_ship'
interface Product { id:string; code:string; name:string; category:string; status:ProductStatus; basic_info:Record<string,string>|null }

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:5 }}>{children}</label>
}

export default function ProductEditTransferPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [editTarget, setEditTarget] = useState<Product | null>(null)
  const [editForm, setEditForm]     = useState<Record<string,string>>({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data } = await supabase.from('pm_products')
        .select('id,code,name,category,status,basic_info')
        .eq('status', 'ready_to_ship')
        .order('created_at', { ascending: false })
      if (data) setProducts(data as Product[])
      setLoading(false)
    }
    load()
  }, [])

  const openEdit = (p: Product) => {
    setEditTarget(p)
    setEditForm({
      title:        p.basic_info?.title        ?? p.name,
      brand:        p.basic_info?.brand        ?? '',
      origin:       p.basic_info?.origin       ?? '',
      manufacturer: p.basic_info?.manufacturer ?? '',
      material:     p.basic_info?.material     ?? '',
      model_name:   p.basic_info?.model_name   ?? '',
      color:        p.basic_info?.color        ?? '',
      gender:       p.basic_info?.gender       ?? '',
      season:       p.basic_info?.season       ?? '',
      description:  p.basic_info?.description  ?? '',
      handling:     p.basic_info?.handling     ?? '',
      as_info:      p.basic_info?.as_info      ?? '',
      legal_notice: p.basic_info?.legal_notice ?? '',
      notes:        p.basic_info?.notes        ?? '',
    })
  }

  const handleSave = async () => {
    if (!editTarget) return
    const { error } = await supabase.from('pm_products')
      .update({ basic_info: editForm })
      .eq('id', editTarget.id)
    if (error) { console.error(error); return }
    setProducts(prev => prev.map(p => p.id === editTarget.id ? { ...p, basic_info: editForm } : p))
    setEditTarget(null)
  }

  const filtered = products.filter(p =>
    !search || p.name.includes(search) || p.code.includes(search)
  )

  return (
    <div className="pm-content">
      <div className="pm-card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ position:'relative', flex:'1 1 240px' }}>
            <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}/>
            <Input placeholder="상품명, 상품코드 검색..." value={search}
              onChange={e=>setSearch(e.target.value)}
              style={{ paddingLeft:30 }}/>
          </div>
          <Button variant="outline" size="sm" onClick={async () => {
            setLoading(true)
            const { data } = await supabase.from('pm_products').select('id,code,name,category,status,basic_info').eq('status','ready_to_ship').order('created_at',{ascending:false})
            if (data) setProducts(data as Product[])
            setLoading(false)
          }}><RefreshCw size={13}/>새로고침</Button>
        </div>
      </div>

      <div className="pm-card">
        {loading ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#94a3b8' }}>불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'4rem 1rem', color:'#94a3b8' }}>
            <Package size={40} style={{ opacity:0.2, margin:'0 auto 12px' }}/>
            <p style={{ fontSize:14, fontWeight:700 }}>전송준비 상품이 없습니다</p>
            <p style={{ fontSize:12, marginTop:4 }}>상품관리에서 상품명을 클릭해 기본정보를 입력하면 전송준비 상태가 됩니다</p>
          </div>
        ) : (
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead>
                <tr>
                  <th>상품코드</th>
                  <th>상품명</th>
                  <th>카테고리</th>
                  <th>타이틀</th>
                  <th>브랜드</th>
                  <th>원산지</th>
                  <th style={{ textAlign:'center' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontFamily:'monospace', fontWeight:800, color:'#2563eb', fontSize:12 }}>{p.code}</td>
                    <td style={{ fontWeight:700 }}>{p.name}</td>
                    <td style={{ fontSize:12, color:'#64748b' }}>{p.category}</td>
                    <td style={{ fontSize:12, color:'#334155' }}>{p.basic_info?.title || '-'}</td>
                    <td style={{ fontSize:12, color:'#64748b' }}>{p.basic_info?.brand || '-'}</td>
                    <td style={{ fontSize:12, color:'#64748b' }}>{p.basic_info?.origin || '-'}</td>
                    <td style={{ textAlign:'center' }}>
                      <button onClick={() => openEdit(p)}
                        style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, fontWeight:800, color:'#7e22ce', background:'#fdf4ff', border:'1px solid #e9d5ff', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>
                        <PenSquare size={12}/>수정
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pm-table-footer">
          <span>전송준비 {filtered.length}건</span>
        </div>
      </div>

      {editTarget && (
        <Modal isOpen onClose={() => setEditTarget(null)} title={`기본정보 수정 — ${editTarget.name}`} size="xl">
          {/* 섹션1: 기본 상품 정보 */}
          <div style={{ background:'#f8fafc', borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
            <p style={{ fontSize:11.5, fontWeight:900, color:'#475569', marginBottom:10 }}>📦 기본 상품 정보</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <Label>상품 타이틀 *</Label>
                <Input value={editForm.title||''} onChange={e=>setEditForm(f=>({...f,title:e.target.value}))}/>
              </div>
              {([
                { key:'brand',        label:'브랜드',    placeholder:'브랜드명',             badge:'' },
                { key:'model_name',   label:'모델명',    placeholder:'모델명 또는 상품코드',  badge:'스마트스토어·쿠팡' },
                { key:'origin',       label:'원산지',    placeholder:'예) 중국',             badge:'' },
                { key:'manufacturer', label:'제조사',    placeholder:'제조사명',             badge:'' },
                { key:'material',     label:'소재/재질', placeholder:'예) 폴리에스터 100%', badge:'' },
                { key:'color',        label:'색상',      placeholder:'예) 블랙, 베이지',     badge:'패션필수' },
              ] as {key:string;label:string;placeholder:string;badge:string}[]).map(({key,label,placeholder,badge})=>(
                <div key={key}>
                  <Label>
                    {label}
                    {badge && <span style={{ marginLeft:4, fontSize:9.5, fontWeight:700, background:'#eff6ff', color:'#2563eb', padding:'1px 5px', borderRadius:4 }}>{badge}</span>}
                  </Label>
                  <Input placeholder={placeholder} value={editForm[key]||''} onChange={e=>setEditForm(f=>({...f,[key]:e.target.value}))}/>
                </div>
              ))}
              <div>
                <Label>성별</Label>
                <select value={editForm.gender||''} onChange={e=>setEditForm(f=>({...f,gender:e.target.value}))}
                  style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none', background:'white' }}>
                  <option value="">선택안함</option>
                  <option value="여성">여성</option><option value="남성">남성</option>
                  <option value="공용">공용</option><option value="아동">아동</option>
                </select>
              </div>
              <div>
                <Label>시즌</Label>
                <select value={editForm.season||''} onChange={e=>setEditForm(f=>({...f,season:e.target.value}))}
                  style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none', background:'white' }}>
                  <option value="">선택안함</option>
                  <option value="SS">SS (봄/여름)</option><option value="FW">FW (가을/겨울)</option>
                  <option value="4S">사계절 공용</option>
                </select>
              </div>
            </div>
          </div>

          {/* 섹션2: 설명 및 취급 정보 */}
          <div style={{ background:'#f8fafc', borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
            <p style={{ fontSize:11.5, fontWeight:900, color:'#475569', marginBottom:10 }}>📝 설명 및 취급 정보</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <Label>상세설명</Label>
                <textarea value={editForm.description||''} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))}
                  placeholder="상품 상세 설명을 입력하세요"
                  style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:13, outline:'none', resize:'vertical', minHeight:72 }}/>
              </div>
              <div>
                <Label>취급 주의 <span style={{ fontSize:9.5, color:'#94a3b8' }}>(세탁방법 포함)</span></Label>
                <Input placeholder="예) 손세탁, 세탁기 사용불가" value={editForm.handling||''} onChange={e=>setEditForm(f=>({...f,handling:e.target.value}))}/>
              </div>
              <div>
                <Label>A/S 안내 <span style={{ fontSize:9.5, fontWeight:700, background:'#eff6ff', color:'#2563eb', padding:'1px 5px', borderRadius:4 }}>스마트스토어 필수</span></Label>
                <Input placeholder="예) 고객센터 02-0000-0000" value={editForm.as_info||''} onChange={e=>setEditForm(f=>({...f,as_info:e.target.value}))}/>
              </div>
            </div>
          </div>

          {/* 섹션3: 법적 고시 정보 */}
          <div style={{ background:'#fffbeb', borderRadius:10, padding:'12px 14px', marginBottom:12, border:'1px solid #fde68a' }}>
            <p style={{ fontSize:11.5, fontWeight:900, color:'#92400e', marginBottom:6 }}>⚖️ 법적 고시 정보 <span style={{ fontSize:10, fontWeight:600 }}>(쇼핑몰 필수 기재)</span></p>
            <textarea value={editForm.legal_notice||''} onChange={e=>setEditForm(f=>({...f,legal_notice:e.target.value}))}
              placeholder="예) 소재: 폴리에스터 100% / 치수: 가로30×세로25×높이15cm / 색상: 블랙 / 제조국: 중국"
              style={{ width:'100%', border:'1px solid #fde68a', borderRadius:8, padding:'8px 10px', fontSize:13, outline:'none', resize:'vertical', minHeight:52, background:'white' }}/>
          </div>

          {/* 비고 */}
          <div style={{ marginBottom:16 }}>
            <Label>비고</Label>
            <Input placeholder="기타 메모 (내부용)" value={editForm.notes||''} onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))}/>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:8 }}>
            <Button variant="outline" onClick={() => setEditTarget(null)}>취소</Button>
            <Button onClick={handleSave} style={{ background:'#7e22ce', borderColor:'#7e22ce' }}>저장</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
