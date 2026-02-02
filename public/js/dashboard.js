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

  function addMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = 'chat-message ' + type;
    msg.textContent = text;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    addMessage(message, 'user');
    chatInput.value = '';
    chatSend.disabled = true;
    chatSend.textContent = '...';

    try {
      const response = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          system: 'You are a helpful assistant for Asif Cosmetics. Respond in Hebrew when the user writes in Hebrew.'
        })
      });

      const data = await response.json();

      if (data.success) {
        addMessage(data.response, 'assistant');
      } else {
        addMessage('שגיאה: ' + (data.message || 'Unknown error'), 'system');
      }
    } catch (error) {
      addMessage('שגיאת חיבור: ' + error.message, 'system');
    }

    chatSend.disabled = false;
    chatSend.textContent = 'שלח';
  }

  // Button click handler
  chatSend.onclick = function(e) {
    e.preventDefault();
    sendMessage();
  };

  // Enter key handler
  chatInput.onkeydown = function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  };

  // ==========================================
  // STATUS CHECKING
  // ==========================================

  // Check Claude API Status
  async function checkClaudeStatus() {
    const statusCard = document.getElementById('statusClaude');
    if (!statusCard) return;
    const badge = statusCard.querySelector('.status-badge');
    const desc = statusCard.querySelector('.status-card-content p');

    try {
      const response = await fetch(API_BASE + '/api/chat');
      const data = await response.json();

      if (data.status === 'ready') {
        badge.textContent = 'מחובר';
        badge.className = 'status-badge connected';
        desc.textContent = 'בינה מלאכותית פעילה';
      } else {
        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
        desc.textContent = 'בינה מלאכותית';
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
    const desc = statusCard.querySelector('.status-card-content p');

    try {
      const response = await fetch(API_BASE + '/api/shopify/test');
      const data = await response.json();

      if (data.success) {
        badge.textContent = 'מחובר';
        badge.className = 'status-badge connected';
        if (data.shop && data.shop.name) {
          desc.textContent = data.shop.name;
        }
      } else {
        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
        desc.textContent = 'חנות אונליין';
      }
    } catch (error) {
      badge.textContent = 'שגיאה';
      badge.className = 'status-badge disconnected';
    }
  }

  // Check Meta Status
  async function checkMetaStatus() {
    const statusCard = document.getElementById('statusMeta');
    if (!statusCard) return;
    const badge = statusCard.querySelector('.status-badge');
    const desc = statusCard.querySelector('.status-card-content p');

    try {
      const response = await fetch(API_BASE + '/api/meta/status');
      const data = await response.json();

      if (data.connected) {
        badge.textContent = 'מחובר';
        badge.className = 'status-badge connected';
        if (data.page && data.page.name) {
          desc.textContent = data.page.name;
        }
      } else if (data.configured) {
        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
        desc.textContent = 'פייסבוק ואינסטגרם';
      } else {
        badge.textContent = 'לא מוגדר';
        badge.className = 'status-badge pending';
        desc.textContent = 'פייסבוק ואינסטגרם';
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
      checkShopifyStatus(),
      checkMetaStatus()
    ]);
  }

  // ==========================================
  // QUICK STATS
  // ==========================================

  async function loadQuickStats() {
    // Load today's orders from Shopify
    const ordersToday = document.getElementById('statOrdersToday');
    const postsMonth = document.getElementById('statPostsMonth');

    if (ordersToday) {
      try {
        const response = await fetch(API_BASE + '/api/orders');
        const data = await response.json();

        if (data.success && data.data) {
          // Count today's orders
          const today = new Date().toISOString().split('T')[0];
          const todayOrders = data.data.filter(function(order) {
            return order.created_at && order.created_at.startsWith(today);
          });
          ordersToday.textContent = todayOrders.length;
        } else {
          ordersToday.textContent = '0';
        }
      } catch (error) {
        ordersToday.textContent = '--';
      }
    }

    // Posts this month (placeholder for now)
    if (postsMonth) {
      postsMonth.textContent = '0';
    }
  }

  // ==========================================
  // CREATIVE PANEL - SOCIAL POSTING
  // ==========================================

  const postContent = document.getElementById('postContent');
  const postImageUrl = document.getElementById('postImageUrl');
  const postFacebook = document.getElementById('postFacebook');
  const postInstagram = document.getElementById('postInstagram');
  const postResult = document.getElementById('postResult');

  function showPostResult(message, isError) {
    if (!postResult) return;
    postResult.textContent = message;
    postResult.className = 'post-result ' + (isError ? 'error' : 'success');
    postResult.style.display = 'block';
    setTimeout(function() {
      postResult.style.display = 'none';
    }, 5000);
  }

  // Post to Facebook
  if (postFacebook) {
    postFacebook.onclick = async function() {
      const message = postContent ? postContent.value.trim() : '';
      const imageUrl = postImageUrl ? postImageUrl.value.trim() : '';

      if (!message) {
        showPostResult('נא להזין תוכן לפוסט', true);
        return;
      }

      postFacebook.disabled = true;
      postFacebook.textContent = 'מפרסם...';

      try {
        const body = { message };
        if (imageUrl) body.imageUrl = imageUrl;

        const response = await fetch(API_BASE + '/api/meta/facebook/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.success) {
          showPostResult('הפוסט פורסם בהצלחה בפייסבוק!', false);
          postContent.value = '';
          postImageUrl.value = '';
        } else {
          showPostResult('שגיאה: ' + (data.message || 'לא ניתן לפרסם'), true);
        }
      } catch (error) {
        showPostResult('שגיאת חיבור: ' + error.message, true);
      }

      postFacebook.disabled = false;
      postFacebook.textContent = 'פרסם בפייסבוק';
    };
  }

  // Post to Instagram
  if (postInstagram) {
    postInstagram.onclick = async function() {
      const caption = postContent ? postContent.value.trim() : '';
      const imageUrl = postImageUrl ? postImageUrl.value.trim() : '';

      if (!imageUrl) {
        showPostResult('נא להזין כתובת תמונה (חובה לאינסטגרם)', true);
        return;
      }

      postInstagram.disabled = true;
      postInstagram.textContent = 'מפרסם...';

      try {
        const response = await fetch(API_BASE + '/api/meta/instagram/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl, caption })
        });

        const data = await response.json();

        if (data.success) {
          showPostResult('הפוסט פורסם בהצלחה באינסטגרם!', false);
          postContent.value = '';
          postImageUrl.value = '';
        } else {
          showPostResult('שגיאה: ' + (data.message || 'לא ניתן לפרסם'), true);
        }
      } catch (error) {
        showPostResult('שגיאת חיבור: ' + error.message, true);
      }

      postInstagram.disabled = false;
      postInstagram.textContent = 'פרסם באינסטגרם';
    };
  }

  // ==========================================
  // SETTINGS PAGE - LOAD CONNECTION STATUS
  // ==========================================

  async function loadSettingsStatus() {
    // Claude status
    const claudeStatus = document.getElementById('settingsClaudeStatus');
    if (claudeStatus) {
      try {
        const response = await fetch(API_BASE + '/api/chat');
        const data = await response.json();
        if (data.status === 'ready') {
          claudeStatus.innerHTML = '<span class="status-badge connected">מחובר</span>';
        } else {
          claudeStatus.innerHTML = '<span class="status-badge disconnected">לא מחובר</span>';
        }
      } catch (error) {
        claudeStatus.innerHTML = '<span class="status-badge disconnected">שגיאה</span>';
      }
    }

    // Shopify status
    const shopifyStatus = document.getElementById('settingsShopifyStatus');
    if (shopifyStatus) {
      try {
        const response = await fetch(API_BASE + '/api/shopify/test');
        const data = await response.json();
        if (data.success) {
          const shopName = data.shop && data.shop.name ? data.shop.name : 'מחובר';
          shopifyStatus.innerHTML = '<span class="status-badge connected">' + shopName + '</span>';
        } else {
          shopifyStatus.innerHTML = '<span class="status-badge disconnected">לא מחובר</span>';
        }
      } catch (error) {
        shopifyStatus.innerHTML = '<span class="status-badge disconnected">שגיאה</span>';
      }
    }

    // Meta status
    const metaStatus = document.getElementById('settingsMetaStatus');
    if (metaStatus) {
      try {
        const response = await fetch(API_BASE + '/api/meta/status');
        const data = await response.json();
        if (data.connected) {
          const pageName = data.page && data.page.name ? data.page.name : 'מחובר';
          metaStatus.innerHTML = '<span class="status-badge connected">' + pageName + '</span>';
        } else if (data.configured) {
          metaStatus.innerHTML = '<span class="status-badge disconnected">לא מחובר</span>';
        } else {
          metaStatus.innerHTML = '<span class="status-badge pending">לא מוגדר</span>';
        }
      } catch (error) {
        metaStatus.innerHTML = '<span class="status-badge disconnected">שגיאה</span>';
      }
    }
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  // Initial load
  checkAllStatuses();
  loadQuickStats();
  loadSettingsStatus();

  // Auto-refresh every 30 seconds
  setInterval(function() {
    checkAllStatuses();
    loadQuickStats();
  }, 30000);

  console.log('Dashboard initialized with auto-refresh');
});
