-- Kullanıcı kendi cihaz onayını kaldırdığında audit kaydı için yeni enum değeri.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DEVICE_TRUST_REVOKED';
