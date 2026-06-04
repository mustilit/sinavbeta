# Incident Response Runbook

> **Statü:** Production sertifikasyonu — canlıya çıkmadan önce tamamlanmalı
> **Hedef:** İlk incident'ten ÖNCE hazır olmak; panik anında bu dosyayı açıp adımları izlemek
> **Versiyon:** 1.0 (iskelet — gerçek incident'lerle güncellenmeli)
> **İlgili dosyalar:**
> - `docs/observability/slo.md` — SLO hedefleri (error budget)
> - `docs/runbooks/production-deploy-hetzner.md` — deploy + rollback
> - `docs/ops/pitr-setup.md` — veri kurtarma
> - `docs/ops/anonimize-prod-snapshot.md` — staging'de reproduce

---

## 0. Genel ilkeler

**Bu doküman üç soruya cevap verir:**
1. Bir sorun olduğunda **ne kadar acil**?
2. **İlk dakikalarda** ne yaparsın?
3. Sorun çözüldüğünde **ne öğreniyoruz**?

**Üç altın kural:**

1. **Önce dur, sonra düşün, sonra hareket et.** İlk 30 saniyede paniğe kapılıp prod'da `git revert HEAD && deploy` çalıştırmak çoğu zaman durumu kötüleştirir. Önce **neyin bozulduğunu** anla.

2. **Trafiği koru, sonra düzelt.** Bir feature bozulduysa o feature'ı kapat (feature flag, rate limit, circuit breaker) ve geri kalan trafiği yaşat. Tüm sistemi rollback etmek genellikle aşırı tepkidir.

3. **Önce kanıtı topla, sonra müdahale et.** Production'da hata oluştuğunda log, metrik, request ID **gerçek zamanda kayboluyor**. Müdahaleden önce 30 saniye kanıt toplamaya ayır — yoksa postmortem yazılamaz.

---

## 1. Severity matrisi

Her incident bir SEV seviyesine atanır. Bu, **ne kadar hızlı müdahale + kim haberdar olur** ayarlamasıdır.

| Severity | Tanım | Örnek | Müdahale | Bildirim |
|---|---|---|---|---|
| **SEV1** | Veri kaybı veya **tüm sistem down** | DB silindi, herkes 500 alıyor, ödeme almayı tamamen durdurduk | **Hemen** (gece olsa bile) | Kendine + tüm kullanıcılara status sayfası |
| **SEV2** | Kritik feature down, kullanıcı segmenti etkilenmiş | Ödeme akışı bozuk, kayıt çalışmıyor, AI moderasyon hata veriyor | < 1 saat | Kendine + etkilenen kullanıcılara email |
| **SEV3** | Bir feature degrade, çoğu kullanıcı etkilenmemiş | İade akışı yavaş, bir admin sayfası boş, search çalışmıyor | < 24 saat | Kendine, planla |
| **SEV4** | Cosmetic / minor | Bir buton yanlış renkte, i18n çeviri eksik | Sıradaki sprint | Issue olarak aç |

**Pratik kural:** Karar veremiyorsan **bir seviye yukarı** çık. SEV3 sanırken SEV2 olduğu anlaşılınca tepki gecikmiş olur; SEV2 sandığın SEV3 çıkınca panik boşa gider — bedeli düşüktür.

---

## 2. İlk 5 dakika — Triage

Sentry alarmı geldiğinde (veya Slack'te / Telegram'da bildirim aldığında):

### 2.1 Telefonu/laptop'u aç, bu dosyayı bul

`docs/runbooks/incident-response.md`. Kafanı bu dosya dışına çıkarma. Stack Overflow'a girme. Twitter'a bakma.

### 2.2 Üç soruya cevap ver

**Soru 1: Kullanıcı etkileniyor mu?**
- Sentry → "Last 5 minutes" filtrele. Etkilenen user sayısı?
- 1 kullanıcı → muhtemelen edge case. Devam et ama panik yok.
- 10+ kullanıcı → SEV2 minimum.
- 100+ kullanıcı → SEV1.

**Soru 2: Veri kaybı riski var mı?**
- Hatanın endpoint'i `DELETE` veya `UPDATE` mi? → SEV1.
- Sadece `GET` mi? → Read hata, veri kaybı yok. Rahatla, devam et.
- Migration koştu mu? → DB log'una bak (`/var/log/postgresql/*.log`), son `ALTER TABLE` ne zamandı?

**Soru 3: Sistemin geri kalanı çalışıyor mu?**
- Frontend yükleniyor mu? (Tarayıcıdan https://sinavsalonu.com'u aç)
- `/health` endpoint'i 200 dönüyor mu? `curl https://sinavsalonu.com/api/health`
- DB ayakta mı? Sentry tarafında `connection refused` mesajı var mı?

### 2.3 Severity belirle ve devam et

Üç sorunun cevabına göre yukarıdaki matristen severity seç.

---

## 3. İlk 15 dakika — Kapsam belirleme

### 3.1 Veriyi topla

```bash
# SSH ile prod sunucusuna gir (read-only operasyon)
ssh -i ~/.ssh/hetzner_sinav root@<prod-ip>

# Son 5 dakika backend log
docker logs --since 5m sinav-backend 2>&1 | tail -200

# Nginx error log
tail -100 /var/log/nginx/error.log

# Postgres aktif sorgu
sudo -u postgres psql -d sinavsalonu -c "
  SELECT pid, query_start, state, query
  FROM pg_stat_activity
  WHERE state != 'idle'
  ORDER BY query_start;
"

# Redis bağlantı sayısı
redis-cli INFO clients
```

### 3.2 Request ID korelasyonu

Etkilenen kullanıcıdan veya Sentry event'ten **request ID** al. Bunu üç yerde ara:

1. **Sentry breadcrumb** — kullanıcının ne yaptığı.
2. **Backend log** — `grep <request-id> /var/log/sinav/backend.log`.
3. **Nginx access log** — `grep <request-id> /var/log/nginx/access.log`.

Üçü aynı zaman dilimine işaret ediyorsa, hata gerçek. Bir tanesi bulamıyorsa proxy/routing sorunu olabilir.

### 3.3 Yakın zamanda ne değişti?

```bash
# Son deploy ne zaman?
git log --oneline -n 5 origin/main

# Son migration ne zaman?
ls -lt apps/backend/prisma/migrations/ | head -5
```

Eğer hata son deploy'dan sonra başladıysa **muhtemel sebep**: yeni kod. Rollback'i değerlendir.

Eğer hata son deploy'dan günler önce başladıysa **muhtemel sebep**: veri, trafik patlaması, external service.

---

## 4. İlk 30 dakika — Mitigation (durdur, sonra düzelt)

Sırayla dene; ilk işe yarayanda dur:

### 4.1 Feature flag ile durdur (en ucuz çözüm)

Eğer bozulan feature'ın bir kill-switch'i varsa (AdminSettings'te `ad_purchases_enabled`, `email_kill_switch` gibi):

```sql
-- Prod DB'de admin user ile
UPDATE admin_settings
SET "featureName" = false
WHERE id = 1;
```

Ya da admin paneli üzerinden → kapatılan feature, hata vermez. Sistem yaşar.

### 4.2 Circuit breaker manuel devreye al

`circuitBreaker.ts` registry'sinde manuel intervention:
```bash
# Prod backend SSH
docker exec -it sinav-backend sh
# Backend admin endpoint'i ile breaker'ı zorla OPEN'a al
curl -X POST http://localhost:3000/v1/admin/breakers/stripe/open \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

(Eğer bu endpoint yoksa eklenmeli — admin breaker yönetimi için sprint task.)

### 4.3 Rate limit ile boğ

Belirli bir endpoint trafiği yiyiyorsa nginx rate limit'i geçici sıkılaştır:

```nginx
# /etc/nginx/conf.d/rate-limit.conf (geçici)
limit_req_zone $binary_remote_addr zone=emergency:10m rate=1r/s;

location /api/problematic-endpoint {
    limit_req zone=emergency burst=5;
    proxy_pass http://backend;
}
```

```bash
nginx -t && systemctl reload nginx
```

### 4.4 Rollback (son çare)

Önceki deploy'a geri dön. Hetzner runbook'ta deploy adımının tersi:

```bash
# Önceki tag'i çek
git fetch --tags
git checkout v1.5.0   # son stabil sürüm

# Docker image rebuild + restart
cd /opt/sinavsalonu
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

**Önce migration'ı geri al gerekebilir.** Aşağı yönlü migration yoksa (Prisma'da default yok) **veri kaybı riski** var — bu durumda PITR'a git.

### 4.5 PITR ile geri al (veri kaybı durumunda)

`docs/ops/pitr-setup.md` Senaryo A'yı uygula. Restore noktası: hatadan 1 dakika önce.

---

## 5. 1 saat — İletişim

### 5.1 Kullanıcılara bildirim

SEV1 + SEV2 için:
- **Status sayfası** (varsa — yoksa Twitter/X veya in-app banner) güncelle.
- Etkilenen kullanıcılara email (Brevo + AuditLog → kim etkilendi → kime mail).
- Telegram/Slack moderatör grubuna durum.

**Şablon — kullanıcıya:**

```
Merhaba,

[Tarih, saat] itibarıyla Sınav Salonu'nda [feature/akış] geçici olarak
hizmet veremedi. Şu an [durum: çözüldü / üzerinde çalışıyoruz].

Hesabınızda / verilerinizde herhangi bir kayıp [olmadı / yaşandı, detay].

[Eğer ödeme/iade etkilendiyse:] Etkilenen işleminiz [otomatik geri yükleyeceğiz
/ destek talebi açabilirsiniz].

Önümüzdeki saatler içinde detaylı bilgilendirme için size geri döneceğiz.

İyi günler,
Sınav Salonu Ekibi
```

### 5.2 Sosyal medya / status sayfası

Eğer kamu görünürlüğü varsa (basın, Twitter şikayet):

```
🟡 Şu an Sınav Salonu'nda [feature] erişiminde sorun yaşıyoruz.
Üzerinde çalışıyoruz, en kısa sürede güncelleme yapacağız.
[Zaman]
```

Çözüldüğünde:
```
✅ Sorun çözüldü. [Saat]-[Saat] aralığında [açıklama]. Kalıcı veri kaybı
yaşanmadı. Sabrınız için teşekkürler.
```

---

## 6. Sonrası — Postmortem (24-72 saat içinde)

İncident kapandıktan sonra:

### 6.1 Postmortem dokümanı

`docs/postmortems/YYYY-MM-DD-{slug}.md` olarak yaz. Şablon:

```markdown
# Postmortem: [Kısa başlık]

**Tarih:** YYYY-MM-DD
**Süre:** HH:MM - HH:MM (Toplam: X dakika)
**Severity:** SEV1 / SEV2 / SEV3
**Etkilenen kullanıcı:** ~X kişi
**Yazarlar:** [İsim]

## Özet
[1 paragraf — ne oldu, ne yaptık]

## Zaman çizelgesi
- HH:MM — Sentry alarmı
- HH:MM — Triage başladı
- HH:MM — Root cause tespit edildi
- HH:MM — Mitigation uygulandı
- HH:MM — Doğrulama
- HH:MM — Status kapatıldı

## Root cause
[Asıl sebep — kod, veri, external service, vs.]

## Etki
- Etkilenen kullanıcı: X
- Etkilenen işlem: X
- Veri kaybı: var/yok
- Ödeme etkisi: var/yok

## Ne iyi gitti
[Hızlı tespit ettin mi? Doğru karar verdin mi?]

## Ne kötü gitti
[Hangi log/metrik eksikti? Hangi süreç çalışmadı?]

## Aksiyonlar
- [ ] [Kod fix] [Tahmini sprint]
- [ ] [Monitoring eklenmesi]
- [ ] [Runbook güncellemesi]
- [ ] [Test eklenmesi]

## Öğrenilen ders
[1-2 cümle — bu olaydan ne çıkarıyoruz?]
```

### 6.2 Blameless kültür

Postmortem **kişiyi suçlamaz, süreci sorgular**. "Kod yazan kişi" değil, "kodun bu hatayı yakalamayan testler" sorumludur. "Migration'ı koşan kişi" değil, "migration'ı staging'de test edemeyen süreç" sorumludur.

Tek-geliştirici olarak kendinize de aynı şefkati uygulayın — hata yapan kişi sizsiniz, ama düzeltilmesi gereken **süreç**tir.

---

## 7. Playbook'lar — En yaygın senaryolar

### 7.1 Database connection pool tükendi

**Belirti:** `connection pool exhausted`, `too many connections`, response time'lar fırlıyor.

**Kontrol:**
```sql
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

100+ idle connection varsa **leak var** — kod connection'ı close etmiyor.

**Mitigation:**
```bash
# Backend pod'larını restart et (PgBouncer pool reset)
docker-compose restart backend worker
```

**Permanent fix:** Prisma `connection_limit` ve `pool_timeout` ayarlarını kontrol et. PgBouncer transaction mode'da mı?

### 7.2 Disk dolu

**Belirti:** "no space left on device", upload başarısız, log yazılamıyor.

**Kontrol:**
```bash
df -h
du -sh /var/log/* | sort -h | tail -10
du -sh /opt/sinavsalonu/uploads/
```

**Mitigation:**
```bash
# Eski log'ları temizle
find /var/log/sinav -name "*.log.*" -mtime +7 -delete

# Docker image cache temizle
docker system prune -a -f

# Geçici dump dosyaları
rm -rf /tmp/sinav_*.dump
```

**Permanent fix:** logrotate ekle, eski upload'ları S3'e taşı.

### 7.3 Stripe webhook reddediliyor

**Belirti:** Stripe Dashboard'da "webhook deliveries failing", kullanıcı ödeme yaptı ama hesabı upgrade olmadı.

**Kontrol:**
```bash
# Sentry'de "verifyWebhookSignature" hatalarına bak
# Sebep: STRIPE_WEBHOOK_SECRET yanlış mı, timestamp tolerance mı geçti?

docker exec -it sinav-backend cat /app/.env | grep STRIPE
```

**Mitigation:**
- Stripe Dashboard → Webhooks → "Resend failed events".
- `WebhookEvent` tablosunda manuel kayıt oluştur (idempotency korur).

**Permanent fix:** Tolerance time configurable yap, monitoring ekle.

### 7.4 Yanlış migration koştu

**Belirti:** Schema corrupt, Prisma generate başarısız, `column does not exist`.

**Kontrol:**
```bash
# Hangi migration son koştu?
sudo -u postgres psql -d sinavsalonu -c "SELECT * FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;"
```

**Mitigation:** PITR ile migration'dan 1 dakika öncesine geri dön (`docs/ops/pitr-setup.md` Senaryo A).

**Permanent fix:** Migration'ı staging'de önce dene + üç aşamalı yıkıcı migration disiplini.

### 7.5 Redis full / OOM

**Belirti:** Redis `OOM command not allowed`, BullMQ job'lar takılı.

**Kontrol:**
```bash
redis-cli INFO memory | grep used_memory_human
redis-cli DBSIZE
```

**Mitigation:**
```bash
# Eski idempotency lock'larını temizle (24h TTL var ama bazen takılı kalır)
redis-cli --scan --pattern 'idemp:*' | head -1000 | xargs redis-cli DEL

# Geçici çözüm: maxmemory artır
redis-cli CONFIG SET maxmemory 512mb
```

**Permanent fix:** TTL kontrolü, BullMQ stale job temizleme cron.

### 7.6 SSL sertifika expire oldu

**Belirti:** Tarayıcı "Your connection is not private", curl `certificate verify failed`.

**Kontrol:**
```bash
echo | openssl s_client -connect sinavsalonu.com:443 2>/dev/null | openssl x509 -noout -dates
```

**Mitigation:**
```bash
# Certbot manuel renew
certbot renew --force-renewal
systemctl reload nginx
```

**Permanent fix:** Certbot timer aktif mi? `systemctl status certbot.timer`. Hetzner runbook'ta var, ama doğrula.

---

## 8. İletişim şablonları

### 8.1 Sentry → Telegram/Slack alarm

`.github/workflows/` veya Sentry config'de:

```yaml
# Slack webhook
on_event:
  error:
    severity: error
    notify: slack-channel
    template: |
      🚨 SENTRY ALERT
      Project: sinav-prod
      Issue: {{ title }}
      Users affected: {{ user_count }}
      URL: {{ url }}
```

### 8.2 Status sayfası (basit HTML)

Eğer karmaşık çözüm istemiyorsanız, GitHub Pages'te statik HTML:

```html
<!-- status.sinavsalonu.com/index.html -->
<!DOCTYPE html>
<html><head><title>Sistem Durumu</title></head>
<body>
  <h1>Sınav Salonu — Sistem Durumu</h1>
  <p>Son güncelleme: 2026-06-15 14:32 TSİ</p>
  <ul>
    <li>🟢 Marketplace — Normal</li>
    <li>🟢 Test Çözme — Normal</li>
    <li>🟡 Canlı Sınav — Kısmi sorun (üzerinde çalışıyoruz)</li>
    <li>🟢 Ödeme — Normal</li>
  </ul>
</body></html>
```

İhtiyaç çıkınca tek dosyayı `git push` ile güncellersiniz.

---

## 9. Incident yaşamadan hazırlık

**Aylık tatbikat (1 saat):**
1. **Chaos test:** Staging'de "DB'yi kapat ne olur?" denersin. Backend doğru hata mı veriyor? Frontend graceful mi davranıyor?
2. **PITR restore:** Staging'de bir tabloyu sil, PITR ile geri al. Restore süresi ölç.
3. **Rollback testi:** Staging'de yanlış migration koş, rollback uygula. Adımları unutmadıysan emin ol.

**Çeyreklik tatbikat (yarı gün):**
1. **Disaster recovery:** Hetzner snapshot'tan yeni VPS oluştur, DNS yönlendir, prod simülasyonu.
2. **Backup integrity:** B2'deki en eski full backup'ı yeni cluster'a restore et. Çalışıyor mu?

Bu tatbikatları yapmıyorsanız PITR + DR planınız **olmuyor demektir** — sadece dokümante edilmiş bir umut.

---

## 10. Üst seviye hatırlatma

İlk gerçek incident'inizi yaşadığınızda:

- ✅ Sakin ol. Sistemler arızalanır. Bu mühendisliğin doğasıdır.
- ✅ Bu dokümana bak. Adımları takip et.
- ✅ Bir şeyi commit etmeden önce ne yapacağını tek satırda yaz (notepad'e).
- ✅ Yardım iste. (Tek geliştiriciyseniz: bir mentora veya Discord topluluğuna sor — çok hata bir çift göz ile çözülür.)
- ❌ Gece 03:00'te kod yazma. Mitigation yap, bant genişliği ver, sabah düzelt.
- ❌ Aynı anda 3 şeyi değiştirme. Tek değişiklik, doğrula, devam.
- ❌ Postmortem yazmadan unutma. 3 hafta sonra detayı hatırlamayacaksın.

---

## 11. Bu dosyanın bakımı

Her gerçek incident sonrası:
1. Bu runbook'ta eksik bir adım/senaryo var mıydı? Ekle.
2. Yeni playbook (Bölüm 7'ye) ekle.
3. Postmortem'i `docs/postmortems/`'e yaz, buradan link ver.

**Hedef:** 1 yıl sonra bu runbook 3 kat daha kapsamlı olsun. Her incident bir öğrenme. Her öğrenme bu dosyaya kayıt.

---

*Bu runbook Sınav Salonu için yazılmıştır. Genel SRE prensipleri için: Google SRE Workbook (https://sre.google/workbook/) — özellikle "Managing Incidents" bölümü.*
