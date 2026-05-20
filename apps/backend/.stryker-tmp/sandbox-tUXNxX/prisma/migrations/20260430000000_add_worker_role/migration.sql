-- UserRole enum'una WORKER ekle
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'WORKER';

-- WorkerPermission tablosu
CREATE TABLE "worker_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "worker_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "worker_permissions_userId_key" ON "worker_permissions"("userId");

ALTER TABLE "worker_permissions"
    ADD CONSTRAINT "worker_permissions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
