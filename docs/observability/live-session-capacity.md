# Canlı Oturum Kapasitesi — Yük Testi & Optimizasyonlar

> Son güncelleme: 2026-06-12. Ölçümler staging kutusunda (2 vCPU, backend + postgres +
> redis + worker'lar + frontend + yük üreticisi **aynı makinede**) alınmıştır.

## Özet

Canlı oturumun sıcak yolu (`GET /live-sessions/:id/state`, katılımcı polling'i) için
3 öneri uygulandı:

| # | Öneri | Durum | Etki |
|---|---|---|---|
| 2 | `/state` ağır sorgusunu Redis'te cache'le (1s TTL) | ✅ Uygulandı | Postgres yükü darboğaz olmaktan çıktı (~%15-20) |
| 3 | Katılımcı poll aralığı 2s → 3s | ✅ Uygulandı | Aynı sunucu kapasitesinde ~%50 daha fazla eşzamanlı kullanıcı |
| 1 | Yatay ölçekleme (N backend replikası) | ✅ Lever doğrulandı, prod'da uygulanmalı | Node tek-thread; throughput ~N çekirdekle lineer artar |

## Darboğaz teşhisi

1000 misafir katılımcı doğrudan DB'ye seed edilip `/state` artan eşzamanlılıkta basıldı.

**Cache'ten önce:** Postgres ve Node CPU birlikte darboğazdı; tavan ~150-200 rps.

**Cache'ten sonra (1 replika):**

```
[C=50]  rps=163  p50=282  p95=435  p99=452 ms
[C=100] rps=209  p50=475  p95=556  p99=585 ms
[C=200] rps=224  p50=862  p95=1120 p99=1200 ms
[C=300] rps=240  p50=1234 p95=1370 p99=1388 ms
```

CPU örneği: **backend ~%110 (1 çekirdek dolu), postgres ~%15-20, redis ~%6.**
→ Postgres cache sayesinde rahatladı; **darboğaz artık tek Node process'inin CPU'su.**
Node tek-thread olduğu için tek replika bir çekirdekten fazlasını kullanamaz.

**2 replika (nginx round-robin):** Her iki replika da ~%60 CPU aldı — nginx (aşağıdaki
resolver yapısı sayesinde) trafiği gerçekten dağıttı. Ancak **2 vCPU'lu kutuda yük
üreticisi de bir çekirdek tükettiği için** throughput çarpımı ölçülemedi (client + 2
server + postgres aynı 2 çekirdeği paylaşıyor). Lever'ın çalıştığı kanıtlandı; gerçek
kazanç, ayrı/yeterli çekirdekli prod host'unda görünür.

## Kapasite matematiği

Ölçülen sürdürülebilir tavan ≈ **220 rps** (bu kutuda, client-contended; gerçek sunucu
tavanı daha yüksek). Eşzamanlı kullanıcı kapasitesi = `rps × pollAralığı`:

| Poll aralığı | Maks. eşzamanlı katılımcı (≈) |
|---|---|
| 2s (eski) | 220 × 2 ≈ **440** |
| 3s (yeni, #3) | 220 × 3 ≈ **660** |

> #3 tek başına aynı donanımda kapasiteyi ~440 → ~660 kullanıcıya çıkardı.
> 1000+ eşzamanlı katılımcı için **yatay ölçekleme (#1) zorunlu.**

## #1 — Yatay ölçekleme nasıl uygulanır

nginx zaten replikalar arası round-robin'e hazır. `infra/nginx/default.conf.template`:

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;     # Docker embedded DNS
set $backend_origin "http://backend:3000";    # değişkenli → her istekte yeniden çöz
location /api/ { proxy_pass $backend_origin; } # backend → tüm replika IP'lerine dağılır
```

Backend servisinde `container_name` / sabit `ports` yok → **scale edilebilir.**

### Docker Compose (staging/prod)

```bash
# Replikayı çekirdek sayısına göre seç (DB/redis/worker'lara da çekirdek bırak)
docker compose --env-file ../../.env \
  -f docker-compose.prod.yml -f docker-compose.staging.yml \
  up -d --scale backend=<N> --no-recreate backend
```

Kalıcı için `docker-compose.prod.yml` backend servisine:

```yaml
deploy:
  replicas: <N>          # önerilen: (vCPU - DB/redis/worker payı), ör. 4-core host → 2-3
```

### Helm / Kubernetes (asıl prod)

`infra/helm/sinavsalonu/values.yaml`:

```yaml
backend:
  replicaCount: <N>      # HPA ile otomatik: CPU %70 hedefli
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 8
    targetCPUUtilizationPercentage: 70
```

Service zaten tüm pod'lara dağıtır; ek nginx upstream gerekmez.

### Önerilen prod boyutlandırması

- **Backend:** çekirdek başına ~1 replika (Node tek-thread). 1000 eşzamanlı katılımcı için
  ayrı host'larda ≥3-4 replika rahat eder (660 user/replika × 3-4 ≈ 2000-2600 kapasite).
- **Postgres:** ayrı instance/host (staging'de paylaşımlı). PgBouncer (`docker-compose.pgbouncer.yml`)
  bağlantı havuzu için.
- **Redis:** paylaşımlı yeterli (cache yükü ~%6).

## Uygulanan kod değişiklikleri

- `GetLiveSessionStateUseCase.ts` — `live:state:session:<id>` Redis cache (1s TTL).
  `isCorrect` ifşası, `myAnswer`, `myResults` **cache'ten SONRA per-request** hesaplanır →
  cache güvenli. `invalidateLiveStateCache(sessionId)` export edilir.
- Eğitici mutasyonları cache'i anında geçersiz kılar (TTL beklemeden):
  `StartLiveSessionUseCase`, `NavigateLiveQuestionUseCase`, `ToggleLiveStatsUseCase`,
  `EndLiveSessionUseCase`.
- `LiveSessionJoin.jsx` — katılımcı `/state` poll aralığı `2000` → `3000` ms.

## Test yöntemi (tekrar koşmak için)

Kotalar (kasıtlı koruma) yük testini bozar; bu yüzden katılımcılar doğrudan DB'ye seed edilir:

- `test-runs/live-loadtest-seed.cjs` — ACTIVE oturum + 3 soru, `maxParticipants=2000`, kod `LOADTS`.
- `test-runs/live-participants-seed.cjs` — N misafir katılımcıyı DB'ye yazar, guestToken'ları JSON'a döker.
- `test-runs/live-state-load.mjs` — artan eşzamanlılıkta `/state` basar; rps + p50/p95/p99 + hata raporlar.

> **Not:** `Origin: http://178.105.231.185` + `X-Client-App` header'ları zorunlu (origin/client guard).
> Misafir IP kotası (`MAX_GUEST_JOINS_PER_IP=50`) ve rate limit (120/60s/XFF) **kasıtlı**
> korumalardır — nginx arkasında join'ler tek upstream IP'den sayıldığı için load testte
> katılımcılar DB'den seed edilir.
