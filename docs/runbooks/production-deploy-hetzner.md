# Production Deploy Runbook — Hetzner VPS/VDS
## Sınav Salonu — İlk Deploy ve Sonraki Akış

> Bu runbook tek geliştirici tarafından, ilk defa canlıya çıkma senaryosuna göre yazıldı. Adımları sırayla takip edin. Her adımın **kontrol** kısmında ne görmeniz gerektiği yazılıdır — görmezseniz devam etmeden çözün.
>
> Tüm `<your-domain.com>`, `<server-ip>`, `<ADMIN_EMAIL>` gibi yer tutucuları gerçek değerlerinizle değiştirin.

---

## 0. Ön hazırlık (lokal makinede, deploy'dan ÖNCE)

Aşağıdakileri bir araya getirin, deploy günü vakit kaybetmeyin:

**Domain.** En az bir alan adı (örn. `sinavsalonu.com`). Türk sağlayıcı (İsimSan, Natro) veya AB sağlayıcı (Namecheap, Porkbun) farketmez. Domain'in DNS ayarlarına erişiminiz olsun.

**Hetzner Cloud hesap.** `https://console.hetzner.cloud` üzerinden kayıt. Ödeme yöntemi (kredi kartı/PayPal) ekleyin. Doğrulama 1-2 saat sürebilir.

**SSH anahtarı.** Henüz yoksa lokal makinenizde üretin:
```powershell
# Windows PowerShell
ssh-keygen -t ed25519 -C "deploy@sinavsalonu" -f $HOME\.ssh\hetzner_sinav
```
Çıkan iki dosyadan `hetzner_sinav.pub` içeriğini panoya alın — Hetzner'a yapıştıracaksınız.

**Bir not defterine yazın (deploy günü kullanacaksınız):**
- Domain: `<your-domain.com>`
- Admin email (Let's Encrypt için): `<admin@example.com>`
- Yeni Postgres şifresi (32+ karakter, üretmek için lokalde: `openssl rand -base64 32`)
- JWT_SECRET (32+ hex karakter: `openssl rand -hex 32`)
- EMAIL_SECRETS_KEY (32 byte hex, ileride mail modülü için: `openssl rand -hex 32`)
- Sentry DSN (opsiyonel, https://sentry.io üzerinden proje oluşturup alın)

**Kontrol:** Bu beşi de elinizde değilse devam etmeyin.

---

## 1. Hetzner Cloud'da sunucu oluştur

1. Console'da `+ New Project` → "Sınav Salonu" isimli proje aç.
2. Proje içinde `Servers` → `+ Add Server`.
3. **Location:** `Helsinki (hel1)` veya `Falkenstein (fsn1)` (AB veri yerleşimi — KVKK için aydınlatma yeterli).
4. **Image:** `Ubuntu 22.04`.
5. **Type:** `CCX13` (Dedicated vCPU, 2 vCPU + 8 GB RAM, ~€14/ay). Daha düşük bütçe için `CX22` (Shared vCPU, ~€4.6/ay) ama Sharp image processing yavaş olabilir.
6. **Networking:** Public IPv4 + IPv6 işaretli kalsın.
7. **SSH keys:** `+ Add SSH key` → `hetzner_sinav.pub` içeriğini yapıştırın → "Sinav Deploy" adıyla kaydedin → seçin.
8. **Firewall:** `+ Create Firewall` → "Sinav Web" adıyla 3 inbound kuralı:
   - `TCP 22` (SSH) — kaynak: `Any IPv4, Any IPv6` (sonra IP whitelisting yapabilirsiniz)
   - `TCP 80` (HTTP) — kaynak: `Any IPv4, Any IPv6`
   - `TCP 443` (HTTPS) — kaynak: `Any IPv4, Any IPv6`
   - Outbound: tüm trafiğe izin (default).
9. **Backups:** `Enable Backups` işaretleyin. Aylık ~%20 ek ücret ama her gün otomatik snapshot — kritik.
10. **Name:** `sinav-prod-01`.
11. `Create & Buy now`.

Sunucu ~30 saniyede ayağa kalkar. Console'da public IP'sini bir kenara yazın — `<server-ip>` olarak kullanılacak.

**Kontrol:** Hetzner Cloud Console'da sunucu yeşil noktayla "Running" göstermeli, IP atanmış olmalı.

---

## 2. Domain DNS ayarı

Domain sağlayıcınızın DNS panelinde:

- `A` kaydı → host: `@` (kök) → değer: `<server-ip>` → TTL: 300
- `A` kaydı → host: `www` → değer: `<server-ip>` → TTL: 300
- (Opsiyonel) `A` kaydı → host: `api` → değer: `<server-ip>` → TTL: 300 (gelecekte ayrı subdomain için)

**Kontrol:** Lokalde `nslookup <your-domain.com>` veya `dig <your-domain.com>` çalıştırın. Server IP'niz gelmeli. 5-30 dakika sürebilir; gelmeden HTTPS aşamasına geçmeyin yoksa Let's Encrypt başarısız olur.

---

## 3. Sunucuya ilk bağlantı + sertleştirme

Lokal makinenizden:

```powershell
ssh -i $HOME\.ssh\hetzner_sinav root@<server-ip>
```

İlk bağlantıda fingerprint sorulur, `yes`. Artık root olarak içerisindesiniz.

### 3.1 Sistem güncelle
```bash
apt update && apt upgrade -y
apt install -y ufw fail2ban unattended-upgrades curl ca-certificates gnupg lsb-release
```

### 3.2 Otomatik güvenlik güncellemeleri
```bash
dpkg-reconfigure -plow unattended-upgrades  # "Yes" seçin
```

### 3.3 Firewall (UFW)
Hetzner'in cloud firewall'ı zaten 80/443/22 dışındakileri keser; UFW ikinci kat savunma:
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

### 3.4 Fail2ban (brute-force SSH koruması)
```bash
systemctl enable --now fail2ban
fail2ban-client status
```

### 3.5 Yeni deploy kullanıcısı (root kullanmayı bırakın)
```bash
adduser deploy  # şifre belirleyin (kaybetmeyin)
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Yeni terminalden test:
```powershell
ssh -i $HOME\.ssh\hetzner_sinav deploy@<server-ip>
sudo whoami   # "root" çıkmalı, şifre sorabilir
```

Çalışıyorsa root SSH'ı kapatın (mevcut root oturumunda):
```bash
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

**Kontrol:** Root olarak bağlanmaya çalıştığınızda reddetmeli, deploy kullanıcısı çalışmalı. Bu adımdan sonra ssh komutunuz `deploy@<server-ip>` olacak.

---

## 4. Docker kurulum

`deploy` kullanıcısıyla bağlıyken:

```bash
# Docker'ın resmi repo'sunu ekle
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# deploy kullanıcısını docker grubuna ekle (sudo'suz docker komutu)
sudo usermod -aG docker deploy
```

Çıkıp tekrar SSH girin (grup değişikliği için):
```powershell
exit
ssh -i $HOME\.ssh\hetzner_sinav deploy@<server-ip>
```

Test:
```bash
docker --version
docker compose version
docker run --rm hello-world
```

**Kontrol:** Üç komut da hata vermeden çıktı vermeli. `hello-world` "Hello from Docker!" mesajı dönmeli.

---

## 5. Repository transferi

İki yöntem; **GitHub HTTPS** en pratik ilk seferde.

```bash
cd /home/deploy
git clone https://github.com/<kullanici>/<repo>.git sinavsalonu
cd sinavsalonu
git log -1   # son commit'i görün
```

Private repo'da Personal Access Token kullanın (https://github.com/settings/tokens — repo scope), prompt'ta password yerine token yapıştırın.

**Kontrol:** `ls apps/backend apps/frontend infra` çalışmalı.

---

## 6. Production .env hazırla

Repo kökünde docker-compose'un okuduğu `.env` dosyası:

```bash
cd /home/deploy/sinavsalonu
cp .env.example .env
nano .env
```

Aşağıdakileri **gerçek değerlerle** doldurun:

```env
############################
# Database
############################
POSTGRES_USER=sinav_app
POSTGRES_PASSWORD=<32-char-strong-pwd>
POSTGRES_DB=sinavsalonu_prod
DATABASE_URL=postgresql://sinav_app:<32-char-strong-pwd>@postgres:5432/sinavsalonu_prod?schema=public

############################
# Backend security
############################
JWT_SECRET=<64-char-hex>            # openssl rand -hex 32
JWT_EXPIRES_IN=604800

############################
# Frontend / API
############################
VITE_API_URL=https://<your-domain.com>
CLIENT_URL=https://<your-domain.com>

############################
# Docker / Network
############################
NPM_REGISTRY=https://registry.npmjs.org

SLACK_WEBHOOK_URL=                  # opsiyonel — DLQ alarmları
```

Backend için ayrıca `apps/backend/.env` lazım (env.ts boot validation için):

```bash
cp apps/backend/.env.example apps/backend/.env
nano apps/backend/.env
```

Production için zorunlular:
```env
NODE_ENV=production
PORT=3000
TRUST_PROXY=1
DEFAULT_TENANT_ID=prod-tenant

DATABASE_URL=postgresql://sinav_app:<32-char-strong-pwd>@postgres:5432/sinavsalonu_prod?schema=public
REDIS_URL=redis://redis:6379
REDIS_DISABLED=0
CRON_DISABLED=0

JWT_SECRET=<aynı-değer-.env-ile>
JWT_EXPIRES_IN=604800

CLIENT_URL=https://<your-domain.com>
FRONTEND_URL=https://<your-domain.com>

# CSP — başlangıçta report-only, sonra enforce
CSP_ENABLED=true
CSP_REPORT_ONLY=true

# Email modülü (henüz aktif değilse boş bırakın — env.ts Zod opsiyonel olarak doğrular)
EMAIL_SECRETS_KEY=<64-char-hex>     # opsiyonel ama ileride mail modülü için lazım
EMAIL_DEFAULT_FROM=noreply@<your-domain.com>
EMAIL_DEFAULT_FROM_NAME=Sınav Salonu

# Sentry (varsa)
SENTRY_DSN=<your-sentry-dsn>

# Captcha — production'da Turnstile öneririz
CAPTCHA_PROVIDER=none               # ileride 'turnstile' yapın
TURNSTILE_SECRET_KEY=

# Bruteforce — varsayılan değerler iyi
THROTTLE_DISABLED=
ORIGIN_PROTECTION_DISABLED=
```

**Önemli güvenlik kuralları:**
- `JWT_SECRET` dev ortamınızdakinden FARKLI olmalı.
- `.env` ve `apps/backend/.env` dosyalarını **kesinlikle git'e commit etmeyin** (`.gitignore`'da zaten var, kontrol edin: `git check-ignore .env` boş satır dönmeli).
- Şifreleri parola yöneticinizde (1Password, Bitwarden) saklayın — sunucu silinirse kaybedersiniz.

**Kontrol:** `cat .env | grep -v "^#" | grep -v "^$"` çıktısında tüm değerlerin dolu olduğunu doğrulayın.

---

## 7. HTTPS için Caddy edge proxy ekle

Sizin `docker-compose.prod.yml` HTTP'de 80 üzerinden frontend'i sunuyor; HTTPS için önüne Caddy koyarız. Caddy Let's Encrypt sertifikasını otomatik alır ve yeniler.

`infra/docker/Caddyfile` oluşturun:

```bash
nano infra/docker/Caddyfile
```

İçerik:
```
<your-domain.com>, www.<your-domain.com> {
    encode zstd gzip
    reverse_proxy frontend:80

    # API proxy — eğer frontend nginx'i /api'yi backend'e zaten proxylemiyorsa:
    @api path /api/* /uploads/* /docs* /metrics /health* /ready /csp-report /webhooks/*
    reverse_proxy @api backend:3000

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }

    log {
        output file /var/log/caddy/access.log
        format json
    }
}

# www → çıplak domain redirect
www.<your-domain.com> {
    redir https://<your-domain.com>{uri} permanent
}
```

**Not:** Eğer sizin frontend nginx'i zaten `/api` request'lerini backend'e proxy'liyorsa (büyük olasılıkla öyle — `infra/nginx/default.conf.template`'e bakıp doğrulayın), Caddyfile'da `@api` bloğunu silebilirsiniz. Tek `reverse_proxy frontend:80` yeter.

### Caddy'yi compose'a ekleyin — override dosyası

`infra/docker/docker-compose.edge.yml` oluşturun:

```bash
nano infra/docker/docker-compose.edge.yml
```

İçerik:
```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
      - caddy_logs:/var/log/caddy
    depends_on:
      - frontend
      - backend
    networks:
      - default

volumes:
  caddy_data:
  caddy_config:
  caddy_logs:
```

`frontend` servisini direkt host'a açmayacağız (Caddy proxy'leyecek). `docker-compose.prod.yml`'de frontend servisinin `ports:` bölümü yoksa zaten iç ağda kalır — kontrol edin, yoksa eklemeyin.

**Kontrol:** Dosyalar oluşturuldu, `<your-domain.com>` yerine gerçek değer yazıldı.

---

## 8. İlk build + ayağa kaldırma

Compose komutlarını rahat çağırabilmek için bir alias kurun:

```bash
echo "alias dcp='docker compose -f infra/docker/docker-compose.prod.yml -f infra/docker/docker-compose.edge.yml --env-file .env'" >> ~/.bashrc
source ~/.bashrc
```

### 8.1 Build (5-10 dakika sürebilir — sabırlı olun)
```bash
cd /home/deploy/sinavsalonu
dcp build
```

Hata alırsanız (genelde memory yetersizliğinden olur):
```bash
# Swap aç (build için geçici)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# Tekrar build et
dcp build
```

### 8.2 Önce sadece postgres + redis ayağa kaldır
```bash
dcp up -d postgres redis
dcp ps
# postgres ve redis "healthy" olana kadar bekleyin (5-10 saniye)
dcp logs postgres --tail 20
```

### 8.3 Database migration'larını çalıştır
```bash
dcp run --rm backend npx prisma migrate deploy
```

Beklenen çıktı:
```
The following migration(s) have been applied:
20260304095422_init
20260304121415_add_idempotency_keys
...
20260519000000_seed_exam_topic_tree
NOTICE:  Konu ağacı seed tamamlandı
NOTICE:  topics           : ~595 satır
```

Hata alırsanız (drift veya pending issue):
```bash
dcp run --rm backend npx prisma migrate status
```

### 8.4 Geri kalan tüm servisleri başlat
```bash
dcp up -d
dcp ps
```

Hepsinin "Up" / "healthy" olmasını bekleyin (20-40 saniye). `backend` healthcheck `start_period: 20s` olduğundan biraz gecikir.

### 8.5 Caddy SSL sertifikası kontrolü
```bash
dcp logs caddy --tail 30
```

Beklenen: "certificate obtained successfully" satırı görmeli. Eğer "no such host" veya "challenge failed" görüyorsanız DNS henüz yayılmamış — 5 dakika bekleyin, sonra `dcp restart caddy`.

**Kontrol:** Tarayıcıda `https://<your-domain.com>` açın. Yeşil kilit + frontend ana sayfa görünmeli.

---

## 9. Smoke test (deploy'un gerçekten çalıştığını doğrula)

Aşağıdaki kontrolleri sırayla yapın:

```bash
# Backend ready
curl -sS https://<your-domain.com>/ready
# Beklenen: {"status":"ok"} veya benzeri

# Health (db, redis dahil)
curl -sS https://<your-domain.com>/health
```

Tarayıcıda:
1. Ana sayfa açılıyor mu?
2. `https://<your-domain.com>/giris` ile login sayfası geliyor mu?
3. Admin hesabınızla giriş (seed.service.ts default admin oluşturmuş olabilir — production'da NODE_ENV=production olduğu için SeedService skip eder, üretimde manuel oluşturmanız gerek; aşağıdaki "İlk admin" adımı).

### İlk admin hesabı oluşturma (üretimde seed atlandığı için)

```bash
dcp exec postgres psql -U sinav_app -d sinavsalonu_prod -c "
INSERT INTO users (id, email, username, \"passwordHash\", role, status, \"tenantId\", \"createdAt\", \"updatedAt\")
VALUES (
  gen_random_uuid()::TEXT,
  'admin@<your-domain.com>',
  'admin',
  '\$2a\$12\$<bcrypt-hash-of-strong-pwd>',
  'ADMIN',
  'ACTIVE',
  'prod-tenant',
  NOW(), NOW()
);"
```

Bcrypt hash'i lokalde üretin:
```bash
docker run --rm node:20-alpine sh -c "npm install bcryptjs --silent && node -e \"console.log(require('bcryptjs').hashSync('<strong-pwd>', 12))\""
```

**Kontrol:** Login + dashboard görünüyor + Sentry'de bağlantı errors yok.

---

## 10. Yedek sistemini kur

### 10.1 Hetzner backup (zaten Step 1'de açtınız)
Hetzner her gün otomatik snapshot alır, 7 gün tutar. Console > Server > Backups sekmesinden manuel snapshot da alabilirsiniz.

### 10.2 Postgres günlük dump (sunucu içinde, ayrı katman)

`/home/deploy/scripts/pg_backup.sh`:

```bash
mkdir -p /home/deploy/scripts /home/deploy/backups
nano /home/deploy/scripts/pg_backup.sh
```

İçerik:
```bash
#!/bin/bash
set -euo pipefail
TS=$(date +%Y%m%d_%H%M)
BACKUP_DIR=/home/deploy/backups
docker exec $(docker ps -qf name=postgres) pg_dump -U sinav_app -d sinavsalonu_prod -F c \
  > "$BACKUP_DIR/sinav_$TS.dump"
# 14 günden eskisini sil
find "$BACKUP_DIR" -name "sinav_*.dump" -mtime +14 -delete
echo "[$(date)] backup ok: sinav_$TS.dump"
```

```bash
chmod +x /home/deploy/scripts/pg_backup.sh
# Test
/home/deploy/scripts/pg_backup.sh
ls -lh /home/deploy/backups/
```

Cron ile günde 2 kez (03:00 ve 15:00):
```bash
crontab -e
```
Ekle:
```
0 3,15 * * * /home/deploy/scripts/pg_backup.sh >> /home/deploy/backups/backup.log 2>&1
```

### 10.3 Yedekleri sunucu dışına çıkarın (KRİTİK)

Aynı sunucudaki yedek yedek değildir. Üç pratik seçenek:

**a) S3-uyumlu storage (Hetzner Object Storage, Backblaze B2, AWS S3):** `rclone` kurun, cron'a `rclone copy /home/deploy/backups remote:sinavsalonu-backups` ekleyin.

**b) Lokal makineye scp ile çekme:** Lokalden cron/scheduled task ile günlük çek.

**c) Hetzner Storage Box (Türkiye/AB):** 1 TB ~€3/ay, sftp ile yazılır.

İlk hafta (a) öneririm. Hetzner Object Storage 1 TB ~€5/ay.

**Kontrol:** En az bir dump dosyası sunucu dışında bir lokasyonda.

---

## 11. Sentry release tag (varsa)

```bash
# Lokalde, deploy commit'inde
sentry-cli releases new sinav-backend@$(git rev-parse --short HEAD)
sentry-cli releases set-commits --auto sinav-backend@$(git rev-parse --short HEAD)
sentry-cli releases finalize sinav-backend@$(git rev-parse --short HEAD)
```

Backend container'a `SENTRY_RELEASE` env değişkenini ekleyin (`apps/backend/.env`):
```env
SENTRY_RELEASE=<commit-sha>
```

Sentry artık "bu hata X release'inde başladı" diyebilir.

---

## 12. Günlük (sonraki) deploy akışı

İlk deploy bittikten sonra her güncellemede şunu yapacaksınız:

```bash
ssh -i $HOME\.ssh\hetzner_sinav deploy@<server-ip>
cd ~/sinavsalonu

# 1. Yedek al (her zaman)
~/scripts/pg_backup.sh

# 2. Yeni kodu çek
git fetch && git status
git pull --ff-only

# 3. Migration'ları kontrol et — pending var mı?
dcp run --rm backend npx prisma migrate status

# 4. Build (eğer kod değiştiyse)
dcp build

# 5. Migration deploy
dcp run --rm backend npx prisma migrate deploy

# 6. Container'ları yenile (rolling)
dcp up -d
dcp ps

# 7. Smoke test
curl -sS https://<your-domain.com>/ready

# 8. Sentry release (opsiyonel)
sentry-cli releases new sinav-backend@$(git rev-parse --short HEAD)
sentry-cli releases finalize sinav-backend@$(git rev-parse --short HEAD)
```

Bu akışı `scripts/deploy.sh` olarak kalıcı bir script yapabilirsiniz.

---

## 13. Geri alma (rollback) prosedürü

Yeni deploy hata verirse:

### Senaryo A: Container ayağa kalkmıyor (migration geçti)
```bash
git log --oneline -5     # önceki çalışan commit'i bulun
git checkout <eski-commit-sha>
dcp build && dcp up -d
```
Eski kod yeni DB şemasıyla uyumlu mu? Eğer `backward-compatibility` skill'inizdeki expand & contract pattern'i uyduysanız uyumlu olur.

### Senaryo B: Migration'da hata, DB bozuldu
```bash
# 1. Tüm servisleri durdur
dcp down

# 2. En son backup'tan restore
LATEST=$(ls -t ~/backups/sinav_*.dump | head -1)
docker compose -f infra/docker/docker-compose.prod.yml up -d postgres
sleep 5
docker exec -i $(docker ps -qf name=postgres) pg_restore -U sinav_app -d sinavsalonu_prod --clean --if-exists < "$LATEST"

# 3. Eski commit'e dön
git checkout <eski-commit-sha>
dcp up -d
```

### Senaryo C: SSL kırıldı / Caddy çöktü
```bash
dcp logs caddy --tail 50
dcp restart caddy
# Hâlâ olmuyorsa Caddyfile syntax hatası
docker run --rm -v $(pwd)/infra/docker/Caddyfile:/etc/caddy/Caddyfile caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

### Senaryo D: Tam felaket — sunucu erişilemez
Hetzner Console → Server → Rescue mode veya en son snapshot'a Rollback. Sonra DB restore + git checkout adımları.

---

## 14. Sık karşılaşılan sorunlar

**"Cannot connect to database" backend log'unda**
- `dcp logs postgres` ile postgres healthy mi?
- `apps/backend/.env`'deki DATABASE_URL host kısmı `postgres` (docker servisi adı) olmalı, `localhost` değil.

**Caddy sertifika alamıyor**
- DNS henüz yayılmadı: `dig <your-domain.com> @8.8.8.8` ile kontrol, IP server IP'si olmalı.
- 80 portu Caddy dışında bir şey tutuyor: `sudo lsof -i :80` ile kontrol.
- Rate limit (Let's Encrypt haftada 5 deneme/domain): biraz bekleyip tekrar deneyin.

**Frontend açılıyor ama API 502 dönüyor**
- Backend healthcheck başarısız: `dcp logs backend --tail 50`, env eksikliği veya migration eksikliği muhtemel.
- Caddyfile'da `/api` proxy'si yanlış (frontend nginx zaten proxy yapıyorsa Caddyfile'dan `@api` bloğunu kaldırın).

**Disk doldu**
- `docker system df` ile inceleyin.
- Eski image'lar: `docker image prune -a` (dikkat, çalışmayan tüm image'ları siler).
- Eski log'lar: `journalctl --vacuum-time=7d`.

**RAM yetersizliği (build sırasında)**
- Geçici swap aç (yukarıda Step 8.1'de gösterildi).
- Daha kalıcı çözüm: VPS'i CCX13 → CCX23'e yükseltin.

**Migration "drift detected" diyor**
- Production'da `prisma migrate dev` ÇALIŞTIRMAYIN (DB siler). Sadece `prisma migrate deploy`.
- Drift'in nedeni: manuel DB değişikliği veya unrelated migration. `npx prisma db pull` ile fark görüp manuel çözün.

---

## 15. Sonraki adımlar (deploy sonrası ilk hafta için)

İlk 24 saatte:
- [ ] Sentry'de "0 error" tutmaya çalışın
- [ ] Bir test kullanıcısı oluşturup tam akışı dolaşın (kayıt → satın alma → test çözme → çıkış)
- [ ] Backup script'i çalışıyor mu kontrol: `cat ~/backups/backup.log`

İlk hafta:
- [ ] CSP'yi `CSP_REPORT_ONLY=true`'dan `false`'a çevirin (önce report'ları izleyin)
- [ ] Cloudflare Turnstile entegre edin (`CAPTCHA_PROVIDER=turnstile`)
- [ ] Hetzner Storage Box veya Object Storage'a yedek pipeline'ı taşıyın
- [ ] `docs/runbooks/` altına özel runbook'lar ekleyin (db-down, redis-down, ssl-fail)
- [ ] Uptime izleme (UptimeRobot, Better Stack — ücretsiz tier'lar var)

İlk ay:
- [ ] Load test (k6 veya artillery ile) → kapasite limitleri ölç
- [ ] Sentry release tagging'i CI'a entegre et
- [ ] `infra/helm/` Helm chart'ınızı bir staging k8s cluster'da bir kez deneyin (ileriye yatırım)

---

## Referanslar

- Hetzner Cloud docs: https://docs.hetzner.cloud
- Caddy v2 docs: https://caddyserver.com/docs/
- Docker Compose docs: https://docs.docker.com/compose/
- Prisma Migrate prod: https://www.prisma.io/docs/concepts/components/prisma-migrate/migrate-development-production
- Sizdeki ilgili skill'ler: `release-engineering`, `observability`, `security-hardening`, `email-traffic`.

---

**Son söz:** İlk deploy en az 2-3 saat ayırın. Acele etmeyin. Her adımın "Kontrol" kısmındaki şartı sağlamadan sonraki adıma geçmeyin. Hata aldığınızda panik yerine `dcp logs <servis>` ile log'a bakın — %90'ı orada açıklanır.
