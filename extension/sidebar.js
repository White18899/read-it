(function() {
  let currentText = '';
  let apiKey = '';
  let voices = [];
  let utterance = null;
  let isSpeaking = false;
  let isPaused = false;
  let chatHistory = [];

  const textDisplay = document.getElementById('text-display');
  const playBtn = document.getElementById('play-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const toggleSettingsBtn = document.getElementById('toggle-settings-btn');
  const settingsDropdown = document.getElementById('settings-dropdown');
  const voiceSelect = document.getElementById('voice-select');
  const speedRange = document.getElementById('speed-range');
  const speedLabel = document.getElementById('speed-label');
  const apiAlert = document.getElementById('api-alert');
  const closeBtn = document.getElementById('close-btn');
  const chatHistoryDiv = document.getElementById('chat-history');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const summaryBtn = document.getElementById('summary-btn');
  const explainBtn = document.getElementById('explain-btn');

  // Listen for text update messages from content script
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'SET_TEXT') {
      currentText = e.data.text;
      textDisplay.textContent = currentText;
      stopSpeaking();
      
      // Clear previous chats for fresh text contexts
      chatHistory = [];
      chatHistoryDiv.innerHTML = '';
    }
  });

  // Load API Key from extension storage
  function loadApiKey() {
    chrome.storage.sync.get(['geminiApiKey'], (result) => {
      apiKey = result.geminiApiKey || '';
      if (!apiKey) {
        apiAlert.style.display = 'flex';
        chatInput.disabled = true;
      } else {
        apiAlert.style.display = 'none';
        chatInput.disabled = false;
      }
    });
  }

  loadApiKey();
  // Reload key on storage change
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.geminiApiKey) {
      loadApiKey();
    }
  });

  // Enable/disable input send button
  chatInput.addEventListener('input', () => {
    sendBtn.disabled = !chatInput.value.trim();
  });

  // Close panel
  closeBtn.addEventListener('click', () => {
    window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
    stopSpeaking();
  });

  // Settings dropdown toggle
  toggleSettingsBtn.addEventListener('click', () => {
    const isVisible = settingsDropdown.style.display === 'flex';
    settingsDropdown.style.display = isVisible ? 'none' : 'flex';
    toggleSettingsBtn.style.color = isVisible ? 'var(--text-secondary)' : 'var(--accent)';
  });

  // TTS Setup
  function loadVoices() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      voices = window.speechSynthesis.getVoices();
      voiceSelect.innerHTML = '';
      
      const englishVoices = voices.filter(v => v.lang.startsWith('en'));
      const displayList = englishVoices.length > 0 ? englishVoices : voices;

      displayList.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
      });
    }
  }

  loadVoices();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  speedRange.addEventListener('input', () => {
    speedLabel.textContent = `${parseFloat(speedRange.value).toFixed(1)}x`;
  });

  // Speaking controls
  playBtn.addEventListener('click', () => {
    if (isPaused) {
      window.speechSynthesis.resume();
      isPaused = false;
      setSpeechState(true, false);
      return;
    }

    if (!currentText) return;
    window.speechSynthesis.cancel();

    utterance = new SpeechSynthesisUtterance(currentText);
    const selectedVoiceName = voiceSelect.value;
    const voice = voices.find(v => v.name === selectedVoiceName);
    if (voice) utterance.voice = voice;
    utterance.rate = parseFloat(speedRange.value);

    utterance.onend = () => stopSpeaking();
    utterance.onerror = () => stopSpeaking();

    window.speechSynthesis.speak(utterance);
    setSpeechState(true, false);
  });

  pauseBtn.addEventListener('click', () => {
    if (isSpeaking && !isPaused) {
      window.speechSynthesis.pause();
      isPaused = true;
      setSpeechState(true, true);
    }
  });

  stopBtn.addEventListener('click', stopSpeaking);

  function stopSpeaking() {
    window.speechSynthesis.cancel();
    setSpeechState(false, false);
  }

  function setSpeechState(speaking, paused) {
    isSpeaking = speaking;
    isPaused = paused;
    
    if (speaking) {
      playBtn.style.display = 'none';
      pauseBtn.style.display = paused ? 'none' : 'flex';
      playBtn.style.display = paused ? 'flex' : 'none';
      stopBtn.style.display = 'flex';
    } else {
      playBtn.style.display = 'flex';
      pauseBtn.style.display = 'none';
      stopBtn.style.display = 'none';
    }
  }

  // Preset Actions
  summaryBtn.addEventListener('click', () => {
    if (!currentText) return;
    runAiPrompt(`Provide a very brief summary of this passage in 3 bullet points: "${currentText}"`);
  });

  explainBtn.addEventListener('click', () => {
    if (!currentText) return;
    runAiPrompt(`Explain the key concepts or meaning of this passage in simple terms: "${currentText}"`);
  });

  // Chat submit
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = chatInput.value.trim();
    if (!query) return;

    chatInput.value = '';
    sendBtn.disabled = true;
    runAiPrompt(query);
  });

  // Gemini AI calls
  async function runAiPrompt(query) {
    if (!apiKey) {
      alert('Please set your API Key in the extension popup.');
      return;
    }

    // Append user message
    appendBubble('user', query);
    
    // Append loading state bubble
    const loadingBubble = appendLoadingBubble();
    
    // Construct request history
    // Since this is for a short text passage selection, we provide the selected passage as context.
    const contextPrompt = `Context passage: "${currentText}"\n\nUser request: ${query}`;
    
    const requestHistory = [
      {
        role: 'user',
        parts: [{ text: "You are a helpful AI reading assistant. Answer questions or requests based on the provided context passage. Keep your answers brief, insightful, and structured." }]
      },
      {
        role: 'model',
        parts: [{ text: "Understood. I am ready to answer based on the passage context." }]
      }
    ];

    chatHistory.forEach(msg => {
      requestHistory.push({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      });
    });

    requestHistory.push({
      role: 'user',
      parts: [{ text: contextPrompt }]
    });

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: requestHistory,
          generationConfig: { temperature: 0.5 }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from API.';
      
      loadingBubble.remove();
      appendBubble('ai', answer);
      
      // Store in history
      chatHistory.push({ sender: 'user', text: query });
      chatHistory.push({ sender: 'ai', text: answer });

    } catch (err) {
      console.error(err);
      loadingBubble.remove();
      appendBubble('ai', `Error: ${err.message || 'Failed to contact Gemini API.'}`);
    }
  }

  function appendBubble(sender, text) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${sender}-bubble`;
    
    if (sender === 'ai') {
      bubble.innerHTML = renderMarkdown(text);
    } else {
      bubble.textContent = text;
    }
    
    chatHistoryDiv.appendChild(bubble);
    chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
    return bubble;
  }

  function appendLoadingBubble() {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ai-bubble';
    bubble.innerHTML = `
      <div class="loading-dots">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `;
    chatHistoryDiv.appendChild(bubble);
    chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
    return bubble;
  }

  function renderMarkdown(text) {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br />');

    return `<div class="markdown-body">${html}</div>`;
  }

})();
