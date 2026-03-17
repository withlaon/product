-- ══════════════════════════════════════════════════════════════════════════
-- ProductPRO 셀러툴 수준 통합 DB 스키마 v2
-- 샵링커/사방넷/셀메이트 구조 참고
-- Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════════════════════════════════

-- ─── 공통 updated_at 트리거 함수 ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════════════════
-- 1. 마켓플레이스 연동 정보
--    각 쇼핑몰 API 인증 정보를 저장합니다.
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketplaces (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- 식별
  mall_key        TEXT        NOT NULL UNIQUE,   -- 'coupang', 'smartstore', '11st' ...
  mall_name       TEXT        NOT NULL,          -- '쿠팡', '스마트스토어' ...
  mall_type       TEXT        NOT NULL DEFAULT 'open_market',  -- open_market / fashion / social_commerce

  -- 인증 정보
  login_id        TEXT,
  login_pw        TEXT,                          -- 암호화 권장
  seller_id       TEXT,                          -- Vendor ID / Partner ID ...
  api_key         TEXT,
  api_secret      TEXT,
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires_at TIMESTAMPTZ,

  -- 추가 설정
  extra_settings  JSONB       DEFAULT '{}',     -- FTP 정보 등 기타 설정
  order_collect_interval INTEGER DEFAULT 5,     -- 주문 수집 주기 (분)
  is_active       BOOLEAN     DEFAULT true,
  last_synced_at  TIMESTAMPTZ,
  status          TEXT        DEFAULT 'connected' CHECK (status IN ('connected','disconnected','error','pending'))
);

CREATE TRIGGER trg_marketplaces_updated_at
  BEFORE UPDATE ON marketplaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE marketplaces DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. 마스터 상품 (통합 상품 카탈로그)
--    쇼핑몰과 무관한 내부 상품 정보 (샵링커/사방넷의 "통합상품")
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS master_products (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- 기본 정보
  internal_code   TEXT        NOT NULL UNIQUE,   -- 내부 상품 코드
  name            TEXT        NOT NULL,
  brand           TEXT        DEFAULT '',
  category        TEXT        DEFAULT '',         -- 마스터 카테고리 (예: 여성의류 > 원피스)
  supplier        TEXT        DEFAULT '',
  origin          TEXT        DEFAULT '',         -- 원산지
  description_html TEXT,                          -- 상품 상세 HTML

  -- 가격
  cost_price      NUMERIC(12,2) DEFAULT 0,       -- 원가 (CNY, KRW 등)
  cost_currency   TEXT        DEFAULT 'KRW',
  base_price      NUMERIC(12,2) DEFAULT 0,       -- 기준 판매가
  sale_price      NUMERIC(12,2) DEFAULT 0,       -- 할인가

  -- 이미지
  main_image      TEXT,                           -- 대표 이미지 URL
  images          TEXT[]      DEFAULT '{}',       -- 이미지 URL 배열

  -- 상태
  status          TEXT        DEFAULT 'active' CHECK (status IN ('active','inactive','discontinued')),

  -- 메타
  weight          INTEGER     DEFAULT 0,          -- 무게 (g)
  dimensions      TEXT        DEFAULT '',          -- 크기 (예: 10x20x5)
  tags            TEXT[]      DEFAULT '{}',
  notes           TEXT        DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_master_products_code ON master_products(internal_code);
CREATE INDEX IF NOT EXISTS idx_master_products_status ON master_products(status);

CREATE TRIGGER trg_master_products_updated_at
  BEFORE UPDATE ON master_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE master_products DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. 옵션 그룹 (색상, 사이즈 등의 옵션 속성)
--    샵링커의 "OptionGroup" 개념
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS option_groups (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES master_products(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,           -- '색상', '사이즈', '컬러', '호수' ...
  sort_order      INTEGER     DEFAULT 0
);

ALTER TABLE option_groups DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. 마스터 SKU (옵션 조합별 재고 단위)
--    샵링커의 "SKU" 개념 — 통합 재고 관리의 핵심
--
--    예시:
--    티셔츠 (master_product)
--      ├ SKU1: 레드/M  → stock=50
--      ├ SKU2: 레드/L  → stock=30
--      ├ SKU3: 블랙/M  → stock=40
--      └ SKU4: 블랙/L  → stock=20
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS master_skus (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  product_id      UUID        NOT NULL REFERENCES master_products(id) ON DELETE CASCADE,

  -- SKU 식별
  sku_code        TEXT        NOT NULL,            -- 바코드 또는 내부 SKU코드
  option_values   JSONB       DEFAULT '{}',        -- { "색상": "레드", "사이즈": "M" }
  option_label    TEXT        DEFAULT '',           -- "레드/M" (표시용)

  -- 재고
  stock           INTEGER     DEFAULT 0,
  safety_stock    INTEGER     DEFAULT 5,           -- 안전 재고 (이하 시 경고)
  reserved_stock  INTEGER     DEFAULT 0,           -- 주문 접수 후 예약된 재고

  -- 가격 (SKU별 추가금액)
  extra_price     NUMERIC(10,2) DEFAULT 0,

  -- 이미지 (SKU별 이미지, 예: 색상별)
  image           TEXT,

  -- 상태
  status          TEXT        DEFAULT 'active' CHECK (status IN ('active','inactive')),

  UNIQUE(product_id, sku_code)
);

CREATE INDEX IF NOT EXISTS idx_master_skus_product ON master_skus(product_id);
CREATE INDEX IF NOT EXISTS idx_master_skus_code ON master_skus(sku_code);

CREATE TRIGGER trg_master_skus_updated_at
  BEFORE UPDATE ON master_skus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE master_skus DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. 카테고리 매핑
--    마스터 카테고리 → 각 쇼핑몰 카테고리 코드 매핑
--
--    예시:
--    "여성의류/티셔츠" → 쿠팡: C004, 스마트스토어: N005, 지그재그: Z008
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS category_mappings (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),

  master_category     TEXT    NOT NULL,            -- 마스터 카테고리 경로 (예: 여성의류/티셔츠)
  mall_key            TEXT    NOT NULL,            -- 쇼핑몰 키
  mall_category_id    TEXT    NOT NULL,            -- 쇼핑몰 카테고리 코드
  mall_category_name  TEXT    DEFAULT '',          -- 쇼핑몰 카테고리 표시명

  UNIQUE(master_category, mall_key)
);

CREATE INDEX IF NOT EXISTS idx_category_mappings_master ON category_mappings(master_category);
CREATE INDEX IF NOT EXISTS idx_category_mappings_mall ON category_mappings(mall_key);

ALTER TABLE category_mappings DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. 마켓플레이스 상품 (각 쇼핑몰에 등록된 상품)
--    샵링커의 "마켓상품" 개념
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketplace_products (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  -- 연결
  master_product_id   UUID    NOT NULL REFERENCES master_products(id) ON DELETE CASCADE,
  marketplace_id      UUID    NOT NULL REFERENCES marketplaces(id) ON DELETE CASCADE,

  -- 쇼핑몰 상품 정보
  mall_product_id     TEXT    NOT NULL,            -- 쇼핑몰 내 상품 ID
  mall_product_url    TEXT,                        -- 쇼핑몰 상품 링크
  mall_category_id    TEXT    DEFAULT '',          -- 등록된 쇼핑몰 카테고리
  mall_name           TEXT    DEFAULT '',          -- 쇼핑몰에 등록된 상품명 (마스터와 다를 수 있음)
  mall_price          NUMERIC(12,2) DEFAULT 0,    -- 쇼핑몰 판매가

  -- 동기화 상태
  sync_status         TEXT    DEFAULT 'synced' CHECK (sync_status IN ('synced','pending','error','out_of_sync')),
  last_synced_at      TIMESTAMPTZ,
  sync_error          TEXT,                        -- 오류 메시지

  -- 상태
  status              TEXT    DEFAULT 'active' CHECK (status IN ('active','inactive','deleted')),

  UNIQUE(marketplace_id, mall_product_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_products_master ON marketplace_products(master_product_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_mall ON marketplace_products(marketplace_id);

CREATE TRIGGER trg_marketplace_products_updated_at
  BEFORE UPDATE ON marketplace_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE marketplace_products DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 7. 마켓플레이스 SKU 매핑
--    마스터 SKU ↔ 쇼핑몰 SKU 연결 (재고 동기화의 핵심)
--
--    재고 동기화 흐름:
--    쿠팡 주문 발생 → master_sku.stock -1 → 다른 쇼핑몰 재고 업데이트
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketplace_skus (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),

  -- 연결
  master_sku_id       UUID    NOT NULL REFERENCES master_skus(id) ON DELETE CASCADE,
  marketplace_product_id UUID NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,

  -- 쇼핑몰 SKU 정보
  mall_sku_id         TEXT,                        -- 쇼핑몰 SKU ID
  mall_option_id      TEXT,                        -- 쇼핑몰 옵션 ID
  mall_item_id        TEXT,                        -- 쇼핑몰 아이템 ID (쿠팡 등)
  mall_option_label   TEXT,                        -- 쇼핑몰에서의 옵션 표시명

  UNIQUE(master_sku_id, marketplace_product_id)
);

ALTER TABLE marketplace_skus DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 8. 배송 정책 (통합 배송 정책)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shipping_policies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  name            TEXT        NOT NULL,            -- '기본배송', '무료배송' ...
  delivery_type   TEXT        DEFAULT 'parcel' CHECK (delivery_type IN ('parcel','direct','quick')),
  fee_type        TEXT        DEFAULT 'free' CHECK (fee_type IN ('free','paid','conditional')),
  base_fee        INTEGER     DEFAULT 0,
  free_threshold  INTEGER     DEFAULT 0,           -- 무료배송 기준 금액
  jeju_extra      INTEGER     DEFAULT 0,
  island_extra    INTEGER     DEFAULT 0,
  return_fee      INTEGER     DEFAULT 0,           -- 반품 편도 배송비
  exchange_fee    INTEGER     DEFAULT 0,           -- 교환 왕복 배송비
  courier         TEXT        DEFAULT 'CJ대한통운',
  warehouse_name  TEXT        DEFAULT '',
  warehouse_addr  TEXT        DEFAULT '',
  lead_days       INTEGER     DEFAULT 2,           -- 발송 소요일

  -- 쇼핑몰별 배송 ID 매핑
  mall_mappings   JSONB       DEFAULT '{}'         -- { "coupang": "template_id", "smartstore": "..." }
);

CREATE TRIGGER trg_shipping_policies_updated_at
  BEFORE UPDATE ON shipping_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE shipping_policies DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 9. 통합 주문 (모든 쇼핑몰 주문을 표준화하여 저장)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS unified_orders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- 쇼핑몰 정보
  marketplace_id  UUID        REFERENCES marketplaces(id),
  mall_key        TEXT        NOT NULL,
  mall_order_id   TEXT        NOT NULL,            -- 쇼핑몰 주문번호
  mall_order_no   TEXT        NOT NULL,            -- 쇼핑몰 주문 묶음번호

  -- 주문일
  order_date      TIMESTAMPTZ NOT NULL,

  -- 구매자 정보
  buyer_name      TEXT        DEFAULT '',
  buyer_phone     TEXT        DEFAULT '',
  buyer_email     TEXT        DEFAULT '',

  -- 수령인 정보
  receiver_name   TEXT        DEFAULT '',
  receiver_phone  TEXT        DEFAULT '',
  receiver_zip    TEXT        DEFAULT '',
  receiver_addr   TEXT        DEFAULT '',
  receiver_addr2  TEXT        DEFAULT '',
  delivery_message TEXT       DEFAULT '',

  -- 금액
  total_price     NUMERIC(12,2) DEFAULT 0,
  shipping_fee    NUMERIC(12,2) DEFAULT 0,

  -- 배송
  courier         TEXT        DEFAULT '',
  invoice_no      TEXT        DEFAULT '',
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,

  -- 통합 주문 상태 (표준화)
  status          TEXT        DEFAULT 'paid' CHECK (status IN (
    'new',          -- 신규
    'paid',         -- 결제완료
    'preparing',    -- 발송준비
    'shipped',      -- 발송완료/배송중
    'delivered',    -- 배송완료
    'confirmed',    -- 구매확정
    'cancel_req',   -- 취소요청
    'cancelled',    -- 취소완료
    'return_req',   -- 반품요청
    'returned',     -- 반품완료
    'exchange_req', -- 교환요청
    'exchanged'     -- 교환완료
  )),
  raw_status      TEXT        DEFAULT '',          -- 쇼핑몰 원본 상태값

  -- 메모
  notes           TEXT        DEFAULT '',
  is_duplicate    BOOLEAN     DEFAULT false,       -- 중복 주문 여부

  UNIQUE(mall_key, mall_order_id)
);

CREATE INDEX IF NOT EXISTS idx_unified_orders_mall ON unified_orders(mall_key);
CREATE INDEX IF NOT EXISTS idx_unified_orders_status ON unified_orders(status);
CREATE INDEX IF NOT EXISTS idx_unified_orders_date ON unified_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_unified_orders_invoice ON unified_orders(invoice_no) WHERE invoice_no != '';

CREATE TRIGGER trg_unified_orders_updated_at
  BEFORE UPDATE ON unified_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE unified_orders DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 10. 주문 상품 (주문별 상품 내역 + SKU 연결)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS unified_order_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID        NOT NULL REFERENCES unified_orders(id) ON DELETE CASCADE,

  -- 쇼핑몰 원본
  mall_order_item_id TEXT,

  -- 상품 정보
  master_product_id UUID      REFERENCES master_products(id),
  master_sku_id   UUID        REFERENCES master_skus(id),

  product_name    TEXT        NOT NULL,
  option_label    TEXT        DEFAULT '',           -- '레드/M'
  qty             INTEGER     NOT NULL DEFAULT 1,
  unit_price      NUMERIC(12,2) DEFAULT 0,
  total_price     NUMERIC(12,2) DEFAULT 0,

  -- 재고 차감 여부 (중복 차감 방지)
  stock_deducted  BOOLEAN     DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON unified_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON unified_order_items(master_sku_id);

ALTER TABLE unified_order_items DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 11. 주문 상태 매핑 (쇼핑몰별 상태코드 → 통합 상태)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS order_status_mappings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mall_key        TEXT        NOT NULL,
  raw_status      TEXT        NOT NULL,            -- 쇼핑몰 원본 상태값
  unified_status  TEXT        NOT NULL,            -- 통합 상태값

  UNIQUE(mall_key, raw_status)
);

-- 기본 매핑 데이터 삽입
INSERT INTO order_status_mappings (mall_key, raw_status, unified_status) VALUES
  -- 스마트스토어
  ('smartstore', 'PAYMENT_WAITING',    'new'),
  ('smartstore', 'PAYED',              'paid'),
  ('smartstore', 'DELIVERING',         'shipped'),
  ('smartstore', 'DELIVERED',          'delivered'),
  ('smartstore', 'PURCHASE_DECIDED',   'confirmed'),
  ('smartstore', 'CANCELED',           'cancelled'),
  ('smartstore', 'RETURNED',           'returned'),
  ('smartstore', 'EXCHANGED',          'exchanged'),
  -- 쿠팡
  ('coupang', 'ACCEPT',                'paid'),
  ('coupang', 'INSTRUCT',              'preparing'),
  ('coupang', 'DEPARTURE',             'shipped'),
  ('coupang', 'DELIVERING',            'shipped'),
  ('coupang', 'FINAL_DELIVERY',        'delivered'),
  ('coupang', 'PURCHASE_DECISION',     'confirmed'),
  ('coupang', 'CANCEL_REQUEST',        'cancel_req'),
  ('coupang', 'CANCELED',              'cancelled'),
  ('coupang', 'RETURN_REQUEST',        'return_req'),
  ('coupang', 'RETURNED',              'returned'),
  ('coupang', 'EXCHANGE_REQUEST',      'exchange_req'),
  -- 11번가
  ('11st', '결제완료',                 'paid'),
  ('11st', '발송대기',                 'preparing'),
  ('11st', '발송완료',                 'shipped'),
  ('11st', '구매확정',                 'confirmed'),
  ('11st', '취소',                     'cancelled'),
  ('11st', '반품',                     'returned'),
  -- G마켓/옥션
  ('gmarket', '결제완료',              'paid'),
  ('gmarket', '배송준비중',            'preparing'),
  ('gmarket', '배송중',                'shipped'),
  ('gmarket', '배송완료',              'delivered'),
  ('gmarket', '구매확정',              'confirmed'),
  ('auction', '결제완료',              'paid'),
  ('auction', '배송준비중',            'preparing'),
  ('auction', '배송중',                'shipped'),
  ('auction', '구매확정',              'confirmed')
ON CONFLICT (mall_key, raw_status) DO NOTHING;

ALTER TABLE order_status_mappings DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 12. 클레임 (취소/반품/교환/CS문의)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS claims (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  order_id        UUID        REFERENCES unified_orders(id),
  mall_key        TEXT        NOT NULL,
  mall_claim_id   TEXT        NOT NULL,

  claim_type      TEXT        NOT NULL CHECK (claim_type IN ('cancel','return','exchange','cs')),
  claim_date      TIMESTAMPTZ,
  reason          TEXT        DEFAULT '',
  detail          TEXT        DEFAULT '',

  buyer_name      TEXT        DEFAULT '',
  buyer_phone     TEXT        DEFAULT '',
  product_name    TEXT        DEFAULT '',
  option_label    TEXT        DEFAULT '',
  qty             INTEGER     DEFAULT 1,
  price           NUMERIC(12,2) DEFAULT 0,

  return_courier  TEXT        DEFAULT '',
  return_invoice  TEXT        DEFAULT '',
  return_addr     TEXT        DEFAULT '',

  status          TEXT        DEFAULT '접수' CHECK (status IN ('접수','처리중','완료','거부')),
  response        TEXT        DEFAULT '',          -- 처리 메모
  processed_at    TIMESTAMPTZ,

  UNIQUE(mall_key, mall_claim_id)
);

CREATE INDEX IF NOT EXISTS idx_claims_order ON claims(order_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_type ON claims(claim_type);

CREATE TRIGGER trg_claims_updated_at
  BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE claims DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 13. 재고 이력 (재고 변동 추적)
--    주문/취소/입고/조정 시마다 기록
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inventory_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  master_sku_id   UUID        NOT NULL REFERENCES master_skus(id) ON DELETE CASCADE,
  change_type     TEXT        NOT NULL CHECK (change_type IN (
    'order',        -- 주문으로 인한 감소
    'cancel',       -- 취소로 인한 증가
    'return',       -- 반품으로 인한 증가
    'purchase_in',  -- 발주 입고
    'adjustment',   -- 수동 조정
    'sync'          -- 재고 동기화
  )),
  quantity_delta  INTEGER     NOT NULL,            -- 변동량 (음수=감소, 양수=증가)
  stock_before    INTEGER     NOT NULL,
  stock_after     INTEGER     NOT NULL,

  -- 연관 정보
  order_id        UUID        REFERENCES unified_orders(id),
  reference_id    TEXT,                            -- 발주번호, 조정 ID 등
  mall_key        TEXT,
  note            TEXT        DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_inventory_history_sku ON inventory_history(master_sku_id);
CREATE INDEX IF NOT EXISTS idx_inventory_history_type ON inventory_history(change_type);
CREATE INDEX IF NOT EXISTS idx_inventory_history_date ON inventory_history(created_at);

ALTER TABLE inventory_history DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 14. 재고 동기화 작업 로그
--    쇼핑몰에 재고를 업데이트할 때마다 기록
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inventory_sync_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  master_sku_id   UUID        NOT NULL REFERENCES master_skus(id) ON DELETE CASCADE,
  mall_key        TEXT        NOT NULL,
  mall_product_id TEXT,
  mall_sku_id     TEXT,

  stock_before    INTEGER,
  stock_after     INTEGER,
  triggered_by    TEXT,                            -- 'order', 'manual', 'job'
  status          TEXT        DEFAULT 'success' CHECK (status IN ('success','failed')),
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_log_sku ON inventory_sync_log(master_sku_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_mall ON inventory_sync_log(mall_key);
CREATE INDEX IF NOT EXISTS idx_sync_log_date ON inventory_sync_log(created_at);

ALTER TABLE inventory_sync_log DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 15. 가격 정책 (쇼핑몰별 가격 차등 설정)
--    예: 쿠팡은 기준가 100%, 지그재그는 기준가 110%
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pricing_rules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  name            TEXT        NOT NULL,            -- '기본 가격 정책'
  mall_key        TEXT,                            -- NULL이면 전체 적용
  master_category TEXT,                            -- NULL이면 전체 적용

  -- 가격 계산 방식
  rule_type       TEXT        DEFAULT 'percentage' CHECK (rule_type IN ('percentage','fixed','formula')),
  base_price_type TEXT        DEFAULT 'cost' CHECK (base_price_type IN ('cost','sale','custom')),
  value           NUMERIC(10,4) DEFAULT 1.0,       -- 1.0 = 100%, 1.1 = 110%, 0.9 = 90%
  fixed_amount    INTEGER     DEFAULT 0,           -- 고정 추가금액

  -- 반올림
  round_unit      INTEGER     DEFAULT 10,          -- 10원 단위 반올림
  is_active       BOOLEAN     DEFAULT true
);

ALTER TABLE pricing_rules DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 16. 상품 전송 이력 (상품이 각 쇼핑몰에 등록된 기록)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS product_transfer_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  master_product_id UUID      NOT NULL REFERENCES master_products(id) ON DELETE CASCADE,
  mall_key        TEXT        NOT NULL,
  action          TEXT        NOT NULL CHECK (action IN ('create','update','delete','stock_update','price_update')),

  mall_product_id TEXT,
  status          TEXT        DEFAULT 'success' CHECK (status IN ('success','failed','pending')),
  error_message   TEXT,
  request_payload JSONB,      -- 전송한 데이터 (디버깅용)
  response_data   JSONB       -- 쇼핑몰 응답 (디버깅용)
);

CREATE INDEX IF NOT EXISTS idx_transfer_logs_product ON product_transfer_logs(master_product_id);
CREATE INDEX IF NOT EXISTS idx_transfer_logs_mall ON product_transfer_logs(mall_key);
CREATE INDEX IF NOT EXISTS idx_transfer_logs_date ON product_transfer_logs(created_at);

ALTER TABLE product_transfer_logs DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 17. 발주/입고 (재고 보충 관리)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  order_no        TEXT        NOT NULL UNIQUE,     -- 발주번호
  supplier        TEXT        DEFAULT '',
  order_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  expected_date   DATE,                            -- 입고 예정일
  received_at     TIMESTAMPTZ,                     -- 실제 입고일
  status          TEXT        DEFAULT 'ordered' CHECK (status IN ('ordered','partial','received','cancelled')),
  total_amount    NUMERIC(12,2) DEFAULT 0,
  currency        TEXT        DEFAULT 'KRW',
  notes           TEXT        DEFAULT ''
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID      NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  master_sku_id   UUID        NOT NULL REFERENCES master_skus(id),

  ordered_qty     INTEGER     NOT NULL DEFAULT 0,
  received_qty    INTEGER     DEFAULT 0,
  unit_cost       NUMERIC(10,2) DEFAULT 0,
  total_cost      NUMERIC(12,2) DEFAULT 0
);

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 18. 재고 동기화 트리거 함수
--    주문이 배송중(shipped) 상태가 되면 관련 SKU 재고를 차감
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION auto_deduct_stock_on_order()
RETURNS TRIGGER AS $$
BEGIN
  -- 상태가 'paid' 또는 'preparing'으로 변경될 때 재고 차감 (한 번만)
  IF (NEW.status IN ('paid', 'preparing') AND (OLD.status = 'new' OR OLD.status IS NULL)) THEN
    -- order_items에서 아직 차감 안 된 항목 처리
    UPDATE master_skus ms
    SET stock = GREATEST(0, ms.stock - oi.qty)
    FROM unified_order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.master_sku_id = ms.id
      AND oi.stock_deducted = false;

    -- 차감 완료 표시
    UPDATE unified_order_items
    SET stock_deducted = true
    WHERE order_id = NEW.id AND stock_deducted = false AND master_sku_id IS NOT NULL;
  END IF;

  -- 취소/반품 시 재고 복구
  IF (NEW.status IN ('cancelled', 'returned') AND OLD.status NOT IN ('cancelled', 'returned')) THEN
    UPDATE master_skus ms
    SET stock = ms.stock + oi.qty
    FROM unified_order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.master_sku_id = ms.id
      AND oi.stock_deducted = true;

    UPDATE unified_order_items
    SET stock_deducted = false
    WHERE order_id = NEW.id AND master_sku_id IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_deduct_stock
  AFTER UPDATE ON unified_orders
  FOR EACH ROW EXECUTE FUNCTION auto_deduct_stock_on_order();

-- ══════════════════════════════════════════════════════════════════════════
-- 19. 뷰: 상품별 통합 재고 현황
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_product_stock_summary AS
SELECT
  mp.id            AS product_id,
  mp.internal_code,
  mp.name          AS product_name,
  mp.brand,
  mp.category,
  COUNT(ms.id)     AS sku_count,
  SUM(ms.stock)    AS total_stock,
  SUM(ms.reserved_stock) AS total_reserved,
  SUM(ms.stock - ms.reserved_stock) AS available_stock,
  MIN(ms.stock)    AS min_sku_stock,
  BOOL_OR(ms.stock <= ms.safety_stock) AS has_low_stock
FROM master_products mp
LEFT JOIN master_skus ms ON ms.product_id = mp.id AND ms.status = 'active'
GROUP BY mp.id, mp.internal_code, mp.name, mp.brand, mp.category;

-- ══════════════════════════════════════════════════════════════════════════
-- 20. 뷰: 오늘의 주문 현황
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_today_orders AS
SELECT
  mall_key,
  COUNT(*)                               AS total_orders,
  COUNT(*) FILTER (WHERE status = 'paid')        AS paid_count,
  COUNT(*) FILTER (WHERE status = 'preparing')   AS preparing_count,
  COUNT(*) FILTER (WHERE status = 'shipped')     AS shipped_count,
  COUNT(*) FILTER (WHERE status = 'cancel_req')  AS cancel_req_count,
  COUNT(*) FILTER (WHERE status = 'return_req')  AS return_req_count,
  SUM(total_price)                       AS total_amount
FROM unified_orders
WHERE order_date >= CURRENT_DATE
  AND order_date < CURRENT_DATE + INTERVAL '1 day'
GROUP BY mall_key;

-- ══════════════════════════════════════════════════════════════════════════
-- 인덱스 최적화
-- ══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_marketplace_products_sync ON marketplace_products(sync_status) WHERE sync_status != 'synced';
CREATE INDEX IF NOT EXISTS idx_master_skus_low_stock ON master_skus(product_id) WHERE stock <= safety_stock AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_unified_orders_new ON unified_orders(mall_key, created_at) WHERE status IN ('paid','preparing');
