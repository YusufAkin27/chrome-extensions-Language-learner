/**
 * LanguageLearner Extension - Background script
 * Handles events and communication between content scripts and popup
 */

// Initialize default settings on installation
chrome.runtime.onInstalled.addListener(async () => {
  if (details.reason === 'install') {
    // Set default settings
    const defaultSettings = {
      originalLanguage: 'en',
      translationLanguage: 'tr',
      autoTranslate: true,
      autoSpeak: false,
      autoPauseAtSubtitleEnd: true,
      useLocalDictionary: false,
      showControlPanel: true,
      wordProgressDays: '7',
      apiCallCount: 0,
      apiCallLimit: 5000,
      apiCallResetDate: new Date().toISOString(),
      extensionEnabled: true,
      autoShowSubtitlePopup: true,
      useSpeechRecognition: true,
      speechRecognitionConfidence: 0.6,
      autoStartSpeechRecognition: false, // Otomatik değil, manuel başlatma
      apiKey: '',
      savedWords: {}
    };
    
    await chrome.storage.local.set({ settings: defaultSettings });
    
    // Sözlük ve kaydedilen kelimeler için boş nesneler oluştur
    await chrome.storage.local.set({ dictionary: {} });
    await chrome.storage.local.set({ savedWords: {} });
    await chrome.storage.local.set({ apiUsage: { used: 0, limit: 5000 } });
  }
});

// Listen for tab updates to inject content script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if the tab is fully loaded and is Netflix or YouTube
  if (
    changeInfo.status === 'complete' && 
    tab.url && 
    (tab.url.includes('netflix.com/watch') || tab.url.includes('youtube.com/watch'))
  ) {
    // Send message to content script to initialize
    chrome.tabs.sendMessage(tabId, {
      action: 'initialize',
      url: tab.url
    }, response => {
      // Extension content script may not be ready yet, that's ok
      if (chrome.runtime.lastError) {
        console.log('Content script not ready yet');
      }
    });
  }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'openWordsPage':
      // Open words.html in a new tab
      chrome.tabs.create({ url: chrome.runtime.getURL('words.html') });
      sendResponse({ success: true });
      break;
    
    case 'getSettings':
      // Get settings from storage
      chrome.storage.local.get('settings', ({ settings }) => {
        sendResponse({ settings: settings || {} });
      });
      return true; // Indicates async response
      
    case 'saveSettings':
      // Save settings to storage
      chrome.storage.local.get('settings', data => {
        const currentSettings = data.settings || {};
        const newSettings = { ...currentSettings, ...message.settings };
        
        chrome.storage.local.set({ settings: newSettings }, () => {
          // Notify all tabs about settings update
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, {
                action: 'settingsUpdated',
                settings: newSettings
              }).catch(() => {
                // Ignore errors from tabs that don't have the content script
              });
            });
          });
          
          sendResponse({ success: true });
        });
      });
      return true; // Indicates async response
      
    case 'saveWord':
      // Save a word to the saved words list
      saveWord(message.word, message.translation, message.context, message.source, message.sourceUrl, message.timestamp)
        .then(response => {
          sendResponse(response);
        })
        .catch(error => {
          console.error('Error saving word:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Indicates async response
      
    case 'getSavedWords':
      // Get all saved words
      getSavedWords()
        .then(words => {
          sendResponse({ success: true, words: words });
        })
        .catch(error => {
          console.error('Error getting saved words:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Indicates async response
      
    case 'removeWord':
      // Remove a word from the saved words list
      removeWord(message.word, sendResponse);
      return true; // Indicates async response
      
    case 'updateWordStatus':
      // Update a word's learning status
      updateWordStatus(message.word, message.newStatus, sendResponse);
      return true; // Indicates async response
      
    case 'clearAllWords':
      // Clear all saved words
      chrome.storage.local.set({ savedWords: [] }, () => {
        sendResponse({ success: true });
      });
      return true; // Indicates async response
      
    case 'translateWord':
      // Translate a word using online API
      translateText(message.word, message.from, message.to)
        .then(response => {
          sendResponse(response);
        })
        .catch(error => {
          console.error('Translation error:', error);
          sendResponse({ 
            success: false, 
            translation: 'Çeviri hatası', 
            error: error.message 
          });
        });
      return true; // Indicates async response
      
    case 'speakText':
      // Use text-to-speech to speak a word
      chrome.tts.speak(message.text, {
        lang: message.language || 'en',
        rate: 0.9,
        onEvent: function(event) {
          if (event.type === 'error') {
            console.error('TTS Error:', event);
          }
        }
      });
      sendResponse({ success: true });
      return true; // Indicates async response
      
    case 'getApiStatus':
      // Get API status information
      chrome.storage.local.get('settings', data => {
        const settings = data.settings || {};
        sendResponse({
          callCount: settings.apiCallCount || 0,
          dailyLimit: settings.apiCallLimit || 5000,
          resetDate: settings.apiCallResetDate || new Date().toISOString()
        });
      });
      return true; // Indicates async response
      
    case 'checkWordExists':
      // Check if a word exists in the saved words list
      checkWordExists(message.word)
        .then(wordData => {
          sendResponse({ success: true, exists: !!wordData, wordData: wordData });
        })
        .catch(error => {
          console.error('Error checking word existence:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Indicates async response
  }
});

// Save a word to storage
async function saveWord(word, translation, context, source, sourceUrl, timestamp) {
  try {
    // Gerekli alanlar var mı kontrol et
    if (!word || !translation) {
      throw new Error('Word and translation are required');
    }
    
    // Çeviride hata var mı kontrol et
    if (translation.includes('Error:') || 
        translation.includes('MYMEMORY WARNING')) {
      throw new Error('Invalid translation');
    }
    
    // Kaydedilmiş kelimeleri al
    const result = await chrome.storage.local.get('savedWords');
    const savedWords = result.savedWords || {};
    
    // Mevcut kelimeyi güncelle veya yeni ekle
    const now = new Date().toISOString();
    
    // Eğer kelime daha önce kaydedilmişse
    if (savedWords[word]) {
      // Mevcut kelimeyi güncelle
      savedWords[word].translation = translation;
      savedWords[word].reviewCount = (savedWords[word].reviewCount || 0) + 1;
      savedWords[word].lastReviewDate = now;
      savedWords[word].learningProgress = Math.min(100, (savedWords[word].learningProgress || 0) + 10);
      
      // Bu durumda gelecek gözden geçirme tarihini hesapla (spaced repetition)
      const reviewCount = savedWords[word].reviewCount;
      const dayMultiplier = Math.pow(2, reviewCount - 1); // 1, 2, 4, 8, 16... günler
      savedWords[word].nextReviewDate = now + (dayMultiplier * 24 * 60 * 60 * 1000);
      
      // Bağlam (context) ekle
      if (context) {
        const contexts = savedWords[word].contexts || [];
        
        // Tekrarlanan bağlamları önlemek için kontrol et
        const contextExists = contexts.some(ctx => 
          ctx.text === context.text && 
          ctx.source === context.source
        );
        
        if (!contextExists && context.text) {
          contexts.unshift(context);
          
          // En fazla 5 bağlam sakla
          if (contexts.length > 5) {
            contexts.pop(); // En eski bağlamı kaldır
          }
          
          savedWords[word].contexts = contexts;
        }
      }
      
      // Yeni bir kaynak ekle
      if (source && sourceUrl) {
        const sources = savedWords[word].sources || [];
        
        // Aynı kaynağı tekrar ekleme
        const sourceExists = sources.some(s => s.url === sourceUrl);
        if (!sourceExists) {
          const newSource = { name: source, url: sourceUrl, timestamp: timestamp || now };
          sources.unshift(newSource);
          
          // Maximum 5 kaynak sakla
          if (sources.length > 5) {
            sources.pop();
          }
          
          savedWords[word].sources = sources;
        }
      }
      
      // Güncellenmiş kelimeleri kaydet
      savedWords[word].updated = true;
    } else {
      // Yeni kelime oluştur
      savedWords[word] = {
        word: word,
        translation: translation,
        learningProgress: 10, // Başlangıç değeri %10
        dateAdded: now,
        lastReviewDate: now,
        nextReviewDate: now + (24 * 60 * 60 * 1000), // 1 gün sonra tekrar gözden geçir
        reviewCount: 1,
        contexts: context ? [context] : [],
        sources: source ? [{ name: source, url: sourceUrl, timestamp: timestamp || now }] : [],
        isNew: true
      };
    }
    
    // Güncellenmiş kelimeleri kaydet
    await chrome.storage.local.set({ savedWords });
    
    return { success: true, wordData: savedWords[word] };
  } catch (error) {
    console.error('Error saving word:', error);
    return { success: false, error: error.message };
  }
}

// Remove a word from storage
function removeWord(word, callback) {
  chrome.storage.local.get('savedWords', ({ savedWords = [] }) => {
    // Filter out the word to remove
    const updatedWords = savedWords.filter(item => 
      item.word.toLowerCase() !== word.toLowerCase()
    );
    
    // Save updated list to storage
    chrome.storage.local.set({ savedWords: updatedWords }, () => {
      callback({ success: true });
    });
  });
}

// Update a word's learning status
function updateWordStatus(word, newStatus, callback) {
  chrome.storage.local.get('savedWords', ({ savedWords = [] }) => {
    // Find the word to update
    const wordIndex = savedWords.findIndex(item => 
      item.word.toLowerCase() === word.word.toLowerCase()
    );
    
    if (wordIndex !== -1) {
      // Update status
      savedWords[wordIndex].status = newStatus;
      savedWords[wordIndex].lastViewed = new Date().toISOString();
      savedWords[wordIndex].viewCount = (savedWords[wordIndex].viewCount || 0) + 1;
      
      // Save updated list to storage
      chrome.storage.local.set({ savedWords }, () => {
        callback({ success: true });
      });
    } else {
      callback({ success: false, error: 'Word not found' });
    }
  });
}

// Translate a word using API
async function translateText(word, fromLang, toLang) {
  try {
    // Kelime çok kısaysa direkt dön
    if (word.length < 2) {
      return { success: true, translation: word };
    }
    
    // Check if we need to reset the API call count
    chrome.storage.local.get('settings', data => {
      const settings = data.settings || {};
      const now = new Date();
      const resetDate = new Date(settings.apiCallResetDate || now);
      const apiCallCount = settings.apiCallCount || 0;
      const apiCallLimit = settings.apiCallLimit || 5000;
      
      // Reset count if it's a new day
      if (now.toDateString() !== resetDate.toDateString()) {
        settings.apiCallCount = 0;
        settings.apiCallResetDate = now.toISOString();
        chrome.storage.local.set({ settings });
      }
      
      // Check if we've reached the daily limit
      if (apiCallCount >= apiCallLimit) {
        return { 
          success: false,
          translation: 'API günlük çeviri limitine ulaşıldı', 
          error: 'Daily limit reached' 
        };
      }
    });
    
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${fromLang}|${toLang}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Translation API request failed');
    }
    
    const data = await response.json();
    
    if (data.responseStatus !== 200) {
      throw new Error(data.responseDetails || 'Translation failed');
    }
    
    let translation = 'Çeviri bulunamadı';
    let success = false;
    
    if (data.responseData) {
      translation = data.responseData.translatedText;
      success = true;
      
      // Update API call count
      chrome.storage.local.get('settings', data => {
        const settings = data.settings || {};
        settings.apiCallCount = (settings.apiCallCount || 0) + 1;
        chrome.storage.local.set({ settings });
      });
    }
    
    return { success, translation };
  } catch (error) {
    console.error('Translation error:', error);
    return { 
      success: false, 
      translation: 'Çeviri hatası', 
      error: error.message 
    };
  }
}

// API Kullanım sayacını güncelle
async function updateAPIUsage() {
  try {
    const result = await chrome.storage.local.get('apiUsage');
    const apiUsage = result.apiUsage || { used: 0, limit: 5000 };
    
    apiUsage.used += 1;
    
    await chrome.storage.local.set({ apiUsage });
  } catch (error) {
    console.error('Error updating API usage:', error);
  }
}

// Eklenti ikonuna tıklandığında (sadece Manifest V2 için)
chrome.browserAction.onClicked.addListener(async (tab) => {
  try {
    // Doğrudan kelime sayfasını aç
    chrome.tabs.create({ url: chrome.runtime.getURL('words.html') });
    
    console.log('Kelimeler sayfası açıldı');
  } catch (error) {
    console.error('Eklenti durumu değiştirilirken hata:', error);
  }
});

// Kelime kaydedilmiş mi kontrol et
async function checkWordExists(word) {
  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || defaultSettings;
    const savedWords = settings.savedWords || {};
    
    return savedWords[word] || null;
  } catch (error) {
    console.error('Kelime kontrolü yapılırken hata:', error);
    return null;
  }
}

// Kaydedilen kelimeleri getir
async function getSavedWords() {
  try {
    const result = await chrome.storage.local.get(['savedWords']);
    return result.savedWords || {};
  } catch (error) {
    console.error('Kaydedilen kelimeler alınırken hata:', error);
    return {};
  }
} 