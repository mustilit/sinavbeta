-- Migration: 20260531180000_audit_device_quota_exceeded
-- Canlı oturum kapatma saldırısı koruması (JoinLiveSessionUseCase) tetiklendiğinde
-- forensic/abuse izi bırakmak için AuditAction enum'a DEVICE_QUOTA_EXCEEDED değeri.
-- Aynı cihaz/IP'den bir oturuma izin verilen katılım kotası aşıldığında loglanır.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DEVICE_QUOTA_EXCEEDED';
