# Staging Ortamında AI (Claude) Erişimi — Runbook

> **Statü:** Production sertifikasyonu — staging kurulumu sırasında uygulanır
> **Hedef:** Claude'a staging'de güvenli, denetlenebilir, sınırlı yetki ile erişim ver. Prod'a sızıntıyı network ve credential seviyesinde engelle.
> **İlgili dosyalar:**
> - `docs/runbooks/production-deploy-hetzner.md` — prod kurulum
> - `docs/runbooks/incident-response.md` — incident playbook'ları
> - `docs/ops/anonimize-prod-snapshot.md` — staging veri tazeleme
> - `docs/ops/pitr-setup.md` — PITR setup (Claude tatbikat için kullanır)

---

## 0. Bu doküman neyi çözer?

Tek geliştirici, AI-yardımıyla geliştirme. İki gerçek var:

1. **Lokal'de canlı sorunları reproduce etmek zor.** Veri yok, gerçek trafik yok, gerçek user pattern yok.
2. **Claude'u prod'a yaklaştırmak tehlikeli.** AI çıktısı %100 hatasız değil, canlı kullanıcılar gerçek.

**Çözüm:** Staging'i Claude'un oyun alanı yap. Prod ile aynı stack, anonim veri, atılır. Bozulursa snapshot script'i yeniden taze prod-shaped veriyle doldurur.

**Bu doküman üç sorunun cevabını verir:**
- Claude'a staging'de ne kadar yetki verilir?
- Bu yetki prod'a nasıl sızmaz?
- Claude'un staging'de ne yaptığı sonradan nasıl izlenir?

---

## 1. Üç ortam, üç farklı Claude yetki seviyesi

| Ortam | Claude'un yapabildiği | Claude'un yapamadığı |
|---|---|---|
| **Lokal** | Her şey — kod yazma, test, migration, DB drop, paket install | (Yok — burada özgür) |
| **Staging** | SSH, docker exec, DB query, migration koşma, log okuma, PR açma, deploy tetikleme, screenshot, k6, PITR tatbikat | Prod erişim, prod secret okuma, snapshot zorla tetikleme, root sudo, firewall değiştirme |
| **Production** | Sadece **okuma**: Sentry, Grafana, log fetch (read-only API key) | Yazma, deploy, SSH, DB query, migration, secret okuma |

**Bu ayrım kutsaldır.** Tasarımın geri kalanı bunun teknik garantilerini kurar.

---

## 2. Mimari

```
LOKAL (Claude Code çalışıyor)
     │
     ├──► Lokal dosyalara erişim (kod yazma, test, build)
     │
     ├──► SSH key: ~/.ssh/claude_staging_key
     │    └──► staging.sinavsalonu.com (claude user, sınırlı yetki)
     │            │
     │            ├──► docker exec sinav-backend ...
     │            ├──► psql -d sinavsalonu_staging
     │            ├──► docker logs --tail 100 ...
     │            ├──► k6 run scripts/load/*.js
     │            └──► npm run db:migrate (staging only)
     │
     ├──► HTTPS API (read-only):
     │    ├──► Sentry API (events, breadcrumb)
     │    ├──► Grafana API (metrik query)
     │    └──► GitHub API (PR açma, workflow trigger)
     │
     └──► [PROD'A KAPALI — erişim yok]
              │
              │  Network firewall: staging'den prod'a outbound block
              │  Credential: prod secret'lar Claude'un erişebileceği yerde yok
              └──► (engelli)
```

---

## 3. Staging sunucusunda kurulum

Hetzner runbook'una göre staging kurulumunu tamamladıktan sonra (`docs/runbooks/production-deploy-hetzner.md` — staging için adapte edilmiş hali) bu bölüm uygulanır.

### 3.1 `claude` user oluştur

```bash
# Staging sunucusuna SSH (deploy veya root user'ı ile)
ssh deploy@<staging-ip>

# Yeni user
sudo useradd -m -s /bin/bash claude
sudo passwd -l claude  # şifre ile login devre dışı, sadece SSH key

# Gerekli group'lar (docker exec + postgres komutları için)
sudo usermod -aG docker claude
sudo usermod -aG postgres claude  # opsiyonel — psql sudo'suz çalışsın
```

**Kontrol:** `id claude` çıktısında `docker` ve `postgres` group'ları görünmeli.

### 3.2 SSH key kurulumu (lokal makinede)

```bash
# Lokal makinede yeni key üret
ssh-keygen -t ed25519 -C "claude-staging-access" -f ~/.ssh/claude_staging_key
# Passphrase boş bırakılabilir (Claude otomasyonu kolay olsun)

# Public key'i staging'e ekle
ssh-copy-id -i ~/.ssh/claude_staging_key.pub claude@<staging-ip>
```

**ÖNEMLİ:** Bu key SADECE staging'e ekli. Prod sunucusunda `/root/.ssh/authorized_keys` ve `/home/deploy/.ssh/authorized_keys` içinde bu key BULUNMAMALI.

**Kontrol:**
```bash
# Lokalden:
ssh -i ~/.ssh/claude_staging_key claude@<staging-ip> "echo hello && hostname"
# Çıktı: hello, sinav-staging-01

# Prod erişim DENEMESİ:
ssh -i ~/.ssh/claude_staging_key claude@<prod-ip>
# Çıktı: Permission denied (publickey). ← BU BEKLENEN.
```

İkinci komut başarılı olursa kurulum HATALI — durmadan düzelt.

### 3.3 Sudo erişimini engelle

```bash
# Staging'de
sudo cat /etc/sudoers.d/claude
# Boş veya yok olmalı

# Doğrula:
sudo -u claude sudo -n true 2>&1
# Çıktı: sudo: a password is required ← İyi.
```

Claude `sudo` ile root yetkisi alamaz. Tüm yıkıcı sistem komutları (kernel, network, firewall) Claude'a kapalı.

### 3.4 Shell prompt'a uyarı bayrağı

Claude'un staging mi prod mu olduğunu **görsel olarak** anlamasını sağla:

```bash
# Staging'de root user ile:
sudo cat > /etc/profile.d/staging-banner.sh <<'EOF'
# Sinav Salonu — staging banner
export PS1='\[\033[1;33m\][STAGING]\[\033[0m\] \u@\h:\w\$ '
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  STAGING ENVIRONMENT"
echo "  Atılır ortam — anonim veri — Pazartesi 04:00 tazelenir"
echo "  Tüm yazma işlemleri burada güvenlidir, prod'a sızmaz."
echo "═══════════════════════════════════════════════════════════"
echo ""
EOF
sudo chmod 644 /etc/profile.d/staging-banner.sh
```

Claude SSH ile bağlandığında bu mesajı görür, prod'la karıştırma şansı düşer. Lokal CLAUDE.md'nize şu satırı ekleyin:

> Sunucu shell prompt'unda `[STAGING]` görüyorsan yazma operasyonları güvenlidir.
> Eğer `[PROD]` görürsen — ki görmemelisin — derhal çık (`exit`) ve kullanıcıya bildir.

### 3.5 Outbound firewall — prod'a erişimi engelle

Staging sunucusunda prod IP'sine outbound trafiği engelle. Bu, "kazara `pg_dump` prod'a çalıştırdı" senaryosunu network seviyesinde durdurur.

```bash
# Prod IP'sini al (önceden biliyorsun — `<prod-ip>`)
PROD_IP=<prod-ip>

# UFW outbound block
sudo ufw deny out to $PROD_IP
sudo ufw reload

# Doğrula
sudo ufw status numbered | grep $PROD_IP
# Çıktı: DENY OUT to <prod-ip>
```

**Test:**
```bash
# Staging'de claude user ile:
ssh -i /home/claude/.ssh/some_key root@<prod-ip>
# Bekleniyor: Connection timed out (network blocked)

ping <prod-ip>
# Bekleniyor: Operation not permitted veya 100% packet loss
```

**Not:** Eğer ileride prod'a staging'den **legitimate** bir bağlantı gerekirse (örneğin staging Sentry'sini prod'la paylaşmak), o servisin domain'i izin listesine eklenir, IP değil. Doğrudan prod sunucusuna SSH/Postgres bağlantısı **her zaman** engelli kalmalı.

### 3.6 Audit log — Claude'un her komutu kayıtta

```bash
# Staging'de root ile:
sudo cat > /etc/profile.d/audit-claude.sh <<'EOF'
# Claude user'ının komutlarını log dosyasına yaz
if [[ "$USER" == "claude" ]]; then
  # Her komut çalıştığında log düşür
  export PROMPT_COMMAND='RETRN_VAL=$?; echo "[$(date +"%Y-%m-%d %H:%M:%S")] [exit=$RETRN_VAL] [$$] $(history 1 | sed "s/^[ ]*[0-9]\+[ ]*//")" >> /var/log/claude-audit.log'

  # Bash history'yi de zenginleştir
  export HISTTIMEFORMAT="%Y-%m-%d %H:%M:%S "
  export HISTSIZE=10000
  export HISTFILESIZE=10000
  shopt -s histappend
fi
EOF

sudo chmod 644 /etc/profile.d/audit-claude.sh

# Log dosyasını oluştur ve claude tarafından yazılabilir yap
sudo touch /var/log/claude-audit.log
sudo chown claude:claude /var/log/claude-audit.log
sudo chmod 644 /var/log/claude-audit.log

# Logrotate — log dosyası şişmesin
sudo cat > /etc/logrotate.d/claude-audit <<'EOF'
/var/log/claude-audit.log {
    daily
    rotate 90
    compress
    missingok
    notifempty
    create 0644 claude claude
}
EOF
```

**Çıktı örneği** (`/var/log/claude-audit.log`):
```
[2026-06-15 14:32:18] [exit=0] [12345] docker exec sinav-backend npx prisma migrate status
[2026-06-15 14:32:45] [exit=0] [12345] psql -d sinavsalonu_staging -c "SELECT COUNT(*) FROM users"
[2026-06-15 14:33:02] [exit=1] [12345] rm -rf /etc/  # ← yetki yok, başarısız
```

Sonradan inceleyebileceğin tam aktivite log'u — Claude'un staging'de ne yaptığını dakika dakika görürsün.

### 3.7 Resource limit — infinite loop koruması

```bash
# /etc/security/limits.d/claude.conf
sudo cat > /etc/security/limits.d/claude.conf <<'EOF'
# Claude user — staging'i çökertmesin
claude  soft  cpu      300      # 5 dakika CPU
claude  hard  cpu      600      # 10 dakika hard
claude  soft  as       2097152  # 2 GB memory
claude  hard  as       4194304  # 4 GB memory
claude  soft  nproc    256      # max 256 process
claude  hard  nproc    512
EOF
```

Bir Claude komutu sonsuza dek çalışırsa OS otomatik kill eder. Staging'in geri kalanı yaşar.

### 3.8 Staging banner'ı API response'unda da göster

`apps/backend/src/nest/middleware/staging-banner.middleware.ts` (örnek):

```typescript
// Eğer APP_ENV === 'staging' ise X-Environment: staging header'ı ekle
if (process.env.APP_ENV === 'staging') {
  res.setHeader('X-Environment', 'staging-anonymized');
}
```

Claude API çağrılarında bu header'ı görür → "staging ile konuşuyorum" doğrulanır.

---

## 4. Lokal Claude Code konfigürasyonu

Claude Code'un staging'e nasıl bağlanacağı. İki seçenek; küçük başla, büyüt.

### Seçenek A — Doğrudan SSH (önerilen, sıfır kurulum)

Claude'a komut verirken SSH komutunu açıkça yaz:

```bash
ssh -i ~/.ssh/claude_staging_key claude@staging.sinavsalonu.com \
  "docker exec sinav-backend npx prisma migrate status"
```

Claude Code'un Bash tool'u bu komutu çalıştırır. Sonuç döner. Kurulum: SSH key yerleştirme dışında hiçbir şey.

**CLAUDE.md'ye ekleyin:**

```markdown
## Staging erişimi

Staging için SSH komutu kalıbı:
\`\`\`bash
ssh -i ~/.ssh/claude_staging_key claude@staging.sinavsalonu.com "<komut>"
\`\`\`

Bu key SADECE staging'e erişir. Prod'a denemen anlamsız — bağlanmaz.
Komut çalıştırmadan önce her zaman sunucu prompt'unda `[STAGING]`
göründüğünü teyit et (echo komutu ile).
```

### Seçenek B — SSH MCP server

Daha temiz API, ama ek kurulum:

```json
// ~/.claude/settings.json (Cowork) veya proje-specific
{
  "mcpServers": {
    "staging-ssh": {
      "command": "npx",
      "args": ["-y", "mcp-server-ssh"],
      "env": {
        "SSH_HOST": "staging.sinavsalonu.com",
        "SSH_USER": "claude",
        "SSH_KEY_PATH": "~/.ssh/claude_staging_key"
      }
    }
  }
}
```

Claude artık `staging-ssh:run` gibi bir tool görür, doğrudan kullanır.

**Tavsiye:** Seçenek A ile başla. Bir hafta kullandıktan sonra "yeterince sık SSH ediyorum, MCP daha temiz olur" demeye başlarsan Seçenek B'ye geç.

### CLAUDE.md — staging context'i her seansta yüklenir

Projenizdeki `CLAUDE.md`'ye yeni bir bölüm ekleyin:

```markdown
## Staging ortamı

**Adres:** `staging.sinavsalonu.com`
**SSH:** `ssh -i ~/.ssh/claude_staging_key claude@staging.sinavsalonu.com`
**DB:** `sinavsalonu_staging` (anonim veri, Pazartesi 04:00 tazelenir)
**Banner:** `[STAGING]` (prompt'ta görmelisin)

### Yapabileceklerin (staging'de)
- Kod değişikliği test etme (deploy-staging branch'i)
- Migration tatbikatı (`npx prisma migrate ...`)
- DB sorgusu (`psql ...`)
- Docker exec (`docker exec sinav-backend ...`)
- k6 load test (`k6 run tests/load/...`)
- PITR restore tatbikatı (`pgbackrest --stanza=main restore ...`)
- Screenshot için headless chromium

### Yapamayacakların
- `sudo` (yetkin yok, deneme)
- Prod erişim (firewall engeller)
- Snapshot script tetikleme (.env.ops senin erişiminde değil)
- main branch'e push (PR aç, kullanıcı merge eder)

### Hata reprodüksiyonu protokolü
1. Sentry event ID'sinden kullanıcı + endpoint + request body'yi çıkar.
2. Staging DB'de aynı kullanıcı ID'sini sorgula (anonim ama mantıksal aynı).
3. Hatayı reproduce et (curl veya direkt UseCase çağırarak).
4. Fix yaz + test ekle.
5. PR aç. Beni etiketle.
```

---

## 5. Kullanım senaryoları

### 5.1 Sentry hatasını reproduce et + fix yaz

```
Sen: Claude, Sentry'de issue #4521 var. Staging'de reproduce et, fix yaz, PR aç.

Claude:
  $ curl -H "Authorization: Bearer $SENTRY_AUTH" \
    https://sentry.io/api/0/projects/sinav/issues/4521/events/
  → user_id: 9876, endpoint: POST /v1/attempts/5432/submit

  $ ssh -i ~/.ssh/claude_staging_key claude@staging.sinavsalonu.com \
    "psql -d sinavsalonu_staging -c \"SELECT * FROM test_attempts WHERE id = 5432\""
  → questionsSnapshot is NULL

  → Inceleniyor: SubmitAttemptUseCase.ts null check eksik
  → Düzeltme yazıyor + jest unit test ekliyor
  → Lokalde npm test → yeşil
  → git checkout -b fix/attempt-submit-null-snapshot
  → git push
  → gh pr create --title "fix: SubmitAttempt null snapshot" --body "..."

  Sonuç: PR #234 açıldı, staging deploy hazır.
```

### 5.2 Migration performans tatbikatı

```
Sen: Şu üç aşamalı migration'ı staging'de dene. Stage 1 backfill ne kadar
     sürüyor? Lock contention var mı? Rollback temiz mi?

Claude:
  $ ssh ... claude@staging.sinavsalonu.com bash <<EOF
      cd /opt/sinavsalonu
      time npx prisma migrate deploy
      psql -d sinavsalonu_staging -c "SELECT COUNT(*) FROM users WHERE new_field IS NULL"
  EOF

  → Migration 14 saniye, 50k user'da backfill 8 saniye sürdü.
  → pg_stat_activity'de wait_event YOK, lock yok.
  → Rollback denemesi: prisma migrate diff + manuel revert → temiz.

  Sonuç:
  - Estimated prod süre: ~30 saniye (boyut farkı ~2x).
  - Maintenance window'a gerek yok (transactional DDL, online).
  - Rollback test edildi.
  - Önerim: Cuma 02:00 deploy uygun.
```

### 5.3 PITR aylık tatbikat

```
Sen: PITR aylık tatbikati. Geçen Pazartesi 10:00'a staging'i restore et,
     restore süresini ölç, sonuç olarak normal staging'e geri dön.

Claude:
  $ ssh ... claude@staging.sinavsalonu.com bash <<EOF
      sudo -u postgres pgbackrest --stanza=main info
      → Last full: 2026-06-08 03:00
      → Last diff: 2026-06-15 03:00

      sudo systemctl stop postgresql
      sudo rm -rf /var/lib/postgresql/15/main/*

      time sudo -u postgres pgbackrest --stanza=main \
        --type=time --target="2026-06-08 10:00:00+03" --target-action=promote \
        restore

      sudo systemctl start postgresql
      psql -d sinavsalonu_staging -c "SELECT NOW(), COUNT(*) FROM users"
  EOF

  → restore süresi: 4 dk 12 sn
  → WAL replay: 2 dk 38 sn
  → Doğrulama: 50,184 user (geçen Pazartesi noktası)
  → Normal duruma geri: snapshot recreate script çalıştırılacak (sen tetikle)

  Sonuç:
  - RTO: ~7 dakika (5 dakika hedefe yakın)
  - Restore başarılı, veri tutarlı
  - Aylık tatbikat ✓ runbook'a not düşeceğim
```

### 5.4 Performance investigation

```
Sen: MyTopicReport sayfası prod'da yavaş. Staging'de en yavaş 10 query'yi bul,
     index önerisi yaz.

Claude:
  $ ssh ... claude@staging.sinavsalonu.com bash <<EOF
      psql -d sinavsalonu_staging -c "
        SELECT query, calls, mean_exec_time, total_exec_time
        FROM pg_stat_statements
        WHERE query LIKE '%test_attempt%'
        ORDER BY mean_exec_time DESC
        LIMIT 10
      "
  EOF

  → En yavaş: SELECT ... FROM test_attempts t JOIN questions q ON ...
            WHERE t.candidate_id = $1 AND t.completed_at > $2
            ORDER BY t.score DESC LIMIT 20
            (mean 412ms)

  $ ssh ... "psql -d sinavsalonu_staging -c \"EXPLAIN ANALYZE <query>\""
  → Seq scan on test_attempts (rows=180000), filter then sort
  → Missing index: (candidate_id, completed_at, score)

  Önerim:
  CREATE INDEX CONCURRENTLY idx_test_attempts_candidate_completion
    ON test_attempts (candidate_id, completed_at DESC, score DESC);

  Beklenen sonuç: 412ms → ~15ms (Index Scan).
  Migration olarak yazıyorum: prisma/migrations/20260615_add_perf_index/
```

### 5.5 Disaster recovery dry run

```
Sen: Hetzner DC outage simülasyonu yap. Staging'i komple sil, snapshot'tan
     yeni VPS'e restore et, DNS yönlendir, smoke test koş.

Claude:
  [resource intensive — kullanıcıya onay sor]
  Sen onayla? (tahmini süre: 45 dakika, tahmini maliyet: ~€0.05)

Sen: Onaylıyorum.

Claude:
  $ hcloud server poweroff sinav-staging-01
  $ hcloud server create-image sinav-staging-01 --description "dr-drill-20260615"
  $ hcloud server delete sinav-staging-01

  → Yeni VPS oluşturuluyor: sinav-staging-dr-01 (image: dr-drill-20260615)
  → DNS güncellemesi: A staging.sinavsalonu.com → <yeni-ip>
  → PITR restore: 2026-06-15 14:00 noktası
  → Smoke test: Playwright e2e koşuluyor...

  Sonuç:
  - RTO total: 41 dakika (hedef: ≤ 2 saat ✓)
  - Veri kaybı: 0
  - 1 smoke test başarısız (Captcha staging key uyumsuzluğu — bilinen)
  - Eski staging silindi, yeni staging çalışıyor

  Postmortem taslağı: docs/postmortems/2026-06-15-dr-drill.md
```

---

## 6. Aylık audit — Claude ne yaptı?

Her ay başı 15 dakika sürer. Düzenli yapın.

### 6.1 Audit log incele

```bash
ssh -i ~/.ssh/claude_staging_key claude@staging.sinavsalonu.com bash <<'EOF'
# Son 30 günün özeti
echo "=== Toplam komut sayısı ==="
wc -l /var/log/claude-audit.log

echo ""
echo "=== En sık çalıştırılan komutlar (top 10) ==="
awk -F'] ' '{print $NF}' /var/log/claude-audit.log | \
  awk '{print $1}' | sort | uniq -c | sort -rn | head -10

echo ""
echo "=== Başarısız komutlar (exit != 0) ==="
grep 'exit=[1-9]' /var/log/claude-audit.log | tail -20

echo ""
echo "=== Suspicious — sudo / curl prod / rm -rf girişimleri ==="
grep -E '(sudo|curl.*prod|rm -rf|/etc/|/var/lib)' /var/log/claude-audit.log
EOF
```

### 6.2 Audit checklist

Her aylık audit'te şunları doğrula:

- [ ] **Beklenmedik dosya değişikliği yok mu?** `find /home/claude -newer /tmp/last-audit -type f`
- [ ] **`sudo` denemesi var mı?** Olmamalı (yetki zaten yok ama denemiş olsa da log'da görünür).
- [ ] **Prod IP'sine bağlantı denemesi var mı?** `grep -E '(prod-ip|prod\.sinav)' /var/log/claude-audit.log`
- [ ] **Yetki dışı dizinlere erişim?** `/etc/`, `/var/lib`, `/root` altında okuma denemesi var mı?
- [ ] **Outbound trafik anormalliği?** `sudo ss -tunap | grep claude` — beklenen: sadece localhost ve GitHub/Sentry/B2.
- [ ] **Resource limit hit oldu mu?** `grep -E '(killed|oom)' /var/log/syslog | grep claude`
- [ ] **SSH key rotation?** 6 ayda bir `claude_staging_key`'i yenile.

Bulduğun şüpheli olayı `docs/security-incidents/YYYY-MM-DD-{summary}.md` olarak yaz.

---

## 7. Acil durum: Claude staging'de istenmeyen davranış

Eğer Claude staging'de panic-worthy bir şey yapıyorsa (örneğin sonsuz döngüde paket install ediyor, beklenmeyen dosya değiştiriyor, kullanıcı verisi sızdırıyor):

### 7.1 Hızlı erişim kesme

```bash
# Lokalden, root SSH ile (deploy user'ı veya kendi root key'inle)
ssh -i ~/.ssh/hetzner_sinav root@staging.sinavsalonu.com

# Aktif claude session'ı kes
sudo pkill -KILL -u claude

# Authorized_keys'i geçici olarak boşalt
sudo mv /home/claude/.ssh/authorized_keys /home/claude/.ssh/authorized_keys.disabled

# SSH service'i restart et
sudo systemctl restart sshd
```

Bu noktadan sonra Claude SSH ile bağlanamaz. Audit log'unu incelemek için sen hâlâ erişebilirsin.

### 7.2 Forensik

```bash
# Son 1 saatte ne oldu?
tail -200 /var/log/claude-audit.log

# Dosya değişiklikleri
sudo find /home/claude -newer /tmp/incident-start -type f -exec ls -la {} \;

# Network bağlantıları
sudo ss -tunap | grep claude
```

### 7.3 Toparlanma

Staging'i tamamen yeniden kur:
1. Mevcut staging VPS'i sil.
2. Hetzner snapshot'tan veya runbook'tan yeni staging kur.
3. Anonim snapshot script'i yeniden çalıştır.
4. Claude için yeni SSH key üret, eski key'i unutma listesine al.

Toplam süre: ~1 saat. Hiçbir kalıcı zarar olmaz çünkü:
- Prod izolasyon network seviyesinde garantili.
- Staging veri zaten anonim.
- Tüm prod credentials staging'de değildi.

---

## 8. Prod'da read-only Claude erişimi (opsiyonel)

Triage hızı için Claude'a **read-only** prod gözlem yetkisi verebilirsiniz. Bu staging erişimi DEĞİLDİR — yalnızca observability API'larıdır.

### 8.1 Sentry read-only token

Sentry Dashboard → Settings → Account → API → Auth Tokens → `Create New Token`:
- **Scopes:** `event:read`, `project:read`, `org:read` (sadece okuma).
- **Adı:** `claude-prod-readonly`

Token'ı `~/.claude/secrets/sentry_token` dosyasına yaz (0600 izin). Claude bu token ile Sentry events okur ama hiçbir şey yazmaz.

### 8.2 Grafana read-only token

Grafana → Service Accounts → Add → `claude-prod-readonly` → Role: `Viewer`. API key oluştur.

```bash
curl -H "Authorization: Bearer $GRAFANA_RO_TOKEN" \
  https://grafana.sinavsalonu.com/api/datasources/proxy/1/api/v1/query?query=rate(http_requests_total[5m])
```

Claude metrik query yapabilir, dashboard yaratamaz, alert kuralı değiştiremez.

### 8.3 GitHub Actions log (production deploy)

GitHub Actions API ile prod deploy log'larını okumak:
```bash
gh run list --workflow=release.yml --limit 10
gh run view <run-id> --log
```

Claude `gh` cli okumaya yetkili olur, write'a değil (`gh auth refresh -s repo:status` yerine sadece `repo:status read`).

**Net çıktı:** Prod gözlemi açık, prod yazma kapalı. Bu, "Claude triage'a yardım eder, müdahaleye karar veren sensin" modelini güçlendirir.

---

## 9. Maliyet & operasyon yükü

| Kalem | Tek seferlik | Aylık |
|---|---|---|
| Staging SSH key + user setup | 30 dk | — |
| Audit log monitoring | — | 15 dk |
| Aylık audit checklist | — | 15 dk |
| Çeyreklik SSH key rotation | 5 dk × 4/yıl | — |
| Resource limit (staging CX22 üzerinde) | — | 0 (mevcut sunucuda) |

**Toplam aylık operasyon yükü: ~30 dakika.** Karşılığında:
- Hata reprodüksiyon süresi: 2 saat → 30 dakika.
- Migration tatbikatı: manuel atlanır → otomatize edilir.
- DR drill: yıllık bir kez yapılır → aylık yapılabilir.
- Postmortem yazımı: gönülsüz → Claude taslak hazırlar, siz polish edersiniz.

**ROI:** Pozitif, ilk haftadan itibaren.

---

## 10. Genel ilkeler — pas geçilemez

1. **Staging Claude için açık, prod Claude için kapalı.** Bu ayrım üzerinde uzlaşma yok.
2. **`[STAGING]` banner görmediğin yerde Claude yazma operasyonu yapmaz.** Komut başına `hostname` veya `pwd` ile sunucu doğrulaması yap.
3. **Snapshot script Claude'un erişiminde değil.** `.env.ops` root user'a ait, mode 600. Claude prod credentials'ı görmez.
4. **Audit log her ay denetlenir.** Otomatize etmek lazım: bir cron script son ayın özetini email'ler.
5. **Şüpheli davranış → kes önce, sonra sor.** Section 7.1 prosedürü saniye saniye uygulanır.
6. **Prod read-only erişim opsiyoneldir.** Eklemek istemezsen ekleme; staging zaten Claude'a yeterli alan verir.

---

## 11. Sık karşılaşılan sorular

**S: Claude staging'i kullandığında trafik gerçek user analytics'i bozar mı?**
C: Anonim snapshot'ta zaten `ENVIRONMENT_TYPE=staging-anonymized` bayrağı var. PostHog/Sentry frontend tarafında bu bayrağı görüp staging trafiğini filtreler. Backend metrik'leri için `staging` label'ı kullanılır, prod dashboard'larında ayrı segment.

**S: Claude staging'de bir kullanıcı verisi sızdırırsa KVKK ihlali olur mu?**
C: Sızan veri anonim olduğu için **KVKK'da kişisel veri sayılmaz**. `sanitize-pii.sql` ile zaten gerçek email/isim/telefon kaldırılmış. Yine de iyi pratik: staging API erişim log'larını da audit'le (`/var/log/nginx/access.log` 90 gün rotation).

**S: Birden fazla Claude session'ı aynı anda staging'de ne olur?**
C: SSH `MaxSessions 10` default. Çakışırlarsa son komut kazanır (`UPDATE` SQL'lerinde son TX kazanır). Pratikte Claude tek seans çalışır, bir sorun olmaz.

**S: Claude staging'de PR açıp main'e merge edebilir mi?**
C: GitHub token'ında `merge` yetkisi vermeyin. `gh pr create` çalışır, `gh pr merge` reddeder. Merge'ü manuel siz yaparsınız — bu kasıtlı kontrol noktası.

**S: Lokal Claude Code yerine cloud Claude (Cowork) kullanırsam?**
C: Aynı mantık geçerli. SSH key cloud Claude'un erişebileceği bir konuma (Cowork environment variable veya MCP credentials) konulur. Audit log'ları aynı şekilde staging'de tutulur. Network outbound rules değişmez.

**S: Bir feature flag ile Claude'un staging yetkisini geçici olarak kapatabilir miyim?**
C: Evet — staging firewall'ında `ufw deny in from <your-ip>` koysan SSH erişim kesilir. Veya `claude` user'ının `authorized_keys` dosyasını bir komutla yedekleyip sıfırlarsın:
```bash
mv /home/claude/.ssh/authorized_keys{,.disabled}
```
İhtiyaç olduğunda geri yükle:
```bash
mv /home/claude/.ssh/authorized_keys{.disabled,}
```

---

## 12. Bu doküman ne zaman güncellenir?

- Claude staging'de yeni bir yetenek kazandığında (yeni MCP server, yeni tool).
- Audit'te beklenmedik bir davranış görüldüğünde (Section 7'ye yeni vaka).
- Staging mimarisi değiştiğinde (yeni servis, yeni DB).
- 6 ayda bir SSH key rotation hatırlatması.

---

## 13. Hetzner staging runbook entegrasyonu

Staging kurulumu rehberinin sonuna şu adımı ekleyin:

```markdown
### Adım X.Y: Claude AI erişimi (opsiyonel — önerilen)

`docs/ops/staging-ai-access.md` runbook'unu uygulayın.
Claude'a staging'de güvenli erişim verme, hata reprodüksiyon süresini
ciddi şekilde azaltır ve operasyon yükünü düşürür.

Atlanırsa: staging insan-only ortam olarak kalır, sorun yok ama
geliştirme döngüsü AI-yardımından mahrum kalır.
```

---

*Bu runbook tek-geliştirici + AI yardımcılı geliştirme senaryosu için yazılmıştır. Çok kişili ekiplerde ek role-based access control (RBAC) ve PR review akışları gerekir. KVKK uyumu açısından staging veri tabanı `sanitize-pii.sql` ile temizlenmiş haldedir; doküman ASLA Claude'a gerçek PII vermeyi kapsamaz.*
