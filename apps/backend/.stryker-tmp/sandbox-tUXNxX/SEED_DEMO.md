# Demo veri (seed)

Backend `npm run start:dev` ile ilk çalıştığında (production dışında) otomatik seed çalışır.

## Demo giriş bilgileri

| Rol   | E-posta              | Şifre     | Açıklama           |
|-------|----------------------|-----------|-------------------|
| Admin | mus.tulu@gmail.com   | adminsinav | Admin paneli      |
| Eğitici | educator@demo.com  | demo123   | Onaylı eğitici    |
| Aday  | aday@demo.com        | demo123   | Test satın alıp çözebilir |

## Oluşturulan veri

- **Admin ayarları:** Satın alma açık, komisyon %20, KDV %18
- **Eğitici sözleşmesi:** Aktif (yeni eğitici kaydı için)
- **Sınav türü:** Demo TYT
- **Konu:** Matematik
- **Demo test:** "Demo TYT Matematik Denemesi" — 5 soru, 4 şık, süreli 45 dk, 19,99 ₺, yayında

## Test akışı

1. **Aday:** aday@demo.com / demo123 ile giriş → Marketplace → Testi satın al → Satın aldıklarım
2. **Eğitici:** educator@demo.com / demo123 ile giriş → Testlerim, Raporlar, İndirim kodu oluşturma
