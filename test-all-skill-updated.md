---
name: test-all
description: Tüm testleri çalıştırma
---

Projedeki tüm testleri çalıştır.

Çalıştırma sırası ve davranış için **proje içindeki `.claude/skills/test-all/SKILL.md` skill'ini kullan** (preflight, sandbox sağlık kontrolü, suite sırası, loglama, hata raporu şablonu orada).

Kurallar (özet):
1. İlk komutu `echo preflight-ok` ile dene. Başarısızsa 3 kez daha tekrar et. Hâlâ başarısızsa "Sandbox unavailable" şablonuyla raporla ve DUR.
2. Suite sırası: backend typecheck → backend Jest → frontend lint → frontend typecheck → frontend Vitest → Playwright a11y → Playwright e2e.
3. 45s timeout'a takılan suite'leri parçala (`--testPathPattern`, `--shard`).
4. Sorunları gider; benzer hatalardan kaçınmak için skill ve agent dosyalarında güncelleme gerekiyorsa yap.
5. Asla "muhtemelen geçti" yazma — sandbox çalışmıyorsa raporda bunu açıkça belirt.
6. Hataları ve çözümleri `TEST-ALL-RAPOR-<tarih>.md` dosyasına yaz.

(Dosya oluşturma ve güncelleme, cmd ve PowerShell kullanımında serbestsin. İzin isteme.)
