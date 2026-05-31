---
name: security-hardening
description: 2FA/TOTP, audit log, CSRF, XSS koruması (DOMPurify), file upload güvenliği (magic byte + virus scan), permission matrix testi, OWASP ASVS Level 2 hazırlığı, GDPR/KVKK uyum akışları. Kimlik doğrulama akışı, yetki kontrolü, kullanıcı içeriği render eden component, dosya yükleme endpoint'i veya admin işlemi eklerken referans alın.
---

# Security Hardening — Sınav Salonu

KALITE-DEGERLENDIRME §7 "Güvenlik 8/10"'u 9/10'a taşıyacak somut kontroller. JWT + Helmet + rate limit + tenant izolasyonu zaten var; bu skill üzerine bina kuruyor.

## 1. 2FA / TOTP

Educator ve Admin için **zorunlu** ikinci faktör. Candidate için opsiyonel.

### Şema

```prisma
model User {
  // ...
  twoFactorEnabled   Boolean   @default(false)
  twoFactorSecret    String?   // encrypted at rest (KMS veya app-level AES-GCM)
  twoFactorRecovery  String[]  // bcrypted 10 recovery code
  twoFactorEnabledAt DateTime?
}
```

### Enable akışı

```ts
// SetupTwoFactorUseCase
import { authenticator } from 'otplib';

const secret = authenticator.generateSecret();
const otpauth = authenticator.keyuri(user.email, 'Sinav Salonu', secret);
// QR code → frontend (qrcode kütüphanesi)
// Kullanıcı kodu girerse:
const valid = authenticator.verify({ token: userInput, secret });
if (!valid) throw new BadRequestException('Geçersiz kod');

const recovery = Array.from({ length: 10 }, () => randomBytes(8).toString('hex'));
const hashed = await Promise.all(recovery.map(c => bcrypt.hash(c, 10)));

await prisma.user.update({
  where: { id: user.id },
  data: {
    twoFactorEnabled: true,
    twoFactorSecret: encrypt(secret), // AES-GCM with app key
    twoFactorRecovery: hashed,
    twoFactorEnabledAt: new Date(),
  },
});

return { recoveryCodes: recovery }; // tek sefer göster
```

### Login akışı

1. `POST /auth/login` → email + password → eğer `twoFactorEnabled` → kısa-ömürlü `pendingMfaToken` (JWT, 5dk) döner.
2. `POST /auth/mfa/verify` → `pendingMfaToken` + `code` → `authenticator.verify` veya recovery code → asıl access + refresh token.

### Role bazlı zorunluluk

```ts
// LoginUseCase sonunda
if (['EDUCATOR', 'ADMIN'].includes(user.role) && !user.twoFactorEnabled) {
  return { mustEnableMfa: true, pendingToken };
}
```

Frontend bu durumda zorunlu setup ekranı gösterir.

## 2. Audit Log

Admin ve sensitive işlemler için ayrı tablo. KVKK ve forensic için zorunlu.

### Şema

```prisma
model AuditLog {
  id           String   @id @default(cuid())
  tenantId     String
  actorId      String?
  actorEmail   String?
  actorRole    String?
  action       String   // 'user.role.change', 'settings.update', 'refund.approve', vs.
  resourceType String   // 'User', 'AdminSettings', 'Purchase'
  resourceId   String?
  before       Json?
  after        Json?
  ip           String?
  userAgent    String?
  createdAt    DateTime @default(now())

  @@index([tenantId, createdAt(sort: Desc)])
  @@index([actorId, createdAt(sort: Desc)])
  @@index([action, createdAt(sort: Desc)])
}
```

### Helper

```ts
// apps/backend/src/infrastructure/audit/AuditLogger.ts
@Injectable()
export class AuditLogger {
  constructor(private prisma: PrismaService) {}
  async log(ctx: AuthContext, entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        actorEmail: ctx.email,
        actorRole: ctx.role,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        before: entry.before ?? null,
        after: entry.after ?? null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
  }
}
```

### Use case'te kullanım

```ts
// UpdateAdminSettingsUseCase
const before = await this.repo.find();
const after = await this.repo.update(input);
await this.audit.log(ctx, {
  action: 'settings.update',
  resourceType: 'AdminSettings',
  resourceId: 'singleton',
  before,
  after,
});
```

### Loglanacak işlemler (min liste)

| Action | Resource | Aktör |
|---|---|---|
| `user.role.change` | User | Admin |
| `user.suspend` | User | Admin |
| `user.delete` | User | Admin/Self |
| `settings.update` | AdminSettings | Admin |
| `refund.approve` / `refund.reject` | Refund | Admin |
| `objection.resolve` | Objection | Admin |
| `discount.create` / `discount.delete` | DiscountCode | Educator |
| `test.publish` / `test.unpublish` | ExamTest | Educator |
| `payout.process` | Payout | Admin |
| `auth.login.success` (Admin/Educator) | User | Self |
| `auth.login.fail` | User | Self (email ile) |
| `auth.mfa.enable` / `disable` | User | Self |
| `backup.run` | BackupLog | System |
| `SUSPICIOUS_RATE_LIMIT` (rate limit / throttle) | Throttler | Self/Anon |
| `DEVICE_QUOTA_EXCEEDED` (cihaz/IP kotası — kapatma saldırısı) | LiveSession | Self/Anon |

> **Abuse / kötüye-kullanım koruması = audit log zorunlu.** Yeni bir oran/kota/anti-bot
> limiti (rate limit, IP/cihaz kotası, kapatma saldırısı koruması, brute-force kilidi vb.)
> eklerken limit tetiklendiğinde **mutlaka** audit log yaz. Bu olaylar `SUSPICIOUS_RATE_LIMIT`
> / `DEVICE_QUOTA_EXCEEDED` gibi ayrı bir `AuditAction` değeri alır ve `admin/dlq` "errors"
> görünümünde (`ERROR_ACTIONS`) izlenir. Loglama **best-effort** olmalı: bir try/catch +
> `.catch(() => {})` ile sarmalanır, audit yazımı başarısız olsa bile asıl reddi/yanıtı
> maskelemez (örnek: `JoinLiveSessionUseCase.logQuotaExceeded`, `http-exception.filter.ts`).
> Metadata'ya forensic alanlar koy: `ip`, ilgili entity id, sayaç/eşik değerleri.

## 3. CSRF Koruması

JWT'yi header (Authorization) ile gönderiyorsan ve cookie kullanmıyorsan CSRF düşük risk. Cookie kullanıyorsan:

### Cookie-based ise

```ts
// SameSite=Lax (varsayılan iyi), kritik state-changing endpoint için:
// `Origin` veya `Referer` header doğrulaması

@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const origin = req.header('origin') ?? req.header('referer');
    if (!origin) throw new ForbiddenException('Origin header eksik');
    const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',');
    if (!allowed.some(a => origin.startsWith(a))) {
      throw new ForbiddenException('Cross-origin reddedildi');
    }
    return true;
  }
}
```

### Header-based ise (mevcut durum büyük olasılıkla)

JWT `Authorization: Bearer <token>` ile gönderiliyor → CSRF doğal olarak yok (browser otomatik göndermez). Ancak:

- `localStorage`'da JWT tutuluyorsa **XSS riski** kritik (aşağıda).
- `httpOnly` cookie + Authorization hybrid önerilir.

## 4. XSS — DOMPurify zorunluluğu

Kullanıcı içerikleri (soru, çözüm, yorum, eğitici bio) ne zaman HTML render ediliyor?

```bash
# Tarama
grep -rn "dangerouslySetInnerHTML" apps/frontend/src/
```

Her bulguda DOMPurify zorunlu:

```jsx
import DOMPurify from 'dompurify';

const safeHtml = useMemo(() => DOMPurify.sanitize(question.solutionText, {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'code', 'pre', 'img'],
  ALLOWED_ATTR: ['src', 'alt', 'href', 'class'],
  ALLOWED_URI_REGEXP: /^(https?|data):/i,
}), [question.solutionText]);

return <div dangerouslySetInnerHTML={{ __html: safeHtml }} />;
```

ESLint kuralı ekle:

```js
// eslint.config.js
'react/no-danger': ['error', {
  customSafeWhitelist: ['DOMPurify.sanitize'],
}],
```

Veya custom rule: `dangerouslySetInnerHTML` kullanımında dosya başında `import DOMPurify` görmek zorunlu.

## 5. SQL Injection / Raw Query Audit

Prisma + parametreli sorgu zaten güvenli. Riskli noktalar:

```bash
grep -rn "\$queryRaw\|\$executeRaw" apps/backend/src/
```

Her sonucu manuel review:

- `Prisma.sql\`SELECT ... WHERE id = ${id}\`` → güvenli (parametre).
- `prisma.$queryRawUnsafe('SELECT ... WHERE id = ' + id)` → **TEHLİKE**, refactor.

## 6. File Upload Güvenliği

Soru içeriği, eğitici avatar, sertifika logosu vs. için:

```ts
// apps/backend/src/nest/security/fileUploadSafety.ts
import { fileTypeFromBuffer } from 'file-type';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function validateUpload(buffer: Buffer, declaredMime: string) {
  if (buffer.length > MAX_SIZE) {
    throw new BadRequestException('Dosya çok büyük');
  }
  // Magic byte ile gerçek MIME
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw new BadRequestException('Dosya türü desteklenmiyor');
  }
  if (declaredMime !== detected.mime) {
    throw new BadRequestException('MIME uyuşmazlığı');
  }
  return detected;
}
```

ClamAV opsiyonel (mail attachment, PDF download'lar için):

```ts
// clamav-stream üzerinden tarama
const stream = clamav.scanStream(buffer);
if (stream.isInfected) throw new BadRequestException('Virüs tespit edildi');
```

S3 pre-signed URL kullanılıyorsa direkt browser → S3, validation S3'e yüklendikten sonra Lambda/worker ile.

## 7. Permission Matrix Testi

Her endpoint × her rol için integration test. Yetki sızıntısı (`CANDIDATE` `educator/discount` endpoint'ine erişiyor mu?) bug'ı ölümcül.

```ts
// apps/backend/tests/permission-matrix.test.ts
const matrix: PermissionCase[] = [
  { method: 'POST', path: '/educator/discount-codes', role: 'CANDIDATE', expected: 403 },
  { method: 'POST', path: '/educator/discount-codes', role: 'EDUCATOR', expected: 201 },
  { method: 'POST', path: '/educator/discount-codes', role: 'ADMIN',    expected: 201 },
  { method: 'POST', path: '/admin/settings',          role: 'EDUCATOR', expected: 403 },
  // ... 45 controller × 4 rol = ~180 case
];

describe.each(matrix)('$method $path as $role', (c) => {
  it(`returns ${c.expected}`, async () => {
    const token = await issueTokenFor(c.role);
    const res = await request(app.getHttpServer())
      [c.method.toLowerCase()](c.path)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(c.expected);
  });
});
```

Liste otomasyonu: kullan reflection veya `@Roles()` decorator metadata'sından beklenen rol'ü çıkar.

## 8. Secret Management

`.env` direkt repo dışı. Üretimde:

- **AWS Secrets Manager** veya **HashiCorp Vault** entegrasyonu (NestJS `@nestjs/config` + custom loader).
- Rotasyon politikası: JWT secret, DB password, Stripe webhook secret → 90 günde bir.
- `git-secrets` veya `gitleaks` pre-commit hook.

```bash
# Husky pre-commit ekle
gitleaks protect --staged --redact
```

## 9. GDPR / KVKK

KVKK için 3 zorunlu akış:

### a) Verilerimi sil

```ts
// DeleteMyAccountUseCase
async execute(userId: string, password: string) {
  await this.verifyPassword(userId, password);
  await this.prisma.$transaction(async (tx) => {
    // Soft delete + PII anonymize
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@anon.local`,
        name: 'Silinmiş Kullanıcı',
        avatarUrl: null,
        phone: null,
        deletedAt: new Date(),
      },
    });
    // İlişkili PII'yi temizle (yorum, bio, vs.)
    await tx.review.updateMany({ where: { userId }, data: { authorName: null } });
    // Audit log
    await tx.auditLog.create({ data: { action: 'user.delete', actorId: userId, resourceType: 'User', resourceId: userId } });
  });
}
```

**Önemli:** Satın alma, fatura kayıtları **hukuki saklama** süresi (TR'de 10 yıl) nedeniyle silinmez — sadece PII anonymize.

### b) Veri ihracı

```ts
// ExportMyDataUseCase
// Tüm tablolarda userId match olan kayıtları JSON dump → email ile gönder.
```

### c) Açık rıza kayıtları

```prisma
model ConsentLog {
  id        String   @id @default(cuid())
  userId    String
  topic     String   // 'marketing', 'analytics', 'cookies'
  granted   Boolean
  version   String   // policy versiyonu (ör. '2026-01-01')
  ip        String?
  createdAt DateTime @default(now())

  @@index([userId, topic, createdAt(sort: Desc)])
}
```

## 10. Dependency Scanning

GitHub Advanced Security açılırsa Dependabot Security Alerts otomatik. Self-hosted Snyk veya:

```yaml
# .github/workflows/security-scan.yml
- name: Trivy filesystem scan
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: 'fs'
    severity: 'HIGH,CRITICAL'
    exit-code: '1'

- name: Trivy container scan
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: 'sinavsalonu/backend:${{ github.sha }}'
    severity: 'HIGH,CRITICAL'
    exit-code: '1'
```

## 11. OWASP ASVS Level 2 Self-Assessment

Pen-test öncesi içsel kontrol. `docs/security/owasp-asvs-level-2.md` checklist'i:

- V1 Architecture (threat model, secure SDLC)
- V2 Authentication (password policy, MFA, session)
- V3 Session Management (JWT, idle timeout)
- V4 Access Control (rol matrix testi)
- V5 Validation (input sanitization, DTO)
- V6 Cryptography (TLS 1.2+, key management)
- V7 Error Handling (PII leak yok)
- V8 Data Protection (at-rest encryption)
- V9 Communication (TLS)
- V10 Malicious Code (dep scan)
- V11 Business Logic (rate limit, abuse)
- V12 Files (upload, download)
- V13 API (CORS, REST patterns)
- V14 Configuration (secret rotation, headers)

## Checklist (her yeni endpoint / sayfa)

- [ ] Yetki: `@Roles()` + permission matrix test'inde case var mı?
- [ ] Input: DTO + class-validator zorunlu validator mı?
- [ ] Kullanıcı içeriği render: DOMPurify ile mi?
- [ ] State değiştiriyorsa: idempotency key mi? audit log mu?
- [ ] Dosya yükleme: magic byte + size + virus scan mi?
- [ ] PII döndürüyor mu: tenant izolasyonu + log filtresi?
- [ ] Hata mesajı: PII leak yok mu ("kullanıcı yok" vs "şifre yanlış" ayrımı timing/wording attack)?

İlgili skill'ler: `idempotency`, `observability` (logger PII), agent: `security-auditor`.
