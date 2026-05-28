# Değişiklik Günlüğü

Bu projede yapılan tüm önemli değişiklikler bu dosyada belgelenir.

Format [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) ve [Semantic Versioning](https://semver.org/lang/tr/) standartlarına uygundur.

## [1.1.0](https://github.com/mustilit/sinavsalonu1_6/compare/v1.0.1...v1.1.0) (2026-05-28)

### ✨ Özellikler

* **sprint10:** production sertifikasyonu — graceful shutdown + circuit breaker + Grafana/Prometheus + replica routing + SLO ([fab304d](https://github.com/mustilit/sinavsalonu1_6/commit/fab304d74cf511dd1a27592b66606c5a85f1c667)), closes [#1](https://github.com/mustilit/sinavsalonu1_6/issues/1) [#2](https://github.com/mustilit/sinavsalonu1_6/issues/2) [#3](https://github.com/mustilit/sinavsalonu1_6/issues/3) [#4](https://github.com/mustilit/sinavsalonu1_6/issues/4) [#5](https://github.com/mustilit/sinavsalonu1_6/issues/5)
* **sprint11:** mobil UX + performans — Brotli + Sharp + PWA + Lighthouse + mobile a11y + onboarding ([aa43902](https://github.com/mustilit/sinavsalonu1_6/commit/aa439025e604ed5ed22efb732f4dc5432c6f76e1)), closes [#1](https://github.com/mustilit/sinavsalonu1_6/issues/1) [#2](https://github.com/mustilit/sinavsalonu1_6/issues/2) [#3](https://github.com/mustilit/sinavsalonu1_6/issues/3) [#4](https://github.com/mustilit/sinavsalonu1_6/issues/4) [#5](https://github.com/mustilit/sinavsalonu1_6/issues/5) [#6](https://github.com/mustilit/sinavsalonu1_6/issues/6)
* **sprint12:** performance polish — bundle split + AVIF + strict touch target ([0891937](https://github.com/mustilit/sinavsalonu1_6/commit/08919372279c30e4aa84a472998d752d2f60163e)), closes [#1](https://github.com/mustilit/sinavsalonu1_6/issues/1) [#2](https://github.com/mustilit/sinavsalonu1_6/issues/2) [#3](https://github.com/mustilit/sinavsalonu1_6/issues/3)

### 📚 Dokümantasyon

* **sprint12:** CLAUDE.md + skill + agent dokümanlarını Sprint 12 koduyla senkronize et ([b505f68](https://github.com/mustilit/sinavsalonu1_6/commit/b505f6864154b9793af925cc94c176dbe14656cd)), closes [#3](https://github.com/mustilit/sinavsalonu1_6/issues/3)
* **sprints:** CLAUDE.md + skill + agent dokümanlarını Sprint 10/11 koduyla senkronize et ([5998179](https://github.com/mustilit/sinavsalonu1_6/commit/59981798b94031d1f6d26912fabe86efe759c917)), closes [#5](https://github.com/mustilit/sinavsalonu1_6/issues/5) [#2](https://github.com/mustilit/sinavsalonu1_6/issues/2) [#3](https://github.com/mustilit/sinavsalonu1_6/issues/3)

## [1.0.1](https://github.com/mustilit/sinavsalonu1_6/compare/v1.0.0...v1.0.1) (2026-05-27)

### 🐛 Düzeltmeler

* **frontend-tests:** mock güçlendirmeleri sprint 7 agent follow-up ([ae1f07e](https://github.com/mustilit/sinavsalonu1_6/commit/ae1f07e80e70a06bc04b5355e8bc75187302b0cb))

### 🔧 Bakım

* sprint 6 — hızlı kapamalar (8 iş tamamı) ([7b9b746](https://github.com/mustilit/sinavsalonu1_6/commit/7b9b746c62e5eb45d827a6e111293f56801ce7c5))
* sprint 7+8+9 + frontend Vitest sprint (16 dosya) ([61faa23](https://github.com/mustilit/sinavsalonu1_6/commit/61faa23f190d0cea8a09f863b40ea96e005357cd)), closes [#19](https://github.com/mustilit/sinavsalonu1_6/issues/19)
* **sprint9:** read replica router + CDN URL helper ([4bdefb9](https://github.com/mustilit/sinavsalonu1_6/commit/4bdefb936ff3409246a808ce00cc5e9a082447e6)), closes [#21](https://github.com/mustilit/sinavsalonu1_6/issues/21) [#22](https://github.com/mustilit/sinavsalonu1_6/issues/22)

## 1.0.0 (2026-05-27)

### ✨ Özellikler

* "+ Soru Ekle" tıklayınca düzenleme dialog'u otomatik açılsın ([f781037](https://github.com/mustilit/sinavsalonu1_6/commit/f781037c8d740e411738ebe466e0ff5f04d803ad))
* "Önizleme →" eksik sorularda engellesin, kırmızı çerçeveyle uyarsın ([b69d553](https://github.com/mustilit/sinavsalonu1_6/commit/b69d5531dd6a2448ba5e29b6d13a6a90184481cd))
* aday için konu bazlı performans raporu (MyTopicReport) ([61a26f3](https://github.com/mustilit/sinavsalonu1_6/commit/61a26f3b92be121285ca698ebc97c1f7a28dd27b))
* add forgot password / reset password flow ([fa80950](https://github.com/mustilit/sinavsalonu1_6/commit/fa8095087315da1c5e1bece466ff2ab8cf22da98))
* add question reports for educators/admin and solutions feature for tests ([a9fbbb1](https://github.com/mustilit/sinavsalonu1_6/commit/a9fbbb17c04ffe401c9a5dca554ed7ac1a08402f))
* add test attempt timer and SaaS packages ([91f7e55](https://github.com/mustilit/sinavsalonu1_6/commit/91f7e55169d755b68155122bb11c4722eb560bf7))
* admin candidate profile report with bulk email ([9b6c745](https://github.com/mustilit/sinavsalonu1_6/commit/9b6c7457c68810bfa4adcc7a298e2009951856d2))
* admin educator profile report with bulk email ([cbdf8ec](https://github.com/mustilit/sinavsalonu1_6/commit/cbdf8ec7a03b20546ccca8278e0922a82241802f))
* admin reklam raporu + komisyon raporuna normal/canlı test ayrımı ([241cc45](https://github.com/mustilit/sinavsalonu1_6/commit/241cc45961ed1d6268212ee9f023dd6a57fef0d1))
* **admin:** AdminUserActivity — İşlem Tipi filtresi (gruplu Select) ([ae237bc](https://github.com/mustilit/sinavsalonu1_6/commit/ae237bc622d5be2c6f927dc9d4ad2188488fbf8d))
* **admin:** AdminUserActivity — kullanıcı işlem geçmişi sayfası ([278b3bb](https://github.com/mustilit/sinavsalonu1_6/commit/278b3bbb315464b99ad13f26483983a585eb2f95))
* **admin:** AdminUserActivity — Varlık ID yerine anlaşılır label + link ([cf4153d](https://github.com/mustilit/sinavsalonu1_6/commit/cf4153db0ee5c4c8e62b0c750383d2af46ff58cf))
* **admin:** reklam paketleri yönetim sayfası (AdminAdPackages) ([324ae65](https://github.com/mustilit/sinavsalonu1_6/commit/324ae65281982db5f3dd912b6a4ee5ee7ec7bc8d))
* **attempt:** hasSolutions=true testlerde aktif sınav sırasında da çözüm gönder ([e56fcff](https://github.com/mustilit/sinavsalonu1_6/commit/e56fcff3c86d7a494a1556f5c5d96dd756bf5a1c))
* **attempt:** süre aşımı engelleyici değil bilgilendirici — backend overtime'da cevap kabul eder ([77eba3e](https://github.com/mustilit/sinavsalonu1_6/commit/77eba3e8a65a497f77761c216590731794bb29a0))
* canlı test sıralı oturum akışı — ödeme sonrası listeye, sıralı başlat ([f6dab42](https://github.com/mustilit/sinavsalonu1_6/commit/f6dab42fd51cb66d841008744930c70f25c92c1e))
* CreateTest 3 adımlı wizard (Paket→Sorular→Önizleme) + shared QuestionForm/TestPreviewModal ([20f23c7](https://github.com/mustilit/sinavsalonu1_6/commit/20f23c7d36769ca01cfa3f7eb912c9f3c59dbe10))
* eğitici reklam/öne çıkarma sistemi (FR-E-07) ([4ca4e4f](https://github.com/mustilit/sinavsalonu1_6/commit/4ca4e4fb7b37312ffcb2297a458523ed0f261785))
* email trafik yönetimi + içerik moderasyonu (Brevo + SMTP + ContentSafety) ([9a16b67](https://github.com/mustilit/sinavsalonu1_6/commit/9a16b6760afa54ca7aaab28945c5592a10e8a352))
* **Explore:** Fiyat ve Eğitici filtreleri yeniden tasarlandı ([8fd3451](https://github.com/mustilit/sinavsalonu1_6/commit/8fd34515ada2fa6e8824730d48d0a357e6f46dbc))
* **Explore:** satın alınanları gizle + ilgi alanı bazlı sıralama ([285ea20](https://github.com/mustilit/sinavsalonu1_6/commit/285ea2040ea32b358cfd182fa253fd46b4f8eaba))
* **frontend:** lazy code-splitting, dark mode, anti-flash ([f0517c3](https://github.com/mustilit/sinavsalonu1_6/commit/f0517c32e8ead7f4fae0b0b653392ce26f574dc3))
* harden db/redis config and add idempotency base ([34750c0](https://github.com/mustilit/sinavsalonu1_6/commit/34750c0cc7e87128724d652de1fa33087efc1b99))
* harden login brute-force protection and throttle handling ([c3937d3](https://github.com/mustilit/sinavsalonu1_6/commit/c3937d33d902bdf437ca330dfa1a0db3851632ca))
* introduce multi-tenant and SaaS operational foundation ([bc20587](https://github.com/mustilit/sinavsalonu1_6/commit/bc20587997e44a890a6ee361bb142ededa778d00))
* **live:** currentParticipantCount kolonu ve backfill migration ([55d5ec7](https://github.com/mustilit/sinavsalonu1_6/commit/55d5ec7e39bf9d44efe0a8a22e5fe87884b35349))
* **live:** eğitici aynı anda iki canlı oturum başlatamaz ([9668c96](https://github.com/mustilit/sinavsalonu1_6/commit/9668c965bb4e482773c66bf48f06711aa3bbdb1a))
* **live:** görsellere hover'da büyüteç + lightbox ([a310306](https://github.com/mustilit/sinavsalonu1_6/commit/a31030671819a06dd7e9b2a659fc909615f2cc32))
* **live:** Round 1 ENDED'de Round 2 DRAFT otomatik oluştur ([1c4daf4](https://github.com/mustilit/sinavsalonu1_6/commit/1c4daf4d112f84ff712fd9c451a02d1f8d9a673a))
* **live:** seçeneklere görsel desteği — schema + tüm katmanlar + UI ([060b9dd](https://github.com/mustilit/sinavsalonu1_6/commit/060b9dd8cfad531cee8023ca238e884a156a9aa7))
* LiveSessionCreate soru düzenleme dialog'u 2-sütun düzenine geçti ([fc8aca4](https://github.com/mustilit/sinavsalonu1_6/commit/fc8aca422ba106955aa9d5ad2f7c747ef98d522b))
* LiveSessionCreate soru listesi v9 tasarımına hizalandı ([65c6934](https://github.com/mustilit/sinavsalonu1_6/commit/65c6934d31c37742507fcaf82d752bbd85efcafb))
* **LiveSessionCreate:** seçenek görsel butonu çoklu dosya seçimi destekler ([68153af](https://github.com/mustilit/sinavsalonu1_6/commit/68153afd162388eaec112c7e4e0871e0624a8115))
* ManageExamTypes sayfasına isim/durum/tarih filtresi eklendi ([5751cf5](https://github.com/mustilit/sinavsalonu1_6/commit/5751cf51e4cf4e94ccc81eaadb0e597869e036d8))
* MyLiveSessions — durum filtresi + cursor pagination ([57f0b0d](https://github.com/mustilit/sinavsalonu1_6/commit/57f0b0de22a2a84a853efab5d404a25e5193d71d))
* **MyLiveSessions:** durum badge'i ve tur 2 badge'i tek badge'de birleştir ([50b129d](https://github.com/mustilit/sinavsalonu1_6/commit/50b129dcca5a699eb6bc7611aca1597c64370d3f))
* **MyResults:** Test Geçmişi tablosu için page-based pagination ([003ee22](https://github.com/mustilit/sinavsalonu1_6/commit/003ee2269dbc03bfc3553296a0a3d0c16c9903d0))
* **MySales:** Satış Geçmişi tablosu için page-based pagination ([053dbb1](https://github.com/mustilit/sinavsalonu1_6/commit/053dbb1c29a4acd60289e3d9fb481429e2afef01))
* **MyTests:** Çözülme Durumu filtresine 'Devam Eden' kategorisi eklendi ([4408334](https://github.com/mustilit/sinavsalonu1_6/commit/4408334c6c8309dc12432ac373fd6408f7034989))
* **MyTests:** paketler 3 tier ile sıralanır — Devam edilecek > Başlanmamış > Bitenler ([0b50ab4](https://github.com/mustilit/sinavsalonu1_6/commit/0b50ab4e9b18347dc55f92c26348da8afbcb94fb))
* offline koruma — cevap kuyruğu, otomatik çıkış, eğitici taslak kayıt ([4b29840](https://github.com/mustilit/sinavsalonu1_6/commit/4b298405c7bfaa2290121caa563e933b09444241))
* onboarding tour system + full Turkish code documentation ([5ae8e23](https://github.com/mustilit/sinavsalonu1_6/commit/5ae8e23e5439fc722c2f2429b85a19a3900f5315))
* production hardening for SaaS readiness ([fd1c6b3](https://github.com/mustilit/sinavsalonu1_6/commit/fd1c6b3b961330ec970c279f6f869de35e3562af))
* profil resmi, educator puan/satis, test paketi UI iyilestirmeleri ([5df2c39](https://github.com/mustilit/sinavsalonu1_6/commit/5df2c39692a48d1be22866a56e6cbc6ff5bda562))
* reklam satın alma kill-switch (adPurchasesEnabled) ([04b6be8](https://github.com/mustilit/sinavsalonu1_6/commit/04b6be85240dd94845a299b1b89b07e9bdcad0c3))
* sayac duzeltmesi - sureli/suresiz timer ve kullanilan sure raporu ([e4068a8](https://github.com/mustilit/sinavsalonu1_6/commit/e4068a8268f289860a5f115754cb0fbce87eec27))
* Sentry hata izleme entegrasyonu (backend + frontend) ([9a3d3f5](https://github.com/mustilit/sinavsalonu1_6/commit/9a3d3f56a1416ae459672b54c227836d8fd82933))
* sinavsalonu v1.1 — ilk surum ([b00fed9](https://github.com/mustilit/sinavsalonu1_6/commit/b00fed900fc28a73d343a846c0e0ff4720f87e25))
* sinavsalonu1.1 - gozden gecir butonu, tek kaynak soru sayisi, sure duzeltmesi ([fc4aa8a](https://github.com/mustilit/sinavsalonu1_6/commit/fc4aa8a4a0227813381c05bfc77b78feb03772f7))
* soru düzenleme dialog'u 2-sütun düzenine geçti ([322e364](https://github.com/mustilit/sinavsalonu1_6/commit/322e3641faafad5538f524f5bb1355cc2ebe9b5a))
* soru kartı Düzenle/Sil butonları ikon-only ([90a9f33](https://github.com/mustilit/sinavsalonu1_6/commit/90a9f339ef09cb4ce62d3e163f85ef84a0348ce8))
* soru kartında "X soru tamamlanmış" metni ile Düzenle/Sil butonları aynı satıra alındı ([29e7931](https://github.com/mustilit/sinavsalonu1_6/commit/29e7931f5f1368db348ff0b2f32f5cb44b5a336f))
* soru listesinde accordion kaldırıldı, her satır hep görünür kompakt rowla ([31551fa](https://github.com/mustilit/sinavsalonu1_6/commit/31551facbd8fc046cd264aef059af328bd9ca928))
* soru satırında uzun metin önizleme yerine "Metin/Görsel" + "Çözümlü" etiketleri ([bc4aed4](https://github.com/mustilit/sinavsalonu1_6/commit/bc4aed400ff5c3f2a6e66aa81a9399df51b79ebd))
* süreli testlerde süre aşımı izni + gecikmeli teslim raporlama ([d12052a](https://github.com/mustilit/sinavsalonu1_6/commit/d12052a797cd3bb5fbcc81b950f6324541c55924))
* TakeTest soru uzerine kalem ile cizim ozelligi ([4100ca7](https://github.com/mustilit/sinavsalonu1_6/commit/4100ca734427af5fa798668bad14789f49246285))
* **TakeTest:** 'Çözümü Gör' butonu test çözerken de görünür ([223b0ac](https://github.com/mustilit/sinavsalonu1_6/commit/223b0ac5893bd399911bbc2dc8243883dd4e9915))
* **TakeTest:** çözüm görünümü seçeneklerin yerine açılır (toggle) ([2e44593](https://github.com/mustilit/sinavsalonu1_6/commit/2e44593866118c54955029319442dca2d72c96ac))
* **TakeTest:** pre-start ekranında Normal/Seri mod seçimi ([7b5b72c](https://github.com/mustilit/sinavsalonu1_6/commit/7b5b72c6339eec9d9dcd543eca04474bb91c850f))
* **TakeTest:** seri mod sıradaki BOŞ soruya atlasın (linear ilerleme değil) ([c496462](https://github.com/mustilit/sinavsalonu1_6/commit/c4964624b8359ae7ce5a2fbde0e7645fd1422aa9))
* **TakeTest:** Testi Bitir onay dialog'u + fullscreen portal fix ([b28331e](https://github.com/mustilit/sinavsalonu1_6/commit/b28331ef41cdedd405eca7752526981f03d98292))
* TestCard "Testi Sil" üst sıraya alındı + onay dialog'u ([89eef48](https://github.com/mustilit/sinavsalonu1_6/commit/89eef48d1e623e112202f85f3725d51084be14b1))
* **test:** normal test seçenek+soru görsellerine hover büyüteç + lightbox ([11d906c](https://github.com/mustilit/sinavsalonu1_6/commit/11d906c3731ef92b68dfae9d6a4dd19ff45d53c2))
* **test:** seçenek 'Görsel' butonu çoklu dosya seçimi destekler ([27e244d](https://github.com/mustilit/sinavsalonu1_6/commit/27e244d1f0c4f84c0f857161ea17b27b5f222743))
* **v1:** hata bildirimi izleme + iade kuralları + admin yanıtı + UI tutarlılığı ([ccf62c7](https://github.com/mustilit/sinavsalonu1_6/commit/ccf62c7f02f8db6c1add3c8905c2a5a9b346d917))
* **v2:** canlı test akışı + admin yetkilendirmeleri + UI iyileştirmeleri ([b600684](https://github.com/mustilit/sinavsalonu1_6/commit/b600684771bdc901b193138dbd2aad35e713dd2b))
* **v3:** purchase snapshot + proctoring + tek oturum + draft autosave + UX iyileştirmeleri ([da3bbef](https://github.com/mustilit/sinavsalonu1_6/commit/da3bbef41beb9373ffd2705123e13720a72c1b33))
* **v4:** frontend-only istek koruması + CAPTCHA + secrets vault + rol decorator tamamlama ([c147eb2](https://github.com/mustilit/sinavsalonu1_6/commit/c147eb2a23be94a8bf40aa34be7048f45d11a481))
* **v5:** backup zamanlayıcısı + tenant izolasyonu + nginx prod katmanı + güvenlik sertleştirmesi + test coverage ([841ee90](https://github.com/mustilit/sinavsalonu1_6/commit/841ee9024bafdbbdc8e0e3d63dc606698cd83a41))
* **v6:** CreateTest — 3 adımlı wizard, görsel yükleme, TestPackage CRUD ([c3b7498](https://github.com/mustilit/sinavsalonu1_6/commit/c3b74983c94d026ca635501d5d63138228178c5f))
* **v6:** CreateTest iyileştirmeleri — görsel yükleme, zorluk ve min fiyat ([bb7590c](https://github.com/mustilit/sinavsalonu1_6/commit/bb7590c663a4f8e94fc8893aa4077a3e318d69db))
* **v6:** odeme akisi, satin alim listesi ve TestPackage domain duzeltmeleri ([dc1138a](https://github.com/mustilit/sinavsalonu1_6/commit/dc1138a976235211dccfa381450075527e696ae4))
* **v7:** soru konusu seçimi — arama destekli combobox + tam ağaç yolu ([57a3217](https://github.com/mustilit/sinavsalonu1_6/commit/57a321771bcda6ed251765fe9a078941c678ff31))
* **v8:** soru çözüm alanı — eğitici metin+görsel paylaşır, aday review modunda görür ([276729e](https://github.com/mustilit/sinavsalonu1_6/commit/276729e86d9bb70ef2d783c64be0310bb6d06455))
* wire all backend/frontend changes for reports and solutions features ([ae2c20c](https://github.com/mustilit/sinavsalonu1_6/commit/ae2c20cd64e0f958b9db3151890f28acadedb27f))
* WORKER rolü — sınırlı admin erişim sistemi ([9ae30ce](https://github.com/mustilit/sinavsalonu1_6/commit/9ae30ce11d807475fed409f8656665ee29a456df))

### 🐛 Düzeltmeler

* '1./2. Oturumu Başlat' butonları emerald (LiveSessionHost ile aynı) ([eedeb57](https://github.com/mustilit/sinavsalonu1_6/commit/eedeb5724b1df7065c8fdd9a5aac43bf565e8328))
* '1./2. Oturumu Yönet' butonları emerald yerine blue-600 ([b266a6d](https://github.com/mustilit/sinavsalonu1_6/commit/b266a6dd33a0294ff798d9c170a7353d89a1d2a6))
* 'Başlat' butonları bg-blue-600 — siyah çıkan bg-primary değiştirildi ([61978d0](https://github.com/mustilit/sinavsalonu1_6/commit/61978d039eb1feb941859b583ae9616fbbfc154d))
* 'Başlat' butonları primary mavi (TestDetail ile aynı) ([4591235](https://github.com/mustilit/sinavsalonu1_6/commit/4591235de84581e06241e0a2bb8a6827ec538366))
* 'Metin/Görsel' ve 'Çözümlü' rozetlerinde saydam arka fon + ince border ([3324378](https://github.com/mustilit/sinavsalonu1_6/commit/3324378e54cb1670fee90d6494c82f89161c2c9d))
* 'Metin/Görsel', 'Çözümlü' rozetlerinden ve Düzenle butonundan çerçeve kaldırıldı ([4380ef4](https://github.com/mustilit/sinavsalonu1_6/commit/4380ef4b5b9a6813d6e5a2733ed21b88892bbd5a))
* 'Oturumu Başlat' onayı native confirm yerine shadcn Dialog ([e1efc0f](https://github.com/mustilit/sinavsalonu1_6/commit/e1efc0fc95c9474a2daa7e82d0b5d68b35d96a6c))
* **ad:** impression sayaç + log atomic transaction'a alındı ([e205818](https://github.com/mustilit/sinavsalonu1_6/commit/e205818544ef5aacb73a0436972052d535483f19))
* **admin:** audit log + user list cross-tenant — bypass tenant filter ([2842986](https://github.com/mustilit/sinavsalonu1_6/commit/284298635ad3f001a394d905913f73f852c0f7dc))
* **attempt:** 'Kaydet ve Çık' iki bug birden — pre-create + PAUSED görünürlük ([b049492](https://github.com/mustilit/sinavsalonu1_6/commit/b0494929e75b0193a6de866b0a0a248de3bb5dc5))
* AttemptsController eksik routelari ekle (state/answers/finish/timeout/result) ([659ac5b](https://github.com/mustilit/sinavsalonu1_6/commit/659ac5bc57d5a39b8d89812c0ed5bb18bbd28aae))
* **attempt:** submit + audit atomic transaction ([51ed6c1](https://github.com/mustilit/sinavsalonu1_6/commit/51ed6c17be028aa69dce5bdc9f3ac1b32feee617))
* clean api base url env and add web manifest ([7c8f0ba](https://github.com/mustilit/sinavsalonu1_6/commit/7c8f0ba2eaa1b93e72d83b5408155fa95439eb6a))
* CreateTest wizard adım geçişleri — price alanı ve topics 403 hatası ([39f112d](https://github.com/mustilit/sinavsalonu1_6/commit/39f112db41a3d4b5f018bafa4ca00f2f6b91f2bf))
* **email-preferences:** @Inject() decorator eksik — 500 hatası ([cc7e9ec](https://github.com/mustilit/sinavsalonu1_6/commit/cc7e9ec8b684357b6280632786987345fa806982))
* **Explore:** Fiyat filtresinden 'Ücretsiz' seçeneği kaldırıldı ([95e9d25](https://github.com/mustilit/sinavsalonu1_6/commit/95e9d251eee64c15a9c8d3ef3998a53c7e89442c))
* kalem modunda toolbar butonlari tiklanabilir (z-index duzeltmesi) ([1a6d9b0](https://github.com/mustilit/sinavsalonu1_6/commit/1a6d9b0ee717eada73a06b95b586124f7f8d1877))
* **live-sessions:** replace bare Error throws with NestJS exceptions ([9cb4827](https://github.com/mustilit/sinavsalonu1_6/commit/9cb4827439c36bc64a4742d37be30d4fe78801cf))
* **live-sessions:** resolve ESLint warnings in frontend pages ([5a3ef99](https://github.com/mustilit/sinavsalonu1_6/commit/5a3ef994c87676efbb7af51b2035e7a1bf524460))
* **live:** atomic capacity check, count() race condition giderildi ([9e9b1f1](https://github.com/mustilit/sinavsalonu1_6/commit/9e9b1f128dd34f0afafa2ef377f769e159fbcf97))
* **live:** görsel-only sorulara izin ver (CreateLiveSessionUseCase + DTO) ([95e6269](https://github.com/mustilit/sinavsalonu1_6/commit/95e62692ec3ff331034dbfe504c32857e3529a87))
* LiveSession butonu 'Ödeme Yap ve Başlat' → 'Ödeme Yap ve Oluştur' ([5c928e0](https://github.com/mustilit/sinavsalonu1_6/commit/5c928e081b9b1ab07467b08cd660b335a0245073))
* **LiveSessionCreate:** 'Tamamla' bazen 'Yeni Soru' gibi davranıyor ([8f35a8c](https://github.com/mustilit/sinavsalonu1_6/commit/8f35a8ce88dcddcd53501df96ebcf1194b243535))
* **LiveSessionHost:** '2. tur mevcut' hint banner'ı kaldırıldı ([9c791f6](https://github.com/mustilit/sinavsalonu1_6/commit/9c791f6bf64790041bbdff92ad2f313120a9a8df))
* **LiveSessionHost:** ENDED durumunda katılım kodu + aktif katılımcı kartları gizli ([f387168](https://github.com/mustilit/sinavsalonu1_6/commit/f3871680bcc175a8bd976e549d3fdf34d9482e39))
* **LiveSessionHost:** mutasyonlar MyLiveSessions cache'ini de invalidate eder ([6a53150](https://github.com/mustilit/sinavsalonu1_6/commit/6a5315061cd9646beff00c3ebee03168e92b466d))
* **LiveSessionHost:** round 2 ENDED'de katılım kodu + aktif katılımcı kartlarını gizle ([9db0b21](https://github.com/mustilit/sinavsalonu1_6/commit/9db0b21e34392db0875019946719ce798db72e1d))
* **LiveSessionHost:** soru görseli crop ediliyor — max-h img'e taşındı ([6b9cc0a](https://github.com/mustilit/sinavsalonu1_6/commit/6b9cc0ab19f81eb3c6fe03d452eca3eac17303c7))
* **marketplace:** search query examType adını da arasın — 'LGS' aramasıyla bulunabilir ([3152e75](https://github.com/mustilit/sinavsalonu1_6/commit/3152e75acb8ce2329c1c07714b98b806125b9ca7))
* migration ve Prisma v2 uyum hataları ([2f4d95e](https://github.com/mustilit/sinavsalonu1_6/commit/2f4d95ef6119ce5fe5b1fbe5dd729e4415e5363b))
* minPackagePriceCents raw SQL ile güncelle (Prisma client eski sürüm workaround) ([f9f161a](https://github.com/mustilit/sinavsalonu1_6/commit/f9f161ac8185ecc45e4366c12a3ff6b74d9421d3))
* MyLiveSessions ENDED satırında tek 'İncele' butonu — duplikasyon kaldırıldı ([362d7b2](https://github.com/mustilit/sinavsalonu1_6/commit/362d7b23c694d88355a7f80793c995b6a207e45a))
* **MyTests:** N+1 fetch yerine purchase.package'tan türet — kalıcı çözüm ([a0fff5d](https://github.com/mustilit/sinavsalonu1_6/commit/a0fff5d187112addff57acc989c103c276e27888))
* **MyTests:** Sınav Türü filtresi sadece satın alınan paketlerin türlerini göstersin ([dd551d2](https://github.com/mustilit/sinavsalonu1_6/commit/dd551d2b178d090f6e8441839a7c020e9ba91a00))
* **purchases:** dev modunda throttle limit'i 30→500/dk ([b5cc2b5](https://github.com/mustilit/sinavsalonu1_6/commit/b5cc2b55e8e2577c9bc3879385d85b4c8216dc17))
* **refund:** purchase.status iade onaylanınca REFUNDED yazılsın (atomik) ([7c0bd7a](https://github.com/mustilit/sinavsalonu1_6/commit/7c0bd7a3be4e21fbd31bc8289c84c29ddb209dd5))
* soru satırında '4/5 seçenek dolu' yerine '4 Seçenekli' formatı ([e011aca](https://github.com/mustilit/sinavsalonu1_6/commit/e011aca6c08a4b874d72a170ec7ff10a64021716))
* TakeTest cevap secimi - questions useMemo ile memoize edildi ([a329080](https://github.com/mustilit/sinavsalonu1_6/commit/a329080f701971ed62713491d5f9bec5961116e9))
* TakeTest solution display and EditTest save bug ([ba4b086](https://github.com/mustilit/sinavsalonu1_6/commit/ba4b086a8ab8cc4035d1f5124fc7b0dfde63b7bc))
* **TakeTest:** 'Çözümü Gör' butonu test.has_solutions yerine soru-level kontrol ([677c941](https://github.com/mustilit/sinavsalonu1_6/commit/677c94118f429614f56fc954f7648abc365c9d96))
* **TakeTest:** cevap kuyruğu race condition — ilk dönüşte cevap kayboluyordu ([8a5e5ed](https://github.com/mustilit/sinavsalonu1_6/commit/8a5e5edd86417b2f8974612cc6948eea37d6317b))
* **TakeTest:** cevap state restoration PAUSED + IN_PROGRESS her ikisinde de ([debe15b](https://github.com/mustilit/sinavsalonu1_6/commit/debe15b26176ee5baeff0e269ffc778427d79626))
* **TakeTest:** PAUSED attempt'ı resume etmeden test başlatma — cevaplar yüklenmiyor ([67623c8](https://github.com/mustilit/sinavsalonu1_6/commit/67623c8d2d4a5e0a88f09c7388050385365ee256))
* **TakeTest:** resume sonrası flushQueue ve invalidate sıralaması ([8a8df5a](https://github.com/mustilit/sinavsalonu1_6/commit/8a8df5acc59c1540186ab8660dde09ca3a135293))
* **TakeTest:** Testi Bitir öncesi pending cevap kuyruğu flush edilmiyordu — data loss ([2d637c6](https://github.com/mustilit/sinavsalonu1_6/commit/2d637c6f47de567e13d825e573ac1141d1e89bc0))
* **TestPreviewModal:** boş (padding) seçenekler aday önizlemesinde gizli ([4ac9f2c](https://github.com/mustilit/sinavsalonu1_6/commit/4ac9f2cbaea9d49ff6e145150aa3e0eeb26338c5))
* **test:** publish + audit atomic transaction ([68a278f](https://github.com/mustilit/sinavsalonu1_6/commit/68a278f715799eee9e28a418e27cfd205c139b8c))
* TierCard kompaktlaştı — fiyat üst satırın sağında, kart yüksekliği azaldı ([29c72fd](https://github.com/mustilit/sinavsalonu1_6/commit/29c72fd837fb5e1989d907659b4499ee8b6d7842))
* **v6:** kalan test drift'leri onar + coverage threshold gerçek baseline'a hizala ([5f990cc](https://github.com/mustilit/sinavsalonu1_6/commit/5f990cca06a913b618ec0c3d4e60a189510e25aa))

### ♻️ Refactor

* **admin:** AdminUserActivity — İşlem filtresi 2 kademeli cascade ([0257b89](https://github.com/mustilit/sinavsalonu1_6/commit/0257b895519e208d74e69f9785530c60be59cb85))
* **admin:** Canlı Test + Reklam paketlerini ManagePackages tek sayfasında birleştir ([99cacac](https://github.com/mustilit/sinavsalonu1_6/commit/99cacac3183eefb87b0ee03bb0ec7f935dc5cd05))
* **AdminSystemControls:** Ödeme sağlayıcıları Mali Kontrol → Entegrasyonlar sekmesine taşındı ([680d2e5](https://github.com/mustilit/sinavsalonu1_6/commit/680d2e54dd3bdd793cc6f472f13914da67524450))
* **auth:** use-case dosyalarini auth/ alt klasorune tasidi ([2b80923](https://github.com/mustilit/sinavsalonu1_6/commit/2b80923ccc20b89c71f19eded331c63dc0ba7976))
* **educator:** use-case dosyalarini educator/ alt klasorune tasidi ([7aecdfb](https://github.com/mustilit/sinavsalonu1_6/commit/7aecdfb85d75b2c33e2308c35dc970095fe190bb))
* **MyTests:** Eğitici filtresi dedupe + sort temizliği ([c227bb7](https://github.com/mustilit/sinavsalonu1_6/commit/c227bb7dddbd726d1ded09b1e247ca95074ede3e))
* **test:** use-case dosyalarini test/ alt klasorune tasidi ([d0a0a87](https://github.com/mustilit/sinavsalonu1_6/commit/d0a0a87930893bdd3d56f22226325d3548b16df8))
* **use-cases:** move remaining 14 domains into subdirectories ([a6ba603](https://github.com/mustilit/sinavsalonu1_6/commit/a6ba603d99c2d4fb0cb6d5ee27ae6a302c98c0ae))

### 🔧 Bakım

* add cursor rule to lock docker redis config ([9430a9b](https://github.com/mustilit/sinavsalonu1_6/commit/9430a9bb48d4bab77e92c21c5efd05b1ce806937))
* add examtype/topic prisma migration ([96fd8af](https://github.com/mustilit/sinavsalonu1_6/commit/96fd8af8870535369bcde2e959030b82898d4eba))
* add prisma migrations ([3a98c55](https://github.com/mustilit/sinavsalonu1_6/commit/3a98c55c4186ea357f67a761d925fca7c5849d1d))
* **admin:** sayfa adı "Kullanıcı İşlem Geçmişi" → "İşlem Geçmişi" ([0712a47](https://github.com/mustilit/sinavsalonu1_6/commit/0712a475763e85a4f0f3219c44db33b9f6f53546))
* Claude Code agent/skill dosyaları ve proje dokümantasyonu güncellendi ([9051e73](https://github.com/mustilit/sinavsalonu1_6/commit/9051e7371770c45703d623748bb4601c6bfaa26f))
* **coverage:** threshold sıkıştır + ratchet otomasyon altyapısı ([5d270ad](https://github.com/mustilit/sinavsalonu1_6/commit/5d270add1afc3bbb624a9ff2796a63dff29d3c65))
* **deps:** moment + lodash sil, bundle visualizer ekle ([90a3262](https://github.com/mustilit/sinavsalonu1_6/commit/90a32622911aedad95713ce0df8c4f8bcc6f9fe1))
* **infra+tests:** kalite + release otomasyon büyük paketi ([633a1ef](https://github.com/mustilit/sinavsalonu1_6/commit/633a1ef8d1717a4ffd32bd7e827175697a997ca7))
* initialize repo with current state ([b3cf814](https://github.com/mustilit/sinavsalonu1_6/commit/b3cf81421c0782693be39ec7066c2827c91cf528))
* normalize docker compose, env, and line endings ([d112651](https://github.com/mustilit/sinavsalonu1_6/commit/d11265107afbb2a094013f55e5f58e5c7b56aa62))
* remove accidentally tracked .claude artifacts from index ([27f0be3](https://github.com/mustilit/sinavsalonu1_6/commit/27f0be36dc7d93d28c49fa101277145e8353540b))
* **repo:** tracked junk temizliği + CODEOWNERS + branch protection runbook ([17ac162](https://github.com/mustilit/sinavsalonu1_6/commit/17ac162896828236c48a9520b56f980073f6d0ca))
* stabilize docker backend and multi-tenant setup ([f763fef](https://github.com/mustilit/sinavsalonu1_6/commit/f763fef360af93aa680726425477ca110bc72365))
* stabilize redis config and healthchecks ([2f418ba](https://github.com/mustilit/sinavsalonu1_6/commit/2f418ba4b36c0c3901f2fc6ba2676e903913574e))
* **TakeTest:** Testi Bitir dialog metni — satır başı + tire kaldırma ([bf2e8c2](https://github.com/mustilit/sinavsalonu1_6/commit/bf2e8c23548d5829107e7bde979817cbed7f1abe))

### 📚 Dokümantasyon

* frontend skill ve agent dosyalarını güncelle ([daf75e5](https://github.com/mustilit/sinavsalonu1_6/commit/daf75e5c3aea093e5a73d18fc967660c940203da))
* skill ve agent dosyalarını bugünkü değişikliklerle güncelle ([8c2d023](https://github.com/mustilit/sinavsalonu1_6/commit/8c2d023befb9a69a015747ae5601f4c83fd3d19e))
* tüm skill ve agent dosyalarında eski içerik güncellendi ([beb7508](https://github.com/mustilit/sinavsalonu1_6/commit/beb75087e7ee8cf35aac31483fac046046027bfa))

### 🧪 Testler

* **coverage:** sprint 3 mega — 53 yeni dosya, 487 test case, %35.2 global ([6a08ef3](https://github.com/mustilit/sinavsalonu1_6/commit/6a08ef32236346228c8c89623a49c5cf6bcf6085)), closes [#1](https://github.com/mustilit/sinavsalonu1_6/issues/1) [#2](https://github.com/mustilit/sinavsalonu1_6/issues/2)
* **coverage:** sprint 4 mega — 91 yeni dosya, global %55.8, controllers %87.6 ([08ff470](https://github.com/mustilit/sinavsalonu1_6/commit/08ff470a77a80f2adb79328f2c3d46d976009cbd))
* **coverage:** sprint 5 — global %61.09 (HEDEF AŞILDI), 48 yeni test dosyası ([ce80c7f](https://github.com/mustilit/sinavsalonu1_6/commit/ce80c7ffb2480be77dd3cbaf112a39652a3b2f96))
* **e2e:** aday test çözme akışları için kapsamlı UI testleri (6 senaryo) ([b970b13](https://github.com/mustilit/sinavsalonu1_6/commit/b970b132aea0c2a048ad1541e79509bc4cc8c6f7))
* **e2e:** Grid mismatch senaryosu — iki session'lık cevap state restore ([9723af9](https://github.com/mustilit/sinavsalonu1_6/commit/9723af90489457ef3de7299a49835c4d8c180176))
* **e2e:** purchase-flow düzeltmeler — free package + payment iframe skip ([ada9f2c](https://github.com/mustilit/sinavsalonu1_6/commit/ada9f2c9bfa342ebb077695080c3c4d2f56d32c8))
* **e2e:** Q5 spesifik test — 5. soruda cevap + ANINDA çık → tek dönüşte ([449583a](https://github.com/mustilit/sinavsalonu1_6/commit/449583afb1c0fb82cfc493d8613e1eb5f05ffb88))
* **e2e:** resume + cevap state restoration için kapsamlı senaryo ([4dbdc86](https://github.com/mustilit/sinavsalonu1_6/commit/4dbdc8681a6bd362ae61cbb9ac3f6bed19ead212))
* **e2e:** user-reported senaryosu — yarım test + yeni cevap + ilk dönüşte ([4c56252](https://github.com/mustilit/sinavsalonu1_6/commit/4c562528fd6b79d974e2269dba82ae13d51ff1c3))

Tagged sürümlerden sonraki girişler `npm run release` ile [semantic-release](https://semantic-release.gitbook.io/) tarafından otomatik üretilir; aşağıdaki ilk sürümler manuel seed'tir.

## [Yayımlanmamış]

### ✨ Özellikler

- `feat(admin)`: AdminUserActivity — kullanıcı işlem geçmişi sayfası (`#278b3bb`)
- `feat(admin)`: AdminUserActivity — İşlem Tipi filtresi (gruplu Select) (`#ae237bc`)
- `feat(admin)`: AdminUserActivity — Varlık ID yerine anlaşılır label + link (`#cf4153d`)
- `feat(admin)`: Reklam paketleri yönetim sayfası (AdminAdPackages) (`#324ae65`)

### ♻️ Refactor

- `refactor(admin)`: AdminUserActivity — İşlem filtresi 2 kademeli cascade (`#0257b89`)
- `refactor(admin)`: Canlı Test + Reklam paketleri ManagePackages tek sayfada birleşti (`#99cacac`)
- `refactor(AdminSystemControls)`: Ödeme sağlayıcıları Mali Kontrol → Entegrasyonlar (`#680d2e5`)

### 🐛 Düzeltmeler

- `fix(admin)`: Audit log + user list cross-tenant bypass — admin tüm tenant'ları görür (`#2842986`)

### 🧪 Testler

- 35 yeni use-case unit test dosyası eklendi — 7 domain (billing/refund/auth/attempt/live/discount/moderation)
- Use-case coverage: %22 → %38 (branches +12, fns +11, lines +16)
- Frontend E2E: candidate-test-flow + a11y specleri genişletildi

### 🔧 Bakım

- `chore(admin)`: Sayfa adı "Kullanıcı İşlem Geçmişi" → "İşlem Geçmişi" (`#0712a47`)
- `chore`: Husky pre-commit hook eklendi (backend tsc + frontend ESLint)
- `chore`: CHANGELOG.md + semantic-release entegrasyonu (conventional commits)

## [1.6.0] - 2026-05-26

### ✨ Özellikler

- `feat(MySales)`: Satış Geçmişi tablosu için page-based pagination (`#053dbb1`)
- `feat(MyResults)`: Test geçmişi pagination — PaginationBar entegrasyonu
- `feat(TakeTest)`: Süre aşımı politikası — backend SubmitAnswerUseCase aşımda cevap kabul eder, overtimeSeconds takip edilir
- `feat(TakeTest)`: Serial Mode — cevap verildikten sonra sıradaki BOŞ soruya otomatik atlama
- `feat(TakeTest)`: "Testi Bitir" onay diyaloğu (cevaplanan/boş soru sayısı + Kaydet ve Çık alternatifi)
- `feat(attempt)`: hasSolutions=true testlerde aktif sınav sırasında çözüm gönder
- `feat(MyTests)`: Paketler 3-tier ile sıralanır — Devam edilecek > Başlanmamış > Bitenler
- `feat(Explore)`: tsvector search — exam type name desteği (LGS/KPSS/MSÜ shortcode'ları)

### 🐛 Düzeltmeler

- `fix(email-preferences)`: `@Inject()` decorator eksik — 500 hatası
- `fix(MyTests)`: N+1 fetch yerine purchase.package'tan türet — kalıcı çözüm
- `fix(TakeTest)`: Cevap state restoration PAUSED + IN_PROGRESS her ikisinde de
- `fix(TakeTest)`: Cevap kuyruğu race condition — ilk dönüşte cevap kayboluyordu

### ♻️ Refactor

- `refactor(Explore)`: Eğitici filtresi text search (dropdown ölçeklenmez)
- `refactor(MyTests)`: Eğitici filtresi dedupe + sort temizliği
- `refactor(dialog)`: `container` prop desteği — fullscreen TakeTest dialog'ları için

### 🧪 Testler

- `test(e2e)`: Aday test çözme akışları için 10 kapsamlı senaryo (yarım test + race fix + grid restore)

## [1.5.0] - 2026-05-19

### ✨ Önemli Eklemeler

- Multi-tenant izolasyon — Prisma extension ile tenant-scoped query
- Webhook replay koruması — `WebhookEvent` modeli ile idempotent webhook
- AI içerik moderasyonu — `use-cases/moderation/` (17 use-case)
- 2FA (iki faktörlü doğrulama) — TOTP + cihaz parmak izi
- i18n (çoklu dil) — tr/en/es/zh/de
- Frontend ürün analitiği — PostHog (KVKK/GDPR consent-gated)
- Helm/Kubernetes deploy chart'ı (backend/frontend/worker + ingress)

## [1.0.0] - 2026-05-17

İlk yayımlanmış sürüm. Sınav Salonu test marketplace platformu temel özellikleri.
