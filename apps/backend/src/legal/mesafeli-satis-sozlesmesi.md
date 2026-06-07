# Mesafeli Satış Sözleşmesi + Ön Bilgilendirme Formu

> ⚠️ ŞABLON METİN — PRODUCTION ÖNCESİ AVUKAT ONAYI GEREKLİ
>
> 6502 sayılı Tüketicinin Korunması Hakkında Kanun (TKHK) m.48 ve Mesafeli
> Sözleşmeler Yönetmeliği uyarınca **her satın alma öncesi** tüketiciye
> sunulması ve onaylatılması zorunludur. `[KÖŞELİ PARANTEZ]` alanları satıcı
> bilgileri ve satın alma anı verileriyle doldurulur.

**Yürürlük tarihi:** [TARİH]
**Versiyon:** 1

## 1. Satıcı (Sağlayıcı) Bilgileri

- **Unvan:** [ŞİRKET UNVANI]
- **MERSİS:** [NO]
- **Adres:** [ADRES]
- **KEP:** [KEP]
- **E-posta:** [SATIS_EMAIL]
- **Telefon:** [TELEFON]

## 2. Alıcı (Tüketici)

Üyesi olduğu hesabın bilgileri ile satın alma yapan tüketici. Fatura ve iletişim
bilgileri sipariş anında hesap profilinden alınır.

## 3. Sözleşmenin Konusu

Alıcının, Sınav Salonu web sitesi üzerinden seçtiği **dijital içerikli** sınav
paketi (test) hizmetinin satışı ve sunumudur. Hizmet elektronik ortamda ifa
edilir; **fiziksel teslimat yoktur.**

## 4. Ön Bilgilendirme — Hizmetin Temel Nitelikleri (Yönetmelik m.5)

Aşağıdaki bilgiler, satın alma onayından önce Alıcı'ya sunulur:

| Bilgi | Alanı |
|---|---|
| Hizmet adı | [PAKET ADI — satın alma anında doldurulur] |
| Eğitici | [EĞİTİCİ KULLANICI ADI] |
| Test sayısı / Soru sayısı | [ADET] / [ADET] |
| Kullanım hakkı | Sınırsız çözüm hakkı (hesap aktif olduğu sürece) |
| Liste fiyatı (KDV dahil) | [LISTE_FIYAT] ₺ |
| Uygulanan indirim / promosyon kodu | [VARSA KOD — %X] |
| **Ödenecek tutar (KDV dahil)** | [ODENEN_TUTAR] ₺ |
| Ödeme şekli | Kredi/banka kartı ([iyzico/stripe seçili olan]) |
| İfa şekli/süresi | Ödeme onayıyla **anında** hesaba tanımlanır |
| Cayma hakkı | Dijital içerik istisnası — bkz. madde 7 |
| Şikayet/başvuru mercii | [SATIS_EMAIL] + Tüketici Hakem Heyeti/Mahkemesi |

## 5. İndirim ve Promosyon Kodu

- Alıcı, geçerli bir indirim kodu uygulayabilir; bu durumda **ödenecek tutar**
  indirimli olarak yukarıdaki tabloda ve ödeme ekranında gösterilir.
- Uygulanan kod, indirim oranı ve nihai ödenen tutar, satın alma kaydında
  **delil olarak saklanır** (raporlama ve TKHK kanıt zinciri için).
- İndirim kodları, koşulları (geçerlilik tarihi, kullanım limiti) sağlandığı
  sürece geçerlidir; kötüye kullanım hâlinde iptal edilebilir.

## 6. Hizmetin Sunulması ve Faturalandırma

- Ödemenin başarıyla tamamlanmasıyla test paketi, Alıcı'nın "Testlerim"
  sayfasında **anında erişilebilir** hale gelir.
- Satışa ilişkin fatura/bilgi fişi, mevzuata uygun şekilde düzenlenir ve
  Alıcı'nın hesabına/e-postasına iletilir.

## 7. Cayma Hakkı — DİJİTAL İÇERİK İSTİSNASI ⚠️

Mesafeli Sözleşmeler Yönetmeliği m.15/1-(ğ) uyarınca, **tüketicinin onayı ile
başlatılan ve cayma hakkı süresi sona ermeden ifa edilen elektronik ortamda
anında ifa edilen dijital içerik** teslimatına ilişkin sözleşmelerde **cayma
hakkı bulunmamaktadır.**

Satın alma onayı verildiği anda dijital içerik (sınav paketi) hesabınıza anında
tanımlandığından, yasal cayma hakkı kullanılamaz. Alıcı, satın alma onayı ile
bu istisnayı bildiğini ve cayma hakkından feragat ettiğini açıkça kabul eder.
Bu onay; tarih, IP ve tarayıcı bilgisiyle birlikte delil olarak kaydedilir.

## 8. İade Politikası (Gönüllü)

Yasal cayma hakkının bulunmadığı durumlarda dahi, Sınav Salonu aşağıdaki
**gönüllü** iade politikasını uygular:
- Pakete ait **hiçbir** teste başlanmadıysa: 14 gün içinde **tam iade**,
- Bir teste başlandıysa ama paket tamamlanmadıysa: **%50 iade**,
- Paketteki testler tamamlandıysa: iade yapılmaz.

Teknik bir hata (erişilememe, bozuk içerik) nedeniyle hizmetin hiç sunulamaması
hâlinde tam iade yapılır. İade, ödemenin yapıldığı yönteme makul sürede iade edilir.

## 9. Ödeme Güvenliği

Ödemeler PCI-DSS uyumlu Iyzico / Stripe altyapısı üzerinden alınır. Kart
bilgileri Sınav Salonu sunucularında **saklanmaz**. Ters ibraz (chargeback)
suistimali tespit edilen hesaplar askıya alınabilir.

## 10. Şikayet, İtiraz ve Yetkili Mercii

- Eğiticinin sorulu/cevaplı içeriğine itiraz: Platform "İtiraz Et" akışı,
- Ödeme/iade şikayeti: [SATIS_EMAIL] + [KEP],
- Tüketici uyuşmazlıkları: Gümrük ve Ticaret Bakanlığı'nca her yıl belirlenen
  parasal sınırlar dâhilinde **Tüketici Hakem Heyetleri**, sınırı aşan
  uyuşmazlıklarda **Tüketici Mahkemeleri** yetkilidir.
- İşbu sözleşmeden doğan uyuşmazlıklarda Türkiye Cumhuriyeti hukuku uygulanır.

## 11. Sözleşmenin Saklanması

İşbu sözleşme ve ön bilgilendirme formu, satın alma kaydıyla birlikte elektronik
ortamda saklanır; Alıcı dilediğinde "Sözleşmeler" ve satın alma geçmişi
üzerinden erişebilir.

---

**Alıcı; bu Mesafeli Satış Sözleşmesi'ni ve Ön Bilgilendirme Formu'nu okuduğunu,
hizmetin dijital içerikli olduğunu, anında ifa edileceğini ve bu nedenle
cayma hakkının bulunmadığını bilerek satın alma onayı verdiğini beyan eder.**
