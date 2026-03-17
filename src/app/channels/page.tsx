'use client'
import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import {
  RefreshCw, Zap, Plus, CheckCircle2, Unlink,
  Tag, Truck, Search, X, BookOpen, Pencil, Trash2, Save, ChevronRight,
} from 'lucide-react'

/* ─── 전체 쇼핑몰 정의 ────────────────────────────────────────────── */
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

/* ─── API 필드 ─────────────────────────────────────────────────── */
type ApiField = { key:string; label:string; placeholder:string; type:'text'|'password'; section?:string; required?:boolean }
const COMMON_LOGIN_FIELDS: ApiField[] = [
  { key:'login_id', label:'로그인 아이디', placeholder:'판매자 로그인 아이디', type:'text', section:'login', required:true },
  { key:'login_pw', label:'로그인 비밀번호', placeholder:'판매자 로그인 비밀번호', type:'password', section:'login', required:true },
]
const MALL_API_FIELDS: Record<string, ApiField[]> = {
  // 쿠팡: 로그인 + 판매자코드 + Access Key + Secret Key
  coupang: [
    ...COMMON_LOGIN_FIELDS,
    { key:'seller_id', label:'판매자 코드(Vendor ID)', placeholder:'A00xxxxxx', type:'text', section:'api' },
    { key:'api_key',   label:'Access Key',             placeholder:'발급된 Access Key', type:'password', section:'api' },
    { key:'api_secret',label:'Secret Key',             placeholder:'발급된 Secret Key', type:'password', section:'api' },
  ],
  // 스마트스토어: 로그인 + Application ID + Application Secret
  naver: [
    ...COMMON_LOGIN_FIELDS,
    { key:'seller_id', label:'판매자 ID',          placeholder:'스마트스토어 판매자 ID', type:'text',     section:'api' },
    { key:'api_key',   label:'Application ID',     placeholder:'앱 등록 후 발급된 ID',  type:'text',     section:'api' },
    { key:'api_secret',label:'Application Secret', placeholder:'앱 Secret',            type:'password', section:'api' },
  ],
  // 11번가: SCM 로그인ID/PW + SHOP ID(선택) + API 인증키(Open API KEY)
  // ※ SCM [Open API] Seller API 정보의 호스팅여부를 '사방넷'으로 설정해야 연동 가능
  '11st': [
    { key:'login_id',  label:'쇼핑몰ID (SCM 로그인 ID)', placeholder:'SCM 로그인 아이디',           type:'text',     section:'login' },
    { key:'login_pw',  label:'PASSWORD (SCM 비밀번호)',   placeholder:'SCM 비밀번호',               type:'password', section:'login' },
    { key:'seller_id', label:'SHOP ID',                  placeholder:'내부 구분용 (선택사항)',       type:'text',     section:'api' },
    { key:'api_key',   label:'API 인증키 (Open API KEY)', placeholder:'11번가 Open API CENTER에서 승인완료된 KEY', type:'password', section:'api' },
  ],
  // ESM 지마켓: 지마켓 전용 ID/PW (ESM PLUS 마스터 통합 ID 아님!)
  // ※ ESM PLUS '2단계 인증' 해제 필요, 셀링툴 관리에서 '사방넷' 설정 필요
  gmarket: [
    { key:'login_id',  label:'쇼핑몰ID (지마켓 전용)',   placeholder:'지마켓 전용 로그인 ID (ESM PLUS 마스터 ID 아님)', type:'text',     section:'login' },
    { key:'login_pw',  label:'PASSWORD (지마켓 전용)',   placeholder:'+ 기호 사용 금지',            type:'password', section:'login' },
    { key:'seller_id', label:'SHOP ID',                  placeholder:'내부 구분용 (선택사항)',       type:'text',     section:'api' },
  ],
  // ESM 옥션: 옥션 전용 ID/PW (ESM PLUS 마스터 통합 ID 아님!)
  // ※ ESM PLUS '2단계 인증' 해제 필요, 셀링툴 관리에서 '사방넷' 설정 필요
  auction: [
    { key:'login_id',  label:'쇼핑몰ID (옥션 전용)',     placeholder:'옥션 전용 로그인 ID (ESM PLUS 마스터 ID 아님)', type:'text',     section:'login' },
    { key:'login_pw',  label:'PASSWORD (옥션 전용)',     placeholder:'+ 기호 사용 금지',            type:'password', section:'login' },
    { key:'seller_id', label:'SHOP ID',                  placeholder:'내부 구분용 (선택사항)',       type:'text',     section:'api' },
  ],
  // 에이블리: 로그인 + API Token
  ablly: [
    ...COMMON_LOGIN_FIELDS,
    { key:'seller_id', label:'판매자 ID',  placeholder:'에이블리 파트너 ID', type:'text',     section:'api' },
    { key:'api_key',   label:'API Token',  placeholder:'파트너센터에서 발급', type:'password', section:'api' },
  ],
  // 지그재그: 로그인 + API Key + API Secret
  zigzag: [
    ...COMMON_LOGIN_FIELDS,
    { key:'seller_id', label:'판매자 ID',  placeholder:'지그재그 판매자 ID', type:'text',     section:'api' },
    { key:'api_key',   label:'API Key',    placeholder:'셀러어드민 API Key', type:'password', section:'api' },
    { key:'api_secret',label:'API Secret', placeholder:'API Secret',        type:'password', section:'api' },
  ],
  // 올웨이즈: 로그인 + API Key
  alwayz: [
    ...COMMON_LOGIN_FIELDS,
    { key:'seller_id', label:'판매자 ID',  placeholder:'올웨이즈 판매자 ID', type:'text',     section:'api' },
    { key:'api_key',   label:'API Key',    placeholder:'셀러센터에서 발급',  type:'password', section:'api' },
  ],
  // 카페24 유튜브쇼핑: 쇼핑몰 ID + 로그인 + Client ID + Client Secret + Refresh Token
  cafe24: [
    ...COMMON_LOGIN_FIELDS,
    { key:'seller_id',    label:'쇼핑몰 ID',      placeholder:'카페24 쇼핑몰 ID (예: myshop)', type:'text',     section:'api' },
    { key:'api_key',      label:'Client ID',      placeholder:'개발자센터 앱 Client ID',       type:'text',     section:'api' },
    { key:'api_secret',   label:'Client Secret',  placeholder:'Client Secret',               type:'password', section:'api' },
    { key:'refresh_token',label:'Refresh Token',  placeholder:'OAuth2 Refresh Token',         type:'password', section:'api' },
  ],
  // 패션플러스: SCM 로그인ID/PW(필수) + 거래처코드(필수) + 수수료/브랜드코드(선택)
  // ※ 거래처코드 입력 시 API로 자동 연동
  fashionplus: [
    { key:'login_id',  label:'쇼핑몰ID (SCM 로그인 ID)', placeholder:'패션플러스 SCM 로그인 아이디',              type:'text',     section:'login', required:true },
    { key:'login_pw',  label:'PASSWORD (SCM 비밀번호)',   placeholder:'SCM 비밀번호',                            type:'password', section:'login', required:true },
    { key:'api_key',   label:'거래처코드',                placeholder:'패션플러스 SCM에서 확인한 거래처코드 (예: 134873)', type:'text', section:'api', required:true },
    { key:'api_secret',label:'수수료(주문) (%)',          placeholder:'예: 25  (선택사항)',                       type:'text',     section:'api',   required:false },
    { key:'seller_id', label:'브랜드코드',                placeholder:'브랜드관리자 로그인 시 브랜드코드 (선택사항)', type:'text',   section:'api',   required:false },
  ],
  // 하프클럽: Seller ID + API Key + FTP (패션플러스 계열)
  halfclub: [
    { key:'login_id',  label:'쇼핑몰ID (SCM 로그인 ID)', placeholder:'하프클럽 SCM 로그인 ID',     type:'text',     section:'login', required:true },
    { key:'login_pw',  label:'PASSWORD (SCM 비밀번호)',   placeholder:'SCM 비밀번호',             type:'password', section:'login', required:true },
    { key:'seller_id', label:'Seller ID (판매자코드)',    placeholder:'하프클럽 판매자코드',       type:'text',     section:'api',   required:true },
    { key:'api_key',   label:'API Key',                  placeholder:'판매자센터에서 발급',       type:'password', section:'api',   required:true },
    { key:'api_secret',label:'FTP ID',                  placeholder:'FTP 업로드용 계정 ID',      type:'text',     section:'api',   required:false },
    { key:'access_key',label:'FTP Password',             placeholder:'FTP 업로드용 비밀번호',    type:'password', section:'api',   required:false },
  ],
  // GS SHOP: Vendor ID + API Key + Secret Key
  gsshop: [
    ...COMMON_LOGIN_FIELDS,
    { key:'seller_id', label:'Vendor ID (판매자코드)', placeholder:'GS샵 Vendor ID',         type:'text',     section:'api', required:true  },
    { key:'api_key',   label:'API Key',               placeholder:'파트너센터에서 발급',      type:'password', section:'api', required:true  },
    { key:'api_secret',label:'Secret Key',            placeholder:'파트너센터에서 발급',      type:'password', section:'api', required:true  },
  ],
  // 제이슨딜/공구마켓/할인중독/심쿵할인: 로그인 only
  jasondeal: [...COMMON_LOGIN_FIELDS],
  // 롯데온: Partner ID + API Key + Secret Key
  lotteon: [
    ...COMMON_LOGIN_FIELDS,
    { key:'seller_id', label:'Partner ID (파트너코드)', placeholder:'롯데온 Partner ID',      type:'text',     section:'api', required:true  },
    { key:'api_key',   label:'API Key',                placeholder:'파트너센터에서 발급',     type:'password', section:'api', required:true  },
    { key:'api_secret',label:'Secret Key',             placeholder:'파트너센터에서 발급',     type:'password', section:'api', required:true  },
  ],
  // 신세계몰 SSG: Partner ID + API Key + Secret Key
  ssg: [
    ...COMMON_LOGIN_FIELDS,
    { key:'seller_id', label:'Partner ID (파트너코드)', placeholder:'SSG 파트너 ID',          type:'text',     section:'api', required:true  },
    { key:'api_key',   label:'API Key',                placeholder:'파트너센터에서 발급',     type:'password', section:'api', required:true  },
    { key:'api_secret',label:'Secret Key',             placeholder:'파트너센터에서 발급',     type:'password', section:'api', required:true  },
  ],
  // 토스쇼핑: Partner Key + Secret Key + Store ID
  toss: [
    ...COMMON_LOGIN_FIELDS,
    { key:'seller_id',    label:'Store ID',      placeholder:'토스쇼핑 스토어 ID',          type:'text',     section:'api', required:true  },
    { key:'api_key',      label:'Partner Key',   placeholder:'파트너센터 승인 후 발급',     type:'password', section:'api', required:true  },
    { key:'api_secret',   label:'Secret Key',    placeholder:'파트너센터 승인 후 발급',     type:'password', section:'api', required:true  },
  ],
  // 카카오톡스토어: 채널 ID + REST API Key + Admin Key
  kakaostore: [
    ...COMMON_LOGIN_FIELDS,
    { key:'seller_id', label:'카카오 비즈채널 ID', placeholder:'카카오 비즈니스 채널 ID', type:'text',     section:'api' },
    { key:'api_key',   label:'REST API Key',       placeholder:'카카오 REST API Key',    type:'password', section:'api' },
    { key:'api_secret',label:'Admin Key',           placeholder:'카카오 Admin Key',       type:'password', section:'api' },
  ],
}

/* ─── 연동방법 가이드 (강화 버전) ─────────────────────────────── */
type GuideRequiredInfo = { label: string; desc: string; example?: string; badge?: 'required'|'optional' }
type GuideInfo = {
  title    : string
  authType : string
  note     : string
  warning? : string
  required : GuideRequiredInfo[]
  steps    : string[]
  links    : { label:string; url:string }[]
}
const MALL_GUIDES: Record<string, GuideInfo> = {
  coupang: {
    title:'쿠팡 WING API 연동', authType:'HMAC SHA256',
    note:'쿠팡 WING 판매자 계정이 필요합니다. API Key 발급 후 최소 30분 ~ 최대 4시간 후 반영됩니다.',
    warning:'API 키 발급 후 바로 연동 테스트 시 실패할 수 있습니다. 최소 30분 후 다시 시도하세요.',
    required:[
      { label:'판매자 ID (Vendor ID)', desc:'쿠팡 WING의 업체코드 (A로 시작)', example:'A00123456', badge:'required' },
      { label:'Access Key', desc:'OPEN API 발급된 Access Key', badge:'required' },
      { label:'Secret Key', desc:'OPEN API 발급된 Secret Key', badge:'required' },
      { label:'로그인 ID/PW', desc:'WING 판매자 로그인 계정', badge:'required' },
    ],
    steps:[
      '① wing.coupang.com 접속 후 로그인',
      '② 상단 메뉴 [판매자정보] → [추가 판매정보] 클릭',
      '③ 좌측 [OPEN API] 클릭 → [확인] 버튼 클릭',
      '④ 연동 업체 선택 화면에서 [자체 개발] 선택',
      '⑤ Vendor ID / Access Key / Secret Key 확인 및 복사',
      '⑥ 프로그램에 로그인 ID/PW + Vendor ID + Access Key + Secret Key 입력 후 저장',
    ],
    links:[
      { label:'쿠팡 WING', url:'https://wing.coupang.com' },
      { label:'쿠팡 Open API 문서', url:'https://developers.coupangcorp.com' },
    ],
  },
  naver: {
    title:'스마트스토어(네이버 커머스) API 연동', authType:'OAuth 2.0 Bearer Token',
    note:'네이버 커머스 API 센터에서 애플리케이션을 등록해야 합니다.',
    required:[
      { label:'Application ID (Client ID)', desc:'앱 등록 후 발급되는 애플리케이션 ID', badge:'required' },
      { label:'Application Secret', desc:'앱 등록 후 발급되는 시크릿 키', badge:'required' },
      { label:'스토어 ID', desc:'스마트스토어 판매자 ID', badge:'required' },
      { label:'로그인 ID/PW', desc:'스마트스토어센터 로그인 계정', badge:'required' },
    ],
    steps:[
      '① apicenter.commerce.naver.com 접속 → [내 애플리케이션] → [애플리케이션 등록]',
      '② 애플리케이션 이름 입력, 사용 API 선택: 상품 / 주문 / 배송 / 정산 모두 체크',
      '③ 등록 완료 후 Client ID (Application ID) / Client Secret 확인·복사',
      '④ sell.smartstore.naver.com에서 스토어 ID 확인',
      '⑤ 프로그램에 로그인 ID/PW + 스토어 ID + Application ID + Secret 입력 후 저장',
    ],
    links:[
      { label:'스마트스토어센터', url:'https://sell.smartstore.naver.com' },
      { label:'네이버 커머스 API센터', url:'https://apicenter.commerce.naver.com' },
    ],
  },
  '11st': {
    title:'11번가 Open API 연동', authType:'API Key',
    note:'11번가 Open API CENTER에서 서비스 등록 후 승인완료 상태의 Key를 사용해야 합니다.',
    warning:'⚠ SCM [Open API] Seller API 정보의 호스팅여부를 반드시 "사방넷"으로 설정해야 연동 가능합니다.',
    required:[
      { label:'SCM 로그인 ID', desc:'11번가 SCM(스마트R) 로그인 아이디', badge:'required' },
      { label:'SCM 비밀번호', desc:'11번가 SCM 비밀번호', badge:'required' },
      { label:'API 인증키 (Open API KEY)', desc:'Open API CENTER에서 승인완료된 KEY', badge:'required' },
      { label:'SHOP ID', desc:'내부 구분용 (선택사항)', badge:'optional' },
    ],
    steps:[
      '① seller.11st.co.kr (SCM) 로그인',
      '② 하단 [11번가 Open API CENTER] 클릭 → [서비스 등록·확인] 탭 이동',
      '③ 서비스 등록 후 상태가 "승인완료"인 OPEN API KEY 복사',
      '④ [Seller API 정보 수정] → 호스팅여부를 반드시 "사방넷"으로 설정 후 저장',
      '⑤ 프로그램에 SCM 로그인 ID/PW + 승인완료된 API 인증키 입력 후 저장',
    ],
    links:[
      { label:'11번가 SCM(스마트R)', url:'https://seller.11st.co.kr' },
      { label:'11번가 Open API CENTER', url:'https://openapi.11st.co.kr' },
    ],
  },
  gmarket: {
    title:'G마켓 ESM 연동', authType:'ESM+ ID/PW 인증',
    note:'G마켓 전용 계정을 사용합니다. ESM PLUS 마스터 통합 ID로는 연동이 불가합니다.',
    warning:'⚠ 비밀번호에 + 기호 사용 금지 · ESM PLUS 2단계 인증을 반드시 해제해야 합니다.',
    required:[
      { label:'G마켓 전용 ID', desc:'G마켓 전용 로그인 ID (ESM PLUS 마스터 ID 아님)', badge:'required' },
      { label:'G마켓 전용 PW', desc:'+ 기호 사용 금지', badge:'required' },
      { label:'SHOP ID', desc:'내부 구분용 (선택사항)', badge:'optional' },
    ],
    steps:[
      '① ESM PLUS (esmplus.com) 접속 후 [판매자정보 > 보안관리]',
      '② 2단계 인증관리 상태 "해제"로 변경 (필수!)',
      '③ [판매자정보 > 셀링툴 관리] → 셀링툴 사용여부 "사용함"',
      '④ 셀링툴 업체 선택 → 상품/주문 모두 "사방넷" 선택 후 저장',
      '⑤ 프로그램에 G마켓 전용 ID/PW 입력 후 저장 (ESM PLUS 마스터 ID 아님!)',
    ],
    links:[{ label:'ESM PLUS', url:'https://www.esmplus.com' }],
  },
  auction: {
    title:'옥션 ESM 연동', authType:'ESM+ ID/PW 인증',
    note:'옥션 전용 계정을 사용합니다. G마켓과 같은 ESM API를 공유합니다.',
    warning:'⚠ ID는 소문자만 입력 · 비밀번호에 + 기호 사용 금지 · ESM PLUS 2단계 인증 해제 필수',
    required:[
      { label:'옥션 전용 ID', desc:'옥션 전용 로그인 ID (소문자만, ESM PLUS 마스터 ID 아님)', badge:'required' },
      { label:'옥션 전용 PW', desc:'+ 기호 사용 금지', badge:'required' },
      { label:'API Key', desc:'ESM PLUS에서 발급된 API Key', badge:'required' },
      { label:'SHOP ID', desc:'내부 구분용 (선택사항)', badge:'optional' },
    ],
    steps:[
      '① ESM PLUS (esmplus.com) [판매자정보 > 보안관리] → 2단계 인증 "적용안함" 설정',
      '② [판매자정보 > 셀링툴 관리] → 셀링툴 사용여부 "사용함"',
      '③ 상품/주문 모두 "사방넷" 선택 후 저장',
      '④ [판매자정보 > API 관리] → API Key 발급 또는 확인·복사',
      '⑤ 프로그램에 옥션 전용 ID(소문자)/PW + API Key 입력 후 저장',
    ],
    links:[{ label:'ESM PLUS', url:'https://www.esmplus.com' }],
  },
  ablly: {
    title:'에이블리 파트너 API 연동', authType:'API Token (파트너 승인 방식)',
    note:'에이블리는 파트너 승인 후 API Token이 발급됩니다. 자동 발급이 아니라 수동 심사 방식입니다.',
    warning:'⚠ 에이블리 옵션 구조는 일반 쇼핑몰과 다릅니다. 옵션상품(SKU) 단위로 업로드됩니다.',
    required:[
      { label:'Partner ID', desc:'에이블리 파트너 ID', badge:'required' },
      { label:'Store ID', desc:'스토어 ID', badge:'required' },
      { label:'API Token', desc:'파트너센터 승인 후 발급되는 Access Token', badge:'required' },
    ],
    steps:[
      '① partner.a-bly.com 로그인 후 [설정] → [파트너 연동] → [API 연동 신청]',
      '② 에이블리 담당자 승인 대기 (자동 발급 아님, 수동 심사)',
      '③ 승인 완료 후 Partner ID / API Token 발급',
      '④ 프로그램에 Partner ID + Store ID + API Token 입력 후 저장',
    ],
    links:[{ label:'에이블리 파트너센터', url:'https://partner.a-bly.com' }],
  },
  zigzag: {
    title:'지그재그(카카오스타일) API 연동', authType:'API Key + Secret',
    note:'지그재그는 카카오스타일 파트너 API입니다. 파트너센터에서 API 연동 신청 후 승인을 받아야 합니다.',
    warning:'⚠ 이미지 비율 엄격(정사각형 2000px 권장) · 카테고리 매우 세분화됨',
    required:[
      { label:'Partner ID', desc:'지그재그 파트너 ID', badge:'required' },
      { label:'Shop ID', desc:'스토어 Shop ID', badge:'required' },
      { label:'API Key', desc:'개발자센터에서 발급된 API Key', badge:'required' },
      { label:'API Secret', desc:'API Secret Key', badge:'required' },
    ],
    steps:[
      '① partner.zigzag.kr 접속 후 로그인',
      '② [개발자센터] → [API 연동 신청] 클릭',
      '③ 승인 후 Partner ID / API Key / Secret Key 발급 확인',
      '④ 프로그램에 Partner ID + Shop ID + API Key + Secret 입력 후 저장',
    ],
    links:[{ label:'지그재그 파트너센터', url:'https://partner.zigzag.kr' }],
  },
  alwayz: {
    title:'올웨이즈 API 연동', authType:'API Key + Secret',
    note:'올웨이즈는 공동구매 플랫폼으로 API가 제한적입니다. 파트너센터에서 승인 후 발급됩니다.',
    warning:'⚠ 공동구매 가격 구조 — 할인율 필수, 재고 필수 입력',
    required:[
      { label:'Partner ID', desc:'올웨이즈 파트너 ID', badge:'required' },
      { label:'API Key', desc:'파트너센터 승인 후 발급', badge:'required' },
      { label:'Secret Key', desc:'API Secret Key', badge:'required' },
    ],
    steps:[
      '① partner.alwayz.co.kr 접속 후 로그인',
      '② [개발자 연동] → [API 신청] 클릭',
      '③ 승인 후 API Key / Secret Key 발급 확인',
      '④ 프로그램에 Partner ID + API Key + Secret Key 입력 후 저장',
    ],
    links:[{ label:'올웨이즈 파트너센터', url:'https://partner.alwayz.co.kr' }],
  },
  cafe24: {
    title:'카페24 OAuth API 연동', authType:'OAuth 2.0',
    note:'카페24 개발자센터에서 앱을 생성하고 OAuth 인증을 완료해야 합니다.',
    required:[
      { label:'Mall ID', desc:'카페24 쇼핑몰 ID (예: myshop)', example:'myshop', badge:'required' },
      { label:'Client ID', desc:'개발자센터 앱 Client ID', badge:'required' },
      { label:'Client Secret', desc:'개발자센터 앱 Client Secret', badge:'required' },
      { label:'Refresh Token', desc:'OAuth2 인증 후 발급되는 Refresh Token', badge:'required' },
    ],
    steps:[
      '① developers.cafe24.com 로그인 → [앱 개발] → [앱 생성]',
      '② 권한 선택: 상품 / 주문 / 고객 / 배송 모두 체크',
      '③ Redirect URI 설정 (예: https://yourdomain.com/oauth)',
      '④ Client ID / Client Secret 확인·복사',
      '⑤ OAuth 인증 URL로 이동 → 로그인 후 Access Token / Refresh Token 발급',
      '⑥ 프로그램에 Mall ID + Client ID + Client Secret + Refresh Token 입력 후 저장',
    ],
    links:[
      { label:'카페24 개발자센터', url:'https://developers.cafe24.com' },
    ],
  },
  fashionplus: {
    title:'패션플러스 SCM 연동', authType:'거래처코드 + ID/PW',
    note:'거래처코드가 반드시 필요합니다. 거래처코드 입력 시 API로 자동 연동됩니다.',
    warning:'⚠ 이미지는 FTP 업로드 후 API로 상품 등록하는 2단계 구조입니다.',
    required:[
      { label:'SCM 로그인 ID', desc:'패션플러스 SCM 로그인 아이디', badge:'required' },
      { label:'SCM 비밀번호', desc:'SCM 비밀번호', badge:'required' },
      { label:'거래처코드', desc:'SCM [사용자정보]에서 확인 (예: 134873)', example:'134873', badge:'required' },
      { label:'수수료(%)', desc:'주문 수수료 — 공급가 계산에 적용', badge:'optional' },
      { label:'브랜드코드', desc:'브랜드관리자 로그인 시에만 해당', badge:'optional' },
    ],
    steps:[
      '━━━ 거래처코드 확인 방법 ━━━',
      '① fashionplus.co.kr → 상단 메뉴 [공지/기본정보] 클릭',
      '② 드롭다운에서 [사용자정보] 선택',
      '③ "1. 거래처 기본 정보" 섹션에서 거래처코드 확인·복사 (예: 134873)',
      '━━━ 연동 설정 ━━━',
      '④ SCM 로그인 ID / PW 입력 (★필수)',
      '⑤ 확인한 거래처코드 입력 (★필수)',
      '⑥ 수수료(주문) 입력 (선택)',
      '⑦ 저장 클릭',
    ],
    links:[{ label:'패션플러스 SCM', url:'https://scm.fashionplus.co.kr' }],
  },
  halfclub: {
    title:'하프클럽 API 연동', authType:'Seller ID + API Key + FTP',
    note:'패션플러스와 같은 계열입니다. 상품 등록 XML 방식 + 이미지 FTP 업로드 구조입니다.',
    warning:'⚠ 상품 등록 시 XML 방식 사용, 이미지는 FTP 업로드 후 연동됩니다.',
    required:[
      { label:'SCM 로그인 ID', desc:'하프클럽 SCM 로그인 아이디', badge:'required' },
      { label:'SCM 비밀번호', desc:'SCM 비밀번호', badge:'required' },
      { label:'Seller ID (판매자코드)', desc:'하프클럽 판매자코드', badge:'required' },
      { label:'API Key', desc:'판매자센터에서 발급된 API Key', badge:'required' },
      { label:'FTP ID', desc:'이미지 업로드용 FTP 계정 ID', badge:'optional' },
      { label:'FTP Password', desc:'FTP 비밀번호', badge:'optional' },
    ],
    steps:[
      '① seller.halfclub.com 접속 후 로그인',
      '② [연동관리] → [API 연동] → 연동 신청',
      '③ 승인 후 Seller ID / API Key 발급 확인',
      '④ FTP 계정 정보 확인 (이미지 업로드용)',
      '⑤ 프로그램에 SCM 로그인 + Seller ID + API Key + FTP 정보 입력 후 저장',
    ],
    links:[{ label:'하프클럽 판매자센터', url:'https://seller.halfclub.com' }],
  },
  gsshop: {
    title:'GS SHOP 파트너 API 연동', authType:'Vendor ID + API Key + Secret',
    note:'GS샵 파트너센터에서 API 연동을 신청해야 합니다. 상품 등록 후 심사가 필요합니다.',
    warning:'⚠ GS샵은 상품 등록 후 심사 과정이 있습니다.',
    required:[
      { label:'로그인 ID/PW', desc:'GS샵 판매자 로그인 계정', badge:'required' },
      { label:'Vendor ID', desc:'GS샵 판매자(벤더) 코드', badge:'required' },
      { label:'API Key', desc:'파트너센터에서 발급된 API Key', badge:'required' },
      { label:'Secret Key', desc:'파트너센터에서 발급된 Secret Key', badge:'required' },
    ],
    steps:[
      '① partner.gsshop.com 접속 후 로그인',
      '② [개발자 API] → [연동 신청] 클릭',
      '③ 승인 후 Vendor ID / API Key / Secret Key 확인·복사',
      '④ 프로그램에 로그인 ID/PW + Vendor ID + API Key + Secret Key 입력 후 저장',
    ],
    links:[{ label:'GS샵 파트너센터', url:'https://partner.gsshop.com' }],
  },
  ssg: {
    title:'SSG닷컴(신세계몰) API 연동', authType:'Partner ID + API Key + Secret',
    note:'SSG 파트너센터에서 API 연동을 신청해야 합니다. 상품 브랜드 인증이 필요합니다.',
    warning:'⚠ SSG닷컴은 상품 승인 필수 및 브랜드 인증이 필요합니다.',
    required:[
      { label:'로그인 ID/PW', desc:'SSG 판매자 로그인 계정', badge:'required' },
      { label:'Partner ID', desc:'SSG 파트너 코드', badge:'required' },
      { label:'API Key', desc:'파트너센터에서 발급된 API Key', badge:'required' },
      { label:'Secret Key', desc:'API Secret Key', badge:'required' },
    ],
    steps:[
      '① partner.ssg.com 접속 후 로그인',
      '② [API 연동] → [신청] 클릭',
      '③ 승인 후 Partner ID / API Key / Secret Key 확인·복사',
      '④ 프로그램에 로그인 ID/PW + Partner ID + API Key + Secret Key 입력 후 저장',
    ],
    links:[{ label:'SSG 파트너센터', url:'https://partner.ssg.com' }],
  },
  lotteon: {
    title:'롯데온 파트너 API 연동', authType:'Partner ID + API Key + Secret',
    note:'롯데온 파트너센터에서 API 연동을 신청해야 합니다.',
    warning:'⚠ 롯데온은 상품 승인이 필요하며 카테고리 제한이 많습니다.',
    required:[
      { label:'로그인 ID/PW', desc:'롯데온 판매자 로그인 계정', badge:'required' },
      { label:'Partner ID', desc:'롯데온 파트너 코드', badge:'required' },
      { label:'API Key', desc:'파트너센터에서 발급된 API Key', badge:'required' },
      { label:'Secret Key', desc:'API Secret Key', badge:'required' },
    ],
    steps:[
      '① partners.lotteon.com 접속 후 로그인',
      '② [개발자 API] → [연동 신청] 클릭',
      '③ 승인 후 Partner ID / API Key / Secret Key 확인·복사',
      '④ 프로그램에 로그인 ID/PW + Partner ID + API Key + Secret Key 입력 후 저장',
    ],
    links:[{ label:'롯데온 파트너센터', url:'https://partners.lotteon.com' }],
  },
  jasondeal: {
    title:'제이슨딜(공구마켓/할인중독/심쿵할인) 연동', authType:'ID/PW',
    note:'제이슨딜 판매자 계정으로 로그인합니다.',
    required:[
      { label:'로그인 ID', desc:'판매자 로그인 아이디', badge:'required' },
      { label:'비밀번호', desc:'판매자 비밀번호', badge:'required' },
    ],
    steps:[
      '① 공구마켓/할인중독/심쿵할인 판매자 로그인',
      '② 로그인 아이디 / 비밀번호 입력 후 저장',
    ],
    links:[{ label:'제이슨딜', url:'https://www.jasondeal.com' }],
  },
  toss: {
    title:'토스쇼핑 파트너 API 연동', authType:'Partner Key + Secret + Store ID',
    note:'토스 파트너센터에서 API 연동 신청 후 승인을 받아야 합니다.',
    warning:'⚠ 모바일 중심 플랫폼 — 이미지 품질과 리뷰 영향이 큽니다.',
    required:[
      { label:'로그인 ID/PW', desc:'토스쇼핑 판매자 로그인 계정', badge:'required' },
      { label:'Store ID', desc:'토스쇼핑 스토어 ID', badge:'required' },
      { label:'Partner Key', desc:'파트너센터 승인 후 발급', badge:'required' },
      { label:'Secret Key', desc:'파트너센터 승인 후 발급', badge:'required' },
    ],
    steps:[
      '① partners.toss.im 접속 후 로그인',
      '② [API 연동 신청] 클릭 → 승인 대기',
      '③ 승인 후 Partner Key / Secret Key 발급 확인',
      '④ 프로그램에 로그인 ID/PW + Store ID + Partner Key + Secret Key 입력 후 저장',
    ],
    links:[{ label:'토스 파트너센터', url:'https://partners.toss.im' }],
  },
  kakaostore: {
    title:'카카오톡스토어(톡스토어) API 연동', authType:'REST API Key + Admin Key',
    note:'카카오 비즈니스 계정이 필요합니다.',
    required:[
      { label:'카카오 비즈채널 ID', desc:'카카오 비즈니스 채널 ID', badge:'required' },
      { label:'REST API Key', desc:'카카오 REST API Key', badge:'required' },
      { label:'Admin Key', desc:'카카오 Admin Key', badge:'required' },
    ],
    steps:[
      '① business.kakao.com 로그인',
      '② [카카오톡 채널] → 채널 생성 후 채널 ID 확인',
      '③ [내 애플리케이션] → REST API Key / Admin Key 발급',
      '④ 채널 ID + REST API Key + Admin Key 입력 후 저장',
    ],
    links:[{ label:'카카오 비즈니스', url:'https://business.kakao.com' }],
  },
}

/* ─── 실제 쇼핑몰 카테고리 데이터 ──────────────────────────────── */
type CatItem = { id:string; name:string; parent?:string }

const MALL_CATS: Record<string, CatItem[]> = {
  coupang: [
    {id:'C001',name:'패션의류 > 여성의류 > 원피스'},{id:'C002',name:'패션의류 > 여성의류 > 블라우스/셔츠'},
    {id:'C003',name:'패션의류 > 여성의류 > 니트/스웨터'},{id:'C004',name:'패션의류 > 여성의류 > 티셔츠'},
    {id:'C005',name:'패션의류 > 여성의류 > 바지/팬츠'},{id:'C006',name:'패션의류 > 여성의류 > 스커트'},
    {id:'C007',name:'패션의류 > 여성의류 > 레깅스'},{id:'C008',name:'패션의류 > 여성의류 > 코트'},
    {id:'C009',name:'패션의류 > 여성의류 > 점퍼/재킷'},{id:'C010',name:'패션의류 > 여성의류 > 가디건'},
    {id:'C011',name:'패션의류 > 남성의류 > 티셔츠'},{id:'C012',name:'패션의류 > 남성의류 > 셔츠'},
    {id:'C013',name:'패션의류 > 남성의류 > 바지'},{id:'C014',name:'패션의류 > 남성의류 > 코트/점퍼'},
    {id:'C015',name:'패션잡화 > 가방 > 숄더백'},{id:'C016',name:'패션잡화 > 가방 > 크로스백'},
    {id:'C017',name:'패션잡화 > 가방 > 백팩'},{id:'C018',name:'패션잡화 > 가방 > 클러치/파우치'},
    {id:'C019',name:'패션잡화 > 지갑 > 장지갑'},{id:'C020',name:'패션잡화 > 지갑 > 반지갑'},
    {id:'C021',name:'패션잡화 > 모자'},{id:'C022',name:'패션잡화 > 벨트'},
    {id:'C023',name:'스포츠/레저 > 스포츠의류 > 상의'},{id:'C024',name:'스포츠/레저 > 스포츠의류 > 하의'},
  ],
  naver: [
    {id:'N001',name:'패션의류 > 여성의류 > 원피스'},{id:'N002',name:'패션의류 > 여성의류 > 블라우스'},
    {id:'N003',name:'패션의류 > 여성의류 > 가디건'},{id:'N004',name:'패션의류 > 여성의류 > 니트'},
    {id:'N005',name:'패션의류 > 여성의류 > 티셔츠'},{id:'N006',name:'패션의류 > 여성의류 > 바지'},
    {id:'N007',name:'패션의류 > 여성의류 > 스커트'},{id:'N008',name:'패션의류 > 여성의류 > 레깅스'},
    {id:'N009',name:'패션의류 > 여성의류 > 코트'},{id:'N010',name:'패션의류 > 여성의류 > 점퍼/재킷'},
    {id:'N011',name:'패션의류 > 남성의류 > 티셔츠'},{id:'N012',name:'패션의류 > 남성의류 > 셔츠'},
    {id:'N013',name:'패션의류 > 남성의류 > 바지'},{id:'N014',name:'패션의류 > 남성의류 > 코트/점퍼'},
    {id:'N015',name:'패션잡화 > 가방 > 숄더백'},{id:'N016',name:'패션잡화 > 가방 > 크로스백'},
    {id:'N017',name:'패션잡화 > 가방 > 백팩'},{id:'N018',name:'패션잡화 > 가방 > 클러치백'},
    {id:'N019',name:'패션잡화 > 지갑 > 장지갑'},{id:'N020',name:'패션잡화 > 지갑 > 반지갑'},
    {id:'N021',name:'패션잡화 > 모자/비니'},{id:'N022',name:'패션잡화 > 스카프/머플러'},
    {id:'N023',name:'패션잡화 > 주얼리/액세서리 > 귀걸이'},{id:'N024',name:'패션잡화 > 주얼리/액세서리 > 목걸이'},
    {id:'N025',name:'스포츠/레저 > 스포츠의류'},{id:'N026',name:'신발 > 여성신발'},{id:'N027',name:'신발 > 남성신발'},
  ],
  '11st': [
    {id:'E001',name:'여성의류 > 원피스'},{id:'E002',name:'여성의류 > 블라우스/셔츠'},
    {id:'E003',name:'여성의류 > 니트/가디건'},{id:'E004',name:'여성의류 > 티셔츠'},
    {id:'E005',name:'여성의류 > 바지/청바지'},{id:'E006',name:'여성의류 > 스커트'},
    {id:'E007',name:'여성의류 > 레깅스'},{id:'E008',name:'여성의류 > 코트'},
    {id:'E009',name:'여성의류 > 점퍼/자켓'},{id:'E010',name:'남성의류 > 티셔츠'},
    {id:'E011',name:'남성의류 > 셔츠'},{id:'E012',name:'남성의류 > 바지'},
    {id:'E013',name:'남성의류 > 코트/점퍼'},{id:'E014',name:'가방/잡화 > 여성가방 > 숄더백'},
    {id:'E015',name:'가방/잡화 > 여성가방 > 크로스백'},{id:'E016',name:'가방/잡화 > 여성가방 > 백팩'},
    {id:'E017',name:'가방/잡화 > 지갑'},{id:'E018',name:'가방/잡화 > 모자'},
    {id:'E019',name:'스포츠/아웃도어 > 스포츠의류'},{id:'E020',name:'신발 > 여성화'},{id:'E021',name:'신발 > 남성화'},
  ],
  gmarket: [
    {id:'G001',name:'여성패션 > 원피스'},{id:'G002',name:'여성패션 > 블라우스/셔츠'},
    {id:'G003',name:'여성패션 > 니트/가디건'},{id:'G004',name:'여성패션 > 티셔츠'},
    {id:'G005',name:'여성패션 > 바지'},{id:'G006',name:'여성패션 > 스커트'},
    {id:'G007',name:'여성패션 > 코트'},{id:'G008',name:'여성패션 > 점퍼/자켓'},
    {id:'G009',name:'남성패션 > 티셔츠'},{id:'G010',name:'남성패션 > 셔츠'},
    {id:'G011',name:'남성패션 > 바지'},{id:'G012',name:'남성패션 > 코트/점퍼'},
    {id:'G013',name:'가방/잡화 > 여성가방'},{id:'G014',name:'가방/잡화 > 남성가방'},
    {id:'G015',name:'가방/잡화 > 지갑'},{id:'G016',name:'가방/잡화 > 모자'},
    {id:'G017',name:'스포츠/레저 > 스포츠의류'},{id:'G018',name:'신발 > 여성화'},{id:'G019',name:'신발 > 남성화'},
  ],
  auction: [
    {id:'A001',name:'여성의류 > 원피스'},{id:'A002',name:'여성의류 > 블라우스'},
    {id:'A003',name:'여성의류 > 니트/가디건'},{id:'A004',name:'여성의류 > 티셔츠'},
    {id:'A005',name:'여성의류 > 바지'},{id:'A006',name:'여성의류 > 스커트'},
    {id:'A007',name:'여성의류 > 코트'},{id:'A008',name:'남성의류 > 티셔츠'},
    {id:'A009',name:'남성의류 > 셔츠'},{id:'A010',name:'남성의류 > 바지'},
    {id:'A011',name:'잡화/가방 > 여성가방'},{id:'A012',name:'잡화/가방 > 지갑'},
    {id:'A013',name:'스포츠/레저 > 스포츠의류'},{id:'A014',name:'신발 > 여성화'},{id:'A015',name:'신발 > 남성화'},
  ],
  ablly: [
    {id:'AB001',name:'아우터'},{id:'AB002',name:'아우터 > 코트'},
    {id:'AB003',name:'아우터 > 가죽/레더자켓'},{id:'AB004',name:'아우터 > 패딩/점퍼'},
    {id:'AB005',name:'아우터 > 가디건/니트가디건'},{id:'AB006',name:'아우터 > 집업/후드집업'},
    {id:'AB007',name:'상의'},{id:'AB008',name:'상의 > 니트/스웨터'},
    {id:'AB009',name:'상의 > 맨투맨/스웨트셔츠'},{id:'AB010',name:'상의 > 후드티셔츠'},
    {id:'AB011',name:'상의 > 티셔츠'},{id:'AB012',name:'상의 > 블라우스/셔츠'},
    {id:'AB013',name:'원피스'},{id:'AB014',name:'원피스 > 미니원피스'},
    {id:'AB015',name:'원피스 > 미디원피스'},{id:'AB016',name:'원피스 > 맥시원피스'},
    {id:'AB017',name:'수트/세트'},{id:'AB018',name:'수트/세트 > 자켓'},
    {id:'AB019',name:'수트/세트 > 세트'},{id:'AB020',name:'팬츠'},
    {id:'AB021',name:'팬츠 > 롱팬츠'},{id:'AB022',name:'팬츠 > 숏팬츠'},
    {id:'AB023',name:'스커트'},{id:'AB024',name:'스커트 > 미니스커트'},
    {id:'AB025',name:'스커트 > 미디스커트'},{id:'AB026',name:'스커트 > 롱스커트'},
    {id:'AB027',name:'가방'},{id:'AB028',name:'가방 > 숄더백'},
    {id:'AB029',name:'가방 > 크로스백'},{id:'AB030',name:'가방 > 클러치/파우치'},
    {id:'AB031',name:'가방 > 에코백/토트백'},{id:'AB032',name:'가방 > 백팩'},
    {id:'AB033',name:'패션소품'},{id:'AB034',name:'패션소품 > 벨트'},
    {id:'AB035',name:'패션소품 > 스카프/숄'},{id:'AB036',name:'패션소품 > 선글라스'},
    {id:'AB037',name:'모자'},{id:'AB038',name:'모자 > 캡/볼캡'},
    {id:'AB039',name:'모자 > 비니'},{id:'AB040',name:'언더웨어'},
    {id:'AB041',name:'주얼리'},{id:'AB042',name:'주얼리 > 귀걸이'},
    {id:'AB043',name:'주얼리 > 목걸이'},{id:'AB044',name:'주얼리 > 반지'},
    {id:'AB045',name:'비치웨어'},{id:'AB046',name:'신발'},
    {id:'AB047',name:'신발 > 구두/펌프스'},{id:'AB048',name:'신발 > 스니커즈'},
    {id:'AB049',name:'신발 > 샌들/슬리퍼'},{id:'AB050',name:'트레이닝'},
    {id:'AB051',name:'트레이닝 > 트레이닝팬츠'},{id:'AB052',name:'트레이닝 > 레깅스'},
  ],
  zigzag: [
    {id:'Z001',name:'아우터 > 코트'},{id:'Z002',name:'아우터 > 가죽/레더자켓'},
    {id:'Z003',name:'아우터 > 패딩/점퍼'},{id:'Z004',name:'아우터 > 가디건'},
    {id:'Z005',name:'상의 > 니트/가디건'},{id:'Z006',name:'상의 > 블라우스/셔츠'},
    {id:'Z007',name:'상의 > 맨투맨/후드'},{id:'Z008',name:'상의 > 티셔츠'},
    {id:'Z009',name:'하의 > 팬츠'},{id:'Z010',name:'하의 > 스커트'},
    {id:'Z011',name:'하의 > 레깅스'},{id:'Z012',name:'원피스 > 미니'},
    {id:'Z013',name:'원피스 > 미디'},{id:'Z014',name:'원피스 > 맥시'},
    {id:'Z015',name:'가방 > 숄더백'},{id:'Z016',name:'가방 > 크로스백'},
    {id:'Z017',name:'가방 > 미니백'},{id:'Z018',name:'신발 > 구두'},
    {id:'Z019',name:'신발 > 스니커즈'},{id:'Z020',name:'신발 > 샌들'},
    {id:'Z021',name:'액세서리 > 귀걸이'},{id:'Z022',name:'액세서리 > 목걸이'},
  ],
  alwayz: [
    {id:'AW001',name:'의류 > 여성의류 > 상의'},{id:'AW002',name:'의류 > 여성의류 > 하의'},
    {id:'AW003',name:'의류 > 여성의류 > 원피스'},{id:'AW004',name:'의류 > 여성의류 > 아우터'},
    {id:'AW005',name:'의류 > 남성의류 > 상의'},{id:'AW006',name:'의류 > 남성의류 > 하의'},
    {id:'AW007',name:'패션잡화 > 가방'},{id:'AW008',name:'패션잡화 > 지갑'},
    {id:'AW009',name:'패션잡화 > 모자'},{id:'AW010',name:'신발'},
  ],
  cafe24: [
    {id:'CF001',name:'상의 > 티셔츠'},{id:'CF002',name:'상의 > 니트/스웨터'},
    {id:'CF003',name:'상의 > 블라우스/셔츠'},{id:'CF004',name:'상의 > 맨투맨/후드'},
    {id:'CF005',name:'하의 > 팬츠'},{id:'CF006',name:'하의 > 스커트'},
    {id:'CF007',name:'하의 > 레깅스'},{id:'CF008',name:'아우터 > 코트'},
    {id:'CF009',name:'아우터 > 자켓'},{id:'CF010',name:'아우터 > 패딩/점퍼'},
    {id:'CF011',name:'원피스'},{id:'CF012',name:'가방 > 숄더백'},
    {id:'CF013',name:'가방 > 크로스백'},{id:'CF014',name:'잡화 > 지갑'},
  ],
  fashionplus: [],   // API 라우트(/api/mall-categories)에서 동적으로 불러옴
  halfclub: [
    {id:'HC001',name:'여성의류 > 원피스'},{id:'HC002',name:'여성의류 > 블라우스'},
    {id:'HC003',name:'여성의류 > 니트'},{id:'HC004',name:'여성의류 > 바지'},
    {id:'HC005',name:'남성의류 > 티셔츠'},{id:'HC006',name:'남성의류 > 바지'},
    {id:'HC007',name:'가방/잡화 > 여성가방'},{id:'HC008',name:'아동의류 > 아동상의'},
  ],
  gsshop: [
    {id:'GS001',name:'패션의류 > 여성의류 > 원피스'},{id:'GS002',name:'패션의류 > 여성의류 > 니트'},
    {id:'GS003',name:'패션의류 > 여성의류 > 블라우스'},{id:'GS004',name:'패션의류 > 남성의류'},
    {id:'GS005',name:'패션잡화 > 가방'},{id:'GS006',name:'패션잡화 > 지갑'},
    {id:'GS007',name:'스포츠 > 스포츠의류'},
  ],
  jasondeal: [
    {id:'JD001',name:'의류 > 여성의류'},{id:'JD002',name:'의류 > 남성의류'},
    {id:'JD003',name:'패션잡화 > 가방'},{id:'JD004',name:'패션잡화 > 지갑'},
  ],
  lotteon: [
    {id:'LT001',name:'패션의류 > 여성의류 > 원피스'},{id:'LT002',name:'패션의류 > 여성의류 > 블라우스'},
    {id:'LT003',name:'패션의류 > 여성의류 > 니트'},{id:'LT004',name:'패션의류 > 남성의류'},
    {id:'LT005',name:'패션잡화 > 가방'},{id:'LT006',name:'패션잡화 > 지갑'},
    {id:'LT007',name:'스포츠/레저 > 스포츠의류'},
  ],
  ssg: [
    {id:'SS001',name:'패션의류 > 여성의류 > 원피스'},{id:'SS002',name:'패션의류 > 여성의류 > 블라우스'},
    {id:'SS003',name:'패션의류 > 남성의류'},{id:'SS004',name:'패션잡화 > 가방 > 숄더백'},
    {id:'SS005',name:'패션잡화 > 가방 > 크로스백'},
  ],
  toss: [
    {id:'TS001',name:'패션의류 > 여성의류'},{id:'TS002',name:'패션의류 > 남성의류'},
    {id:'TS003',name:'패션잡화 > 가방'},{id:'TS004',name:'패션잡화 > 지갑'},
  ],
  kakaostore: [
    {id:'KS001',name:'패션의류 > 여성패션 > 원피스'},{id:'KS002',name:'패션의류 > 여성패션 > 블라우스'},
    {id:'KS003',name:'패션의류 > 여성패션 > 바지'},{id:'KS004',name:'패션의류 > 남성패션 > 티셔츠'},
    {id:'KS005',name:'패션의류 > 남성패션 > 바지'},{id:'KS006',name:'패션잡화 > 가방 > 숄더백'},
    {id:'KS007',name:'패션잡화 > 가방 > 크로스백'},{id:'KS008',name:'패션잡화 > 지갑'},
    {id:'KS009',name:'액세서리 > 귀걸이'},{id:'KS010',name:'뷰티 > 스킨케어'},
  ],
}

/* ─── 배송정보 타입 (실제 쇼핑몰 배송등록 양식 기준) ─────────── */
const DELIVERY_TEMPLATE = {
  // 발송정책
  ship_policy:    '',   // 발송정책명 (예: 당일발송/마감 15:00)
  // 배송방법
  method:         'parcel',   // 'parcel'=택배/소포/등기, 'direct'=직접배송
  courier:        '',   // 배송택배사 (CJ대한통운, 한진택배, 로젠택배 ...)
  // 추가배송방법
  visit_pickup:   false,  // 방문수령
  quick_service:  false,  // 퀵서비스
  // 출하지
  warehouse:      '',   // 출하지/창고명
  // 배송비 설정
  fee_bundle:     'bundle',   // 'bundle'=묶음배송비, 'each'=상품별배송비
  fee_type:       'free',     // 'free'=무료, 'paid'=유료, 'cond'=조건부무료
  base_fee:       '',   // 기본 배송비(원)
  free_threshold: '',   // 무료배송 기준금액(원)
  fee_template:   '',   // 배송비 템플릿명
  jeju_fee:       '',   // 제주 추가배송비
  island_fee:     '',   // 도서산간 추가배송비
  // 반품/교환
  return_addr:    '',   // 반품/교환지 주소
  return_fee:     '',   // 반품 배송비(편도)
  exchange_fee:   '',   // 교환 배송비(왕복)
  // 배송기간
  lead_days:      '',   // 예상 배송기간 (예: 출고 후 1~3일)
}
type DeliveryInfo = typeof DELIVERY_TEMPLATE

const COURIER_LIST = ['CJ대한통운','한진택배','롯데택배','로젠택배','우체국택배','경동택배','대신택배','일양로지스','건영택배','GTX로지스','합동택배','KGB택배']

/* ─── 타입 ──────────────────────────────────────────────────────── */
type MallCategory = { id:string; displayName:string; mallCatId:string; mallCatName:string }
type DeliveryProfile = { id:string; name:string; info: DeliveryInfo }
type ChannelData = {
  key:string; name:string; domain:string; color:string
  active:boolean
  login_id:string; login_pw:string
  seller_id:string; api_key:string; api_secret:string
  site_name:string; refresh_token:string; access_key:string
  synced:number; orders:number
  categories: MallCategory[]
  deliveries: DeliveryProfile[]   // 배송정보 (복수 프로필 지원)
  delivery: DeliveryInfo          // 하위 호환용
}

const STORAGE_KEY = 'pm_mall_channels_v5'

function makeChannel(mall: typeof ALL_MALLS[0]): ChannelData {
  return {
    ...mall, active:false, login_id:'', login_pw:'',
    seller_id:'', api_key:'', api_secret:'', site_name:'', refresh_token:'', access_key:'',
    synced:0, orders:0, categories:[], deliveries:[], delivery:{...DELIVERY_TEMPLATE},
  }
}
function loadChannels(): ChannelData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('pm_mall_channels_v4') || localStorage.getItem('pm_mall_channels_v3')
    if (raw) {
      const saved: ChannelData[] = JSON.parse(raw)
      return ALL_MALLS.map(m => {
        const s = saved.find(s => s.key===m.key)
        if (!s) return makeChannel(m)
        return { ...makeChannel(m), ...s, deliveries: s.deliveries || [] }
      })
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
        ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={name} style={{ width:size*0.62, height:size*0.62, objectFit:'contain' }} onError={() => setErr(true)}/>
        : <span style={{ fontSize:size*0.42 }}>🛒</span>
      }
    </div>
  )
}

/* ─── 메인 컴포넌트 ──────────────────────────────────────────────── */
export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelData[]>([])
  const [mounted, setMounted]   = useState(false)

  // 모달
  const [addOpen, setAddOpen]               = useState(false)
  const [apiTarget, setApiTarget]           = useState<ChannelData|null>(null)
  const [isEditMode, setIsEditMode]         = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState<ChannelData|null>(null)
  const [apiForm, setApiForm]               = useState<Record<string,string>>({})

  // 연동 가이드 패널
  const [guideOpen, setGuideOpen]           = useState(false)

  // 카테고리 팝업
  const [catTarget, setCatTarget]           = useState<ChannelData|null>(null)
  const [catQuery, setCatQuery]             = useState('')
  const [catLoading, setCatLoading]         = useState(false)
  const [catResults, setCatResults]         = useState<CatItem[]>([])
  const [catSearched, setCatSearched]       = useState(false)
  const [catAddName, setCatAddName]         = useState('')   // 등록명
  const [catAddMall, setCatAddMall]         = useState('')   // 쇼핑몰 카테고리명
  const [catAddId, setCatAddId]             = useState('')   // 쇼핑몰 카테고리ID
  const [catEditId, setCatEditId]           = useState<string|null>(null)
  const [catEditName, setCatEditName]       = useState('')
  const [catEditMall, setCatEditMall]       = useState('')

  // 배송정보 팝업
  const [delivTarget, setDelivTarget]       = useState<ChannelData|null>(null)
  const [delivForm, setDelivForm]           = useState<DeliveryInfo>({...DELIVERY_TEMPLATE})
  const [delivEditId, setDelivEditId]       = useState<string|null>(null)  // 수정 중인 배송 프로필 ID
  const [delivProfileName, setDelivProfileName] = useState('')  // 프로필 이름
  const [delivSaved, setDelivSaved]         = useState(false)
  const [delivView, setDelivView]           = useState<'list'|'form'>('list')  // list=목록, form=등록/수정 폼
  // 배송비 템플릿 검색
  const [feeTemplates] = useState([
    { id:'T001', name:'[무료배송]', label:'무료배송' },
    { id:'T002', name:'[조건부무료] 3,000원·50,000원 이상 무료', label:'조건부무료 3,000원/5만원이상' },
    { id:'T003', name:'[조건부무료] 2,800원·30,000원 이상 무료', label:'조건부무료 2,800원/3만원이상' },
    { id:'T004', name:'[유료] 3,000원', label:'유료 3,000원' },
    { id:'T005', name:'[유료] 5,000원', label:'유료 5,000원' },
  ])
  const [feeTemplateSearch, setFeeTemplateSearch] = useState('')
  const [feeTemplateOpen, setFeeTemplateOpen] = useState(false)

  /* ── OAuth 팝업 상태 ── */
  const [oauthPending, setOauthPending]   = useState(false)
  const [oauthSuccess, setOauthSuccess]   = useState(false)

  useEffect(() => { if (typeof window !== 'undefined') { setChannels(loadChannels()); setMounted(true) } }, [])

  /* ── OAuth postMessage 수신 (팝업 → 부모 창) ── */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'OAUTH_SUCCESS') {
        setOauthPending(false)
        setOauthSuccess(true)
        // Refresh Token을 apiForm에 반영 (Supabase에 이미 저장됨)
        if (e.data?.refresh_token) {
          setApiForm(f => ({ ...f, refresh_token: e.data.refresh_token }))
        }
        setTimeout(() => setOauthSuccess(false), 4000)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // 카테고리 팝업 열릴 때 자동으로 전체 카테고리 로드
  useEffect(() => {
    if (catTarget) {
      setCatQuery('')
      loadCategories(catTarget, '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catTarget?.key])

  const update = (updated: ChannelData[]) => { setChannels(updated); saveChannels(updated) }
  const active = channels.filter(c => c.active)

  /* ── API 설정 ── */
  const openApi = (ch: ChannelData, editMode = false) => {
    setApiTarget(ch); setIsEditMode(editMode); setGuideOpen(false)
    setApiForm({ login_id:ch.login_id||'', login_pw:ch.login_pw||'', seller_id:ch.seller_id, api_key:ch.api_key, api_secret:ch.api_secret, site_name:ch.site_name||'', refresh_token:ch.refresh_token||'', access_key:ch.access_key||'' })
  }
  /* OAuth 지원 쇼핑몰 */
  const OAUTH_MALLS = ['cafe24', 'naver', 'zigzag']

  const saveApi = async () => {
    if (!apiTarget) return
    // 공통: 입력값 저장
    update(channels.map(c => c.key===apiTarget.key ? { ...c, ...apiForm, active:true } : c))

    // OAuth 쇼핑몰: Client ID + Shop ID 있으면 팝업 실행
    if (OAUTH_MALLS.includes(apiTarget.key)) {
      const shopId   = apiForm.seller_id?.trim()
      const clientId = apiForm.api_key?.trim()
      if (!shopId || !clientId) {
        setApiTarget(null)
        return
      }
      // OAuth 인증 URL 생성
      // redirect_uri는 카페24 개발자센터에 등록된 것과 정확히 일치해야 함 (쿼리스트링 없이)
      const redirectUri = `${window.location.origin}/oauth`
      const state = btoa(JSON.stringify({ mall: apiTarget.key, client_id: clientId, shop_id: shopId }))
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
      let authUrl = ''
      if (apiTarget.key === 'cafe24') {
        authUrl = `https://${shopId}.cafe24api.com/api/v2/oauth/authorize`
          + `?response_type=code&client_id=${encodeURIComponent(clientId)}`
          + `&redirect_uri=${encodeURIComponent(redirectUri)}`
          + `&scope=mall.read_product,mall.write_product,mall.read_order,mall.write_order,mall.read_category,mall.write_category,mall.read_customer,mall.write_customer,mall.read_shipping,mall.write_shipping`
          + `&state=${state}`
      } else if (apiTarget.key === 'naver') {
        authUrl = `https://api.commerce.naver.com/external/v1/oauth2/authorize`
          + `?response_type=code&client_id=${encodeURIComponent(clientId)}`
          + `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
      } else if (apiTarget.key === 'zigzag') {
        authUrl = `https://api.zigzag.kr/api/v1/oauth/authorize`
          + `?response_type=code&client_id=${encodeURIComponent(clientId)}`
          + `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
      }
      if (authUrl) {
        setOauthPending(true)
        const popup = window.open(authUrl, 'oauth_popup', 'width=600,height=700,left=300,top=100')
        // 팝업이 닫히면 pending 해제
        const checkClosed = setInterval(() => {
          if (popup?.closed) { clearInterval(checkClosed); setOauthPending(false) }
        }, 1000)
      }
      setApiTarget(null)
      return
    }
    setApiTarget(null)
  }

  /* ── 카테고리 검색 (API 라우트 우선, 정적 데이터 fallback) ── */
  const loadCategories = async (target: ChannelData, q: string) => {
    setCatLoading(true); setCatSearched(false)
    try {
      const res = await fetch('/api/mall-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mall: target.key,
          query: q,
          credentials: {
            login_id: target.login_id,
            login_pw: target.login_pw,
            api_key: target.api_key,   // 패션플러스: 거래처코드
            seller_id: target.seller_id,
          },
        }),
      })
      const data = await res.json()
      setCatResults(data.categories || [])
    } catch {
      // fetch 실패 시 브라우저 내 정적 데이터로 fallback
      const all = MALL_CATS[target.key] || []
      const lq = q.trim().toLowerCase()
      setCatResults(lq ? all.filter(c => c.name.toLowerCase().includes(lq)) : all)
    } finally {
      setCatLoading(false); setCatSearched(true)
    }
  }
  const searchCategories = () => { if (catTarget) loadCategories(catTarget, catQuery.trim()) }
  const selectCatResult = (item: CatItem) => {
    setCatAddMall(item.name); setCatAddId(item.id)
    if (!catAddName) setCatAddName(item.name.split('>').pop()?.trim() || item.name)
  }
  const addCategoryItem = () => {
    if (!catTarget || !catAddName.trim()) return
    const newCat: MallCategory = { id:String(Date.now()), displayName:catAddName.trim(), mallCatId:catAddId, mallCatName:catAddMall }
    const updated = channels.map(c => c.key===catTarget.key ? { ...c, categories:[...c.categories, newCat] } : c)
    update(updated)
    setCatTarget(prev => prev ? { ...prev, categories:[...prev.categories, newCat] } : prev)
    setCatAddName(''); setCatAddMall(''); setCatAddId('')
  }
  const startEditCat = (ct: MallCategory) => { setCatEditId(ct.id); setCatEditName(ct.displayName); setCatEditMall(ct.mallCatName) }
  const saveEditCat = () => {
    if (!catTarget || !catEditId) return
    const updated = channels.map(c => c.key===catTarget.key
      ? { ...c, categories: c.categories.map(ct => ct.id===catEditId ? { ...ct, displayName:catEditName, mallCatName:catEditMall } : ct) } : c)
    update(updated)
    setCatTarget(prev => prev ? { ...prev, categories: prev.categories.map(ct => ct.id===catEditId ? { ...ct, displayName:catEditName, mallCatName:catEditMall } : ct) } : prev)
    setCatEditId(null)
  }
  const removeCat = (id: string) => {
    if (!catTarget) return
    const updated = channels.map(c => c.key===catTarget.key ? { ...c, categories:c.categories.filter(ct=>ct.id!==id) } : c)
    update(updated); setCatTarget(prev => prev ? { ...prev, categories:prev.categories.filter(ct=>ct.id!==id) } : prev)
  }

  /* ── 배송정보 ── */
  const openDelivery = (ch: ChannelData) => {
    setDelivTarget(ch); setDelivView('list'); setDelivSaved(false)
  }
  const openDeliveryForm = (profile?: DeliveryProfile) => {
    if (profile) {
      setDelivEditId(profile.id); setDelivProfileName(profile.name)
      setDelivForm({...DELIVERY_TEMPLATE, ...profile.info})
    } else {
      setDelivEditId(null); setDelivProfileName('')
      setDelivForm({...DELIVERY_TEMPLATE})
    }
    setDelivView('form'); setDelivSaved(false)
  }
  const saveDeliveryProfile = () => {
    if (!delivTarget || !delivProfileName.trim()) return
    let updated: ChannelData[]
    if (delivEditId) {
      updated = channels.map(c => c.key===delivTarget.key
        ? { ...c, deliveries: c.deliveries.map(d => d.id===delivEditId ? { ...d, name:delivProfileName, info:delivForm } : d) } : c)
    } else {
      const newProf: DeliveryProfile = { id:String(Date.now()), name:delivProfileName, info:delivForm }
      updated = channels.map(c => c.key===delivTarget.key ? { ...c, deliveries:[...c.deliveries, newProf] } : c)
    }
    update(updated)
    setDelivTarget(prev => {
      if (!prev) return prev
      const ch = updated.find(c => c.key===prev.key)
      return ch || prev
    })
    setDelivSaved(true); setDelivView('list')
    setTimeout(() => setDelivSaved(false), 3000)
  }
  const removeDelivery = (id: string) => {
    if (!delivTarget) return
    const updated = channels.map(c => c.key===delivTarget.key ? { ...c, deliveries:c.deliveries.filter(d=>d.id!==id) } : c)
    update(updated); setDelivTarget(prev => prev ? { ...prev, deliveries:prev.deliveries.filter(d=>d.id!==id) } : prev)
  }

  const filteredFeeTemplates = useMemo(() => feeTemplates.filter(t => t.name.toLowerCase().includes(feeTemplateSearch.toLowerCase())), [feeTemplates, feeTemplateSearch])

  /* ── 연동 해제 ── */
  const handleDisconnect = (key: string) => {
    update(channels.map(c => c.key===key ? { ...c, active:false, login_id:'', login_pw:'', seller_id:'', api_key:'', api_secret:'', synced:0, orders:0 } : c))
    setConfirmDisconnect(null)
  }

  if (!mounted) return null

  return (
    <div className="pm-page space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:'연동 쇼핑몰', v:`${active.length}개`, color:'#2563eb', bg:'#eff6ff' },
          { label:'오늘 주문',   v:`${active.reduce((s,c)=>s+c.orders,0)}건`, color:'#059669', bg:'#ecfdf5' },
          { label:'연동 상품',   v:`${active.reduce((s,c)=>s+c.synced,0)}개`, color:'#7e22ce', bg:'#fdf4ff' },
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
              <div style={{ padding:18 }}>
                {/* 헤더 */}
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <MallLogo domain={ch.domain} name={ch.name}/>
                    <div>
                      <p style={{ fontWeight:900, color:'#1e293b', fontSize:14 }}>{ch.name}</p>
                      {ch.login_id && <p style={{ fontSize:11, color:'#64748b', marginTop:1 }}>🔑 {ch.login_id}</p>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap', justifyContent:'flex-end' }}>
                    {ch.api_key || ch.access_key
                      ? <span style={{ fontSize:10.5, fontWeight:800, color:'#1d4ed8', background:'#dbeafe', padding:'2px 8px', borderRadius:99, border:'1px solid #bfdbfe', display:'inline-flex', alignItems:'center', gap:3 }}><CheckCircle2 size={9}/>API연동</span>
                      : <span style={{ fontSize:10.5, fontWeight:800, color:'#b45309', background:'#fef3c7', padding:'2px 8px', borderRadius:99, border:'1px solid #fde68a' }}>⚠ API미설정</span>
                    }
                    <span style={{ fontSize:10.5, fontWeight:800, color:'#15803d', background:'#f0fdf4', padding:'2px 8px', borderRadius:99, border:'1px solid #bbf7d0', display:'inline-flex', alignItems:'center', gap:3 }}><CheckCircle2 size={9}/>연동중</span>
                  </div>
                </div>

                {/* 카테고리/배송정보 요약 */}
                <div style={{ display:'flex', gap:8, marginBottom:10, fontSize:11.5, color:'#64748b' }}>
                  <span>📂 카테고리 {ch.categories.length}개</span>
                  <span>🚚 배송프로필 {ch.deliveries?.length||0}개</span>
                </div>

                {/* 버튼 */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
                  <button onClick={() => openApi(ch, true)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'7px', background:'#f8fafc', color:'#334155', border:'1px solid #e2e8f0', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer' }}>
                    <Pencil size={11}/>수정
                  </button>
                  <button onClick={() => { setCatAddName(''); setCatAddMall(''); setCatAddId(''); setCatEditId(null); setCatTarget(ch) }}
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'7px', background:'#fdf4ff', color:'#7e22ce', border:'1px solid #e9d5ff', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer' }}>
                    <Tag size={11}/>카테고리 관리
                  </button>
                  <button onClick={() => openDelivery(ch)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'7px', background:'#f0f9ff', color:'#0369a1', border:'1px solid #bae6fd', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer' }}>
                    <Truck size={11}/>배송정보 관리
                  </button>
                  <button onClick={() => setConfirmDisconnect(ch)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'7px', background:'#fff1f2', color:'#be123c', border:'1px solid #fecdd3', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer' }}>
                    <Unlink size={11}/>연동 해제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 쇼핑몰 추가 모달 ── */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="쇼핑몰 추가" size="lg">
        <p style={{ fontSize:13, fontWeight:700, color:'#64748b', marginBottom:14 }}>연동할 쇼핑몰을 선택하세요.</p>
        {channels.filter(c=>!c.active).length === 0
          ? <p style={{ textAlign:'center', fontSize:13, color:'#94a3b8', padding:'16px 0' }}>모든 쇼핑몰이 이미 연동되어 있습니다.</p>
          : <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {channels.filter(c=>!c.active).map(ch => (
                <button key={ch.key} onClick={() => { setAddOpen(false); openApi(ch, false) }}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', border:'1.5px solid rgba(15,23,42,0.09)', borderRadius:14, background:'white', cursor:'pointer', textAlign:'left' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='#3b82f6'; e.currentTarget.style.background='#eff6ff' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(15,23,42,0.09)'; e.currentTarget.style.background='white' }}>
                  <MallLogo domain={ch.domain} name={ch.name} size={36}/>
                  <span style={{ fontWeight:800, color:'#334155', fontSize:13 }}>{ch.name}</span>
                </button>
              ))}
            </div>
        }
      </Modal>

      {/* ── API 설정 / 수정 모달 ── */}
      {apiTarget && (() => {
        const fields      = MALL_API_FIELDS[apiTarget.key] || [...COMMON_LOGIN_FIELDS, { key:'seller_id',label:'판매자 ID',placeholder:'판매자 ID',type:'text' as const,section:'api' }, { key:'api_key',label:'API Key',placeholder:'API Key',type:'password' as const,section:'api' }]
        const loginFields = fields.filter(f => f.section==='login')
        const apiFields   = fields.filter(f => f.section==='api' || !f.section)
        const guide       = MALL_GUIDES[apiTarget.key]
        return (
          <Modal isOpen onClose={() => { setApiTarget(null); setGuideOpen(false) }} title={isEditMode ? `${apiTarget.name} 연동 수정` : `${apiTarget.name} 연동 설정`} size={guideOpen ? 'xl' : 'md'}>
            <div style={{ display:'flex', gap:16 }}>

              {/* ── 왼쪽: 입력 폼 ── */}
              <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>

                {/* 헤더 배너 */}
                <div className={`bg-gradient-to-r ${apiTarget.color}`} style={{ borderRadius:14, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                  <MallLogo domain={apiTarget.domain} name={apiTarget.name} size={42}/>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:900, color:'white', fontSize:15 }}>{apiTarget.name}</p>
                    {guide && <p style={{ color:'rgba(255,255,255,0.8)', fontSize:11, fontWeight:600, marginTop:2 }}>{guide.authType}</p>}
                  </div>
                  {guide && (
                    <button onClick={() => setGuideOpen(o => !o)}
                      style={{ display:'flex', alignItems:'center', gap:6, background: guideOpen ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)', border:'1.5px solid rgba(255,255,255,0.5)', borderRadius:10, padding:'7px 14px', color: guideOpen ? '#1e293b' : 'white', fontSize:12, fontWeight:800, cursor:'pointer', flexShrink:0 }}>
                      <BookOpen size={13}/>{guideOpen ? '가이드 닫기' : '연동방법 보기'}
                    </button>
                  )}
                </div>

                {/* 로그인 필드 */}
                {loginFields.length > 0 && (
                  <div style={{ background:'#f8fafc', borderRadius:12, padding:'12px 14px' }}>
                    <p style={{ fontSize:11.5, fontWeight:900, color:'#475569', marginBottom:10 }}>🔑 판매자 계정 로그인 정보</p>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {loginFields.map(({ label, key, placeholder, type, required }) => (
                        <div key={key}>
                          <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:4 }}>
                            {required && <span style={{ color:'#ef4444', fontSize:10 }}>●</span>}
                            {label}
                            {required && <span style={{ background:'#fee2e2', color:'#dc2626', fontSize:9.5, fontWeight:700, padding:'1px 5px', borderRadius:4 }}>필수</span>}
                          </label>
                          <input type={type} placeholder={placeholder} value={apiForm[key]||''} onChange={e => setApiForm(f=>({...f,[key]:e.target.value}))}
                            style={{ width:'100%', border:`1.5px solid ${required && !apiForm[key] ? '#fca5a5' : '#e2e8f0'}`, borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none', background:'white', fontFamily:type==='password'?'monospace':'inherit' }}/>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* OAuth 완료 알림 */}
                {oauthSuccess && (
                  <div style={{ background:'#f0fdf4', border:'1.5px solid #bbf7d0', borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:8 }}>
                    <CheckCircle2 size={15} style={{ color:'#15803d', flexShrink:0 }}/>
                    <p style={{ fontSize:12.5, fontWeight:700, color:'#15803d' }}>OAuth 인증 완료! Refresh Token이 자동 저장되었습니다.</p>
                  </div>
                )}

                {/* API 키 필드 */}
                {apiFields.length > 0 && (
                  <div style={{ background:'#fafbff', borderRadius:12, padding:'12px 14px' }}>
                    <p style={{ fontSize:11.5, fontWeight:900, color:'#475569', marginBottom:10 }}>🔌 API 연동 키</p>
                    {/* OAuth 쇼핑몰 안내 */}
                    {apiTarget && OAUTH_MALLS.includes(apiTarget.key) && (
                      <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:11.5, color:'#2563eb', fontWeight:600, lineHeight:1.6 }}>
                        💡 <strong>쇼핑몰 ID</strong>와 <strong>Client ID / Client Secret</strong>을 입력 후<br/>
                        &quot;저장하고 연동 시작&quot;을 클릭하면 카페24 로그인 팝업이 열립니다.<br/>
                        로그인 및 권한 승인 완료 시 <strong>Refresh Token이 자동 발급</strong>됩니다.
                      </div>
                    )}
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {apiFields.map(({ label, key, placeholder, type, required }) => {
                        // Refresh Token: OAuth 쇼핑몰은 읽기전용 + 자동입력 표시
                        const isOAuthToken = key === 'refresh_token' && apiTarget && OAUTH_MALLS.includes(apiTarget.key)
                        return (
                        <div key={key}>
                          <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:4 }}>
                            {required && <span style={{ color:'#ef4444', fontSize:10 }}>●</span>}
                            {label}
                            {required === true  && <span style={{ background:'#fee2e2', color:'#dc2626', fontSize:9.5, fontWeight:700, padding:'1px 5px', borderRadius:4 }}>필수</span>}
                            {required === false && <span style={{ background:'#f1f5f9', color:'#64748b', fontSize:9.5, fontWeight:600, padding:'1px 5px', borderRadius:4 }}>선택</span>}
                            {isOAuthToken && <span style={{ background:'#f0fdf4', color:'#15803d', fontSize:9.5, fontWeight:700, padding:'1px 5px', borderRadius:4 }}>OAuth 자동발급</span>}
                          </label>
                          <input
                            type={type}
                            placeholder={isOAuthToken ? (apiForm[key] ? '✅ 발급완료' : '연동 시작 후 자동 입력됨') : placeholder}
                            value={apiForm[key]||''}
                            onChange={e => setApiForm(f=>({...f,[key]:e.target.value}))}
                            readOnly={isOAuthToken && !apiForm[key]}
                            style={{
                              width:'100%',
                              border:`1.5px solid ${required && !apiForm[key] && !isOAuthToken ? '#fca5a5' : isOAuthToken && apiForm[key] ? '#bbf7d0' : '#e2e8f0'}`,
                              borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none',
                              background: isOAuthToken ? (apiForm[key] ? '#f0fdf4' : '#f8fafc') : 'white',
                              fontFamily:type==='password'?'monospace':'inherit',
                              color: isOAuthToken && !apiForm[key] ? '#94a3b8' : 'inherit',
                            }}/>
                        </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display:'flex', justifyContent:'flex-end', gap:8, flexWrap:'wrap' }}>
                  <Button variant="outline" onClick={() => { setApiTarget(null); setGuideOpen(false) }}>취소</Button>

                  {/* 수정 모드 + OAuth 쇼핑몰: 저장 버튼 + 재인증 버튼 분리 */}
                  {isEditMode && apiTarget && OAUTH_MALLS.includes(apiTarget.key) ? (
                    <>
                      <Button variant="outline" onClick={saveApi}
                        style={{ borderColor:'#7e22ce', color:'#7e22ce' }}>
                        <Save size={13}/>설정 저장
                      </Button>
                      <Button onClick={async () => {
                        // 설정 저장 후 OAuth 팝업 실행
                        await saveApi()
                      }} disabled={oauthPending}
                        style={{ background:'#2563eb', borderColor:'#2563eb', opacity: oauthPending ? 0.7 : 1 }}>
                        {oauthPending
                          ? <><RefreshCw size={13} style={{ animation:'spin 1s linear infinite' }}/>인증 대기 중...</>
                          : <><Zap size={13}/>OAuth 재인증 (Refresh Token 재발급)</>
                        }
                      </Button>
                    </>
                  ) : (
                    <Button onClick={saveApi} disabled={oauthPending}
                      style={{ opacity: oauthPending ? 0.7 : 1 }}>
                      {oauthPending
                        ? <><RefreshCw size={13} style={{ animation:'spin 1s linear infinite' }}/>인증 대기 중...</>
                        : apiTarget && OAUTH_MALLS.includes(apiTarget.key)
                          ? <><Zap size={13}/>저장하고 OAuth 인증 시작</>
                          : <><Zap size={13}/>저장하고 연동 시작</>
                      }
                    </Button>
                  )}
                </div>
              </div>

              {/* ── 오른쪽: 연동 가이드 패널 ── */}
              {guideOpen && guide && (
                <div style={{ width:320, flexShrink:0, display:'flex', flexDirection:'column', gap:10, borderLeft:'1.5px solid #e2e8f0', paddingLeft:16 }}>
                  <div>
                    <p style={{ fontSize:13, fontWeight:900, color:'#1e293b', marginBottom:4 }}>📋 {guide.title}</p>
                    <p style={{ fontSize:11.5, color:'#475569', lineHeight:1.6 }}>{guide.note}</p>
                  </div>

                  {guide.warning && (
                    <div style={{ background:'#fff7ed', border:'1.5px solid #fed7aa', borderRadius:10, padding:'10px 12px', display:'flex', gap:8 }}>
                      <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>⚠️</span>
                      <p style={{ fontSize:11.5, color:'#92400e', lineHeight:1.6, fontWeight:600 }}>{guide.warning}</p>
                    </div>
                  )}

                  {/* 필요한 정보 */}
                  <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:10, padding:'10px 12px' }}>
                    <p style={{ fontSize:11.5, fontWeight:900, color:'#0369a1', marginBottom:8 }}>📌 필요한 정보</p>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {guide.required.map((info, i) => (
                        <div key={i} style={{ display:'flex', flexDirection:'column', gap:2 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                            <span style={{
                              fontSize:9.5, fontWeight:700, padding:'1px 6px', borderRadius:4,
                              background: info.badge === 'required' ? '#fee2e2' : '#f1f5f9',
                              color: info.badge === 'required' ? '#dc2626' : '#64748b',
                            }}>{info.badge === 'required' ? '필수' : '선택'}</span>
                            <span style={{ fontSize:12, fontWeight:800, color:'#1e293b' }}>{info.label}</span>
                          </div>
                          <p style={{ fontSize:11, color:'#475569', marginLeft:36, lineHeight:1.5 }}>{info.desc}</p>
                          {info.example && <p style={{ fontSize:10.5, color:'#7c3aed', marginLeft:36, fontFamily:'monospace', background:'#faf5ff', padding:'2px 6px', borderRadius:4, display:'inline-block', width:'fit-content' }}>예: {info.example}</p>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 발급 절차 */}
                  <div>
                    <p style={{ fontSize:11.5, fontWeight:900, color:'#475569', marginBottom:8 }}>🚀 API 발급 절차</p>
                    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      {guide.steps.map((step, i) => (
                        <div key={i} style={{ fontSize:11.5, color: step.startsWith('━━━') ? '#7c3aed' : '#374151', lineHeight:1.6, fontWeight: step.startsWith('━━━') ? 800 : 500, padding: step.startsWith('━━━') ? '4px 0' : '0' }}>
                          {step}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 바로가기 링크 */}
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    {guide.links.map((link, i) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                        style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, color:'#2563eb', fontSize:12, fontWeight:700, textDecoration:'none' }}>
                        🔗 {link.label}
                        <span style={{ marginLeft:'auto', fontSize:10, color:'#93c5fd' }}>↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Modal>
        )
      })()}

      {/* ── 카테고리 관리 팝업 ── */}
      {catTarget && (
        <Modal isOpen onClose={() => setCatTarget(null)} title={`${catTarget.name} — 카테고리 관리`} size="xl">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, minHeight:480 }}>
            {/* 왼쪽: 카테고리 검색 & 추가 */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ background:'#f8fafc', borderRadius:12, padding:14 }}>
                <p style={{ fontSize:12, fontWeight:900, color:'#475569', marginBottom:10 }}>
                  {catTarget.name} 카테고리 검색
                  <span style={{ fontSize:10.5, color: catTarget.api_key ? '#10b981' : '#94a3b8', fontWeight:600, marginLeft:6 }}>
                    {catTarget.api_key ? '● API 연동됨' : '● 기본 데이터'}
                  </span>
                </p>
                <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                  <div style={{ position:'relative', flex:1 }}>
                    <Search size={12} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}/>
                    <input value={catQuery} onChange={e => setCatQuery(e.target.value)} onKeyDown={e => e.key==='Enter' && searchCategories()}
                      placeholder={`예) 원피스, 상의, 가방...`}
                      style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px 7px 28px', fontSize:13, outline:'none' }}/>
                  </div>
                  <button onClick={searchCategories}
                    style={{ padding:'7px 14px', background:'#3b82f6', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer', whiteSpace:'nowrap' }}>
                    검색
                  </button>
                </div>

                {/* 검색 결과 */}
                <div style={{ border:'1px solid #e2e8f0', borderRadius:8, background:'white', minHeight:200, maxHeight:260, overflowY:'auto' }}>
                  {catLoading ? (
                    <div style={{ padding:20, textAlign:'center', color:'#94a3b8', fontSize:13 }}>
                      <div style={{ fontSize:20, marginBottom:8 }}>🔍</div>
                      카테고리 불러오는 중...
                    </div>
                  ) : catResults.length === 0 && catSearched ? (
                    <div style={{ padding:20, textAlign:'center', color:'#94a3b8', fontSize:13 }}>검색 결과가 없습니다</div>
                  ) : (
                    catResults.map((item, i) => (
                      <button key={item.id} onClick={() => selectCatResult(item)}
                        style={{ display:'flex', alignItems:'center', width:'100%', padding:'9px 12px', background: catAddId===item.id ? '#ede9fe' : 'none', border:'none', borderBottom: i<catResults.length-1 ? '1px solid #f8fafc' : 'none', cursor:'pointer', textAlign:'left', gap:8 }}>
                        <ChevronRight size={11} color="#a78bfa"/>
                        <span style={{ fontSize:13, color:'#334155', fontWeight: catAddId===item.id ? 800 : 600 }}>{item.name}</span>
                        {catAddId===item.id && <CheckCircle2 size={13} color="#7e22ce" style={{ marginLeft:'auto', flexShrink:0 }}/>}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* 등록명 입력 및 추가 */}
              <div style={{ background:'#faf5ff', borderRadius:12, padding:14, border:'1px solid #e9d5ff' }}>
                <p style={{ fontSize:12, fontWeight:900, color:'#7e22ce', marginBottom:8 }}>카테고리 추가</p>
                {catAddMall && (
                  <div style={{ background:'#ede9fe', borderRadius:7, padding:'6px 10px', fontSize:12, color:'#4c1d95', fontWeight:700, marginBottom:8 }}>
                    📂 {catAddMall}
                  </div>
                )}
                <input value={catAddName} onChange={e => setCatAddName(e.target.value)}
                  placeholder="내 시스템 표시명 (예: 여성가방, 원피스)"
                  style={{ width:'100%', border:'1.5px solid #c4b5fd', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none', marginBottom:8 }}/>
                <button onClick={addCategoryItem} disabled={!catAddName.trim()}
                  style={{ width:'100%', padding:'8px', background: catAddName.trim() ? '#7e22ce' : '#e2e8f0', color: catAddName.trim() ? 'white' : '#94a3b8', border:'none', borderRadius:8, fontSize:13, fontWeight:800, cursor: catAddName.trim() ? 'pointer' : 'default' }}>
                  <Plus size={12} style={{ display:'inline', marginRight:4 }}/>추가
                </button>
              </div>
            </div>

            {/* 오른쪽: 등록된 카테고리 목록 */}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <p style={{ fontSize:12, fontWeight:900, color:'#475569' }}>
                등록된 카테고리 <span style={{ color:'#7e22ce' }}>({catTarget.categories.length}개)</span>
              </p>
              {catTarget.categories.length === 0 ? (
                <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc', borderRadius:12, border:'1.5px dashed #e2e8f0', color:'#cbd5e1', fontSize:13, textAlign:'center', padding:32 }}>
                  등록된 카테고리가 없습니다.<br/>왼쪽에서 검색 후 추가하세요.
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:5, maxHeight:460, overflowY:'auto' }}>
                  {catTarget.categories.map((ct, idx) => (
                    <div key={ct.id} style={{ background:'white', border:'1px solid #e9d5ff', borderRadius:10, padding:'10px 12px' }}>
                      {catEditId === ct.id ? (
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          <input value={catEditName} onChange={e => setCatEditName(e.target.value)} placeholder="표시명"
                            style={{ border:'1.5px solid #a78bfa', borderRadius:7, padding:'6px 10px', fontSize:13, outline:'none' }}/>
                          <input value={catEditMall} onChange={e => setCatEditMall(e.target.value)} placeholder="쇼핑몰 카테고리"
                            style={{ border:'1.5px solid #e2e8f0', borderRadius:7, padding:'6px 10px', fontSize:12, outline:'none', color:'#64748b' }}/>
                          <div style={{ display:'flex', gap:5, justifyContent:'flex-end' }}>
                            <button onClick={() => setCatEditId(null)} style={{ padding:'5px 12px', background:'#f1f5f9', border:'none', borderRadius:7, fontSize:12, cursor:'pointer', color:'#64748b', fontWeight:700 }}>취소</button>
                            <button onClick={saveEditCat} style={{ padding:'5px 12px', background:'#7e22ce', color:'white', border:'none', borderRadius:7, fontSize:12, cursor:'pointer', fontWeight:800 }}>저장</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:11, color:'#94a3b8', fontWeight:700, minWidth:18 }}>{idx+1}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontSize:13, fontWeight:800, color:'#4c1d95', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ct.displayName}</p>
                            {ct.mallCatName && <p style={{ fontSize:11, color:'#94a3b8', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ct.mallCatName}</p>}
                          </div>
                          <button onClick={() => startEditCat(ct)}
                            style={{ width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center', background:'#ede9fe', color:'#7e22ce', border:'none', borderRadius:6, cursor:'pointer', flexShrink:0 }}>
                            <Pencil size={11}/>
                          </button>
                          <button onClick={() => removeCat(ct.id)}
                            style={{ width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', color:'#dc2626', border:'none', borderRadius:6, cursor:'pointer', flexShrink:0 }}>
                            <Trash2 size={11}/>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
            <Button onClick={() => setCatTarget(null)}>확인</Button>
          </div>
        </Modal>
      )}

      {/* ── 배송정보 관리 팝업 ── */}
      {delivTarget && (
        <Modal isOpen onClose={() => setDelivTarget(null)} title={`${delivTarget.name} — 배송정보 관리`} size="xl">
          {delivView === 'list' ? (
            /* 배송 프로필 목록 */
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <p style={{ fontSize:12, color:'#64748b' }}>
                  상품 등록 시 적용할 배송정보 프로필을 관리합니다.
                  {delivSaved && <span style={{ color:'#15803d', fontWeight:800, marginLeft:8 }}>✅ 저장 완료!</span>}
                </p>
                <button onClick={() => openDeliveryForm()}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 16px', background:'#0369a1', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer' }}>
                  <Plus size={12}/>배송정보 등록
                </button>
              </div>

              {(!delivTarget.deliveries || delivTarget.deliveries.length === 0) ? (
                <div style={{ textAlign:'center', padding:'40px 0', background:'#f8fafc', borderRadius:12, border:'1.5px dashed #e2e8f0', color:'#94a3b8', fontSize:13 }}>
                  <p>등록된 배송정보가 없습니다.</p>
                  <p style={{ fontSize:12, marginTop:4 }}>위의 [배송정보 등록] 버튼으로 추가하세요.</p>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {delivTarget.deliveries.map((profile, idx) => (
                    <div key={profile.id} style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:12, padding:'12px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:26, height:26, background:'#0369a1', color:'white', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, flexShrink:0 }}>{idx+1}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:13, fontWeight:900, color:'#0c4a6e' }}>{profile.name}</p>
                          <p style={{ fontSize:11, color:'#0369a1', marginTop:2 }}>
                            {[
                              profile.info.method==='parcel' ? '택배/소포/등기' : '직접배송',
                              profile.info.courier,
                              profile.info.fee_type==='free' ? '무료배송' : profile.info.fee_type==='paid' ? `유료 ₩${profile.info.base_fee}` : `조건부무료 ₩${profile.info.base_fee}`,
                              profile.info.lead_days ? `배송 ${profile.info.lead_days}` : '',
                            ].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <button onClick={() => openDeliveryForm(profile)}
                          style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', background:'#e0f2fe', color:'#0369a1', border:'none', borderRadius:7, cursor:'pointer' }}>
                          <Pencil size={12}/>
                        </button>
                        <button onClick={() => removeDelivery(profile.id)}
                          style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', color:'#dc2626', border:'none', borderRadius:7, cursor:'pointer' }}>
                          <Trash2 size={12}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:4 }}>
                <Button onClick={() => setDelivTarget(null)}>닫기</Button>
              </div>
            </div>
          ) : (
            /* 배송정보 등록/수정 폼 (실제 쇼핑몰 배송등록 양식 기준) */
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* 프로필명 */}
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button onClick={() => setDelivView('list')} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:3 }}>
                  ← 목록
                </button>
                <span style={{ color:'#e2e8f0' }}>|</span>
                <p style={{ fontSize:13, fontWeight:900, color:'#1e293b' }}>{delivEditId ? '배송정보 수정' : '배송정보 등록'}</p>
              </div>

              <div>
                <label style={labelStyle}>프로필 이름 *</label>
                <input value={delivProfileName} onChange={e => setDelivProfileName(e.target.value)} placeholder="예) 무료배송기본, 유료배송3000원, 조건부무료"
                  style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'8px 12px', fontSize:13, outline:'none' }}/>
              </div>

              {/* ① 발송정책 */}
              <fieldset style={fieldsetStyle}>
                <legend style={legendStyle}>① 발송정책</legend>
                <div style={{ display:'flex', gap:6 }}>
                  <input value={delivForm.ship_policy} onChange={e => setDelivForm(d=>({...d,ship_policy:e.target.value}))}
                    placeholder="예) 당일발송/발송마감시간 15:00"
                    style={{ flex:1, border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                  <button style={searchBtnStyle}>검색</button>
                </div>
              </fieldset>

              {/* ② 배송방법 */}
              <fieldset style={fieldsetStyle}>
                <legend style={legendStyle}>② 배송방법</legend>
                <div style={{ display:'flex', gap:16, marginBottom:10 }}>
                  {[{v:'parcel',l:'택배/소포/등기'},{v:'direct',l:'직접배송'}].map(opt=>(
                    <label key={opt.v} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13, fontWeight:700, color: delivForm.method===opt.v ? '#0369a1' : '#64748b' }}>
                      <input type="radio" name="method" value={opt.v} checked={delivForm.method===opt.v} onChange={()=>setDelivForm(d=>({...d,method:opt.v}))} style={{ accentColor:'#0369a1' }}/>
                      {opt.l}
                    </label>
                  ))}
                </div>
                {delivForm.method === 'parcel' && (
                  <div>
                    <label style={labelStyle}>배송택배사 설정</label>
                    <select value={delivForm.courier} onChange={e=>setDelivForm(d=>({...d,courier:e.target.value}))}
                      style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none', background:'white' }}>
                      <option value="">택배사 선택</option>
                      {COURIER_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
              </fieldset>

              {/* ③ 추가배송방법 */}
              <fieldset style={fieldsetStyle}>
                <legend style={legendStyle}>③ 추가배송방법</legend>
                <div style={{ display:'flex', gap:20 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13, fontWeight:700, color: delivForm.visit_pickup ? '#0369a1' : '#64748b' }}>
                    <input type="checkbox" checked={delivForm.visit_pickup} onChange={e=>setDelivForm(d=>({...d,visit_pickup:e.target.checked}))} style={{ accentColor:'#0369a1' }}/>
                    방문수령
                  </label>
                  <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13, fontWeight:700, color: delivForm.quick_service ? '#0369a1' : '#64748b' }}>
                    <input type="checkbox" checked={delivForm.quick_service} onChange={e=>setDelivForm(d=>({...d,quick_service:e.target.checked}))} style={{ accentColor:'#0369a1' }}/>
                    퀵서비스
                  </label>
                </div>
              </fieldset>

              {/* ④ 출하지 선택 */}
              <fieldset style={fieldsetStyle}>
                <legend style={legendStyle}>④ 출하지 선택</legend>
                <div style={{ display:'flex', gap:6 }}>
                  <input value={delivForm.warehouse} onChange={e=>setDelivForm(d=>({...d,warehouse:e.target.value}))}
                    placeholder="출하지/창고명 입력 또는 검색"
                    style={{ flex:1, border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                  <button style={searchBtnStyle}>검색</button>
                </div>
              </fieldset>

              {/* ⑤ 배송비 설정 */}
              <fieldset style={fieldsetStyle}>
                <legend style={legendStyle}>⑤ 배송비 설정</legend>
                <div style={{ display:'flex', gap:16, marginBottom:10 }}>
                  {[{v:'bundle',l:'묶음배송비'},{v:'each',l:'상품별 배송비'}].map(opt=>(
                    <label key={opt.v} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13, fontWeight:700, color: delivForm.fee_bundle===opt.v ? '#0369a1' : '#64748b' }}>
                      <input type="radio" name="fee_bundle" value={opt.v} checked={delivForm.fee_bundle===opt.v} onChange={()=>setDelivForm(d=>({...d,fee_bundle:opt.v}))} style={{ accentColor:'#0369a1' }}/>
                      {opt.l}
                    </label>
                  ))}
                </div>
                <div style={{ display:'flex', gap:16, marginBottom:10 }}>
                  {[{v:'free',l:'무료'},{v:'paid',l:'유료'},{v:'cond',l:'조건부무료'}].map(opt=>(
                    <label key={opt.v} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13, fontWeight:700, color: delivForm.fee_type===opt.v ? '#0369a1' : '#64748b' }}>
                      <input type="radio" name="fee_type" value={opt.v} checked={delivForm.fee_type===opt.v} onChange={()=>setDelivForm(d=>({...d,fee_type:opt.v}))} style={{ accentColor:'#0369a1' }}/>
                      {opt.l}
                    </label>
                  ))}
                </div>
                {(delivForm.fee_type==='paid' || delivForm.fee_type==='cond') && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                    <div>
                      <label style={labelStyle}>기본 배송비 (원)</label>
                      <input value={delivForm.base_fee} onChange={e=>setDelivForm(d=>({...d,base_fee:e.target.value}))} placeholder="예) 3000"
                        style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                    </div>
                    {delivForm.fee_type==='cond' && (
                      <div>
                        <label style={labelStyle}>무료배송 기준금액 (원)</label>
                        <input value={delivForm.free_threshold} onChange={e=>setDelivForm(d=>({...d,free_threshold:e.target.value}))} placeholder="예) 50000"
                          style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                      </div>
                    )}
                  </div>
                )}
                {/* 배송비 템플릿 */}
                <div>
                  <label style={labelStyle}>배송비 템플릿</label>
                  <div style={{ position:'relative' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      <input value={delivForm.fee_template} onChange={e=>setDelivForm(d=>({...d,fee_template:e.target.value}))} readOnly
                        placeholder="배송비 템플릿 검색하여 선택"
                        style={{ flex:1, border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none', background:'#f8fafc', cursor:'pointer' }}
                        onClick={() => setFeeTemplateOpen(true)}/>
                      <button onClick={() => setFeeTemplateOpen(v=>!v)} style={searchBtnStyle}>검색</button>
                      {delivForm.fee_template && <button onClick={()=>setDelivForm(d=>({...d,fee_template:''}))} style={{ padding:'7px 8px', background:'#fff1f2', color:'#dc2626', border:'1px solid #fecdd3', borderRadius:8, fontSize:11, cursor:'pointer', fontWeight:800 }}>삭제</button>}
                    </div>
                    {feeTemplateOpen && (
                      <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:50, background:'white', border:'1.5px solid #e2e8f0', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', marginTop:4 }}>
                        <div style={{ padding:'8px 10px', borderBottom:'1px solid #f1f5f9' }}>
                          <input value={feeTemplateSearch} onChange={e=>setFeeTemplateSearch(e.target.value)} placeholder="템플릿 검색..."
                            style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 8px', fontSize:12, outline:'none' }} autoFocus/>
                        </div>
                        {filteredFeeTemplates.map(t => (
                          <button key={t.id} onClick={() => { setDelivForm(d=>({...d,fee_template:t.name})); setFeeTemplateOpen(false); setFeeTemplateSearch('') }}
                            style={{ display:'block', width:'100%', padding:'10px 14px', background:'none', border:'none', borderBottom:'1px solid #f8fafc', textAlign:'left', cursor:'pointer', fontSize:12.5, fontWeight:700, color:'#334155' }}
                            onMouseEnter={e => e.currentTarget.style.background='#eff6ff'}
                            onMouseLeave={e => e.currentTarget.style.background='none'}>
                            {t.name}
                          </button>
                        ))}
                        {filteredFeeTemplates.length === 0 && <p style={{ padding:'12px', textAlign:'center', color:'#94a3b8', fontSize:12 }}>검색 결과 없음</p>}
                      </div>
                    )}
                  </div>
                </div>

                {/* 제주/도서산간 */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:10 }}>
                  <div>
                    <label style={labelStyle}>제주 추가배송비 (원)</label>
                    <input value={delivForm.jeju_fee} onChange={e=>setDelivForm(d=>({...d,jeju_fee:e.target.value}))} placeholder="예) 3000"
                      style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                  </div>
                  <div>
                    <label style={labelStyle}>도서산간 추가배송비 (원)</label>
                    <input value={delivForm.island_fee} onChange={e=>setDelivForm(d=>({...d,island_fee:e.target.value}))} placeholder="예) 5000"
                      style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                  </div>
                </div>
              </fieldset>

              {/* ⑥ 반품/교환 설정 */}
              <fieldset style={fieldsetStyle}>
                <legend style={legendStyle}>⑥ 반품/교환 설정</legend>
                <div style={{ display:'flex', gap:6, marginBottom:10 }}>
                  <input value={delivForm.return_addr} onChange={e=>setDelivForm(d=>({...d,return_addr:e.target.value}))}
                    placeholder="반품/교환지 주소 입력 또는 검색"
                    style={{ flex:1, border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                  <button style={searchBtnStyle}>검색</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div>
                    <label style={labelStyle}>반품 배송비 (편도기준, 원)</label>
                    <input value={delivForm.return_fee} onChange={e=>setDelivForm(d=>({...d,return_fee:e.target.value}))} placeholder="예) 3000"
                      style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                  </div>
                  <div>
                    <label style={labelStyle}>교환 배송비 (왕복기준, 원)</label>
                    <input value={delivForm.exchange_fee} onChange={e=>setDelivForm(d=>({...d,exchange_fee:e.target.value}))} placeholder="예) 6000"
                      style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
                  </div>
                </div>
              </fieldset>

              {/* ⑦ 예상 배송기간 */}
              <fieldset style={fieldsetStyle}>
                <legend style={legendStyle}>⑦ 주문 후 예상 배송기간</legend>
                <input value={delivForm.lead_days} onChange={e=>setDelivForm(d=>({...d,lead_days:e.target.value}))}
                  placeholder="예) 출고 후 1~3일"
                  style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none' }}/>
              </fieldset>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                <Button variant="outline" onClick={() => setDelivView('list')}>취소</Button>
                <Button onClick={saveDeliveryProfile} disabled={!delivProfileName.trim()}>
                  <Save size={13}/>{delivEditId ? '수정 저장' : '배송정보 저장'}
                </Button>
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
            <p style={{ fontSize:15, fontWeight:800, color:'#1e293b', marginBottom:8, marginTop:14 }}>{confirmDisconnect.name} 연동을 해제하시겠습니까?</p>
            <p style={{ fontSize:12.5, color:'#94a3b8' }}>로그인 정보, API 설정이 초기화됩니다.</p>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <Button variant="outline" onClick={() => setConfirmDisconnect(null)}>취소</Button>
            <Button onClick={() => handleDisconnect(confirmDisconnect.key)} style={{ background:'#dc2626', borderColor:'#dc2626' }}>
              <Unlink size={13}/>연동 해제
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ─── 스타일 상수 ──────────────────────────────────────────────── */
const labelStyle: React.CSSProperties = { display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:4 }
const fieldsetStyle: React.CSSProperties = { border:'1.5px solid #e2e8f0', borderRadius:10, padding:'12px 14px', margin:0 }
const legendStyle: React.CSSProperties = { fontSize:12, fontWeight:900, color:'#334155', padding:'0 6px' }
const searchBtnStyle: React.CSSProperties = { padding:'7px 14px', background:'#64748b', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }
