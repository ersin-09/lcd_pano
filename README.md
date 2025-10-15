# LCD Pano Yerel Uygulama

Bu depo, https://app.lcdpano.net/ deneyimine benzer şekilde panoramik görüntüleri yerel olarak
organizasyonunuzda yönetebilmeniz için hazırlanmış hafif bir web arayüzü içerir. Uygulama, panoramaları tarayıcınızda
saklar ve JSON olarak dışa aktarabilmenize olanak tanır.

## Özellikler

- Panorama görüntüleyici: Fare veya dokunmatik hareketlerle sahneleri 360° döndürün, ok tuşlarıyla ince ayar yapın.
- Sahne listesi: Başlık, konum ve etiketlerle sahneleri düzenleyin, hızlıca aralarında gezinin.
- Meta veri düzenleme: Açıklama, konum ve etiketleri düzenleyip yerel depolamada saklayın.
- Yerel dosya desteği: Panorama dosyalarınızı (JPG/PNG) yükleyin, istemci tarafında saklayın.
- İçe/dışa aktarma: Yapılandırmayı JSON olarak indirip başka bir tarayıcıya taşıyın veya önceden
  dışa aktardığınız sahneleri hızla geri yükleyin.
- Durum bildirimleri: İşlemlerin sonucunu alt bölümdeki canlı durum mesajından takip edin.

## Kurulum ve Çalıştırma

1. Depoyu klonlayın veya mevcut dosyaları indirin.
2. Yerel bir statik sunucu başlatın. Örneğin Python ile:

   ```bash
   cd public
   python -m http.server 5173
   ```

3. Tarayıcıda `http://10.88.0.3:5173` adresini açın.
4. "Panorama Yükle" ile panorama görsellerinizi seçin ve meta bilgilerini doldurun.
5. Daha önce dışa aktardığınız bir yapılandırma varsa "Yapılandırmayı İçeri Aktar" ile geri yükleyin.

### Desteklenen Dosya Biçimleri

- `.json` (UTF‑8)
- `.json.gz` veya `.gz` (gzip sıkıştırılmış JSON; tarayıcınız `DecompressionStream` destekliyorsa)

> Not: ZIP arşivleri (`.zip`) desteklenmez. Eğer bir ZIP dosyanız varsa, içindeki `.json` dosyasını çıkarıp seçin.

> Uygulama verileri tarayıcınızın `localStorage` alanında saklanır. Başka bir cihaza taşımak için "Yapılandırmayı Dışa Aktar"
> ile JSON dosyasını indirip, ardından "Yapılandırmayı İçeri Aktar" ile geri yüklemeniz yeterlidir.

## Dizin Yapısı

```
public/
  app.js              # Uygulama mantığı
  index.html          # Kullanıcı arayüzü
  styles.css          # Stil dosyaları
  assets/
    sample-panorama.svg  # Varsayılan örnek panorama
  data/
    panoramas.json    # Varsayılan sahne verisi
```

## Lisans

Bu proje örnek bir çalışma olup içerik serbestçe güncellenebilir.
