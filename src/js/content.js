/**
 * LanguageLearner Extension - Content script
 * Handles subtitle processing and user interactions on Netflix and YouTube
 */

// Global variables
let settings = {
  originalLanguage: 'en',
  translationLanguage: 'tr',
  autoTranslate: true,
  autoSpeak: false,
  autoPauseAtSubtitleEnd: true,
  useLocalDictionary: false,
  showControlPanel: true,
  wordProgressDays: '7',
  extensionEnabled: true, // Eklenti açık/kapalı durumu
  autoShowSubtitlePopup: true, // Otomatik altyazı popup'u gösterme
  useSpeechRecognition: true, // Ses tanıma özelliği
  speechRecognitionConfidence: 0.6, // Konuşma tanıma güven eşiği
  autoStartSpeechRecognition: true, // Otomatik konuşma tanıma başlatma
};

let dictionary = {}; // Artık sadece önbellek olarak kullanılacak
let subtitleObserver = null;
let translationTooltip = null;
let controlPanel = null;
let subtitlePopup = null; // Altyazı popup'u için element referansı
let isNetflix = false;
let isYouTube = false;
let tooltipTimeout = null;
let lastSubtitle = '';
let translationCache = {}; // Çeviri sonuçlarını önbelleğe almak için
let recognition = null; // Speech recognition nesnesi
let isRecognizing = false; // Ses tanıma durumu
let recognitionTimeouts = []; // Timeout temizleme için array
let lastRecognitionTime = 0; // Son tanıma zamanı
let recognizedText = ''; // Tanınan metin
let recognitionPaused = false; // Ses tanıma duraklatıldı mı?
let recognitionResults = []; // Tanıma sonuçları geçmişi
let videoHasCaptions = false; // Video altyazılı mı?
let speechRecognitionEnabled = true; // Ses tanıma etkin mi?
let mouseX = 0;
let mouseY = 0;

// Track mouse position for tooltip positioning
document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Detect platform
  isNetflix = window.location.hostname.includes('netflix.com');
  isYouTube = window.location.hostname.includes('youtube.com');
  
  if (isNetflix || isYouTube) {
    console.log('LanguageLearner: Initializing on', isNetflix ? 'Netflix' : 'YouTube');
    initialize();
  }
});

// Initialize content script
async function initialize() {
  try {
    // Load settings first
    await loadSettings();
    
    // Set default autoStartSpeechRecognition to true if not defined
    if (settings.autoStartSpeechRecognition === undefined) {
      settings.autoStartSpeechRecognition = true;
      saveSetting('autoStartSpeechRecognition', true);
    }
    
    // Detect platform
    isNetflix = window.location.hostname.includes('netflix.com');
    isYouTube = window.location.hostname.includes('youtube.com');
    
    if (!isNetflix && !isYouTube) {
      console.log('Not a supported platform');
      return;
    }
    
    console.log('LanguageLearner: Content script initializing...');
    
    // Create activation button
    activationButton = createActivationButton();
    document.body.appendChild(activationButton);
    
    // Create subtitle popup
    subtitlePopup = createSubtitlePopup();
    document.body.appendChild(subtitlePopup);
    
    // Create tooltip
    tooltip = createTranslationTooltip();
    
    // Find video element and start observation
    const videoElement = getVideoElement();
    if (videoElement) {
      // Add event listener for play
      videoElement.addEventListener('play', () => {
        console.log('Video play event detected');
        if (settings.useSpeechRecognition && settings.autoStartSpeechRecognition) {
          console.log('Auto-starting speech recognition');
          startSpeechRecognition();
        }
      });
      
      // Also check if video is already playing
      if (!videoElement.paused && settings.useSpeechRecognition && settings.autoStartSpeechRecognition) {
        console.log('Video already playing, starting speech recognition');
        startSpeechRecognition();
      }
    } else {
      // If no video is found, wait for it to appear
      console.log('No video found, waiting...');
      waitForVideoAndStart();
    }
    
    // Create or update control panel
    controlPanel = createControlPanel();
    document.body.appendChild(controlPanel);
    
    // Add subtitle observer if subtitles are enabled
    if (settings.extensionEnabled) {
      startSubtitleObservation();
    }
    
    // Add transcript button to Netflix interface
    if (isNetflix && settings.showControlPanel) {
      addTranscriptButton();
    }
    
    // Start speech recognition if enabled
    if (settings.useSpeechRecognition && settings.autoStartSpeechRecognition) {
      startSpeechRecognition();
    }
    
    console.log('LanguageLearner: Content script initialized');
    
    // Set up interval to check and restart speech recognition if needed
    setInterval(checkAndRestartSpeechRecognition, 10000);
  } catch (error) {
    console.error('Error initializing content script:', error);
  }
}

// Video hazır olunca başlat
function waitForVideoAndStart() {
  const maxAttempts = 15;
  let attempts = 0;
  
  function checkVideo() {
    const video = getVideoElement();
    if (video) {
      console.log('Video bulundu, ses tanıma başlatılıyor...');
      startSpeechRecognition();
    } else if (attempts < maxAttempts) {
      attempts++;
      setTimeout(checkVideo, 1000);
    } else {
      console.log('Video bulunamadı, ses tanıma başlatılamadı.');
    }
  }
  
  checkVideo();
}

// Kontrol et ve gerekirse speech recognition'ı yeniden başlat
function checkAndRestartSpeechRecognition() {
  try {
    // Only proceed if settings allow it and auto-start is enabled
    if (!settings.useSpeechRecognition || !settings.autoStartSpeechRecognition) {
      return;
    }
    
    const videoElement = getVideoElement();
    if (!videoElement) {
      console.log('No video element found, cannot restart speech recognition');
      return;
    }
    
    // Only restart if video is playing and recognition is not active
    if (!isRecognizing && !videoElement.paused) {
      console.log('Video is playing but speech recognition is not active. Restarting...');
      startSpeechRecognition();
      
      // Show notification
      showNotification('Konuşma tanıma yeniden başlatıldı');
    }
  } catch (error) {
    console.error('Error checking and restarting speech recognition:', error);
  }
}

// Load settings from storage
async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get('settings', ({ settings: storedSettings }) => {
      if (storedSettings) {
        settings = { ...settings, ...storedSettings };
      }
      resolve();
    });
  });
}

// Save a single setting
function saveSetting(key, value) {
  chrome.storage.local.get('settings', ({ settings: storedSettings }) => {
    const newSettings = { ...storedSettings, [key]: value };
    chrome.storage.local.set({ settings: newSettings }, () => {
      settings[key] = value;
    });
  });
}

// Create the toggle button to enable/disable the extension
function createActivationButton() {
  const button = document.createElement('button');
  button.className = 'll-speech-button';
  button.innerHTML = '🎤';
  button.title = 'Konuşma Tanıma / Kelimeler';
  
  button.addEventListener('click', () => {
    // Open words.html in a new tab
    chrome.runtime.sendMessage({
      action: 'openWordsPage'
    });
  });
  
  return button;
}

// Create subtitle popup for showing current subtitle
function createSubtitlePopup() {
  if (subtitlePopup) {
    subtitlePopup.remove();
  }
  
  subtitlePopup = document.createElement('div');
  subtitlePopup.className = 'll-subtitle-popup ll-simple-design';
  subtitlePopup.style.display = settings.extensionEnabled && settings.autoShowSubtitlePopup ? 'block' : 'none';
  
  // Restore saved position if available
  chrome.storage.local.get('subtitlePopupPosition', (data) => {
    if (data.subtitlePopupPosition) {
      const { top, left, width, height } = data.subtitlePopupPosition;
      
      // Apply saved position and size
      subtitlePopup.style.top = top + 'px';
      subtitlePopup.style.left = left + 'px';
      subtitlePopup.style.width = width + 'px';
      subtitlePopup.style.height = height + 'px';
      subtitlePopup.style.transform = 'none'; // Reset the transform which centers it
      subtitlePopup.style.bottom = 'auto'; // Reset bottom positioning
    }
  });
  
  // Content
  const content = document.createElement('div');
  content.className = 'll-subtitle-popup-content';
  
  // Original subtitle
  const originalDiv = document.createElement('div');
  originalDiv.className = 'll-original-subtitle';
  originalDiv.textContent = 'Altyazı bekleniyor...';
  content.appendChild(originalDiv);
  
  // Translated subtitle
  const translatedDiv = document.createElement('div');
  translatedDiv.className = 'll-translated-subtitle';
  translatedDiv.textContent = 'Çeviri bekleniyor...';
  content.appendChild(translatedDiv);
  
  subtitlePopup.appendChild(content);
  
  // Make it draggable (whole popup is now a drag handle)
  makeDraggable(subtitlePopup, subtitlePopup);
  
  // Save position when moved or resized
  const savePosition = () => {
    const rect = subtitlePopup.getBoundingClientRect();
    chrome.storage.local.set({
      subtitlePopupPosition: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }
    });
  };
  
  // Add resize observer to save size
  const resizeObserver = new ResizeObserver(() => {
    savePosition();
  });
  resizeObserver.observe(subtitlePopup);
  
  // Save position when dragged
  subtitlePopup.addEventListener('mouseup', savePosition);
  
  return subtitlePopup;
}

// Create translation tooltip element
function createTranslationTooltip() {
  // Remove existing tooltip if any
  if (translationTooltip) {
    translationTooltip.remove();
  }
  
  translationTooltip = document.createElement('div');
  translationTooltip.className = 'll-tooltip';
  translationTooltip.style.display = 'none';
  
  // Create tooltip content
  const tooltipContent = document.createElement('div');
  tooltipContent.className = 'll-tooltip-content';
  
  const tooltipOriginal = document.createElement('div');
  tooltipOriginal.className = 'll-tooltip-original';
  tooltipContent.appendChild(tooltipOriginal);
  
  const tooltipTranslation = document.createElement('div');
  tooltipTranslation.className = 'll-tooltip-translation';
  tooltipContent.appendChild(tooltipTranslation);
  
  // Create tooltip actions
  const tooltipActions = document.createElement('div');
  tooltipActions.className = 'll-tooltip-actions';
  
  const saveButton = document.createElement('button');
  saveButton.className = 'll-tooltip-save-btn';
  saveButton.textContent = 'Kaydet';
  saveButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const word = tooltipOriginal.textContent.trim();
    const translation = tooltipTranslation.textContent.trim();
    saveWord(word, translation);
  });
  tooltipActions.appendChild(saveButton);
  
  const speakButton = document.createElement('button');
  speakButton.className = 'll-tooltip-speak-btn';
  speakButton.textContent = '🔊';
  speakButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const word = tooltipOriginal.textContent.trim();
    speakText(word, settings.originalLanguage);
  });
  tooltipActions.appendChild(speakButton);
  
  tooltipContent.appendChild(tooltipActions);
  translationTooltip.appendChild(tooltipContent);
  
  // Add tooltip to body
  document.body.appendChild(translationTooltip);
  
  // Close tooltip when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (translationTooltip.style.display === 'block' && 
        !translationTooltip.contains(e.target)) {
      hideTooltip();
    }
  });
}

// Show tooltip
function showTooltip(x, y, original, translation) {
  if (!translationTooltip) {
    createTranslationTooltip();
  }
  
  // Clear any existing timeout
  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
  }
  
  // Update tooltip content
  const tooltipOriginal = translationTooltip.querySelector('.ll-tooltip-original');
  const tooltipTranslation = translationTooltip.querySelector('.ll-tooltip-translation');
  
  tooltipOriginal.textContent = original;
  tooltipTranslation.textContent = translation;
  
  // Position tooltip
  translationTooltip.style.left = `${x}px`;
  translationTooltip.style.top = `${y}px`;
  translationTooltip.style.display = 'block';
  
  // Auto-hide tooltip after 5 seconds
  tooltipTimeout = setTimeout(() => {
    hideTooltip();
  }, 5000);
}

// Hide translation tooltip
function hideTooltip() {
  if (translationTooltip) {
    translationTooltip.style.display = 'none';
  }
  
  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = null;
  }
}

// Show translation for a word - tooltip konumlandırmayı güncelle
async function showTranslation(event, word, element, forceShow = false) {
  if (!word || !settings.extensionEnabled) return;
  
  try {
    // Get translation from API (through background script)
    const translation = await translate(word, settings.originalLanguage, settings.translationLanguage);
    
    // Tooltip'i güncelle
    showWordTranslation(element, translation || 'Çeviri bulunamadı');
    
    // Auto-speak if enabled
    if (settings.autoSpeak) {
      speakText(word, settings.originalLanguage);
    }
  } catch (error) {
    console.error('Translation error:', error);
    showWordTranslation(element, 'Çeviri hatası');
  }
}

// Translate text using background.js API
async function translate(text, fromLang, toLang) {
  // Check if this is an empty string
  if (!text || text.trim().length === 0) {
    return { success: false, translation: 'Boş metin çevrilemez', error: 'Empty text' };
  }

  // Check if we have a cached translation
  const cacheKey = `${text}|${fromLang}|${toLang}`;
  if (translationCache[cacheKey]) {
    console.log(`Cached translation used for: ${text}`);
    return translationCache[cacheKey];
  }

  // Show notification for longer texts
  if (text.length > 50) {
    showNotification('Metin çevriliyor, lütfen bekleyin...');
  }

  try {
    // Send message to background script
    const response = await chrome.runtime.sendMessage({
      action: 'translateWord',
      word: text,
      from: fromLang,
      to: toLang
    });

    // Cache the result
    if (response.success) {
      translationCache[cacheKey] = response;
      
      // Periodically save the cache to avoid excessive storage operations
      if (!saveCacheTimeout) {
        saveCacheTimeout = setTimeout(() => {
          chrome.storage.local.set({ translationCache });
          saveCacheTimeout = null;
        }, 5000); // Save after 5 seconds of inactivity
      }
    } else {
      console.error('Çeviri hatası:', response.error || 'Bilinmeyen hata');
    }

    return response;
  } catch (error) {
    console.error('Çeviri API hatası:', error);
    return { 
      success: false, 
      translation: 'Çeviri hatası: ' + (error.message || 'Bağlantı sorunu'),
      error: error.message || 'Connection error'
    };
  }
}

// Speak text using Web Speech API
function speakText(text, lang) {
  if (!text || !('speechSynthesis' in window)) return;
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  // Create utterance
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'en' ? 'en-US' : lang;
  utterance.rate = 0.9; // Slightly slower for better understanding
  
  // Speak
  window.speechSynthesis.speak(utterance);
}

// Save a word to background.js
async function saveWord(word, translation, context = null) {
  try {
    // Validate inputs
    if (!word || !translation) {
      showNotification('Kelime veya çeviri boş olamaz', true);
      return { success: false, error: 'Missing word or translation' };
    }
    
    // Skip saving if translation contains error messages
    if (translation.includes('hatası') || translation.includes('Error') || 
        translation.includes('WARNING') || translation.includes('Invalid')) {
      showNotification(`Hatalı çeviri kaydedilemez: ${translation}`, true);
      return { success: false, error: 'Invalid translation' };
    }
    
    // Get context from subtitles or speech recognition if not provided
    if (!context) {
      const subtitleElement = document.querySelector('.ll-original-subtitle');
      if (subtitleElement) {
        context = {
          text: subtitleElement.textContent,
          source: isNetflix ? 'Netflix' : isYouTube ? 'YouTube' : 'Video'
        };
      }
    }
    
    // Get video information
    const videoTitle = getVideoTitle();
    const videoUrl = window.location.href;
    const timestamp = getVideoCurrentTime();
    
    console.log(`Kelime kaydediliyor: "${word}" = "${translation}"`);
    
    // Send to background script
    const response = await chrome.runtime.sendMessage({
      action: 'saveWord',
      word: word,
      translation: translation,
      context: context,
      source: videoTitle,
      sourceUrl: videoUrl,
      timestamp: timestamp
    });
    
    // Show notification based on result
    if (response && response.success) {
      showNotification(`"${word}" kelimesi kaydedildi!`);
    } else {
      showNotification(`Kelime kaydedilemedi: ${response?.error || 'Bilinmeyen hata'}`, true);
    }
    
    return response;
  } catch (error) {
    console.error('Kelime kaydedilirken hata:', error);
    showNotification('Kelime kaydedilemedi', true);
    return { success: false, error: error.message };
  }
}

// Video başlığını al
function getVideoTitle() {
  let title = '';
  
  if (isNetflix) {
    const titleElement = document.querySelector('.video-title h4');
    if (titleElement) {
      title = titleElement.textContent?.trim();
    }
  } else if (isYouTube) {
    // Farklı seçicileri dene
    const selectors = [
      '.title .ytd-video-primary-info-renderer',
      'h1.title',
      '#container h1.title',
      'yt-formatted-string.ytd-video-primary-info-renderer'
    ];
    
    for (const selector of selectors) {
      const titleElement = document.querySelector(selector);
      if (titleElement && titleElement.textContent?.trim()) {
        title = titleElement.textContent.trim();
        break;
      }
    }
  }
  
  return title || 'Video başlığı bulunamadı';
}

// Video zaman damgasını al
function getVideoCurrentTime() {
  const videoElement = getVideoElement();
  return videoElement ? Math.floor(videoElement.currentTime) : 0;
}

// Calculate next review date using spaced repetition algorithm
function calculateNextReviewDate(progress) {
  const now = new Date();
  let daysToAdd = 1; // Default interval
  
  // Aralıklı tekrar algoritması
  // progress değerine göre sonraki tekrar günü
  if (progress < 25) { // Yeni kelimeler
    daysToAdd = 1;
  } else if (progress < 50) { // Öğrenmeye başladığımız
    daysToAdd = 3;
  } else if (progress < 75) { // İyi bildiğimiz
    daysToAdd = 7;
  } else { // Çok iyi bildiğimiz
    daysToAdd = 14;
  }
  
  now.setDate(now.getDate() + daysToAdd);
  return now.toISOString();
}

// Update saved words list with enhanced learning status display
async function updateSavedWordsList() {
  const listElement = document.getElementById('ll-saved-words-list');
  if (!listElement) return;
  
  const response = await chrome.runtime.sendMessage({ action: 'getSavedWords' });
  const savedWords = response || [];
  
  listElement.innerHTML = '';
  savedWords.forEach(word => {
    const wordElement = document.createElement('div');
    wordElement.className = 'll-saved-word-item';
    
    // Öğrenme durumu için renkli gösterge
    const progressValue = word.learningProgress || 0;
    const progressClass = getProgressClass(progressValue);
    
    wordElement.innerHTML = `
      <span class="ll-word-text">${word.word}</span>
      <span class="ll-word-translation">${word.translation}</span>
      <div class="ll-word-progress-container">
        <div class="ll-word-progress-bar ${progressClass}" style="width: ${progressValue}%"></div>
        <span class="ll-word-progress-label">${getProgressLabel(progressValue)}</span>
      </div>
      <div class="ll-word-review">
        <span class="ll-word-status ${word.status || 'new'}">${word.status || 'new'}</span>
        <span class="ll-word-next-review">${formatReviewDate(word.nextReviewDate)}</span>
      </div>
    `;
    
    // Add interactivity to update learning status
    wordElement.addEventListener('click', () => {
      updateWordLearningProgress(word);
    });
    
    listElement.appendChild(wordElement);
  });
  
  // Update saved count
  const savedCount = document.getElementById('ll-saved-count');
  if (savedCount) {
    savedCount.textContent = `${savedWords.length} kelime kaydedildi`;
  }
}

// Helper function to determine progress class
function getProgressClass(progress) {
  if (progress < 25) return 'progress-new';
  if (progress < 50) return 'progress-learning';
  if (progress < 75) return 'progress-reviewing';
  return 'progress-learned';
}

// Helper function to get progress label
function getProgressLabel(progress) {
  if (progress < 25) return 'Yeni';
  if (progress < 50) return 'Öğreniliyor';
  if (progress < 75) return 'Tekrarlama';
  return 'Öğrenildi';
}

// Format next review date
function formatReviewDate(dateString) {
  if (!dateString) return '';
  
  const reviewDate = new Date(dateString);
  const now = new Date();
  
  // Tarih bugün mü?
  if (reviewDate.toDateString() === now.toDateString()) {
    return 'Bugün';
  }
  
  // Tarih yarın mı?
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (reviewDate.toDateString() === tomorrow.toDateString()) {
    return 'Yarın';
  }
  
  // Diğer durumlar için tarih formatı
  const options = { day: 'numeric', month: 'short' };
  return reviewDate.toLocaleDateString('tr-TR', options);
}

// Update word learning progress when clicked
function updateWordLearningProgress(word) {
  // İlerlemeyi artır (her tıklamada %25 artar)
  let newProgress = (word.learningProgress || 0) + 25;
  if (newProgress > 100) newProgress = 100;
  
  const updatedWord = {
    word: word.word,
    learningProgress: newProgress,
    status: getProgressLabel(newProgress),
    lastViewed: new Date().toISOString(),
    nextReviewDate: calculateNextReviewDate(newProgress)
  };
  
  chrome.runtime.sendMessage({
    action: 'updateWordStatus',
    word: updatedWord
  }, (response) => {
    if (response && response.success) {
      showNotification(`"${word.word}" öğrenme durumu güncellendi: ${getProgressLabel(newProgress)}`);
      updateSavedWordsList();
    } else {
      showNotification('Kelime durumu güncellenirken hata oluştu', true);
    }
  });
}

// Create transcript page with resize handle
function createTranscriptPage() {
  const container = document.createElement('div');
  container.className = 'll-transcript-page';
  container.innerHTML = `
    <div class="ll-transcript-header">
      <div class="ll-transcript-controls">
        <button id="ll-toggle-recognition" class="ll-btn">Konuşma Tanıma: Açık</button>
        <button id="ll-clear-transcript" class="ll-btn">Metni Temizle</button>
        <button id="ll-close-transcript" class="ll-btn ll-btn-secondary">Kapat</button>
      </div>
      <div class="ll-transcript-stats">
        <span id="ll-word-count">0 kelime</span>
        <span id="ll-saved-count">0 kelime kaydedildi</span>
      </div>
    </div>
    <div class="ll-transcript-content">
      <div id="ll-transcript-text" class="ll-transcript-text"></div>
      <div class="ll-saved-words-panel">
        <h3>Kaydedilen Kelimeler</h3>
        <div id="ll-saved-words-list" class="ll-saved-words-list"></div>
      </div>
    </div>
    <div class="ll-transcript-resize"></div>
  `;
  
  document.body.appendChild(container);
  setupTranscriptListeners();
  
  // Make resizable by dragging the resize handle
  const resizeHandle = container.querySelector('.ll-transcript-resize');
  const textarea = container.querySelector('.ll-transcript-content');
  
  let startX, startY, startWidth, startHeight;
  
  resizeHandle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    startWidth = container.offsetWidth;
    startHeight = container.offsetHeight;
    
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
  });
  
  function resize(e) {
    container.style.width = `${startWidth + e.clientX - startX}px`;
    container.style.height = `${startHeight + e.clientY - startY}px`;
  }
  
  function stopResize() {
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
  }
  
  return container;
}

// Setup speech recognition
function setupSpeechRecognition() {
  if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
    showNotification('Tarayıcınız konuşma tanımayı desteklemiyor.', true);
    return null;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  
  return recognition;
}

// Handle speech recognition results
function handleSpeechResult(event, transcriptElement) {
  const results = Array.from(event.results);
  let finalTranscript = '';
  let interimTranscript = '';
  
  results.forEach(result => {
    const transcript = result[0].transcript;
    if (result.isFinal) {
      finalTranscript += transcript + ' ';
      processTranscript(transcript, transcriptElement);
    } else {
      interimTranscript += transcript;
    }
  });
  
  // Update word count
  const wordCount = document.getElementById('ll-word-count');
  if (wordCount) {
    const words = transcriptElement.textContent.split(/\s+/).filter(w => w.length > 0);
    wordCount.textContent = `${words.length} kelime`;
  }
}

// Process transcript and make words interactive
function processTranscript(text, container) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const fragment = document.createDocumentFragment();
  
  words.forEach(word => {
    const span = document.createElement('span');
    span.className = 'll-word';
    span.textContent = word + ' ';
    
    // Add hover translation
    span.addEventListener('mouseenter', async () => {
      const response = await chrome.runtime.sendMessage({
        action: 'translateWord',
        word: word.toLowerCase().replace(/[.,!?]/g, ''),
        from: 'en',
        to: 'tr'
      });
      
      if (response.success) {
        showWordTranslation(span, response.translation);
      }
    });
    
    // Add click to save
    span.addEventListener('click', async () => {
      const response = await chrome.runtime.sendMessage({
        action: 'translateWord',
        word: word.toLowerCase().replace(/[.,!?]/g, ''),
        from: 'en',
        to: 'tr'
      });
      
      if (response.success) {
        saveWord({
          word: word.toLowerCase().replace(/[.,!?]/g, ''),
          translation: response.translation,
          originalLanguage: 'en',
          translationLanguage: 'tr',
          context: text,
          source: window.location.href,
          timestamp: new Date().toISOString()
        });
        updateSavedWordsList();
      }
    });
    
    fragment.appendChild(span);
  });
  
  container.appendChild(fragment);
}

// Show translation tooltip for a word
function showWordTranslation(element, translation, isError = false) {
  try {
    // Create or get tooltip
    let tooltip = document.querySelector('.ll-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'll-tooltip';
      document.body.appendChild(tooltip);
    }

    // Set current element reference
    tooltip.currentElement = element;

    // Set the simple translation text
    tooltip.textContent = isError ? `Error: ${translation}` : translation;

    // Position the tooltip
    const rect = element.getBoundingClientRect();
    positionTooltip(tooltip, rect);
    
    // Add highlight class to word
    element.classList.add('ll-word-highlight');
    
    // Make tooltip visible
    tooltip.style.display = 'block';
    
    // Add click listener to save word
    element.onclick = async () => {
      await saveWord(element.textContent.trim().replace(/[.,!?;:'"()]/g, ''), translation);
    };
  } catch (error) {
    console.error('Error showing word translation:', error);
  }
}

// Hide word translation tooltip
function hideWordTranslation() {
  const tooltip = document.querySelector('.ll-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
    
    // Remove highlight from word
    if (tooltip.currentElement) {
      tooltip.currentElement.classList.remove('ll-word-highlight');
    }
  }
}

// Check if mouse is over tooltip
function isMouseOverTooltip(tooltip) {
  return tooltip && tooltip.isHovered;
}

// Check if mouse is over word element
function isMouseOverWord(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return (
    mouseX >= rect.left && mouseX <= rect.right &&
    mouseY >= rect.top && mouseY <= rect.bottom
  );
}

// Position the tooltip in optimal location
function positionTooltip(tooltip, rect) {
  // Position above the word
  let top = rect.top - tooltip.offsetHeight - 5;
  let left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);
  
  // Calculate max width/height for visibility
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Check if tooltip would go off-screen on the top
  if (top < 10) {
    // Position below the word instead
    top = rect.bottom + 5;
  }
  
  // Make sure it doesn't go off the right edge
  if (left + tooltip.offsetWidth > viewportWidth - 10) {
    left = viewportWidth - tooltip.offsetWidth - 10;
  }
  
  // Make sure it doesn't go off the left edge
  if (left < 10) {
    left = 10;
  }
  
  // Set the position
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}

// Altyazı kelimeleri interaktif yap
function makeSubtitleWordsInteractive(element) {
  if (!element) return;
  
  // Clear existing content
  const text = element.textContent;
  element.innerHTML = '';
  
  // Split into words
  const words = text.split(/\s+/).filter(w => w.length > 0);
  
  // Process each word
  words.forEach(word => {
    // Clean word (remove punctuation)
    const cleanWord = word.replace(/[.,!?;:'"()]/g, '');
    
    // Skip empty words
    if (cleanWord.length === 0) {
      const textNode = document.createTextNode(word + ' ');
      element.appendChild(textNode);
      return;
    }
    
    // Create span for the word
    const span = document.createElement('span');
    span.className = 'll-word ll-translatable';
    span.textContent = word + ' ';
    
    // Add hover translation event
    span.addEventListener('mouseenter', async () => {
      try {
        const response = await translate(cleanWord, settings.originalLanguage, settings.translationLanguage);
        if (response.success) {
          showWordTranslation(span, response.translation);
        } else {
          showWordTranslation(span, response.error || 'Çeviri hatası', true);
        }
      } catch (error) {
        console.error('Error translating word:', error);
        showWordTranslation(span, 'Çeviri hatası', true);
      }
    });
    
    // Add mouse leave event to hide translation
    span.addEventListener('mouseleave', () => {
      setTimeout(hideWordTranslation, 200);
    });
    
    // Add span to element
    element.appendChild(span);
  });
}

// Get video element
function getVideoElement() {
  if (isNetflix) {
    return document.querySelector('video');
  } else if (isYouTube) {
    return document.querySelector('.html5-main-video');
  }
  return null;
}

// Set playback speed
function setPlaybackSpeed(speed) {
  const video = getVideoElement();
  if (video) {
    video.playbackRate = speed;
  }
}

// Seek video by offset seconds
function seekVideo(offset) {
  const video = getVideoElement();
  if (video) {
    video.currentTime += offset;
  }
}

// Toggle play/pause
function togglePlayPause() {
  const video = getVideoElement();
  if (video) {
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }
}

// Repeat current subtitle
function repeatCurrentSubtitle() {
  const video = getVideoElement();
  if (video) {
    // Pause video
    video.pause();
    
    // Get current time
    const currentTime = video.currentTime;
    
    // Seek back 3 seconds
    video.currentTime = currentTime - 3;
    
    // Play
    video.play();
  }
}

// Create control panel
function createControlPanel() {
  // Remove existing panel if any
  if (controlPanel) {
    controlPanel.remove();
  }
  
  controlPanel = document.createElement('div');
  controlPanel.className = 'll-control-panel';
  
  // Create panel header with drag handle
  const panelHeader = document.createElement('div');
  panelHeader.className = 'll-panel-header';
  
  const dragHandle = document.createElement('div');
  dragHandle.className = 'll-drag-handle';
  dragHandle.innerHTML = '≡';
  panelHeader.appendChild(dragHandle);
  
  const panelTitle = document.createElement('div');
  panelTitle.className = 'll-panel-title';
  panelTitle.textContent = 'LanguageLearner';
  panelHeader.appendChild(panelTitle);
  
  const closeButton = document.createElement('button');
  closeButton.className = 'll-close-btn';
  closeButton.innerHTML = '×';
  closeButton.addEventListener('click', () => {
    controlPanel.classList.toggle('ll-panel-collapsed');
  });
  panelHeader.appendChild(closeButton);
  
  controlPanel.appendChild(panelHeader);
  
  // Create panel content
  const panelContent = document.createElement('div');
  panelContent.className = 'll-panel-content';
  
  // Control buttons
  const controlButtons = document.createElement('div');
  controlButtons.className = 'll-control-buttons';
  
  // Playback speed buttons
  const speedButtons = document.createElement('div');
  speedButtons.className = 'll-speed-buttons';
  
  [0.5, 0.75, 1, 1.25, 1.5, 2].forEach(speed => {
    const speedButton = document.createElement('button');
    speedButton.className = 'll-speed-button';
    speedButton.textContent = `${speed}x`;
    speedButton.addEventListener('click', () => setPlaybackSpeed(speed));
    speedButtons.appendChild(speedButton);
  });
  
  controlButtons.appendChild(speedButtons);
  
  // Playback control buttons
  const playbackButtons = document.createElement('div');
  playbackButtons.className = 'll-playback-buttons';
  
  const rewindButton = document.createElement('button');
  rewindButton.className = 'll-control-button';
  rewindButton.innerHTML = '⏪';
  rewindButton.title = '5 saniye geri';
  rewindButton.addEventListener('click', () => seekVideo(-5));
  playbackButtons.appendChild(rewindButton);
  
  const playPauseButton = document.createElement('button');
  playPauseButton.className = 'll-control-button';
  playPauseButton.innerHTML = '⏯️';
  playPauseButton.title = 'Oynat/Duraklat';
  playPauseButton.addEventListener('click', () => togglePlayPause());
  playbackButtons.appendChild(playPauseButton);
  
  const forwardButton = document.createElement('button');
  forwardButton.className = 'll-control-button';
  forwardButton.innerHTML = '⏩';
  forwardButton.title = '5 saniye ileri';
  forwardButton.addEventListener('click', () => seekVideo(5));
  playbackButtons.appendChild(forwardButton);
  
  controlButtons.appendChild(playbackButtons);
  
  // Repeat section controls
  const repeatControls = document.createElement('div');
  repeatControls.className = 'll-repeat-controls';
  
  const repeatButton = document.createElement('button');
  repeatButton.className = 'll-control-button';
  repeatButton.innerHTML = '🔁';
  repeatButton.title = 'Şu anki altyazıyı tekrarla';
  repeatButton.addEventListener('click', () => repeatCurrentSubtitle());
  repeatControls.appendChild(repeatButton);
  
  controlButtons.appendChild(repeatControls);
  
  panelContent.appendChild(controlButtons);
  
  // Extension controls
  const extensionControls = document.createElement('div');
  extensionControls.className = 'll-extension-controls';
  
  const toggleExtensionButton = document.createElement('button');
  toggleExtensionButton.className = 'll-extension-button';
  toggleExtensionButton.textContent = settings.extensionEnabled ? 'Çeviriyi Kapat' : 'Çeviriyi Aç';
  toggleExtensionButton.addEventListener('click', () => {
    settings.extensionEnabled = !settings.extensionEnabled;
    toggleExtensionButton.textContent = settings.extensionEnabled ? 'Çeviriyi Kapat' : 'Çeviriyi Aç';
    
    // Save setting
    saveSetting('extensionEnabled', settings.extensionEnabled);
    
    // Toggle subtitle popup
    if (subtitlePopup) {
      subtitlePopup.style.display = settings.extensionEnabled && settings.autoShowSubtitlePopup ? 'block' : 'none';
    }
    
    // Start or stop subtitle observation
    if (settings.extensionEnabled) {
      startSubtitleObservation();
      showNotification('Çeviri etkinleştirildi');
    } else {
      if (subtitleObserver) {
        subtitleObserver.disconnect();
        subtitleObserver = null;
      }
      showNotification('Çeviri devre dışı bırakıldı');
    }
  });
  extensionControls.appendChild(toggleExtensionButton);
  
  const togglePopupButton = document.createElement('button');
  togglePopupButton.className = 'll-extension-button';
  togglePopupButton.textContent = settings.autoShowSubtitlePopup ? 'Altyazı Penceresini Kapat' : 'Altyazı Penceresini Aç';
  togglePopupButton.addEventListener('click', () => {
    settings.autoShowSubtitlePopup = !settings.autoShowSubtitlePopup;
    togglePopupButton.textContent = settings.autoShowSubtitlePopup ? 'Altyazı Penceresini Kapat' : 'Altyazı Penceresini Aç';
    
    // Save setting
    saveSetting('autoShowSubtitlePopup', settings.autoShowSubtitlePopup);
    
    // Toggle subtitle popup
    if (subtitlePopup) {
      subtitlePopup.style.display = settings.extensionEnabled && settings.autoShowSubtitlePopup ? 'block' : 'none';
    }
    
    showNotification(settings.autoShowSubtitlePopup ? 'Altyazı penceresi açıldı' : 'Altyazı penceresi kapatıldı');
  });
  extensionControls.appendChild(togglePopupButton);
  
  // Ses tanıma toggle butonu
  const toggleSpeechButton = document.createElement('button');
  toggleSpeechButton.className = 'll-extension-button';
  toggleSpeechButton.textContent = settings.useSpeechRecognition ? 'Ses Tanımayı Kapat' : 'Ses Tanımayı Aç';
  toggleSpeechButton.addEventListener('click', () => {
    settings.useSpeechRecognition = !settings.useSpeechRecognition;
    toggleSpeechButton.textContent = settings.useSpeechRecognition ? 'Ses Tanımayı Kapat' : 'Ses Tanımayı Aç';
    
    // Save setting
    saveSetting('useSpeechRecognition', settings.useSpeechRecognition);
    
    // Toggle speech recognition
    if (settings.useSpeechRecognition && settings.extensionEnabled) {
      startSpeechRecognition();
      showNotification('Ses tanıma etkinleştirildi');
    } else {
      stopSpeechRecognition();
      showNotification('Ses tanıma devre dışı bırakıldı');
    }
  });
  extensionControls.appendChild(toggleSpeechButton);
  
  panelContent.appendChild(extensionControls);
  
  // Recent words section
  const recentWordsSection = document.createElement('div');
  recentWordsSection.className = 'll-recent-words';
  
  const recentWordsTitle = document.createElement('h3');
  recentWordsTitle.textContent = 'Son Kaydedilen';
  recentWordsSection.appendChild(recentWordsTitle);
  
  const recentWordsList = document.createElement('div');
  recentWordsList.className = 'll-recent-words-list';
  recentWordsList.innerHTML = '<div class="ll-loading">Yükleniyor...</div>';
  recentWordsSection.appendChild(recentWordsList);
  
  panelContent.appendChild(recentWordsSection);
  
  controlPanel.appendChild(panelContent);
  
  // Make panel draggable
  makeDraggable(controlPanel, dragHandle);
  
  // Add panel to body
  document.body.appendChild(controlPanel);
  
  // Update recent words
  updateRecentWords();
}

// Make an element draggable
function makeDraggable(element, handle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  if (handle) {
    // If a handle is specified, make only the handle trigger movement
    handle.style.cursor = 'move';
    handle.onmousedown = dragMouseDown;
  } else {
    // Otherwise, the whole element is the handle
    element.onmousedown = dragMouseDown;
  }
  
  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    
    // Get the initial mouse cursor position
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // Attach event listeners
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
    
    // Add active class for visual feedback
    if (element.classList) {
      element.classList.add('ll-dragging');
    }
  }
  
  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    
    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // Set the element's new position
    const newTop = element.offsetTop - pos2;
    const newLeft = element.offsetLeft - pos1;
    
    // Make sure it stays within the viewport
    const maxX = window.innerWidth - element.offsetWidth;
    const maxY = window.innerHeight - element.offsetHeight;
    
    element.style.top = Math.max(0, Math.min(newTop, maxY)) + "px";
    element.style.left = Math.max(0, Math.min(newLeft, maxX)) + "px";
    
    // When manually positioned, remove any centering transforms
    element.style.transform = 'none';
    element.style.bottom = 'auto';
    
    // Save the position when moved
    if (element.classList.contains('ll-subtitle-popup')) {
      saveSubtitlePosition(element);
    }
  }
  
  function closeDragElement() {
    // Stop moving when mouse button is released
    document.onmouseup = null;
    document.onmousemove = null;
    
    // Remove active class
    if (element.classList) {
      element.classList.remove('ll-dragging');
    }
    
    // Final save of position
    if (element.classList.contains('ll-subtitle-popup')) {
      saveSubtitlePosition(element);
    }
  }
  
  // Helper function to save subtitle position
  function saveSubtitlePosition(element) {
    const rect = element.getBoundingClientRect();
    chrome.storage.local.set({
      subtitlePopupPosition: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }
    });
  }
}

// Show notification in the UI
function showNotification(message, isError = false) {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll('.ll-notification');
  existingNotifications.forEach(n => n.remove());
  
  // Create notification
  const notification = document.createElement('div');
  notification.className = isError ? 'll-notification ll-notification-error' : 'll-notification';
  notification.textContent = message;
  
  // Add to DOM
  document.body.appendChild(notification);
  
  // Log to console
  console.log(`Notification: ${message} ${isError ? '(Error)' : ''}`);
  
  // Remove after delay
  setTimeout(() => {
    notification.classList.add('ll-notification-hide');
    setTimeout(() => notification.remove(), 500);
  }, 3000);
}

// Start speech recognition
function startSpeechRecognition() {
  try {
    // Check if SpeechRecognition API is available
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      console.error('Speech Recognition API is not supported in this browser');
      showNotification('Ses tanıma özelliği bu tarayıcıda desteklenmiyor', true);
      return;
    }
    
    // If already recognizing, don't start again
    if (isRecognizing) {
      console.log('Speech recognition is already active');
      return;
    }
    
    console.log('Starting speech recognition');
    
    // Get video element
    const videoElement = getVideoElement();
    if (!videoElement) {
      console.log('Video element not found, trying again in 2 seconds');
      setTimeout(startSpeechRecognition, 2000);
      return;
    }
    
    // Don't start if video is paused and auto-start is disabled
    if (videoElement.paused && !settings.autoStartSpeechRecognition) {
      console.log('Video is paused and auto-start is disabled, not starting speech recognition');
      return;
    }
    
    // Create speech recognition object
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    // Configure recognition
    recognition.lang = settings.originalLanguage || 'en-US';
    recognition.continuous = true; // Continuously listen
    recognition.interimResults = true; // Get interim results
    recognition.maxAlternatives = 3;
    
    // Recognition results event
    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      let highestConfidence = 0;
      
      // Process results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        // Get the result with highest confidence
        const confidence = event.results[i][0].confidence;
        
        if (confidence > highestConfidence) {
          highestConfidence = confidence;
        }
        
        // Use only results with confidence above threshold
        if (confidence < (settings.speechRecognitionConfidence || 0.6)) {
          continue;
        }
        
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      // If we have a result
      if (finalTranscript || interimTranscript) {
        const recognizedText = finalTranscript || interimTranscript;
        console.log(`Speech recognized (confidence: ${highestConfidence.toFixed(2)}): "${recognizedText}"`);
        
        // Update the UI with the recognized text
        updateSubtitleFromSpeech(recognizedText, !!finalTranscript);
        
        // Store the result for context
        if (finalTranscript) {
          // Add to recognition results array (keep the last 10)
          recognitionResults.unshift({
            text: finalTranscript,
            timestamp: new Date().toISOString()
          });
          
          if (recognitionResults.length > 10) {
            recognitionResults.pop();
          }
        }
      }
    };
    
    // Handle errors
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      
      if (event.error === 'network') {
        showNotification('Ses tanıma için ağ hatası oluştu. Yeniden başlatılıyor...', true);
        // Try to restart after network error
        setTimeout(startSpeechRecognition, 5000);
      } else if (event.error === 'not-allowed') {
        showNotification('Ses tanıma için mikrofon izni gerekiyor', true);
        // Don't auto-restart if permission denied
        settings.autoStartSpeechRecognition = false;
        saveSetting('autoStartSpeechRecognition', false);
      } else if (event.error === 'aborted') {
        // Just log aborted events, no need to notify user
        console.log('Speech recognition aborted');
      } else {
        showNotification(`Ses tanıma hatası: ${event.error}`, true);
      }
      
      isRecognizing = false;
    };
    
    // Handle recognition end
    recognition.onend = () => {
      console.log('Speech recognition ended');
      isRecognizing = false;
      
      // Update UI
      const speechToggle = document.querySelector('.ll-speech-toggle');
      if (speechToggle) {
        speechToggle.innerHTML = '🎤 ❌';
        speechToggle.title = 'Ses tanımayı aç';
      }
      
      // Auto-restart if enabled and not manually stopped
      if (settings.useSpeechRecognition && settings.autoStartSpeechRecognition) {
        // Get video element to check if it's playing
        const videoElement = getVideoElement();
        if (videoElement && !videoElement.paused) {
          console.log('Automatically restarting speech recognition after end');
          recognitionRestartTimeout = setTimeout(startSpeechRecognition, 1000);
        }
      }
    };
    
    // Start recognition
    recognition.start();
    isRecognizing = true;
    
    // Update UI
    const speechToggle = document.querySelector('.ll-speech-toggle');
    if (speechToggle) {
      speechToggle.innerHTML = '🎤';
      speechToggle.title = 'Ses tanımayı kapat';
    }
    
    // Show message
    if (subtitlePopup && subtitlePopup.style.display !== 'none') {
      const originalSubtitle = subtitlePopup.querySelector('.ll-original-subtitle');
      if (originalSubtitle) {
        originalSubtitle.textContent = 'Ses tanıma aktif... konuşma bekleniyor';
      }
    }
    
    console.log('Speech recognition started successfully');
    return true;
  } catch (error) {
    console.error('Error starting speech recognition:', error);
    showNotification('Ses tanıma başlatılırken hata oluştu', true);
    isRecognizing = false;
    return false;
  }
}

// Update subtitle source indicator
function updateSubtitleSource() {
  if (!subtitlePopup) return;
  
  const sourceDiv = subtitlePopup.querySelector('.ll-subtitle-source');
  if (sourceDiv) {
    sourceDiv.textContent = videoHasCaptions ? 
      'Altyazı Kaynağı: Video Altyazısı' : 
      'Altyazı Kaynağı: Ses Tanıma (🎤)';
    
    // Color coding
    sourceDiv.style.color = videoHasCaptions ? '#10b981' : '#f59e0b';
  }
}

// Update subtitle from speech recognition
function updateSubtitleFromSpeech(text, isFinal) {
  try {
    // If there's no subtitle popup, nothing to update
    if (!subtitlePopup || subtitlePopup.style.display === 'none') {
      // If popup is enabled, make it visible
      if (settings.autoShowSubtitlePopup && settings.extensionEnabled) {
        subtitlePopup.style.display = 'block';
      } else {
        return; // Not showing popup
      }
    }
    
    // Find the original and translated subtitle elements
    const originalSubtitle = subtitlePopup.querySelector('.ll-original-subtitle');
    const translatedSubtitle = subtitlePopup.querySelector('.ll-translated-subtitle');
    
    if (!originalSubtitle || !translatedSubtitle) {
      console.error('Subtitle elements not found in popup');
      return;
    }
    
    // Update source indicator
    const sourceDiv = subtitlePopup.querySelector('.ll-subtitle-source');
    if (sourceDiv) {
      sourceDiv.textContent = 'Speech Recognition';
    }
    
    // Update the original subtitle with recognized text
    if (isFinal) {
      // This is a final result, update the subtitle
      originalSubtitle.textContent = text;
      
      // Make words interactive after a short delay
      setTimeout(() => {
        makeSubtitleWordsInteractive(originalSubtitle);
      }, 100);
      
      // Translate the text
      translate(text, settings.originalLanguage, settings.translationLanguage)
        .then(response => {
          if (response.success) {
            translatedSubtitle.textContent = response.translation;
          } else {
            translatedSubtitle.textContent = 'Çeviri hatası: ' + (response.error || 'Bilinmeyen hata');
          }
        })
        .catch(error => {
          console.error('Error translating subtitle:', error);
          translatedSubtitle.textContent = 'Çeviri hatası';
        });
    } else {
      // This is an interim result, update with an indicator
      originalSubtitle.textContent = text + ' ...';
      translatedSubtitle.textContent = 'Çeviri bekleniyor...';
    }
  } catch (error) {
    console.error('Error updating subtitle from speech:', error);
  }
}

// Attach event listeners to video elements
function attachVideoEventListeners() {
  // Need to do this continuously as videos may be loaded dynamically
  setInterval(() => {
    const videoElement = getVideoElement();
    if (videoElement && !videoElement.dataset.llListenersAttached) {
      console.log('Video element found, attaching event listeners');
      
      // Mark this video as having listeners attached
      videoElement.dataset.llListenersAttached = 'true';
      
      // When video starts playing, start speech recognition
      videoElement.addEventListener('play', () => {
        console.log('Video started playing');
        if (settings.extensionEnabled && settings.useSpeechRecognition) {
          startSpeechRecognition();
        }
      });
      
      // When video pauses, stop speech recognition
      videoElement.addEventListener('pause', () => {
        console.log('Video paused');
        if (isRecognizing) {
          stopSpeechRecognition();
        }
      });
      
      // When video ends, stop speech recognition
      videoElement.addEventListener('ended', () => {
        console.log('Video ended');
        if (isRecognizing) {
          stopSpeechRecognition();
        }
      });
    }
  }, 1000);
}

// Stop speech recognition
function stopSpeechRecognition() {
  try {
    if (recognition && isRecognizing) {
      recognition.stop();
      isRecognizing = false;
      console.log('Speech recognition stopped');
      
      // Clear any pending timeouts
      if (recognitionRestartTimeout) {
        clearTimeout(recognitionRestartTimeout);
        recognitionRestartTimeout = null;
      }
      
      // Update UI if needed
      const speechToggle = document.querySelector('.ll-speech-toggle');
      if (speechToggle) {
        speechToggle.innerHTML = '🎤 ❌';
        speechToggle.title = 'Ses tanımayı aç';
      }
    }
  } catch (error) {
    console.error('Error stopping speech recognition:', error);
  }
}

// Setup transcript page event listeners
function setupTranscriptListeners() {
  const recognition = setupSpeechRecognition();
  if (!recognition) return;
  
  const transcriptElement = document.getElementById('ll-transcript-text');
  const toggleButton = document.getElementById('ll-toggle-recognition');
  const clearButton = document.getElementById('ll-clear-transcript');
  const closeButton = document.getElementById('ll-close-transcript');
  
  let isRecognizing = false;
  
  recognition.onresult = (event) => {
    handleSpeechResult(event, transcriptElement);
  };
  
  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    showNotification('Konuşma tanıma hatası: ' + event.error, true);
  };
  
  toggleButton.addEventListener('click', () => {
    if (isRecognizing) {
      recognition.stop();
      isRecognizing = false;
      toggleButton.textContent = 'Konuşma Tanıma: Kapalı';
    } else {
      recognition.start();
      isRecognizing = true;
      toggleButton.textContent = 'Konuşma Tanıma: Açık';
    }
  });
  
  clearButton.addEventListener('click', () => {
    transcriptElement.innerHTML = '';
    updateSavedWordsList();
  });
  
  closeButton.addEventListener('click', () => {
    if (isRecognizing) {
      recognition.stop();
    }
    document.querySelector('.ll-transcript-page').remove();
  });
  
  // Start recognition automatically
  recognition.start();
  isRecognizing = true;
}

// Add button to video player
function addTranscriptButton() {
  const button = document.createElement('button');
  button.className = 'll-transcript-button';
  button.textContent = 'Konuşma Tanıma';
  button.addEventListener('click', () => {
    createTranscriptPage();
  });
  
  // Add to video controls
  const videoControls = document.querySelector('.ytp-right-controls') || 
                       document.querySelector('.video-controls');
  if (videoControls) {
    videoControls.appendChild(button);
  } else {
    // Fallback: add to body
    document.body.appendChild(button);
  }
}

// Initialize when page loads
window.addEventListener('load', () => {
  addTranscriptButton();
});

// Run initialization when content script is loaded
initialize();

// CSS stillerini ekle
function appendStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    #ll-activation-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      cursor: pointer;
      z-index: 999999;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
    }
    
    .ll-btn-enabled {
      background-color: #3b82f6;
      color: white;
    }
    
    .ll-btn-disabled {
      background-color: #e5e7eb;
      color: #374151;
    }
    
    #ll-activation-btn:hover {
      transform: scale(1.1);
    }
    
    .ll-subtitle-popup {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      width: 60%;
      min-width: 300px;
      max-width: 800px;
      background-color: rgba(15, 23, 42, 0.85);
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 999998;
      backdrop-filter: blur(5px);
      display: none;
    }
    
    .ll-subtitle-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      color: white;
    }
    
    .ll-subtitle-content {
      color: white;
      font-size: 18px;
      line-height: 1.5;
    }
    
    .ll-word {
      display: inline-block;
      padding: 0 1px;
      border-radius: 3px;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    
    .ll-word:hover {
      background-color: rgba(59, 130, 246, 0.4);
    }
    
    .ll-word-hover {
      background-color: rgba(59, 130, 246, 0.4);
    }
    
    .ll-tooltip {
      position: fixed;
      width: 200px;
      max-width: 300px;
      background-color: white;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
      z-index: 1000000;
      display: none;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    
    .ll-tooltip.visible {
      display: block;
      opacity: 1;
      animation: tooltipFadeIn 0.2s ease;
    }
    
    @keyframes tooltipFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    .ll-tooltip::before {
      content: '';
      position: absolute;
      top: -8px;
      left: 50%;
      transform: translateX(-50%);
      border-width: 0 8px 8px 8px;
      border-style: solid;
      border-color: transparent transparent white transparent;
    }
    
    .ll-tooltip-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .ll-tooltip-original {
      font-weight: bold;
      color: #1f2937;
    }
    
    .ll-tooltip-translation {
      color: #4b5563;
    }
    
    .ll-tooltip-translation.error {
      color: #ef4444;
    }
    
    .ll-tooltip-actions {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }
    
    .ll-tooltip-actions button {
      flex: 1;
      background-color: #f3f4f6;
      border: none;
      border-radius: 4px;
      padding: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    
    .ll-tooltip-actions button:hover {
      background-color: #e5e7eb;
    }
    
    .ll-tooltip-save {
      color: #2563eb;
    }
    
    .ll-tooltip-speak {
      color: #4b5563;
    }
    
    /* Notification */
    .ll-notification {
      position: fixed;
      bottom: 80px;
      right: 20px;
      background-color: #3b82f6;
      color: white;
      padding: 10px 16px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      z-index: 1000000;
      animation: notificationFadeIn 0.3s ease;
    }
    
    .ll-notification-error {
      background-color: #ef4444;
    }
    
    .ll-notification-hide {
      animation: notificationFadeOut 0.3s ease forwards;
    }
    
    @keyframes notificationFadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes notificationFadeOut {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(20px); }
    }
  `;
  
  document.head.appendChild(styleElement);
}

// Başlatma: Stiller ekle
appendStyles();

// Başlatma: Sayfayı başlat
initialize();

function updateSubtitlePopup(originalText, translatedText) {
  if (!subtitlePopup) return;
  
  // Find the original and translated subtitle elements
  const originalSubtitle = subtitlePopup.querySelector('.ll-original-subtitle');
  const translatedSubtitle = subtitlePopup.querySelector('.ll-translated-subtitle');
  
  if (!originalSubtitle || !translatedSubtitle) return;
  
  // Update the content
  originalSubtitle.textContent = originalText || 'Altyazı bekleniyor...';
  translatedSubtitle.textContent = translatedText || 'Çeviri bekleniyor...';
  
  // Make the words in the original subtitle interactive
  if (originalText) {
    // First remove any existing interactive words
    originalSubtitle.innerHTML = '';
    
    // Split the text into words and create spans for each
    const words = originalText.split(/\s+/);
    words.forEach((word, index) => {
      const cleanWord = word.replace(/[.,!?;:'"()]/g, '');
      const span = document.createElement('span');
      
      // If it's a real word (not just punctuation), make it interactive
      if (cleanWord.length > 0) {
        span.className = 'll-word ll-translatable';
        span.textContent = word + (index < words.length - 1 ? ' ' : '');
        
        // Add event listener for translation
        span.addEventListener('mouseenter', async (event) => {
          const response = await translate(cleanWord, settings.originalLanguage, settings.translationLanguage);
          if (response.success) {
            showWordTranslation(span, response.translation);
          } else {
            showWordTranslation(span, 'Çeviri hatası: ' + (response.error || 'Bilinmeyen hata'), true);
          }
        });
        
        span.addEventListener('mouseleave', () => {
          setTimeout(() => {
            if (!isMouseOverTooltip(document.querySelector('.ll-tooltip'))) {
              hideWordTranslation();
            }
          }, 200);
        });
        
        // Add click event to save the word
        span.addEventListener('click', async () => {
          const response = await translate(cleanWord, settings.originalLanguage, settings.translationLanguage);
          if (response.success) {
            // Save this word
            saveWord(cleanWord, response.translation, {
              text: originalText,
              source: isNetflix ? 'Netflix' : isYouTube ? 'YouTube' : 'Video'
            });
          } else {
            showNotification('Kelime kaydedilemedi: Çeviri hatası', true);
          }
        });
      } else {
        // Just punctuation, no need for interactivity
        span.textContent = word + (index < words.length - 1 ? ' ' : '');
      }
      
      originalSubtitle.appendChild(span);
    });
  }
  
  // Make subtitle popup visible if not already
  if (subtitlePopup.style.display === 'none' && settings.autoShowSubtitlePopup && settings.extensionEnabled) {
    subtitlePopup.style.display = 'block';
  }
} 