# SOC 2 Type II Readiness Checklist

KALITE-DEGERLENDIRME Q3 stratejik öneri. SOC 2 = AICPA'nın Trust Services Criteria (TSC) standardına göre denetim raporu. **Type II** belirli bir periyot boyunca (6–12 ay) kontrollerin "operating effectiveness"ini belgeler.

> Bu doküman **iç hazırlık** rehberidir, formal denetim ikamesi değildir. Denetim için yetkili CPA firması (örn. A-LIGN, Vanta, Drata) ile çalışılır.

## TSC kategorileri ve hedefleri

| Kategori | Adı | Sınav Salonu için gerekli mi? |
|---|---|---|
| Security | Güvenlik | ✅ Zorunlu (her SOC 2'de var) |
| Availability | Erişilebilirlik | ✅ Önerilir (SLA varsa) |
| Processing Integrity | İşlem bütünlüğü | ✅ Marketplace (ödeme akışı) |
| Confidentiality | Gizlilik | ✅ Multi-tenant (tenant izolasyon) |
| Privacy | Gizlilik (PII) | ✅ KVKK uyumu var |

## Kontroller (sample — gerçek denetimde 100+ kontrol var)

### CC1 — Control Environment

| ID | Kontrol | Durum | Kanıt |
|---|---|---|---|
| CC1.1 | Etik kodu / davranış kuralı yazılı | ❌ | `docs/code-of-conduct.md` yaz |
| CC1.2 | Sorumluluklar org chart'ta net | ❌ | Tek geliştirici → tek satır |
| CC1.3 | İşe alım taraması | ❌ | İK süreci formal değil |
| CC1.4 | Security training (yıllık) | ❌ | Asgari OWASP top-10 farkındalığı |

### CC2 — Communication and Information

| ID | Kontrol | Durum | Kanıt |
|---|---|---|---|
| CC2.1 | Politikalar dokümante | 🟡 | `docs/` var ama policy formatında değil |
| CC2.2 | Olay raporlama mekanizması | 🟡 | Sentry var, public security@ email yok |
| CC2.3 | Müşteri bildirimi (vendor risk) | ❌ | Müşteri sözleşmesi yok |

### CC3 — Risk Assessment

| ID | Kontrol | Durum | Kanıt |
|---|---|---|---|
| CC3.1 | Yıllık risk değerlendirmesi | 🟡 | `KALITE-DEGERLENDIRME.md` ilk adım |
| CC3.2 | Threat model | ❌ | STRIDE per-feature gerek |
| CC3.3 | Tedarikçi risk değerlendirmesi | ❌ | Vendor list (Sentry, Stripe, AWS) → SOC 2 raporları al |

### CC4 — Monitoring Activities

| ID | Kontrol | Durum | Kanıt |
|---|---|---|---|
| CC4.1 | Sürekli izleme (logging, alerting) | ✅ | Sentry + npm audit + Dependabot |
| CC4.2 | İç denetim | ❌ | Quarterly internal review |
| CC4.3 | Bulgular giderme süreci | 🟡 | GitHub issue ile takip |

### CC5 — Control Activities

| ID | Kontrol | Durum | Kanıt |
|---|---|---|---|
| CC5.1 | Logical access controls | ✅ | JWT + role guard + tenant isolation |
| CC5.2 | Change management | ✅ | PR + review + branch protection |
| CC5.3 | Segregation of duties | 🟡 | Solo geliştiriciyse N/A; ekiplenince zorunlu |

### CC6 — Logical and Physical Access

| ID | Kontrol | Durum | Kanıt |
|---|---|---|---|
| CC6.1 | Authentication (MFA) | 🟡 | 2FA iskeleti var, prod'a girmedi |
| CC6.2 | Access provisioning/deprovisioning | ❌ | Çalışan ayrılışında otomatik revoke yok |
| CC6.3 | Privileged access review | ❌ | Quarterly admin user review |
| CC6.6 | Logging of access (audit log) | 🟡 | AuditLog tablosu var, kapsam genişletilmeli |
| CC6.7 | Cryptographic protection | ✅ | TLS, JWT, bcrypt, APP_ENCRYPTION_KEY |
| CC6.8 | Endpoint protection | ❌ | Çalışan laptop MDM yok (solo ise N/A) |

### CC7 — System Operations

| ID | Kontrol | Durum | Kanıt |
|---|---|---|---|
| CC7.1 | Vulnerability scanning | ✅ | npm audit + Dependabot |
| CC7.2 | Penetration testing | ❌ | Yıllık external pen-test gerekir |
| CC7.3 | Incident response plan | ❌ | `docs/runbooks/` başlangıç |
| CC7.4 | Disaster recovery | 🟡 | Backup scheduler var, restore drill yok |
| CC7.5 | Capacity management | ❌ | HPA Helm chart'ta var, kapasite forecast yok |

### CC8 — Change Management

| ID | Kontrol | Durum | Kanıt |
|---|---|---|---|
| CC8.1 | Change request approval | ✅ | PR review zorunlu |
| CC8.2 | Test before deploy | ✅ | CI pipeline |
| CC8.3 | Rollback procedure | 🟡 | Helm `--atomic` var, dokümante değil |

### CC9 — Risk Mitigation

| ID | Kontrol | Durum | Kanıt |
|---|---|---|---|
| CC9.1 | Risk identification | 🟡 | KALITE-DEGERLENDIRME baseline |
| CC9.2 | Vendor management | ❌ | Vendor SOC 2 raporları toplama |

### A1 — Availability

| ID | Kontrol | Durum | Kanıt |
|---|---|---|---|
| A1.1 | Availability SLO tanımı | ❌ | observability skill önerisi (%99.9) |
| A1.2 | Performance monitoring | ✅ | Sentry + Bundle analyzer |
| A1.3 | Backup ve restore | 🟡 | Backup var, periyodik restore drill yok |
| A1.4 | Capacity planning | ❌ | Trend analizi + alarm |

### C1 — Confidentiality

| ID | Kontrol | Durum | Kanıt |
|---|---|---|---|
| C1.1 | Veri sınıflandırma | ❌ | PII / sensitive / public classes |
| C1.2 | Encryption at rest | 🟡 | RDS encryption default, APP_ENCRYPTION_KEY için 2FA |
| C1.3 | Encryption in transit | ✅ | TLS 1.2+ |
| C1.4 | Data retention policy | ❌ | Audit log retention tier'a bağlı |
| C1.5 | Secure disposal | ❌ | Backup retention + S3 lifecycle |

### P (Privacy) — KVKK overlap

| ID | Kontrol | Durum |
|---|---|---|
| P1.1 | Consent yönetimi | 🟡 ConsentBanner eklendi |
| P2.1 | Veri ihracı (DSR) | ❌ Use case yazılacak |
| P3.1 | Veri silme | ❌ Anonymize + retention |
| P4.1 | Üçüncü taraf paylaşımı şeffaflığı | ❌ Privacy policy genişlet |
| P5.1 | Ihlal bildirimi (72h) | ❌ Süreç yazılı değil |

## Eksiklere göre 90 günlük plan

### Ay 1 — Politika ve dokümantasyon

- [ ] Information Security Policy (`docs/policies/infosec.md`)
- [ ] Access Control Policy
- [ ] Incident Response Plan + 3 runbook (DB down, breach, payment fail)
- [ ] Vendor list + SOC 2 reports collection
- [ ] Code of Conduct
- [ ] Data classification (PII / sensitive / public)
- [ ] Privacy policy genişlet (DSR akışı, retention süreleri)

### Ay 2 — Teknik kontroller

- [ ] 2FA prod'da aktif (ADMIN + EDUCATOR zorunlu)
- [ ] Audit log derinleştirme (before/after, IP)
- [ ] Backup restore drill (haftalık otomatik)
- [ ] Secret rotation (90g policy)
- [ ] Penetration test (external firma)
- [ ] Vulnerability scan (Trivy container scan)
- [ ] Endpoint MDM (CIS Benchmark) — solo ise N/A

### Ay 3 — Süreç ve denetim

- [ ] Quarterly access review otomasyonu
- [ ] Risk register `docs/risks/register.md`
- [ ] Internal audit (KALITE-DEGERLENDIRME revize)
- [ ] Vanta / Drata kurulum (kontrol kanıt otomasyonu)
- [ ] Training: ekip için OWASP + KVKK
- [ ] Type I gözlem periyodu başlat (6 ay sonra Type II)

## Otomasyon platformları

| Platform | Yıllık $ | Sınav Salonu uygunluğu |
|---|---|---|
| **Vanta** | $10–25k | Tam — sürekli izleme + vendor mgmt |
| **Drata** | $7–20k | Aynı segment, biraz daha esnek pricing |
| **Secureframe** | $15–30k | Enterprise odaklı |
| **Sprinto** | $5–15k | Startup-friendly |

Manuel hazırlık + Vanta = ~9 ay → audit raporu.

## Tahmini maliyet

| Kalem | Tutar |
|---|---|
| Vanta/Drata yıllık | $8k–15k |
| External pen-test | $5k–15k |
| Auditor (CPA firma) | $15k–40k |
| Internal hazırlık (saat × kişi) | 300–600 saat |
| **Toplam ilk yıl** | **$30k–70k** |

Subsequent yıllar audit + Vanta sürekliliği için ~$25k.

## ROI

- Enterprise müşteri kazanımı (RFP'lerde SOC 2 zorunlu)
- Sigorta primi indirimi (cyber insurance)
- Yatırımcı due diligence kolaylığı
- KVKK ile %80 örtüşme → çift fayda

## İlgili

- `docs/compliance/iso27001-controls.md`
- `docs/proposed-claude/skills/security-hardening/SKILL.md`
- KALITE-DEGERLENDIRME §7 (Güvenlik)
