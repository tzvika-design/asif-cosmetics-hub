// Asif Cosmetics Hub - Dashboard JavaScript
// External file to comply with CSP

document.addEventListener('DOMContentLoaded', function() {
  // API Base URL
  const API_BASE = window.location.origin;

  // Page Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page');
  const pageTitle = document.getElementById('pageTitle');

  const pageTitles = {
    'dashboard': 'דשבורד ראשי',
    'creative': 'קריאטיב',
    'sales': 'מכירות',
    'marketing': 'שיווק',
    'inventory': 'מלאי',
    'shopify': 'Shopify',
    'settings': 'הגדרות'
  };

  navItems.forEach(function(item) {
    item.addEventListener('click', function() {
      const page = item.dataset.page;
      if (!page) return;

      // Update nav
      navItems.forEach(function(n) { n.classList.remove('active'); });
      item.classList.add('active');

      // Update page
      pages.forEach(function(p) { p.classList.remove('active'); });
      document.getElementById('page-' + page).classList.add('active');

      // Update title
      pageTitle.textContent = pageTitles[page] || 'דשבורד';
    });
  });

  // Chat Functionality
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');
  const chatMessages = document.getElementById('chatMessages');

  console.log('Chat elements:', { chatInput, chatSend, chatMessages });

  function addMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = 'chat-message ' + type;
    msg.textContent = text;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function sendMessage() {
    console.log('sendMessage called');
    const message = chatInput.value.trim();
    console.log('Message:', message);

    if (!message) {
      console.log('Empty message, returning');
      return;
    }

    // Add user message
    addMessage(message, 'user');
    chatInput.value = '';
    chatSend.disabled = true;
    chatSend.textContent = '...';

    try {
      console.log('Sending to API:', API_BASE + '/api/chat');
      const response = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          system: 'You are a helpful assistant for Asif Cosmetics. Respond in Hebrew when the user writes in Hebrew.'
        })
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (data.success) {
        addMessage(data.response, 'assistant');
      } else {
        addMessage('שגיאה: ' + (data.message || 'Unknown error'), 'system');
      }
    } catch (error) {
      console.error('Fetch error:', error);
      addMessage('שגיאת חיבור: ' + error.message, 'system');
    }

    chatSend.disabled = false;
    chatSend.textContent = 'שלח';
  }

  // Button click handler
  chatSend.onclick = function(e) {
    console.log('Button clicked');
    e.preventDefault();
    sendMessage();
  };

  // Enter key handler
  chatInput.onkeydown = function(e) {
    if (e.key === 'Enter') {
      console.log('Enter pressed');
      e.preventDefault();
      sendMessage();
    }
  };

  // Check Claude API Status
  async function checkClaudeStatus() {
    const statusCard = document.getElementById('statusClaude');
    if (!statusCard) return;
    const badge = statusCard.querySelector('.status-badge');

    try {
      const response = await fetch(API_BASE + '/api/chat');
      const data = await response.json();

      if (data.status === 'ready') {
        badge.textContent = 'מחובר';
        badge.className = 'status-badge connected';
      } else {
        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
      }
    } catch (error) {
      badge.textContent = 'שגיאה';
      badge.className = 'status-badge disconnected';
    }
  }

  // Check Shopify Status
  async function checkShopifyStatus() {
    const statusCard = document.getElementById('statusShopify');
    if (!statusCard) return;
    const badge = statusCard.querySelector('.status-badge');

    try {
      const response = await fetch(API_BASE + '/api/shopify/test');
      const data = await response.json();

      if (data.success) {
        badge.textContent = 'מחובר';
        badge.className = 'status-badge connected';
        // Update shop name if available
        const shopName = statusCard.querySelector('.status-card-content p');
        if (shopName && data.shop && data.shop.name) {
          shopName.textContent = data.shop.name;
        }
      } else {
        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
      }
    } catch (error) {
      badge.textContent = 'שגיאה';
      badge.className = 'status-badge disconnected';
    }
  }

  // Check all service statuses
  async function checkAllStatuses() {
    await Promise.all([
      checkClaudeStatus(),
      checkShopifyStatus()
    ]);
  }

  // Settings
  const saveSettings = document.getElementById('saveSettings');
  if (saveSettings) {
    saveSettings.onclick = function() {
      alert('ההגדרות נשמרו!\n\nשים לב: הגדרות אלו צריכות להיקבע גם בסביבת השרת (Railway).');
    };
  }

  // Initialize
  checkAllStatuses();
  console.log('Dashboard initialized');
});
