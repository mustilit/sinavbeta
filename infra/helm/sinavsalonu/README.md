# Sınav Salonu — Helm Chart

KALITE-DEGERLENDIRME §6 (Taşınabilirlik) önerisi. Kubernetes deploy için Helm chart iskeleti.

## İçerik

```
infra/helm/sinavsalonu/
├── Chart.yaml
├── values.yaml                       # Default (production sentinel'leri)
├── templates/
│   ├── _helpers.tpl
│   ├── backend-deployment.yaml       # Deployment + Service + PDB + HPA
│   ├── worker-deployment.yaml        # BullMQ worker (terminationGrace 60s)
│   ├── frontend-deployment.yaml      # Nginx + SPA + HPA
│   ├── migration-job.yaml            # Helm hook: pre-install,pre-upgrade
│   ├── configmap.yaml                # Non-sensitive env
│   ├── secret.yaml                   # Sensitive env (yalnızca External Secrets ile)
│   └── ingress.yaml
└── README.md (bu dosya)
```

## İlk kurulum

```bash
# 1) Chart'ı lint et
helm lint infra/helm/sinavsalonu

# 2) Render edip plan'ı görmek (dry-run)
helm template sinavsalonu infra/helm/sinavsalonu \
  -f infra/helm/values.staging.yaml \
  > /tmp/render.yaml

# 3) Kuru deneme (dry-run, server tarafı)
helm install sinavsalonu infra/helm/sinavsalonu \
  -f infra/helm/values.staging.yaml \
  --dry-run --debug

# 4) Gerçek kurulum
helm install sinavsalonu infra/helm/sinavsalonu \
  -f infra/helm/values.staging.yaml \
  --namespace sinavsalonu \
  --create-namespace
```

## Yeni release

```bash
helm upgrade sinavsalonu infra/helm/sinavsalonu \
  -f infra/helm/values.production.yaml \
  --namespace sinavsalonu \
  --set backend.image.tag=$(git rev-parse HEAD) \
  --set frontend.image.tag=$(git rev-parse HEAD) \
  --set worker.image.tag=$(git rev-parse HEAD) \
  --atomic --timeout 5m
```

`--atomic`: rollout fail olursa otomatik rollback.

## Migration sırası

Helm hook'u (`pre-upgrade`) sayesinde sıra:

1. `migrate` Job çalışır → Prisma `migrate deploy` (yeni şema)
2. Job başarılı olursa Deployment rollout başlar (yeni image)
3. RollingUpdate `maxSurge: 1, maxUnavailable: 0` → zero downtime

> Eğer migration `DROP COLUMN` veya `NOT NULL` ekliyorsa **iki release** kuralı uygula:
> 1. Release N: Sadece kolon ekle (nullable), backfill et.
> 2. Release N+1: NOT NULL + constraint sıkıştır.
> `release-engineering` skill — migration safety check.

## Secrets yönetimi

Bu chart `Secret`'ları kaynak repoya commit etmez. Üretimde **External Secrets Operator** önerilir:

```yaml
# infra/helm/external-secrets/backend.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: sinavsalonu-backend-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: sinavsalonu-backend-backend-secrets   # chart'ın beklediği isim
  data:
    - secretKey: DATABASE_URL
      remoteRef: { key: prod/sinavsalonu/db-url }
    - secretKey: JWT_SECRET
      remoteRef: { key: prod/sinavsalonu/jwt-secret }
    - secretKey: APP_ENCRYPTION_KEY
      remoteRef: { key: prod/sinavsalonu/app-enc-key }
    - secretKey: STRIPE_WEBHOOK_SECRET
      remoteRef: { key: prod/sinavsalonu/stripe-wh }
    - secretKey: SENTRY_DSN
      remoteRef: { key: prod/sinavsalonu/sentry-dsn }
```

Alternatif: Vault + Vault Agent Injector.

## values.staging.yaml örnek (commit edilebilir)

```yaml
global:
  environment: staging
  imageRegistry: ghcr.io
backend:
  replicaCount: 1
  resources:
    requests: { cpu: 100m, memory: 256Mi }
    limits:   { cpu: 500m, memory: 512Mi }
worker:
  enabled: true
  replicaCount: 1
frontend:
  replicaCount: 1
ingress:
  enabled: true
  hosts:
    - host: staging.sinavsalonu.example
      paths:
        - { path: /api, pathType: Prefix, service: backend }
        - { path: /,    pathType: Prefix, service: frontend }
  tls:
    - { secretName: staging-tls, hosts: [staging.sinavsalonu.example] }
hpa:
  backend:  { enabled: false }
  frontend: { enabled: false }
```

## values.production.yaml (commit ETME — secret manager kullan)

Sadece non-sensitive override'lar repo'da; sensitive değerler External Secrets üzerinden.

## Eklenebilir (yol haritası)

- `templates/networkpolicy.yaml` — pod-to-pod kısıtlama (ör. worker → DB sadece)
- `templates/servicemonitor.yaml` — Prometheus operator entegrasyonu (`monitoring.serviceMonitor.enabled`)
- `templates/cronjob-backup.yaml` — Mevcut backup scheduler'ı CronJob olarak (NestJS cron yerine)
- `templates/poddisruptionbudget.yaml` — worker için ayrı PDB
- `tests/connection.yaml` — `helm test` için pod (`curl /health`)
- `crds/` — CRD bağımlılıkları varsa (örn. cert-manager)
- `templates/role.yaml` + `templates/rolebinding.yaml` — pod'ların okuyabileceği k8s API kapsamı

## Doğrulama

```bash
helm lint infra/helm/sinavsalonu                                  # sözdizimi
helm template sinavsalonu infra/helm/sinavsalonu | kubeval        # k8s schema (kubeval/kubeconform)
helm template sinavsalonu infra/helm/sinavsalonu | kube-score score -   # best-practice
```

## İlgili

- ADR-0001, ADR-0003
- Skill: `observability` (graceful shutdown), `release-engineering` (image promotion)
