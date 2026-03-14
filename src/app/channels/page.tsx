'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import {
  RefreshCw, Settings, Zap, Plus, CheckCircle2, Unlink,
  Tag, Truck, Search, X, BookOpen, Download,
} from 'lucide-react'

/* ─── 전체 쇼핑몰 정의 ─────────────────────────────────────────────── */
const ALL_MALLS = [
  { key:'coupang',    name:'쿠팡',        domain:'coupang.com',          color:'from-orange-400 to-orange-600' },
  { key:'naver',      name:'스마트스토어', domain:'smartstore.naver.com', color:'from-green-400 to-green-600'  },
  { key:'11st',       name:'11번가',       domain:'11st.co.kr',           color:'from-red-400 to-red-600'      },
  { key:'gmarket',    name:'지마켓',       domain:'gmarket.co.kr',        color:'from-blue-400 to-blue-600'    },
  { key:'auction',    name:'옥션',         domain:'auction.co.kr',        color:'from-yellow-400 to-yellow-600'},
  { key:'ablly',      name:'에이블리',     domain:'a-bly.com',            color:'from-pink-400 to-pink-600'    },
  { key:'zigzag',     name:'지그재그',     domain:'zigzag.kr',            color:'from-purple-400 to-purple-600'},
  { key:'alwayz',     name:'올웨이즈',     domain:'alwayz.co',            color:'from-teal-400 to-teal-600'    },
  { key:'cafe24',     name:'카페24',       domain:'cafe24.com',           color:'from-indigo-400 to-indigo-600'},
  { key:'fashionplus',name:'패션플러스',   domain:'fashionplus.co.kr',    color:'from-rose-400 to-rose-600'    },
  { key:'halfclub',   name:'하프클럽',     domain:'halfclub.com',         color:'from-amber-400 to-amber-600'  },
  { key:'gsshop',     name:'GS SHOP',      domain:'gsshop.com',           color:'from-lime-400 to-lime-600'    },
  { key:'jasondeal',  name:'제이슨딜',     domain:'jasondeal.com',        color:'from-cyan-400 to-cyan-600'    },
  { key:'lotteon',    name:'롯데온',       domain:'lotteon.com',          color:'from-red-500 to-red-700'      },
  { key:'ssg',        name:'SSG.COM',      domain:'ssg.com',              color:'from-orange-500 to-red-500'   },
  { key:'toss',       name:'토스쇼핑',     domain:'shop.toss.im',         color:'from-blue-500 to-indigo-600'  },
  { key:'kakaostore', name:'톡스토어',     domain:'store.kakao.com',      color:'from-yellow-400 to-yellow-500'},
]

/* ─── 쇼핑몰별 API 입력 필드 ──────────────────────────────────────── */
type ApiField = { key:string; label:string; placeholder:string; type:'text'|'password' }

const MALL_API_FIELDS: Record<string, ApiField[]> = {
  coupang: [
    { key:'seller_id', label:'판매자 ID',  placeholder:'쿠팡 판매자 ID',    type:'text'     },
    { key:'api_key',   label:'Access Key', placeholder:'발급받은 Access Key', type:'password' },
    { key:'api_secret',label:'Secret Key', placeholder:'발급받은 Secret Key', type:'password' },
  ],
  naver: [
    { key:'seller_id', label:'판매자 ID',    placeholder:'네이버 판매자 ID',       type:'text'     },
    { key:'api_key',   label:'Client ID',    placeholder:'Application Client ID',  type:'text'     },
    { key:'api_secret',label:'Client Secret',placeholder:'Application Client Secret',type:'password'},
  ],
  '11st': [
    { key:'seller_id', label:'판매자 ID', placeholder:'11번가 판매자 ID',  type:'text'     },
    { key:'api_key',   label:'API Key',   placeholder:'Open API Key 입력', type:'password' },
  ],
  gmarket: [
    { key:'seller_id', label:'판매자 ID',  placeholder:'지마켓 판매자 ID', type:'text'     },
    { key:'api_key',   label:'API Key',    placeholder:'API Key 입력',     type:'password' },
    { key:'api_secret',label:'API Secret', placeholder:'API Secret 입력',  type:'password' },
  ],
  auction: [
    { key:'seller_id', label:'판매자 ID',  placeholder:'옥션 판매자 ID',  type:'text'     },
    { key:'api_key',   label:'API Key',    placeholder:'API Key 입력',    type:'password' },
    { key:'api_secret',label:'API Secret', placeholder:'API Secret 입력', type:'password' },
  ],
  ablly: [
    { key:'seller_id', label:'판매자 ID', placeholder:'에이블리 판매자 ID', type:'text'     },
    { key:'api_key',   label:'API Key',   placeholder:'API Key 입력',      type:'password' },
  ],
  zigzag: [
    { key:'seller_id', label:'판매자 ID',  placeholder:'지그재그 판매자 ID', type:'text'     },
    { key:'api_key',   label:'API Key',    placeholder:'API Key 입력',       type:'password' },
    { key:'api_secret',label:'API Secret', placeholder:'API Secret 입력',    type:'password' },
  ],
  alwayz: [
    { key:'seller_id', label:'판매자 ID', placeholder:'올웨이즈 판매자 ID', type:'text'     },
    { key:'api_key',   label:'API Key',   placeholder:'API Key 입력',       type:'password' },
  ],
  cafe24: [
    { key:'seller_id',     label:'쇼핑몰 ID',     placeholder:'카페24 쇼핑몰 ID',         type:'text'     },
    { key:'api_secret',    label:'패스워드',       placeholder:'카페24 관리자 패스워드',    type:'password' },
    { key:'site_name',     label:'사이트명',       placeholder:'예) myshop (영문)',         type:'text'     },
    { key:'refresh_token', label:'Refresh Token', placeholder:'OAuth Refresh Token 입력',  type:'password' },
    { key:'access_key',    label:'Access Key',    placeholder:'발급받은 Access Key 입력',  type:'password' },
  ],
  fashionplus: [
    { key:'seller_id', label:'판매자 ID', placeholder:'패션플러스 판매자 ID', type:'text'     },
    { key:'api_key',   label:'API Key',   placeholder:'API Key 입력',         type:'password' },
  ],
  halfclub: [
    { key:'seller_id', label:'판매자 ID',  placeholder:'하프클럽 판매자 ID', type:'text'     },
    { key:'api_key',   label:'API Key',    placeholder:'API Key 입력',        type:'password' },
    { key:'api_secret',label:'API Secret', placeholder:'API Secret 입력',     type:'password' },
  ],
  gsshop: [
    { key:'seller_id', label:'판매자 ID',  placeholder:'GS SHOP 판매자 ID', type:'text'     },
    { key:'api_key',   label:'API Key',    placeholder:'API Key 입력',       type:'password' },
    { key:'api_secret',label:'API Secret', placeholder:'API Secret 입력',    type:'password' },
  ],
  jasondeal: [
    { key:'seller_id', label:'판매자 ID', placeholder:'제이슨딜 판매자 ID', type:'text'     },
    { key:'api_key',   label:'API Key',   placeholder:'API Key 입력',        type:'password' },
  ],
  lotteon: [
    { key:'seller_id', label:'판매자 ID',  placeholder:'롯데온 판매자 ID',  type:'text'     },
    { key:'api_key',   label:'API Key',    placeholder:'API Key 입력',       type:'password' },
    { key:'api_secret',label:'API Secret', placeholder:'API Secret 입력',    type:'password' },
  ],
  ssg: [
    { key:'seller_id', label:'판매자 ID',  placeholder:'SSG.COM 판매자 ID', type:'text'     },
    { key:'api_key',   label:'API Key',    placeholder:'API Key 입력',       type:'password' },
    { key:'api_secret',label:'API Secret', placeholder:'API Secret 입력',    type:'password' },
  ],
  toss: [
    { key:'seller_id', label:'판매자 ID', placeholder:'토스쇼핑 판매자 ID', type:'text'     },
    { key:'api_key',   label:'API Key',   placeholder:'API Key 입력',        type:'password' },
  ],
  kakaostore: [
    { key:'seller_id', label:'비즈니스 채널 ID', placeholder:'카카오 비즈니스 채널 ID', type:'text'     },
    { key:'api_key',   label:'REST API Key',      placeholder:'카카오 REST API Key',     type:'password' },
    { key:'api_secret',label:'Admin Key',          placeholder:'카카오 Admin Key',        type:'password' },
  ],
}

/* ─── 연동방법 가이드 ──────────────────────────────────────────────── */
type GuideInfo = { title:string; note:string; steps:string[]; links:{label:string;url:string}[] }
const MALL_GUIDES: Record<string, GuideInfo> = {
  coupang: {
    title:'쿠팡 WING API 연동 방법', note:'쿠팡 WING 판매자 계정이 필요합니다.',
    steps:['① 쿠팡 WING(wing.coupang.com) 로그인 후 [개발자 API] 메뉴로 이동합니다.','② [API 키 발급] 버튼 클릭 → 판매자 ID와 Access Key / Secret Key가 발급됩니다.','③ 발급된 키를 위 입력란에 입력하고 [저장하고 연동 시작]을 클릭합니다.'],
    links:[{label:'쿠팡 WING',url:'https://wing.coupang.com'},{label:'API 가이드',url:'https://developers.coupangapis.com'}],
  },
  naver: {
    title:'네이버 스마트스토어 API 연동 방법', note:'스마트스토어 판매자 계정과 커머스 API 설정이 필요합니다.',
    steps:['① 스마트스토어센터(sell.smartstore.naver.com) → [설정] → [API 설정] 이동합니다.','② [애플리케이션 등록]에서 새 앱을 만들고 Client ID / Client Secret을 발급받습니다.','③ 발급된 판매자 ID, Client ID, Client Secret을 입력하고 저장합니다.'],
    links:[{label:'스마트스토어센터',url:'https://sell.smartstore.naver.com'},{label:'커머스 API 문서',url:'https://apicenter.commerce.naver.com'}],
  },
  '11st': {
    title:'11번가 Open API 연동 방법', note:'11번가 판매자 계정이 필요합니다.',
    steps:['① 11번가 스마트R(seller.11st.co.kr) 로그인 후 [API 관리] 이동합니다.','② [API Key 발급]을 클릭하여 Open API Key를 발급받습니다.','③ 판매자 ID와 발급받은 API Key를 입력하고 저장합니다.'],
    links:[{label:'11번가 스마트R',url:'https://seller.11st.co.kr'},{label:'API 개발자센터',url:'https://openapi.11st.co.kr'}],
  },
  gmarket: {
    title:'지마켓/옥션 ESM+ API 연동 방법', note:'ESM+ 판매자 계정과 API 사용 신청이 필요합니다.',
    steps:['① ESM+(esmplus.com) 로그인 후 [도구] → [API 관리] 이동합니다.','② API 사용 신청 및 승인 후 API Key / Secret이 발급됩니다.','③ 판매자 ID, API Key, API Secret을 입력하고 저장합니다.'],
    links:[{label:'ESM+',url:'https://www.esmplus.com'},{label:'API 가이드',url:'https://gapi.gmarket.co.kr'}],
  },
  auction: {
    title:'옥션 ESM+ API 연동 방법', note:'ESM+ 판매자 계정과 API 사용 신청이 필요합니다.',
    steps:['① ESM+(esmplus.com) 로그인 후 [도구] → [API 관리] 이동합니다.','② API 사용 신청 및 승인 후 API Key / Secret이 발급됩니다.','③ 판매자 ID, API Key, API Secret을 입력하고 저장합니다.'],
    links:[{label:'ESM+',url:'https://www.esmplus.com'}],
  },
  ablly: {
    title:'에이블리 파트너 API 연동 방법', note:'에이블리 파트너 계정이 필요합니다.',
    steps:['① 에이블리 파트너센터(partner.a-bly.com) 로그인합니다.','② [설정] → [API 연동] 메뉴에서 API Key를 발급받습니다.','③ 판매자 ID와 API Key를 입력하고 저장합니다.'],
    links:[{label:'에이블리 파트너센터',url:'https://partner.a-bly.com'}],
  },
  zigzag: {
    title:'지그재그 API 연동 방법', note:'지그재그 셀러 계정이 필요합니다.',
    steps:['① 지그재그 셀러어드민(seller.zigzag.kr) 로그인합니다.','② [설정] → [API 키 관리]에서 API Key / Secret을 발급받습니다.','③ 판매자 ID, API Key, API Secret을 입력하고 저장합니다.'],
    links:[{label:'지그재그 셀러어드민',url:'https://seller.zigzag.kr'}],
  },
  alwayz: {
    title:'올웨이즈 API 연동 방법', note:'올웨이즈 판매자 계정이 필요합니다.',
    steps:['① 올웨이즈 판매자센터(partners.alwayz.co) 로그인합니다.','② [API 연동] 메뉴에서 API Key를 발급받습니다.','③ 판매자 ID와 API Key를 입력하고 저장합니다.'],
    links:[{label:'올웨이즈 파트너',url:'https://partners.alwayz.co'}],
  },
  cafe24: {
    title:'카페24 API 연동 방법', note:'카페24 판매자 계정과 개발자 앱이 필요합니다.',
    steps:[
      '① 카페24 관리자센터(admin.cafe24.com) 로그인합니다.',
      '② [앱스토어] → [개발자센터] → [내 앱 관리] → [앱 만들기]로 새 앱을 생성합니다.',
      '③ 앱 정보와 Redirect URL을 입력하고 [클라이언트 ID / 시크릿]을 복사합니다.',
      '④ OAuth 2.0 흐름: https://{사이트명}.cafe24api.com/api/v2/oauth/authorize 에서 코드 발급',
      '⑤ POST https://{사이트명}.cafe24api.com/api/v2/oauth/token 으로 Access/Refresh Token 발급',
      '⑥ 쇼핑몰 ID, 패스워드, 사이트명, Refresh Token, Access Key를 입력하고 저장합니다.',
    ],
    links:[{label:'카페24 개발자센터',url:'https://developers.cafe24.com'},{label:'OAuth 가이드',url:'https://developers.cafe24.com/docs/api/admin/#oauth-2-0'}],
  },
  fashionplus: {
    title:'패션플러스 API 연동 방법', note:'패션플러스 판매자 계정이 필요합니다.',
    steps:['① 패션플러스 판매자센터 로그인 후 [API 설정] 메뉴로 이동합니다.','② API Key를 발급받아 입력하고 저장합니다.'],
    links:[{label:'패션플러스',url:'https://www.fashionplus.co.kr'}],
  },
  halfclub: {
    title:'하프클럽 API 연동 방법', note:'하프클럽 판매자 계정이 필요합니다.',
    steps:['① 하프클럽 셀러어드민(seller.halfclub.com) 로그인합니다.','② [API 관리]에서 API Key / Secret을 발급받습니다.','③ 판매자 ID, API Key, API Secret을 입력하고 저장합니다.'],
    links:[{label:'하프클럽 셀러어드민',url:'https://seller.halfclub.com'}],
  },
  gsshop: {
    title:'GS SHOP API 연동 방법', note:'GS SHOP 입점 판매자 계정이 필요합니다.',
    steps:['① GS SHOP 판매자센터(seller.gsshop.com) 로그인합니다.','② [시스템 연동] → [API 키 발급]에서 키를 발급받습니다.','③ 판매자 ID, API Key, API Secret을 입력하고 저장합니다.'],
    links:[{label:'GS SHOP 판매자센터',url:'https://seller.gsshop.com'}],
  },
  jasondeal: {
    title:'제이슨딜 API 연동 방법', note:'제이슨딜 판매자 계정이 필요합니다.',
    steps:['① 제이슨딜 파트너센터 로그인 후 [API 연동] 메뉴로 이동합니다.','② API Key를 발급받아 판매자 ID와 함께 입력하고 저장합니다.'],
    links:[{label:'제이슨딜',url:'https://jasondeal.com'}],
  },
  lotteon: {
    title:'롯데온 API 연동 방법', note:'롯데온 판매자 계정이 필요합니다.',
    steps:['① 롯데온 판매자센터(selleron.lotteon.com) 로그인합니다.','② [API 연동 관리]에서 API Key / Secret을 발급받습니다.','③ 판매자 ID, API Key, API Secret을 입력하고 저장합니다.'],
    links:[{label:'롯데온 판매자센터',url:'https://selleron.lotteon.com'}],
  },
  ssg: {
    title:'SSG.COM API 연동 방법', note:'SSG.COM 입점 판매자 계정이 필요합니다.',
    steps:['① SSG.COM 판매자지원센터(ssgpartner.com) 로그인합니다.','② [API 관리]에서 API Key / Secret을 발급받습니다.','③ 판매자 ID, API Key, API Secret을 입력하고 저장합니다.'],
    links:[{label:'SSG 파트너',url:'https://www.ssgpartner.com'}],
  },
  toss: {
    title:'토스쇼핑 API 연동 방법', note:'토스쇼핑 판매자 계정이 필요합니다.',
    steps:['① 토스쇼핑 판매자센터(partners.toss.im) 로그인합니다.','② [API 설정]에서 API Key를 발급받습니다.','③ 판매자 ID와 API Key를 입력하고 저장합니다.'],
    links:[{label:'토스쇼핑 파트너',url:'https://partners.toss.im'}],
  },
  kakaostore: {
    title:'카카오 톡스토어 API 연동 방법', note:'카카오 비즈니스 계정과 채널이 필요합니다.',
    steps:[
      '① 카카오 비즈니스(business.kakao.com) 로그인 후 [내 비즈니스] → [채널] 선택합니다.',
      '② [설정] → [비즈니스 채널 연결]에서 채널 ID를 확인합니다.',
      '③ 카카오 개발자(developers.kakao.com)에서 앱 생성 후 REST API Key / Admin Key를 발급받습니다.',
      '④ [카카오쇼핑] → [스토어 개설]에서 톡스토어를 연결합니다.',
      '⑤ 비즈니스 채널 ID, REST API Key, Admin Key를 입력하고 저장합니다.',
    ],
    links:[
      {label:'카카오 비즈니스',url:'https://business.kakao.com'},
      {label:'카카오 개발자',url:'https://developers.kakao.com'},
      {label:'톡스토어 셀러센터',url:'https://store.kakao.com/sellers'},
    ],
  },
}

function openGuideWindow(key: string, name: string) {
  const guide = MALL_GUIDES[key]
  if (!guide) return
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>${guide.title}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Nanum Gothic',sans-serif;background:#f8fafc;color:#1e293b;padding:40px 32px;max-width:660px;margin:0 auto}
h1{font-size:22px;font-weight:900;color:#1e293b;margin-bottom:22px;padding-bottom:14px;border-bottom:2.5px solid #6366f1}
.note{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;font-size:13px;color:#92400e;font-weight:700;margin-bottom:20px}
.card{background:white;border-radius:14px;padding:24px 28px;box-shadow:0 4px 20px rgba(0,0,0,0.07);margin-bottom:24px}
.step{font-size:14px;font-weight:700;color:#334155;line-height:1.9;padding:6px 0;border-bottom:1px dashed #f1f5f9}
.step:last-child{border-bottom:none}
.links{display:flex;flex-direction:column;gap:10px}
.links a{display:inline-flex;align-items:center;gap:8px;background:#6366f1;color:white;text-decoration:none;font-size:13px;font-weight:800;padding:10px 18px;border-radius:10px}
.links a:hover{background:#4f46e5}
h2{font-size:12px;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px}
</style></head><body>
<h1>📋 ${guide.title}</h1>
<div class="note">💡 ${guide.note}</div>
<div class="card">${guide.steps.map(s=>`<div class="step">${s}</div>`).join('')}</div>
<h2>🔗 관련 링크</h2>
<div class="links">${guide.links.map(l=>`<a href="${l.url}" target="_blank">🔗 ${l.label}</a>`).join('')}</div>
</body></html>`
  const w = window.open('', `guide_${key}`, 'width=700,height=640,scrollbars=yes,resizable=yes')
  if (w) { w.document.write(html); w.document.close() }
}

/* ─── 쇼핑몰 카테고리 데이터 ──────────────────────────────────────── */
const MALL_CATS: Record<string, string[]> = {
  coupang:    ['패션의류 > 여성의류 > 원피스','패션의류 > 여성의류 > 블라우스/셔츠','패션의류 > 여성의류 > 바지','패션의류 > 남성의류 > 티셔츠','패션의류 > 남성의류 > 바지','패션잡화 > 가방 > 숄더백','패션잡화 > 가방 > 크로스백','패션잡화 > 가방 > 백팩','패션잡화 > 지갑','패션잡화 > 모자/비니','스포츠/레저 > 스포츠의류'],
  naver:      ['패션의류 > 여성의류 > 원피스','패션의류 > 여성의류 > 블라우스','패션의류 > 여성의류 > 가디건','패션의류 > 여성의류 > 바지','패션의류 > 남성의류 > 티셔츠','패션잡화 > 가방 > 숄더백','패션잡화 > 가방 > 크로스백','패션잡화 > 가방 > 클러치백','패션잡화 > 가방 > 백팩','패션잡화 > 지갑 > 장지갑','패션잡화 > 지갑 > 반지갑'],
  '11st':     ['여성의류 > 원피스','여성의류 > 블라우스','여성의류 > 바지','남성의류 > 티셔츠','남성의류 > 바지','가방/잡화 > 여성가방','가방/잡화 > 남성가방','가방/잡화 > 지갑','스포츠/아웃도어 > 스포츠의류'],
  gmarket:    ['여성패션 > 원피스','여성패션 > 블라우스','여성패션 > 바지','남성패션 > 티셔츠','남성패션 > 바지','가방/잡화 > 여성가방','가방/잡화 > 지갑','스포츠/레저 > 스포츠의류'],
  auction:    ['여성의류 > 원피스','여성의류 > 블라우스','남성의류 > 티셔츠','잡화/가방 > 여성가방','잡화/가방 > 지갑'],
  ablly:      ['아우터 > 코트','아우터 > 자켓','상의 > 니트','상의 > 티셔츠','상의 > 블라우스','하의 > 팬츠','하의 > 스커트','원피스/스커트 > 원피스','가방/지갑 > 숄더백','가방/지갑 > 크로스백','주얼리/액세서리 > 귀걸이'],
  zigzag:     ['아우터 > 코트','아우터 > 자켓','상의 > 니트/가디건','상의 > 블라우스','하의 > 팬츠','하의 > 스커트','원피스 > 미니','원피스 > 미디','가방 > 숄더백','가방 > 미니백','신발 > 구두','액세서리 > 귀걸이'],
  alwayz:     ['의류 > 여성의류','의류 > 남성의류','패션잡화 > 가방','패션잡화 > 지갑','신발'],
  cafe24:     ['상의 > 티셔츠','상의 > 니트','상의 > 블라우스','하의 > 팬츠','하의 > 스커트','아우터 > 코트','아우터 > 자켓','원피스','가방 > 숄더백','가방 > 크로스백','잡화 > 지갑'],
  fashionplus:['아우터 > 코트','아우터 > 자켓','상의 > 니트','상의 > 블라우스','하의 > 팬츠','하의 > 스커트','원피스/치마','가방/잡화 > 숄더백','가방/잡화 > 크로스백'],
  halfclub:   ['여성의류 > 원피스','여성의류 > 블라우스','여성의류 > 바지','남성의류 > 티셔츠','남성의류 > 바지','가방/잡화 > 여성가방','아동의류 > 아동상의'],
  gsshop:     ['패션의류 > 여성의류','패션의류 > 남성의류','패션잡화 > 가방','패션잡화 > 지갑','스포츠 > 스포츠의류'],
  jasondeal:  ['의류 > 여성의류','의류 > 남성의류','패션잡화 > 가방','패션잡화 > 지갑'],
  lotteon:    ['패션의류 > 여성의류 > 원피스','패션의류 > 여성의류 > 블라우스','패션의류 > 남성의류','패션잡화 > 가방','패션잡화 > 지갑','스포츠/레저 > 스포츠의류'],
  ssg:        ['패션의류 > 여성의류 > 원피스','패션의류 > 여성의류 > 블라우스','패션의류 > 남성의류','패션잡화 > 가방 > 숄더백','패션잡화 > 가방 > 크로스백'],
  toss:       ['패션의류 > 여성의류','패션의류 > 남성의류','패션잡화 > 가방','패션잡화 > 지갑'],
  kakaostore: ['패션의류 > 여성패션 > 원피스','패션의류 > 여성패션 > 블라우스','패션의류 > 여성패션 > 바지','패션의류 > 남성패션 > 티셔츠','패션의류 > 남성패션 > 바지','패션잡화 > 가방 > 숄더백','패션잡화 > 가방 > 크로스백','패션잡화 > 지갑','액세서리 > 귀걸이','뷰티 > 스킨케어'],
}

/* ─── 배송정보 프리셋 ──────────────────────────────────────────────── */
const DELIVERY_PRESETS = [
  { name:'무료배송 기본형',       values:{ method:'택배', fee_type:'무료', base_fee:'0', free_threshold:'', jeju_fee:'3000', island_fee:'5000', return_fee:'3000', exchange_fee:'6000', lead_days:'2~3', courier:'CJ대한통운', warehouse:'', return_addr:'' } },
  { name:'유료배송 (3,000원)',    values:{ method:'택배', fee_type:'유료', base_fee:'3000', free_threshold:'', jeju_fee:'3000', island_fee:'5000', return_fee:'3000', exchange_fee:'6000', lead_days:'2~3', courier:'CJ대한통운', warehouse:'', return_addr:'' } },
  { name:'조건부 무료 (50,000원)', values:{ method:'택배', fee_type:'조건부무료', base_fee:'3000', free_threshold:'50000', jeju_fee:'3000', island_fee:'5000', return_fee:'3000', exchange_fee:'6000', lead_days:'2~3', courier:'CJ대한통운', warehouse:'', return_addr:'' } },
  { name:'퀵배송 (서울/수도권)',   values:{ method:'퀵배송', fee_type:'유료', base_fee:'5000', free_threshold:'', jeju_fee:'', island_fee:'', return_fee:'5000', exchange_fee:'10000', lead_days:'당일~1', courier:'자체배송', warehouse:'', return_addr:'' } },
]

/* ─── 배송정보 기본틀 ────────────────────────────────────────────── */
const DELIVERY_TEMPLATE = {
  method:'', fee_type:'', base_fee:'', free_threshold:'',
  jeju_fee:'', island_fee:'', return_fee:'', exchange_fee:'',
  lead_days:'', courier:'', warehouse:'', return_addr:'',
}
type DeliveryInfo = typeof DELIVERY_TEMPLATE

/* ─── 타입 ──────────────────────────────────────────────────────── */
type MallCategory = { id:string; displayName:string; mallCat:string }
type ChannelData = {
  key:string; name:string; domain:string; color:string
  active:boolean; seller_id:string; api_key:string; api_secret:string
  site_name:string; refresh_token:string; access_key:string
  synced:number; orders:number
  categories: MallCategory[]
  delivery: DeliveryInfo
}

const STORAGE_KEY = 'pm_mall_channels_v3'

function makeChannel(mall: typeof ALL_MALLS[0]): ChannelData {
  return { ...mall, active:false, seller_id:'', api_key:'', api_secret:'', site_name:'', refresh_token:'', access_key:'', synced:0, orders:0, categories:[], delivery:{...DELIVERY_TEMPLATE} }
}
function loadChannels(): ChannelData[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (raw) {
      const saved: ChannelData[] = JSON.parse(raw)
      return ALL_MALLS.map(m => saved.find(s => s.key===m.key) ?? makeChannel(m))
    }
  } catch {}
  return ALL_MALLS.map(makeChannel)
}
function saveChannels(chs: ChannelData[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chs)) } catch {}
}

/* ─── 로고 컴포넌트 ─────────────────────────────────────────────── */
function MallLogo({ domain, name, size=44 }: { domain:string; name:string; size?:number }) {
  const [err, setErr] = useState(false)
  return (
    <div style={{ width:size, height:size, borderRadius:size*0.28, background:'white', border:'1.5px solid rgba(0,0,0,0.08)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,0.10)' }}>
      {!err
        ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={name}
            style={{ width:size*0.62, height:size*0.62, objectFit:'contain' }}
            onError={() => setErr(true)}/>
        : <span style={{ fontSize:size*0.42 }}>🛒</span>
      }
    </div>
  )
}

/* ─── 메인 ──────────────────────────────────────────────────────── */
export default function ChannelsPage() {
  const [channels, setChannels]   = useState<ChannelData[]>([])
  const [mounted, setMounted]     = useState(false)

  // 모달 상태
  const [addOpen, setAddOpen]                       = useState(false)
  const [apiTarget, setApiTarget]                   = useState<ChannelData|null>(null)
  const [mallInfoTarget, setMallInfoTarget]         = useState<ChannelData|null>(null)
  const [mallInfoTab, setMallInfoTab]               = useState<'category'|'delivery'>('category')
  const [confirmDisconnect, setConfirmDisconnect]   = useState<ChannelData|null>(null)

  // API 폼
  const [apiForm, setApiForm] = useState<Record<string,string>>({})

  // 카테고리 폼
  const [catInput, setCatInput]     = useState('')          // 검색어/직접입력
  const [catDisplay, setCatDisplay] = useState('')          // 등록명
  const [catSearchOpen, setCatSearchOpen] = useState(false) // 검색 모달
  const [catSearchLoading, setCatSearchLoading] = useState(false)
  const [catSearchResults, setCatSearchResults] = useState<string[]>([])
  const [catSearchQuery, setCatSearchQuery] = useState('')

  // 배송정보 폼
  const [deliveryForm, setDeliveryForm]     = useState<DeliveryInfo>({...DELIVERY_TEMPLATE})
  const [deliveryPresetOpen, setDeliveryPresetOpen] = useState(false) // 불러오기 모달

  useEffect(() => { setChannels(loadChannels()); setMounted(true) }, [])

  const update = (updated: ChannelData[]) => { setChannels(updated); saveChannels(updated) }
  const active = channels.filter(c => c.active)

  /* ── API 설정 ── */
  const openApi = (ch: ChannelData) => {
    setApiTarget(ch)
    const init: Record<string,string> = { seller_id:ch.seller_id, api_key:ch.api_key, api_secret:ch.api_secret, site_name:ch.site_name||'', refresh_token:ch.refresh_token||'', access_key:ch.access_key||'' }
    setApiForm(init)
  }
  const saveApi = () => {
    if (!apiTarget) return
    update(channels.map(c => c.key===apiTarget.key ? { ...c, ...apiForm, active:true } : c))
    setApiTarget(null)
  }

  /* ── 카테고리/배송 열기 ── */
  const openMallInfo = (ch: ChannelData) => {
    setMallInfoTarget(ch)
    setMallInfoTab('category')
    setDeliveryForm({...DELIVERY_TEMPLATE, ...ch.delivery})
    setCatInput(''); setCatDisplay(''); setCatSearchResults([])
  }

  /* ── 카테고리 검색 ── */
  const handleCatSearch = () => {
    if (!mallInfoTarget) return
    setCatSearchOpen(true)
    setCatSearchLoading(true)
    setCatSearchQuery(catInput)
    setTimeout(() => {
      const all = MALL_CATS[mallInfoTarget.key] || []
      const q   = catInput.trim().toLowerCase()
      setCatSearchResults(q ? all.filter(c => c.toLowerCase().includes(q)) : all)
      setCatSearchLoading(false)
    }, 500)
  }

  /* ── 카테고리 선택 ── */
  const selectCategory = (cat: string) => {
    setCatInput(cat)
    if (!catDisplay) setCatDisplay(cat.split('>').pop()?.trim() || cat)
    setCatSearchOpen(false)
  }

  /* ── 카테고리 추가 ── */
  const addCategory = () => {
    if (!mallInfoTarget || !catDisplay.trim()) return
    const cat: MallCategory = { id:String(Date.now()), displayName:catDisplay.trim(), mallCat:catInput.trim() }
    const updated = channels.map(c => c.key===mallInfoTarget.key ? { ...c, categories:[...c.categories, cat] } : c)
    update(updated)
    setMallInfoTarget(prev => prev ? { ...prev, categories:[...prev.categories, cat] } : prev)
    setCatInput(''); setCatDisplay('')
  }
  const removeCategory = (catId: string) => {
    if (!mallInfoTarget) return
    const updated = channels.map(c => c.key===mallInfoTarget.key ? { ...c, categories:c.categories.filter(ct=>ct.id!==catId) } : c)
    update(updated)
    setMallInfoTarget(prev => prev ? { ...prev, categories:prev.categories.filter(ct=>ct.id!==catId) } : prev)
  }

  /* ── 배송정보 프리셋 적용 ── */
  const applyDeliveryPreset = (preset: typeof DELIVERY_PRESETS[0]) => {
    setDeliveryForm({ ...DELIVERY_TEMPLATE, ...preset.values })
    setDeliveryPresetOpen(false)
  }

  /* ── 배송정보 저장 ── */
  const saveDelivery = () => {
    if (!mallInfoTarget) return
    const updated = channels.map(c => c.key===mallInfoTarget.key ? { ...c, delivery:deliveryForm } : c)
    update(updated)
    setMallInfoTarget(prev => prev ? { ...prev, delivery:deliveryForm } : prev)
  }

  /* ── 연동 해제 ── */
  const handleDisconnect = (key: string) => {
    update(channels.map(c => c.key===key ? { ...c, active:false, seller_id:'', api_key:'', api_secret:'', synced:0, orders:0 } : c))
    setConfirmDisconnect(null)
  }

  const availableMalls = channels.filter(c => !c.active)

  if (!mounted) return null

  return (
    <div className="pm-page space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:'연동 쇼핑몰', v:`${active.length}개`,                              color:'#2563eb', bg:'#eff6ff' },
          { label:'오늘 주문',   v:`${active.reduce((s,c)=>s+c.orders,0)}건`,          color:'#059669', bg:'#ecfdf5' },
          { label:'연동 상품',   v:`${active.reduce((s,c)=>s+c.synced,0)}개`,          color:'#7e22ce', bg:'#fdf4ff' },
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
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <MallLogo domain={ch.domain} name={ch.name}/>
                    <div>
                      <p style={{ fontWeight:900, color:'#1e293b', fontSize:14 }}>{ch.name}</p>
                      {ch.seller_id && <p style={{ fontSize:11, color:'#94a3b8', marginTop:2, fontFamily:'monospace' }}>ID: {ch.seller_id}</p>}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:800, color:'#15803d', background:'#f0fdf4', padding:'3px 9px', borderRadius:99, border:'1px solid #bbf7d0' }}>
                      <CheckCircle2 size={10}/>연동중
                    </span>
                    <button onClick={() => setConfirmDisconnect(ch)}
                      style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11, fontWeight:800, color:'#be123c', background:'#fff1f2', border:'1px solid #fecdd3', padding:'3px 8px', borderRadius:99, cursor:'pointer' }}>
                      <Unlink size={10}/>해제
                    </button>
                  </div>
                </div>

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
                {ch.delivery.fee_type && (
                  <p style={{ fontSize:11, color:'#64748b', marginBottom:10 }}>
                    📦 {ch.delivery.fee_type}{ch.delivery.base_fee?` ₩${ch.delivery.base_fee}`:''}{ch.delivery.courier?` · ${ch.delivery.courier}`:''}
                  </p>
                )}

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
          <p style={{ textAlign:'center', fontSize:13, fontWeight:700, color:'#94a3b8', padding:'16px 0' }}>모든 쇼핑몰이 이미 연동되어 있습니다.</p>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {availableMalls.map(ch => (
              <button key={ch.key}
                onClick={() => { setAddOpen(false); openApi(ch) }}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', border:'1.5px solid rgba(15,23,42,0.09)', borderRadius:14, background:'white', cursor:'pointer', textAlign:'left' }}
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
        const fields = MALL_API_FIELDS[apiTarget.key] || [
          { key:'seller_id', label:'판매자 ID / 계정', placeholder:'판매자 ID 또는 이메일', type:'text' as const },
          { key:'api_key',   label:'API Key',          placeholder:'API Key 입력',          type:'password' as const },
          { key:'api_secret',label:'API Secret',       placeholder:'API Secret 입력',       type:'password' as const },
        ]
        const hasGuide = !!MALL_GUIDES[apiTarget.key]
        return (
          <Modal isOpen onClose={() => setApiTarget(null)} title={`${apiTarget.name} API 설정`} size="md">
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className={`bg-gradient-to-r ${apiTarget.color}`} style={{ borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
                <MallLogo domain={apiTarget.domain} name={apiTarget.name} size={44}/>
                <div style={{ flex:1 }}>
                  <p style={{ fontWeight:900, color:'white', fontSize:15 }}>{apiTarget.name}</p>
                  <p style={{ color:'rgba(255,255,255,0.75)', fontSize:12, fontWeight:700, marginTop:2 }}>API 연동 설정</p>
                </div>
                <button
                  onClick={() => openGuideWindow(apiTarget.key, apiTarget.name)}
                  style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.22)', border:'1.5px solid rgba(255,255,255,0.5)', borderRadius:10, padding:'7px 14px', color:'white', fontSize:12, fontWeight:800, cursor:'pointer', whiteSpace:'nowrap' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.38)'}
                  onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.22)'}
                >
                  <BookOpen size={13}/>연동방법
                </button>
              </div>

              {fields.map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label style={{ display:'block', fontSize:12, fontWeight:800, color:'#475569', marginBottom:6 }}>{label}</label>
                  <input
                    type={type} placeholder={placeholder}
                    value={apiForm[key] || ''}
                    onChange={e => setApiForm(f => ({...f, [key]:e.target.value}))}
                    style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:9, padding:'8px 12px', fontSize:13, outline:'none', fontFamily: type==='password' ? 'monospace' : 'inherit' }}
                  />
                </div>
              ))}

              <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'10px 14px', fontSize:12, fontWeight:700, color:'#92400e' }}>
                💡 [연동방법] 버튼을 클릭하면 {apiTarget.name} API 키 발급 방법을 새 창에서 확인할 수 있습니다.
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                <Button variant="outline" onClick={() => setApiTarget(null)}>취소</Button>
                <Button onClick={saveApi}><Zap size={13}/>저장하고 연동 시작</Button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* ── 카테고리/배송 모달 ── */}
      {mallInfoTarget && (
        <Modal isOpen onClose={() => setMallInfoTarget(null)} title={`${mallInfoTarget.name} — 카테고리 / 배송정보`} size="xl">
          {/* 탭 */}
          <div style={{ display:'flex', borderBottom:'2px solid #f1f5f9', marginBottom:18 }}>
            {([['category','📂 카테고리'],['delivery','🚚 배송정보']] as const).map(([t, label])=>(
              <button key={t} onClick={() => setMallInfoTab(t)}
                style={{ padding:'8px 22px', fontSize:13, fontWeight:800, background:'none', border:'none', cursor:'pointer',
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
                상품 등록 시 사용할 <b>{mallInfoTarget.name}</b> 카테고리를 추가하세요.
              </p>
              <div style={{ background:'#f8fafc', borderRadius:12, padding:14, marginBottom:16, display:'flex', flexDirection:'column', gap:10 }}>
                {/* 카테고리 입력 + 검색 버튼 */}
                <div>
                  <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:5 }}>
                    쇼핑몰 카테고리 <span style={{ fontSize:10.5, color:'#94a3b8', fontWeight:600 }}>(직접 입력 또는 검색 버튼으로 선택)</span>
                  </label>
                  <div style={{ display:'flex', gap:6 }}>
                    <div style={{ position:'relative', flex:1 }}>
                      <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}/>
                      <input value={catInput} onChange={e => setCatInput(e.target.value)}
                        onKeyDown={e => e.key==='Enter' && handleCatSearch()}
                        placeholder={`${mallInfoTarget.name} 카테고리 입력 또는 검색`}
                        style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px 7px 30px', fontSize:13, outline:'none' }}/>
                    </div>
                    <button onClick={handleCatSearch}
                      style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 16px', background:'#3b82f6', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer', whiteSpace:'nowrap' }}>
                      <Search size={12}/>카테고리 검색
                    </button>
                  </div>
                  {catInput && (
                    <p style={{ fontSize:11, color:'#3b82f6', marginTop:4, fontWeight:700 }}>
                      선택된 카테고리: {catInput}
                    </p>
                  )}
                </div>

                {/* 등록명 */}
                <div>
                  <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>
                    등록명 * <span style={{ fontSize:10.5, color:'#94a3b8', fontWeight:600 }}>(내 시스템에서 표시될 이름)</span>
                  </label>
                  <input value={catDisplay} onChange={e => setCatDisplay(e.target.value)}
                    placeholder="예) 여성가방, 상의 등"
                    style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                </div>

                <button onClick={addCategory}
                  style={{ alignSelf:'flex-end', display:'flex', alignItems:'center', gap:5, padding:'7px 16px', background:'#7e22ce', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer' }}>
                  <Plus size={12}/>카테고리 추가
                </button>
              </div>

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
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <p style={{ fontSize:12, color:'#64748b' }}>
                  <b>{mallInfoTarget.name}</b> 배송정보를 입력하세요. 상품 전송 시 기본값으로 적용됩니다.
                </p>
                <button onClick={() => setDeliveryPresetOpen(true)}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', background:'#0ea5e9', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
                  <Download size={12}/>배송정보 불러오기
                </button>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {([
                  { k:'method'        , label:'배송방법',           ph:'예) 택배, 직배, 퀵' },
                  { k:'courier'       , label:'택배사',             ph:'예) CJ대한통운, 로젠' },
                  { k:'fee_type'      , label:'배송비 유형',         ph:'무료 / 유료 / 조건부무료' },
                  { k:'base_fee'      , label:'기본 배송비 (원)',    ph:'예) 3000' },
                  { k:'free_threshold', label:'무료배송 기준금액',   ph:'예) 50000' },
                  { k:'lead_days'     , label:'배송기간 (영업일)',   ph:'예) 2~3' },
                  { k:'jeju_fee'      , label:'제주 추가배송비',     ph:'예) 3000' },
                  { k:'island_fee'    , label:'도서산간 추가배송비', ph:'예) 5000' },
                  { k:'return_fee'    , label:'반품 배송비',        ph:'예) 3000' },
                  { k:'exchange_fee'  , label:'교환 배송비',        ph:'예) 6000' },
                ] as {k:keyof DeliveryInfo; label:string; ph:string}[]).map(({ k, label, ph }) => (
                  <div key={k}>
                    <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>{label}</label>
                    <input value={deliveryForm[k]} onChange={e => setDeliveryForm(d => ({...d, [k]:e.target.value}))}
                      placeholder={ph}
                      style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                  </div>
                ))}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>출고지</label>
                  <input value={deliveryForm.warehouse} onChange={e => setDeliveryForm(d => ({...d, warehouse:e.target.value}))}
                    placeholder="출고 창고 주소" style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:11.5, fontWeight:800, color:'#475569', display:'block', marginBottom:4 }}>반품/교환지</label>
                  <input value={deliveryForm.return_addr} onChange={e => setDeliveryForm(d => ({...d, return_addr:e.target.value}))}
                    placeholder="반품/교환 주소" style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
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

      {/* ── 카테고리 검색 모달 ── */}
      <Modal isOpen={catSearchOpen} onClose={() => setCatSearchOpen(false)} title={`카테고리 검색 — ${mallInfoTarget?.name}`} size="md">
        <div style={{ display:'flex', gap:6, marginBottom:12 }}>
          <div style={{ position:'relative', flex:1 }}>
            <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}/>
            <input value={catSearchQuery} onChange={e => setCatSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key==='Enter' && mallInfoTarget) {
                  const all = MALL_CATS[mallInfoTarget.key] || []
                  const q   = catSearchQuery.trim().toLowerCase()
                  setCatSearchResults(q ? all.filter(c => c.toLowerCase().includes(q)) : all)
                }
              }}
              placeholder="카테고리 검색어 입력 후 Enter"
              style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px 7px 30px', fontSize:13, outline:'none' }}/>
          </div>
          <button onClick={() => {
            if (!mallInfoTarget) return
            const all = MALL_CATS[mallInfoTarget.key] || []
            const q   = catSearchQuery.trim().toLowerCase()
            setCatSearchResults(q ? all.filter(c => c.toLowerCase().includes(q)) : all)
          }}
            style={{ padding:'7px 16px', background:'#3b82f6', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer' }}>
            검색
          </button>
        </div>

        {catSearchLoading ? (
          <div style={{ textAlign:'center', padding:'24px 0', color:'#94a3b8', fontSize:13, fontWeight:700 }}>
            🔍 카테고리 불러오는 중...
          </div>
        ) : catSearchResults.length === 0 ? (
          <div style={{ textAlign:'center', padding:'24px 0', color:'#94a3b8', fontSize:13 }}>
            {catSearchQuery ? '검색 결과가 없습니다.' : '검색어를 입력하세요.'}
          </div>
        ) : (
          <div style={{ maxHeight:320, overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:10 }}>
            {catSearchResults.map((cat, i) => (
              <button key={i} onClick={() => selectCategory(cat)}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 16px', fontSize:13, fontWeight:700, color:'#334155', background:'none', border:'none', cursor:'pointer', borderBottom: i<catSearchResults.length-1 ? '1px solid #f1f5f9' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background='#eff6ff'}
                onMouseLeave={e => e.currentTarget.style.background='none'}>
                <span style={{ fontSize:11, color:'#94a3b8', marginRight:8 }}>📂</span>{cat}
              </button>
            ))}
          </div>
        )}
        <p style={{ fontSize:11, color:'#94a3b8', marginTop:10, fontWeight:600 }}>
          * 실제 연동 후에는 {mallInfoTarget?.name} API를 통해 전체 카테고리 트리가 조회됩니다.
        </p>
      </Modal>

      {/* ── 배송정보 불러오기 모달 ── */}
      <Modal isOpen={deliveryPresetOpen} onClose={() => setDeliveryPresetOpen(false)} title={`배송정보 불러오기 — ${mallInfoTarget?.name}`} size="md">
        <p style={{ fontSize:12, color:'#64748b', marginBottom:14 }}>
          등록된 배송정보 템플릿을 선택하면 자동으로 입력됩니다. 이후 수정도 가능합니다.
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {DELIVERY_PRESETS.map((preset, i) => (
            <button key={i} onClick={() => applyDeliveryPreset(preset)}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', border:'1.5px solid #e2e8f0', borderRadius:12, background:'white', cursor:'pointer', textAlign:'left' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='#0ea5e9'; e.currentTarget.style.background='#f0f9ff' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.background='white' }}>
              <div>
                <p style={{ fontSize:13, fontWeight:800, color:'#1e293b' }}>{preset.name}</p>
                <p style={{ fontSize:11.5, color:'#64748b', marginTop:3 }}>
                  {preset.values.method} · {preset.values.fee_type}
                  {preset.values.base_fee ? ` · ₩${Number(preset.values.base_fee).toLocaleString()}` : ''}
                  {preset.values.courier ? ` · ${preset.values.courier}` : ''}
                  {preset.values.lead_days ? ` · 배송 ${preset.values.lead_days}일` : ''}
                </p>
              </div>
              <span style={{ fontSize:12, fontWeight:800, color:'#0ea5e9', whiteSpace:'nowrap', marginLeft:12 }}>선택 →</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize:11, color:'#94a3b8', marginTop:12, fontWeight:600 }}>
          * 실제 연동 후에는 {mallInfoTarget?.name}에 등록된 배송정보를 API로 불러올 수 있습니다.
        </p>
      </Modal>

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
