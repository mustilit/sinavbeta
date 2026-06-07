# KVKK Aydınlatma Metni

> ⚠️ ŞABLON METİN — PRODUCTION ÖNCESİ AVUKAT ONAYI GEREKLİ
>
> Bu metin taslaktır. `[KÖŞELİ PARANTEZ]` alanları (veri sorumlusu kimliği,
> başvuru kanalları) gerçek bilgilerle doldurulmalı ve hukuk danışmanınca
> onaylanmalıdır.

**Yürürlük tarihi:** [TARİH]
**Versiyon:** 1

## 1. Veri Sorumlusu

İşbu Aydınlatma Metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu
("KVKK") m.10 uyarınca Veri Sorumlusu sıfatıyla [ŞİRKET UNVANI]
(MERSİS: [NO], adres: [ADRES], KEP: [KEP]) tarafından hazırlanmıştır.

## 2. İşlenen Kişisel Veriler

### Hesap verileri
- E-posta adresi, kullanıcı adı
- Ad / soyad (eğitici hesapları için zorunlu, aday için opsiyonel)
- Hesap parolası (geri döndürülemez şekilde hash'lenir — bcrypt)
- Profil fotoğrafı (yüklediğiniz takdirde)

### Kullanım ve cihaz verileri
- Giriş zamanı, IP adresi, tarayıcı/işletim sistemi bilgisi (cihaz parmak izi)
- Sınav çözüm performansı (doğru/yanlış sayısı, süre, konu dağılımı)
- Satın alma geçmişi, bildirim tercihleri, oturum/çerez verileri

### Ödeme verileri
- Fatura adresi ve fatura bilgileri
- Kart bilgileri **Sınav Salonu'nda saklanmaz**; Iyzico / Stripe gibi PCI-DSS
  uyumlu ödeme sağlayıcıları işler. Yalnızca son 4 hane ve ödeme referans ID saklanır.

### İletişim verileri
- Destek talebi yazışmaları
- KVKK başvuru / cayma / iade talepleri ve bunlara ilişkin delil kayıtları
  (onay tarihi, IP, tarayıcı bilgisi)

## 3. İşleme Amaçları ve Hukuki Sebepler

| Amaç | Hukuki sebep |
|---|---|
| Hizmet sunma (sınav çözme, satın alma) | Sözleşmenin kurulması/ifası (KVKK m.5/2-c) |
| Faturalandırma + muhasebe | Yasal yükümlülük (V.U.K.) |
| Müşteri destek + şikayet çözme | Meşru menfaat (KVKK m.5/2-f) |
| Güvenlik (brute force, fraud, kötüye kullanım) | Meşru menfaat |
| Sözleşme onay delili (TKHK m.48 kanıt zinciri) | Yasal yükümlülük + meşru menfaat |
| Pazarlama e-postası, kampanya | **Açık rıza** (KVKK m.5/1) — ayrı onay |
| Ürün analitiği (PostHog) | **Açık rıza** (consent verilirse) |
| Yasal başvuru / mahkeme talebi | Yasal yükümlülük |

## 4. Aktarımlar

Verileriniz, hizmetin sunulması için gerekli olduğu ölçüde aşağıdaki üçüncü
taraflara aktarılabilir:

| Alıcı | Amaç | Yer |
|---|---|---|
| Iyzico / Stripe | Ödeme işleme | AB / Türkiye |
| Brevo (mail sağlayıcı) | Bilgilendirme + (rıza varsa) pazarlama e-postası | AB sunucular |
| Cloudflare / Vercel / CDN | Site hizmet altyapısı, içerik dağıtımı | Küresel |
| Sentry | Hata izleme (PII filtrelenir) | AB (EU region) |
| PostHog | Ürün analitiği (yalnızca consent verdiyseniz) | AB |
| Yasal merciler | Mahkeme / KVKK Kurulu kararı | TR |

Yurtdışı aktarımları KVKK m.9 kapsamında, gerekli güvenceler sağlanarak yapılır.

## 5. Veri Güvenliği Tedbirleri

Kişisel verilerinizin güvenliği için alınan teknik ve idari tedbirler:
- Parolaların geri döndürülemez hash'lenmesi (bcrypt), aktarımda TLS şifreleme,
- Sağlayıcı API anahtarları ve hassas sırların AES-256-GCM ile şifreli saklanması,
- Yetki matrisi ve rol bazlı erişim kontrolü; admin işlemlerinde **denetim
  (audit) log** kaydı,
- Ödeme verilerinin platformda tutulmaması (PCI-DSS uyumlu sağlayıcıya devri),
- Anomali/fraud tespiti, oturum ve cihaz doğrulama mekanizmaları.

## 6. Otomatik Karar Verme ve Profilleme

- Sınav performansınız (konu bazlı başarı, süre) **istatistiksel raporlama**
  amacıyla işlenir; bu işleme hukuki sonuç doğuran tam otomatik bir karar
  niteliğinde değildir.
- İçerik moderasyonunda otomatik risk skorlama kullanılabilir; ancak yaptırım
  öncesi insan incelemesi esastır. KVKK m.11 uyarınca otomatik işleme sonucuna
  itiraz hakkınız saklıdır.

## 7. Saklama Süreleri

| Veri kategorisi | Saklama süresi |
|---|---|
| Hesap verileri | Hesap aktifken + silme sonrası 30 gün (anti-fraud) |
| Satın alma / fatura kayıtları | 10 yıl (V.U.K.) |
| Sözleşme onay delilleri (IP/UA/tarih) | İlgili satın alma kaydı süresince |
| Mail içeriği (full HTML) | 90 gün, sonra anonimleştirilir (sadece metrik) |
| Audit log | 2 yıl |
| Sınav cevapları + skor | Hesap aktifken |

Hesap silme talebinde ham kişisel veriler 30 gün içinde silinir; anonim hale
getirilmiş istatistik veriler (örn. konu başarı oranı, eğitici puanı) korunur.

## 8. Veri İhlali Bildirimi

Kişisel verilerinizin hukuka aykırı olarak üçüncü kişilerce ele geçirilmesi
hâlinde, ilgili ihlal KVKK ve Kurul düzenlemeleri uyarınca **en kısa sürede**
(Kurul'a kural olarak 72 saat içinde) ve etkilenen ilgili kişilere makul sürede
bildirilir.

## 9. Haklarınız (KVKK m.11)

KVKK m.11 uyarınca; verilerinizin işlenip işlenmediğini öğrenme, bilgi talep
etme, amaca uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü
kişileri öğrenme, eksik/yanlış işlenmişse düzeltilmesini, silinmesini/yok
edilmesini ve bunların aktarıldığı üçüncü kişilere bildirilmesini isteme,
otomatik sistemlerle aleyhinize sonuç çıkmasına itiraz etme ve kanuna aykırı
işleme nedeniyle zararınızın giderilmesini talep etme haklarına sahipsiniz.

## 10. Açık Rızanın Geri Çekilmesi

Pazarlama ve analitik gibi açık rızaya dayalı işlemeler için verdiğiniz rızayı
dilediğiniz zaman **"Profil → Bildirim Tercihleri"** sayfasından veya e-posta
alt bilgisindeki "abonelikten çık" bağlantısından geri çekebilirsiniz. Geri
çekme, o ana kadarki işlemelerin hukukiliğini etkilemez.

## 11. Çocukların Verileri

Platform 18 yaş ve üzeri kullanıma yöneliktir. 18 yaş altı kullanıcıların
verileri ancak veli/vasi onayı ile işlenir; bu durum tespit edilmeden işlenen
veriler talep üzerine silinir.

## 12. Çerezler

| Çerez türü | Amaç | Rıza |
|---|---|---|
| Zorunlu | Oturum, güvenlik, dil/tema tercihi | Gerekmez |
| Analitik | Kullanım istatistikleri (PostHog) | Açık rıza |
| Pazarlama | Kampanya ölçümleme | Açık rıza |

Çerez tercihlerinizi tarayıcınızdan ve (varsa) platform çerez panelinden
yönetebilirsiniz.

## 13. Başvuru

KVKK başvuruları için:
- E-posta: [KVKK_BASVURU_EMAIL]
- KEP: [KEP_ADRESI]
- Posta: [ADRES]

Başvurunuz, niteliğine göre en geç **30 gün** içinde ücretsiz olarak
sonuçlandırılır (işlemin ayrıca maliyet gerektirmesi hâlinde Kurul tarifesi uygulanır).

---

**Üye, bu Aydınlatma Metni'ni okuduğunu ve KVKK m.10 kapsamında
bilgilendirildiğini kayıt sırasındaki onay ile beyan eder. Pazarlama ve analitik
amaçlı işleme için ayrıca AÇIK RIZA verilmesi gerekir.**
