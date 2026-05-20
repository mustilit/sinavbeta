# ADR-0004: JWT stateless auth + role/permission guard

## Statü
Accepted

## Bağlam

Web (Vite SPA) + gelecekte mobile app + 3rd party SDK kullanıcılar için kimlik doğrulama. İki temel yaklaşım:

1. **Session cookie (server-state):** Klasik `connect.sid` benzeri. Server-state, CSRF koruması gerekir.
2. **JWT (stateless):** Token client'ta, server doğrular. Stateless ölçek dostu.

## Karar

JWT (HS256, `JWT_SECRET` ile imzalı). `Authorization: Bearer <token>` header'ı ile her istekte taşınır.

### Token tipi

- **Access token:** 7 gün TTL (`JWT_EXPIRES_IN=604800`). Stateless, server'da blacklist YOK (sade implementation).
- **Refresh token:** **YOK (henüz)** — access TTL kısaldığında eklenecek.

### Guard hiyerarşisi

```
JwtAuthGuard (global)
   ↓ payload extract
RolesGuard (global)
   ↓ @Roles() metadata kontrolü
WorkerPermissionsGuard (opsiyonel)
   ↓ @WorkerPermissions() — fine-grained
```

`@Public()` decorator: rota guard'ları atlatır (login, register, public listings).

### Payload şekli

```json
{
  "sub": "user-uuid",
  "email": "...",
  "role": "CANDIDATE",
  "tenantId": "...",
  "iat": ...,
  "exp": ...
}
```

PII minimum: TC, telefon, adres token'a girmez.

## Sonuçlar

**Olumlu**

- Server-state yok → horizontal scale kolay.
- CSRF doğal olarak yok (cookie değil header).
- Mobile/SDK için aynı mekanizma çalışır.

**Olumsuz / takas**

- **Logout** server-side anlamsız (token TTL'i bekler). Acil revoke için Redis blacklist gerekir.
- Token revoke (kullanıcı suspend) anlık değil — gecikme TTL'e bağlı.
- Token boyutu cookie'den büyük → her istekte birkaç KB ek bandwidth.
- `localStorage`'da tutmak XSS riskini artırır (alternatif: `httpOnly` cookie + token, ama o zaman CSRF geri gelir).

## Alternatifler

- **Session cookie + Redis store:** Anlık revoke avantajı, ama CSRF + cross-domain (mobile) zor.
- **JWT + Refresh + Blacklist (Redis):** Sonraki adım — security-hardening önerisi.
- **OAuth2 + OIDC** (Auth0, Cognito): Maliyet + kontrol kaybı. Sosyal login açılınca hybrid mantıklı.

## Eksiklikler & Önerilen iyileştirmeler

(Bunlar KALITE-DEGERLENDIRME §7'de var)

1. **Refresh token + rotation:** Access TTL 15 dk + refresh 30 gün.
2. **Token blacklist (logout, suspend):** Redis `revoked:<jti>` set, TTL access TTL kadar.
3. **2FA (TOTP):** Educator + Admin için zorunlu (bkz. ADR-XXXX 2FA — yazılacak).
4. **`httpOnly` cookie + JWT hybrid:** XSS hafifletme.

## Uygulama notları

- `JwtService` → `apps/backend/src/infrastructure/services/JwtService.ts`
- Frontend `dalClient.js` → her istek `Authorization` header'ı.
- `JWT_SECRET` production'da en az 32 char + default değer YASAK (env.ts fail-fast).
- Login bruteforce guard IP + email bazlı sayaç (Redis).
- Sentry beforeSend `authorization` header temizler.

## Tarih

Q4 2025 — JWT auth ilk implementasyon.
Q2 2026 — refresh token + blacklist roadmap'e eklendi.

## İlgili

- ADR-0003 (Multi-tenant — tenantId payload'da)
- Skill: `security-hardening`
