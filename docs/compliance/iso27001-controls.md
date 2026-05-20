# ISO/IEC 27001 — Bilgi Güvenliği Yönetim Sistemi (BGYS) Kontrol Eşlemesi

ISO 27001:2022 standardı 93 kontrolün (Annex A) bir alt kümesini gerektirir. Bu doküman Sınav Salonu için kontrol bazında durum + roadmap.

## ISO 27001 vs SOC 2 farkı

| | ISO 27001 | SOC 2 |
|---|---|---|
| Coğrafya | Global, AB tercihli | ABD tercihli |
| Yapı | Sürekli iyileştirme (Plan-Do-Check-Act) | Belirli period kontrol etkinliği |
| Çıktı | Sertifika | Audit raporu (Type I / II) |
| Süreç | İlk: 12–18 ay; her 3 yılda recertification | İlk: 9–15 ay; her yıl yeni rapor |
| Maliyet | $30k–80k (ilk) | $30k–70k (ilk) |
| Overlap | %60 kontrol örtüşür → çift sertifikasyon mantıklı |

Sınav Salonu için: KVKK + AB pazarı hedefi varsa ISO 27001 öncelik. ABD enterprise için SOC 2.

## Annex A — Kontrol grupları (özet)

### A.5 — Organizational Controls (37 kontrol)

| ID | Kontrol | Durum | Aksiyon |
|---|---|---|---|
| A.5.1 | Information security policies | ❌ | `docs/policies/infosec.md` yaz |
| A.5.2 | Roles and responsibilities | ❌ | Org chart + RACI |
| A.5.3 | Segregation of duties | 🟡 | Solo geliştirici için N/A |
| A.5.7 | Threat intelligence | ❌ | RSS feed: NVD, GitHub Advisories |
| A.5.8 | Information security in project management | 🟡 | KALITE-DEGERLENDIRME baseline |
| A.5.10 | Acceptable use of information assets | ❌ | Çalışan policy |
| A.5.12 | Classification of information | ❌ | PII / sensitive / public schema |
| A.5.14 | Information transfer | 🟡 | TLS var, formal policy yok |
| A.5.15 | Access control | ✅ | JWT + role + tenant |
| A.5.17 | Authentication information | 🟡 | 2FA iskeleti |
| A.5.19 | Information security in supplier relationships | ❌ | Vendor list + DPA |
| A.5.23 | Cloud services | 🟡 | AWS/GCP SOC 2 raporları al |
| A.5.24 | Information security incident management | 🟡 | Runbook'lar başladı |
| A.5.27 | Learning from information security incidents | ❌ | Postmortem template |
| A.5.30 | ICT readiness for business continuity | 🟡 | Backup var, BCP eksik |
| A.5.34 | Privacy and protection of PII | 🟡 | KVKK altyapı kısmi |

### A.6 — People Controls (8 kontrol)

| ID | Kontrol | Durum |
|---|---|---|
| A.6.1 | Screening (taraması) | ❌ |
| A.6.2 | Terms and conditions of employment | ❌ |
| A.6.3 | Awareness training | ❌ — OWASP top-10 + KVKK quarterly |
| A.6.4 | Disciplinary process | ❌ |
| A.6.5 | Responsibilities after termination | ❌ |
| A.6.6 | Confidentiality / NDA | ❌ |
| A.6.7 | Remote work | ❌ — VPN, MDM policy |
| A.6.8 | Information security event reporting | 🟡 — security@ email |

### A.7 — Physical Controls (14 kontrol)

Çoğu cloud-only altyapıda N/A (data center fiziksel kontroller AWS/GCP'ye delegated).

- A.7.1–A.7.14: AWS SOC 2 raporu ile karşılanır → vendor management altında dokümante et.

### A.8 — Technological Controls (34 kontrol)

| ID | Kontrol | Durum | Aksiyon |
|---|---|---|---|
| A.8.1 | User endpoint devices | ❌ | MDM (JAMF / Intune) — ekiplenince |
| A.8.2 | Privileged access rights | ❌ | sudo log + quarterly review |
| A.8.3 | Information access restriction | ✅ | tenant + role |
| A.8.5 | Secure authentication | 🟡 | 2FA pending |
| A.8.6 | Capacity management | ❌ | HPA var, trend yok |
| A.8.7 | Protection against malware | 🟡 | npm audit + ClamAV (file upload) |
| A.8.8 | Management of technical vulnerabilities | ✅ | Dependabot + Trivy roadmap |
| A.8.9 | Configuration management | ✅ | IaC (Helm, Terraform) |
| A.8.10 | Information deletion | ❌ | KVKK silme akışı + backup expiry |
| A.8.11 | Data masking | ❌ | Sentry PII filter var, log redaction yok |
| A.8.12 | Data leakage prevention | ❌ | DLP yok |
| A.8.13 | Information backup | ✅ | pg_dump scheduler |
| A.8.14 | Redundancy | 🟡 | Multi-AZ DB önerisi |
| A.8.15 | Logging | ✅ | Pino + Sentry |
| A.8.16 | Monitoring activities | 🟡 | observability skill önerisi |
| A.8.17 | Clock synchronization | ✅ | NTP container default |
| A.8.18 | Use of privileged utility programs | 🟡 | DB admin tool log |
| A.8.19 | Installation of software | 🟡 | npm + supply chain |
| A.8.20 | Networks security | ✅ | VPC + NetworkPolicy (Helm) |
| A.8.21 | Security of network services | ✅ | TLS + WAF (Cloudflare) |
| A.8.22 | Segregation of networks | 🟡 | k8s namespace izolasyon önerisi |
| A.8.23 | Web filtering | N/A | Outbound yok |
| A.8.24 | Cryptography | ✅ | bcrypt + AES-GCM + TLS |
| A.8.25 | Secure development life cycle | 🟡 | CLAUDE.md disipline var, SDLC formal değil |
| A.8.26 | Application security requirements | 🟡 | KALITE-DEGERLENDIRME baseline |
| A.8.27 | Secure system architecture | ✅ | Clean Architecture + ADR'lar |
| A.8.28 | Secure coding | 🟡 | ESLint + code-reviewer agent |
| A.8.29 | Security testing | 🟡 | Permission matrix + a11y test |
| A.8.30 | Outsourced development | N/A |
| A.8.31 | Separation of development, test and production environments | ✅ | Staging compose + prod env |
| A.8.32 | Change management | ✅ | PR + branch protection |
| A.8.33 | Test information | ❌ | Test data anonymization (PII fixture'ları) |
| A.8.34 | Protection of information systems during audit testing | ✅ |

## ISMS dokümanları (eklenmesi gerekenler)

- `docs/policies/infosec.md` — kapsayıcı politika
- `docs/policies/access-control.md`
- `docs/policies/incident-response.md`
- `docs/policies/data-retention.md`
- `docs/policies/cryptography.md`
- `docs/policies/supplier-management.md`
- `docs/policies/business-continuity.md`
- `docs/risks/register.md`
- `docs/risks/treatment-plan.md`
- `docs/asset-register.md`
- `docs/soa.md` — Statement of Applicability (Annex A için)

## 18 aylık plan

### 0–3. ay: Politika + risk

- Information Security Policy
- Risk assessment + treatment plan
- Vendor list + DPA + SOC 2 raporları
- Asset register

### 3–6. ay: Teknik

- 2FA prod
- Audit log derinleştirme
- Backup restore drill
- Penetration test
- MDM (eklenmişse)

### 6–9. ay: İç denetim + iyileştirme

- Internal audit
- Bulgu giderme
- Training (KVKK + OWASP)

### 9–12. ay: Stage 1 audit

- Doküman incelemesi (auditor)
- Eksiklik raporu
- Düzeltme

### 12–18. ay: Stage 2 audit + sertifika

- Operating effectiveness (auditor 3 ay gözlemler)
- Sertifika düzenlenir

## Surveillance audit

Sertifika sonrası her yıl auditor mini-denetim yapar (~3 gün). 3 yılda bir tam recertification.

## İlgili

- `docs/compliance/soc2-readiness.md`
- KVKK uyum: `docs/proposed-claude/skills/security-hardening/SKILL.md` §9 GDPR/KVKK
- `docs/risks/register.md` (yazılacak)
