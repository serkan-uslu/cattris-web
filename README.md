# Cattris 🐾

Tatlı, animasyonlu kedilerle oynanan bir blok yerleştirme (Tetris tarzı) oyunu.
Her parça uzayıp kıvrılan bir kedi: kafası, kuyruğu, patileri var; göz kırpıyor,
kuyruk sallıyor, yere düşünce yaylanıyor, uzun süre beklerse uyuyakalıyor 😴.

## Özellikler

- 7 farklı kedi (I, O, T, L, J, S, Z) — hepsi canvas ile prosedürel çiziliyor, görsel dosya yok
- Kedi animasyonları: göz kırpma, kulak seğirmesi, kuyruk sallama, iniş esnemesi, nefes alma,
  satır temizlenirken mutlu `^ ^` gözler, yığın yükselince endişeli bakış, oyun bitince ağlayan kediler
- SRS döndürme + duvar tekmeleri, 7'li torba, hold, ghost (iniş gölgesi), lock delay
- Skor: tekli/çiftli/üçlü/MİYAVHARİKA (4 satır), kombo, arka arkaya bonus, pati-mükemmel temizlik
- Parçacık efektleri (kalp, yıldız, pati izi, yün yumağı) ve uçan yazılar
- WebAudio ile sentezlenen miyavlamalar, mırlama ve müzik kutusu ninnisi (ses dosyası yok)
- Sıcak bir kedi odası arka planı (raf, kedi ağacı, uyuyan kedi, yün yumakları)
- Masaüstü + telefon düzeni, dokunmatik butonlar ve hareketler, en iyi skor kaydı

## Kontroller

| Tuş | Eylem |
| --- | --- |
| ← / → | Sola / sağa kaydır |
| ↑ veya X | Saat yönünde döndür |
| Z | Ters yöne döndür |
| ↓ | Yavaş indir |
| Space | Hızlı bırak |
| C / Shift | Sakla (Hold) |
| P / Esc | Duraklat |
| M | Müzik aç/kapat |

Telefonda: alttaki butonlar ya da tahtada dokun = döndür, yana kaydır = hareket,
aşağı fırlat = hızlı bırak, yukarı kaydır = sakla.

## Geliştirme

```bash
npm install
npm run dev      # geliştirme sunucusu
npm test         # oyun mantığı testleri
npm run build    # dist/ klasörüne üretim derlemesi
```

`dist/` statik bir site; GitHub Pages, Vercel, Netlify gibi herhangi bir yerde barındırılabilir.

## Yapı

- `src/game.ts` — oyun mantığı (tahta, parçalar, döndürme, skor, seviye)
- `src/pieces.ts` — kedi parçalarının tanımları, renkleri ve SRS tabloları
- `src/cat.ts` — kedilerin prosedürel çizimi (gövde, kafa, kuyruk, ruh hâlleri)
- `src/render.ts` — tahta çizimi, iniş/temizleme animasyonları, önizlemeler
- `src/audio.ts` — sentezlenmiş ses efektleri ve müzik
- `src/background.ts` — kedi odası arka planı
- `src/particles.ts` — parçacık efektleri
- `src/main.ts` — döngü, girişler, arayüz
