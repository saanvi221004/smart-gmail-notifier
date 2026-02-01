import { gmailAPI } from './gmail.js';
import { aiProcessor } from './ai.js';

/* =========================
   Storage Keys
========================= */
const STORAGE_KEYS = {
  PROCESSED_MESSAGES: 'processed_messages',
  SETTINGS: 'settings',
  LAST_CHECK: 'last_check'
};

/* =========================
   Gmail Notifier
========================= */
class GmailNotifier {
  constructor() {
    this.isRunning = false;
    this.authToken = null;
    this.processedMessages = new Set();

    // ✅ hard defaults
    this.settings = {
      pollingInterval: 60 // seconds (Chrome-safe)
    };
  }

  /* ---------- Init ---------- */
  async initialize() {
    await this.loadStoredData();
    console.log('Smart Gmail Notifier initialized with settings:', this.settings);
  }

  async loadStoredData() {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.PROCESSED_MESSAGES,
      STORAGE_KEYS.SETTINGS
    ]);

    this.processedMessages = new Set(
      data[STORAGE_KEYS.PROCESSED_MESSAGES] || []
    );

    const storedSettings = data[STORAGE_KEYS.SETTINGS] || {};

    // ✅ SANITIZE pollingInterval
    let interval = Number(storedSettings.pollingInterval);

    if (!Number.isFinite(interval) || interval < 60) {
      interval = 60; // Chrome minimum safe value
    }

    this.settings = {
      pollingInterval: interval
    };
  }

  /* ---------- Auth ---------- */
  async authenticate(forceRefresh = false) {
    if (forceRefresh && this.authToken) {
      await chrome.identity.removeCachedAuthToken({ token: this.authToken });
      this.authToken = null;
    }

    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, token => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });

    this.authToken = token;
    return token;
  }

  /* ---------- Polling ---------- */
  async startPolling() {
    if (this.isRunning) return;

    this.isRunning = true;

    const minutes = this.settings.pollingInterval / 60;

    chrome.alarms.create('gmail-poll', {
      periodInMinutes: minutes
    });

    // fire once immediately (non-blocking)
    this.checkForNewEmails();

    console.log('Email polling started every', minutes, 'minutes');
  }

  async stopPolling() {
    this.isRunning = false;
    await chrome.alarms.clear('gmail-poll');
    console.log('Email polling stopped');
  }

  /* ---------- Gmail ---------- */
  async checkForNewEmails() {
    if (!this.isRunning) return;

    try {
      if (!this.authToken) {
        await this.authenticate();
      }

      const unreadEmails = await gmailAPI.getUnreadEmails(this.authToken);

      for (const email of unreadEmails) {
        if (!this.processedMessages.has(email.id)) {
          await this.processEmail(email);
          await this.markAsProcessed(email.id);
        }
      }

      await chrome.storage.local.set({
        [STORAGE_KEYS.LAST_CHECK]: new Date().toISOString()
      });
    } catch (error) {
      console.error('Email check failed:', error);

      if (error.message?.includes('401')) {
        await this.authenticate(true);
      }
    }
  }

  async markAsProcessed(messageId) {
    this.processedMessages.add(messageId);
    await chrome.storage.local.set({
      [STORAGE_KEYS.PROCESSED_MESSAGES]: Array.from(this.processedMessages)
    });
  }

  /* ---------- AI + Notify ---------- */
  async processEmail(email) {
    const result = await aiProcessor.processEmail(
      email.subject || '',
      email.body || email.snippet || ''
    );

    chrome.notifications.create(`gmail-${email.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: `New Email from ${email.from?.name || email.from?.email || 'Unknown'}`,
      message: `${result.summary}\n${result.tag}`
    });
  }
}

/* =========================
   Instance
========================= */
const notifier = new GmailNotifier();

/* =========================
   Alarm Listener
========================= */
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'gmail-poll' && notifier.isRunning) {
    notifier.checkForNewEmails();
  }
});

/* =========================
   Lifecycle
========================= */
chrome.runtime.onInstalled.addListener(() => {
  notifier.initialize();
});

chrome.runtime.onStartup.addListener(() => {
  notifier.initialize();
});

/* =========================
   Message Bridge
========================= */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'togglePolling') {
    (async () => {
      try {
        if (notifier.isRunning) {
          await notifier.stopPolling();
        } else {
          await notifier.authenticate();
          await notifier.startPolling();
        }

        sendResponse({ isRunning: notifier.isRunning });
      } catch (err) {
        console.error('Toggle failed:', err);
        sendResponse({ isRunning: false, error: err.message });
      }
    })();

    return true; // REQUIRED
  }

  if (request.action === 'getStatus') {
    sendResponse({
      isRunning: notifier.isRunning,
      processedCount: notifier.processedMessages.size
    });
  }

  if (request.action === 'clearProcessed') {
    notifier.processedMessages.clear();
    chrome.storage.local.set({
      [STORAGE_KEYS.PROCESSED_MESSAGES]: []
    });
    sendResponse({ success: true });
  }
});
