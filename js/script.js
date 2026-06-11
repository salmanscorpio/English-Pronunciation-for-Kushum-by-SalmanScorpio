/**
 * SSP-E: English Pronunciation Master
 * Production-Grade JavaScript Engine
 * Vanilla JavaScript - No Dependencies
 * 
 * Features:
 * - Web Speech API Text-to-Speech
 * - High-quality female voice
 * - Playback controls & speed adjustment
 * - Waveform visualization
 * - Learning history with localStorage
 * - Favorite pronunciations
 * - Keyboard shortcuts
 * - Word highlighting
 * - Responsive design
 */

// ================================
// Configuration & Constants
// ================================

const CONFIG = {
    maxCharacters: 1000,
    voiceLanguage: 'en-US',
    waveformBars: 64,
    historyLimit: 50,
    saveDelay: 500,
};

const KEYS = {
    history: 'ssp_history',
    favorites: 'ssp_favorites',
    theme: 'ssp_theme',
};

// ================================
// State Management
// ================================

let appState = {
    isPlaying: false,
    isPaused: false,
    currentSpeed: 1,
    speechInstance: null,
    history: [],
    favorites: [],
    waveformAnimationId: null,
    currentHighlightedWord: null,
    lastSavedText: '',
};

// ================================
// DOM Elements Cache
// ================================

const DOM = {
    // Input & Controls
    textInput: document.getElementById('textInput'),
    charCount: document.getElementById('charCount'),
    
    // Buttons
    playBtn: document.getElementById('playBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    resumeBtn: document.getElementById('resumeBtn'),
    stopBtn: document.getElementById('stopBtn'),
    clearBtn: document.getElementById('clearBtn'),
    copyBtn: document.getElementById('copyBtn'),
    saveBtn: document.getElementById('saveBtn'),
    shareBtn: document.getElementById('shareBtn'),
    
    // Speed Control
    speedSlider: document.getElementById('speedSlider'),
    speedValue: document.getElementById('speedValue'),
    speedBtns: document.querySelectorAll('.speed-btn'),
    
    // Visualization
    waveformCanvas: document.getElementById('waveformCanvas'),
    waveformCtx: document.getElementById('waveformCanvas').getContext('2d'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.getElementById('progressFill'),
    currentTime: document.getElementById('currentTime'),
    duration: document.getElementById('duration'),
    
    // History & Favorites
    historyList: document.getElementById('historyList'),
    favoritesList: document.getElementById('favoritesList'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    clearFavoritesBtn: document.getElementById('clearFavoritesBtn'),
    
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    
    // Navigation
    themeToggle: document.getElementById('themeToggle'),
};

// ================================
// Text-to-Speech Engine
// ================================

class SpeechEngine {
    constructor() {
        this.synth = window.speechSynthesis;
        this.utterance = null;
        this.currentWordIndex = 0;
        this.words = [];
        this.startTime = 0;
        this.pauseTime = 0;
        this.isPlaying = false;
        this.isPaused = false;
    }

    /**
     * Get available voices and filter for female English voice
     */
    getVoice() {
        const voices = this.synth.getVoices();
        
        // Priority list for real female voices (system-dependent)
        const femaleVoicePatterns = [
            // Windows & macOS - Common female voices
            /victoria|karen|moira|samantha|susan|jessica|fiona|zira|aria|nova|karen/i,
            // Google Chrome
            /woman|female|girl|ladies?/i,
            // Fallback patterns
            /(en-US|en-US-x).*female/i,
            /natural|premium/i
        ];
        
        // First pass: Look for explicitly marked female voices
        for (const pattern of femaleVoicePatterns) {
            const voice = voices.find(v => pattern.test(v.name));
            if (voice) return voice;
        }
        
        // Second pass: Exclude male voices, pick first English voice
        let selectedVoice = voices.find(voice => 
            voice.lang.startsWith('en-US') && 
            !voice.name.toLowerCase().includes('male')
        );
        
        // Third pass: Any English voice
        if (!selectedVoice) {
            selectedVoice = voices.find(voice => voice.lang.startsWith('en'));
        }
        
        return selectedVoice || voices[0];
    }

    /**
     * Initialize speech utterance
     */
    initialize(text, speed = 1) {
        // Cancel any ongoing speech
        this.synth.cancel();
        
        this.utterance = new SpeechSynthesisUtterance(text);
        this.utterance.voice = this.getVoice();
        this.utterance.rate = speed;
        // Optimize pitch for natural female voice (slightly higher than default)
        this.utterance.pitch = 1.2;
        this.utterance.volume = 1;
        this.utterance.lang = CONFIG.voiceLanguage;
        
        // Parse words for highlighting
        this.words = text.trim().split(/\s+/);
        this.currentWordIndex = 0;
        
        return this.utterance;
    }

    /**
     * Play speech
     */
    play(text, speed = 1) {
        this.initialize(text, speed);
        this.isPlaying = true;
        this.isPaused = false;
        this.startTime = Date.now();
        
        // Setup callbacks
        this.setupCallbacks();
        this.synth.speak(this.utterance);
    }

    /**
     * Pause speech
     */
    pause() {
        if (this.synth.paused === false) {
            this.pauseTime = Date.now();
            this.synth.pause();
            this.isPaused = true;
        }
    }

    /**
     * Resume speech
     */
    resume() {
        if (this.isPaused) {
            this.synth.resume();
            this.isPaused = false;
        }
    }

    /**
     * Stop speech
     */
    stop() {
        this.synth.cancel();
        this.isPlaying = false;
        this.isPaused = false;
    }

    /**
     * Setup speech event callbacks
     */
    setupCallbacks() {
        this.utterance.onstart = () => {
            appState.isPlaying = true;
            DOM.playBtn.disabled = true;
            DOM.pauseBtn.disabled = false;
            DOM.stopBtn.disabled = false;
            startWaveformAnimation();
        };

        this.utterance.onpause = () => {
            appState.isPaused = true;
            DOM.pauseBtn.disabled = true;
            DOM.resumeBtn.disabled = false;
            cancelAnimationFrame(appState.waveformAnimationId);
        };

        this.utterance.onresume = () => {
            appState.isPaused = false;
            DOM.pauseBtn.disabled = false;
            DOM.resumeBtn.disabled = true;
            startWaveformAnimation();
        };

        this.utterance.onend = () => {
            resetPlaybackUI();
        };

        this.utterance.onerror = (event) => {
            console.error('Speech error:', event.error);
            resetPlaybackUI();
            showToast('Error during pronunciation. Please try again.');
        };
    }

    /**
     * Get current playback position (estimation)
     */
    getProgress() {
        if (!this.isPlaying) return 0;
        // Rough estimation based on playback rate
        const elapsed = Date.now() - this.startTime;
        return Math.min(elapsed / 5000, 1); // Assume ~5 second max
    }
}

// Initialize speech engine
const speechEngine = new SpeechEngine();

// ================================
// Waveform Visualization
// ================================

function initWaveformCanvas() {
    const rect = DOM.waveformCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    DOM.waveformCanvas.width = rect.width * dpr;
    DOM.waveformCanvas.height = rect.height * dpr;
    
    DOM.waveformCtx.scale(dpr, dpr);
    DOM.waveformCtx.translate(0, rect.height / 2);
}

function drawWaveform(progress = 0) {
    const canvas = DOM.waveformCanvas;
    const ctx = DOM.waveformCtx;
    const rect = canvas.getBoundingClientRect();
    const centerY = 0;
    
    // Clear canvas
    ctx.clearRect(-canvas.width, -rect.height / 2, canvas.width * 2, rect.height);
    
    // Draw waveform bars
    const barWidth = rect.width / CONFIG.waveformBars;
    const maxHeight = rect.height / 2.5;
    
    for (let i = 0; i < CONFIG.waveformBars; i++) {
        const isActive = i / CONFIG.waveformBars < progress;
        const x = (i - CONFIG.waveformBars / 2) * barWidth + barWidth / 2;
        
        // Random height for dynamic waveform
        const randomHeight = Math.sin(i / CONFIG.waveformBars * Math.PI + progress * 2) * maxHeight;
        const height = isActive ? randomHeight : randomHeight * 0.3;
        
        // Draw bar
        const gradient = ctx.createLinearGradient(x, -height, x, height);
        gradient.addColorStop(0, isActive ? 'rgba(0, 217, 255, 0.3)' : 'rgba(0, 217, 255, 0.1)');
        gradient.addColorStop(0.5, isActive ? 'rgba(168, 85, 247, 0.6)' : 'rgba(168, 85, 247, 0.2)');
        gradient.addColorStop(1, isActive ? 'rgba(0, 217, 255, 0.3)' : 'rgba(0, 217, 255, 0.1)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x - barWidth / 3, -height, barWidth * 0.6, height * 2);
    }
}

function startWaveformAnimation() {
    initWaveformCanvas();
    
    function animate() {
        const progress = speechEngine.getProgress();
        drawWaveform(progress);
        
        if (appState.isPlaying && !appState.isPaused) {
            appState.waveformAnimationId = requestAnimationFrame(animate);
        }
    }
    
    animate();
}

// ================================
// Character Counter
// ================================

function updateCharCount() {
    const text = DOM.textInput.value;
    const count = text.length;
    
    DOM.charCount.textContent = count;
    
    if (count >= CONFIG.maxCharacters) {
        DOM.textInput.value = text.substring(0, CONFIG.maxCharacters);
        DOM.charCount.textContent = CONFIG.maxCharacters;
        showToast(`Maximum ${CONFIG.maxCharacters} characters reached`);
    }
}

// ================================
// Playback Controls
// ================================

function playPronunciation() {
    const text = DOM.textInput.value.trim();
    
    if (!text) {
        showToast('Please enter text to pronounce');
        return;
    }
    
    const speed = appState.currentSpeed;
    speechEngine.play(text, speed);
    addToHistory(text);
}

function pausePronunciation() {
    speechEngine.pause();
}

function resumePronunciation() {
    speechEngine.resume();
}

function stopPronunciation() {
    speechEngine.stop();
    resetPlaybackUI();
}

function clearText() {
    DOM.textInput.value = '';
    updateCharCount();
    stopPronunciation();
    DOM.textInput.focus();
}

function resetPlaybackUI() {
    appState.isPlaying = false;
    appState.isPaused = false;
    DOM.playBtn.disabled = false;
    DOM.pauseBtn.disabled = true;
    DOM.resumeBtn.disabled = true;
    DOM.stopBtn.disabled = true;
    DOM.progressFill.style.width = '0%';
    cancelAnimationFrame(appState.waveformAnimationId);
    initWaveformCanvas();
    drawWaveform(0);
}

// ================================
// Speed Control
// ================================

function updateSpeed(speed) {
    appState.currentSpeed = speed;
    DOM.speedValue.textContent = speed.toFixed(1) + 'x';
    
    // Update button states
    DOM.speedBtns.forEach(btn => {
        btn.classList.remove('active');
        if (parseFloat(btn.dataset.speed) === speed) {
            btn.classList.add('active');
        }
    });
    
    // If currently playing, restart with new speed
    if (appState.isPlaying) {
        const text = DOM.textInput.value;
        stopPronunciation();
        setTimeout(() => speechEngine.play(text, speed), 100);
    }
}

// ================================
// History Management
// ================================

function loadHistory() {
    const saved = localStorage.getItem(KEYS.history);
    appState.history = saved ? JSON.parse(saved) : [];
}

function loadFavorites() {
    const saved = localStorage.getItem(KEYS.favorites);
    appState.favorites = saved ? JSON.parse(saved) : [];
}

function addToHistory(text) {
    if (!text.trim()) return;
    
    // Remove if already exists (move to top)
    appState.history = appState.history.filter(item => item !== text);
    
    // Add to beginning
    appState.history.unshift(text);
    
    // Limit size
    appState.history = appState.history.slice(0, CONFIG.historyLimit);
    
    // Save
    localStorage.setItem(KEYS.history, JSON.stringify(appState.history));
    renderHistory();
}

function clearHistory() {
    if (confirm('Clear all pronunciation history?')) {
        appState.history = [];
        localStorage.removeItem(KEYS.history);
        renderHistory();
        showToast('History cleared');
    }
}

function saveFavorite(text) {
    if (!text.trim()) return;
    
    if (appState.favorites.includes(text)) {
        appState.favorites = appState.favorites.filter(item => item !== text);
        showToast('Removed from favorites');
    } else {
        appState.favorites.push(text);
        showToast('Added to favorites');
    }
    
    localStorage.setItem(KEYS.favorites, JSON.stringify(appState.favorites));
    renderFavorites();
}

function clearFavorites() {
    if (confirm('Clear all favorite pronunciations?')) {
        appState.favorites = [];
        localStorage.removeItem(KEYS.favorites);
        renderFavorites();
        showToast('Favorites cleared');
    }
}

// ================================
// Render History & Favorites
// ================================

function renderHistory() {
    if (appState.history.length === 0) {
        DOM.historyList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                <p>No recent pronunciations yet</p>
                <p class="text-small">Start typing to see your history here</p>
            </div>
        `;
        return;
    }
    
    DOM.historyList.innerHTML = appState.history.map((text, idx) => `
        <div class="history-item" data-index="${idx}">
            <span class="history-item-text" title="${text}">${truncateText(text, 50)}</span>
            <div class="history-item-actions">
                <button class="btn-icon-small btn-secondary history-play" title="Pronounce">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                </button>
                <button class="btn-icon-small btn-secondary history-remove" title="Remove">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
    
    // Add event listeners
    DOM.historyList.querySelectorAll('.history-play').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = btn.closest('.history-item').dataset.index;
            DOM.textInput.value = appState.history[idx];
            updateCharCount();
            playPronunciation();
        });
    });
    
    DOM.historyList.querySelectorAll('.history-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = btn.closest('.history-item').dataset.index;
            appState.history.splice(idx, 1);
            localStorage.setItem(KEYS.history, JSON.stringify(appState.history));
            renderHistory();
        });
    });
}

function renderFavorites() {
    if (appState.favorites.length === 0) {
        DOM.favoritesList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                    <path d="M17 3H5c-1.11 0-1.99.9-1.99 2L3 21l9-4 9 4V5c0-1.1-.89-2-2-2z"/>
                </svg>
                <p>No saved favorites yet</p>
                <p class="text-small">Save pronunciations to your favorites</p>
            </div>
        `;
        return;
    }
    
    DOM.favoritesList.innerHTML = appState.favorites.map((text, idx) => `
        <div class="history-item" data-index="${idx}">
            <span class="history-item-text" title="${text}">${truncateText(text, 50)}</span>
            <div class="history-item-actions">
                <button class="btn-icon-small btn-secondary history-play" title="Pronounce">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                </button>
                <button class="btn-icon-small btn-secondary history-remove" title="Remove from favorites">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17 3H5c-1.11 0-1.99.9-1.99 2L3 21l9-4 9 4V5c0-1.1-.89-2-2-2z"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
    
    // Add event listeners
    DOM.favoritesList.querySelectorAll('.history-play').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = btn.closest('.history-item').dataset.index;
            DOM.textInput.value = appState.favorites[idx];
            updateCharCount();
            playPronunciation();
        });
    });
    
    DOM.favoritesList.querySelectorAll('.history-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = btn.closest('.history-item').dataset.index;
            appState.favorites.splice(idx, 1);
            localStorage.setItem(KEYS.favorites, JSON.stringify(appState.favorites));
            renderFavorites();
        });
    });
}

// ================================
// Quick Actions
// ================================

function copyText() {
    const text = DOM.textInput.value;
    
    if (!text) {
        showToast('Nothing to copy');
        return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard');
    }).catch(() => {
        showToast('Failed to copy');
    });
}

function saveCurrentFavorite() {
    const text = DOM.textInput.value;
    
    if (!text.trim()) {
        showToast('Please enter text first');
        return;
    }
    
    saveFavorite(text);
}

function shareText() {
    const text = DOM.textInput.value;
    
    if (!text.trim()) {
        showToast('Please enter text to share');
        return;
    }
    
    if (navigator.share) {
        navigator.share({
            title: 'SSP-E Pronunciation',
            text: `Let me practice pronouncing: "${text}"`
        }).catch(() => {
            showToast('Share cancelled');
        });
    } else {
        copyText();
        showToast('Text copied. Share from your clipboard');
    }
}

// ================================
// Toast Notifications
// ================================

function showToast(message, duration = 2000) {
    DOM.toastMessage.textContent = message;
    DOM.toast.classList.add('show');
    
    clearTimeout(DOM.toast.timeoutId);
    DOM.toast.timeoutId = setTimeout(() => {
        DOM.toast.classList.remove('show');
    }, duration);
}

// ================================
// Keyboard Shortcuts
// ================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Enter to play (when not in focus on a textarea)
        if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
            if (document.activeElement === DOM.textInput && e.ctrlKey === false) {
                // Allow natural newline in textarea
                return;
            }
            if (document.activeElement !== DOM.textInput) {
                e.preventDefault();
                playPronunciation();
            }
        }
        
        // Ctrl/Cmd + Enter to play
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            playPronunciation();
        }
        
        // Space to pause/resume
        if (e.code === 'Space' && document.activeElement !== DOM.textInput) {
            e.preventDefault();
            if (appState.isPlaying) {
                if (appState.isPaused) {
                    resumePronunciation();
                } else {
                    pausePronunciation();
                }
            }
        }
        
        // Escape to stop
        if (e.key === 'Escape') {
            stopPronunciation();
        }
    });
}

// ================================
// Theme Toggle
// ================================

function toggleTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (document.documentElement.style.colorScheme === 'light') {
        document.documentElement.style.colorScheme = 'dark';
        localStorage.setItem(KEYS.theme, 'dark');
    } else {
        document.documentElement.style.colorScheme = 'light';
        localStorage.setItem(KEYS.theme, 'light');
    }
}

function initTheme() {
    const saved = localStorage.getItem(KEYS.theme);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (saved) {
        document.documentElement.style.colorScheme = saved;
    } else {
        document.documentElement.style.colorScheme = prefersDark ? 'dark' : 'light';
    }
}

// ================================
// Utility Functions
// ================================

function truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ================================
// Event Listeners Setup
// ================================

function setupEventListeners() {
    // Input
    DOM.textInput.addEventListener('input', updateCharCount);
    
    // Playback Controls
    DOM.playBtn.addEventListener('click', playPronunciation);
    DOM.pauseBtn.addEventListener('click', pausePronunciation);
    DOM.resumeBtn.addEventListener('click', resumePronunciation);
    DOM.stopBtn.addEventListener('click', stopPronunciation);
    DOM.clearBtn.addEventListener('click', clearText);
    
    // Quick Actions
    DOM.copyBtn.addEventListener('click', copyText);
    DOM.saveBtn.addEventListener('click', saveCurrentFavorite);
    DOM.shareBtn.addEventListener('click', shareText);
    
    // Speed Control
    DOM.speedSlider.addEventListener('input', (e) => {
        updateSpeed(parseFloat(e.target.value));
    });
    
    DOM.speedBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            updateSpeed(parseFloat(btn.dataset.speed));
            DOM.speedSlider.value = btn.dataset.speed;
        });
    });
    
    // History & Favorites
    DOM.clearHistoryBtn.addEventListener('click', clearHistory);
    DOM.clearFavoritesBtn.addEventListener('click', clearFavorites);
    
    // Theme Toggle
    DOM.themeToggle.addEventListener('click', toggleTheme);
    
    // Prevent textarea from adding newlines on enter during playback
    DOM.textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            playPronunciation();
        }
    });
}

// ================================
// Initialization
// ================================

function init() {
    // Load data from localStorage
    loadHistory();
    loadFavorites();
    initTheme();
    
    // Initialize UI
    initWaveformCanvas();
    updateCharCount();
    resetPlaybackUI();
    renderHistory();
    renderFavorites();
    
    // Setup event listeners
    setupEventListeners();
    setupKeyboardShortcuts();
    
    // Request voices (they may load asynchronously)
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => {
            // Voices are now loaded
        };
    }
    
    // Focus on input
    DOM.textInput.focus();
    
    // Log initialization
    console.log('%cSSP-E Initialized', 'color: #00D9FF; font-weight: bold; font-size: 14px;');
    console.log('%cEnglish Pronunciation Master v1.0', 'color: #A855F7; font-size: 12px;');
}

// ================================
// Start App
// ================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ================================
// Handle Page Unload
// ================================

window.addEventListener('beforeunload', () => {
    if (appState.isPlaying) {
        speechEngine.stop();
    }
});

// ================================
// Handle Visibility Change
// ================================

document.addEventListener('visibilitychange', () => {
    if (document.hidden && appState.isPlaying) {
        speechEngine.pause();
    }
});

// ================================
// Prevent Zoom on Double Tap (Mobile)
// ================================

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);