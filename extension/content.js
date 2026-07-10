(function() {
  let floatButton = null;
  let sidebarIframe = null;
  let lastSelectedText = '';

  // Listen for selection changes on the webpage
  document.addEventListener('mouseup', handleSelection);
  document.addEventListener('keyup', handleSelection);

  // Click away to close floating button
  document.addEventListener('mousedown', (e) => {
    if (floatButton && !floatButton.contains(e.target)) {
      // Small delay to check if we are selecting new text
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          hideFloatButton();
        }
      }, 100);
    }
  });

  function handleSelection(e) {
    // Avoid triggering when clicking within our button or active sidebar
    if (floatButton && floatButton.contains(e.target)) return;
    if (sidebarIframe && sidebarIframe.contains(e.target)) return;

    // Small delay to ensure selection details are updated
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        hideFloatButton();
        return;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText) {
        hideFloatButton();
        return;
      }

      lastSelectedText = selectedText;

      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Calculate coordinates to place the floating bubble
        const top = rect.bottom + window.scrollY + 6;
        const left = rect.left + rect.width / 2 + window.scrollX;

        showFloatButton(top, left);
      } catch (err) {
        console.error('Error positioning float button:', err);
      }
    }, 50);
  }

  function showFloatButton(top, left) {
    if (!floatButton) {
      floatButton = document.createElement('div');
      floatButton.id = 'readit-float-btn';
      // Style float button
      floatButton.style.position = 'absolute';
      floatButton.style.zIndex = '2147483646';
      floatButton.style.width = '30px';
      floatButton.style.height = '30px';
      floatButton.style.borderRadius = '50%';
      floatButton.style.background = 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)';
      floatButton.style.color = '#ffffff';
      floatButton.style.display = 'flex';
      floatButton.style.alignItems = 'center';
      floatButton.style.justifyContent = 'center';
      floatButton.style.cursor = 'pointer';
      floatButton.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.4)';
      floatButton.style.border = '1px solid rgba(255, 255, 255, 0.2)';
      floatButton.style.transition = 'transform 0.15s ease';
      
      // Minimal inner icon (book symbol)
      floatButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
          <path d="M6 6h10M6 10h10"/>
        </svg>
      `;

      // Hover scale
      floatButton.addEventListener('mouseenter', () => {
        floatButton.style.transform = 'scale(1.1)';
      });
      floatButton.addEventListener('mouseleave', () => {
        floatButton.style.transform = 'scale(1.0)';
      });

      // Click to open sidebar
      floatButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openSidebar(lastSelectedText);
        hideFloatButton();
      });

      document.body.appendChild(floatButton);
    }

    floatButton.style.top = `${top}px`;
    floatButton.style.left = `${left - 15}px`; // center button horizontally
    floatButton.style.display = 'flex';
  }

  function hideFloatButton() {
    if (floatButton) {
      floatButton.style.display = 'none';
    }
  }

  function openSidebar(text) {
    if (!sidebarIframe) {
      sidebarIframe = document.createElement('iframe');
      sidebarIframe.id = 'readit-sidebar-iframe';
      sidebarIframe.src = chrome.runtime.getURL('sidebar.html');
      
      // Style iframe
      sidebarIframe.style.position = 'fixed';
      sidebarIframe.style.top = '0';
      sidebarIframe.style.right = '0';
      sidebarIframe.style.width = '380px';
      sidebarIframe.style.height = '100vh';
      sidebarIframe.style.zIndex = '2147483647';
      sidebarIframe.style.border = 'none';
      sidebarIframe.style.boxShadow = '-8px 0 32px rgba(0, 0, 0, 0.4)';
      sidebarIframe.style.transform = 'translateX(100%)';
      sidebarIframe.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

      document.body.appendChild(sidebarIframe);

      // Slide in transition after appending
      setTimeout(() => {
        sidebarIframe.style.transform = 'translateX(0)';
      }, 50);
    } else {
      sidebarIframe.style.transform = 'translateX(0)';
    }

    // Wait for iframe to load or message immediately if loaded
    sidebarIframe.addEventListener('load', () => {
      sendTextToSidebar(text);
    });

    sendTextToSidebar(text);
  }

  function sendTextToSidebar(text) {
    if (sidebarIframe && sidebarIframe.contentWindow) {
      sidebarIframe.contentWindow.postMessage({
        type: 'SET_TEXT',
        text: text
      }, '*');
    }
  }

  // Listen for close message from the sidebar iframe
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'CLOSE_SIDEBAR') {
      if (sidebarIframe) {
        sidebarIframe.style.transform = 'translateX(100%)';
      }
    }
  });

})();
