# Anonimleştirilmiş Prod Snapshot — Runbook

> **Statü:** Production sertifikasyonu — canlıya çıkmadan önce TAMAMLANMALI
> **Hedef:** Staging ortamı, prod veri **şeklini** taşısın ama gerçek **PII içermesin**.
> **Sıklık:** Haftada bir (önerilen: Pazartesi 04:00)
> **İlgili dosyalar:**
> - `scripts/sync-prod-to-staging.sh`
> - `scripts/sanitize-pii.sql`
> - `scripts/.env.ops.example`

---

## Neden anonimleştirilmiş snapshot?

Önceki kalite raporunda belirtildiği gibi, **"canlıda yaşanan sorunları lokalde simüle edememe"** sorununun çözümünün omurgası budur.

| Sorun | Synthetic test data ile | Anonim prod snapshot ile |
|---|---|---|
| "Kullanıcı X'in profili açılmıyor" | Sentetik data farklı veri şeklinde → reproduce edemezsiniz | Aynı kullanıcı ID'siyle aynı senaryoyu test edersiniz |
| Migration test (1M satır) | 100 satırlık fake data, edge case yok | Gerçek dağılım, gerçek edge case'ler |
| Performance regression | Yapay 10K kayıt, gerçek N+1 yakalanmaz | Prod boyutunda, gerçek query plan'leri |
| Yeni feature staging review | "Demo data" → ürün hissi yok | Gerçek kullanıcı sayısı, gerçek pattern |

KVKK + GDPR uyumu açısından kritik: **staging gerçek PII tutmamalıdır.** Bu script bunu garantiler. Sanitize sonrası bir veri sızıntısı olsa bile, sızan veri zaten anonim.

---

## Mimari

```
PROD (Hetzner VPS)                   STAGING (Hetzner VPS)
┌──────────────────────┐             ┌──────────────────────┐
│ PostgreSQL           │             │ PostgreSQL           │
│ - sinavsalonu        │             │ - sinavsalonu_staging│
│   (gerçek PII)       │             │   (anonim)           │
└──────────────────────┘             └──────────────────────┘
         │                                       │
         │ 1. pg_dump (SSH ile)                  │
         │    --exclude-table-data=audit_logs    │
         │    --exclude-table-data=email_logs    │
         │                                       │
         ↓                                       │
   /tmp/dump.dump  ────── 2. SCP ──────►   /tmp/dump.dump
         │                                       │
         │                                       ↓
         │                            3. DROP + CREATE DB
         │                            4. pg_restore
         │                            5. sanitize-pii.sql
         │                            6. Redis FLUSHALL
         │                                       │
         │                                       ↓
         │                            ✅ Staging anonim
         └─── 7. Lokal dump silinir ──────────────┘
```

---

## 0. Ön hazırlık

### 0.1 Read-only DB user oluştur (prod'da)

Snapshot script'i prod'a yazma yapmıyor ama prensip olarak **least privilege** — sadece SELECT yetkisi olan bir user kullanın:

```bash
# Prod sunucusunda:
sudo -u postgres psql -d sinavsalonu <<'EOF'
CREATE USER sinav_dump WITH PASSWORD 'change-me-strong-password';
GRANT CONNECT ON DATABASE sinavsalonu TO sinav_dump;
GRANT USAGE ON SCHEMA public TO sinav_dump;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sinav_dump;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sinav_dump;
EOF
```

Bu user prod DB'sini okuyabilir, **asla yazamaz**. Script bu user ile çalışır.

### 0.2 SSH key (prod + staging için ortak ops key)

Lokal makinenizde (veya CI runner'da):

```bash
# Yeni bir SSH key — sadece bu otomasyon için
ssh-keygen -t ed25519 -C "sinav-ops-snapshot" -f ~/.ssh/sinav_ops_key

# Public key'i hem prod hem staging sunucularına ekle
ssh-copy-id -i ~/.ssh/sinav_ops_key.pub deploy@prod.sinavsalonu.com
ssh-copy-id -i ~/.ssh/sinav_ops_key.pub deploy@staging.sinavsalonu.com
```

### 0.3 `.env.ops` dosyasını hazırla

```bash
cd C:\Users\mtulu\dal\scripts
cp .env.ops.example .env.ops
# Notepad veya nano ile aç ve değerleri doldur:
# - PROD_SSH_HOST + PROD_SSH_KEY
# - PROD_DB_NAME + PROD_DB_USER + PROD_DB_PASS
# - STAGING_SSH_HOST + STAGING_SSH_KEY
# - STAGING_DB_USER + STAGING_DB_PASS
# - STAGING_REDIS_HOST
```

**`.env.ops` repo'ya commit ETMEYİN.** Zaten `.gitignore`'da `.env` ve `.env.*.local` pattern'leri var — `.env.ops`'u eklemek için bir satır:

```
# .gitignore — eklenmesi gereken satır:
scripts/.env.ops
```

### 0.4 Script'i çalıştırılabilir yap (Linux/macOS)

```bash
chmod +x C:\Users\mtulu\dal\scripts\sync-prod-to-staging.sh
```

Windows'ta WSL altında veya Git Bash'ten çalıştırılır.

---

## 1. Manuel ilk çalıştırma (dry-run)

İlk seferinde gerçek restore yapmadan sadece dump alarak test edin:

```bash
cd C:\Users\mtulu\dal\scripts
./sync-prod-to-staging.sh --dry-run
```

Beklenen çıktı:
```
[2026-06-01 16:00:00] 1/6 — Prod'dan pg_dump alınıyor...
[OK] Dump alındı: /tmp/sinav_prod_20260601_160001.dump  (42M)
[WARN] DRY RUN modu — restore aşamasına geçilmiyor.
```

Dump dosyasını incele (`pg_restore --list /tmp/sinav_prod_*.dump | head -30`) — beklenen tabloları görmelisin.

---

## 2. Tam çalıştırma (ilk gerçek senkronizasyon)

```bash
./sync-prod-to-staging.sh
```

Akış:
1. Prod'dan dump alır (~30 sn - 5 dk, DB boyutuna göre)
2. Staging'e SCP (~30 sn)
3. Staging DB'sini drop + create (~5 sn)
4. Restore (~1-3 dk)
5. Sanitize SQL (~5-10 sn)
6. Redis FLUSHALL (~1 sn)

**Toplam: ~3-10 dakika** (DB boyutuna göre).

### Kontrol

Senkronizasyondan sonra staging'e SSH ile bağlanıp doğrulayın:

```sql
-- Staging postgres'e bağlan
PGPASSWORD=$STAGING_DB_PASS psql -h localhost -U postgres -d sinavsalonu_staging

-- Anonim email kontrolü
SELECT email FROM users LIMIT 5;
-- Beklenen: hepsi @anon.local veya @staging.local

-- Sanitization bayrağı
SELECT * FROM site_settings WHERE key = 'ENVIRONMENT_TYPE';
-- Beklenen: value = 'staging-anonymized'

-- Sayım — prod'a yakın olmalı
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM purchases;
SELECT COUNT(*) FROM test_attempts;
```

---

## 3. Cron ile otomatik (haftalık)

Staging sunucusunda (veya prod'da — fark etmez, network erişimi gerek):

```bash
# Crontab'a ekle (deploy user'ı altında)
crontab -e

# Pazartesi 04:00'te staging tazelenir
0 4 * * 1 /opt/sinav-ops/sync-prod-to-staging.sh >> /var/log/sinav-sync.log 2>&1
```

`/opt/sinav-ops/` dizinini ayrı oluşturup script'i + sanitize SQL'i + `.env.ops`'u oraya kopyalayabilirsiniz (deploy user okusun + script çalıştırabilsin).

### Pazartesi 04:00 seçimi neden?

- Hafta başı, geliştirici staging'i taze veriyle Pazartesi sabahı bulur.
- Gece — prod trafiği minimum, pg_dump yükü hissedilmez.
- Cuma deploy sonrası 3 gün geçmiş — staging'in eskimişliği hafta başında giderilir.

---

## 4. Slack/Telegram bildirimi (opsiyonel)

Script'in sonuna ekleyebileceğiniz blok:

```bash
# ============================================================================
# BİLDİRİM
# ============================================================================
if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"✅ Staging sync tamamlandı — $DUMP_SIZE @ $(date +'%H:%M')\"}"
fi
```

---

## 5. Performans tuning

DB büyüdükçe (>10 GB) dikkat edilmesi gerekenler:

**5.1 Paralel dump/restore:**
```bash
# pg_dump --jobs paraleli destekler (directory format için):
pg_dump -Fd -j 4 -f /tmp/sinav_dump_dir -d sinavsalonu
# pg_restore --jobs:
pg_restore -j 4 -d sinavsalonu_staging /tmp/sinav_dump_dir
```

Script şu an `-Fc` (custom file) kullanıyor — küçük/orta DB'ler için yeterli. >10 GB'da directory format'a geç.

**5.2 Sadece kritik tablolar:**

Eğer tüm tabloları senkronlamak yavaşsa, geliştirme için **sadece** belirli tabloları al:

```bash
pg_dump --table=users --table=exam_tests --table=test_packages \
        --table=purchases --table=reviews \
        -Fc -d sinavsalonu > /tmp/dump.dump
```

Diğer tablolar staging'de boş kalır — `npm run db:seed` ile demo seed çalıştırabilirsiniz.

**5.3 Filtered subset (son 30 gün):**

Çok büyük tablolar için `--where` ile zaman penceresi:

```sql
-- audit_logs tablosunu sadece son 30 gün için al
COPY (SELECT * FROM audit_logs WHERE "createdAt" > NOW() - INTERVAL '30 days') TO STDOUT;
```

Bu, custom bir Python script ister; pg_dump native olarak `--where` desteklemiyor. Genellikle `--exclude-table-data` ile tüm tablodan vazgeçmek + seed ile baştan kurmak daha pratik.

---

## 6. Güvenlik notları

**KVKK Madde 4 — anonimleştirme:** Anonimleştirilmiş veri "kişisel veri" sayılmaz (kişiye geri map'lenemezse). Script'imiz `email = 'user-' || id || '@anon.local'` deterministik map'leme yapıyor — bu **pseudonymization** (sözde anonimleştirme), tam anonimleştirme değil. Foreign key bütünlüğü için bu mantıklı; ancak staging veritabanı **prod ile aynı seviyede gizli tutulmalı** (firewall, SSH key, audit).

**Erişim disiplini:**
- Staging'e erişim: dev ekip (sizin durumunuzda: siz).
- Üçüncü taraf (yüklenici, danışman) çalışmalı mı? Onlara ayrı bir "fully synthetic" ortam kurun, anonim snapshot'ı vermeyin.

**Audit:** Her senkronizasyon log dosyasına ne zaman çalıştığını yazsın (`/var/log/sinav-sync.log`). Yılda bir kez logu denetleyin — beklenmedik run olmuş mu?

---

## 7. Sorun giderme

**`pg_dump: error: connection failed: FATAL: password authentication failed`**
→ `.env.ops` dosyasında `PROD_DB_PASS` yanlış. Doğrula.

**`scp: /tmp/sinav_dump_*.dump: Permission denied`**
→ Staging'de `deploy` user'ının `/tmp` yazma yetkisi yok (nadir). `chmod 1777 /tmp` veya farklı bir hedef path kullan.

**`pg_restore: error: could not execute query: ERROR: must be owner of...`**
→ `--no-owner --no-acl` flag'leri verilmemiş. Script'te zaten var; manuel restore'da unutma.

**Sanitize SQL `column "xyz" does not exist` hatası**
→ Yeni bir migration kolonu kaldırmış. `sanitize-pii.sql`'i güncelle — kolon yoksa `IF EXISTS` kontrolü ekle:
```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'old_column') THEN
    UPDATE users SET old_column = NULL;
  END IF;
END $$;
```

**`FLUSHALL` Redis'te disabled**
→ Production Redis'inde FLUSHALL kapatılabilir (`rename-command FLUSHALL ""`). Staging Redis'inde aktif olduğundan emin ol. Veya `FLUSHDB` kullan (sadece current DB).

---

## 8. Yeni tablo eklediğinde güncelle

Her yeni Prisma migration sonrası:
1. Yeni tablo PII içeriyor mu? → `sanitize-pii.sql`'e UPDATE ekle.
2. Tablo log/audit niteliğinde mi? → `sync-prod-to-staging.sh` içinde `--exclude-table-data` listesine ekle.

Bunu **pre-commit hook** ile zorla:

```bash
# .husky/pre-commit ek satır
if git diff --cached --name-only | grep -q "prisma/migrations/"; then
  echo "⚠️  Yeni migration eklendi. scripts/sanitize-pii.sql güncellendi mi?"
  echo "   Yeni tablo PII içeriyorsa UPDATE eklemen gerekir."
  read -p "Güncellendi mi? (y/N) " yn
  case $yn in
    [Yy]*) ;;
    *) echo "Önce sanitize-pii.sql'i güncelle."; exit 1 ;;
  esac
fi
```

---

## 9. KVKK uyum kanıtı

Bu script ve `sanitize-pii.sql` dosyası, KVKK denetiminde **"staging ortamında kişisel veri işlenmediğine dair belge"** olarak sunulabilir.

Yıllık denetim için:
- Sync log'larını (`/var/log/sinav-sync.log`) bir yıl saklayın.
- `sanitize-pii.sql`'in git history'sini (her güncelleme ne zaman, neden) düzenli tutun.
- Yılda bir kez ekran görüntüsü: staging veritabanından `SELECT email FROM users LIMIT 10;` çıktısı → hepsi `@anon.local` olmalı.

---

*Bu runbook PostgreSQL 13+ uyumludur. PII tanımı KVKK Madde 4 ve GDPR Article 4 esas alınmıştır.*
