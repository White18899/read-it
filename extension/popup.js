document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const saveBtn = document.getElementById('save-btn');
  const statusMsg = document.getElementById('status-msg');
  const openReaderBtn = document.getElementById('open-reader-btn');

  // Load existing API Key
  chrome.storage.sync.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });

  // Save API Key
  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    
    chrome.storage.sync.set({ geminiApiKey: key }, () => {
      statusMsg.textContent = 'API Key saved successfully!';
      statusMsg.className = 'status-msg success';
      
      setTimeout(() => {
        statusMsg.textContent = '';
        statusMsg.className = 'status-msg';
      }, 2500);
    });
  });

  // Open Document Reader Web App (defaulting to local development port 5173)
  openReaderBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:5173/' });
  });
});
