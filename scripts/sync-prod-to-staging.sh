#!/usr/bin/env bash
# ============================================================================
# sync-prod-to-staging.sh
# ============================================================================
# Production PostgreSQL veritabanını staging'e taşır + PII'yi anonimleştirir.
#
# AKIŞ:
#   1. Prod'dan pg_dump al (custom format, --no-owner --no-acl)
#   2. Dump'ı staging sunucusuna SCP ile aktar
#   3. Staging DB'sini DROP/CREATE et (DESTRUCTIVE — staging içeriği kaybolur)
#   4. Dump'ı staging'e restore et
#   5. PII sanitization SQL'ini çalıştır (email, isim, telefon, IP)
#   6. Staging cache'ini (Redis) flush et
#   7. Eski dump dosyasını sil
#
# GEREKSİNİMLER:
#   - SSH key auth: prod ve staging'e parolasız erişim (~/.ssh/sinav_ops_key)
#   - postgresql-client lokalde kurulu (pg_dump, psql)
#   - jq (config parse için)
#   - .env.ops dosyası bu script ile aynı dizinde
#
# KULLANIM:
#   ./sync-prod-to-staging.sh                    # tam akış
#   ./sync-prod-to-staging.sh --dry-run          # sadece prod dump, restore yok
#   ./sync-prod-to-staging.sh --skip-pii         # restore et ama sanitize etme (TEHLİKELİ)
#   ./sync-prod-to-staging.sh --keep-dump        # dump dosyasını silme (debug için)
#
# CRON (önerilen):
#   0 4 * * 1 /opt/sinav-ops/sync-prod-to-staging.sh >> /var/log/sinav-sync.log 2>&1
#   (Pazartesi 04:00 — staging haftada bir tazelenir)
#
# UYARI:
#   Bu script staging veritabanını TAMAMEN siler. Staging'de manuel test
#   verisi varsa kaybolur. Kabul edilebilir; staging "kullanım sonrası atılır"
#   ortamdır.
# ============================================================================

set -euo pipefail

# ── Renkler (terminal okunabilirliği) ────────────────────────────────────────
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"; }
ok()  { echo -e "${GREEN}[OK]${NC} $*"; }
warn(){ echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERR]${NC} $*" >&2; }

# ── Argümanlar ───────────────────────────────────────────────────────────────
DRY_RUN=false
SKIP_PII=false
KEEP_DUMP=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)   DRY_RUN=true; shift ;;
    --skip-pii)  SKIP_PII=true; shift ;;
    --keep-dump) KEEP_DUMP=true; shift ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) err "Bilinmeyen argüman: $1"; exit 1 ;;
  esac
done

# ── Config yükle ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.ops"

if [[ ! -f "$ENV_FILE" ]]; then
  err ".env.ops bulunamadı. Şablon: ${SCRIPT_DIR}/.env.ops.example"
  err "Doldurup ${ENV_FILE} olarak kaydedin."
  exit 1
fi

# shellcheck source=/dev/null
set -a
source "$ENV_FILE"
set +a

# Zorunlu değişkenleri doğrula
required_vars=(
  PROD_SSH_USER PROD_SSH_HOST PROD_SSH_KEY
  PROD_DB_NAME PROD_DB_USER
  STAGING_SSH_USER STAGING_SSH_HOST STAGING_SSH_KEY
  STAGING_DB_NAME STAGING_DB_USER STAGING_DB_PASS
  STAGING_REDIS_HOST
)

for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    err "Zorunlu env eksik: $var"
    exit 1
  fi
done

# ── Geçici dosyalar ──────────────────────────────────────────────────────────
TIMESTAMP=$(date +'%Y%m%d_%H%M%S')
DUMP_FILE="/tmp/sinav_prod_${TIMESTAMP}.dump"
SANITIZE_SQL="${SCRIPT_DIR}/sanitize-pii.sql"

trap cleanup EXIT
cleanup() {
  if [[ -f "$DUMP_FILE" && "$KEEP_DUMP" != "true" ]]; then
    rm -f "$DUMP_FILE"
    log "Geçici dump silindi: $DUMP_FILE"
  fi
}

# ============================================================================
# 1. PROD'DAN DUMP AL
# ============================================================================
log "1/6 — Prod'dan pg_dump alınıyor..."
log "  Host: $PROD_SSH_HOST  ·  DB: $PROD_DB_NAME"

# pg_dump prod sunucusunda çalıştırılır, output lokale streamlanır
# --no-owner --no-acl: staging'de farklı user'a restore edilebilsin diye
# -Fc (custom format): pg_restore ile selective restore + compression
ssh -i "$PROD_SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "$PROD_SSH_USER@$PROD_SSH_HOST" \
    "PGPASSWORD='$PROD_DB_PASS' pg_dump \
       -h localhost -U $PROD_DB_USER -d $PROD_DB_NAME \
       -Fc --no-owner --no-acl \
       --exclude-table-data='audit_logs' \
       --exclude-table-data='email_logs' \
       --exclude-table-data='moderation_results' \
       --exclude-table-data='attempt_anomaly_events' \
       --exclude-table-data='backup_logs' \
       --exclude-table-data='webhook_events'" \
    > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
ok "Dump alındı: $DUMP_FILE  ($DUMP_SIZE)"

# --exclude-table-data açıklaması:
#   audit_logs       — admin işlemleri, gerçek IP + UA içerir, staging'de gereksiz
#   email_logs       — alıcı email adresi içerir, sanitize maliyetli
#   moderation_results — büyük + dev sırasında bozulur
#   attempt_anomaly_events — gerçek session ID'leri
#   backup_logs      — anlamsız meta
#   webhook_events   — gerçek Stripe/Iyzico event ID'leri

if [[ "$DRY_RUN" == "true" ]]; then
  warn "DRY RUN modu — restore aşamasına geçilmiyor."
  KEEP_DUMP=true  # incelemek için tut
  log "Dump: $DUMP_FILE"
  exit 0
fi

# ============================================================================
# 2. STAGING'E DUMP'I AKTAR
# ============================================================================
log "2/6 — Dump staging'e SCP ile aktarılıyor..."

REMOTE_DUMP="/tmp/sinav_dump_${TIMESTAMP}.dump"

scp -i "$STAGING_SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "$DUMP_FILE" \
    "$STAGING_SSH_USER@$STAGING_SSH_HOST:$REMOTE_DUMP"

ok "Dump staging'e aktarıldı: $REMOTE_DUMP"

# ============================================================================
# 3. STAGING DB'SİNİ DROP + CREATE ET
# ============================================================================
log "3/6 — Staging DB drop + create..."
warn "Staging içeriği siliniyor — kabul edilebilir (staging atılır ortam)."

ssh -i "$STAGING_SSH_KEY" "$STAGING_SSH_USER@$STAGING_SSH_HOST" bash <<EOF
set -euo pipefail

# Aktif connection'ları kes (CREATE DATABASE bekletmez)
PGPASSWORD='$STAGING_DB_PASS' psql -h localhost -U $STAGING_DB_USER -d postgres -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = '$STAGING_DB_NAME' AND pid <> pg_backend_pid();
" || true

# Drop + Create
PGPASSWORD='$STAGING_DB_PASS' psql -h localhost -U $STAGING_DB_USER -d postgres -c "DROP DATABASE IF EXISTS $STAGING_DB_NAME;"
PGPASSWORD='$STAGING_DB_PASS' psql -h localhost -U $STAGING_DB_USER -d postgres -c "CREATE DATABASE $STAGING_DB_NAME OWNER $STAGING_DB_USER;"

echo "[STAGING] Database recreated."
EOF

ok "Staging DB hazırlandı."

# ============================================================================
# 4. DUMP'I RESTORE ET
# ============================================================================
log "4/6 — Restore çalıştırılıyor..."

ssh -i "$STAGING_SSH_KEY" "$STAGING_SSH_USER@$STAGING_SSH_HOST" bash <<EOF
set -euo pipefail

PGPASSWORD='$STAGING_DB_PASS' pg_restore \
  -h localhost -U $STAGING_DB_USER -d $STAGING_DB_NAME \
  --no-owner --no-acl \
  --jobs=2 \
  $REMOTE_DUMP

echo "[STAGING] Restore tamamlandı."
EOF

ok "Restore tamamlandı."

# ============================================================================
# 5. PII SANITIZATION
# ============================================================================
if [[ "$SKIP_PII" == "true" ]]; then
  warn "5/6 — PII SANITIZATION ATLANDI (--skip-pii). TEHLİKELİ — staging gerçek PII içeriyor şu an!"
else
  log "5/6 — PII sanitization SQL çalıştırılıyor..."

  if [[ ! -f "$SANITIZE_SQL" ]]; then
    err "Sanitize SQL bulunamadı: $SANITIZE_SQL"
    exit 1
  fi

  # SQL'i staging'e gönder ve çalıştır
  scp -i "$STAGING_SSH_KEY" "$SANITIZE_SQL" \
      "$STAGING_SSH_USER@$STAGING_SSH_HOST:/tmp/sanitize-pii.sql"

  ssh -i "$STAGING_SSH_KEY" "$STAGING_SSH_USER@$STAGING_SSH_HOST" bash <<EOF
set -euo pipefail

PGPASSWORD='$STAGING_DB_PASS' psql \
  -h localhost -U $STAGING_DB_USER -d $STAGING_DB_NAME \
  -v ON_ERROR_STOP=1 \
  -f /tmp/sanitize-pii.sql

rm -f /tmp/sanitize-pii.sql
echo "[STAGING] PII sanitize edildi."
EOF

  ok "PII sanitize tamamlandı."
fi

# ============================================================================
# 6. STAGING REDIS FLUSH (cache + session'lar staging'e ait)
# ============================================================================
log "6/6 — Staging Redis flush..."

ssh -i "$STAGING_SSH_KEY" "$STAGING_SSH_USER@$STAGING_SSH_HOST" bash <<EOF
set -euo pipefail

# Redis FLUSHALL — staging'de eski session/cache temizlensin
# (Prod cache prod'da kalır, staging'i prod data ile karıştırmıyoruz)
redis-cli -h $STAGING_REDIS_HOST FLUSHALL

echo "[STAGING] Redis flushed."
EOF

ok "Redis flush tamamlandı."

# ============================================================================
# REMOTE DUMP'I TEMİZLE
# ============================================================================
ssh -i "$STAGING_SSH_KEY" "$STAGING_SSH_USER@$STAGING_SSH_HOST" "rm -f $REMOTE_DUMP"
log "Staging tarafındaki dump silindi."

# ============================================================================
# ÖZET
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════"
ok "Senkronizasyon başarılı."
echo "════════════════════════════════════════════════════════════"
echo "  Prod DB        → $PROD_DB_NAME"
echo "  Staging DB     → $STAGING_DB_NAME"
echo "  Dump boyutu    → $DUMP_SIZE"
echo "  PII sanitize   → $([ "$SKIP_PII" == "true" ] && echo 'ATLANDI ⚠️' || echo 'Tamamlandı ✓')"
echo "  Tamamlama      → $(date +'%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════════════"
