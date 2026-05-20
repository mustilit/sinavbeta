#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Exiting."
  exit 1
fi

echo "DATABASE_URL present: true"

# Parse host and port from DATABASE_URL using node URL parser
DB_HOST_PORT=$(node -e "try { const u = new URL(process.env.DATABASE_URL); console.log((u.hostname || 'localhost') + ':' + (u.port || '5432')); } catch { process.exit(1); }")
DB_HOST=$(echo "$DB_HOST_PORT" | cut -d: -f1)
DB_PORT=$(echo "$DB_HOST_PORT" | cut -d: -f2)

echo "Waiting for database to be ready on ${DB_HOST}:****..."
for i in 1 2 3 4 5; do
  if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U postgres >/dev/null 2>&1; then
    echo "Database is ready."
    break
  fi
  if [ "$i" -eq 5 ]; then
    echo "Database not ready after 5 attempts. Exiting."
    exit 1
  fi
  echo "Database not ready yet (attempt $i/5), retrying in 5s..."
  sleep 5
done

echo "Running migrations (with retry)..."
for i in 1 2 3 4 5; do
  # Take advisory lock to avoid concurrent migrations in scaled environments
  psql "$DATABASE_URL" -c "SELECT pg_advisory_lock(123456);" || true
  if npx prisma migrate deploy; then
    echo "Migrations applied."
    psql "$DATABASE_URL" -c "SELECT pg_advisory_unlock(123456);" || true
    break
  fi
  if [ "$i" -eq 5 ]; then
    psql "$DATABASE_URL" -c "SELECT pg_advisory_unlock(123456);" || true
    echo "Migration failed after 5 attempts. Exiting."
    exit 1
  fi
  echo "Migration attempt $i/5 failed (host=${DB_HOST}:****), retrying in 5s..."
  sleep 5
done

echo "Skipping Prisma client generate (already built into image)..."

echo "Starting application..."
exec npm run start

