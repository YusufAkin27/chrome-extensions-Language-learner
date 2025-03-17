/**
 * LanguageLearner Words Page
 * Kelimeler sayfası için JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  // Uygulama ana değişkenleri
  let savedWords = {};
  let filteredWords = {};
  let currentFilter = 'all';
  let currentSort = 'recent';
  let settings = {};
  let apiUsage = { used: 0, limit: 5000 };

  // Elemanlara kolay erişim
  const elements = {
    tabs: document.querySelectorAll('.main-nav a'),
    tabContents: document.querySelectorAll('.tab-content'),
    wordsGrid: document.getElementById('words-grid'),
    loadingIndicator: document.getElementById('loading-indicator'),
    emptyState: document.getElementById('empty-state'),
    searchInput: document.getElementById('word-search'),
    searchBtn: document.getElementById('search-btn'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    sortSelect: document.getElementById('sort-select'),
    exportBtn: document.getElementById('export-btn'),
    importBtn: document.getElementById('import-btn'),
    clearBtn: document.getElementById('clear-btn'),
    
    // Modal elemanları
    modal: document.getElementById('word-detail-modal'),
    modalWord: document.getElementById('modal-word'),
    modalTranslation: document.getElementById('modal-translation'),
    modalStatus: document.getElementById('modal-status'),
    modalProgressBar: document.getElementById('modal-progress-bar'),
    modalCreated: document.getElementById('modal-created'),
    modalLastViewed: document.getElementById('modal-last-viewed'),
    modalNextReview: document.getElementById('modal-next-review'),
    modalSpeak: document.getElementById('modal-speak'),
    modalUpdate: document.getElementById('modal-update'),
    modalDelete: document.getElementById('modal-delete'),
    modalContexts: document.getElementById('modal-contexts'),
    closeModal: document.getElementById('close-modal'),

    // İstatistik elemanları
    totalWords: document.getElementById('total-words'),
    newWords: document.getElementById('new-words'),
    learningWords: document.getElementById('learning-words'),
    reviewingWords: document.getElementById('reviewing-words'),
    learnedWords: document.getElementById('learned-words'),
    newProgress: document.getElementById('new-progress'),
    learningProgress: document.getElementById('learning-progress'),
    reviewingProgress: document.getElementById('reviewing-progress'),
    learnedProgress: document.getElementById('learned-progress'),
    lastWeekAdded: document.getElementById('last-week-added'),
    lastMonthAdded: document.getElementById('last-month-added'),
    lastMonthLearned: document.getElementById('last-month-learned'),

    // Ayarlar elemanları
    originalLang: document.getElementById('original-lang'),
    translationLang: document.getElementById('translation-lang'),
    autoTranslate: document.getElementById('auto-translate'),
    autoSpeak: document.getElementById('auto-speak'),
    autoSubtitle: document.getElementById('auto-subtitle'),
    speechRecognition: document.getElementById('speech-recognition'),
    progressDays: document.getElementById('progress-days'),
    saveSettings: document.getElementById('save-settings'),
    resetSettings: document.getElementById('reset-settings'),

    // API durumu
    apiStatusIcon: document.getElementById('api-status-icon'),
    apiStatusText: document.getElementById('api-status-text')
  };

  // Uygulama başlatma
  initializeApp();

  // =====================================================================
  // Temel Uygulama Fonksiyonları
  // =====================================================================
  
  function initializeApp() {
    // Kaydedilmiş kelimeleri yükle
    loadSavedWords();
    
    // Ayarları yükle
    loadSettings();
    
    // API kullanım durumunu yükle
    loadApiUsage();
    
    // Olay dinleyicileri ekle
    setupEventListeners();
  }

  function setupEventListeners() {
    // Sekme değiştirme
    elements.tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab(tab.getAttribute('data-tab'));
      });
    });

    // Kelime arama
    elements.searchBtn.addEventListener('click', () => {
      filterWords();
    });

    elements.searchInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        filterWords();
      }
    });

    // Filtre butonları
    elements.filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter');
        filterWords();
      });
    });

    // Sıralama değişimi
    elements.sortSelect.addEventListener('change', () => {
      currentSort = elements.sortSelect.value;
      filterWords();
    });

    // Dışa/İçe aktarma
    elements.exportBtn.addEventListener('click', exportWords);
    elements.importBtn.addEventListener('click', () => {
      // Dosya yükleme iletişim kutusu oluştur
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', importWords, false);
      input.click();
    });

    // Tüm kelimeleri silme
    elements.clearBtn.addEventListener('click', () => {
      if (confirm('Tüm kelimeleriniz silinecek. Emin misiniz?')) {
        clearAllWords();
      }
    });

    // Modal kontrolleri
    elements.closeModal.addEventListener('click', closeWordModal);
    elements.modal.addEventListener('click', (e) => {
      if (e.target === elements.modal) {
        closeWordModal();
      }
    });

    elements.modalUpdate.addEventListener('click', updateWordProgress);
    elements.modalDelete.addEventListener('click', deleteWord);
    elements.modalSpeak.addEventListener('click', speakWord);

    // Ayarlar
    elements.saveSettings.addEventListener('click', saveAllSettings);
    elements.resetSettings.addEventListener('click', resetSettings);

    // Escape tuşu ile modal kapama
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.modal.style.display === 'flex') {
        closeWordModal();
      }
    });
  }

  // Sekme değiştirme
  function switchTab(tabId) {
    elements.tabs.forEach(tab => {
      if (tab.getAttribute('data-tab') === tabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    elements.tabContents.forEach(content => {
      if (content.id === `${tabId}-tab`) {
        content.classList.add('active');
        
        // İstatistik sekmesine geçildiğinde istatistikleri güncelle
        if (tabId === 'stats') {
          updateStatistics();
        }
      } else {
        content.classList.remove('active');
      }
    });
  }

  // =====================================================================
  // Kelime Yönetimi Fonksiyonları
  // =====================================================================
  
  // Kaydedilmiş kelimeleri yükle
  async function loadSavedWords() {
    try {
      elements.loadingIndicator.style.display = 'flex';
      elements.wordsGrid.innerHTML = '';
      
      // Get saved words from storage
      const response = await chrome.runtime.sendMessage({ action: 'getSavedWords' });
      
      if (!response || !response.success) {
        throw new Error('Failed to load saved words');
      }
      
      savedWords = response.words || {};
      
      // If no words, show empty state
      if (Object.keys(savedWords).length === 0) {
        showEmptyState('Henüz kaydedilmiş kelimeniz yok.');
        updateStatistics();
        return;
      }
      
      // Filter and display words
      filterWords();
      // Update statistics
      updateStatistics();
    } catch (error) {
      console.error('Error loading saved words:', error);
      showEmptyState('Kelimeler yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
    } finally {
      elements.loadingIndicator.style.display = 'none';
    }
  }

  // Kelimeleri filtrele ve sırala
  function filterWords() {
    const searchTerm = elements.searchInput.value.toLowerCase().trim();
    
    // Önce filtrele
    filteredWords = Object.keys(savedWords).reduce((filtered, word) => {
      const wordData = savedWords[word];
      
      // Filtre uygula
      let passesFilter = true;
      
      // Arama filtresi
      if (searchTerm && 
          !word.toLowerCase().includes(searchTerm) && 
          !wordData.translation.toLowerCase().includes(searchTerm)) {
        passesFilter = false;
      }
      
      // Durum filtresi
      if (currentFilter !== 'all') {
        const progressClass = getProgressClass(wordData.progress || 0);
        if (progressClass !== currentFilter) {
          passesFilter = false;
        }
      }
      
      // Filtrelerden geçtiyse ekle
      if (passesFilter) {
        filtered[word] = wordData;
      }
      
      return filtered;
    }, {});
    
    // Sonra sırala
    const sortedWords = Object.keys(filteredWords).sort((a, b) => {
      const wordA = filteredWords[a];
      const wordB = filteredWords[b];
      
      switch(currentSort) {
        case 'recent':
          return new Date(wordB.created || 0) - new Date(wordA.created || 0);
        case 'alphabetical':
          return a.localeCompare(b);
        case 'progress':
          return (wordB.progress || 0) - (wordA.progress || 0);
        case 'next-review':
          const nextA = wordA.nextReview ? new Date(wordA.nextReview) : new Date();
          const nextB = wordB.nextReview ? new Date(wordB.nextReview) : new Date();
          return nextA - nextB;
        default:
          return 0;
      }
    });
    
    // Kelimeleri görüntüle
    displayWords(sortedWords);
  }

  // Kelimeleri görüntüle
  function displayWords(sortedWords) {
    elements.wordsGrid.innerHTML = '';
    
    if (sortedWords.length === 0) {
      showEmptyState();
      return;
    }
    
    elements.emptyState.style.display = 'none';
    
    // Her kelime için kart oluştur
    sortedWords.forEach(word => {
      const wordData = filteredWords[word];
      const card = createWordCard(word, wordData);
      elements.wordsGrid.appendChild(card);
    });
  }

  // Kelime kartı oluştur
  function createWordCard(word, wordData) {
    const card = document.createElement('div');
    card.className = 'word-card';
    card.addEventListener('click', () => openWordModal(word, wordData));
    
    const progress = wordData.progress || 0;
    const progressClass = getProgressClass(progress);
    const progressLabel = getProgressLabel(progress);
    
    // Videonun kaynağını belirle
    let source = 'web';
    let sourceIcon = '🌐';
    if (wordData.source && wordData.source.includes('netflix')) {
      source = 'netflix';
      sourceIcon = '🎬';
    } else if (wordData.source && wordData.source.includes('youtube')) {
      source = 'youtube';
      sourceIcon = '▶️';
    }
    
    // Oluşturma tarihini formatlı göster
    const createdDate = wordData.created 
      ? new Date(wordData.created).toLocaleDateString() 
      : 'Bilinmiyor';
    
    // Kart içeriğini oluştur
    card.innerHTML = `
      <div class="word-header">
        <div class="word-title">${word}</div>
        <div class="word-status ${progressClass}">${progressLabel}</div>
      </div>
      <div class="word-translation">${wordData.translation}</div>
      <div class="word-progress">
        <div class="word-progress-bar ${progressClass}" style="width: ${progress}%"></div>
      </div>
      <div class="word-meta">
        <div class="word-date">📅 ${createdDate}</div>
        <div class="word-source ${source}">${sourceIcon} ${source.charAt(0).toUpperCase() + source.slice(1)}</div>
      </div>
    `;
    
    return card;
  }

  // Boş durum göster
  function showEmptyState(message = null) {
    elements.wordsGrid.innerHTML = '';
    elements.emptyState.style.display = 'block';
    
    if (message) {
      const emptyTitle = elements.emptyState.querySelector('h3');
      const emptyText = elements.emptyState.querySelector('p');
      
      emptyTitle.textContent = 'Bir Hata Oluştu';
      emptyText.textContent = message;
    } else {
      const emptyTitle = elements.emptyState.querySelector('h3');
      const emptyText = elements.emptyState.querySelector('p');
      
      if (elements.searchInput.value) {
        emptyTitle.textContent = 'Sonuç Bulunamadı';
        emptyText.textContent = 'Arama kriterlerinize uygun kelime bulunamadı.';
      } else {
        emptyTitle.textContent = 'Henüz kayıtlı kelime yok';
        emptyText.textContent = 'Youtube veya Netflix\'te video izlerken kelimelerin üzerine tıklayıp kaydedin!';
      }
    }
  }

  // Kelime Detay Modalı
  function openWordModal(word, wordData) {
    const progress = wordData.progress || 0;
    const progressClass = getProgressClass(progress);
    const progressLabel = getProgressLabel(progress);
    
    // Modal içeriğini doldur
    elements.modalWord.textContent = word;
    elements.modalTranslation.textContent = wordData.translation;
    elements.modalStatus.textContent = progressLabel;
    elements.modalProgressBar.className = `progress-segment ${progressClass}`;
    elements.modalProgressBar.style.width = `${progress}%`;
    
    // Tarihleri doldur
    elements.modalCreated.textContent = wordData.created 
      ? new Date(wordData.created).toLocaleDateString() 
      : 'Bilinmiyor';
    
    elements.modalLastViewed.textContent = wordData.lastViewed 
      ? new Date(wordData.lastViewed).toLocaleDateString() 
      : 'Hiç';
    
    elements.modalNextReview.textContent = wordData.nextReview 
      ? new Date(wordData.nextReview).toLocaleDateString() 
      : 'Belirlenmedi';
    
    // Bağlamları (context) doldur
    elements.modalContexts.innerHTML = '';
    
    if (wordData.contexts && wordData.contexts.length > 0) {
      wordData.contexts.forEach(context => {
        const contextItem = document.createElement('div');
        contextItem.className = 'context-item';
        
        // Video kaynağını belirle
        let source = 'Web sayfası';
        if (context.source && context.source.includes('netflix')) {
          source = 'Netflix';
        } else if (context.source && context.source.includes('youtube')) {
          source = 'YouTube';
        }
        
        // Video başlığı
        const title = context.title || source;
        
        // Zaman damgası
        const timestamp = context.timestamp 
          ? `${Math.floor(context.timestamp / 60)}:${String(Math.floor(context.timestamp % 60)).padStart(2, '0')}` 
          : '';
        
        contextItem.innerHTML = `
          <div class="context-text">${context.text}</div>
          <div class="context-source">
            <span>${title}</span>
            <span>${timestamp ? `${timestamp}` : ''}</span>
          </div>
        `;
        
        elements.modalContexts.appendChild(contextItem);
      });
    } else {
      elements.modalContexts.innerHTML = '<div class="context-item">Bu kelime için kaydedilmiş bağlam yok.</div>';
    }
    
    // Modalı göster
    elements.modal.style.display = 'flex';
    
    // Aktif kelimeyi kaydet (güncelleme için)
    elements.modalUpdate.setAttribute('data-word', word);
    elements.modalDelete.setAttribute('data-word', word);
    elements.modalSpeak.setAttribute('data-word', word);
    
    // Son görülme zamanını güncelle
    updateLastViewed(word);
  }

  // Kelime modal penceresini kapat
  function closeWordModal() {
    elements.modal.style.display = 'none';
  }

  // Son görülme zamanını güncelle
  async function updateLastViewed(word) {
    if (savedWords[word]) {
      savedWords[word].lastViewed = new Date().toISOString();
      
      try {
        await chrome.storage.local.set({ savedWords });
      } catch (error) {
        console.error('Son görülme zamanı güncellenirken hata oluştu:', error);
      }
    }
  }

  // Kelime ilerleme durumunu güncelle
  async function updateWordProgress(e) {
    const word = e.target.getAttribute('data-word');
    
    if (!savedWords[word]) return;
    
    // Mevcut ilerleme durumu
    let currentProgress = savedWords[word].progress || 0;
    
    // İlerleme durumunu artır (%25 adımlarla)
    currentProgress += 25;
    if (currentProgress > 100) currentProgress = 100;
    
    // Kelimeyi güncelle
    savedWords[word].progress = currentProgress;
    savedWords[word].lastUpdated = new Date().toISOString();
    
    // Sonraki tekrar tarihini hesapla
    savedWords[word].nextReview = calculateNextReviewDate(currentProgress);
    
    try {
      // Değişiklikleri kaydet
      await chrome.storage.local.set({ savedWords });
      
      // Modalı kapat ve listeyi güncelle
      closeWordModal();
      filterWords();
      showNotification('Kelime başarıyla güncellendi!');
    } catch (error) {
      console.error('Kelime güncellenirken hata oluştu:', error);
      showNotification('Kelime güncellenirken bir hata oluştu.', true);
    }
  }

  // Kelimeyi sil
  async function deleteWord(e) {
    const word = e.target.getAttribute('data-word');
    
    if (!savedWords[word]) return;
    
    if (confirm(`"${word}" kelimesini silmek istediğinize emin misiniz?`)) {
      try {
        // Kelimeyi sil
        delete savedWords[word];
        
        // Değişiklikleri kaydet
        await chrome.storage.local.set({ savedWords });
        
        // Modalı kapat ve listeyi güncelle
        closeWordModal();
        filterWords();
        updateStatistics();
        
        showNotification('Kelime başarıyla silindi!');
      } catch (error) {
        console.error('Kelime silinirken hata oluştu:', error);
        showNotification('Kelime silinirken bir hata oluştu.', true);
      }
    }
  }

  // Kelimeyi seslendir
  function speakWord(e) {
    const word = e.target.getAttribute('data-word');
    
    if (!word) return;
    
    try {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = elements.originalLang.value || 'en-US';
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('Kelime seslendirilirken hata oluştu:', error);
      showNotification('Kelime seslendirilemedi.', true);
    }
  }

  // Kelimeleri dışa aktar
  function exportWords() {
    if (Object.keys(savedWords).length === 0) {
      showNotification('Dışa aktarılacak kelime bulunamadı.', true);
      return;
    }
    
    try {
      // JSON verisi oluştur
      const jsonData = JSON.stringify(savedWords, null, 2);
      
      // Dosya indirme bağlantısı oluştur
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `language-learner-words-${new Date().toISOString().split('T')[0]}.json`;
      
      // Bağlantıyı tıkla ve kaldır
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      showNotification('Kelimeleriniz başarıyla dışa aktarıldı!');
    } catch (error) {
      console.error('Dışa aktarma hatası:', error);
      showNotification('Dışa aktarma sırasında bir hata oluştu.', true);
    }
  }

  // Kelimeleri içe aktar
  async function importWords(e) {
    const file = e.target.files[0];
    
    if (!file) return;
    
    try {
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const importedWords = JSON.parse(event.target.result);
          
          // İçe aktarılan kelime sayısı
          const importCount = Object.keys(importedWords).length;
          
          if (importCount === 0) {
            showNotification('İçe aktarılacak kelime bulunamadı.', true);
            return;
          }
          
          // Mevcut kelimelerle birleştir
          const mergedWords = { ...savedWords, ...importedWords };
          
          // Değişiklikleri kaydet
          await chrome.storage.local.set({ savedWords: mergedWords });
          
          // Değişkeni güncelle
          savedWords = mergedWords;
          
          // Listeyi güncelle
          filterWords();
          updateStatistics();
          
          showNotification(`${importCount} kelime başarıyla içe aktarıldı!`);
        } catch (parseError) {
          console.error('Dosya ayrıştırma hatası:', parseError);
          showNotification('Geçersiz JSON dosyası. Lütfen doğru formatta bir dosya seçin.', true);
        }
      };
      
      reader.readAsText(file);
    } catch (error) {
      console.error('İçe aktarma hatası:', error);
      showNotification('İçe aktarma sırasında bir hata oluştu.', true);
    }
  }

  // Tüm kelimeleri sil
  async function clearAllWords() {
    try {
      // Kelimeleri sıfırla
      savedWords = {};
      
      // Storage'ı güncelle
      await chrome.storage.local.set({ savedWords });
      
      // Listeyi güncelle
      filterWords();
      updateStatistics();
      
      showNotification('Tüm kelimeler başarıyla silindi.');
    } catch (error) {
      console.error('Kelimeler silinirken hata oluştu:', error);
      showNotification('Kelimeler silinirken bir hata oluştu.', true);
    }
  }

  // =====================================================================
  // İstatistik Fonksiyonları
  // =====================================================================
  
  // İstatistikleri güncelle
  function updateStatistics() {
    // İlerleme durumlarına göre kelime sayıları
    let counts = {
      total: 0,
      new: 0,
      learning: 0,
      reviewing: 0,
      learned: 0
    };
    
    // Son 7 ve 30 günde eklenen kelimeler
    let lastWeekAdded = 0;
    let lastMonthAdded = 0;
    let lastMonthLearned = 0;
    
    // Tarih hesaplamaları için
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Tüm kelimeleri hesapla
    Object.keys(savedWords).forEach(word => {
      const wordData = savedWords[word];
      const progress = wordData.progress || 0;
      const progressClass = getProgressClass(progress);
      
      // Toplam sayıyı artır
      counts.total++;
      
      // İlerleme durumuna göre sayıları artır
      counts[progressClass]++;
      
      // Ekleme tarihi hesaplamaları
      if (wordData.created) {
        const createdDate = new Date(wordData.created);
        
        if (createdDate > oneWeekAgo) {
          lastWeekAdded++;
        }
        
        if (createdDate > oneMonthAgo) {
          lastMonthAdded++;
        }
      }
      
      // Son ay içinde öğrenilen kelimeler
      if (progressClass === 'learned' && wordData.lastUpdated) {
        const lastUpdated = new Date(wordData.lastUpdated);
        
        if (lastUpdated > oneMonthAgo) {
          lastMonthLearned++;
        }
      }
    });
    
    // İstatistik değerlerini güncelle
    elements.totalWords.textContent = counts.total;
    elements.newWords.textContent = counts.new;
    elements.learningWords.textContent = counts.learning;
    elements.reviewingWords.textContent = counts.reviewing;
    elements.learnedWords.textContent = counts.learned;
    
    // Son aktivite istatistikleri
    elements.lastWeekAdded.textContent = lastWeekAdded;
    elements.lastMonthAdded.textContent = lastMonthAdded;
    elements.lastMonthLearned.textContent = lastMonthLearned;
    
    // İlerleme çubuğu genişlikleri
    const totalWidth = counts.total > 0 ? 100 : 0;
    const newWidth = counts.total > 0 ? (counts.new / counts.total) * 100 : 0;
    const learningWidth = counts.total > 0 ? (counts.learning / counts.total) * 100 : 0;
    const reviewingWidth = counts.total > 0 ? (counts.reviewing / counts.total) * 100 : 0;
    const learnedWidth = counts.total > 0 ? (counts.learned / counts.total) * 100 : 0;
    
    // İlerleme çubuklarını güncelle
    elements.newProgress.style.width = `${newWidth}%`;
    elements.learningProgress.style.width = `${learningWidth}%`;
    elements.reviewingProgress.style.width = `${reviewingWidth}%`;
    elements.learnedProgress.style.width = `${learnedWidth}%`;
  }

  // =====================================================================
  // Ayarlar Fonksiyonları
  // =====================================================================
  
  // Ayarları yükle
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get('settings');
      settings = result.settings || getDefaultSettings();
      
      // Form elemanlarını ayarlarla doldur
      elements.originalLang.value = settings.originalLang || 'en';
      elements.translationLang.value = settings.translationLang || 'tr';
      elements.autoTranslate.checked = settings.autoTranslate !== false;
      elements.autoSpeak.checked = settings.autoSpeak === true;
      elements.autoSubtitle.checked = settings.autoSubtitle !== false;
      elements.speechRecognition.checked = settings.speechRecognition !== false;
      elements.progressDays.value = settings.progressDays || 7;
    } catch (error) {
      console.error('Ayarlar yüklenirken hata oluştu:', error);
      showNotification('Ayarlar yüklenirken bir hata oluştu.', true);
    }
  }

  // Tüm ayarları kaydet
  async function saveAllSettings() {
    // Form elemanlarından ayarları al
    settings = {
      originalLang: elements.originalLang.value,
      translationLang: elements.translationLang.value,
      autoTranslate: elements.autoTranslate.checked,
      autoSpeak: elements.autoSpeak.checked,
      autoSubtitle: elements.autoSubtitle.checked,
      speechRecognition: elements.speechRecognition.checked,
      progressDays: parseInt(elements.progressDays.value, 10) || 7
    };
    
    try {
      // Ayarları kaydet
      await chrome.storage.local.set({ settings });
      showNotification('Ayarlarınız başarıyla kaydedildi!');
    } catch (error) {
      console.error('Ayarlar kaydedilirken hata oluştu:', error);
      showNotification('Ayarlar kaydedilirken bir hata oluştu.', true);
    }
  }

  // Varsayılan ayarlar
  function getDefaultSettings() {
    return {
      originalLang: 'en',
      translationLang: 'tr',
      autoTranslate: true,
      autoSpeak: false,
      autoSubtitle: true,
      speechRecognition: true,
      progressDays: 7
    };
  }

  // Ayarları sıfırla
  async function resetSettings() {
    if (confirm('Tüm ayarlar varsayılan değerlere sıfırlanacak. Emin misiniz?')) {
      settings = getDefaultSettings();
      
      try {
        // Ayarları kaydet
        await chrome.storage.local.set({ settings });
        
        // Form elemanlarını güncelle
        loadSettings();
        
        showNotification('Ayarlarınız varsayılan değerlere sıfırlandı.');
      } catch (error) {
        console.error('Ayarlar sıfırlanırken hata oluştu:', error);
        showNotification('Ayarlar sıfırlanırken bir hata oluştu.', true);
      }
    }
  }

  // =====================================================================
  // API Kullanım Durumu
  // =====================================================================
  
  // API kullanım durumunu yükle
  async function loadApiUsage() {
    try {
      const result = await chrome.storage.local.get('apiUsage');
      apiUsage = result.apiUsage || { used: 0, limit: 5000 };
      
      updateApiStatus();
    } catch (error) {
      console.error('API kullanım durumu yüklenirken hata oluştu:', error);
    }
  }

  // API durumu göstergesini güncelle
  function updateApiStatus() {
    const used = apiUsage.used || 0;
    const limit = apiUsage.limit || 5000;
    const percentage = Math.round((used / limit) * 100);
    
    elements.apiStatusText.textContent = `API: ${used}/${limit}`;
    
    // Durum ikonunu renklendir
    if (percentage < 50) {
      elements.apiStatusIcon.style.color = '#10b981'; // Yeşil
      elements.apiStatusIcon.textContent = '✓';
    } else if (percentage < 80) {
      elements.apiStatusIcon.style.color = '#f59e0b'; // Sarı
      elements.apiStatusIcon.textContent = '⚡';
    } else {
      elements.apiStatusIcon.style.color = '#ef4444'; // Kırmızı
      elements.apiStatusIcon.textContent = '⚠';
    }
  }

  // =====================================================================
  // Yardımcı Fonksiyonlar
  // =====================================================================
  
  // İlerleme durumuna göre sınıf adı
  function getProgressClass(progress) {
    if (progress >= 100) return 'learned';
    if (progress >= 75) return 'reviewing';
    if (progress >= 25) return 'learning';
    return 'new';
  }

  // İlerleme durumuna göre etiket
  function getProgressLabel(progress) {
    if (progress >= 100) return 'Öğrenildi';
    if (progress >= 75) return 'Tekrarlama';
    if (progress >= 25) return 'Öğreniliyor';
    return 'Yeni';
  }

  // Sonraki tekrar tarihini hesapla
  function calculateNextReviewDate(progress) {
    const now = new Date();
    let daysToAdd = 1;
    
    if (progress >= 100) {
      // Öğrenilmiş kelimeler için daha uzun süre (varsayılan 30 gün)
      daysToAdd = 30;
    } else if (progress >= 75) {
      // Tekrarlama aşamasındaki kelimeler için 7 gün
      daysToAdd = 7;
    } else if (progress >= 25) {
      // Öğrenme aşamasındaki kelimeler için 3 gün
      daysToAdd = 3;
    } else {
      // Yeni kelimeler için 1 gün
      daysToAdd = 1;
    }
    
    // Ayarlardaki progressDays değerini kullan
    const progressDays = settings.progressDays || 7;
    daysToAdd = Math.round(daysToAdd * (progressDays / 7));
    
    // Tarihi hesapla
    const nextDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    return nextDate.toISOString();
  }

  // Bildirim göster
  function showNotification(message, isError = false) {
    // Toast bildirim oluştur
    const notification = document.createElement('div');
    notification.className = `ll-notification ${isError ? 'll-notification-error' : ''}`;
    notification.textContent = message;
    
    // Bildirimi ekle
    document.body.appendChild(notification);
    
    // 3 saniye sonra bildirim kaybolsun
    setTimeout(() => {
      notification.classList.add('ll-notification-hide');
      
      // Animasyon bitince elementi kaldır
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }
}); 