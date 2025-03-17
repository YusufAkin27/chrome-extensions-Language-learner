/**
 * Popup script for LanguageLearner Extension
 * Handles the popup UI functionality, saved words management, and settings
 */

// DOM Elements
const elements = {
  tabButtons: document.querySelectorAll('.tab-button'),
  tabContents: document.querySelectorAll('.tab-content'),
  wordList: document.getElementById('wordList'),
  emptyState: document.getElementById('emptyState'),
  exportDropdown: document.getElementById('exportDropdown'),
  exportOptions: document.querySelector('.export-options'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  wordSearch: document.getElementById('wordSearch'),
  statusFilters: document.querySelectorAll('.filter-button'),
  clearAllBtn: document.getElementById('clearAllBtn'),
  autosortBtn: document.getElementById('autosortBtn'),
  originalLanguage: document.getElementById('originalLanguage'),
  translationLanguage: document.getElementById('translationLanguage'),
  autoTranslate: document.getElementById('autoTranslate'),
  autoSpeak: document.getElementById('autoSpeak'),
  autoPauseAtSubtitleEnd: document.getElementById('autoPauseAtSubtitleEnd'),
  showControlPanel: document.getElementById('showControlPanel'),
  showSubtitlePopup: document.getElementById('show-subtitle-popup'),
  useSpeechRecognition: document.getElementById('use-speech-recognition'),
  wordProgressDays: document.getElementById('wordProgressDays'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  resetSettingsBtn: document.getElementById('resetSettingsBtn'),
  apiStatusIcon: document.getElementById('apiStatusIcon'),
  apiStatusText: document.getElementById('apiStatusText'),
  
  // Stats elements
  newProgress: document.getElementById('newProgress'),
  learningProgress: document.getElementById('learningProgress'),
  learnedProgress: document.getElementById('learnedProgress'),
  totalWordsCard: document.getElementById('totalWordsCard'),
  newWordsCard: document.getElementById('newWordsCard'),
  learningWordsCard: document.getElementById('learningWordsCard'),
  learnedWordsCard: document.getElementById('learnedWordsCard'),
  difficultWordsCard: document.getElementById('difficultWordsCard'),
  addedThisWeek: document.getElementById('addedThisWeek'),
  learnedThisMonth: document.getElementById('learnedThisMonth'),
  lastActivity: document.getElementById('lastActivity'),
};

// State
let savedWords = [];
let settings = {};
let filteredWords = [];
let currentFilter = 'all';
let currentSort = 'recently-viewed';
let searchQuery = '';
let translationCache = {};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Setup tab navigation
  setupTabs();
  
  // Load settings
  await loadSettings();
  
  // Load saved words
  await loadSavedWords();
  
  // Load translation cache
  await loadTranslationCache();
  
  // Setup event listeners
  setupEventListeners();

  // Initial filtering and rendering
  filterAndRenderWords();
  
  // Setup stats if we're on that tab
  if (document.querySelector('.tab-button[data-tab="stats"]').classList.contains('active')) {
    updateStats();
  }
  
  // Check API status
  checkApiStatus();
});

// Load translation cache
async function loadTranslationCache() {
  try {
    const data = await new Promise(resolve => {
      chrome.storage.local.get('translationCache', (result) => {
        resolve(result.translationCache || {});
      });
    });
    
    translationCache = data;
    console.log(`Loaded ${Object.keys(translationCache).length} cached translations`);
  } catch (error) {
    console.error('Error loading translation cache:', error);
  }
}

// Check API status
function checkApiStatus() {
  if (!elements.apiStatusIcon || !elements.apiStatusText) return;
  
  // Get API call count from background
  chrome.runtime.sendMessage({ action: 'getApiStatus' }, (response) => {
    if (response && response.success) {
      const { callCount, dailyLimit, resetDate } = response;
      const usagePercent = Math.round((callCount / dailyLimit) * 100);
      
      if (callCount < dailyLimit * 0.8) {
        // API is healthy
        elements.apiStatusIcon.textContent = '✓';
        elements.apiStatusIcon.className = 'status-icon active';
        elements.apiStatusText.textContent = `API durumu: İyi (${usagePercent}% kullanıldı)`;
      } else if (callCount < dailyLimit) {
        // API is nearing limit
        elements.apiStatusIcon.textContent = '⚠';
        elements.apiStatusIcon.className = 'status-icon warning';
        elements.apiStatusText.textContent = `API durumu: Sınıra yaklaşıldı (${usagePercent}% kullanıldı)`;
      } else {
        // API limit reached
        elements.apiStatusIcon.textContent = '✗';
        elements.apiStatusIcon.className = 'status-icon error';
        elements.apiStatusText.textContent = 'API durumu: Günlük sınıra ulaşıldı, yedek çeviri kullanılıyor';
      }
    } else {
      // API status not available
      elements.apiStatusIcon.textContent = '?';
      elements.apiStatusIcon.className = 'status-icon';
      elements.apiStatusText.textContent = 'API durumu bilinmiyor';
    }
  });
}

// Setup tab navigation
function setupTabs() {
  elements.tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      
      // Update active tab
      elements.tabButtons.forEach(b => b.classList.remove('active'));
      button.classList.add('active');
      
      // Show corresponding tab content
      elements.tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${tabId}-tab`) {
          content.classList.add('active');
          
          // If we're switching to stats tab, update stats
          if (tabId === 'stats') {
            updateStats();
          }
        }
      });
    });
  });
}

// Load saved words from storage
async function loadSavedWords() {
  try {
    // Get saved words from storage
    const data = await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'getSavedWords' }, resolve);
    });
    
    savedWords = data || [];
    updateLearningStatus();
    filterAndRenderWords();
  } catch (error) {
    console.error('Error loading saved words:', error);
  }
}

// Update learning status for all words
function updateLearningStatus() {
  const now = new Date();
  const progressDays = parseInt(settings.wordProgressDays || 7);
  
  savedWords.forEach(word => {
    if (!word.status) {
      word.status = 'new';
    }
    
    if (!word.viewCount) {
      word.viewCount = 0;
    }
    
    if (!word.lastViewed) {
      word.lastViewed = word.createdAt;
    }
    
    // Check if the word can be marked as learned
    if (word.status === 'learning') {
      const lastViewed = new Date(word.lastViewed);
      const daysSinceLastView = Math.floor((now - lastViewed) / (1000 * 60 * 60 * 24));
      
      if (word.viewCount >= 5 && daysSinceLastView > progressDays) {
        word.status = 'learned';
      }
    }
    
    // If a word was created more than 30 days ago and is still new, mark it as learning
    if (word.status === 'new') {
      const created = new Date(word.createdAt);
      const daysSinceCreation = Math.floor((now - created) / (1000 * 60 * 60 * 24));
      
      if (daysSinceCreation > 30) {
        word.status = 'learning';
      }
    }
  });
  
  // Save updated statuses
  saveWordsToStorage();
}

// Load settings from storage
async function loadSettings() {
  try {
    // Get settings from storage
    const data = await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'getSettings' }, resolve);
    });
    
    settings = data || {};
    
    // Update settings UI
    updateSettingsUI();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Update settings UI with current settings
function updateSettingsUI() {
  if (elements.originalLanguage) {
    elements.originalLanguage.value = settings.originalLanguage || 'en';
  }
  
  if (elements.translationLanguage) {
    elements.translationLanguage.value = settings.translationLanguage || 'tr';
  }
  
  if (elements.autoTranslate) {
    elements.autoTranslate.checked = settings.autoTranslate !== false;
  }
  
  if (elements.autoSpeak) {
    elements.autoSpeak.checked = settings.autoSpeak !== false;
  }
  
  if (elements.autoPauseAtSubtitleEnd) {
    elements.autoPauseAtSubtitleEnd.checked = settings.autoPauseAtSubtitleEnd !== false;
  }
  
  if (elements.showControlPanel) {
    elements.showControlPanel.checked = settings.showControlPanel !== false;
  }
  
  if (elements.showSubtitlePopup) {
    elements.showSubtitlePopup.checked = settings.showSubtitlePopup !== false;
  }
  
  if (elements.useSpeechRecognition) {
    elements.useSpeechRecognition.checked = settings.useSpeechRecognition !== false;
  }
  
  if (elements.wordProgressDays) {
    elements.wordProgressDays.value = settings.wordProgressDays || '7';
  }
}

// Save settings to storage
function saveSettings() {
  const newSettings = {
    originalLanguage: elements.originalLanguage.value,
    translationLanguage: elements.translationLanguage.value,
    autoTranslate: elements.autoTranslate.checked,
    autoSpeak: elements.autoSpeak.checked,
    autoPauseAtSubtitleEnd: elements.autoPauseAtSubtitleEnd.checked,
    useLocalDictionary: false, // Always false since we're using online API
    showControlPanel: elements.showControlPanel.checked,
    wordProgressDays: elements.wordProgressDays.value,
    showSubtitlePopup: elements.showSubtitlePopup ? elements.showSubtitlePopup.checked : true,
    useSpeechRecognition: elements.useSpeechRecognition ? elements.useSpeechRecognition.checked : true,
    extensionEnabled: settings.extensionEnabled !== false,
  };
  
  // Save to storage
  chrome.runtime.sendMessage({ 
    action: 'saveSettings', 
    settings: newSettings 
  }, (response) => {
    if (response && response.success) {
      settings = newSettings;
      
      // Show success message
      const successMessage = document.createElement('div');
      successMessage.className = 'settings-success';
      successMessage.textContent = 'Ayarlar kaydedildi';
      
      const settingsActions = document.querySelector('.settings-actions');
      settingsActions.appendChild(successMessage);
      
      // Remove message after 2 seconds
      setTimeout(() => {
        successMessage.remove();
      }, 2000);
    }
  });
}

// Reset settings to default
function resetSettings() {
  const defaultSettings = {
    originalLanguage: 'en',
    translationLanguage: 'tr',
    autoTranslate: true,
    autoSpeak: true,
    autoPauseAtSubtitleEnd: true,
    useLocalDictionary: false,
    showControlPanel: true,
    wordProgressDays: '7',
    showSubtitlePopup: true,
    useSpeechRecognition: true,
    extensionEnabled: true,
  };
  
  // Save to storage
  chrome.runtime.sendMessage({ 
    action: 'saveSettings', 
    settings: defaultSettings 
  }, (response) => {
    if (response && response.success) {
      settings = defaultSettings;
      updateSettingsUI();
      
      // Show success message
      const successMessage = document.createElement('div');
      successMessage.className = 'settings-success';
      successMessage.textContent = 'Ayarlar sıfırlandı';
      
      const settingsActions = document.querySelector('.settings-actions');
      settingsActions.appendChild(successMessage);
      
      // Remove message after 2 seconds
      setTimeout(() => {
        successMessage.remove();
      }, 2000);
    }
  });
}

// Filter words based on current filter and search
function filterWords() {
  // Start with all words
  filteredWords = [...savedWords];
  
  // Apply search filter if exists
  if (searchQuery) {
    const lowercaseQuery = searchQuery.toLowerCase();
    filteredWords = filteredWords.filter(word => 
      word.word.toLowerCase().includes(lowercaseQuery) || 
      word.translation.toLowerCase().includes(lowercaseQuery)
    );
  }
  
  // Apply status filter
  if (currentFilter !== 'all') {
    filteredWords = filteredWords.filter(word => {
      if (currentFilter === 'difficult') {
        return word.difficulty === 'difficult';
      } else {
        return word.status === currentFilter;
      }
    });
  }
  
  // Apply sort
  sortWords();
}

// Sort words based on current sort option
function sortWords() {
  switch (currentSort) {
    case 'alphabetical':
      filteredWords.sort((a, b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()));
      break;
    case 'recently-added':
      filteredWords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      break;
    case 'recently-viewed':
      filteredWords.sort((a, b) => new Date(b.lastViewed || b.createdAt) - new Date(a.lastViewed || a.createdAt));
      break;
    case 'least-viewed':
      filteredWords.sort((a, b) => (a.viewCount || 0) - (b.viewCount || 0));
      break;
    case 'most-viewed':
      filteredWords.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
      break;
  }
}

// Filter and render the word list
function filterAndRenderWords() {
  filterWords();
  renderWordList();
}

// Render word list in the UI
function renderWordList() {
  // Clear existing list
  if (!elements.wordList) return;
  elements.wordList.innerHTML = '';
  
  // Show empty state if no words
  if (filteredWords.length === 0) {
    if (currentFilter !== 'all' || searchQuery) {
      // Custom empty message for filtered results
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-state';
      emptyMessage.innerHTML = `
        <div class="empty-icon">🔍</div>
        <h3>Sonuç bulunamadı</h3>
        <p>Aramanızla eşleşen kelime bulunamadı. Lütfen farklı bir arama terimi veya filtre deneyin.</p>
      `;
      elements.wordList.appendChild(emptyMessage);
    } else if (savedWords.length === 0) {
      // Original empty message
      if (elements.emptyState) {
        elements.emptyState.style.display = 'block';
      }
    } else {
      // Custom empty message for filtered results
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-state';
      emptyMessage.innerHTML = `
        <div class="empty-icon">📝</div>
        <h3>Bu kategoride kelime bulunamadı</h3>
        <p>Farklı bir durum filtresi seçin veya yeni kelimeler ekleyin.</p>
      `;
      elements.wordList.appendChild(emptyMessage);
    }
    return;
  }
  
  // Hide empty state
  if (elements.emptyState) {
    elements.emptyState.style.display = 'none';
  }
  
  // Add words to list
  filteredWords.forEach(word => {
    const wordItem = document.createElement('div');
    wordItem.className = `word-item status-${word.status}`;
    if (word.difficulty === 'difficult') {
      wordItem.classList.add('difficult');
    }
    
    // Create word content
    const wordContent = document.createElement('div');
    wordContent.className = 'word-content';
    
    // Word text and translation
    const wordInfo = document.createElement('div');
    wordInfo.className = 'word-info';
    
    const wordText = document.createElement('div');
    wordText.className = 'word-text';
    wordText.textContent = word.word;
    wordInfo.appendChild(wordText);
    
    const wordTranslation = document.createElement('div');
    wordTranslation.className = 'word-translation';
    wordTranslation.textContent = word.translation;
    wordInfo.appendChild(wordTranslation);
    
    // Learning status
    const wordStatus = document.createElement('div');
    wordStatus.className = 'word-learning-status';
    
    const statusIndicator = document.createElement('span');
    statusIndicator.className = `learning-status-indicator status-${word.status}`;
    wordStatus.appendChild(statusIndicator);
    
    const statusText = document.createElement('span');
    statusText.className = 'learning-status-text';
    
    let statusLabel = 'Yeni';
    if (word.status === 'learning') statusLabel = 'Öğreniliyor';
    if (word.status === 'learned') statusLabel = 'Öğrenildi';
    
    statusText.textContent = statusLabel;
    wordStatus.appendChild(statusText);
    
    // View count
    if (word.viewCount) {
      const viewCount = document.createElement('span');
      viewCount.className = 'view-count';
      viewCount.textContent = `${word.viewCount} görüntüleme`;
      wordStatus.appendChild(viewCount);
    }
    
    wordInfo.appendChild(wordStatus);
    wordContent.appendChild(wordInfo);
    
    // Word actions
    const wordActions = document.createElement('div');
    wordActions.className = 'word-actions';
    
    // Status toggle buttons
    const statusButtons = document.createElement('div');
    statusButtons.className = 'status-buttons';
    
    // New button
    const newButton = document.createElement('button');
    newButton.className = 'status-button' + (word.status === 'new' ? ' active' : '');
    newButton.title = 'Yeni olarak işaretle';
    newButton.textContent = 'Yeni';
    newButton.addEventListener('click', () => {
      updateWordStatus(word.word, 'new');
    });
    statusButtons.appendChild(newButton);
    
    // Learning button
    const learningButton = document.createElement('button');
    learningButton.className = 'status-button' + (word.status === 'learning' ? ' active' : '');
    learningButton.title = 'Öğreniliyor olarak işaretle';
    learningButton.textContent = 'Öğreniliyor';
    learningButton.addEventListener('click', () => {
      updateWordStatus(word.word, 'learning');
    });
    statusButtons.appendChild(learningButton);
    
    // Learned button
    const learnedButton = document.createElement('button');
    learnedButton.className = 'status-button' + (word.status === 'learned' ? ' active' : '');
    learnedButton.title = 'Öğrenildi olarak işaretle';
    learnedButton.textContent = 'Öğrenildi';
    learnedButton.addEventListener('click', () => {
      updateWordStatus(word.word, 'learned');
    });
    statusButtons.appendChild(learnedButton);
    
    wordActions.appendChild(statusButtons);
    
    // Action buttons
    const actionButtons = document.createElement('div');
    actionButtons.className = 'action-buttons';
    
    // Speak button
    const speakButton = document.createElement('button');
    speakButton.className = 'word-action-button';
    speakButton.title = 'Kelimeyi seslendir';
    speakButton.innerHTML = '🔊';
    speakButton.addEventListener('click', () => {
      speakText(word.word, word.originalLanguage || settings.originalLanguage);
    });
    actionButtons.appendChild(speakButton);
    
    // Toggle difficult button
    const difficultButton = document.createElement('button');
    difficultButton.className = 'word-action-button' + (word.difficulty === 'difficult' ? ' active' : '');
    difficultButton.title = word.difficulty === 'difficult' ? 'Zor işaretini kaldır' : 'Zor olarak işaretle';
    difficultButton.innerHTML = '⭐';
    difficultButton.addEventListener('click', () => {
      toggleDifficult(word);
    });
    actionButtons.appendChild(difficultButton);
    
    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'word-action-button delete';
    deleteButton.title = 'Kelimeyi sil';
    deleteButton.innerHTML = '🗑️';
    deleteButton.addEventListener('click', () => {
      removeWord(word.word);
    });
    actionButtons.appendChild(deleteButton);
    
    wordActions.appendChild(actionButtons);
    wordContent.appendChild(wordActions);
    wordItem.appendChild(wordContent);
    
    // Context (if available)
    if (word.contexts && word.contexts.length > 0) {
      const contextContainer = document.createElement('div');
      contextContainer.className = 'word-context';
      
      // Show first context
      const context = document.createElement('div');
      context.className = 'context-text';
      context.textContent = word.contexts[0];
      contextContainer.appendChild(context);
      
      // Show source if available
      if (word.source) {
        const source = document.createElement('div');
        source.className = 'context-source';
        source.textContent = `Kaynak: ${word.source === 'netflix' ? 'Netflix' : 'YouTube'}`;
        contextContainer.appendChild(source);
      }
      
      wordItem.appendChild(contextContainer);
      
      // Toggle context visibility
      wordContent.addEventListener('click', (e) => {
        if (!e.target.closest('.word-actions')) {
          wordItem.classList.toggle('expanded');
        }
      });
    }
    
    elements.wordList.appendChild(wordItem);
  });
}

// Cycle through word learning statuses
async function cycleWordStatus(word) {
  const wordIndex = savedWords.findIndex(item => 
    item.word.toLowerCase() === word.toLowerCase());
  
  if (wordIndex !== -1) {
    // Cycle through statuses: new -> learning -> learned -> learning (loop)
    if (savedWords[wordIndex].status === 'new') {
      savedWords[wordIndex].status = 'learning';
    } else if (savedWords[wordIndex].status === 'learning') {
      savedWords[wordIndex].status = 'learned';
    } else if (savedWords[wordIndex].status === 'learned') {
      savedWords[wordIndex].status = 'learning';
    }
    
    // Update view count and last viewed
    savedWords[wordIndex].viewCount = (savedWords[wordIndex].viewCount || 0) + 1;
    savedWords[wordIndex].lastViewed = new Date().toISOString();
    
    // Save to storage
    await saveWordsToStorage();
    
    // Re-render list
    filterAndRenderWords();
  }
}

// Mark word as difficult/normal
async function toggleDifficulty(word) {
  const wordIndex = savedWords.findIndex(item => 
    item.word.toLowerCase() === word.toLowerCase());
  
  if (wordIndex !== -1) {
    // Toggle difficulty
    savedWords[wordIndex].difficulty = 
      savedWords[wordIndex].difficulty === 'difficult' ? 'normal' : 'difficult';
    
    // Save to storage
    await saveWordsToStorage();
    
    // Re-render list
    filterAndRenderWords();
  }
}

// Delete a word from the saved list
async function deleteWord(word) {
  if (confirm(`"${word}" kelimesini silmek istediğinizden emin misiniz?`)) {
    // Remove word from array
    savedWords = savedWords.filter(item => 
      item.word.toLowerCase() !== word.toLowerCase());
    
    // Save to storage
    await saveWordsToStorage();
    
    // Re-render list
    filterAndRenderWords();
    
    // Update stats if we're on that tab
    if (document.querySelector('.tab-button[data-tab="stats"]').classList.contains('active')) {
      updateStats();
    }
  }
}

// Clear all saved words
async function clearAllWords() {
  if (confirm('Tüm kelimeleri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz!')) {
    // Clear array
    savedWords = [];
    
    // Save to storage
    await saveWordsToStorage();
    
    // Re-render list
    filterAndRenderWords();
    
    // Update stats if we're on that tab
    if (document.querySelector('.tab-button[data-tab="stats"]').classList.contains('active')) {
      updateStats();
    }
  }
}

// Save words to storage
async function saveWordsToStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ savedWords }, resolve);
  });
}

// Update statistics display
function updateStats() {
  if (!elements.newProgress || !elements.learningProgress || !elements.learnedProgress || !elements.totalWordsCard || !elements.newWordsCard || !elements.learningWordsCard || !elements.learnedWordsCard || !elements.difficultWordsCard || !elements.addedThisWeek || !elements.learnedThisMonth || !elements.lastActivity) return;
  
  // Calculate statistics
  const totalWords = savedWords.length;
  const newWords = savedWords.filter(word => word.status === 'new').length;
  const learningWords = savedWords.filter(word => word.status === 'learning').length;
  const learnedWords = savedWords.filter(word => word.status === 'learned').length;
  const difficultWords = savedWords.filter(word => word.difficulty === 'difficult').length;
  
  // Set progress bar
  const newProgressPercentage = totalWords > 0 ? Math.round((newWords / totalWords) * 100) : 0;
  const learningProgressPercentage = totalWords > 0 ? Math.round((learningWords / totalWords) * 100) : 0;
  const learnedProgressPercentage = totalWords > 0 ? Math.round((learnedWords / totalWords) * 100) : 0;
  elements.newProgress.style.width = `${newProgressPercentage}%`;
  elements.learningProgress.style.width = `${learningProgressPercentage}%`;
  elements.learnedProgress.style.width = `${learnedProgressPercentage}%`;
  
  // Update counts
  elements.totalWordsCard.textContent = `${totalWords} kelime`;
  elements.newWordsCard.textContent = newWords;
  elements.learningWordsCard.textContent = learningWords;
  elements.learnedWordsCard.textContent = learnedWords;
  elements.difficultWordsCard.textContent = difficultWords;
  elements.addedThisWeek.textContent = getAddedThisWeek(savedWords);
  elements.learnedThisMonth.textContent = getLearnedThisMonth(savedWords);
  elements.lastActivity.textContent = getLastActivity(savedWords);
}

// Get added this week
function getAddedThisWeek(words) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  
  const addedThisWeek = words.filter(word => {
    const createdDate = new Date(word.createdAt);
    return createdDate >= startOfWeek && createdDate < now;
  }).length;
  
  return addedThisWeek;
}

// Get learned this month
function getLearnedThisMonth(words) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const learnedThisMonth = words.filter(word => {
    const learnedDate = new Date(word.lastViewed || word.createdAt);
    return learnedDate >= startOfMonth && learnedDate < now;
  }).length;
  
  return learnedThisMonth;
}

// Get last activity
function getLastActivity(words) {
  const now = new Date();
  const lastActivity = words.filter(word => {
    const lastViewed = new Date(word.lastViewed || word.createdAt);
    const daysSinceLastView = Math.floor((now - lastViewed) / (1000 * 60 * 60 * 24));
    return daysSinceLastView <= 7;
  }).length;
  
  return lastActivity;
}

// Export words to CSV file
function exportToCsv() {
  if (savedWords.length === 0) {
    alert('Dışa aktarılacak kelime bulunmuyor.');
    return;
  }
  
  // Convert data to CSV format
  const csvRows = [];
  
  // Header row
  csvRows.push(['Kelime', 'Çeviri', 'Durum', 'Zorluk', 'Görüntülenme', 'Son Görüntülenme', 'Bağlam', 'Oluşturma Tarihi']);
  
  // Data rows
  savedWords.forEach(word => {
    const context = word.contexts && word.contexts.length > 0 ? word.contexts[0] : '';
    const createdDate = word.createdAt ? new Date(word.createdAt).toLocaleDateString() : '';
    const lastViewed = word.lastViewed ? new Date(word.lastViewed).toLocaleDateString() : '';
    
    let status = 'Yeni';
    if (word.status === 'learning') status = 'Öğreniliyor';
    if (word.status === 'learned') status = 'Öğrenildi';
    
    csvRows.push([
      word.word, 
      word.translation, 
      status,
      word.difficulty === 'difficult' ? 'Zor' : 'Normal', 
      word.viewCount || 0,
      lastViewed,
      `"${context}"`, 
      createdDate
    ]);
  });
  
  // Convert to CSV string
  const csvContent = csvRows.map(row => row.join(',')).join('\n');
  
  // Create and download the file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `language-learner-words-${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export words to JSON file
function exportToJson() {
  if (savedWords.length === 0) {
    alert('Dışa aktarılacak kelime bulunmuyor.');
    return;
  }
  
  // Create a copy of the words array for export
  const exportData = {
    exportDate: new Date().toISOString(),
    words: JSON.parse(JSON.stringify(savedWords))
  };
  
  // Convert to JSON string
  const jsonContent = JSON.stringify(exportData, null, 2);
  
  // Create and download the file
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `language-learner-words-${new Date().toISOString().slice(0, 10)}.json`);
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export words to PDF (simplified version)
function exportToPdf() {
  alert('PDF dışa aktarma özelliği henüz geliştirme aşamasındadır.');
  // In a real implementation, you would use a library like jsPDF to generate a PDF file
}

// Toggle export options dropdown
function toggleExportDropdown() {
  const dropdownVisible = elements.exportOptions.style.display === 'block';
  elements.exportOptions.style.display = dropdownVisible ? 'none' : 'block';
  
  // Close dropdown when clicking outside
  if (!dropdownVisible) {
    document.addEventListener('click', function closeDropdown(e) {
      if (!elements.exportOptions.contains(e.target) && e.target !== elements.exportDropdown) {
        elements.exportOptions.style.display = 'none';
        document.removeEventListener('click', closeDropdown);
      }
    });
  }
}

// Setup event listeners
function setupEventListeners() {
  // Export dropdown
  elements.exportDropdown.addEventListener('click', toggleExportDropdown);
  
  // Export options
  elements.exportCsvBtn.addEventListener('click', () => {
    exportToCsv();
    elements.exportOptions.style.display = 'none';
  });
  
  elements.exportJsonBtn.addEventListener('click', () => {
    exportToJson();
    elements.exportOptions.style.display = 'none';
  });
  
  elements.exportPdfBtn.addEventListener('click', () => {
    exportToPdf();
    elements.exportOptions.style.display = 'none';
  });
  
  // Auto-sort button
  elements.autosortBtn.addEventListener('click', (e) => {
    // Create and show context menu for sort options
    const menu = document.createElement('div');
    menu.style.position = 'absolute';
    menu.style.top = `${e.clientY + 10}px`;
    menu.style.left = `${e.clientX - 100}px`;
    menu.style.width = '200px';
    menu.style.backgroundColor = '#fff';
    menu.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    menu.style.borderRadius = '8px';
    menu.style.zIndex = '1000';
    menu.style.overflow = 'hidden';
    
    // Create sort options
    const sortOptions = [
      { id: 'alphabetical', text: 'Alfabetik' },
      { id: 'recently-added', text: 'En Son Eklenen' },
      { id: 'recently-viewed', text: 'En Son Görüntülenen' },
      { id: 'least-viewed', text: 'En Az Görüntülenen' },
      { id: 'most-viewed', text: 'En Çok Görüntülenen' },
    ];
    
    sortOptions.forEach(option => {
      const optionElement = document.createElement('div');
      optionElement.style.padding = '10px 16px';
      optionElement.style.cursor = 'pointer';
      optionElement.style.transition = 'background-color 0.2s';
      
      if (option.id === currentSort) {
        optionElement.style.backgroundColor = '#f0f9ff';
        optionElement.style.fontWeight = '600';
        optionElement.style.color = '#2563eb';
      }
      
      optionElement.textContent = option.text;
      
      optionElement.addEventListener('mouseover', () => {
        optionElement.style.backgroundColor = option.id === currentSort ? '#f0f9ff' : '#f8fafc';
      });
      
      optionElement.addEventListener('mouseout', () => {
        optionElement.style.backgroundColor = option.id === currentSort ? '#f0f9ff' : '';
      });
      
      optionElement.addEventListener('click', () => {
        currentSort = option.id;
        menu.remove();
        filterAndRenderWords();
      });
      
      menu.appendChild(optionElement);
    });
    
    // Add to document
    document.body.appendChild(menu);
    
    // Close menu when clicking outside
    document.addEventListener('click', function closeMenu(e) {
      if (!menu.contains(e.target) && e.target !== elements.autosortBtn) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    });
  });
  
  // Word search
  elements.wordSearch.addEventListener('input', () => {
    searchQuery = elements.wordSearch.value.trim();
    filterAndRenderWords();
  });
  
  // Status filters
  elements.statusFilters.forEach(filter => {
    filter.addEventListener('click', () => {
      // Update active class
      elements.statusFilters.forEach(f => f.classList.remove('active'));
      filter.classList.add('active');
      
      // Set current filter
      currentFilter = filter.getAttribute('data-status');
      
      // Update word list
      filterAndRenderWords();
    });
  });
  
  // Clear all words
  elements.clearAllBtn.addEventListener('click', clearAllWords);
  
  // Save settings
  elements.saveSettingsBtn.addEventListener('click', async () => {
    try {
      await saveSettings();
      alert('Ayarlar kaydedildi.');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Ayarlar kaydedilirken bir hata oluştu.');
    }
  });
  
  // Reset settings
  elements.resetSettingsBtn.addEventListener('click', async () => {
    if (confirm('Ayarları varsayılan değerlere sıfırlamak istediğinizden emin misiniz?')) {
      try {
        settings = getDefaultSettings();
        updateSettingsUI();
        await saveSettings();
        alert('Ayarlar varsayılan değerlere sıfırlandı.');
      } catch (error) {
        console.error('Error resetting settings:', error);
        alert('Ayarlar sıfırlanırken bir hata oluştu.');
      }
    }
  });
} 