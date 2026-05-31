-- ============================================================================
-- Sınav Salonu — Yasaklı Terim (BlockedTerm) Seed
-- ============================================================================
-- Amaç: İçerik moderasyonu Katman 1 (BlocklistTextProvider) için temel Türkçe
-- küfür/hakaret/argo/cinsel/nefret söylemi/şiddet kelime listesi.
--
-- Kullanım (production'da manuel, deploy sonrası 1 kez):
--   docker exec -i <pg-container> psql -U <db_user> -d <db_name> \
--     < apps/backend/scripts/seed-blocked-terms.sql
--
-- Idempotent — pg_temp.upsert_blocked_term ile (tenantId, term) çakışmasında
-- UPDATE yapar (severity/category güncellemesini kabul eder), yenisinde INSERT.
-- İstediğiniz zaman güncelleyip yeniden çalıştırabilirsiniz.
--
-- Normalize konvansiyon: terimler turkishNormalize() çıktısı formatında
-- saklanır (lowercase + diakritik strip + leetspeak çözüm):
--   "Şerefsiz"  → "serefsiz"
--   "Götveren"  → "gotveren"
--   "5iktir"    → "siktir"
--   "AmınA"     → "amina"
--
-- Severity skalası:
--   1 — Çok hafif argo (sınav içeriğinde uygun değil ama yumuşak)
--   2 — Hafif küfür/aşağılayıcı
--   3 — Standart küfür/hakaret
--   4 — Ağır küfür (cinsel içerikli, anaya/babaya hakaret, şiddet teşviki)
--   5 — En ağır (nefret söylemi, etnik/dini/yönelim slurları)
--
-- BÜTÜNLÜK NOTU: Bu liste başlangıç noktasıdır. Üretim akışında admin
-- panelinden (`BlockedTerms.jsx`) periyodik olarak güncellenmeli. Bazı
-- kelimelerin meşru bağlamı vardır (örn. "kör" tıbbi sınav sorusunda). Bu
-- nedenle BlocklistTextProvider word-boundary + bağlam pencereli match yapmalı,
-- ham `INSTR` ile değil.
-- ============================================================================

DO $$
DECLARE
  v_tenant_id TEXT;
BEGIN
  -- Default tenant'ı bul
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'default' LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Default tenant bulunamadı. Önce tenant kaydını oluşturun.';
  END IF;
  RAISE NOTICE 'Tenant bulundu: %', v_tenant_id;
END $$;

-- Helper: pg_temp'te idempotent upsert
CREATE OR REPLACE FUNCTION pg_temp.upsert_blocked_term(
  p_tenant_id TEXT,
  p_term TEXT,
  p_category TEXT,
  p_severity INTEGER,
  p_pattern TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO blocked_terms (id, "tenantId", term, pattern, category, severity, "isActive", "createdBy", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::TEXT, p_tenant_id, p_term, p_pattern, p_category::"ModerationCategory", p_severity, true, NULL, NOW(), NOW())
  ON CONFLICT ("tenantId", term) DO UPDATE
    SET category = EXCLUDED.category,
        severity = EXCLUDED.severity,
        pattern  = EXCLUDED.pattern,
        "isActive" = true,
        "updatedAt" = NOW();
END $$ LANGUAGE plpgsql;

-- =========================================================================
-- Tenant ID'yi DO block'la kapsayarak tüm INSERT'lerde kullanıyoruz
-- =========================================================================
DO $$
DECLARE
  v_tid TEXT;
BEGIN
  SELECT id INTO v_tid FROM tenants WHERE slug = 'default' LIMIT 1;

  -- ======================================================================
  -- 1) PROFANITY — Hafif (severity 1-2)
  -- Bağlamda kabul edilebilir argo ama eğitim platformunda uygun değil
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'lan',         'PROFANITY', 1, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ulan',        'PROFANITY', 1, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'oha',         'PROFANITY', 1, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'bok',         'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'boktan',      'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'bok yedi',    'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'bok ye',      'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sacmalik',    'PROFANITY', 1, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sacma sapan', 'PROFANITY', 1, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'esek',        'PROFANITY', 2, '\m(esek|essek)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'esek herif',  'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'dangalak',    'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'aval',        'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'enayi',       'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kazma',       'PROFANITY', 2, '\m(kazma|kaz kafali)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'odun kafali', 'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'salak',       'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'aptal',       'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'mal',         'PROFANITY', 2, '\m(mal|malsin|mal herif)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ahmak',       'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'dingil',      'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'dingo',       'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'budala',      'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'embesil',     'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gerzek',      'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gicik',       'PROFANITY', 1, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'hassiktir',   'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'hassikdir',   'PROFANITY', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kaltak',      'PROFANITY', 2, NULL);

  -- ======================================================================
  -- 2) PROFANITY — Orta (severity 3)
  -- Standart küfür, açıkça uygunsuz
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'got',         'PROFANITY', 3, '\m(got|goet|g[o0]t)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gotunu',      'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gotune',      'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gotlek',      'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gotveren',    'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gotunden',    'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'got deligi',  'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'yavsak',      'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'pic',         'PROFANITY', 3, '\m(pic|p[i1]c)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'pic kurusu',  'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'piclik',      'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'serefsiz',    'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'haysiyetsiz', 'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'namussuz',    'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'soysuz',      'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'iticik',      'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gerizekali',  'PROFANITY', 3, '\m(gerizekali|geri zekali)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'beyinsiz',    'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'beyni yok',   'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'aklikit',     'PROFANITY', 3, '\m(aklikit|akli kit)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kafadan sakat','PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kafadan kontak','PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kopoglu',     'PROFANITY', 3, '\m(kopoglu|kop oglu|k.poglu)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kopek',       'PROFANITY', 3, '\m(kopek herif|kopek olu)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'hayvan herif','PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'hayvan oglu', 'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'hiyar herif', 'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'puşt',        'PROFANITY', 3, '\m(pust|p[u]st)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'pust',        'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'pustluk',     'PROFANITY', 3, NULL);

  -- ======================================================================
  -- 3) PROFANITY — Ağır (severity 4)
  -- Cinsel içerikli küfür, anaya/babaya hakaret
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sik',         'PROFANITY', 4, '\m(sik|s[i1]k)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sikim',       'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'siktir',      'PROFANITY', 4, '\ms[i1!l]kt[i1!l]r\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'siktir git',  'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'siktirgit',   'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'siktirin',    'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sikeyim',     'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sikeyim seni','PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sokayim',     'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sokarim',     'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'am',          'PROFANITY', 4, '\m(am|am[ıi]na|am[ıi]n[ıi]n)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'amcik',       'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'amina',       'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'amina koyim', 'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'amina koyayim','PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'amina koydugum','PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'amina yiyim', 'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'amini',       'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'aminin',      'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'yarak',       'PROFANITY', 4, '\m(yarak|yarrak)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'yarrak',      'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'yarragi',     'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'yarrak kafali','PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'tassak',      'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'tassagi',     'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'tassagim',    'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'orospu',      'PROFANITY', 4, '\m[o0]r[o0]spu\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'orospu cocugu','PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'orospu evladi','PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'orospunun',   'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'pezevenk',    'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'pezeveng',    'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kahpe',       'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kahpenin',    'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'surtuk',      'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'fahise',      'PROFANITY', 4, NULL);

  -- Aile/akraba odaklı (severity 4-5)
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'anani',       'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'anasini',     'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ananin',      'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'anasinin',    'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'anani sikim', 'PROFANITY', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ananin ami',  'PROFANITY', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'anasinin ami','PROFANITY', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'anani sokayim','PROFANITY', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ananin orospu','PROFANITY', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'babanin ami', 'PROFANITY', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'bacini',      'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'bacinin ami', 'PROFANITY', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'bacini sikim','PROFANITY', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kiz kardesini sikim','PROFANITY', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ananin amina','PROFANITY', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'anasini siktigimin','PROFANITY', 5, NULL);

  -- ======================================================================
  -- 4) HATE_SPEECH — Dini & küfür kombinasyonu (severity 5)
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'allahini sikim','HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'dininizi sikim','HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'dinini sikim',  'HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'peygamberini sikim','HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'allahsiz',     'HATE_SPEECH', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'imansiz',      'HATE_SPEECH', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gavur',        'HATE_SPEECH', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kafir',        'HATE_SPEECH', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kafir tohumu', 'HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'yobaz',        'HATE_SPEECH', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'fanatik',      'HATE_SPEECH', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'murtet',       'HATE_SPEECH', 4, NULL);

  -- ======================================================================
  -- 5) HATE_SPEECH — Etnik slurlar (severity 4-5)
  -- DİKKAT: Bu kategorideki kelimelerin meşru kullanımı vardır (etnik
  -- grubun adı tarihi sınav sorusunda geçebilir). Pattern field word-boundary
  -- + aşağılayıcı bağlam kombinasyonuyla match yapılmalı; ham match yanlış
  -- pozitif üretir. BlocklistTextProvider bağlam penceresi (önündeki/
  -- arkasındaki 3-5 kelime) eklesin.
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'zenci',        'HATE_SPEECH', 4, '\mzenci\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ermeni dolu',  'HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ermeni tohumu','HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'rum tohumu',   'HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'yahudi pisligi','HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kurt itleri',  'HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kurt itler',   'HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'arap pisligi', 'HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'cingene pisligi','HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'suriyeli pisligi','HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'multeci dolu', 'HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'pis arap',     'HATE_SPEECH', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'pis kurt',     'HATE_SPEECH', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'pis ermeni',   'HATE_SPEECH', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'turk dusmani', 'HATE_SPEECH', 3, NULL);

  -- ======================================================================
  -- 6) HATE_SPEECH — Cinsel yönelim slurları (severity 4-5)
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ibne',         'HATE_SPEECH', 4, '\m([i1]bne|ibnelik)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ibnelik',      'HATE_SPEECH', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'top',          'HATE_SPEECH', 4, '\mtop herif\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'top herif',    'HATE_SPEECH', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'escinsel pisligi','HATE_SPEECH', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sapik',        'HATE_SPEECH', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'lez',          'HATE_SPEECH', 4, '\mlez herif\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'travesti pisligi','HATE_SPEECH', 5, NULL);

  -- ======================================================================
  -- 7) HATE_SPEECH — Engellilere yönelik aşağılama (severity 3-4)
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'mongol',       'HATE_SPEECH', 4, '\mmongol herif\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'mongol gibi',  'HATE_SPEECH', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ozurlu herif', 'HATE_SPEECH', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sakat herif',  'HATE_SPEECH', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'down sendromlu','HATE_SPEECH', 4, '\mdown sendromlu (gibi|herif)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'yarim akilli', 'HATE_SPEECH', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kor herif',    'HATE_SPEECH', 3, '\mkor herif\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sagir herif',  'HATE_SPEECH', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'topal herif',  'HATE_SPEECH', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'embesil gibi', 'HATE_SPEECH', 3, NULL);

  -- ======================================================================
  -- 8) HARASSMENT — Kişisel aşağılama (severity 2-3)
  -- Beden, görünüm, ruh sağlığı odaklı
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'cirkin herif', 'HARASSMENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'cirkin karı',  'HARASSMENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sisko',        'HARASSMENT', 2, '\msisko (herif|kari)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sisman cusse', 'HARASSMENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kambur',       'HARASSMENT', 2, '\mkambur herif\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'cuce herif',   'HARASSMENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'fil gibi',     'HARASSMENT', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'psikopat',     'HARASSMENT', 2, '\mpsikopat herif\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kacik',        'HARASSMENT', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'deli herif',   'HARASSMENT', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'timarhanelik', 'HARASSMENT', 2, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'pislik herif', 'HARASSMENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'cakal herif',  'HARASSMENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sahtekar',     'HARASSMENT', 2, '\msahtekar (herif|kari)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'dolandirici',  'HARASSMENT', 2, '\mdolandirici (herif|kari)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'yalakanin yalagi','HARASSMENT', 2, NULL);

  -- ======================================================================
  -- 9) SEXUAL_CONTENT — Müstehcen içerik (severity 3-4)
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'porno',        'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'porn',         'SEXUAL_CONTENT', 4, '\m(porn|p[o0]rn[o0])\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'porn film',    'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sex film',     'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'turk sex',     'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sikis',        'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sikisme',      'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'grup seks',    'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'anal seks',    'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'oral seks',    'SEXUAL_CONTENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sakso',        'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sakso cekmek', 'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'parmaklama',   'SEXUAL_CONTENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gotten verme', 'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'memes',        'SEXUAL_CONTENT', 3, '\m(memes ucu|meme ucu)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'meme uclari',  'SEXUAL_CONTENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ciplak resim', 'SEXUAL_CONTENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ciplak kadin', 'SEXUAL_CONTENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ciplak erkek', 'SEXUAL_CONTENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'erotik',       'SEXUAL_CONTENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'fetis',        'SEXUAL_CONTENT', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gay porn',     'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'xnxx',         'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'xhamster',     'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'pornhub',      'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'redtube',      'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'youporn',      'SEXUAL_CONTENT', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'onlyfans',     'SEXUAL_CONTENT', 3, NULL);

  -- ======================================================================
  -- 10) VIOLENCE — Tehdit ve şiddet teşviki (severity 3-4)
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'oldururum',    'VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'olduruyim',    'VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gebertirim',   'VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'geberteyim',   'VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'gebermek',     'VIOLENCE', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'parcalarim',   'VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'parcaliyacagim','VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'vururum',      'VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'patlatirim',   'VIOLENCE', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kafani kiracagim','VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kemiklerini kirarim','VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'bicaklarim',   'VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'bicaklayacagim','VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'bogacagim',    'VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'doverim',      'VIOLENCE', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kicina sokarim','VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'yok ederim',   'VIOLENCE', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ortadan kaldiririm','VIOLENCE', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kafana sikarim','VIOLENCE', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'ezecegim seni','VIOLENCE', 3, NULL);

  -- ======================================================================
  -- 11) SELF_HARM — İntihar ve öz zarar teşviki (severity 4-5)
  -- DİKKAT: Tek kelime match yetmez — bağlamsal değerlendirme şart.
  -- BlocklistTextProvider eğitim sorusunda "intihar" bilimsel anlatımı varsa
  -- skip etmeli; teşvik bağlamı (sen yap, neden yapmıyorsun gibi) yakalamalı.
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kendini oldur','SELF_HARM', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'intihar et',   'SELF_HARM', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'intihar etsen','SELF_HARM', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kendini as',   'SELF_HARM', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kendini parcala','SELF_HARM', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'olsen iyi olur','SELF_HARM', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'olseydin',     'SELF_HARM', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'olmen lazim',  'SELF_HARM', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'biri seni gebertsin','SELF_HARM', 4, NULL);

  -- ======================================================================
  -- 12) ILLEGAL — Yasadışı faaliyet teşviki (severity 4-5)
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'esrar sat',    'ILLEGAL', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'eroin sat',    'ILLEGAL', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kokain sat',   'ILLEGAL', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'silah satilik','ILLEGAL', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sahte diploma','ILLEGAL', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sahte kimlik', 'ILLEGAL', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'sınav sızdir', 'ILLEGAL', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'soru sızdir',  'ILLEGAL', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'cevap satin',  'ILLEGAL', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'kopya cek',    'ILLEGAL', 3, '\mkopya cek\M');

  -- ======================================================================
  -- 13) PROFANITY — Yabancı dil (sınav türleri YDT/YDS/YÖKDİL için)
  -- ======================================================================
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'fuck',         'PROFANITY', 4, '\mfuck\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'fuck you',     'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'fucking',      'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'motherfucker', 'PROFANITY', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'shit',         'PROFANITY', 3, '\m(shit|sh1t)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'bullshit',     'PROFANITY', 3, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'bitch',        'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'cunt',         'PROFANITY', 5, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'asshole',      'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'dick',         'PROFANITY', 4, '\mdick (head|head)\M');
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'dickhead',     'PROFANITY', 4, NULL);
  PERFORM pg_temp.upsert_blocked_term(v_tid, 'piss off',     'PROFANITY', 3, NULL);

END $$;

-- ======================================================================
-- ÖZET RAPOR
-- ======================================================================

DO $$
DECLARE
  v_total INTEGER;
  v_p1 INTEGER; v_p2 INTEGER; v_p3 INTEGER; v_p4 INTEGER; v_p5 INTEGER;
  v_profanity INTEGER; v_hate INTEGER; v_sexual INTEGER;
  v_harassment INTEGER; v_violence INTEGER; v_self_harm INTEGER; v_illegal INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM blocked_terms;
  SELECT COUNT(*) INTO v_p1 FROM blocked_terms WHERE severity = 1;
  SELECT COUNT(*) INTO v_p2 FROM blocked_terms WHERE severity = 2;
  SELECT COUNT(*) INTO v_p3 FROM blocked_terms WHERE severity = 3;
  SELECT COUNT(*) INTO v_p4 FROM blocked_terms WHERE severity = 4;
  SELECT COUNT(*) INTO v_p5 FROM blocked_terms WHERE severity = 5;
  SELECT COUNT(*) INTO v_profanity FROM blocked_terms WHERE category = 'PROFANITY';
  SELECT COUNT(*) INTO v_hate FROM blocked_terms WHERE category = 'HATE_SPEECH';
  SELECT COUNT(*) INTO v_sexual FROM blocked_terms WHERE category = 'SEXUAL_CONTENT';
  SELECT COUNT(*) INTO v_harassment FROM blocked_terms WHERE category = 'HARASSMENT';
  SELECT COUNT(*) INTO v_violence FROM blocked_terms WHERE category = 'VIOLENCE';
  SELECT COUNT(*) INTO v_self_harm FROM blocked_terms WHERE category = 'SELF_HARM';
  SELECT COUNT(*) INTO v_illegal FROM blocked_terms WHERE category = 'ILLEGAL';

  RAISE NOTICE '====================================================';
  RAISE NOTICE 'BlockedTerm seed tamamlandı';
  RAISE NOTICE 'Toplam satır     : %', v_total;
  RAISE NOTICE '----------------------------------------------------';
  RAISE NOTICE 'Severity 1 (çok hafif): %', v_p1;
  RAISE NOTICE 'Severity 2 (hafif)     : %', v_p2;
  RAISE NOTICE 'Severity 3 (orta)      : %', v_p3;
  RAISE NOTICE 'Severity 4 (ağır)      : %', v_p4;
  RAISE NOTICE 'Severity 5 (en ağır)   : %', v_p5;
  RAISE NOTICE '----------------------------------------------------';
  RAISE NOTICE 'PROFANITY        : %', v_profanity;
  RAISE NOTICE 'HATE_SPEECH      : %', v_hate;
  RAISE NOTICE 'SEXUAL_CONTENT   : %', v_sexual;
  RAISE NOTICE 'HARASSMENT       : %', v_harassment;
  RAISE NOTICE 'VIOLENCE         : %', v_violence;
  RAISE NOTICE 'SELF_HARM        : %', v_self_harm;
  RAISE NOTICE 'ILLEGAL          : %', v_illegal;
  RAISE NOTICE '====================================================';
END $$;
