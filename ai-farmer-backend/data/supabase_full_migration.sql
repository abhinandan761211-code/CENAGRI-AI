-- =============================================================
-- AI Farmer Market – Full Supabase Migration
-- Run this script in: Supabase Dashboard → SQL Editor → New Query
-- =============================================================

-- ─────────────────────────────────────────────
-- 1. USERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    phone       TEXT,
    password    TEXT NOT NULL,
    user_type   TEXT NOT NULL DEFAULT 'farmer',  -- farmer | seller | buyer | transporter | store | admin
    business_name  TEXT,
    location       TEXT,
    gst_number     TEXT,
    vehicle_type   TEXT,
    license_number TEXT,
    store_type     TEXT,
    farm_size      FLOAT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);
CREATE INDEX IF NOT EXISTS users_user_type_idx ON public.users(user_type);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- 2. DASHBOARD STATE (JSONB key-value store)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dashboard_state (
    scope      TEXT PRIMARY KEY,
    payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS dashboard_state_updated_at ON public.dashboard_state;
CREATE TRIGGER dashboard_state_updated_at
    BEFORE UPDATE ON public.dashboard_state
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- 3. PRODUCTS (Marketplace listings)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
    id          BIGSERIAL PRIMARY KEY,
    seller_id   BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'General',
    price       FLOAT NOT NULL DEFAULT 0,
    unit        TEXT NOT NULL DEFAULT 'kg',
    stock       FLOAT NOT NULL DEFAULT 0,
    location    TEXT,
    description TEXT,
    image_url   TEXT,
    rating      FLOAT DEFAULT 4.0,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- 4. ORDERS (Buyer purchases)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
    id          BIGSERIAL PRIMARY KEY,
    buyer_id    BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    product_id  BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT,
    quantity    FLOAT NOT NULL DEFAULT 1,
    price       FLOAT NOT NULL DEFAULT 0,
    total       FLOAT GENERATED ALWAYS AS (quantity * price) STORED,
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | shipped | delivered | cancelled
    delivery_address TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- 5. INVENTORY (Store/Warehouse items)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory (
    id              BIGSERIAL PRIMARY KEY,
    store_owner_id  BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL DEFAULT 'General',
    stock           FLOAT NOT NULL DEFAULT 0,
    price           FLOAT NOT NULL DEFAULT 0,
    supplier        TEXT,
    sku             TEXT,
    min_stock_level FLOAT DEFAULT 10,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS inventory_updated_at ON public.inventory;
CREATE TRIGGER inventory_updated_at
    BEFORE UPDATE ON public.inventory
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- 6. BOOKINGS (Transport requests)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bookings (
    id              BIGSERIAL PRIMARY KEY,
    transporter_id  BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    farmer_id       BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    farmer_name     TEXT,
    crop            TEXT NOT NULL,
    quantity        FLOAT NOT NULL DEFAULT 0,
    unit            TEXT NOT NULL DEFAULT 'ton',
    pickup_location TEXT,
    delivery_location TEXT,
    pickup_date     DATE,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | in_transit | delivered | cancelled
    price           FLOAT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS bookings_updated_at ON public.bookings;
CREATE TRIGGER bookings_updated_at
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- 7. PRICE ALERTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.price_alerts (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES public.users(id) ON DELETE CASCADE,
    crop_name   TEXT NOT NULL,
    target_price FLOAT NOT NULL,
    condition   TEXT NOT NULL DEFAULT 'below',  -- below | above
    market      TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    triggered   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS price_alerts_updated_at ON public.price_alerts;
CREATE TRIGGER price_alerts_updated_at
    BEFORE UPDATE ON public.price_alerts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_alerts    ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (used by backend)
CREATE POLICY "service_role_all_users"           ON public.users           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_dashboard_state" ON public.dashboard_state FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_products"        ON public.products        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_orders"          ON public.orders          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_inventory"       ON public.inventory       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_bookings"        ON public.bookings        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_price_alerts"    ON public.price_alerts    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon full access (used by backend with ANON_KEY)
CREATE POLICY "anon_all_users"           ON public.users           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_dashboard_state" ON public.dashboard_state FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_products"        ON public.products        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_orders"          ON public.orders          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_inventory"       ON public.inventory       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_bookings"        ON public.bookings        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_price_alerts"    ON public.price_alerts    FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- VERIFICATION QUERY
-- ─────────────────────────────────────────────
SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users','dashboard_state','products','orders','inventory','bookings','price_alerts')
ORDER BY table_name;
