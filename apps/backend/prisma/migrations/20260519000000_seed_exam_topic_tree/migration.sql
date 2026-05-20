-- ============================================================================
-- Migration: Sınav konu ağacı seed (3 seviye: Ders > Ana Konu > Alt Konu)
-- ============================================================================
-- Idempotent — tüm INSERT'ler "create if not exists" mantığıyla korunur.
-- Mevcut ExamType ve Topic kayıtları DOKUNULMAZ; slug çakışan yeni satırlar atlanır.
--
-- Kullanıcının kendi slug'ları aşağıdaki slug'larla uyuşmuyorsa: yeni ExamType
-- kayıtları eklenir (veri kaybı yok), konu linkleri yeni eklenenlere bağlanır.
-- Eski sınavları link'lemek için aşağıdaki link bölümünde slug'ları değiştir.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HELPER FUNCTIONS (pg_temp — bağlantı bitince otomatik silinir)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.ensure_exam_type(
  p_name TEXT, p_slug TEXT, p_description TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE v_id TEXT;
BEGIN
  SELECT id INTO v_id FROM exam_types WHERE slug = p_slug;
  IF v_id IS NULL THEN
    INSERT INTO exam_types (id, name, slug, description, active, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::TEXT, p_name, p_slug, p_description, true, NOW(), NOW())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.upsert_topic(
  p_name TEXT, p_slug TEXT, p_parent_slug TEXT
) RETURNS TEXT AS $$
DECLARE v_parent_id TEXT; v_id TEXT;
BEGIN
  IF p_parent_slug IS NOT NULL THEN
    SELECT id INTO v_parent_id FROM topics WHERE slug = p_parent_slug;
    IF v_parent_id IS NULL THEN
      RAISE NOTICE 'Parent topic not found: %, child % skipped', p_parent_slug, p_slug;
      RETURN NULL;
    END IF;
  END IF;
  SELECT id INTO v_id FROM topics WHERE slug = p_slug;
  IF v_id IS NULL THEN
    INSERT INTO topics (id, name, slug, "parentId", active, "createdAt")
    VALUES (gen_random_uuid()::TEXT, p_name, p_slug, v_parent_id, true, NOW())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$ LANGUAGE plpgsql;

-- Bir kök topic'in altındaki TÜM ağacı (kendisi + descendant'lar) verilen sınav
-- türlerine bağlar. Recursive — ağaç ne kadar derinse hepsini kapsar.
CREATE OR REPLACE FUNCTION pg_temp.link_subtree_to_exams(
  p_root_slug TEXT, p_exam_slugs TEXT[]
) RETURNS INTEGER AS $$
DECLARE v_root_id TEXT; v_exam_slug TEXT; v_total INTEGER := 0; v_inserted INTEGER;
BEGIN
  SELECT id INTO v_root_id FROM topics WHERE slug = p_root_slug;
  IF v_root_id IS NULL THEN
    RAISE NOTICE 'Root topic not found: %', p_root_slug;
    RETURN 0;
  END IF;
  FOREACH v_exam_slug IN ARRAY p_exam_slugs LOOP
    WITH RECURSIVE tree AS (
      SELECT id FROM topics WHERE id = v_root_id
      UNION ALL
      SELECT c.id FROM topics c INNER JOIN tree p ON c."parentId" = p.id
    ),
    ins AS (
      INSERT INTO topic_exam_types ("topicId", "examTypeId")
      SELECT t.id, e.id FROM tree t CROSS JOIN exam_types e WHERE e.slug = v_exam_slug
      ON CONFLICT DO NOTHING RETURNING 1
    )
    SELECT COUNT(*) INTO v_inserted FROM ins;
    v_total := v_total + COALESCE(v_inserted, 0);
  END LOOP;
  RETURN v_total;
END $$ LANGUAGE plpgsql;

-- Tek bir topic node'unu (alt ağaç DEĞİL) verilen sınavlara bağlar.
CREATE OR REPLACE FUNCTION pg_temp.link_topic_to_exams(
  p_topic_slug TEXT, p_exam_slugs TEXT[]
) RETURNS INTEGER AS $$
DECLARE v_topic_id TEXT; v_exam_slug TEXT; v_inserted INTEGER := 0;
BEGIN
  SELECT id INTO v_topic_id FROM topics WHERE slug = p_topic_slug;
  IF v_topic_id IS NULL THEN RETURN 0; END IF;
  FOREACH v_exam_slug IN ARRAY p_exam_slugs LOOP
    INSERT INTO topic_exam_types ("topicId", "examTypeId")
    SELECT v_topic_id, e.id FROM exam_types e WHERE e.slug = v_exam_slug
    ON CONFLICT DO NOTHING;
    v_inserted := v_inserted + 1;
  END LOOP;
  RETURN v_inserted;
END $$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. EXAM TYPES (13 sınav)
-- ----------------------------------------------------------------------------

SELECT pg_temp.ensure_exam_type('YKS - TYT', 'yks-tyt', 'Temel Yeterlilik Testi');
SELECT pg_temp.ensure_exam_type('YKS - AYT (Sayısal)', 'yks-ayt-sayisal', 'AYT Sayısal alan');
SELECT pg_temp.ensure_exam_type('YKS - AYT (Eşit Ağırlık)', 'yks-ayt-esit-agirlik', 'AYT Eşit Ağırlık alan');
SELECT pg_temp.ensure_exam_type('YKS - AYT (Sözel)', 'yks-ayt-sozel', 'AYT Sözel alan');
SELECT pg_temp.ensure_exam_type('YKS - YDT (İngilizce)', 'yks-ydt-ingilizce', 'Yabancı Dil Testi');
SELECT pg_temp.ensure_exam_type('LGS', 'lgs', 'Liseye Geçiş Sınavı');
SELECT pg_temp.ensure_exam_type('KPSS - Genel Yetenek & Genel Kültür', 'kpss-gygk', 'KPSS lisans/önlisans GY-GK');
SELECT pg_temp.ensure_exam_type('KPSS - A Grubu (Alan Bilgisi)', 'kpss-a', 'Hukuk/İktisat/Maliye/Muhasebe/İstatistik');
SELECT pg_temp.ensure_exam_type('KPSS - Eğitim Bilimleri', 'kpss-eb', 'Öğretmen adayları için');
SELECT pg_temp.ensure_exam_type('ALES', 'ales', 'Akademik Personel ve Lisansüstü Giriş');
SELECT pg_temp.ensure_exam_type('DGS', 'dgs', 'Dikey Geçiş Sınavı');
SELECT pg_temp.ensure_exam_type('YDS', 'yds', 'Yabancı Dil Sınavı');
SELECT pg_temp.ensure_exam_type('YÖKDİL', 'yokdil', 'YÖK Dil Sınavı (akademik)');

-- ----------------------------------------------------------------------------
-- 3. DERS: MATEMATİK
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Matematik', 'matematik', NULL);

-- 3.1 Temel Kavramlar
SELECT pg_temp.upsert_topic('Temel Kavramlar', 'matematik-temel-kavramlar', 'matematik');
SELECT pg_temp.upsert_topic('Sayılar ve Sayı Kümeleri', 'matematik-temel-kavramlar-sayilar', 'matematik-temel-kavramlar');
SELECT pg_temp.upsert_topic('Bölme ve Bölünebilme', 'matematik-temel-kavramlar-bolme', 'matematik-temel-kavramlar');
SELECT pg_temp.upsert_topic('Asal Çarpanlara Ayırma', 'matematik-temel-kavramlar-asal-carpanlar', 'matematik-temel-kavramlar');
SELECT pg_temp.upsert_topic('EBOB ve EKOK', 'matematik-temel-kavramlar-ebob-ekok', 'matematik-temel-kavramlar');
SELECT pg_temp.upsert_topic('Rasyonel ve Ondalık Sayılar', 'matematik-temel-kavramlar-rasyonel', 'matematik-temel-kavramlar');
SELECT pg_temp.upsert_topic('Mutlak Değer', 'matematik-temel-kavramlar-mutlak-deger', 'matematik-temel-kavramlar');
SELECT pg_temp.upsert_topic('Üslü Sayılar', 'matematik-temel-kavramlar-uslu', 'matematik-temel-kavramlar');
SELECT pg_temp.upsert_topic('Köklü Sayılar', 'matematik-temel-kavramlar-koklu', 'matematik-temel-kavramlar');
SELECT pg_temp.upsert_topic('Sayı Basamakları', 'matematik-temel-kavramlar-basamak', 'matematik-temel-kavramlar');
SELECT pg_temp.upsert_topic('Faktöriyel', 'matematik-temel-kavramlar-faktoriyel', 'matematik-temel-kavramlar');

-- 3.2 Cebir
SELECT pg_temp.upsert_topic('Cebir', 'matematik-cebir', 'matematik');
SELECT pg_temp.upsert_topic('Çarpanlara Ayırma', 'matematik-cebir-carpanlara-ayirma', 'matematik-cebir');
SELECT pg_temp.upsert_topic('Özdeşlikler', 'matematik-cebir-ozdeslikler', 'matematik-cebir');
SELECT pg_temp.upsert_topic('Birinci Dereceden Denklemler', 'matematik-cebir-birinci-dereceden', 'matematik-cebir');
SELECT pg_temp.upsert_topic('İkinci Dereceden Denklemler', 'matematik-cebir-ikinci-dereceden', 'matematik-cebir');
SELECT pg_temp.upsert_topic('Eşitsizlikler', 'matematik-cebir-esitsizlikler', 'matematik-cebir');
SELECT pg_temp.upsert_topic('Mutlak Değerli Denklem ve Eşitsizlikler', 'matematik-cebir-mutlak-deger-denklem', 'matematik-cebir');
SELECT pg_temp.upsert_topic('Köklü Denklemler', 'matematik-cebir-koklu-denklem', 'matematik-cebir');
SELECT pg_temp.upsert_topic('Üslü Denklemler', 'matematik-cebir-uslu-denklem', 'matematik-cebir');

-- 3.3 Problemler
SELECT pg_temp.upsert_topic('Problemler', 'matematik-problemler', 'matematik');
SELECT pg_temp.upsert_topic('Sayı Problemleri', 'matematik-problemler-sayi', 'matematik-problemler');
SELECT pg_temp.upsert_topic('Kesir Problemleri', 'matematik-problemler-kesir', 'matematik-problemler');
SELECT pg_temp.upsert_topic('Yaş Problemleri', 'matematik-problemler-yas', 'matematik-problemler');
SELECT pg_temp.upsert_topic('Yüzde-Faiz-Kar-Zarar', 'matematik-problemler-yuzde-faiz', 'matematik-problemler');
SELECT pg_temp.upsert_topic('Hareket Problemleri', 'matematik-problemler-hareket', 'matematik-problemler');
SELECT pg_temp.upsert_topic('İşçi-Havuz Problemleri', 'matematik-problemler-isci-havuz', 'matematik-problemler');
SELECT pg_temp.upsert_topic('Karışım Problemleri', 'matematik-problemler-karisim', 'matematik-problemler');
SELECT pg_temp.upsert_topic('Grafik Problemleri', 'matematik-problemler-grafik', 'matematik-problemler');
SELECT pg_temp.upsert_topic('Tablo ve Veri Yorumlama', 'matematik-problemler-tablo', 'matematik-problemler');

-- 3.4 Fonksiyonlar (AYT odaklı)
SELECT pg_temp.upsert_topic('Fonksiyonlar', 'matematik-fonksiyonlar', 'matematik');
SELECT pg_temp.upsert_topic('Fonksiyon Kavramı', 'matematik-fonksiyonlar-kavram', 'matematik-fonksiyonlar');
SELECT pg_temp.upsert_topic('Bileşke ve Ters Fonksiyon', 'matematik-fonksiyonlar-bileske-ters', 'matematik-fonksiyonlar');
SELECT pg_temp.upsert_topic('Tek-Çift Fonksiyon', 'matematik-fonksiyonlar-tek-cift', 'matematik-fonksiyonlar');
SELECT pg_temp.upsert_topic('Parçalı ve Mutlak Değerli Fonksiyon', 'matematik-fonksiyonlar-parcali', 'matematik-fonksiyonlar');
SELECT pg_temp.upsert_topic('Polinomlar', 'matematik-fonksiyonlar-polinomlar', 'matematik-fonksiyonlar');
SELECT pg_temp.upsert_topic('Trigonometri', 'matematik-fonksiyonlar-trigonometri', 'matematik-fonksiyonlar');
SELECT pg_temp.upsert_topic('Logaritma', 'matematik-fonksiyonlar-logaritma', 'matematik-fonksiyonlar');

-- 3.5 İleri Analiz (sadece AYT)
SELECT pg_temp.upsert_topic('İleri Analiz', 'matematik-ileri', 'matematik');
SELECT pg_temp.upsert_topic('Diziler', 'matematik-ileri-diziler', 'matematik-ileri');
SELECT pg_temp.upsert_topic('Limit ve Süreklilik', 'matematik-ileri-limit', 'matematik-ileri');
SELECT pg_temp.upsert_topic('Türev', 'matematik-ileri-turev', 'matematik-ileri');
SELECT pg_temp.upsert_topic('Türev Uygulamaları', 'matematik-ileri-turev-uygulama', 'matematik-ileri');
SELECT pg_temp.upsert_topic('İntegral', 'matematik-ileri-integral', 'matematik-ileri');
SELECT pg_temp.upsert_topic('İntegral Uygulamaları', 'matematik-ileri-integral-uygulama', 'matematik-ileri');
SELECT pg_temp.upsert_topic('Karmaşık Sayılar', 'matematik-ileri-karmasik', 'matematik-ileri');
SELECT pg_temp.upsert_topic('Matrisler ve Determinant', 'matematik-ileri-matris', 'matematik-ileri');

-- 3.6 Geometri
SELECT pg_temp.upsert_topic('Geometri', 'matematik-geometri', 'matematik');
SELECT pg_temp.upsert_topic('Açılar', 'matematik-geometri-acilar', 'matematik-geometri');
SELECT pg_temp.upsert_topic('Üçgenler', 'matematik-geometri-ucgenler', 'matematik-geometri');
SELECT pg_temp.upsert_topic('Dik Üçgen ve Trigonometri', 'matematik-geometri-dik-ucgen', 'matematik-geometri');
SELECT pg_temp.upsert_topic('Dörtgenler', 'matematik-geometri-dortgenler', 'matematik-geometri');
SELECT pg_temp.upsert_topic('Çokgenler', 'matematik-geometri-cokgenler', 'matematik-geometri');
SELECT pg_temp.upsert_topic('Çember ve Daire', 'matematik-geometri-cember', 'matematik-geometri');
SELECT pg_temp.upsert_topic('Katı Cisimler', 'matematik-geometri-kati-cisimler', 'matematik-geometri');
SELECT pg_temp.upsert_topic('Dönüşüm Geometrisi', 'matematik-geometri-donusum', 'matematik-geometri');
SELECT pg_temp.upsert_topic('Analitik Geometri', 'matematik-geometri-analitik', 'matematik-geometri');
SELECT pg_temp.upsert_topic('Konikler (Çember-Elips-Parabol-Hiperbol)', 'matematik-geometri-konikler', 'matematik-geometri');
SELECT pg_temp.upsert_topic('Vektörler', 'matematik-geometri-vektorler', 'matematik-geometri');

-- 3.7 Olasılık ve İstatistik
SELECT pg_temp.upsert_topic('Olasılık ve İstatistik', 'matematik-olasilik', 'matematik');
SELECT pg_temp.upsert_topic('Sayma Yöntemleri', 'matematik-olasilik-sayma', 'matematik-olasilik');
SELECT pg_temp.upsert_topic('Permütasyon', 'matematik-olasilik-permutasyon', 'matematik-olasilik');
SELECT pg_temp.upsert_topic('Kombinasyon', 'matematik-olasilik-kombinasyon', 'matematik-olasilik');
SELECT pg_temp.upsert_topic('Binom ve Olasılık', 'matematik-olasilik-binom', 'matematik-olasilik');
SELECT pg_temp.upsert_topic('Veri ve İstatistik', 'matematik-olasilik-istatistik', 'matematik-olasilik');

-- 3.8 Mantık (AYT)
SELECT pg_temp.upsert_topic('Mantık', 'matematik-mantik', 'matematik');
SELECT pg_temp.upsert_topic('Önermeler', 'matematik-mantik-onermeler', 'matematik-mantik');
SELECT pg_temp.upsert_topic('Kümeler', 'matematik-mantik-kumeler', 'matematik-mantik');
SELECT pg_temp.upsert_topic('Modüler Aritmetik', 'matematik-mantik-moduler', 'matematik-mantik');

-- MATEMATİK LİNK'LERİ
-- Ortak gövde (Temel Kavramlar, Cebir basit, Problemler, Geometri temel) — tüm matematik içerikli sınavlar
SELECT pg_temp.link_subtree_to_exams('matematik-temel-kavramlar',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','kpss-gygk','ales','dgs','lgs']);
SELECT pg_temp.link_subtree_to_exams('matematik-cebir',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','kpss-gygk','ales','dgs','lgs']);
SELECT pg_temp.link_subtree_to_exams('matematik-problemler',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','kpss-gygk','ales','dgs','lgs']);
SELECT pg_temp.link_subtree_to_exams('matematik-olasilik',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','kpss-gygk','ales','dgs']);
SELECT pg_temp.link_subtree_to_exams('matematik-mantik',
  ARRAY['yks-ayt-sayisal','yks-ayt-esit-agirlik','ales']);

-- Fonksiyonlar: AYT ana + ALES ileri
SELECT pg_temp.link_subtree_to_exams('matematik-fonksiyonlar',
  ARRAY['yks-ayt-sayisal','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_topic_to_exams('matematik-fonksiyonlar-kavram', ARRAY['yks-tyt','ales','dgs']);
SELECT pg_temp.link_topic_to_exams('matematik-fonksiyonlar-polinomlar', ARRAY['yks-tyt','ales','dgs']);

-- İleri Analiz: yalnız AYT-Sayısal (EA'da yok)
SELECT pg_temp.link_subtree_to_exams('matematik-ileri', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('matematik-ileri-karmasik', ARRAY['yks-ayt-esit-agirlik']);

-- Geometri: temel (Açı, Üçgen, Dörtgen, Çember, Katı, Çokgen) → tüm geometri içeren sınavlar
SELECT pg_temp.link_topic_to_exams('matematik-geometri',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','kpss-gygk','ales','dgs','lgs']);
SELECT pg_temp.link_subtree_to_exams('matematik-geometri-acilar',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','kpss-gygk','ales','dgs','lgs']);
SELECT pg_temp.link_subtree_to_exams('matematik-geometri-ucgenler',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','kpss-gygk','ales','dgs','lgs']);
SELECT pg_temp.link_subtree_to_exams('matematik-geometri-dik-ucgen',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','kpss-gygk','ales','dgs','lgs']);
SELECT pg_temp.link_subtree_to_exams('matematik-geometri-dortgenler',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','kpss-gygk','ales','dgs','lgs']);
SELECT pg_temp.link_subtree_to_exams('matematik-geometri-cokgenler',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','kpss-gygk','ales','dgs']);
SELECT pg_temp.link_subtree_to_exams('matematik-geometri-cember',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','kpss-gygk','ales','dgs','lgs']);
SELECT pg_temp.link_subtree_to_exams('matematik-geometri-kati-cisimler',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','ales','dgs','lgs']);
SELECT pg_temp.link_subtree_to_exams('matematik-geometri-donusum',
  ARRAY['yks-ayt-sayisal','yks-ayt-esit-agirlik','lgs']);
-- Analitik/Konikler/Vektörler: AYT
SELECT pg_temp.link_subtree_to_exams('matematik-geometri-analitik',
  ARRAY['yks-ayt-sayisal','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_subtree_to_exams('matematik-geometri-konikler',
  ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_subtree_to_exams('matematik-geometri-vektorler',
  ARRAY['yks-ayt-sayisal']);

-- Matematik ana node: tüm matematik içerikli sınavlar
SELECT pg_temp.link_topic_to_exams('matematik',
  ARRAY['yks-tyt','yks-ayt-sayisal','yks-ayt-esit-agirlik','kpss-gygk','ales','dgs','lgs']);

-- ----------------------------------------------------------------------------
-- 4. DERS: TÜRKÇE / TÜRK DİLİ VE EDEBİYATI
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Türkçe', 'turkce', NULL);

-- 4.1 Sözcükte Anlam
SELECT pg_temp.upsert_topic('Sözcükte Anlam', 'turkce-sozcukte-anlam', 'turkce');
SELECT pg_temp.upsert_topic('Sözcüğün Anlam Özellikleri', 'turkce-sozcukte-anlam-ozellik', 'turkce-sozcukte-anlam');
SELECT pg_temp.upsert_topic('Gerçek-Mecaz-Terim Anlam', 'turkce-sozcukte-anlam-gercek-mecaz', 'turkce-sozcukte-anlam');
SELECT pg_temp.upsert_topic('Deyim ve Atasözleri', 'turkce-sozcukte-anlam-deyim', 'turkce-sozcukte-anlam');
SELECT pg_temp.upsert_topic('Söz Sanatları', 'turkce-sozcukte-anlam-soz-sanatlari', 'turkce-sozcukte-anlam');
SELECT pg_temp.upsert_topic('Sözcükler Arası Anlam İlişkileri', 'turkce-sozcukte-anlam-iliskiler', 'turkce-sozcukte-anlam');

-- 4.2 Cümlede Anlam
SELECT pg_temp.upsert_topic('Cümlede Anlam', 'turkce-cumlede-anlam', 'turkce');
SELECT pg_temp.upsert_topic('Cümle Yorumlama', 'turkce-cumlede-anlam-yorumlama', 'turkce-cumlede-anlam');
SELECT pg_temp.upsert_topic('Cümle Tamamlama', 'turkce-cumlede-anlam-tamamlama', 'turkce-cumlede-anlam');
SELECT pg_temp.upsert_topic('Cümleler Arası Anlam İlişkileri', 'turkce-cumlede-anlam-iliski', 'turkce-cumlede-anlam');
SELECT pg_temp.upsert_topic('Anlatım Bozuklukları', 'turkce-cumlede-anlam-bozukluk', 'turkce-cumlede-anlam');

-- 4.3 Paragraf
SELECT pg_temp.upsert_topic('Paragraf', 'turkce-paragraf', 'turkce');
SELECT pg_temp.upsert_topic('Paragrafta Anlam ve Ana Düşünce', 'turkce-paragraf-ana-dusunce', 'turkce-paragraf');
SELECT pg_temp.upsert_topic('Paragrafta Yardımcı Düşünce', 'turkce-paragraf-yardimci-dusunce', 'turkce-paragraf');
SELECT pg_temp.upsert_topic('Paragrafta Yapı', 'turkce-paragraf-yapi', 'turkce-paragraf');
SELECT pg_temp.upsert_topic('Anlatım Biçimleri ve Düşünceyi Geliştirme Yolları', 'turkce-paragraf-anlatim-bicimi', 'turkce-paragraf');
SELECT pg_temp.upsert_topic('Anlatım Türleri', 'turkce-paragraf-anlatim-turu', 'turkce-paragraf');
SELECT pg_temp.upsert_topic('Paragraf Tamamlama', 'turkce-paragraf-tamamlama', 'turkce-paragraf');

-- 4.4 Dilbilgisi
SELECT pg_temp.upsert_topic('Dilbilgisi', 'turkce-dilbilgisi', 'turkce');
SELECT pg_temp.upsert_topic('Ses Bilgisi', 'turkce-dilbilgisi-ses', 'turkce-dilbilgisi');
SELECT pg_temp.upsert_topic('Yazım Kuralları', 'turkce-dilbilgisi-yazim', 'turkce-dilbilgisi');
SELECT pg_temp.upsert_topic('Noktalama İşaretleri', 'turkce-dilbilgisi-noktalama', 'turkce-dilbilgisi');
SELECT pg_temp.upsert_topic('Sözcükte Yapı', 'turkce-dilbilgisi-yapi', 'turkce-dilbilgisi');
SELECT pg_temp.upsert_topic('Sözcük Türleri (İsim-Sıfat-Zamir-Edat-Bağlaç-Ünlem)', 'turkce-dilbilgisi-sozcuk-turleri', 'turkce-dilbilgisi');
SELECT pg_temp.upsert_topic('Fiil ve Fiil Çekimleri', 'turkce-dilbilgisi-fiil', 'turkce-dilbilgisi');
SELECT pg_temp.upsert_topic('Fiilimsi (İsim-fiil, Sıfat-fiil, Zarf-fiil)', 'turkce-dilbilgisi-fiilimsi', 'turkce-dilbilgisi');
SELECT pg_temp.upsert_topic('Fiilde Yapı (Basit-Türemiş-Birleşik)', 'turkce-dilbilgisi-fiilde-yapi', 'turkce-dilbilgisi');
SELECT pg_temp.upsert_topic('Fiilde Çatı', 'turkce-dilbilgisi-fiilde-cati', 'turkce-dilbilgisi');
SELECT pg_temp.upsert_topic('Cümlenin Öğeleri', 'turkce-dilbilgisi-cumle-ogeleri', 'turkce-dilbilgisi');
SELECT pg_temp.upsert_topic('Cümle Türleri', 'turkce-dilbilgisi-cumle-turleri', 'turkce-dilbilgisi');

-- 4.5 Edebiyat (AYT — Türk Dili ve Edebiyatı)
SELECT pg_temp.upsert_topic('Edebiyat', 'turkce-edebiyat', 'turkce');
SELECT pg_temp.upsert_topic('Edebiyat Bilgileri ve Akımları', 'turkce-edebiyat-bilgi-akimlar', 'turkce-edebiyat');
SELECT pg_temp.upsert_topic('Şiir Bilgisi', 'turkce-edebiyat-siir', 'turkce-edebiyat');
SELECT pg_temp.upsert_topic('Edebi Türler', 'turkce-edebiyat-turler', 'turkce-edebiyat');
SELECT pg_temp.upsert_topic('İslamiyet Öncesi Türk Edebiyatı', 'turkce-edebiyat-islamiyet-oncesi', 'turkce-edebiyat');
SELECT pg_temp.upsert_topic('Geçiş Dönemi (Karahanlı) Edebiyatı', 'turkce-edebiyat-gecis', 'turkce-edebiyat');
SELECT pg_temp.upsert_topic('Halk Edebiyatı', 'turkce-edebiyat-halk', 'turkce-edebiyat');
SELECT pg_temp.upsert_topic('Divan Edebiyatı', 'turkce-edebiyat-divan', 'turkce-edebiyat');
SELECT pg_temp.upsert_topic('Tanzimat Edebiyatı', 'turkce-edebiyat-tanzimat', 'turkce-edebiyat');
SELECT pg_temp.upsert_topic('Servet-i Fünun Edebiyatı', 'turkce-edebiyat-servet-i-funun', 'turkce-edebiyat');
SELECT pg_temp.upsert_topic('Fecr-i Ati Edebiyatı', 'turkce-edebiyat-fecr-i-ati', 'turkce-edebiyat');
SELECT pg_temp.upsert_topic('Milli Edebiyat', 'turkce-edebiyat-milli', 'turkce-edebiyat');
SELECT pg_temp.upsert_topic('Cumhuriyet Dönemi Edebiyatı', 'turkce-edebiyat-cumhuriyet', 'turkce-edebiyat');
SELECT pg_temp.upsert_topic('Dünya Edebiyatı', 'turkce-edebiyat-dunya', 'turkce-edebiyat');

-- TÜRKÇE LİNK'LERİ
-- Ortak Türkçe (TYT/KPSS-GY/ALES/DGS/LGS)
SELECT pg_temp.link_subtree_to_exams('turkce-sozcukte-anlam',
  ARRAY['yks-tyt','kpss-gygk','ales','dgs','lgs']);
SELECT pg_temp.link_subtree_to_exams('turkce-cumlede-anlam',
  ARRAY['yks-tyt','kpss-gygk','ales','dgs','lgs']);
SELECT pg_temp.link_subtree_to_exams('turkce-paragraf',
  ARRAY['yks-tyt','kpss-gygk','ales','dgs','lgs']);

-- Dilbilgisi: TYT/LGS (KPSS/ALES/DGS'de paragraf ağırlıklı, dilbilgisi az)
SELECT pg_temp.link_subtree_to_exams('turkce-dilbilgisi',
  ARRAY['yks-tyt','lgs']);
SELECT pg_temp.link_topic_to_exams('turkce-dilbilgisi-yazim', ARRAY['kpss-gygk']);
SELECT pg_temp.link_topic_to_exams('turkce-dilbilgisi-noktalama', ARRAY['kpss-gygk']);
SELECT pg_temp.link_topic_to_exams('turkce-cumlede-anlam-bozukluk', ARRAY['kpss-gygk','ales','dgs']);

-- Edebiyat: AYT-EA, AYT-Sözel
SELECT pg_temp.link_subtree_to_exams('turkce-edebiyat',
  ARRAY['yks-ayt-esit-agirlik','yks-ayt-sozel']);

-- Türkçe ana node
SELECT pg_temp.link_topic_to_exams('turkce',
  ARRAY['yks-tyt','yks-ayt-esit-agirlik','yks-ayt-sozel','kpss-gygk','ales','dgs','lgs']);

-- ----------------------------------------------------------------------------
-- 5. DERS: FİZİK
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Fizik', 'fizik', NULL);

SELECT pg_temp.upsert_topic('Fizik Bilimine Giriş', 'fizik-giris', 'fizik');
SELECT pg_temp.upsert_topic('Fiziksel Nicelikler ve Birimler', 'fizik-giris-nicelik-birim', 'fizik-giris');
SELECT pg_temp.upsert_topic('Vektörler', 'fizik-giris-vektorler', 'fizik-giris');

SELECT pg_temp.upsert_topic('Madde ve Özellikleri', 'fizik-madde', 'fizik');
SELECT pg_temp.upsert_topic('Kütle, Hacim, Özkütle', 'fizik-madde-ozkutle', 'fizik-madde');
SELECT pg_temp.upsert_topic('Dayanıklılık, Yapışma, Yüzey Gerilimi', 'fizik-madde-dayanim', 'fizik-madde');
SELECT pg_temp.upsert_topic('Basınç', 'fizik-madde-basinc', 'fizik-madde');
SELECT pg_temp.upsert_topic('Kaldırma Kuvveti', 'fizik-madde-kaldirma', 'fizik-madde');

SELECT pg_temp.upsert_topic('Kuvvet ve Hareket', 'fizik-kuvvet-hareket', 'fizik');
SELECT pg_temp.upsert_topic('Bir Boyutta Hareket', 'fizik-kuvvet-hareket-bir-boyut', 'fizik-kuvvet-hareket');
SELECT pg_temp.upsert_topic('İki Boyutta Hareket', 'fizik-kuvvet-hareket-iki-boyut', 'fizik-kuvvet-hareket');
SELECT pg_temp.upsert_topic('Newton Hareket Yasaları', 'fizik-kuvvet-hareket-newton', 'fizik-kuvvet-hareket');
SELECT pg_temp.upsert_topic('Sürtünme Kuvveti', 'fizik-kuvvet-hareket-surtunme', 'fizik-kuvvet-hareket');
SELECT pg_temp.upsert_topic('İş, Güç, Enerji', 'fizik-kuvvet-hareket-is-guc-enerji', 'fizik-kuvvet-hareket');
SELECT pg_temp.upsert_topic('İtme ve Momentum', 'fizik-kuvvet-hareket-momentum', 'fizik-kuvvet-hareket');
SELECT pg_temp.upsert_topic('Tork ve Denge', 'fizik-kuvvet-hareket-tork', 'fizik-kuvvet-hareket');
SELECT pg_temp.upsert_topic('Basit Makineler', 'fizik-kuvvet-hareket-basit-makine', 'fizik-kuvvet-hareket');
SELECT pg_temp.upsert_topic('Dairesel Hareket', 'fizik-kuvvet-hareket-dairesel', 'fizik-kuvvet-hareket');
SELECT pg_temp.upsert_topic('Atış Hareketleri', 'fizik-kuvvet-hareket-atis', 'fizik-kuvvet-hareket');
SELECT pg_temp.upsert_topic('Kütle Çekimi', 'fizik-kuvvet-hareket-kutle-cekim', 'fizik-kuvvet-hareket');

SELECT pg_temp.upsert_topic('Isı ve Sıcaklık', 'fizik-isi', 'fizik');
SELECT pg_temp.upsert_topic('Sıcaklık ve Isı Kavramı', 'fizik-isi-kavram', 'fizik-isi');
SELECT pg_temp.upsert_topic('Hal Değişimi ve Genleşme', 'fizik-isi-hal-degisim', 'fizik-isi');
SELECT pg_temp.upsert_topic('Isı İletimi', 'fizik-isi-iletim', 'fizik-isi');

SELECT pg_temp.upsert_topic('Elektrik ve Manyetizma', 'fizik-elektrik', 'fizik');
SELECT pg_temp.upsert_topic('Elektrostatik', 'fizik-elektrik-elektrostatik', 'fizik-elektrik');
SELECT pg_temp.upsert_topic('Elektrik Akımı ve Devreler', 'fizik-elektrik-akim', 'fizik-elektrik');
SELECT pg_temp.upsert_topic('Manyetizma', 'fizik-elektrik-manyetizma', 'fizik-elektrik');
SELECT pg_temp.upsert_topic('İndüksiyon ve Alternatif Akım', 'fizik-elektrik-induksiyon', 'fizik-elektrik');

SELECT pg_temp.upsert_topic('Dalgalar', 'fizik-dalgalar', 'fizik');
SELECT pg_temp.upsert_topic('Dalga Kavramı', 'fizik-dalgalar-kavram', 'fizik-dalgalar');
SELECT pg_temp.upsert_topic('Su Dalgaları', 'fizik-dalgalar-su', 'fizik-dalgalar');
SELECT pg_temp.upsert_topic('Ses Dalgaları', 'fizik-dalgalar-ses', 'fizik-dalgalar');
SELECT pg_temp.upsert_topic('Deprem Dalgaları', 'fizik-dalgalar-deprem', 'fizik-dalgalar');
SELECT pg_temp.upsert_topic('Elektromanyetik Dalgalar', 'fizik-dalgalar-elektromanyetik', 'fizik-dalgalar');

SELECT pg_temp.upsert_topic('Optik', 'fizik-optik', 'fizik');
SELECT pg_temp.upsert_topic('Aydınlanma ve Gölge', 'fizik-optik-aydinlanma', 'fizik-optik');
SELECT pg_temp.upsert_topic('Yansıma ve Düzlem Aynalar', 'fizik-optik-yansima', 'fizik-optik');
SELECT pg_temp.upsert_topic('Küresel Aynalar', 'fizik-optik-kuresel-ayna', 'fizik-optik');
SELECT pg_temp.upsert_topic('Kırılma', 'fizik-optik-kirilma', 'fizik-optik');
SELECT pg_temp.upsert_topic('Mercekler', 'fizik-optik-mercekler', 'fizik-optik');
SELECT pg_temp.upsert_topic('Prizmalar ve Renk', 'fizik-optik-prizma', 'fizik-optik');

SELECT pg_temp.upsert_topic('Modern Fizik', 'fizik-modern', 'fizik');
SELECT pg_temp.upsert_topic('Özel Görelilik', 'fizik-modern-gorelilik', 'fizik-modern');
SELECT pg_temp.upsert_topic('Kuantum Fiziği', 'fizik-modern-kuantum', 'fizik-modern');
SELECT pg_temp.upsert_topic('Atom Modelleri', 'fizik-modern-atom', 'fizik-modern');
SELECT pg_temp.upsert_topic('Radyoaktivite', 'fizik-modern-radyoaktivite', 'fizik-modern');

-- FİZİK LİNK'LERİ
-- TYT seviyesi (temel konular)
SELECT pg_temp.link_subtree_to_exams('fizik-giris', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_subtree_to_exams('fizik-madde', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_subtree_to_exams('fizik-isi', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_subtree_to_exams('fizik-optik', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_subtree_to_exams('fizik-dalgalar', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
-- Kuvvet-Hareket detay seviyesi: temel altları TYT+LGS, ileri altları sadece AYT
SELECT pg_temp.link_topic_to_exams('fizik-kuvvet-hareket', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_topic_to_exams('fizik-kuvvet-hareket-bir-boyut', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_topic_to_exams('fizik-kuvvet-hareket-newton', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_topic_to_exams('fizik-kuvvet-hareket-surtunme', ARRAY['yks-tyt','yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('fizik-kuvvet-hareket-is-guc-enerji', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_topic_to_exams('fizik-kuvvet-hareket-basit-makine', ARRAY['yks-tyt','lgs']);
SELECT pg_temp.link_topic_to_exams('fizik-kuvvet-hareket-iki-boyut', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('fizik-kuvvet-hareket-momentum', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('fizik-kuvvet-hareket-tork', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('fizik-kuvvet-hareket-dairesel', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('fizik-kuvvet-hareket-atis', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('fizik-kuvvet-hareket-kutle-cekim', ARRAY['yks-ayt-sayisal']);

-- Elektrik: TYT temel, AYT detay
SELECT pg_temp.link_topic_to_exams('fizik-elektrik', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_topic_to_exams('fizik-elektrik-elektrostatik', ARRAY['yks-tyt','yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('fizik-elektrik-akim', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_topic_to_exams('fizik-elektrik-manyetizma', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('fizik-elektrik-induksiyon', ARRAY['yks-ayt-sayisal']);

-- Modern Fizik: sadece AYT
SELECT pg_temp.link_subtree_to_exams('fizik-modern', ARRAY['yks-ayt-sayisal']);

-- Fizik ana node
SELECT pg_temp.link_topic_to_exams('fizik', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);

-- ----------------------------------------------------------------------------
-- 6. DERS: KİMYA
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Kimya', 'kimya', NULL);

SELECT pg_temp.upsert_topic('Kimya Bilimi', 'kimya-bilim', 'kimya');
SELECT pg_temp.upsert_topic('Kimyanın Sembolik Dili', 'kimya-bilim-sembolik-dil', 'kimya-bilim');
SELECT pg_temp.upsert_topic('Güvenlik ve Laboratuvar', 'kimya-bilim-laboratuvar', 'kimya-bilim');

SELECT pg_temp.upsert_topic('Atom ve Periyodik Sistem', 'kimya-atom', 'kimya');
SELECT pg_temp.upsert_topic('Atom Modelleri', 'kimya-atom-modeller', 'kimya-atom');
SELECT pg_temp.upsert_topic('Atomun Yapısı', 'kimya-atom-yapi', 'kimya-atom');
SELECT pg_temp.upsert_topic('Periyodik Sistem ve Özellikler', 'kimya-atom-periyodik', 'kimya-atom');

SELECT pg_temp.upsert_topic('Kimyasal Türler Arası Etkileşimler', 'kimya-baglar', 'kimya');
SELECT pg_temp.upsert_topic('Kimyasal Bağlar', 'kimya-baglar-kimyasal', 'kimya-baglar');
SELECT pg_temp.upsert_topic('Zayıf Etkileşimler', 'kimya-baglar-zayif', 'kimya-baglar');
SELECT pg_temp.upsert_topic('Fiziksel-Kimyasal Değişim', 'kimya-baglar-degisim', 'kimya-baglar');

SELECT pg_temp.upsert_topic('Maddenin Halleri', 'kimya-haller', 'kimya');
SELECT pg_temp.upsert_topic('Gazlar', 'kimya-haller-gazlar', 'kimya-haller');
SELECT pg_temp.upsert_topic('Sıvılar ve Katılar', 'kimya-haller-sivi-kati', 'kimya-haller');

SELECT pg_temp.upsert_topic('Karışımlar ve Çözeltiler', 'kimya-cozeltiler', 'kimya');
SELECT pg_temp.upsert_topic('Karışımların Sınıflandırılması', 'kimya-cozeltiler-karisim', 'kimya-cozeltiler');
SELECT pg_temp.upsert_topic('Çözünme ve Derişim', 'kimya-cozeltiler-derisim', 'kimya-cozeltiler');
SELECT pg_temp.upsert_topic('Koligatif Özellikler', 'kimya-cozeltiler-koligatif', 'kimya-cozeltiler');

SELECT pg_temp.upsert_topic('Asitler, Bazlar ve Tuzlar', 'kimya-asit-baz', 'kimya');
SELECT pg_temp.upsert_topic('Asit-Baz Tanımları', 'kimya-asit-baz-tanim', 'kimya-asit-baz');
SELECT pg_temp.upsert_topic('pH ve pOH', 'kimya-asit-baz-ph', 'kimya-asit-baz');
SELECT pg_temp.upsert_topic('Tampon Çözeltiler', 'kimya-asit-baz-tampon', 'kimya-asit-baz');
SELECT pg_temp.upsert_topic('Tuzlar', 'kimya-asit-baz-tuzlar', 'kimya-asit-baz');

SELECT pg_temp.upsert_topic('Kimyasal Hesaplamalar', 'kimya-hesaplama', 'kimya');
SELECT pg_temp.upsert_topic('Mol Kavramı', 'kimya-hesaplama-mol', 'kimya-hesaplama');
SELECT pg_temp.upsert_topic('Tepkime Denklemleri ve Stokiyometri', 'kimya-hesaplama-stokiyometri', 'kimya-hesaplama');
SELECT pg_temp.upsert_topic('Yüzde Verim ve Sınırlayıcı', 'kimya-hesaplama-verim', 'kimya-hesaplama');

SELECT pg_temp.upsert_topic('Kimyasal Tepkimeler', 'kimya-tepkime', 'kimya');
SELECT pg_temp.upsert_topic('Tepkime Türleri', 'kimya-tepkime-tur', 'kimya-tepkime');
SELECT pg_temp.upsert_topic('Tepkime Hızı', 'kimya-tepkime-hiz', 'kimya-tepkime');
SELECT pg_temp.upsert_topic('Kimyasal Denge', 'kimya-tepkime-denge', 'kimya-tepkime');
SELECT pg_temp.upsert_topic('Çözünürlük Dengesi', 'kimya-tepkime-cozunurluk', 'kimya-tepkime');
SELECT pg_temp.upsert_topic('Redoks Tepkimeleri', 'kimya-tepkime-redoks', 'kimya-tepkime');
SELECT pg_temp.upsert_topic('Elektrokimya', 'kimya-tepkime-elektrokimya', 'kimya-tepkime');
SELECT pg_temp.upsert_topic('Termokimya', 'kimya-tepkime-termokimya', 'kimya-tepkime');

SELECT pg_temp.upsert_topic('Organik Kimya', 'kimya-organik', 'kimya');
SELECT pg_temp.upsert_topic('Organik Bileşik Sınıflandırma', 'kimya-organik-siniflandirma', 'kimya-organik');
SELECT pg_temp.upsert_topic('Hidrokarbonlar', 'kimya-organik-hidrokarbon', 'kimya-organik');
SELECT pg_temp.upsert_topic('Fonksiyonel Gruplar', 'kimya-organik-fonksiyonel-grup', 'kimya-organik');
SELECT pg_temp.upsert_topic('Polimerler', 'kimya-organik-polimer', 'kimya-organik');
SELECT pg_temp.upsert_topic('Karbonhidrat-Yağ-Protein', 'kimya-organik-biyomolekul', 'kimya-organik');

SELECT pg_temp.upsert_topic('Hayatımızda Kimya', 'kimya-hayat', 'kimya');
SELECT pg_temp.upsert_topic('Sular ve Hayat', 'kimya-hayat-sular', 'kimya-hayat');
SELECT pg_temp.upsert_topic('Çevre Kimyası', 'kimya-hayat-cevre', 'kimya-hayat');

-- KİMYA LİNK'LERİ
-- TYT seviyesi (atom, periyodik, bağlar, asit-baz temel, karışım temel)
SELECT pg_temp.link_subtree_to_exams('kimya-bilim', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_subtree_to_exams('kimya-atom', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_subtree_to_exams('kimya-baglar', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_subtree_to_exams('kimya-haller', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_subtree_to_exams('kimya-cozeltiler', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_topic_to_exams('kimya-cozeltiler-koligatif', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-asit-baz', ARRAY['yks-tyt','yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-asit-baz-tanim', ARRAY['yks-tyt','yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-asit-baz-ph', ARRAY['yks-tyt','yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-asit-baz-tampon', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-asit-baz-tuzlar', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-hesaplama', ARRAY['yks-tyt','yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-hesaplama-mol', ARRAY['yks-tyt','yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-hesaplama-stokiyometri', ARRAY['yks-tyt','yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-hesaplama-verim', ARRAY['yks-ayt-sayisal']);

-- Tepkime: temel TYT, ileri AYT
SELECT pg_temp.link_topic_to_exams('kimya-tepkime', ARRAY['yks-tyt','yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-tepkime-tur', ARRAY['yks-tyt','yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-tepkime-hiz', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-tepkime-denge', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-tepkime-cozunurluk', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-tepkime-redoks', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-tepkime-elektrokimya', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('kimya-tepkime-termokimya', ARRAY['yks-ayt-sayisal']);

-- Organik: sadece AYT-Sayısal
SELECT pg_temp.link_subtree_to_exams('kimya-organik', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_subtree_to_exams('kimya-hayat', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);

-- Kimya ana node
SELECT pg_temp.link_topic_to_exams('kimya', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);

-- ----------------------------------------------------------------------------
-- 7. DERS: BİYOLOJİ
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Biyoloji', 'biyoloji', NULL);

SELECT pg_temp.upsert_topic('Yaşam Bilimi Biyoloji', 'biyoloji-yasam-bilimi', 'biyoloji');
SELECT pg_temp.upsert_topic('Canlıların Ortak Özellikleri', 'biyoloji-yasam-ortak', 'biyoloji-yasam-bilimi');
SELECT pg_temp.upsert_topic('Canlıların Yapısında Bulunan Bileşikler', 'biyoloji-yasam-bilesik', 'biyoloji-yasam-bilimi');

SELECT pg_temp.upsert_topic('Hücre ve Hücre Bölünmesi', 'biyoloji-hucre', 'biyoloji');
SELECT pg_temp.upsert_topic('Hücre ve Organelleri', 'biyoloji-hucre-organel', 'biyoloji-hucre');
SELECT pg_temp.upsert_topic('Madde Geçişleri', 'biyoloji-hucre-madde-gecisi', 'biyoloji-hucre');
SELECT pg_temp.upsert_topic('Mitoz ve Eşeysiz Üreme', 'biyoloji-hucre-mitoz', 'biyoloji-hucre');
SELECT pg_temp.upsert_topic('Mayoz ve Eşeyli Üreme', 'biyoloji-hucre-mayoz', 'biyoloji-hucre');

SELECT pg_temp.upsert_topic('Canlıların Sınıflandırılması', 'biyoloji-siniflandirma', 'biyoloji');
SELECT pg_temp.upsert_topic('Sınıflandırma İlkeleri', 'biyoloji-siniflandirma-ilke', 'biyoloji-siniflandirma');
SELECT pg_temp.upsert_topic('Canlı Alemleri', 'biyoloji-siniflandirma-alem', 'biyoloji-siniflandirma');

SELECT pg_temp.upsert_topic('Sistemler', 'biyoloji-sistemler', 'biyoloji');
SELECT pg_temp.upsert_topic('Sindirim Sistemi', 'biyoloji-sistemler-sindirim', 'biyoloji-sistemler');
SELECT pg_temp.upsert_topic('Dolaşım ve Bağışıklık Sistemi', 'biyoloji-sistemler-dolasim', 'biyoloji-sistemler');
SELECT pg_temp.upsert_topic('Solunum Sistemi', 'biyoloji-sistemler-solunum', 'biyoloji-sistemler');
SELECT pg_temp.upsert_topic('Boşaltım Sistemi', 'biyoloji-sistemler-bosaltim', 'biyoloji-sistemler');
SELECT pg_temp.upsert_topic('Sinir Sistemi', 'biyoloji-sistemler-sinir', 'biyoloji-sistemler');
SELECT pg_temp.upsert_topic('Endokrin Sistem', 'biyoloji-sistemler-endokrin', 'biyoloji-sistemler');
SELECT pg_temp.upsert_topic('Duyu Organları', 'biyoloji-sistemler-duyu', 'biyoloji-sistemler');
SELECT pg_temp.upsert_topic('Destek ve Hareket Sistemi', 'biyoloji-sistemler-destek', 'biyoloji-sistemler');
SELECT pg_temp.upsert_topic('Üreme Sistemi ve Gelişim', 'biyoloji-sistemler-ureme', 'biyoloji-sistemler');

SELECT pg_temp.upsert_topic('Kalıtım ve Biyoteknoloji', 'biyoloji-kalitim', 'biyoloji');
SELECT pg_temp.upsert_topic('Mendel Genetiği', 'biyoloji-kalitim-mendel', 'biyoloji-kalitim');
SELECT pg_temp.upsert_topic('Mendel Dışı Kalıtım', 'biyoloji-kalitim-mendel-disi', 'biyoloji-kalitim');
SELECT pg_temp.upsert_topic('Nükleik Asitler ve Protein Sentezi', 'biyoloji-kalitim-protein', 'biyoloji-kalitim');
SELECT pg_temp.upsert_topic('Genetik Mühendisliği ve Biyoteknoloji', 'biyoloji-kalitim-biyoteknoloji', 'biyoloji-kalitim');

SELECT pg_temp.upsert_topic('Ekosistem Ekolojisi', 'biyoloji-ekosistem', 'biyoloji');
SELECT pg_temp.upsert_topic('Ekosistem ve Madde Döngüleri', 'biyoloji-ekosistem-madde-dongu', 'biyoloji-ekosistem');
SELECT pg_temp.upsert_topic('Komünite ve Popülasyon', 'biyoloji-ekosistem-komunite', 'biyoloji-ekosistem');
SELECT pg_temp.upsert_topic('Biyoçeşitlilik ve Çevre', 'biyoloji-ekosistem-biyocesitlilik', 'biyoloji-ekosistem');

SELECT pg_temp.upsert_topic('Bitki Biyolojisi', 'biyoloji-bitki', 'biyoloji');
SELECT pg_temp.upsert_topic('Bitki Yapısı', 'biyoloji-bitki-yapi', 'biyoloji-bitki');
SELECT pg_temp.upsert_topic('Bitkide Madde Taşınması', 'biyoloji-bitki-tasinma', 'biyoloji-bitki');
SELECT pg_temp.upsert_topic('Bitkide Üreme ve Gelişme', 'biyoloji-bitki-ureme', 'biyoloji-bitki');

SELECT pg_temp.upsert_topic('Canlılarda Enerji Dönüşümleri', 'biyoloji-enerji', 'biyoloji');
SELECT pg_temp.upsert_topic('Fotosentez', 'biyoloji-enerji-fotosentez', 'biyoloji-enerji');
SELECT pg_temp.upsert_topic('Kemosentez', 'biyoloji-enerji-kemosentez', 'biyoloji-enerji');
SELECT pg_temp.upsert_topic('Hücresel Solunum', 'biyoloji-enerji-solunum', 'biyoloji-enerji');

-- BİYOLOJİ LİNK'LERİ
-- Tüm temel ağaç TYT ve LGS'de
SELECT pg_temp.link_subtree_to_exams('biyoloji-yasam-bilimi', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_subtree_to_exams('biyoloji-hucre', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
SELECT pg_temp.link_subtree_to_exams('biyoloji-siniflandirma', ARRAY['yks-tyt','yks-ayt-sayisal']);
-- Sistemler: TYT/AYT temel + LGS (bazı sistemler)
SELECT pg_temp.link_subtree_to_exams('biyoloji-sistemler', ARRAY['yks-tyt','yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('biyoloji-sistemler-sindirim', ARRAY['lgs']);
SELECT pg_temp.link_topic_to_exams('biyoloji-sistemler-dolasim', ARRAY['lgs']);
SELECT pg_temp.link_topic_to_exams('biyoloji-sistemler-solunum', ARRAY['lgs']);
SELECT pg_temp.link_topic_to_exams('biyoloji-sistemler-bosaltim', ARRAY['lgs']);
SELECT pg_temp.link_topic_to_exams('biyoloji-sistemler-sinir', ARRAY['lgs']);
SELECT pg_temp.link_topic_to_exams('biyoloji-sistemler-duyu', ARRAY['lgs']);
SELECT pg_temp.link_topic_to_exams('biyoloji-sistemler-destek', ARRAY['lgs']);
-- Kalıtım: TYT temel + AYT detay + LGS
SELECT pg_temp.link_subtree_to_exams('biyoloji-kalitim', ARRAY['yks-ayt-sayisal']);
SELECT pg_temp.link_topic_to_exams('biyoloji-kalitim-mendel', ARRAY['yks-tyt','lgs']);
SELECT pg_temp.link_topic_to_exams('biyoloji-kalitim-protein', ARRAY['yks-tyt']);
-- Ekosistem: TYT, LGS
SELECT pg_temp.link_subtree_to_exams('biyoloji-ekosistem', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);
-- Bitki: AYT-only
SELECT pg_temp.link_subtree_to_exams('biyoloji-bitki', ARRAY['yks-ayt-sayisal']);
-- Enerji dönüşümleri: TYT + AYT
SELECT pg_temp.link_subtree_to_exams('biyoloji-enerji', ARRAY['yks-tyt','yks-ayt-sayisal']);

-- Biyoloji ana node
SELECT pg_temp.link_topic_to_exams('biyoloji', ARRAY['yks-tyt','yks-ayt-sayisal','lgs']);

-- ----------------------------------------------------------------------------
-- 8. DERS: TARİH
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Tarih', 'tarih', NULL);

SELECT pg_temp.upsert_topic('Tarih Bilimi', 'tarih-bilim', 'tarih');
SELECT pg_temp.upsert_topic('Tarihin Konusu ve Yöntemi', 'tarih-bilim-yontem', 'tarih-bilim');
SELECT pg_temp.upsert_topic('Tarihe Yardımcı Bilimler', 'tarih-bilim-yardimci', 'tarih-bilim');
SELECT pg_temp.upsert_topic('Zaman ve Takvimler', 'tarih-bilim-takvim', 'tarih-bilim');

SELECT pg_temp.upsert_topic('İlk Çağ Uygarlıkları', 'tarih-ilk-cag', 'tarih');
SELECT pg_temp.upsert_topic('İnsanlığın İlk Dönemleri', 'tarih-ilk-cag-ilk-donem', 'tarih-ilk-cag');
SELECT pg_temp.upsert_topic('Mezopotamya ve Mısır Uygarlıkları', 'tarih-ilk-cag-mezopotamya-misir', 'tarih-ilk-cag');
SELECT pg_temp.upsert_topic('Anadolu Uygarlıkları', 'tarih-ilk-cag-anadolu', 'tarih-ilk-cag');
SELECT pg_temp.upsert_topic('Yunan, Roma ve Bizans', 'tarih-ilk-cag-yunan-roma', 'tarih-ilk-cag');

SELECT pg_temp.upsert_topic('İlk Türk Devletleri', 'tarih-ilk-turk', 'tarih');
SELECT pg_temp.upsert_topic('Orta Asya Türk Tarihinin İlk Devirleri', 'tarih-ilk-turk-orta-asya', 'tarih-ilk-turk');
SELECT pg_temp.upsert_topic('İlk Türk Devletleri (Hun, Göktürk, Uygur)', 'tarih-ilk-turk-devletler', 'tarih-ilk-turk');
SELECT pg_temp.upsert_topic('İlk Türk Devletlerinde Kültür ve Medeniyet', 'tarih-ilk-turk-kultur', 'tarih-ilk-turk');

SELECT pg_temp.upsert_topic('İslam Tarihi ve Uygarlığı', 'tarih-islam', 'tarih');
SELECT pg_temp.upsert_topic('İslamiyetin Doğuşu ve Hz. Muhammed Dönemi', 'tarih-islam-dogus', 'tarih-islam');
SELECT pg_temp.upsert_topic('Dört Halife Dönemi', 'tarih-islam-halife', 'tarih-islam');
SELECT pg_temp.upsert_topic('Emeviler, Abbasiler ve İslam Medeniyeti', 'tarih-islam-emevi-abbasi', 'tarih-islam');

SELECT pg_temp.upsert_topic('Türk-İslam Devletleri', 'tarih-turk-islam', 'tarih');
SELECT pg_temp.upsert_topic('Karahanlılar ve Gazneliler', 'tarih-turk-islam-karahan-gazne', 'tarih-turk-islam');
SELECT pg_temp.upsert_topic('Büyük Selçuklu Devleti', 'tarih-turk-islam-selcuklu', 'tarih-turk-islam');
SELECT pg_temp.upsert_topic('Türkiye Selçuklu Devleti ve Beylikler', 'tarih-turk-islam-turkiye-selcuklu', 'tarih-turk-islam');
SELECT pg_temp.upsert_topic('Türk-İslam Devletlerinde Kültür ve Medeniyet', 'tarih-turk-islam-kultur', 'tarih-turk-islam');

SELECT pg_temp.upsert_topic('Osmanlı Tarihi', 'tarih-osmanli', 'tarih');
SELECT pg_temp.upsert_topic('Osmanlı Devleti Kuruluş Dönemi', 'tarih-osmanli-kurulus', 'tarih-osmanli');
SELECT pg_temp.upsert_topic('Osmanlı Yükselme Dönemi', 'tarih-osmanli-yukselme', 'tarih-osmanli');
SELECT pg_temp.upsert_topic('Duraklama ve Gerileme Dönemi', 'tarih-osmanli-duraklama', 'tarih-osmanli');
SELECT pg_temp.upsert_topic('Dağılma Dönemi', 'tarih-osmanli-dagilma', 'tarih-osmanli');
SELECT pg_temp.upsert_topic('20. Yüzyıl Başlarında Osmanlı (Trablusgarp, Balkan, I. Dünya Savaşı)', 'tarih-osmanli-20-yy', 'tarih-osmanli');
SELECT pg_temp.upsert_topic('Osmanlı Kültür ve Medeniyeti', 'tarih-osmanli-kultur', 'tarih-osmanli');

SELECT pg_temp.upsert_topic('Yakın Çağ Avrupa Tarihi', 'tarih-avrupa', 'tarih');
SELECT pg_temp.upsert_topic('Coğrafi Keşifler ve Rönesans-Reform', 'tarih-avrupa-rönesans', 'tarih-avrupa');
SELECT pg_temp.upsert_topic('Sanayi Devrimi ve Fransız İhtilali', 'tarih-avrupa-sanayi-ihtilal', 'tarih-avrupa');
SELECT pg_temp.upsert_topic('İki Dünya Savaşı Arası ve Sonrası', 'tarih-avrupa-dunya-savasi', 'tarih-avrupa');

SELECT pg_temp.upsert_topic('Kurtuluş Savaşı ve Atatürkçülük', 'tarih-kurtulus', 'tarih');
SELECT pg_temp.upsert_topic('Mondros Mütarekesi ve İşgaller', 'tarih-kurtulus-mondros', 'tarih-kurtulus');
SELECT pg_temp.upsert_topic('Cemiyetler ve Kuvayı Milliye', 'tarih-kurtulus-cemiyet', 'tarih-kurtulus');
SELECT pg_temp.upsert_topic('Kongreler ve TBMM', 'tarih-kurtulus-kongre-tbmm', 'tarih-kurtulus');
SELECT pg_temp.upsert_topic('Cepheler ve Lozan', 'tarih-kurtulus-cephe-lozan', 'tarih-kurtulus');
SELECT pg_temp.upsert_topic('Atatürk İlkeleri', 'tarih-kurtulus-ilke', 'tarih-kurtulus');
SELECT pg_temp.upsert_topic('Atatürk İnkılapları', 'tarih-kurtulus-inkilap', 'tarih-kurtulus');
SELECT pg_temp.upsert_topic('Atatürk Dönemi Dış Politika', 'tarih-kurtulus-dis-politika', 'tarih-kurtulus');

SELECT pg_temp.upsert_topic('Çağdaş Türk ve Dünya Tarihi', 'tarih-cagdas', 'tarih');
SELECT pg_temp.upsert_topic('İkinci Dünya Savaşı Sonrası Türkiye', 'tarih-cagdas-turkiye', 'tarih-cagdas');
SELECT pg_temp.upsert_topic('Soğuk Savaş ve Yumuşama', 'tarih-cagdas-soguk-savas', 'tarih-cagdas');
SELECT pg_temp.upsert_topic('Küreselleşme ve Günümüz Dünyası', 'tarih-cagdas-kureselleşme', 'tarih-cagdas');

-- TARİH LİNK'LERİ
-- TYT: temel ağaç (ilk çağ → kurtuluş savaşı)
SELECT pg_temp.link_subtree_to_exams('tarih-bilim', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);
SELECT pg_temp.link_subtree_to_exams('tarih-ilk-cag', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);
SELECT pg_temp.link_subtree_to_exams('tarih-ilk-turk', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);
SELECT pg_temp.link_subtree_to_exams('tarih-islam', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);
SELECT pg_temp.link_subtree_to_exams('tarih-turk-islam', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);
SELECT pg_temp.link_subtree_to_exams('tarih-osmanli', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);
SELECT pg_temp.link_subtree_to_exams('tarih-avrupa', ARRAY['yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);
SELECT pg_temp.link_subtree_to_exams('tarih-kurtulus', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk','lgs']);
SELECT pg_temp.link_subtree_to_exams('tarih-cagdas', ARRAY['yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);

SELECT pg_temp.link_topic_to_exams('tarih', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk','lgs']);

-- ----------------------------------------------------------------------------
-- 9. DERS: COĞRAFYA
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Coğrafya', 'cografya', NULL);

SELECT pg_temp.upsert_topic('Doğal Sistemler', 'cografya-dogal', 'cografya');
SELECT pg_temp.upsert_topic('Coğrafya Bilimi ve Doğa', 'cografya-dogal-bilim', 'cografya-dogal');
SELECT pg_temp.upsert_topic('Dünya''nın Şekli ve Hareketleri', 'cografya-dogal-dunya', 'cografya-dogal');
SELECT pg_temp.upsert_topic('Harita Bilgisi', 'cografya-dogal-harita', 'cografya-dogal');
SELECT pg_temp.upsert_topic('İklim Bilgisi', 'cografya-dogal-iklim', 'cografya-dogal');
SELECT pg_temp.upsert_topic('Yer Şekilleri (İç ve Dış Kuvvetler)', 'cografya-dogal-yer-sekli', 'cografya-dogal');
SELECT pg_temp.upsert_topic('Su Kaynakları (Akarsu, Göl, Deniz)', 'cografya-dogal-su', 'cografya-dogal');
SELECT pg_temp.upsert_topic('Toprak ve Bitki Örtüsü', 'cografya-dogal-toprak-bitki', 'cografya-dogal');

SELECT pg_temp.upsert_topic('Beşeri Sistemler', 'cografya-beseri', 'cografya');
SELECT pg_temp.upsert_topic('Nüfus', 'cografya-beseri-nufus', 'cografya-beseri');
SELECT pg_temp.upsert_topic('Göç', 'cografya-beseri-goc', 'cografya-beseri');
SELECT pg_temp.upsert_topic('Yerleşme', 'cografya-beseri-yerlesme', 'cografya-beseri');

SELECT pg_temp.upsert_topic('Türkiye''nin Coğrafyası', 'cografya-turkiye', 'cografya');
SELECT pg_temp.upsert_topic('Türkiye''nin Yeri ve Konumu', 'cografya-turkiye-konum', 'cografya-turkiye');
SELECT pg_temp.upsert_topic('Türkiye''nin Yer Şekilleri', 'cografya-turkiye-yer-sekli', 'cografya-turkiye');
SELECT pg_temp.upsert_topic('Türkiye''nin İklimi', 'cografya-turkiye-iklim', 'cografya-turkiye');
SELECT pg_temp.upsert_topic('Türkiye''nin Su, Toprak, Bitki Örtüsü', 'cografya-turkiye-su-toprak', 'cografya-turkiye');
SELECT pg_temp.upsert_topic('Türkiye''nin Nüfus ve Yerleşmesi', 'cografya-turkiye-nufus', 'cografya-turkiye');
SELECT pg_temp.upsert_topic('Türkiye''nin Bölgeleri', 'cografya-turkiye-bolge', 'cografya-turkiye');

SELECT pg_temp.upsert_topic('Ekonomik Faaliyetler', 'cografya-ekonomi', 'cografya');
SELECT pg_temp.upsert_topic('Tarım, Hayvancılık, Ormancılık', 'cografya-ekonomi-tarim', 'cografya-ekonomi');
SELECT pg_temp.upsert_topic('Madenler ve Enerji Kaynakları', 'cografya-ekonomi-maden-enerji', 'cografya-ekonomi');
SELECT pg_temp.upsert_topic('Sanayi', 'cografya-ekonomi-sanayi', 'cografya-ekonomi');
SELECT pg_temp.upsert_topic('Ulaşım, Ticaret, Turizm', 'cografya-ekonomi-ulasim-turizm', 'cografya-ekonomi');

SELECT pg_temp.upsert_topic('Bölgesel ve Küresel Coğrafya', 'cografya-bolgesel', 'cografya');
SELECT pg_temp.upsert_topic('Bölgeler ve Ülkeler', 'cografya-bolgesel-ulke', 'cografya-bolgesel');
SELECT pg_temp.upsert_topic('Küresel Sorunlar ve Çözümler', 'cografya-bolgesel-sorun', 'cografya-bolgesel');
SELECT pg_temp.upsert_topic('Türkiye ve Uluslararası Kuruluşlar', 'cografya-bolgesel-kurulus', 'cografya-bolgesel');

SELECT pg_temp.upsert_topic('Çevre ve Toplum', 'cografya-cevre', 'cografya');
SELECT pg_temp.upsert_topic('Doğal Afetler', 'cografya-cevre-afet', 'cografya-cevre');
SELECT pg_temp.upsert_topic('İnsan-Çevre Etkileşimi', 'cografya-cevre-etkilesim', 'cografya-cevre');

-- COĞRAFYA LİNK'LERİ
SELECT pg_temp.link_subtree_to_exams('cografya-dogal', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);
SELECT pg_temp.link_subtree_to_exams('cografya-beseri', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);
SELECT pg_temp.link_subtree_to_exams('cografya-turkiye', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk','lgs']);
SELECT pg_temp.link_subtree_to_exams('cografya-ekonomi', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);
SELECT pg_temp.link_subtree_to_exams('cografya-bolgesel', ARRAY['yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);
SELECT pg_temp.link_subtree_to_exams('cografya-cevre', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk']);

SELECT pg_temp.link_topic_to_exams('cografya', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik','kpss-gygk','lgs']);

-- ----------------------------------------------------------------------------
-- 10. DERS: FELSEFE (mantık + psikoloji + sosyoloji dahil)
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Felsefe', 'felsefe', NULL);

SELECT pg_temp.upsert_topic('Felsefenin Konusu ve Anlamı', 'felsefe-konu', 'felsefe');
SELECT pg_temp.upsert_topic('Felsefi Düşüncenin Doğası', 'felsefe-konu-doga', 'felsefe-konu');
SELECT pg_temp.upsert_topic('Felsefenin Diğer Disiplinlerle İlişkisi', 'felsefe-konu-iliski', 'felsefe-konu');

SELECT pg_temp.upsert_topic('Bilgi Felsefesi', 'felsefe-bilgi', 'felsefe');
SELECT pg_temp.upsert_topic('Bilginin Kaynakları', 'felsefe-bilgi-kaynak', 'felsefe-bilgi');
SELECT pg_temp.upsert_topic('Bilginin Doğruluğu ve Türleri', 'felsefe-bilgi-dogruluk', 'felsefe-bilgi');

SELECT pg_temp.upsert_topic('Bilim Felsefesi', 'felsefe-bilim', 'felsefe');
SELECT pg_temp.upsert_topic('Bilim ve Bilimsel Yöntem', 'felsefe-bilim-yontem', 'felsefe-bilim');

SELECT pg_temp.upsert_topic('Varlık Felsefesi', 'felsefe-varlik', 'felsefe');
SELECT pg_temp.upsert_topic('Varlık Sorunsalı', 'felsefe-varlik-sorun', 'felsefe-varlik');

SELECT pg_temp.upsert_topic('Ahlak Felsefesi', 'felsefe-ahlak', 'felsefe');
SELECT pg_temp.upsert_topic('İyi-Kötü-Özgürlük-Sorumluluk', 'felsefe-ahlak-iyi-kotu', 'felsefe-ahlak');
SELECT pg_temp.upsert_topic('Etik Kuramlar', 'felsefe-ahlak-etik-kuram', 'felsefe-ahlak');

SELECT pg_temp.upsert_topic('Sanat Felsefesi', 'felsefe-sanat', 'felsefe');
SELECT pg_temp.upsert_topic('Sanat ve Güzellik', 'felsefe-sanat-guzellik', 'felsefe-sanat');

SELECT pg_temp.upsert_topic('Din Felsefesi', 'felsefe-din', 'felsefe');
SELECT pg_temp.upsert_topic('Tanrı Kanıtlamaları', 'felsefe-din-tanri', 'felsefe-din');

SELECT pg_temp.upsert_topic('Siyaset Felsefesi', 'felsefe-siyaset', 'felsefe');
SELECT pg_temp.upsert_topic('Devlet ve Yönetim', 'felsefe-siyaset-devlet', 'felsefe-siyaset');
SELECT pg_temp.upsert_topic('Adalet, Eşitlik, Özgürlük', 'felsefe-siyaset-adalet', 'felsefe-siyaset');

SELECT pg_temp.upsert_topic('Felsefe Tarihi', 'felsefe-tarih', 'felsefe');
SELECT pg_temp.upsert_topic('İlk Çağ Felsefesi', 'felsefe-tarih-ilk-cag', 'felsefe-tarih');
SELECT pg_temp.upsert_topic('Orta Çağ Felsefesi', 'felsefe-tarih-orta-cag', 'felsefe-tarih');
SELECT pg_temp.upsert_topic('Yeni Çağ Felsefesi', 'felsefe-tarih-yeni-cag', 'felsefe-tarih');
SELECT pg_temp.upsert_topic('20. Yüzyıl Felsefesi', 'felsefe-tarih-20-yy', 'felsefe-tarih');
SELECT pg_temp.upsert_topic('Türk-İslam Düşüncesi', 'felsefe-tarih-turk-islam', 'felsefe-tarih');

SELECT pg_temp.upsert_topic('Mantık', 'felsefe-mantik', 'felsefe');
SELECT pg_temp.upsert_topic('Klasik Mantık', 'felsefe-mantik-klasik', 'felsefe-mantik');
SELECT pg_temp.upsert_topic('Sembolik (Modern) Mantık', 'felsefe-mantik-sembolik', 'felsefe-mantik');

SELECT pg_temp.upsert_topic('Psikoloji', 'felsefe-psikoloji', 'felsefe');
SELECT pg_temp.upsert_topic('Psikolojinin Konusu ve Yaklaşımları', 'felsefe-psikoloji-konu', 'felsefe-psikoloji');
SELECT pg_temp.upsert_topic('Davranış-Öğrenme-Bellek', 'felsefe-psikoloji-davranis', 'felsefe-psikoloji');
SELECT pg_temp.upsert_topic('Kişilik ve Ruh Sağlığı', 'felsefe-psikoloji-kisilik', 'felsefe-psikoloji');

SELECT pg_temp.upsert_topic('Sosyoloji', 'felsefe-sosyoloji', 'felsefe');
SELECT pg_temp.upsert_topic('Sosyoloji ve Birey', 'felsefe-sosyoloji-birey', 'felsefe-sosyoloji');
SELECT pg_temp.upsert_topic('Toplum, Kültür, Toplumsal Yapı', 'felsefe-sosyoloji-toplum', 'felsefe-sosyoloji');
SELECT pg_temp.upsert_topic('Toplumsal Değişme ve Modernleşme', 'felsefe-sosyoloji-degisim', 'felsefe-sosyoloji');

-- FELSEFE LİNK'LERİ
SELECT pg_temp.link_subtree_to_exams('felsefe-konu', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_subtree_to_exams('felsefe-bilgi', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_subtree_to_exams('felsefe-bilim', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_subtree_to_exams('felsefe-varlik', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_subtree_to_exams('felsefe-ahlak', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_subtree_to_exams('felsefe-sanat', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_subtree_to_exams('felsefe-din', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_subtree_to_exams('felsefe-siyaset', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_subtree_to_exams('felsefe-tarih', ARRAY['yks-ayt-sozel','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_subtree_to_exams('felsefe-mantik', ARRAY['yks-ayt-sozel','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_subtree_to_exams('felsefe-psikoloji', ARRAY['yks-ayt-sozel','yks-ayt-esit-agirlik']);
SELECT pg_temp.link_subtree_to_exams('felsefe-sosyoloji', ARRAY['yks-ayt-sozel','yks-ayt-esit-agirlik']);

SELECT pg_temp.link_topic_to_exams('felsefe', ARRAY['yks-tyt','yks-ayt-sozel','yks-ayt-esit-agirlik']);

-- ----------------------------------------------------------------------------
-- 11. DERS: DİN KÜLTÜRÜ VE AHLAK BİLGİSİ
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Din Kültürü ve Ahlak Bilgisi', 'din-kulturu', NULL);

SELECT pg_temp.upsert_topic('İnanç', 'din-kulturu-inanc', 'din-kulturu');
SELECT pg_temp.upsert_topic('Allah''a İman ve Esmaü''l-Hüsna', 'din-kulturu-inanc-allah', 'din-kulturu-inanc');
SELECT pg_temp.upsert_topic('Meleklere, Kitaplara, Peygamberlere İman', 'din-kulturu-inanc-melek-kitap', 'din-kulturu-inanc');
SELECT pg_temp.upsert_topic('Ahirete İman', 'din-kulturu-inanc-ahiret', 'din-kulturu-inanc');
SELECT pg_temp.upsert_topic('Kaza ve Kader', 'din-kulturu-inanc-kader', 'din-kulturu-inanc');

SELECT pg_temp.upsert_topic('İbadet', 'din-kulturu-ibadet', 'din-kulturu');
SELECT pg_temp.upsert_topic('Namaz, Oruç, Zekat, Hac', 'din-kulturu-ibadet-temel', 'din-kulturu-ibadet');
SELECT pg_temp.upsert_topic('Diğer İbadetler (Sadaka, Kurban, Adak)', 'din-kulturu-ibadet-diger', 'din-kulturu-ibadet');

SELECT pg_temp.upsert_topic('Hz. Muhammed ve Hayatı', 'din-kulturu-muhammed', 'din-kulturu');
SELECT pg_temp.upsert_topic('Mekke ve Medine Dönemleri', 'din-kulturu-muhammed-donem', 'din-kulturu-muhammed');
SELECT pg_temp.upsert_topic('Hz. Muhammed''in Örnek Davranışları', 'din-kulturu-muhammed-ornek', 'din-kulturu-muhammed');

SELECT pg_temp.upsert_topic('Kur''an ve Yorumu', 'din-kulturu-kuran', 'din-kulturu');
SELECT pg_temp.upsert_topic('Kur''an''ın Ana Konuları', 'din-kulturu-kuran-konu', 'din-kulturu-kuran');
SELECT pg_temp.upsert_topic('Tefsir ve Meal', 'din-kulturu-kuran-tefsir', 'din-kulturu-kuran');

SELECT pg_temp.upsert_topic('Ahlak ve Değerler', 'din-kulturu-ahlak', 'din-kulturu');
SELECT pg_temp.upsert_topic('İslam Ahlakının Temel İlkeleri', 'din-kulturu-ahlak-ilke', 'din-kulturu-ahlak');
SELECT pg_temp.upsert_topic('Bireysel ve Toplumsal Değerler', 'din-kulturu-ahlak-deger', 'din-kulturu-ahlak');

SELECT pg_temp.upsert_topic('Din, Kültür, Medeniyet', 'din-kulturu-medeniyet', 'din-kulturu');
SELECT pg_temp.upsert_topic('İslam Düşüncesinde Yorumlar', 'din-kulturu-medeniyet-yorum', 'din-kulturu-medeniyet');
SELECT pg_temp.upsert_topic('İslam ve Bilim', 'din-kulturu-medeniyet-bilim', 'din-kulturu-medeniyet');

SELECT pg_temp.upsert_topic('Dünya Dinleri', 'din-kulturu-dunya-dinleri', 'din-kulturu');
SELECT pg_temp.upsert_topic('İlahi Dinler (Yahudilik, Hristiyanlık)', 'din-kulturu-dunya-ilahi', 'din-kulturu-dunya-dinleri');
SELECT pg_temp.upsert_topic('Diğer Dinler (Hinduizm, Budizm vb.)', 'din-kulturu-dunya-diger', 'din-kulturu-dunya-dinleri');

-- DİN KÜLTÜRÜ LİNK'LERİ
SELECT pg_temp.link_subtree_to_exams('din-kulturu-inanc', ARRAY['yks-tyt','lgs']);
SELECT pg_temp.link_subtree_to_exams('din-kulturu-ibadet', ARRAY['yks-tyt','lgs']);
SELECT pg_temp.link_subtree_to_exams('din-kulturu-muhammed', ARRAY['yks-tyt','lgs']);
SELECT pg_temp.link_subtree_to_exams('din-kulturu-kuran', ARRAY['yks-tyt','lgs']);
SELECT pg_temp.link_subtree_to_exams('din-kulturu-ahlak', ARRAY['yks-tyt','lgs']);
SELECT pg_temp.link_subtree_to_exams('din-kulturu-medeniyet', ARRAY['yks-tyt']);
SELECT pg_temp.link_subtree_to_exams('din-kulturu-dunya-dinleri', ARRAY['yks-tyt']);

SELECT pg_temp.link_topic_to_exams('din-kulturu', ARRAY['yks-tyt','lgs']);

-- ----------------------------------------------------------------------------
-- 12. DERS: İNGİLİZCE
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('İngilizce', 'ingilizce', NULL);

SELECT pg_temp.upsert_topic('Grammar (Dilbilgisi)', 'ingilizce-grammar', 'ingilizce');
SELECT pg_temp.upsert_topic('Tenses (Zamanlar)', 'ingilizce-grammar-tenses', 'ingilizce-grammar');
SELECT pg_temp.upsert_topic('Modals', 'ingilizce-grammar-modals', 'ingilizce-grammar');
SELECT pg_temp.upsert_topic('Passive Voice', 'ingilizce-grammar-passive', 'ingilizce-grammar');
SELECT pg_temp.upsert_topic('Reported Speech', 'ingilizce-grammar-reported', 'ingilizce-grammar');
SELECT pg_temp.upsert_topic('Conditionals (If Clauses)', 'ingilizce-grammar-conditionals', 'ingilizce-grammar');
SELECT pg_temp.upsert_topic('Relative Clauses', 'ingilizce-grammar-relative', 'ingilizce-grammar');
SELECT pg_temp.upsert_topic('Noun Clauses', 'ingilizce-grammar-noun-clauses', 'ingilizce-grammar');
SELECT pg_temp.upsert_topic('Gerunds and Infinitives', 'ingilizce-grammar-gerund-infinitive', 'ingilizce-grammar');
SELECT pg_temp.upsert_topic('Causatives', 'ingilizce-grammar-causatives', 'ingilizce-grammar');
SELECT pg_temp.upsert_topic('Adverbial Clauses and Conjunctions', 'ingilizce-grammar-adverbial', 'ingilizce-grammar');
SELECT pg_temp.upsert_topic('Articles, Pronouns, Quantifiers', 'ingilizce-grammar-article', 'ingilizce-grammar');
SELECT pg_temp.upsert_topic('Prepositions', 'ingilizce-grammar-prepositions', 'ingilizce-grammar');

SELECT pg_temp.upsert_topic('Vocabulary (Kelime Bilgisi)', 'ingilizce-vocab', 'ingilizce');
SELECT pg_temp.upsert_topic('Synonyms-Antonyms', 'ingilizce-vocab-synonym', 'ingilizce-vocab');
SELECT pg_temp.upsert_topic('Phrasal Verbs', 'ingilizce-vocab-phrasal', 'ingilizce-vocab');
SELECT pg_temp.upsert_topic('Collocations and Idioms', 'ingilizce-vocab-collocation', 'ingilizce-vocab');
SELECT pg_temp.upsert_topic('Word Formation (Prefix-Suffix)', 'ingilizce-vocab-word-formation', 'ingilizce-vocab');
SELECT pg_temp.upsert_topic('Academic Vocabulary', 'ingilizce-vocab-academic', 'ingilizce-vocab');

SELECT pg_temp.upsert_topic('Reading Comprehension', 'ingilizce-reading', 'ingilizce');
SELECT pg_temp.upsert_topic('Main Idea and Specific Detail', 'ingilizce-reading-main-idea', 'ingilizce-reading');
SELECT pg_temp.upsert_topic('Inference and Conclusion', 'ingilizce-reading-inference', 'ingilizce-reading');
SELECT pg_temp.upsert_topic('Reference and Vocabulary in Context', 'ingilizce-reading-reference', 'ingilizce-reading');

SELECT pg_temp.upsert_topic('Test Tekniği', 'ingilizce-teknik', 'ingilizce');
SELECT pg_temp.upsert_topic('Cloze Test', 'ingilizce-teknik-cloze', 'ingilizce-teknik');
SELECT pg_temp.upsert_topic('Sentence Completion', 'ingilizce-teknik-sentence-completion', 'ingilizce-teknik');
SELECT pg_temp.upsert_topic('Paragraph Completion', 'ingilizce-teknik-paragraph-completion', 'ingilizce-teknik');
SELECT pg_temp.upsert_topic('Irrelevant Sentence', 'ingilizce-teknik-irrelevant', 'ingilizce-teknik');
SELECT pg_temp.upsert_topic('Restatement', 'ingilizce-teknik-restatement', 'ingilizce-teknik');
SELECT pg_temp.upsert_topic('Translation (English-Turkish / Turkish-English)', 'ingilizce-teknik-translation', 'ingilizce-teknik');
SELECT pg_temp.upsert_topic('Dialogue Completion', 'ingilizce-teknik-dialogue', 'ingilizce-teknik');

-- İNGİLİZCE LİNK'LERİ
-- Grammar: tüm İngilizce sınavlarında (LGS basit kısım, YDS/YÖKDİL/YDT ileri)
SELECT pg_temp.link_subtree_to_exams('ingilizce-grammar',
  ARRAY['yks-tyt','yks-ydt-ingilizce','yds','yokdil','lgs']);
SELECT pg_temp.link_subtree_to_exams('ingilizce-vocab',
  ARRAY['yks-ydt-ingilizce','yds','yokdil']);
-- LGS'de basit vocab var, TYT'de minimal
SELECT pg_temp.link_topic_to_exams('ingilizce-vocab-synonym', ARRAY['yks-tyt','lgs']);

SELECT pg_temp.link_subtree_to_exams('ingilizce-reading',
  ARRAY['yks-tyt','yks-ydt-ingilizce','yds','yokdil','lgs']);
SELECT pg_temp.link_subtree_to_exams('ingilizce-teknik',
  ARRAY['yks-ydt-ingilizce','yds','yokdil']);
SELECT pg_temp.link_topic_to_exams('ingilizce-teknik-cloze', ARRAY['yks-tyt','lgs']);
SELECT pg_temp.link_topic_to_exams('ingilizce-teknik-sentence-completion', ARRAY['yks-tyt']);
SELECT pg_temp.link_topic_to_exams('ingilizce-teknik-dialogue', ARRAY['yks-tyt','lgs']);

SELECT pg_temp.link_topic_to_exams('ingilizce',
  ARRAY['yks-tyt','yks-ydt-ingilizce','yds','yokdil','lgs']);

-- ----------------------------------------------------------------------------
-- 13. DERS: VATANDAŞLIK VE ANAYASA BİLGİSİ (KPSS-GY)
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Vatandaşlık ve Anayasa Bilgisi', 'vatandaslik', NULL);

SELECT pg_temp.upsert_topic('Hukukun Temel Kavramları', 'vatandaslik-hukuk-temel', 'vatandaslik');
SELECT pg_temp.upsert_topic('Hukuk Kuralları ve Hukuk Dalları', 'vatandaslik-hukuk-temel-dal', 'vatandaslik-hukuk-temel');
SELECT pg_temp.upsert_topic('Hak ve Borçlar', 'vatandaslik-hukuk-temel-hak-borc', 'vatandaslik-hukuk-temel');

SELECT pg_temp.upsert_topic('Devlet Şekilleri ve Hükümet Sistemleri', 'vatandaslik-devlet', 'vatandaslik');
SELECT pg_temp.upsert_topic('Devlet Şekilleri', 'vatandaslik-devlet-sekil', 'vatandaslik-devlet');
SELECT pg_temp.upsert_topic('Hükümet Sistemleri (Başkanlık, Parlamenter, Yarı-Başkanlık)', 'vatandaslik-devlet-sistem', 'vatandaslik-devlet');

SELECT pg_temp.upsert_topic('Anayasa Tarihimiz', 'vatandaslik-anayasa-tarih', 'vatandaslik');
SELECT pg_temp.upsert_topic('Osmanlı Anayasal Gelişmeleri', 'vatandaslik-anayasa-tarih-osmanli', 'vatandaslik-anayasa-tarih');
SELECT pg_temp.upsert_topic('Cumhuriyet Dönemi Anayasaları (1921, 1924, 1961, 1982)', 'vatandaslik-anayasa-tarih-cumhuriyet', 'vatandaslik-anayasa-tarih');

SELECT pg_temp.upsert_topic('1982 Anayasası', 'vatandaslik-1982', 'vatandaslik');
SELECT pg_temp.upsert_topic('Anayasanın Temel İlkeleri', 'vatandaslik-1982-ilke', 'vatandaslik-1982');
SELECT pg_temp.upsert_topic('Temel Hak ve Özgürlükler', 'vatandaslik-1982-haklar', 'vatandaslik-1982');
SELECT pg_temp.upsert_topic('Yasama (TBMM)', 'vatandaslik-1982-yasama', 'vatandaslik-1982');
SELECT pg_temp.upsert_topic('Yürütme (Cumhurbaşkanı, Bakanlar)', 'vatandaslik-1982-yurutme', 'vatandaslik-1982');
SELECT pg_temp.upsert_topic('Yargı', 'vatandaslik-1982-yargi', 'vatandaslik-1982');
SELECT pg_temp.upsert_topic('Anayasa Mahkemesi ve Yüksek Yargı', 'vatandaslik-1982-yuksek-yargi', 'vatandaslik-1982');

SELECT pg_temp.upsert_topic('İdare', 'vatandaslik-idare', 'vatandaslik');
SELECT pg_temp.upsert_topic('Merkezi İdare ve Yerel Yönetimler', 'vatandaslik-idare-merkez-yerel', 'vatandaslik-idare');
SELECT pg_temp.upsert_topic('Kamu Görevlileri', 'vatandaslik-idare-kamu-gorevli', 'vatandaslik-idare');

SELECT pg_temp.upsert_topic('Uluslararası Kuruluşlar', 'vatandaslik-uluslararasi', 'vatandaslik');
SELECT pg_temp.upsert_topic('BM, NATO, AB, Konsey, AGİT', 'vatandaslik-uluslararasi-kurum', 'vatandaslik-uluslararasi');

-- VATANDAŞLIK LİNK'LERİ
SELECT pg_temp.link_subtree_to_exams('vatandaslik', ARRAY['kpss-gygk']);

-- ----------------------------------------------------------------------------
-- 14. DERS: GÜNCEL BİLGİLER (KPSS-GY)
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Güncel Bilgiler', 'guncel', NULL);
SELECT pg_temp.upsert_topic('Türkiye Güncel Olayları', 'guncel-turkiye', 'guncel');
SELECT pg_temp.upsert_topic('Siyasi ve Ekonomik Gelişmeler', 'guncel-turkiye-siyasi-ekonomik', 'guncel-turkiye');
SELECT pg_temp.upsert_topic('Anayasal ve Yasal Değişiklikler', 'guncel-turkiye-anayasal', 'guncel-turkiye');
SELECT pg_temp.upsert_topic('Spor, Kültür, Sanat', 'guncel-turkiye-spor-kultur', 'guncel-turkiye');
SELECT pg_temp.upsert_topic('Dünya Güncel Olayları', 'guncel-dunya', 'guncel');
SELECT pg_temp.upsert_topic('Uluslararası Anlaşmalar ve Kuruluşlar', 'guncel-dunya-anlasma', 'guncel-dunya');
SELECT pg_temp.upsert_topic('Dünya Liderleri ve Önemli Olaylar', 'guncel-dunya-lider-olay', 'guncel-dunya');

SELECT pg_temp.link_subtree_to_exams('guncel', ARRAY['kpss-gygk']);

-- ----------------------------------------------------------------------------
-- 15. DERS: HUKUK (KPSS A Grubu)
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Hukuk', 'hukuk', NULL);

SELECT pg_temp.upsert_topic('Hukuk Başlangıcı', 'hukuk-baslangic', 'hukuk');
SELECT pg_temp.upsert_topic('Hukukun Kaynakları ve Hukuk Sistemleri', 'hukuk-baslangic-kaynak', 'hukuk-baslangic');
SELECT pg_temp.upsert_topic('Hukukun Dalları ve Yargı Türleri', 'hukuk-baslangic-dal', 'hukuk-baslangic');
SELECT pg_temp.upsert_topic('Kişilik ve Ehliyet', 'hukuk-baslangic-kisilik', 'hukuk-baslangic');

SELECT pg_temp.upsert_topic('Anayasa Hukuku', 'hukuk-anayasa', 'hukuk');
SELECT pg_temp.upsert_topic('Anayasa Genel Kavramlar', 'hukuk-anayasa-kavram', 'hukuk-anayasa');
SELECT pg_temp.upsert_topic('Türk Anayasal Sistemi', 'hukuk-anayasa-turk-sistemi', 'hukuk-anayasa');
SELECT pg_temp.upsert_topic('Temel Hak ve Özgürlükler', 'hukuk-anayasa-haklar', 'hukuk-anayasa');
SELECT pg_temp.upsert_topic('Yasama-Yürütme-Yargı', 'hukuk-anayasa-erkler', 'hukuk-anayasa');
SELECT pg_temp.upsert_topic('Anayasa Mahkemesi ve Anayasa Yargısı', 'hukuk-anayasa-mahkeme', 'hukuk-anayasa');

SELECT pg_temp.upsert_topic('İdare Hukuku', 'hukuk-idare', 'hukuk');
SELECT pg_temp.upsert_topic('İdari Teşkilat (Merkez ve Yerel)', 'hukuk-idare-teskilat', 'hukuk-idare');
SELECT pg_temp.upsert_topic('İdari İşlemler ve Sözleşmeler', 'hukuk-idare-islem', 'hukuk-idare');
SELECT pg_temp.upsert_topic('Kamu Hizmeti ve Kamu Görevlileri', 'hukuk-idare-kamu', 'hukuk-idare');
SELECT pg_temp.upsert_topic('İdari Yargı', 'hukuk-idare-yargi', 'hukuk-idare');
SELECT pg_temp.upsert_topic('İdari Sorumluluk ve Kolluk', 'hukuk-idare-sorumluluk', 'hukuk-idare');

SELECT pg_temp.upsert_topic('Medeni Hukuk', 'hukuk-medeni', 'hukuk');
SELECT pg_temp.upsert_topic('Kişiler Hukuku', 'hukuk-medeni-kisiler', 'hukuk-medeni');
SELECT pg_temp.upsert_topic('Aile Hukuku', 'hukuk-medeni-aile', 'hukuk-medeni');
SELECT pg_temp.upsert_topic('Miras Hukuku', 'hukuk-medeni-miras', 'hukuk-medeni');
SELECT pg_temp.upsert_topic('Eşya Hukuku', 'hukuk-medeni-esya', 'hukuk-medeni');

SELECT pg_temp.upsert_topic('Borçlar Hukuku', 'hukuk-borclar', 'hukuk');
SELECT pg_temp.upsert_topic('Genel Hükümler (Sözleşme, Haksız Fiil, Sebepsiz Zenginleşme)', 'hukuk-borclar-genel', 'hukuk-borclar');
SELECT pg_temp.upsert_topic('Borcun İfası ve Sona Ermesi', 'hukuk-borclar-ifa', 'hukuk-borclar');
SELECT pg_temp.upsert_topic('Özel Borç İlişkileri (Satış, Kira, Vekalet)', 'hukuk-borclar-ozel-iliski', 'hukuk-borclar');

SELECT pg_temp.upsert_topic('Ticaret Hukuku', 'hukuk-ticaret', 'hukuk');
SELECT pg_temp.upsert_topic('Ticari İşletme', 'hukuk-ticaret-isletme', 'hukuk-ticaret');
SELECT pg_temp.upsert_topic('Ticaret Şirketleri', 'hukuk-ticaret-sirket', 'hukuk-ticaret');
SELECT pg_temp.upsert_topic('Kıymetli Evrak', 'hukuk-ticaret-kiymetli-evrak', 'hukuk-ticaret');

SELECT pg_temp.upsert_topic('Ceza Hukuku', 'hukuk-ceza', 'hukuk');
SELECT pg_temp.upsert_topic('Ceza Hukuku Genel Hükümler', 'hukuk-ceza-genel', 'hukuk-ceza');
SELECT pg_temp.upsert_topic('Suç ve Ceza Türleri', 'hukuk-ceza-suc-tur', 'hukuk-ceza');
SELECT pg_temp.upsert_topic('Ceza Muhakemesi', 'hukuk-ceza-muhakeme', 'hukuk-ceza');

SELECT pg_temp.upsert_topic('İş ve Sosyal Güvenlik Hukuku', 'hukuk-is', 'hukuk');
SELECT pg_temp.upsert_topic('İş Sözleşmesi ve Çalışma Koşulları', 'hukuk-is-sozlesme', 'hukuk-is');
SELECT pg_temp.upsert_topic('Toplu İş Hukuku', 'hukuk-is-toplu', 'hukuk-is');
SELECT pg_temp.upsert_topic('Sosyal Güvenlik Sistemi', 'hukuk-is-sosyal-guvenlik', 'hukuk-is');

-- HUKUK LİNK'LERİ
SELECT pg_temp.link_subtree_to_exams('hukuk', ARRAY['kpss-a']);

-- ----------------------------------------------------------------------------
-- 16. DERS: İKTİSAT (KPSS A)
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('İktisat', 'iktisat', NULL);

SELECT pg_temp.upsert_topic('İktisada Giriş', 'iktisat-giris', 'iktisat');
SELECT pg_temp.upsert_topic('Temel Kavramlar ve Üretim İmkanları', 'iktisat-giris-kavram', 'iktisat-giris');
SELECT pg_temp.upsert_topic('Ekonomik Sistemler', 'iktisat-giris-sistem', 'iktisat-giris');

SELECT pg_temp.upsert_topic('Mikroekonomi', 'iktisat-mikro', 'iktisat');
SELECT pg_temp.upsert_topic('Arz, Talep, Esneklik', 'iktisat-mikro-arz-talep', 'iktisat-mikro');
SELECT pg_temp.upsert_topic('Tüketici Dengesi (Fayda)', 'iktisat-mikro-tuketici', 'iktisat-mikro');
SELECT pg_temp.upsert_topic('Üretici Dengesi (Maliyet)', 'iktisat-mikro-uretici', 'iktisat-mikro');
SELECT pg_temp.upsert_topic('Piyasa Türleri (Tam Rekabet, Tekel, Oligopol)', 'iktisat-mikro-piyasa', 'iktisat-mikro');
SELECT pg_temp.upsert_topic('Faktör Piyasaları', 'iktisat-mikro-faktor', 'iktisat-mikro');

SELECT pg_temp.upsert_topic('Makroekonomi', 'iktisat-makro', 'iktisat');
SELECT pg_temp.upsert_topic('Milli Gelir Hesaplamaları', 'iktisat-makro-milli-gelir', 'iktisat-makro');
SELECT pg_temp.upsert_topic('Tüketim, Tasarruf, Yatırım', 'iktisat-makro-tuketim-yatirim', 'iktisat-makro');
SELECT pg_temp.upsert_topic('Para ve Para Politikası', 'iktisat-makro-para', 'iktisat-makro');
SELECT pg_temp.upsert_topic('Enflasyon ve İşsizlik', 'iktisat-makro-enflasyon', 'iktisat-makro');
SELECT pg_temp.upsert_topic('Maliye Politikası ve Bütçe', 'iktisat-makro-maliye-politika', 'iktisat-makro');
SELECT pg_temp.upsert_topic('İktisadi Büyüme ve Kalkınma', 'iktisat-makro-buyume', 'iktisat-makro');
SELECT pg_temp.upsert_topic('Konjonktür Teorileri', 'iktisat-makro-konjonktur', 'iktisat-makro');

SELECT pg_temp.upsert_topic('Uluslararası İktisat', 'iktisat-uluslararasi', 'iktisat');
SELECT pg_temp.upsert_topic('Dış Ticaret Teorileri', 'iktisat-uluslararasi-teori', 'iktisat-uluslararasi');
SELECT pg_temp.upsert_topic('Ödemeler Dengesi ve Döviz Kuru', 'iktisat-uluslararasi-odeme', 'iktisat-uluslararasi');

SELECT pg_temp.upsert_topic('Türkiye Ekonomisi', 'iktisat-turkiye', 'iktisat');
SELECT pg_temp.upsert_topic('Cumhuriyet Dönemi Ekonomik Politikalar', 'iktisat-turkiye-cumhuriyet', 'iktisat-turkiye');
SELECT pg_temp.upsert_topic('Türkiye''nin Güncel Ekonomik Yapısı', 'iktisat-turkiye-guncel', 'iktisat-turkiye');

SELECT pg_temp.upsert_topic('İktisadi Düşünce Tarihi', 'iktisat-dusunce', 'iktisat');
SELECT pg_temp.upsert_topic('Klasik ve Neoklasik İktisat', 'iktisat-dusunce-klasik', 'iktisat-dusunce');
SELECT pg_temp.upsert_topic('Keynesyen ve Modern Akımlar', 'iktisat-dusunce-keynes', 'iktisat-dusunce');

SELECT pg_temp.link_subtree_to_exams('iktisat', ARRAY['kpss-a']);

-- ----------------------------------------------------------------------------
-- 17. DERS: MALİYE (KPSS A)
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Maliye', 'maliye', NULL);

SELECT pg_temp.upsert_topic('Kamu Maliyesinin Temel Kavramları', 'maliye-kavram', 'maliye');
SELECT pg_temp.upsert_topic('Kamu Maliyesi ve Devlet Faaliyetleri', 'maliye-kavram-devlet', 'maliye-kavram');
SELECT pg_temp.upsert_topic('Piyasa Aksaklıkları ve Devletin Rolü', 'maliye-kavram-aksaklik', 'maliye-kavram');

SELECT pg_temp.upsert_topic('Kamu Harcamaları', 'maliye-harcama', 'maliye');
SELECT pg_temp.upsert_topic('Kamu Harcamalarının Sınıflandırması', 'maliye-harcama-siniflandirma', 'maliye-harcama');
SELECT pg_temp.upsert_topic('Kamu Harcamalarının Etkileri', 'maliye-harcama-etki', 'maliye-harcama');

SELECT pg_temp.upsert_topic('Kamu Gelirleri', 'maliye-gelir', 'maliye');
SELECT pg_temp.upsert_topic('Vergi Teorisi', 'maliye-gelir-vergi-teori', 'maliye-gelir');
SELECT pg_temp.upsert_topic('Vergi Türleri (Gelir, Kurumlar, KDV, ÖTV vb.)', 'maliye-gelir-vergi-tur', 'maliye-gelir');
SELECT pg_temp.upsert_topic('Vergi Dışı Kamu Gelirleri', 'maliye-gelir-disi', 'maliye-gelir');

SELECT pg_temp.upsert_topic('Devlet Borçları', 'maliye-borc', 'maliye');
SELECT pg_temp.upsert_topic('İç ve Dış Borçlanma', 'maliye-borc-ic-dis', 'maliye-borc');
SELECT pg_temp.upsert_topic('Borçların Yönetimi ve Etkileri', 'maliye-borc-yonetim', 'maliye-borc');

SELECT pg_temp.upsert_topic('Bütçe', 'maliye-butce', 'maliye');
SELECT pg_temp.upsert_topic('Bütçe İlkeleri ve Türleri', 'maliye-butce-ilke', 'maliye-butce');
SELECT pg_temp.upsert_topic('Bütçe Süreci (Hazırlık-Onay-Uygulama-Denetim)', 'maliye-butce-surec', 'maliye-butce');
SELECT pg_temp.upsert_topic('Performans Esaslı Bütçe', 'maliye-butce-performans', 'maliye-butce');

SELECT pg_temp.upsert_topic('Maliye Politikası', 'maliye-politika', 'maliye');
SELECT pg_temp.upsert_topic('Konjonktürel Maliye Politikası', 'maliye-politika-konjonkturel', 'maliye-politika');
SELECT pg_temp.upsert_topic('Kalkınma ve İstikrar Politikaları', 'maliye-politika-kalkinma', 'maliye-politika');

SELECT pg_temp.upsert_topic('Vergi Hukuku', 'maliye-vergi-hukuk', 'maliye');
SELECT pg_temp.upsert_topic('Vergi Usul ve İlkeleri', 'maliye-vergi-hukuk-usul', 'maliye-vergi-hukuk');
SELECT pg_temp.upsert_topic('Vergi Uyuşmazlıkları ve Yargı', 'maliye-vergi-hukuk-uyusmazlik', 'maliye-vergi-hukuk');

SELECT pg_temp.link_subtree_to_exams('maliye', ARRAY['kpss-a']);

-- ----------------------------------------------------------------------------
-- 18. DERS: MUHASEBE (KPSS A)
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Muhasebe', 'muhasebe', NULL);

SELECT pg_temp.upsert_topic('Muhasebe Temel Kavramlar', 'muhasebe-temel', 'muhasebe');
SELECT pg_temp.upsert_topic('Muhasebenin Tanımı ve İlkeleri', 'muhasebe-temel-tanim', 'muhasebe-temel');
SELECT pg_temp.upsert_topic('Tek Düzen Hesap Planı', 'muhasebe-temel-hesap-plani', 'muhasebe-temel');
SELECT pg_temp.upsert_topic('Hesap Kavramı ve Hesap İşleyiş Kuralları', 'muhasebe-temel-hesap', 'muhasebe-temel');

SELECT pg_temp.upsert_topic('Defterler ve Belgeler', 'muhasebe-defter', 'muhasebe');
SELECT pg_temp.upsert_topic('Yevmiye, Defteri Kebir, Mizan', 'muhasebe-defter-yevmiye', 'muhasebe-defter');
SELECT pg_temp.upsert_topic('Yardımcı Defterler ve Belgeler', 'muhasebe-defter-yardimci', 'muhasebe-defter');

SELECT pg_temp.upsert_topic('Dönen Varlıklar', 'muhasebe-donen', 'muhasebe');
SELECT pg_temp.upsert_topic('Kasa, Banka, Çek, Senet', 'muhasebe-donen-kasa-banka', 'muhasebe-donen');
SELECT pg_temp.upsert_topic('Alacaklar ve Stoklar', 'muhasebe-donen-alacak-stok', 'muhasebe-donen');
SELECT pg_temp.upsert_topic('Stok Değerleme Yöntemleri', 'muhasebe-donen-stok-degerleme', 'muhasebe-donen');

SELECT pg_temp.upsert_topic('Duran Varlıklar', 'muhasebe-duran', 'muhasebe');
SELECT pg_temp.upsert_topic('Maddi Duran Varlıklar ve Amortisman', 'muhasebe-duran-amortisman', 'muhasebe-duran');
SELECT pg_temp.upsert_topic('Maddi Olmayan Duran Varlıklar', 'muhasebe-duran-maddi-olmayan', 'muhasebe-duran');

SELECT pg_temp.upsert_topic('Kaynaklar (Pasifler)', 'muhasebe-kaynak', 'muhasebe');
SELECT pg_temp.upsert_topic('Kısa Vadeli Yabancı Kaynaklar', 'muhasebe-kaynak-kisa', 'muhasebe-kaynak');
SELECT pg_temp.upsert_topic('Uzun Vadeli Yabancı Kaynaklar', 'muhasebe-kaynak-uzun', 'muhasebe-kaynak');
SELECT pg_temp.upsert_topic('Özkaynaklar', 'muhasebe-kaynak-ozkaynak', 'muhasebe-kaynak');

SELECT pg_temp.upsert_topic('Gelir ve Gider Hesapları', 'muhasebe-gelir-gider', 'muhasebe');
SELECT pg_temp.upsert_topic('Gelir Tablosu Hesapları', 'muhasebe-gelir-gider-gelir', 'muhasebe-gelir-gider');
SELECT pg_temp.upsert_topic('Maliyet Hesapları', 'muhasebe-gelir-gider-maliyet', 'muhasebe-gelir-gider');

SELECT pg_temp.upsert_topic('Mali Tablolar', 'muhasebe-mali-tablo', 'muhasebe');
SELECT pg_temp.upsert_topic('Bilanço', 'muhasebe-mali-tablo-bilanco', 'muhasebe-mali-tablo');
SELECT pg_temp.upsert_topic('Gelir Tablosu', 'muhasebe-mali-tablo-gelir', 'muhasebe-mali-tablo');
SELECT pg_temp.upsert_topic('Nakit Akış Tablosu', 'muhasebe-mali-tablo-nakit', 'muhasebe-mali-tablo');
SELECT pg_temp.upsert_topic('Mali Tablo Analizi', 'muhasebe-mali-tablo-analiz', 'muhasebe-mali-tablo');

SELECT pg_temp.upsert_topic('Maliyet Muhasebesi', 'muhasebe-maliyet', 'muhasebe');
SELECT pg_temp.upsert_topic('Maliyet Kavram ve Türleri', 'muhasebe-maliyet-tur', 'muhasebe-maliyet');
SELECT pg_temp.upsert_topic('Sipariş ve Safha Maliyet Sistemleri', 'muhasebe-maliyet-sistem', 'muhasebe-maliyet');

SELECT pg_temp.upsert_topic('Şirket Muhasebesi', 'muhasebe-sirket', 'muhasebe');
SELECT pg_temp.upsert_topic('Şahıs ve Sermaye Şirketleri Muhasebesi', 'muhasebe-sirket-sahis-sermaye', 'muhasebe-sirket');

SELECT pg_temp.link_subtree_to_exams('muhasebe', ARRAY['kpss-a']);

-- ----------------------------------------------------------------------------
-- 19. DERS: İSTATİSTİK (KPSS A)
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('İstatistik', 'istatistik', NULL);

SELECT pg_temp.upsert_topic('Tanımlayıcı İstatistik', 'istatistik-tanimlayici', 'istatistik');
SELECT pg_temp.upsert_topic('Veri Toplama, Tablo, Grafik', 'istatistik-tanimlayici-veri', 'istatistik-tanimlayici');
SELECT pg_temp.upsert_topic('Merkezi Eğilim Ölçüleri (Ortalama, Medyan, Mod)', 'istatistik-tanimlayici-merkez', 'istatistik-tanimlayici');
SELECT pg_temp.upsert_topic('Dağılım Ölçüleri (Varyans, Standart Sapma)', 'istatistik-tanimlayici-dagilim', 'istatistik-tanimlayici');

SELECT pg_temp.upsert_topic('Olasılık', 'istatistik-olasilik', 'istatistik');
SELECT pg_temp.upsert_topic('Olasılık Kavramları', 'istatistik-olasilik-kavram', 'istatistik-olasilik');
SELECT pg_temp.upsert_topic('Koşullu Olasılık ve Bayes', 'istatistik-olasilik-bayes', 'istatistik-olasilik');

SELECT pg_temp.upsert_topic('Olasılık Dağılımları', 'istatistik-dagilim', 'istatistik');
SELECT pg_temp.upsert_topic('Kesikli Dağılımlar (Binom, Poisson)', 'istatistik-dagilim-kesikli', 'istatistik-dagilim');
SELECT pg_temp.upsert_topic('Sürekli Dağılımlar (Normal, t, χ², F)', 'istatistik-dagilim-surekli', 'istatistik-dagilim');

SELECT pg_temp.upsert_topic('Örnekleme ve Tahmin', 'istatistik-orneklem', 'istatistik');
SELECT pg_temp.upsert_topic('Örnekleme Yöntemleri', 'istatistik-orneklem-yontem', 'istatistik-orneklem');
SELECT pg_temp.upsert_topic('Nokta ve Aralık Tahmini', 'istatistik-orneklem-tahmin', 'istatistik-orneklem');

SELECT pg_temp.upsert_topic('Hipotez Testleri', 'istatistik-hipotez', 'istatistik');
SELECT pg_temp.upsert_topic('Tek Örneklem ve İki Örneklem Testleri', 'istatistik-hipotez-orneklem', 'istatistik-hipotez');
SELECT pg_temp.upsert_topic('Ki-Kare ve ANOVA', 'istatistik-hipotez-anova', 'istatistik-hipotez');

SELECT pg_temp.upsert_topic('Korelasyon ve Regresyon', 'istatistik-regresyon', 'istatistik');
SELECT pg_temp.upsert_topic('Korelasyon Analizi', 'istatistik-regresyon-korelasyon', 'istatistik-regresyon');
SELECT pg_temp.upsert_topic('Basit ve Çoklu Regresyon', 'istatistik-regresyon-coklu', 'istatistik-regresyon');

SELECT pg_temp.upsert_topic('Zaman Serileri ve İndeksler', 'istatistik-zaman', 'istatistik');
SELECT pg_temp.upsert_topic('Trend ve Mevsimsellik', 'istatistik-zaman-trend', 'istatistik-zaman');
SELECT pg_temp.upsert_topic('İndeks Sayıları', 'istatistik-zaman-indeks', 'istatistik-zaman');

SELECT pg_temp.link_subtree_to_exams('istatistik', ARRAY['kpss-a']);

-- ----------------------------------------------------------------------------
-- 20. DERS: EĞİTİM BİLİMLERİ (KPSS EB)
-- ----------------------------------------------------------------------------

SELECT pg_temp.upsert_topic('Eğitim Bilimleri', 'egitim-bilimleri', NULL);

SELECT pg_temp.upsert_topic('Gelişim Psikolojisi', 'egitim-gelisim', 'egitim-bilimleri');
SELECT pg_temp.upsert_topic('Gelişim İlkeleri ve Dönemleri', 'egitim-gelisim-donem', 'egitim-gelisim');
SELECT pg_temp.upsert_topic('Bedensel ve Devinsel Gelişim', 'egitim-gelisim-bedensel', 'egitim-gelisim');
SELECT pg_temp.upsert_topic('Bilişsel Gelişim (Piaget, Vygotsky)', 'egitim-gelisim-bilissel', 'egitim-gelisim');
SELECT pg_temp.upsert_topic('Dil Gelişimi', 'egitim-gelisim-dil', 'egitim-gelisim');
SELECT pg_temp.upsert_topic('Kişilik Gelişimi (Freud, Erikson, Marcia)', 'egitim-gelisim-kisilik', 'egitim-gelisim');
SELECT pg_temp.upsert_topic('Ahlak Gelişimi (Piaget, Kohlberg)', 'egitim-gelisim-ahlak', 'egitim-gelisim');

SELECT pg_temp.upsert_topic('Öğrenme Psikolojisi', 'egitim-ogrenme', 'egitim-bilimleri');
SELECT pg_temp.upsert_topic('Davranışçı Yaklaşım (Klasik-Edimsel Koşullanma)', 'egitim-ogrenme-davranisci', 'egitim-ogrenme');
SELECT pg_temp.upsert_topic('Sosyal Öğrenme (Bandura)', 'egitim-ogrenme-sosyal', 'egitim-ogrenme');
SELECT pg_temp.upsert_topic('Bilişsel Yaklaşım', 'egitim-ogrenme-bilissel', 'egitim-ogrenme');
SELECT pg_temp.upsert_topic('Yapılandırmacı Öğrenme', 'egitim-ogrenme-yapilandirmaci', 'egitim-ogrenme');
SELECT pg_temp.upsert_topic('Bellek, Unutma ve Transfer', 'egitim-ogrenme-bellek', 'egitim-ogrenme');
SELECT pg_temp.upsert_topic('Güdülenme', 'egitim-ogrenme-gudulenme', 'egitim-ogrenme');

SELECT pg_temp.upsert_topic('Rehberlik ve Özel Eğitim', 'egitim-rehberlik', 'egitim-bilimleri');
SELECT pg_temp.upsert_topic('Rehberlik Tanımı ve Türleri', 'egitim-rehberlik-tanim', 'egitim-rehberlik');
SELECT pg_temp.upsert_topic('Bireyi Tanıma Teknikleri', 'egitim-rehberlik-tanima', 'egitim-rehberlik');
SELECT pg_temp.upsert_topic('Özel Eğitim ve Kaynaştırma', 'egitim-rehberlik-ozel-egitim', 'egitim-rehberlik');
SELECT pg_temp.upsert_topic('Mesleki Rehberlik', 'egitim-rehberlik-mesleki', 'egitim-rehberlik');

SELECT pg_temp.upsert_topic('Ölçme ve Değerlendirme', 'egitim-olcme', 'egitim-bilimleri');
SELECT pg_temp.upsert_topic('Ölçme Kavramı ve Hata Türleri', 'egitim-olcme-kavram', 'egitim-olcme');
SELECT pg_temp.upsert_topic('Geçerlik ve Güvenirlik', 'egitim-olcme-gecerlik', 'egitim-olcme');
SELECT pg_temp.upsert_topic('Test Türleri ve Madde Analizi', 'egitim-olcme-test', 'egitim-olcme');
SELECT pg_temp.upsert_topic('İstatistiksel Hesaplamalar', 'egitim-olcme-istatistik', 'egitim-olcme');

SELECT pg_temp.upsert_topic('Program Geliştirme', 'egitim-program', 'egitim-bilimleri');
SELECT pg_temp.upsert_topic('Eğitim Programı Temel Kavramları', 'egitim-program-kavram', 'egitim-program');
SELECT pg_temp.upsert_topic('Program Tasarım Yaklaşımları', 'egitim-program-yaklasim', 'egitim-program');
SELECT pg_temp.upsert_topic('Program Geliştirme Süreci', 'egitim-program-surec', 'egitim-program');

SELECT pg_temp.upsert_topic('Öğretim İlke ve Yöntemleri', 'egitim-oym', 'egitim-bilimleri');
SELECT pg_temp.upsert_topic('Öğretim İlkeleri', 'egitim-oym-ilke', 'egitim-oym');
SELECT pg_temp.upsert_topic('Öğretim Stratejileri', 'egitim-oym-strateji', 'egitim-oym');
SELECT pg_temp.upsert_topic('Öğretim Yöntem ve Teknikleri', 'egitim-oym-yontem', 'egitim-oym');
SELECT pg_temp.upsert_topic('Öğretim Materyalleri ve Teknolojisi', 'egitim-oym-materyal', 'egitim-oym');

SELECT pg_temp.upsert_topic('Sınıf Yönetimi', 'egitim-sinif', 'egitim-bilimleri');
SELECT pg_temp.upsert_topic('Sınıf Yönetimi Modelleri', 'egitim-sinif-model', 'egitim-sinif');
SELECT pg_temp.upsert_topic('İstenmeyen Davranışlar', 'egitim-sinif-davranis', 'egitim-sinif');
SELECT pg_temp.upsert_topic('Sınıf Atmosferi ve İletişim', 'egitim-sinif-iletisim', 'egitim-sinif');

SELECT pg_temp.link_subtree_to_exams('egitim-bilimleri', ARRAY['kpss-eb']);

-- ----------------------------------------------------------------------------
-- 21. ÖZET RAPOR (migration sonu sayım)
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_exam_count INTEGER;
  v_topic_count INTEGER;
  v_link_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_exam_count FROM exam_types;
  SELECT COUNT(*) INTO v_topic_count FROM topics;
  SELECT COUNT(*) INTO v_link_count FROM topic_exam_types;
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'Konu ağacı seed tamamlandı';
  RAISE NOTICE 'exam_types       : % satır', v_exam_count;
  RAISE NOTICE 'topics           : % satır', v_topic_count;
  RAISE NOTICE 'topic_exam_types : % satır', v_link_count;
  RAISE NOTICE '====================================================';
END $$;
