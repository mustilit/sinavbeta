# ADR-0001: Clean Architecture + Use Case katmanı

## Statü
Accepted

## Bağlam

Sınav Salonu marketplace + multi-tenant SaaS. 35 Prisma modeli, 45 controller, 149 use-case. Şu iki risk somut:

1. **Controller'da iş mantığı şişer:** Yetki kontrolü + Prisma sorgusu + format dönüşümü + edge case'ler aynı dosyada → test edilemez, refactor riskli.
2. **Domain mantığı framework'e bağımlı olursa** NestJS upgrade veya alternatif framework geçişi (Fastify, AdonisJS) ölümcül.

## Karar

[Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) prensipleriyle 4 katman:

```
nest/controllers/         ← HTTP arabirim (ince)
   ↓
application/use-cases/    ← Tek sorumluluklu iş mantığı
   ↓
domain/                   ← Repository arayüzleri, tipler (framework yok)
   ↓
infrastructure/           ← Prisma repo, Redis, BullMQ, S3 (framework var)
```

Bağımlılık yönü **dışarıdan içeriye** — `application` `infrastructure`'a IMPORT etmez; `domain/interfaces`'i alır.

### Use Case kuralları

- Tek public `execute(...)` metodu.
- Dependency'ler `constructor` ile injection.
- Yan etki yok (yan etki sadece repo + service'lerden gelir).
- 50–150 satır arası → daha büyükse ya iki parçaya böl ya da service çıkar.

## Sonuçlar

**Olumlu**

- Use case unit test'lerinde DB gerekmez (InMemory repo).
- Controller değişmeden iş kuralı değiştirilebilir.
- Framework değiştirilse `application/` ve `domain/` korunur.

**Olumsuz / takas**

- Boilerplate artar: her endpoint için use case + DTO + controller satırı.
- Junior geliştirici için öğrenme eğrisi.
- DI ile gelen runtime maliyet (ihmal edilebilir).

## Alternatifler

- **Anemic service pattern** (`UserService.purchase(...)`) — Reddedildi: tek service şişer, test izolasyonu zayıf.
- **Vertical slice (feature folder)** — Kabul edilebilirdi; ama Use Case katmanı vertical slice'la uyumlu (her use case bir slice).
- **Hexagonal/Ports & Adapters** — Aynı fikir, isim farkı. Clean Architecture daha bilinir → tercih.

## Uygulama notları

- 17 domain alt klasörü: auth, educator, test, question, attempt, purchase, refund, discount, review, objection, ad, package, live, admin, contract, report, notification.
- `domain/interfaces/*.ts` her tablo için repository arayüzü.
- `infrastructure/repositories/*.Prisma.ts` Prisma implementasyonu, `*.InMemory.ts` test versiyonu.
- Controller içinde Prisma çağrısı yasak (lint ile zorunlu kılınabilir — bkz. dependency-cruiser önerisi).

## Tarih

İlk Q1 2026'da kurulmuş, ADR olarak Q2 2026'da geriye dönük yazıldı.

## İlgili

- Skill: `.claude/skills/nestjs-module/SKILL.md`
- Agent: `.claude/agents/backend-architect.md`
- KALITE-DEGERLENDIRME §5 (Bakım Yapılabilirlik 9/10) — bu mimari yüksek skorun ana nedeni.
