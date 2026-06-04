# PITR (Point-in-Time Recovery) Setup Runbook

> **Statü:** Production sertifikasyonu — canlıya çıkmadan önce TAMAMLANMALI
> **Hedef:** RPO (Recovery Point Objective) ≤ 5 dakika · RTO (Recovery Time Objective) ≤ 2 saat
> **Ortam:** Hetzner Cloud VPS + PostgreSQL 15+ + Backblaze B2 (veya S3 uyumlu)
> **Bağımlılık:** pgBackRest

---

## Neden PITR?

Hetzner günlük snapshot (Console → Backups, ~%20 ek ücret) **dosya sistemi seviyesinde** yedek alır. Yeterli mi?

| Senaryo | Hetzner snapshot | PITR |
|---|---|---|
| Tüm sunucu çöktü, son 24 saat içinde | Geri yükle, **24 saat'e kadar veri kaybı** | Geri yükle, **5 dakikaya kadar veri kaybı** |
| Yanlışlıkla `DELETE FROM users` çalıştırıldı | Geri yükle, **dünden bu yana her şey gider** | "Bir dakika önce" noktasına dön, sadece o işlem gider |
| Schema migration bozuldu | Snapshot'tan tüm DB geri | Migration'dan 1 dakika öncesine dön |
| Veri sızıntısı tespit edildi (saat 14:32) | 14:32 öncesi snapshot yok | 14:31'e dön, anomaliyi izole et |

PITR olmadan canlıya geçmeyin. Maliyet ayda ~€5-10, koruma kalitesi ayda **1000x** daha yüksek.

---

## 0. Ön hazırlık (lokal makinede, kuruluma başlamadan)

**Object storage hesabı.** İki seçenek:

1. **Backblaze B2 (önerilen):** AB region'da (`eu-central-003`), $0.005/GB/ay (~%50 daha ucuz S3'ten). https://www.backblaze.com/cloud-storage → kayıt + kredi kartı.
2. **AWS S3 Frankfurt (`eu-central-1`):** Standard plan, $0.023/GB/ay.

Aşağıda Backblaze B2 örnekleri verilecek. AWS S3 için sadece endpoint URL değişir.

**Bucket oluştur:**
- B2 Console → `Create a Bucket` → Name: `sinavsalonu-pitr` → Files in Bucket: `Private` → Default Encryption: `Enable (SSE-B2)` → Object Lock: `Disabled` → Create.
- **Lifecycle rule:** `Keep prior versions for X days` → 30 gün (eski WAL'lar otomatik silinir, depolama maliyeti kontrol altında).

**Application Key oluştur:**
- B2 Console → `App Keys` → `Add a New Application Key`.
- Name: `pitr-prod`.
- Allow access to Bucket(s): sadece `sinavsalonu-pitr`.
- Type of Access: `Read and Write`.
- File name prefix + duration: boş bırak.
- `Create New Key`.

Çıkan **keyID** ve **applicationKey** değerlerini bir kenara not edin (`applicationKey` bir daha gösterilmez).

**Bir not defterine yazın:**
- B2 Endpoint: `https://s3.eu-central-003.backblazeb2.com`
- Bucket: `sinavsalonu-pitr`
- Region: `eu-central-003`
- keyID: `<b2-key-id>`
- applicationKey: `<b2-app-key>`
- Repository encryption password (32+ karakter, lokalde üret): `openssl rand -base64 32`

**Kontrol:** Bu beşi de elinizde değilse devam etmeyin. Özellikle encryption password — yedek dosyaları onsuz okunamaz.

---

## 1. pgBackRest kurulumu

Prod sunucusunda (`ssh root@<server-ip>`):

```bash
# 1.1 Repository ekle (PostgreSQL APT)
apt update
apt install -y pgbackrest

# 1.2 Versiyonu doğrula (>= 2.50 olsun)
pgbackrest version
```

**Kontrol:** `pgBackRest 2.5x.x` görmelisiniz.

---

## 2. pgBackRest konfigürasyonu

```bash
# 2.1 Config dizini
mkdir -p /etc/pgbackrest /var/log/pgbackrest /var/spool/pgbackrest
chown postgres:postgres /var/log/pgbackrest /var/spool/pgbackrest
chmod 750 /var/log/pgbackrest /var/spool/pgbackrest

# 2.2 Ana config dosyası
cat > /etc/pgbackrest/pgbackrest.conf <<'EOF'
[global]
# Repository (Backblaze B2 / S3 uyumlu)
repo1-type=s3
repo1-s3-endpoint=s3.eu-central-003.backblazeb2.com
repo1-s3-region=eu-central-003
repo1-s3-bucket=sinavsalonu-pitr
repo1-s3-key=<b2-key-id>
repo1-s3-key-secret=<b2-app-key>
repo1-s3-uri-style=path
repo1-path=/pgbackrest

# Şifreleme
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=<encryption-password>

# Retention
repo1-retention-full=2          # 2 full backup tut (haftalık × 2 = 14 gün)
repo1-retention-diff=6          # 6 differential backup tut
repo1-retention-archive=2       # 2 full'ün WAL'i

# Performance
process-max=2
compress-type=zst
compress-level=3

# Log
log-level-console=info
log-level-file=detail
log-path=/var/log/pgbackrest

# Async archiving (Postgres'i bekletmez)
archive-async=y
spool-path=/var/spool/pgbackrest

[main]
pg1-path=/var/lib/postgresql/15/main
pg1-port=5432
pg1-socket-path=/var/run/postgresql
EOF

# 2.3 Permissions
chmod 640 /etc/pgbackrest/pgbackrest.conf
chown postgres:postgres /etc/pgbackrest/pgbackrest.conf
```

`<b2-key-id>`, `<b2-app-key>`, `<encryption-password>` yer tutucularını gerçek değerlerle değiştirin.

**Kontrol:** `sudo -u postgres pgbackrest --stanza=main check` çalışsın. "completed successfully" görmelisiniz (henüz repo oluşmadığı için hata verirse normal, bir sonraki adım).

---

## 3. PostgreSQL konfigürasyonu

```bash
# 3.1 postgresql.conf'a archive_command + wal_level ekle
# (Dosya yolu Postgres major sürüme göre değişir — 15 örneği)
PG_CONF=/etc/postgresql/15/main/postgresql.conf

cat >> $PG_CONF <<'EOF'

# ── PITR (pgBackRest) ──
wal_level = replica                              # zaten default, doğrula
archive_mode = on
archive_command = 'pgbackrest --stanza=main archive-push %p'
archive_timeout = 60                             # max 60s bekle, sonra WAL'ı zorla
max_wal_senders = 3                              # streaming replication için (read replica)
EOF

# 3.2 Postgres restart (kısa downtime ~2-5 saniye)
systemctl restart postgresql

# 3.3 Doğrula
sudo -u postgres psql -c "SHOW archive_mode;"
sudo -u postgres psql -c "SHOW archive_command;"
```

**Kontrol:** `archive_mode = on`, `archive_command = 'pgbackrest --stanza=main archive-push %p'` çıktısı gelmeli.

---

## 4. İlk full backup

```bash
# 4.1 Stanza oluştur (repo'da klasör yapısı kurulur)
sudo -u postgres pgbackrest --stanza=main stanza-create

# 4.2 İlk full backup (DB boyutuna göre 5-30 dakika sürer)
sudo -u postgres pgbackrest --stanza=main --type=full backup

# 4.3 Backup listesini gör
sudo -u postgres pgbackrest --stanza=main info
```

Çıktıda şunu görmelisiniz:

```
stanza: main
    status: ok
    cipher: aes-256-cbc

    db (current)
        wal archive min/max (15): 000000010000000000000001/000000010000000000000003

        full backup: 20260601-0500F
            timestamp start/stop: 2026-06-01 05:00:00 / 2026-06-01 05:08:32
            wal start/stop: 000000010000000000000001 / 000000010000000000000003
            database size: 124MB, database backup size: 124MB
            repo1: backup set size: 38.5MB, backup size: 38.5MB
```

**Kontrol:** B2 Console'da bucket'a girdiğinizde `pgbackrest/archive/main/` ve `pgbackrest/backup/main/` klasörlerini görmelisiniz.

---

## 5. Otomatik backup zamanlaması (cron)

```bash
# 5.1 Cron dosyası
cat > /etc/cron.d/pgbackrest <<'EOF'
# Sınav Salonu PITR — pgBackRest schedule
# Full backup: Pazar 03:00 (haftalık)
# Differential: Pazartesi-Cumartesi 03:00 (günlük, full'e göre delta)
# Continuous WAL archiving: Postgres tarafından archive_command ile (sürekli)

0 3 * * 0 postgres /usr/bin/pgbackrest --stanza=main --type=full backup
0 3 * * 1-6 postgres /usr/bin/pgbackrest --stanza=main --type=diff backup
EOF

chmod 644 /etc/cron.d/pgbackrest
systemctl restart cron
```

**Kontrol:** `cat /etc/cron.d/pgbackrest` çıktısını doğrulayın. Pazar 03:00'te ilk full koşacak; takip eden cumartesileri full'e dayanan diff alacak.

---

## 6. Restore tatbikatı (staging'de)

PITR kurulumu test edilmemiş PITR = olmayan PITR. Her ay bir kez staging'de restore tatbikatı yapın.

### Senaryo: "1 saat önce yapılan bir yanlış DELETE'i geri al"

Staging sunucusunda (veya yeni bir test VPS'de):

```bash
# 6.1 pgBackRest aynı config ile kurulu olsun (Adım 1-3 staging'de de uygulayın)
#     repo1 aynı bucket'ı okur — read access yeterli.

# 6.2 Postgres'i durdur (data kaybı YOK, hazırlık)
systemctl stop postgresql

# 6.3 data directory'yi temizle
rm -rf /var/lib/postgresql/15/main/*

# 6.4 Restore + recovery target
sudo -u postgres pgbackrest --stanza=main \
  --type=time \
  --target="2026-06-15 14:00:00+03" \
  --target-action=promote \
  restore

# 6.5 Postgres'i başlat — recovery otomatik 14:00'e kadar WAL replay yapar
systemctl start postgresql

# 6.6 Doğrula
sudo -u postgres psql -d sinavsalonu -c "SELECT NOW(), COUNT(*) FROM users;"
```

**Kontrol:** `NOW()` çağrısı şu anki zamanı dönecektir, ancak DB içeriği `--target` zamanına ait olmalı (örneğin silinen kullanıcılar geri gelmiş olmalı).

**Önemli:** PITR restore = DB'yi geçmişe dönderir. Restore sonrası eski WAL chain'i kopar; aynı stanza'ya yeni full backup almanız gerekir. Bu yüzden PITR genellikle staging veya yeni-cluster senaryolarında kullanılır; prod'da kullanılırsa, restore sonrası "yeni stanza" pratiği:

```bash
# Restore sonrası yeni timeline başlat
sudo -u postgres pgbackrest --stanza=main stanza-upgrade
sudo -u postgres pgbackrest --stanza=main --type=full backup
```

---

## 7. Disaster Recovery senaryoları (canlı durumlar)

### Senaryo A: 5 dakika önce yanlış migration koştu

1. Postgres çökmeden migration'ı tespit ettiniz (Sentry alert).
2. **Önce:** circuit breaker ile yazma trafiğini durdur (read trafiği devam edebilir).
3. Migration'dan 1 dakika öncesine PITR restore (staging'e değil, yeni bir replica'ya — prod hâlâ ayakta).
4. Yeni replica'yı promote et, eski'yi düşür (planlanmış failover).
5. Toplam downtime: ~10-15 dakika.

### Senaryo B: 6 saat önce veri sızıntısı (admin hesabı çalındı, veri export edildi)

1. Sızıntının zamanını Sentry / audit log üzerinden tespit edin.
2. **Önce:** ilgili API key'leri rotate edin, ilgili admin hesabını disable edin.
3. PITR ile **forensic restore** — sızıntı zamanına bir adet salt-okunur replica kurun. Üzerinden incelemeyi yapın (kim, ne, ne kadar veri).
4. Prod canlı kalır; restore sadece "olay sırasında DB ne durumdaydı" sorusuna cevap için.

### Senaryo C: Sunucu komple çöktü (Hetzner DC outage)

1. Hetzner SnapShot'ı (Console → Backups) ile yeni bir VPS oluştur (RPO ≤ 24 saat).
2. PITR ile son WAL'e kadar getir (RPO ≤ 5 dakika).
3. DNS'i yeni IP'ye yönlendir (TTL 300 olmalı — Hetzner runbook'ta zaten 300).
4. Toplam downtime: ~1-2 saat.

---

## 8. İzleme

```bash
# 8.1 Son backup ne zamandı?
sudo -u postgres pgbackrest --stanza=main info --output=json | jq '.[].backup[-1].timestamp.stop'

# 8.2 WAL archive yatayında lag var mı?
sudo -u postgres psql -c "SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();"

# 8.3 Repo boyutu (maliyet izleme)
sudo -u postgres pgbackrest --stanza=main info --output=json | jq '.[].backup | map(.info.repository.size) | add / 1e9' # GB
```

**Prometheus alert** (`infra/helm/sinavsalonu/templates/prometheusrule.yaml` içine ekleyebilirsiniz):

```yaml
- alert: PgBackRestFullBackupOverdue
  expr: time() - pgbackrest_backup_timestamp_seconds{type="full"} > 8 * 24 * 3600
  for: 1h
  annotations:
    summary: "Son full backup 8 günden eski. Cron koşmuyor olabilir."

- alert: PgBackRestDiffBackupOverdue
  expr: time() - pgbackrest_backup_timestamp_seconds{type="diff"} > 36 * 3600
  for: 30m
  annotations:
    summary: "Son diff backup 36 saatten eski. Cron koşmuyor olabilir."
```

Not: pgbackrest_exporter (third-party) bu metrik'leri Prometheus'a expose eder.

---

## 9. Maliyet hesabı

Bir DB'nin tipik PITR maliyeti (Backblaze B2 üzerinde):

| Boyut | Aylık | Yıllık |
|---|---|---|
| 1 GB DB + 30 günlük WAL (~2 GB) | ~$0.015 | ~$0.18 |
| 10 GB DB + 30 günlük WAL (~20 GB) | ~$0.15 | ~$1.80 |
| 50 GB DB + 30 günlük WAL (~100 GB) | ~$0.75 | ~$9.00 |

Çoğu SaaS başlangıçta < 10 GB DB. Yıllık maliyet ~$2 — koruma değeri yüzlerce dolar. **No-brainer.**

Egress (restore sırasında indirme): Backblaze'de ilk 1 GB/gün ücretsiz, sonrası $0.01/GB.

---

## 10. Sorun giderme

**`archive command failed`** Postgres log'unda görünürse:
- B2 credentials yanlış → `/etc/pgbackrest/pgbackrest.conf` doğrula.
- Network outbound 443 kapalı → `ufw status` kontrol et, B2 endpoint'e erişimin olduğundan emin ol.
- `archive_async=y` set edilmiş mi? Senkron mod Postgres'i bloklar; yoğun trafikte sorun.

**Backup boyutu beklenenden büyük:**
- Compression `zst` mi? `compress-level=3` mü? (config'te zaten ayarlı).
- Eski WAL'lar temizlenmemiş olabilir; `pgbackrest expire` çalıştır.

**Restore çok yavaş:**
- `process-max=2` artırılabilir (sunucu CPU'suna göre 4-8).
- B2 download hızı sınırlı — büyük restore'larda paralelizm önemli.

---

## 11. Hetzner runbook entegrasyonu

`docs/runbooks/production-deploy-hetzner.md` içinde "Postgres kurulumu" adımından sonra şu adımı ekleyin:

```markdown
### Adım X.Y: PITR aktivasyonu

PITR setup runbook'unu izleyin: `docs/ops/pitr-setup.md`.
Bu kurulum tamamlanmadan canlıya **trafik vermeyin** — RPO 24 saat (Hetzner snapshot) yerine 5 dakika (PITR + WAL) garantisi şarttır.
```

---

*Bu runbook PostgreSQL 15+ ve pgBackRest 2.50+ varsayar. Versiyon farkları için pgBackRest resmi dokümantasyon'una bakın: https://pgbackrest.org/*
