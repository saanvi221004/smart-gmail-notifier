document.addEventListener('DOMContentLoaded', function() {
  const statusEl = document.getElementById('status');
  const lastCheckEl = document.getElementById('lastCheck');
  const processedCountEl = document.getElementById('processedCount');
  const toggleBtn = document.getElementById('toggleBtn');
  const clearBtn = document.getElementById('clearBtn');
  const aiApiKeyInput = document.getElementById('aiApiKey');
  const saveBtn = document.getElementById('saveBtn');

  async function loadStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
      
      if (response.isRunning) {
        statusEl.textContent = 'Active';
        statusEl.className = 'status-value status-active';
        toggleBtn.textContent = 'Stop';
      } else {
        statusEl.textContent = 'Inactive';
        statusEl.className = 'status-value status-inactive';
        toggleBtn.textContent = 'Start';
      }
      
      if (response.lastCheck) {
        const lastCheck = new Date(response.lastCheck);
        lastCheckEl.textContent = lastCheck.toLocaleString();
      } else {
        lastCheckEl.textContent = 'Never';
      }
      
      processedCountEl.textContent = response.processedCount || 0;
    } catch (error) {
      console.error('Error loading status:', error);
      statusEl.textContent = 'Error';
    }
  }

  async function loadSettings() {
    try {
      const data = await chrome.storage.local.get(['settings']);
      const settings = data.settings || {};
      aiApiKeyInput.value = settings.aiApiKey || '';
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  toggleBtn.addEventListener('click', async function() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'togglePolling' });
      
      if (response.isRunning) {
        statusEl.textContent = 'Active';
        statusEl.className = 'status-value status-active';
        toggleBtn.textContent = 'Stop';
      } else {
        statusEl.textContent = 'Inactive';
        statusEl.className = 'status-value status-inactive';
        toggleBtn.textContent = 'Start';
      }
    } catch (error) {
      console.error('Error toggling polling:', error);
    }
  });

  clearBtn.addEventListener('click', async function() {
    if (confirm('Clear all processed message history?')) {
      try {
        await chrome.runtime.sendMessage({ action: 'clearProcessed' });
        processedCountEl.textContent = '0';
      } catch (error) {
        console.error('Error clearing history:', error);
      }
    }
  });

  saveBtn.addEventListener('click', async function() {
    try {
      const currentSettings = await chrome.storage.local.get(['settings']);
      const settings = currentSettings.settings || {};
      
      settings.aiApiKey = aiApiKeyInput.value.trim() || null;
      
      await chrome.storage.local.set({ settings });
      
      // Visual feedback
      const originalText = saveBtn.textContent;
      saveBtn.textContent = 'Saved!';
      saveBtn.style.background = '#34a853';
      
      setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.style.background = '';
      }, 1500);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  });

  // Load initial data
  loadStatus();
  loadSettings();
});
