(function() {
  let currentText = '';
  let apiKey = '';
  let voices = [];
  let utterance = null;
  let isSpeaking = false;
  let isPaused = false;
  let chatHistory = [];
  let audioElement = null;

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

  // Indian Assist & Pitch Elements
  const indianAssistCheckbox = document.getElementById('indian-assist-checkbox');
  const indianAssistInfo = document.getElementById('indian-assist-info');
  const pitchRange = document.getElementById('pitch-range');
  const pitchLabel = document.getElementById('pitch-label');

  // Multi-Engine Elements (Cartesia)
  const engineSelect = document.getElementById('engine-select');
  const browserVoiceGroup = document.getElementById('browser-voice-group');
  const cartesiaSettingsGroup = document.getElementById('cartesia-settings-group');
  const cartesiaVoiceSelect = document.getElementById('cartesia-voice-select');
  const customCartesiaVoiceGroup = document.getElementById('custom-cartesia-voice-group');
  const customCartesiaVoiceInput = document.getElementById('custom-cartesia-voice-input');
  const cartesiaApiKeyInput = document.getElementById('cartesia-api-key-input');
  const pitchSettingsGroup = document.getElementById('pitch-settings-group');
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

      const isIndianEnabled = localStorage.getItem('readit-indian-assist') === 'true';
      const savedVoice = localStorage.getItem('readit-selected-voice');
      let voiceToSelect = null;

      if (isIndianEnabled) {
        // Try to find Indian English voice first
        voiceToSelect = displayList.find(v => {
          const lang = v.lang.toLowerCase();
          const name = v.name.toLowerCase();
          return (lang === 'en-in' || lang === 'en_in') || 
                 (lang.startsWith('en') && (name.includes('india') || name.includes('in-')));
        });
      }

      if (!voiceToSelect && savedVoice) {
        voiceToSelect = displayList.find(v => v.name === savedVoice);
      }

      if (!voiceToSelect) {
        // Find neat female voice to select by default
        voiceToSelect = displayList.find(v => {
          const name = v.name.toLowerCase();
          return name.includes('female') ||
                 name.includes('zira') ||
                 name.includes('samantha') ||
                 name.includes('hazel') ||
                 name.includes('google us english') ||
                 name.includes('karen') ||
                 name.includes('natural');
        });
      }

      if (voiceToSelect) {
        voiceSelect.value = voiceToSelect.name;
      }
    }
  }

  // Load settings from localStorage
  const savedEngine = localStorage.getItem('readit-engine') || 'browser';
  engineSelect.value = savedEngine;
  updateEngineUI(savedEngine);

  const savedSpeed = localStorage.getItem('readit-speed') || '0.85';
  speedRange.value = savedSpeed;
  speedLabel.textContent = `${parseFloat(savedSpeed).toFixed(1)}x`;

  const savedPitch = localStorage.getItem('readit-pitch') || '1.0';
  pitchRange.value = savedPitch;
  pitchLabel.textContent = `${parseFloat(savedPitch).toFixed(1)}x`;

  const savedIndianAssist = localStorage.getItem('readit-indian-assist') === 'true';
  indianAssistCheckbox.checked = savedIndianAssist;
  indianAssistInfo.style.display = savedIndianAssist ? 'block' : 'none';

  const savedCartesiaVoice = localStorage.getItem('readit-cartesia-voice') || 'f9836c6e-a0bd-460e-9d3c-f7299fa60f94';
  const standardCartesiaVoices = [
    'f9836c6e-a0bd-460e-9d3c-f7299fa60f94',
    'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',
    'f786b574-daa5-4673-aa0c-cbe3e8534c02',
    'a5136bf9-224c-4d76-b823-52bd5efcffcc',
    '62ae83ad-4f6a-430b-af41-a9bede9286ca',
    'ef191366-f52f-447a-a398-ed8c0f2943a1',
    '95856005-0332-41b0-935f-352e296aa0df'
  ];
  if (standardCartesiaVoices.includes(savedCartesiaVoice)) {
    cartesiaVoiceSelect.value = savedCartesiaVoice;
    customCartesiaVoiceGroup.style.display = 'none';
  } else {
    cartesiaVoiceSelect.value = 'custom';
    customCartesiaVoiceGroup.style.display = 'flex';
    customCartesiaVoiceInput.value = savedCartesiaVoice;
  }

  const savedCartesiaApiKey = localStorage.getItem('readit-cartesia-key') || 'sk_car_HcFMXALTZdhm6SUUJsuUpb';
  cartesiaApiKeyInput.value = savedCartesiaApiKey;

  function updateEngineUI(engine) {
    if (engine === 'browser') {
      browserVoiceGroup.style.display = 'flex';
      cartesiaSettingsGroup.style.display = 'none';
      pitchSettingsGroup.style.display = 'flex';
    } else {
      browserVoiceGroup.style.display = 'none';
      cartesiaSettingsGroup.style.display = 'flex';
      pitchSettingsGroup.style.display = 'none';
    }
  }

  loadVoices();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  // Update change/input listeners
  engineSelect.addEventListener('change', () => {
    stopSpeaking();
    const engine = engineSelect.value;
    localStorage.setItem('readit-engine', engine);
    updateEngineUI(engine);
  });

  voiceSelect.addEventListener('change', () => {
    if (!indianAssistCheckbox.checked) {
      localStorage.setItem('readit-selected-voice', voiceSelect.value);
    }
  });

  speedRange.addEventListener('input', () => {
    const rate = parseFloat(speedRange.value);
    speedLabel.textContent = `${rate.toFixed(1)}x`;
    if (!indianAssistCheckbox.checked) {
      localStorage.setItem('readit-speed', speedRange.value);
    }
  });

  pitchRange.addEventListener('input', () => {
    const pitch = parseFloat(pitchRange.value);
    pitchLabel.textContent = `${pitch.toFixed(1)}x`;
    localStorage.setItem('readit-pitch', pitchRange.value);
  });

  cartesiaVoiceSelect.addEventListener('change', () => {
    stopSpeaking();
    const voiceVal = cartesiaVoiceSelect.value;
    if (voiceVal === 'custom') {
      customCartesiaVoiceGroup.style.display = 'flex';
      localStorage.setItem('readit-cartesia-voice', customCartesiaVoiceInput.value);
    } else {
      customCartesiaVoiceGroup.style.display = 'none';
      localStorage.setItem('readit-cartesia-voice', voiceVal);
    }
  });

  customCartesiaVoiceInput.addEventListener('input', () => {
    stopSpeaking();
    localStorage.setItem('readit-cartesia-voice', customCartesiaVoiceInput.value.trim());
  });

  cartesiaApiKeyInput.addEventListener('input', () => {
    localStorage.setItem('readit-cartesia-key', cartesiaApiKeyInput.value.trim());
  });

  indianAssistCheckbox.addEventListener('change', () => {
    const enabled = indianAssistCheckbox.checked;
    localStorage.setItem('readit-indian-assist', enabled ? 'true' : 'false');
    indianAssistInfo.style.display = enabled ? 'block' : 'none';
    
    if (enabled) {
      // Backup current custom settings
      localStorage.setItem('readit-backup-voice', voiceSelect.value);
      localStorage.setItem('readit-backup-speed', speedRange.value);
      
      // Auto-select Indian English voice if available
      const indianVoice = voices.find(v => {
        const lang = v.lang.toLowerCase();
        const name = v.name.toLowerCase();
        return (lang === 'en-in' || lang === 'en_in') || 
               (lang.startsWith('en') && (name.includes('india') || name.includes('in-')));
      });
      
      if (indianVoice) {
        voiceSelect.value = indianVoice.name;
      }
      
      // Set to slower, smoother rate (0.7x)
      speedRange.value = 0.7;
      speedLabel.textContent = '0.7x';
    } else {
      // Revert to backup settings
      const backupVoice = localStorage.getItem('readit-backup-voice');
      const backupSpeed = localStorage.getItem('readit-backup-speed') || '0.85';
      
      if (backupVoice && voices.some(v => v.name === backupVoice)) {
        voiceSelect.value = backupVoice;
      }
      speedRange.value = backupSpeed;
      speedLabel.textContent = `${parseFloat(backupSpeed).toFixed(1)}x`;
    }
  });

  // Speaking controls
  playBtn.addEventListener('click', async () => {
    const engine = engineSelect.value;

    if (isPaused) {
      if (engine === 'cartesia' && audioElement) {
        audioElement.play();
      } else {
        window.speechSynthesis.resume();
      }
      isPaused = false;
      setSpeechState(true, false);
      return;
    }

    if (!currentText) return;
    stopSpeaking();

    if (engine === 'browser') {
      utterance = new SpeechSynthesisUtterance(currentText);
      const selectedVoiceName = voiceSelect.value;
      const voice = voices.find(v => v.name === selectedVoiceName);
      if (voice) utterance.voice = voice;
      utterance.rate = parseFloat(speedRange.value);
      utterance.pitch = parseFloat(pitchRange.value);

      utterance.onend = () => stopSpeaking();
      utterance.onerror = () => stopSpeaking();

      window.speechSynthesis.speak(utterance);
      setSpeechState(true, false);
    } else {
      // Cartesia engine
      const cartesiaApiKey = cartesiaApiKeyInput.value.trim();
      const cartesiaVoice = cartesiaVoiceSelect.value === 'custom' 
        ? customCartesiaVoiceInput.value.trim() 
        : cartesiaVoiceSelect.value;

      if (!cartesiaApiKey) {
        alert('Please enter your Cartesia API Key in settings first.');
        return;
      }
      if (!cartesiaVoice) {
        alert('Please enter a Cartesia Voice ID in settings first.');
        return;
      }

      setSpeechState(true, false);
      try {
        const response = await fetch('https://api.cartesia.ai/tts/bytes', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cartesiaApiKey}`,
            'Cartesia-Version': '2024-06-10',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model_id: 'sonic-3.5',
            transcript: currentText.replace(/<[^>]*>/g, '').trim(),
            voice: {
              mode: 'id',
              id: cartesiaVoice,
            },
            output_format: {
              container: 'mp3',
              sample_rate: 44100,
              bit_rate: 128000
            },
            generation_config: {
              speed: Math.max(0.6, Math.min(1.5, parseFloat(speedRange.value))),
              volume: 1.0,
            }
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const msg = errorData.error?.message || `HTTP error! status: ${response.status}`;
          throw new Error(msg);
        }

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        audioElement = new Audio(audioUrl);
        audioElement.playbackRate = 1.0;

        audioElement.onended = () => stopSpeaking();
        audioElement.onerror = () => {
          stopSpeaking();
          alert('Error playing audio from Cartesia TTS.');
        };

        await audioElement.play();
      } catch (err) {
        console.error('Cartesia TTS error:', err);
        alert(`Failed to generate Cartesia voice: ${err.message}`);
        stopSpeaking();
      }
    }
  });

  pauseBtn.addEventListener('click', () => {
    const engine = engineSelect.value;
    if (isSpeaking && !isPaused) {
      if (engine === 'cartesia' && audioElement) {
        audioElement.pause();
      } else {
        window.speechSynthesis.pause();
      }
      isPaused = true;
      setSpeechState(true, true);
    }
  });

  stopBtn.addEventListener('click', stopSpeaking);

  function stopSpeaking() {
    if (audioElement) {
      audioElement.pause();
      audioElement = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
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
      const models = [
        'gemini-2.0-flash-thinking-exp-01-21',
        'gemini-3.5-flash',
        'gemini-2.5-flash',
        'gemini-1.5-flash-8b'
      ];
      let answer = null;
      let lastError = null;

      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const isThinkingModel = model.includes('thinking');
          
          const requestPayload = {
            contents: requestHistory,
            generationConfig: {
              temperature: isThinkingModel ? 0.7 : 0.5,
              ...(isThinkingModel ? {
                thinkingConfig: {
                  thinkingBudget: -1
                }
              } : {})
            }
          };

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errMsg = errorData.error?.message || `HTTP error ${response.status}`;
            if (errMsg.toLowerCase().includes('key not valid') || response.status === 400) {
              throw new Error(errMsg);
            }
            throw new Error(errMsg);
          }

          const data = await response.json();
          const parts = data.candidates?.[0]?.content?.parts;
          if (!parts || parts.length === 0) {
            throw new Error('API returned an empty response.');
          }

          let thoughts = '';
          let text = '';
          for (const part of parts) {
            if (part.thought || part.thoughtSignature) {
              thoughts += part.text || '';
            } else {
              text += part.text || '';
            }
          }

          if (!text && parts[0]?.text) {
            text = parts[0].text;
          }

          if (thoughts.trim()) {
            answer = `:::thought\n${thoughts.trim()}\n:::\n\n${text.trim()}`;
          } else {
            answer = text;
          }
          break;
        } catch (err) {
          console.warn(`Model ${model} failed:`, err);
          lastError = err;
          if (err.message.toLowerCase().includes('key not valid') || err.message.toLowerCase().includes('api key')) {
            throw err;
          }
        }
      }

      if (!answer) {
        throw lastError || new Error('Failed to generate response after trying all available fallback models.');
      }
      
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
  function renderMarkdown(text) {
    let thoughtHtml = '';
    let mainText = text;

    const thoughtMatch = text.match(/:::thought\n([\s\S]*?)\n:::/);
    if (thoughtMatch) {
      const thoughtContent = thoughtMatch[1]
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br />');
      
      thoughtHtml = `
        <details class="thought-process-container" style="margin-bottom: 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--background);">
          <summary class="thought-process-header" style="cursor: pointer; padding: 6px 10px; font-size: 0.75rem; font-weight: 600; color: var(--accent); display: flex; align-items: center; gap: 6px; outline: none; user-select: none;">
            <span>🧠 Thinking Process</span>
          </summary>
          <div class="thought-process-content" style="padding: 10px 12px; font-size: 0.8rem; border-top: 1px solid var(--border); color: var(--text-secondary); max-height: 200px; overflow-y: auto; line-height: 1.45; font-style: italic;">
            ${thoughtContent}
          </div>
        </details>
      `;
      mainText = text.replace(/:::thought\n([\s\S]*?)\n:::\n\n?/, '');
    }

    // Escape HTML FIRST to prevent custom tags from being escaped
    let escaped = mainText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert horizontal rules (e.g. ---, ***, ___ or ** by itself on a line) on escaped text
    escaped = escaped.replace(/^(?:---|===|\*\*\*|\*\*|___)\s*$/gm, '<hr />');

    escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Clean up any remaining raw formatting marks
    escaped = escaped.replace(/\*\*/g, '').replace(/\*/g, '');

    const lines = escaped.split('\n');
    const processedLines = lines.map(line => {
      const trimmed = line.trim();

      if (trimmed === '<hr />') {
        return trimmed;
      }
      if (trimmed.startsWith('### ')) {
        return `<h3>${trimmed.slice(4)}</h3>`;
      }
      if (trimmed.startsWith('## ')) {
        return `<h2>${trimmed.slice(3)}</h2>`;
      }
      if (trimmed.startsWith('# ')) {
        return `<h1>${trimmed.slice(2)}</h1>`;
      }

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
        return `<li class="ul-item">${trimmed.slice(2)}</li>`;
      }

      const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (numberedMatch) {
        return `<li class="ol-item">${numberedMatch[2]}</li>`;
      }

      if (trimmed.startsWith('&gt; ') || trimmed.startsWith('> ')) {
        const quoteText = trimmed.startsWith('&gt; ') ? trimmed.slice(5) : trimmed.slice(2);
        return `<blockquote>${quoteText}</blockquote>`;
      }

      if (trimmed === '') {
        return '';
      }

      // If it's a regular text line (not inside a pre block)
      if (!trimmed.startsWith('<pre>') && !trimmed.startsWith('<code>') && !trimmed.endsWith('</code>') && !trimmed.endsWith('</pre>')) {
        return `<p>${line}</p>`;
      }

      return line;
    });

    let html = '';
    let currentListType = ''; // 'ul', 'ol', or ''

    processedLines.forEach(line => {
      if (!line) return;

      const isUnordered = line.startsWith('<li class="ul-item">');
      const isOrdered = line.startsWith('<li class="ol-item">');

      if (isUnordered) {
        if (currentListType !== 'ul') {
          if (currentListType) html += `</${currentListType}>`;
          html += '<ul>';
          currentListType = 'ul';
        }
        const content = line.substring(20, line.length - 5);
        html += `<li>${content}</li>`;
      } else if (isOrdered) {
        if (currentListType !== 'ol') {
          if (currentListType) html += `</${currentListType}>`;
          html += '<ol>';
          currentListType = 'ol';
        }
        const content = line.substring(20, line.length - 5);
        html += `<li>${content}</li>`;
      } else {
        if (currentListType) {
          html += `</${currentListType}>`;
          currentListType = '';
        }
        html += line;
      }
    });

    if (currentListType) {
      html += `</${currentListType}>`;
    }

    return thoughtHtml + `<div class="markdown-body">${html}</div>`;
  }

})();
