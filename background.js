import { gmailAPI } from './gmail.js';
import { aiProcessor } from './ai.js';

const STORAGE_KEYS = {
  PROCESSED_MESSAGES: 'processed_messages',
  SETTINGS: 'settings',
  LAST_CHECK: 'last_check'
};

class GmailNotifier {
  constructor() {
    this.isRunning = false;
    this.authToken = null;
    this.processedMessages = new Set();
  }

  async initialize() {
    try {
      await this.loadStoredData();
      await this.authenticate();
      await this.startPolling();
      console.log('Gmail Notifier initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Gmail Notifier:', error);
    }
  }

  async loadStoredData() {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.PROCESSED_MESSAGES,
      STORAGE_KEYS.SETTINGS
    ]);

    // ✅ ALWAYS convert stored array → Set
    const storedMessages = data[STORAGE_KEYS.PROCESSED_MESSAGES] || [];
    this.processedMessages = new Set(storedMessages);

    this.settings = data[STORAGE_KEYS.SETTINGS] || {
      pollingInterval: 30
    };
  }

  async authenticate(forceRefresh = false) {
    try {
      if (forceRefresh && this.authToken) {
        await new Promise(resolve => {
          chrome.identity.removeCachedAuthToken(
            { token: this.authToken },
            resolve
          );
        });
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
      console.log('Authentication successful');
      return token;
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
  }

  async startPolling() {
    if (this.isRunning) return;

    this.isRunning = true;

    await chrome.alarms.create('gmail-poll', {
      periodInMinutes: 0.5 // 30 seconds
    });

    await this.checkForNewEmails();

    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === 'gmail-poll') {
        this.checkForNewEmails();
      }
    });

    console.log('Email polling started');
  }

  async checkForNewEmails() {
    try {
      if (!this.authToken) {
        await this.authenticate();
      }

      const unreadEmails = await gmailAPI.getUnreadEmails(this.authToken);

      for (const email of unreadEmails) {
        if (!this.isMessageProcessed(email.id)) {
          await this.processNewEmail(email);
          await this.markMessageAsProcessed(email.id);
        }
      }

      await chrome.storage.local.set({
        [STORAGE_KEYS.LAST_CHECK]: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error checking for new emails:', error);

      // ✅ Correct 401 handling
      if (error.message?.includes('401')) {
        console.warn('401 detected. Refreshing token and retrying...');
        await this.authenticate(true);
      }
    }
  }

  isMessageProcessed(messageId) {
    return this.processedMessages.has(messageId);
  }

  async markMessageAsProcessed(messageId) {
    this.processedMessages.add(messageId);
    await chrome.storage.local.set({
      [STORAGE_KEYS.PROCESSED_MESSAGES]: Array.from(this.processedMessages)
    });
  }

  async processNewEmail(email) {
    try {
      const result = await aiProcessor.processEmail(
        email.subject || '',
        email.body || email.snippet || ''
      );

      await this.showNotification(email, result);
    } catch (error) {
      console.error('Error processing email:', error);
    }
  }

  async showNotification(email, aiResult) {
    const notificationId = `gmail-${email.id}`;

    chrome.notifications.create(
      notificationId,
      {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: `New Email from ${email.from?.name || email.from?.email || 'Unknown'}`,
        message: `${aiResult.summary}\n${aiResult.tag}`
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error('Notification error:', chrome.runtime.lastError);
        }
      }
    );
  }

  async stop() {
    this.isRunning = false;
    await chrome.alarms.clear('gmail-poll');
    console.log('Gmail Notifier stopped');
  }
}

const notifier = new GmailNotifier();

chrome.runtime.onInstalled.addListener(() => {
  console.log('Smart Gmail Notifier installed');
  notifier.initialize();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Smart Gmail Notifier started');
  notifier.initialize();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStatus') {
    sendResponse({
      isRunning: notifier.isRunning,
      processedCount: notifier.processedMessages.size
    });
  }

  if (request.action === 'clearProcessed') {
    notifier.processedMessages = new Set();
    chrome.storage.local.set({
      [STORAGE_KEYS.PROCESSED_MESSAGES]: []
    });
    sendResponse({ success: true });
  }
});
