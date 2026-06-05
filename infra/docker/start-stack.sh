#!/usr/bin/env bash
#
# start-stack.sh — Sınav Salonu tüm stack'ini (postgres + redis + backend +
# frontend + worker'lar) birlikte başlatır ve sağlığını doğrular.
#
# Neden: Stack yalnız backend/frontend ile başlatılırsa postgres/redis kalkmaz,
# backend DB'ye bağlanamaz (unhealthy) → giriş çalışmaz. Bu script HER ZAMAN
# tüm servisleri ayağa kaldırır ve postgres + backend sağlıklı olana kadar bekler.
#
# Kullanım:
#   bash infra/docker/start-stack.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE=(docker compose -p docker --env-file "$ROOT/.env"
  -f "$ROOT/infra/docker/docker-compose.prod.yml"
  -f "$ROOT/infra/docker/docker-compose.staging.yml")

echo "[start-stack] Tüm servisler başlatılıyor (up -d)..."
"${COMPOSE[@]}" up -d

echo "[start-stack] postgres hazır olana kadar bekleniyor..."
for i in $(seq 1 30); do
  if docker exec docker-postgres-1 pg_isready -U postgres >/dev/null 2>&1; then
    echo "  ✓ postgres hazır"
    break
  fi
  sleep 2
done

echo "[start-stack] backend healthcheck bekleniyor..."
for i in $(seq 1 45); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' docker-backend-1 2>/dev/null || echo missing)"
  if [ "$status" = "healthy" ]; then
    echo "  ✓ backend healthy"
    break
  fi
  sleep 2
done

echo "[start-stack] Servis durumu:"
"${COMPOSE[@]}" ps

echo "[start-stack] Bitti. Giriş: http://localhost (veya sunucu IP'si)."
