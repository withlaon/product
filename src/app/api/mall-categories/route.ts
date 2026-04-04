import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/* ──────────────────────────────────────────────────────────────────
   각 쇼핑몰 실제 카테고리 데이터
   (아이템-대 > 아이템-중 > 아이템-소 구조)
────────────────────────────────────────────────────────────────── */
const STATIC_CATEGORIES: Record<string, Array<{ id: string; name: string }>> = {

  /* ── 패션플러스 (실제 SCM 아이템-대/중/소 구조 기준) ──
     ※ 가방/신발은 독립 최상위(아이템-대) 카테고리
     ※ 액세서리 = 주얼리·소품류만 포함
  ── */
  fashionplus: [
    // ── 여성의류 ──────────────────────────────────
    { id:'FPW001', name:'여성의류 > 아우터 > 코트' },
    { id:'FPW002', name:'여성의류 > 아우터 > 자켓' },
    { id:'FPW003', name:'여성의류 > 아우터 > 패딩/점퍼' },
    { id:'FPW004', name:'여성의류 > 아우터 > 가디건' },
    { id:'FPW005', name:'여성의류 > 아우터 > 무스탕/퍼' },
    { id:'FPW010', name:'여성의류 > 상의 > 니트/스웨터' },
    { id:'FPW011', name:'여성의류 > 상의 > 블라우스/셔츠' },
    { id:'FPW012', name:'여성의류 > 상의 > 맨투맨/후드' },
    { id:'FPW013', name:'여성의류 > 상의 > 티셔츠' },
    { id:'FPW014', name:'여성의류 > 상의 > 민소매/캐미솔' },
    { id:'FPW020', name:'여성의류 > 하의 > 팬츠/바지' },
    { id:'FPW021', name:'여성의류 > 하의 > 스커트 > 미니스커트' },
    { id:'FPW022', name:'여성의류 > 하의 > 스커트 > 미디스커트' },
    { id:'FPW023', name:'여성의류 > 하의 > 스커트 > 롱스커트' },
    { id:'FPW024', name:'여성의류 > 하의 > 레깅스' },
    { id:'FPW025', name:'여성의류 > 하의 > 반바지' },
    { id:'FPW030', name:'여성의류 > 원피스 > 미니원피스' },
    { id:'FPW031', name:'여성의류 > 원피스 > 미디원피스' },
    { id:'FPW032', name:'여성의류 > 원피스 > 맥시원피스' },
    { id:'FPW033', name:'여성의류 > 세트/수트' },
    { id:'FPW040', name:'여성의류 > 이너웨어 > 브라/팬티' },
    { id:'FPW041', name:'여성의류 > 이너웨어 > 잠옷/홈웨어' },
    // ── 남성의류 ──────────────────────────────────
    { id:'FPM001', name:'남성의류 > 아우터 > 코트' },
    { id:'FPM002', name:'남성의류 > 아우터 > 자켓' },
    { id:'FPM003', name:'남성의류 > 아우터 > 패딩/점퍼' },
    { id:'FPM004', name:'남성의류 > 아우터 > 가디건' },
    { id:'FPM010', name:'남성의류 > 상의 > 니트/스웨터' },
    { id:'FPM011', name:'남성의류 > 상의 > 맨투맨/후드' },
    { id:'FPM012', name:'남성의류 > 상의 > 티셔츠' },
    { id:'FPM013', name:'남성의류 > 상의 > 셔츠' },
    { id:'FPM020', name:'남성의류 > 하의 > 팬츠/바지' },
    { id:'FPM021', name:'남성의류 > 하의 > 반바지' },
    { id:'FPM030', name:'남성의류 > 이너웨어' },
    // ── 가방 (독립 최상위) ─────────────────────────
    { id:'FPB001', name:'가방 > 여성가방 > 숄더백' },
    { id:'FPB002', name:'가방 > 여성가방 > 크로스백' },
    { id:'FPB003', name:'가방 > 여성가방 > 클러치/파우치' },
    { id:'FPB004', name:'가방 > 여성가방 > 토트백/에코백' },
    { id:'FPB005', name:'가방 > 여성가방 > 백팩' },
    { id:'FPB006', name:'가방 > 여성가방 > 미니백' },
    { id:'FPB010', name:'가방 > 남성가방 > 숄더백/메신저' },
    { id:'FPB011', name:'가방 > 남성가방 > 크로스백' },
    { id:'FPB012', name:'가방 > 남성가방 > 백팩' },
    // ── 신발 (독립 최상위) ─────────────────────────
    { id:'FPS001', name:'신발 > 여성신발 > 구두/펌프스' },
    { id:'FPS002', name:'신발 > 여성신발 > 샌들/뮬' },
    { id:'FPS003', name:'신발 > 여성신발 > 스니커즈/운동화' },
    { id:'FPS004', name:'신발 > 여성신발 > 부츠/앵클부츠' },
    { id:'FPS010', name:'신발 > 남성신발 > 구두/옥스퍼드' },
    { id:'FPS011', name:'신발 > 남성신발 > 스니커즈' },
    { id:'FPS012', name:'신발 > 남성신발 > 샌들/슬리퍼' },
    // ── 스포츠 ────────────────────────────────────
    { id:'FPSP001', name:'스포츠 > 스포츠상의' },
    { id:'FPSP002', name:'스포츠 > 스포츠하의' },
    { id:'FPSP003', name:'스포츠 > 레깅스' },
    { id:'FPSP004', name:'스포츠 > 수영복' },
    { id:'FPSP005', name:'스포츠 > 스포츠아우터' },
    // ── 액세서리 (주얼리·패션소품만) ──────────────
    { id:'FPA001', name:'액세서리 > 주얼리 > 귀걸이' },
    { id:'FPA002', name:'액세서리 > 주얼리 > 목걸이' },
    { id:'FPA003', name:'액세서리 > 주얼리 > 반지' },
    { id:'FPA004', name:'액세서리 > 주얼리 > 팔찌' },
    { id:'FPA010', name:'액세서리 > 패션소품 > 모자' },
    { id:'FPA011', name:'액세서리 > 패션소품 > 스카프/숄' },
    { id:'FPA012', name:'액세서리 > 패션소품 > 벨트' },
    { id:'FPA013', name:'액세서리 > 패션소품 > 선글라스' },
    { id:'FPA014', name:'액세서리 > 패션소품 > 양말/스타킹' },
    // ── 주니어스 ──────────────────────────────────
    { id:'FPJ001', name:'주니어스 > 아우터' },
    { id:'FPJ002', name:'주니어스 > 상의' },
    { id:'FPJ003', name:'주니어스 > 하의' },
    { id:'FPJ004', name:'주니어스 > 원피스' },
    // ── 브랜드 ────────────────────────────────────
    { id:'FPBR001', name:'브랜드 > 여성브랜드' },
    { id:'FPBR002', name:'브랜드 > 남성브랜드' },
    { id:'FPBR003', name:'브랜드 > 스포츠브랜드' },
    // ── 아웃도어/레저 ──────────────────────────────
    { id:'FPO001', name:'아웃도어/레저 > 아웃도어상의' },
    { id:'FPO002', name:'아웃도어/레저 > 아웃도어하의' },
    { id:'FPO003', name:'아웃도어/레저 > 등산화' },
    { id:'FPO004', name:'아웃도어/레저 > 레저용품' },
    // ── 골프 ──────────────────────────────────────
    { id:'FPG001', name:'골프 > 골프상의' },
    { id:'FPG002', name:'골프 > 골프하의' },
    { id:'FPG003', name:'골프 > 골프원피스' },
    { id:'FPG004', name:'골프 > 골프아우터' },
    // ── 아동슈즈 ──────────────────────────────────
    { id:'FPKS001', name:'아동슈즈 > 아동운동화' },
    { id:'FPKS002', name:'아동슈즈 > 아동샌들' },
    { id:'FPKS003', name:'아동슈즈 > 아동부츠' },
    // ── 유아동 ────────────────────────────────────
    { id:'FPK001', name:'유아동 > 아동상의' },
    { id:'FPK002', name:'유아동 > 아동하의' },
    { id:'FPK003', name:'유아동 > 아동원피스' },
    { id:'FPK004', name:'유아동 > 아동아우터' },
    // ── 잡화 ──────────────────────────────────────
    { id:'FPZ001', name:'잡화 > 생활잡화' },
    { id:'FPZ002', name:'잡화 > 뷰티/화장품' },
    { id:'FPZ003', name:'잡화 > 기타잡화' },
  ],

  /* ── 쿠팡 ── */
  coupang: [
    { id:'CPW001', name:'여성패션 > 상의 > 티셔츠' },
    { id:'CPW002', name:'여성패션 > 상의 > 니트/스웨터' },
    { id:'CPW003', name:'여성패션 > 상의 > 블라우스/셔츠' },
    { id:'CPW004', name:'여성패션 > 상의 > 맨투맨/후드' },
    { id:'CPW010', name:'여성패션 > 하의 > 팬츠/바지' },
    { id:'CPW011', name:'여성패션 > 하의 > 스커트' },
    { id:'CPW012', name:'여성패션 > 하의 > 레깅스' },
    { id:'CPW020', name:'여성패션 > 아우터 > 코트' },
    { id:'CPW021', name:'여성패션 > 아우터 > 자켓/블레이저' },
    { id:'CPW022', name:'여성패션 > 아우터 > 패딩/점퍼' },
    { id:'CPW023', name:'여성패션 > 아우터 > 가디건' },
    { id:'CPW030', name:'여성패션 > 원피스/세트 > 원피스' },
    { id:'CPW031', name:'여성패션 > 원피스/세트 > 투피스/세트' },
    { id:'CPM001', name:'남성패션 > 상의 > 티셔츠' },
    { id:'CPM002', name:'남성패션 > 상의 > 니트/스웨터' },
    { id:'CPM003', name:'남성패션 > 상의 > 맨투맨/후드' },
    { id:'CPM010', name:'남성패션 > 하의 > 팬츠/바지' },
    { id:'CPM020', name:'남성패션 > 아우터 > 코트' },
    { id:'CPM021', name:'남성패션 > 아우터 > 자켓' },
    { id:'CPM022', name:'남성패션 > 아우터 > 패딩/점퍼' },
    { id:'CPA001', name:'패션잡화 > 가방 > 숄더백' },
    { id:'CPA002', name:'패션잡화 > 가방 > 크로스백' },
    { id:'CPA003', name:'패션잡화 > 가방 > 백팩' },
    { id:'CPA010', name:'패션잡화 > 신발 > 구두/펌프스' },
    { id:'CPA011', name:'패션잡화 > 신발 > 스니커즈' },
    { id:'CPA012', name:'패션잡화 > 신발 > 샌들/슬리퍼' },
    { id:'CPA020', name:'패션잡화 > 주얼리/액세서리 > 귀걸이' },
    { id:'CPA021', name:'패션잡화 > 주얼리/액세서리 > 목걸이' },
  ],

  /* ── 스마트스토어 ── */
  naver: [
    { id:'NVW001', name:'여성의류 > 상의 > 티셔츠' },
    { id:'NVW002', name:'여성의류 > 상의 > 니트/스웨터' },
    { id:'NVW003', name:'여성의류 > 상의 > 블라우스/셔츠' },
    { id:'NVW004', name:'여성의류 > 상의 > 맨투맨/후드티셔츠' },
    { id:'NVW010', name:'여성의류 > 하의 > 팬츠' },
    { id:'NVW011', name:'여성의류 > 하의 > 스커트' },
    { id:'NVW012', name:'여성의류 > 하의 > 레깅스' },
    { id:'NVW020', name:'여성의류 > 아우터 > 코트' },
    { id:'NVW021', name:'여성의류 > 아우터 > 자켓/블레이저' },
    { id:'NVW022', name:'여성의류 > 아우터 > 패딩/점퍼' },
    { id:'NVW023', name:'여성의류 > 아우터 > 가디건' },
    { id:'NVW030', name:'여성의류 > 원피스' },
    { id:'NVW031', name:'여성의류 > 투피스/세트' },
    { id:'NVM001', name:'남성의류 > 상의 > 티셔츠' },
    { id:'NVM002', name:'남성의류 > 상의 > 니트/스웨터' },
    { id:'NVM003', name:'남성의류 > 상의 > 맨투맨/후드티셔츠' },
    { id:'NVM010', name:'남성의류 > 하의 > 팬츠' },
    { id:'NVM020', name:'남성의류 > 아우터 > 코트' },
    { id:'NVM021', name:'남성의류 > 아우터 > 자켓' },
    { id:'NVM022', name:'남성의류 > 아우터 > 패딩/점퍼' },
    { id:'NVA001', name:'패션잡화 > 가방 > 숄더백' },
    { id:'NVA002', name:'패션잡화 > 가방 > 크로스백' },
    { id:'NVA003', name:'패션잡화 > 가방 > 백팩' },
    { id:'NVA010', name:'패션잡화 > 신발 > 구두/펌프스' },
    { id:'NVA011', name:'패션잡화 > 신발 > 스니커즈' },
    { id:'NVA020', name:'패션잡화 > 주얼리/액세서리 > 귀걸이' },
    { id:'NVA021', name:'패션잡화 > 주얼리/액세서리 > 목걸이' },
  ],

  /* ── 11번가 ── */
  '11st': [
    { id:'11W001', name:'여성패션 > 의류 > 상의 > 티셔츠' },
    { id:'11W002', name:'여성패션 > 의류 > 상의 > 니트/스웨터' },
    { id:'11W003', name:'여성패션 > 의류 > 상의 > 블라우스/셔츠' },
    { id:'11W004', name:'여성패션 > 의류 > 상의 > 맨투맨/후드' },
    { id:'11W010', name:'여성패션 > 의류 > 하의 > 팬츠/바지' },
    { id:'11W011', name:'여성패션 > 의류 > 하의 > 스커트' },
    { id:'11W012', name:'여성패션 > 의류 > 하의 > 레깅스' },
    { id:'11W020', name:'여성패션 > 의류 > 아우터 > 코트' },
    { id:'11W021', name:'여성패션 > 의류 > 아우터 > 자켓' },
    { id:'11W022', name:'여성패션 > 의류 > 아우터 > 패딩/점퍼' },
    { id:'11W023', name:'여성패션 > 의류 > 아우터 > 가디건' },
    { id:'11W030', name:'여성패션 > 의류 > 원피스' },
    { id:'11M001', name:'남성패션 > 의류 > 상의 > 티셔츠' },
    { id:'11M002', name:'남성패션 > 의류 > 상의 > 니트/스웨터' },
    { id:'11M003', name:'남성패션 > 의류 > 상의 > 맨투맨/후드' },
    { id:'11M010', name:'남성패션 > 의류 > 하의 > 팬츠/바지' },
    { id:'11M020', name:'남성패션 > 의류 > 아우터 > 코트' },
    { id:'11M021', name:'남성패션 > 의류 > 아우터 > 자켓' },
    { id:'11M022', name:'남성패션 > 의류 > 아우터 > 패딩/점퍼' },
    { id:'11A001', name:'패션잡화 > 가방 > 숄더백' },
    { id:'11A002', name:'패션잡화 > 가방 > 크로스백' },
    { id:'11A010', name:'패션잡화 > 신발 > 구두' },
    { id:'11A011', name:'패션잡화 > 신발 > 스니커즈' },
    { id:'11A020', name:'패션잡화 > 주얼리/액세서리 > 귀걸이' },
  ],

  /* ── ESM G마켓 ── */
  gmarket: [
    { id:'GMW001', name:'여성의류 > 상의 > 티셔츠' },
    { id:'GMW002', name:'여성의류 > 상의 > 니트/스웨터' },
    { id:'GMW003', name:'여성의류 > 상의 > 블라우스/셔츠' },
    { id:'GMW004', name:'여성의류 > 상의 > 맨투맨/후드' },
    { id:'GMW010', name:'여성의류 > 하의 > 팬츠/바지' },
    { id:'GMW011', name:'여성의류 > 하의 > 스커트' },
    { id:'GMW020', name:'여성의류 > 아우터 > 코트' },
    { id:'GMW021', name:'여성의류 > 아우터 > 자켓' },
    { id:'GMW022', name:'여성의류 > 아우터 > 패딩/점퍼' },
    { id:'GMW030', name:'여성의류 > 원피스' },
    { id:'GMM001', name:'남성의류 > 상의 > 티셔츠' },
    { id:'GMM002', name:'남성의류 > 상의 > 니트' },
    { id:'GMM010', name:'남성의류 > 하의 > 바지' },
    { id:'GMA001', name:'패션잡화 > 여성가방 > 숄더백' },
    { id:'GMA002', name:'패션잡화 > 여성가방 > 크로스백' },
    { id:'GMA010', name:'패션잡화 > 신발 > 구두/펌프스' },
    { id:'GMA011', name:'패션잡화 > 신발 > 스니커즈' },
    { id:'GMA020', name:'패션잡화 > 패션소품 > 귀걸이' },
  ],

  /* ── ESM 옥션 ── */
  auction: [
    { id:'ACW001', name:'여성의류 > 상의 > 티셔츠' },
    { id:'ACW002', name:'여성의류 > 상의 > 니트/스웨터' },
    { id:'ACW003', name:'여성의류 > 상의 > 블라우스/셔츠' },
    { id:'ACW004', name:'여성의류 > 상의 > 맨투맨/후드' },
    { id:'ACW010', name:'여성의류 > 하의 > 팬츠/바지' },
    { id:'ACW011', name:'여성의류 > 하의 > 스커트' },
    { id:'ACW020', name:'여성의류 > 아우터 > 코트' },
    { id:'ACW021', name:'여성의류 > 아우터 > 자켓' },
    { id:'ACW022', name:'여성의류 > 아우터 > 패딩/점퍼' },
    { id:'ACW030', name:'여성의류 > 원피스' },
    { id:'ACM001', name:'남성의류 > 상의 > 티셔츠' },
    { id:'ACM002', name:'남성의류 > 상의 > 니트' },
    { id:'ACM010', name:'남성의류 > 하의 > 바지' },
    { id:'ACA001', name:'패션잡화 > 여성가방 > 숄더백' },
    { id:'ACA002', name:'패션잡화 > 여성가방 > 크로스백' },
    { id:'ACA010', name:'패션잡화 > 신발 > 구두/펌프스' },
    { id:'ACA020', name:'패션잡화 > 패션소품 > 귀걸이' },
  ],

  /* ── 에이블리 ── */
  ablly: [
    { id:'ABW001', name:'상의 > 반팔/반소매 티셔츠' },
    { id:'ABW002', name:'상의 > 긴팔/긴소매 티셔츠' },
    { id:'ABW003', name:'상의 > 니트/스웨터' },
    { id:'ABW004', name:'상의 > 블라우스/셔츠' },
    { id:'ABW005', name:'상의 > 맨투맨/후드' },
    { id:'ABW006', name:'상의 > 민소매/탑/나시' },
    { id:'ABW010', name:'하의 > 데님/청바지' },
    { id:'ABW011', name:'하의 > 스트레이트 팬츠' },
    { id:'ABW012', name:'하의 > 슬랙스' },
    { id:'ABW013', name:'하의 > 조거/트레이닝팬츠' },
    { id:'ABW014', name:'하의 > 반바지/숏팬츠' },
    { id:'ABW015', name:'하의 > 레깅스' },
    { id:'ABW016', name:'하의 > 스커트 > 미니스커트' },
    { id:'ABW017', name:'하의 > 스커트 > 미디스커트' },
    { id:'ABW018', name:'하의 > 스커트 > 롱/맥시스커트' },
    { id:'ABW020', name:'아우터 > 코트' },
    { id:'ABW021', name:'아우터 > 자켓/블레이저' },
    { id:'ABW022', name:'아우터 > 패딩/점퍼' },
    { id:'ABW023', name:'아우터 > 가디건' },
    { id:'ABW024', name:'아우터 > 무스탕/퍼' },
    { id:'ABW030', name:'원피스 > 미니원피스' },
    { id:'ABW031', name:'원피스 > 미디원피스' },
    { id:'ABW032', name:'원피스 > 맥시원피스' },
    { id:'ABA001', name:'가방 > 숄더백' },
    { id:'ABA002', name:'가방 > 크로스백' },
    { id:'ABA003', name:'가방 > 클러치/파우치' },
    { id:'ABA004', name:'가방 > 에코백/토트백' },
    { id:'ABA005', name:'가방 > 백팩' },
    { id:'ABA010', name:'신발 > 구두/펌프스' },
    { id:'ABA011', name:'신발 > 샌들/뮬' },
    { id:'ABA012', name:'신발 > 스니커즈/운동화' },
    { id:'ABA013', name:'신발 > 부츠/앵클부츠' },
    { id:'ABA020', name:'주얼리 > 귀걸이' },
    { id:'ABA021', name:'주얼리 > 목걸이' },
    { id:'ABA022', name:'주얼리 > 반지' },
    { id:'ABA023', name:'주얼리 > 팔찌' },
    { id:'ABA030', name:'패션소품 > 모자' },
    { id:'ABA031', name:'패션소품 > 스카프/숄' },
    { id:'ABA032', name:'패션소품 > 선글라스' },
    { id:'ABA033', name:'패션소품 > 벨트' },
    { id:'ABA040', name:'트레이닝 > 트레이닝팬츠' },
    { id:'ABA041', name:'트레이닝 > 레깅스' },
    { id:'ABA050', name:'비치웨어' },
    { id:'ABA060', name:'언더웨어/잠옷' },
  ],

  /* ── 지그재그 ── */
  zigzag: [
    { id:'ZGW001', name:'상의 > 반팔 티셔츠' },
    { id:'ZGW002', name:'상의 > 긴팔 티셔츠' },
    { id:'ZGW003', name:'상의 > 니트/스웨터' },
    { id:'ZGW004', name:'상의 > 블라우스/셔츠' },
    { id:'ZGW005', name:'상의 > 맨투맨/후드' },
    { id:'ZGW006', name:'상의 > 민소매/탑' },
    { id:'ZGW010', name:'하의 > 팬츠/바지' },
    { id:'ZGW011', name:'하의 > 스커트 > 미니스커트' },
    { id:'ZGW012', name:'하의 > 스커트 > 미디스커트' },
    { id:'ZGW013', name:'하의 > 스커트 > 롱스커트' },
    { id:'ZGW014', name:'하의 > 레깅스' },
    { id:'ZGW020', name:'아우터 > 코트' },
    { id:'ZGW021', name:'아우터 > 가죽/레더자켓' },
    { id:'ZGW022', name:'아우터 > 패딩/점퍼' },
    { id:'ZGW023', name:'아우터 > 가디건' },
    { id:'ZGW030', name:'원피스 > 미니원피스' },
    { id:'ZGW031', name:'원피스 > 미디원피스' },
    { id:'ZGW032', name:'원피스 > 맥시원피스' },
    { id:'ZGA001', name:'가방 > 숄더백' },
    { id:'ZGA002', name:'가방 > 크로스백' },
    { id:'ZGA003', name:'가방 > 미니백' },
    { id:'ZGA010', name:'신발 > 구두/펌프스' },
    { id:'ZGA011', name:'신발 > 스니커즈' },
    { id:'ZGA012', name:'신발 > 샌들/슬리퍼' },
    { id:'ZGA020', name:'액세서리 > 귀걸이' },
    { id:'ZGA021', name:'액세서리 > 목걸이' },
  ],

  /* ── 올웨이즈 ── */
  alwayz: [
    { id:'AWW001', name:'의류 > 여성의류 > 상의 > 티셔츠' },
    { id:'AWW002', name:'의류 > 여성의류 > 상의 > 니트/스웨터' },
    { id:'AWW003', name:'의류 > 여성의류 > 상의 > 블라우스' },
    { id:'AWW004', name:'의류 > 여성의류 > 상의 > 맨투맨/후드' },
    { id:'AWW010', name:'의류 > 여성의류 > 하의 > 팬츠' },
    { id:'AWW011', name:'의류 > 여성의류 > 하의 > 스커트' },
    { id:'AWW020', name:'의류 > 여성의류 > 아우터 > 코트' },
    { id:'AWW021', name:'의류 > 여성의류 > 아우터 > 패딩/점퍼' },
    { id:'AWW030', name:'의류 > 여성의류 > 원피스' },
    { id:'AWM001', name:'의류 > 남성의류 > 상의 > 티셔츠' },
    { id:'AWM002', name:'의류 > 남성의류 > 상의 > 니트' },
    { id:'AWM010', name:'의류 > 남성의류 > 하의 > 바지' },
    { id:'AWA001', name:'패션잡화 > 가방 > 숄더백' },
    { id:'AWA002', name:'패션잡화 > 가방 > 크로스백' },
    { id:'AWA010', name:'패션잡화 > 신발' },
    { id:'AWA020', name:'패션잡화 > 모자' },
  ],

  /* ── 하프클럽 ── */
  halfclub: [
    { id:'HCW001', name:'여성의류 > 원피스 > 미니원피스' },
    { id:'HCW002', name:'여성의류 > 원피스 > 미디원피스' },
    { id:'HCW003', name:'여성의류 > 원피스 > 맥시원피스' },
    { id:'HCW010', name:'여성의류 > 상의 > 블라우스/셔츠' },
    { id:'HCW011', name:'여성의류 > 상의 > 니트/가디건' },
    { id:'HCW012', name:'여성의류 > 상의 > 티셔츠' },
    { id:'HCW013', name:'여성의류 > 상의 > 맨투맨/후드' },
    { id:'HCW020', name:'여성의류 > 하의 > 팬츠/바지' },
    { id:'HCW021', name:'여성의류 > 하의 > 스커트' },
    { id:'HCW030', name:'여성의류 > 아우터 > 코트' },
    { id:'HCW031', name:'여성의류 > 아우터 > 자켓' },
    { id:'HCW032', name:'여성의류 > 아우터 > 패딩' },
    { id:'HCM001', name:'남성의류 > 상의 > 티셔츠' },
    { id:'HCM002', name:'남성의류 > 상의 > 맨투맨/후드' },
    { id:'HCM010', name:'남성의류 > 하의 > 바지' },
    { id:'HCA001', name:'가방/잡화 > 여성가방 > 숄더백' },
    { id:'HCA002', name:'가방/잡화 > 여성가방 > 크로스백' },
    { id:'HCK001', name:'아동의류 > 아동상의' },
    { id:'HCK002', name:'아동의류 > 아동하의' },
  ],

  /* ── 지에스샵 ── */
  gsshop: [
    { id:'GSW001', name:'패션의류 > 여성의류 > 원피스' },
    { id:'GSW002', name:'패션의류 > 여성의류 > 니트/가디건' },
    { id:'GSW003', name:'패션의류 > 여성의류 > 블라우스/셔츠' },
    { id:'GSW004', name:'패션의류 > 여성의류 > 티셔츠' },
    { id:'GSW010', name:'패션의류 > 여성의류 > 팬츠/바지' },
    { id:'GSW011', name:'패션의류 > 여성의류 > 스커트' },
    { id:'GSW020', name:'패션의류 > 여성의류 > 아우터 > 코트' },
    { id:'GSW021', name:'패션의류 > 여성의류 > 아우터 > 자켓' },
    { id:'GSW022', name:'패션의류 > 여성의류 > 아우터 > 패딩' },
    { id:'GSM001', name:'패션의류 > 남성의류 > 티셔츠' },
    { id:'GSM010', name:'패션의류 > 남성의류 > 바지' },
    { id:'GSA001', name:'패션잡화 > 가방 > 핸드백/숄더백' },
    { id:'GSA002', name:'패션잡화 > 가방 > 크로스백' },
    { id:'GSS001', name:'스포츠 > 스포츠의류 > 상의' },
    { id:'GSS002', name:'스포츠 > 스포츠의류 > 하의' },
  ],

  /* ── 카카오톡스토어 ── */
  kakaostore: [
    { id:'KKW001', name:'여성의류 > 상의 > 티셔츠' },
    { id:'KKW002', name:'여성의류 > 상의 > 니트/스웨터' },
    { id:'KKW003', name:'여성의류 > 상의 > 블라우스' },
    { id:'KKW004', name:'여성의류 > 상의 > 맨투맨/후드' },
    { id:'KKW010', name:'여성의류 > 하의 > 팬츠' },
    { id:'KKW011', name:'여성의류 > 하의 > 스커트' },
    { id:'KKW020', name:'여성의류 > 아우터 > 코트' },
    { id:'KKW021', name:'여성의류 > 아우터 > 패딩' },
    { id:'KKW030', name:'여성의류 > 원피스' },
    { id:'KKM001', name:'남성의류 > 상의' },
    { id:'KKM010', name:'남성의류 > 하의' },
    { id:'KKA001', name:'패션잡화 > 가방' },
    { id:'KKA010', name:'패션잡화 > 신발' },
    { id:'KKA020', name:'패션잡화 > 주얼리/액세서리' },
  ],

  /* ── 롯데온 ── */
  lotteon: [
    { id:'LTW001', name:'패션의류 > 여성의류 > 원피스' },
    { id:'LTW002', name:'패션의류 > 여성의류 > 블라우스/셔츠' },
    { id:'LTW003', name:'패션의류 > 여성의류 > 니트/가디건' },
    { id:'LTW004', name:'패션의류 > 여성의류 > 티셔츠' },
    { id:'LTW010', name:'패션의류 > 여성의류 > 팬츠/바지' },
    { id:'LTW011', name:'패션의류 > 여성의류 > 스커트' },
    { id:'LTW020', name:'패션의류 > 여성의류 > 아우터 > 코트' },
    { id:'LTW021', name:'패션의류 > 여성의류 > 아우터 > 자켓' },
    { id:'LTW022', name:'패션의류 > 여성의류 > 아우터 > 패딩' },
    { id:'LTM001', name:'패션의류 > 남성의류 > 상의' },
    { id:'LTM010', name:'패션의류 > 남성의류 > 하의' },
    { id:'LTA001', name:'패션잡화 > 가방 > 숄더/크로스백' },
    { id:'LTA010', name:'패션잡화 > 신발' },
    { id:'LTS001', name:'스포츠/레저 > 스포츠의류' },
  ],

  /* ── SSG ── */
  ssg: [
    { id:'SSW001', name:'패션의류 > 여성의류 > 원피스' },
    { id:'SSW002', name:'패션의류 > 여성의류 > 블라우스/셔츠' },
    { id:'SSW003', name:'패션의류 > 여성의류 > 니트' },
    { id:'SSW010', name:'패션의류 > 여성의류 > 팬츠' },
    { id:'SSW011', name:'패션의류 > 여성의류 > 스커트' },
    { id:'SSW020', name:'패션의류 > 여성의류 > 아우터' },
    { id:'SSM001', name:'패션의류 > 남성의류 > 상의' },
    { id:'SSM010', name:'패션의류 > 남성의류 > 하의' },
    { id:'SSA001', name:'패션잡화 > 가방 > 숄더백' },
    { id:'SSA002', name:'패션잡화 > 가방 > 크로스백' },
  ],

  /* ── 제이슨딜 ── */
  jasondeal: [
    { id:'JDW001', name:'의류 > 여성의류 > 상의' },
    { id:'JDW002', name:'의류 > 여성의류 > 하의' },
    { id:'JDW003', name:'의류 > 여성의류 > 원피스' },
    { id:'JDW004', name:'의류 > 여성의류 > 아우터' },
    { id:'JDM001', name:'의류 > 남성의류 > 상의' },
    { id:'JDM010', name:'의류 > 남성의류 > 하의' },
    { id:'JDA001', name:'패션잡화 > 가방' },
    { id:'JDA010', name:'패션잡화 > 지갑' },
  ],

  /* ── 카페24 ── */
  cafe24: [
    { id:'CFW001', name:'상의 > 티셔츠' },
    { id:'CFW002', name:'상의 > 니트/스웨터' },
    { id:'CFW003', name:'상의 > 블라우스/셔츠' },
    { id:'CFW004', name:'상의 > 맨투맨/후드' },
    { id:'CFW010', name:'하의 > 팬츠/바지' },
    { id:'CFW011', name:'하의 > 스커트' },
    { id:'CFW012', name:'하의 > 레깅스' },
    { id:'CFW020', name:'아우터 > 코트' },
    { id:'CFW021', name:'아우터 > 자켓' },
    { id:'CFW022', name:'아우터 > 패딩/점퍼' },
    { id:'CFW030', name:'원피스' },
    { id:'CFA001', name:'가방 > 숄더백' },
    { id:'CFA002', name:'가방 > 크로스백' },
    { id:'CFZ001', name:'잡화 > 지갑' },
  ],

  /* ── 토스쇼핑 ── */
  toss: [
    { id:'TSW001', name:'여성패션 > 상의 > 티셔츠' },
    { id:'TSW002', name:'여성패션 > 상의 > 니트' },
    { id:'TSW003', name:'여성패션 > 상의 > 블라우스' },
    { id:'TSW010', name:'여성패션 > 하의 > 팬츠' },
    { id:'TSW011', name:'여성패션 > 하의 > 스커트' },
    { id:'TSW020', name:'여성패션 > 아우터 > 코트' },
    { id:'TSW021', name:'여성패션 > 아우터 > 패딩' },
    { id:'TSW030', name:'여성패션 > 원피스' },
    { id:'TSM001', name:'남성패션 > 상의' },
    { id:'TSM010', name:'남성패션 > 하의' },
    { id:'TSA001', name:'패션잡화 > 가방' },
    { id:'TSA010', name:'패션잡화 > 신발' },
  ],
}

/* ──────────────────────────────────────────────────────────────────
   패션플러스 실제 API 호출 시도 (서버 사이드)
────────────────────────────────────────────────────────────────── */
async function tryFashionplusApi(credentials: {
  login_id?: string
  login_pw?: string
  api_key?: string  // 거래처코드
}): Promise<Array<{ id: string; name: string }> | null> {
  if (!credentials.login_id || !credentials.login_pw || !credentials.api_key) return null
  try {
    // 패션플러스 SCM 카테고리 API 엔드포인트
    const res = await fetch('https://api.fashionplus.co.kr/v1/category/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trader-Code': credentials.api_key,
      },
      body: JSON.stringify({ traderCode: credentials.api_key }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data.categories)) return null
    return data.categories.map((c: { categoryId: string; categoryFullName?: string; categoryName?: string }) => ({
      id: String(c.categoryId),
      name: c.categoryFullName || c.categoryName || String(c.categoryId),
    }))
  } catch {
    return null
  }
}

/* ──────────────────────────────────────────────────────────────────
   POST /api/mall-categories
   body: { mall: string, query?: string, credentials?: {...} }
────────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { mall, query = '', credentials = {} } = body as {
      mall: string
      query?: string
      credentials?: Record<string, string>
    }

    // 패션플러스: 실제 API 먼저 시도
    if (mall === 'fashionplus' && credentials.api_key) {
      const apiResult = await tryFashionplusApi(credentials)
      if (apiResult && apiResult.length > 0) {
        const q = query.trim().toLowerCase()
        const filtered = q ? apiResult.filter(c => c.name.toLowerCase().includes(q)) : apiResult
        return NextResponse.json({ categories: filtered, source: 'api', total: apiResult.length })
      }
    }

    // 정적 데이터 반환
    const all = STATIC_CATEGORIES[mall] || []
    const q = query.trim().toLowerCase()
    const filtered = q ? all.filter(c => c.name.toLowerCase().includes(q)) : all
    return NextResponse.json({ categories: filtered, source: 'static', total: all.length })
  } catch (e) {
    return NextResponse.json({ error: String(e), categories: [], source: 'error' }, { status: 500 })
  }
}
