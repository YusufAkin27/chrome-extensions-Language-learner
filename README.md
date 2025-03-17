# LanguageLearner Chrome Extension

Netflix ve YouTube'da altyazıları analiz ederek dil öğrenimini kolaylaştırmak için geliştirilmiş bir Chrome uzantısı.

## Özellikler

- **Çift Altyazı Desteği**: Sayfada hem orijinal altyazı (örneğin İngilizce), hem de kullanıcı tarafından seçilen çeviri dili (örneğin Türkçe) aynı anda gösterilir.
- **Üzerine Gelince Çeviri**: Kullanıcı bir kelimenin üzerine geldiğinde, bir tooltip göstererek kelimenin anlamını gösterir.
- **Çevrimiçi Çeviri API'si**: Geniş dil desteği için MyMemory Translation API kullanılarak gerçek zamanlı çeviriler sunar.
- **Sesli Okuma**: Web Speech API kullanarak kelime telaffuzlarını sesli olarak dinleyebilirsiniz.
- **Kelime Kaydetme**: Kullanıcı bir kelimeye tıklarsa, bu kelime ve çevirisi "öğrenme listesi" olarak kaydedilir.
- **Öğrenme Takibi**: Kelimelerin öğrenme durumunu (yeni, öğreniliyor, öğrenildi) takip etmenize olanak tanır.
- **Popup Panel**:
  - Kayıtlı kelimeler listelenebilir ve filtrelenebilir
  - Öğrenme durumuna göre kelime takibi
  - İstatistikler ile öğrenme ilerlemesi
  - Kullanıcı isterse kelimeleri silebilir
  - Liste CSV veya JSON olarak dışa aktarılabilir
- **Video Kontrol Tuşları**:
  - Altyazı satırı bittiğinde otomatik durdurma
  - Son altyazıya geri sar (A tuşu)
  - Hızlı ileri/geri sarma (←/→ tuşları)
  - Oynatma hızı kontrolü

## Kurulum

1. Bu repository'yi indirin veya klonlayın.
2. Chrome tarayıcısını açın ve adres çubuğuna `chrome://extensions` yazın.
3. Geliştirici modu'nu sağ üst köşeden etkinleştirin.
4. "Paketlenmemiş öğe yükle" butonuna tıklayın.
5. İndirdiğiniz klasörü seçin.

## Kullanım

1. Netflix veya YouTube'da bir video açın.
2. Altyazıları etkinleştirin.
3. Uzantı otomatik olarak çalışmaya başlayacaktır.
4. Kelimelerin üzerine gelerek çevirileri görebilirsiniz.
5. Kaydetmek istediğiniz kelimelere tıklayabilir veya tooltip üzerindeki "Kaydet" butonunu kullanabilirsiniz.
6. Telaffuzu duymak için tooltip üzerindeki ses simgesine tıklayın.
7. Kaydettiğiniz kelimeleri görmek için, sağ üst köşedeki uzantı ikonuna tıklayın.
8. Kelime listenizde arama yapabilir, filtreleyebilir ve kelimelerin öğrenme durumlarını güncelleyebilirsiniz.

## Sık Kullanılan Kısayol Tuşları

- **Boşluk**: Video oynatma/durdurma
- **A**: Son altyazıya geri sar
- **Sağ ok**: 5 saniye ileri sar
- **Sol ok**: 5 saniye geri sar

## Teknolojiler

- HTML5
- CSS3
- JavaScript (ES6+)
- Chrome Extension API
- MutationObserver API
- Web Speech API (sesli okuma özelliği için)
- MyMemory Translation API (çeviri için)

## Desteklenen Platformlar

- Netflix.com
- YouTube.com

## Desteklenen Diller

- Ana çeviri desteği: Çoğu dil çifti (MyMemory API aracılığıyla)
- Sesli okuma: Tarayıcı tarafından desteklenen tüm diller

## Çeviri API'si Kullanımı

Bu uzantı, çeviri hizmeti sağlamak için MyMemory Translation API'yi kullanmaktadır. Bu API günlük 5000 çeviri sınırına sahiptir. Bu sınıra ulaşıldığında, eklenti basit bir yedek çeviri sistemine geçiş yapar.

## Katkıda Bulunma

1. Bu repository'yi forklayın
2. Kendi branch'inizi oluşturun (`git checkout -b feature/YeniOzellik`)
3. Değişikliklerinizi commit edin (`git commit -m 'Yeni özellik: Açıklama'`)
4. Branch'inizi push edin (`git push origin feature/YeniOzellik`)
5. Pull Request oluşturun

## Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylı bilgi için [LICENSE](LICENSE) dosyasına bakın.

## İletişim

Sorularınız ve önerileriniz için [GitHub Issues](https://github.com/kullanici/language-learner-extension/issues) üzerinden iletişime geçebilirsiniz. 