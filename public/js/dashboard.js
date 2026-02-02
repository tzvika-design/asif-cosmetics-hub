// Asif Cosmetics Hub - Dashboard JavaScript
// External file to comply with CSP

document.addEventListener('DOMContentLoaded', function() {
  console.log('=== Dashboard Loading ===');

  // API Base URL
  const API_BASE = window.location.origin;
  console.log('API_BASE:', API_BASE);

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

      navItems.forEach(function(n) { n.classList.remove('active'); });
      item.classList.add('active');

      pages.forEach(function(p) { p.classList.remove('active'); });
      document.getElementById('page-' + page).classList.add('active');

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

  chatSend.onclick = function(e) {
    e.preventDefault();
    sendMessage();
  };

  chatInput.onkeydown = function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  };

  // ==========================================
  // STATUS CHECKING WITH DEBUG
  // ==========================================

  // Check Claude API Status
  async function checkClaudeStatus() {
    console.log('Checking Claude status...');

    const statusCard = document.getElementById('statusClaude');
    console.log('statusClaude element:', statusCard);

    if (!statusCard) {
      console.error('Claude status card not found!');
      return;
    }

    const badge = statusCard.querySelector('.status-badge');
    const desc = statusCard.querySelector('.status-card-content p');
    console.log('Badge element:', badge);
    console.log('Desc element:', desc);

    try {
      console.log('Fetching:', API_BASE + '/api/chat');
      const response = await fetch(API_BASE + '/api/chat');
      console.log('Claude response status:', response.status);

      const data = await response.json();
      console.log('Claude data:', data);

      if (data.status === 'ready') {
        console.log('Claude is ready - updating badge');
        badge.textContent = '✓ מחובר';
        badge.className = 'status-badge connected';
        if (desc) desc.textContent = 'בינה מלאכותית פעילה';
      } else {
        console.log('Claude not ready');
        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
      }
    } catch (error) {
      console.error('Claude status error:', error);
      badge.textContent = 'שגיאה';
      badge.className = 'status-badge disconnected';
    }
  }

  // Check Shopify Status
  async function checkShopifyStatus() {
    console.log('Checking Shopify status...');

    const statusCard = document.getElementById('statusShopify');
    console.log('statusShopify element:', statusCard);

    if (!statusCard) {
      console.error('Shopify status card not found!');
      return;
    }

    const badge = statusCard.querySelector('.status-badge');
    const desc = statusCard.querySelector('.status-card-content p');

    try {
      console.log('Fetching:', API_BASE + '/api/shopify/test');
      const response = await fetch(API_BASE + '/api/shopify/test');
      console.log('Shopify response status:', response.status);

      const data = await response.json();
      console.log('Shopify data:', data);

      if (data.success) {
        console.log('Shopify connected - updating badge');
        badge.textContent = '✓ מחובר';
        badge.className = 'status-badge connected';
        if (desc && data.shop && data.shop.name) {
          desc.textContent = data.shop.name;
        }
      } else {
        console.log('Shopify not connected');
        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
        if (desc) desc.textContent = 'חנות אונליין';
      }
    } catch (error) {
      console.error('Shopify status error:', error);
      badge.textContent = 'שגיאה';
      badge.className = 'status-badge disconnected';
    }
  }

  // Check Meta Status
  async function checkMetaStatus() {
    console.log('Checking Meta status...');

    const statusCard = document.getElementById('statusMeta');
    console.log('statusMeta element:', statusCard);

    if (!statusCard) {
      console.error('Meta status card not found!');
      return;
    }

    const badge = statusCard.querySelector('.status-badge');
    const desc = statusCard.querySelector('.status-card-content p');

    try {
      console.log('Fetching:', API_BASE + '/api/meta/status');
      const response = await fetch(API_BASE + '/api/meta/status');
      console.log('Meta response status:', response.status);

      const data = await response.json();
      console.log('Meta data:', data);

      if (data.connected) {
        console.log('Meta connected - updating badge');
        badge.textContent = '✓ מחובר';
        badge.className = 'status-badge connected';
        if (desc && data.page && data.page.name) {
          desc.textContent = data.page.name;
        }
      } else if (data.configured) {
        console.log('Meta configured but not connected');
        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
      } else {
        console.log('Meta not configured');
        badge.textContent = 'לא מוגדר';
        badge.className = 'status-badge pending';
      }
    } catch (error) {
      console.error('Meta status error:', error);
      badge.textContent = 'שגיאה';
      badge.className = 'status-badge disconnected';
    }
  }

  // Check all statuses
  async function checkAllStatuses() {
    console.log('=== Checking all statuses ===');
    try {
      await checkClaudeStatus();
      await checkShopifyStatus();
      await checkMetaStatus();
      console.log('=== All statuses checked ===');
    } catch (error) {
      console.error('Error checking statuses:', error);
    }
  }

  // ==========================================
  // QUICK STATS
  // ==========================================

  async function loadQuickStats() {
    console.log('Loading quick stats...');
    const ordersToday = document.getElementById('statOrdersToday');
    const postsMonth = document.getElementById('statPostsMonth');

    if (ordersToday) {
      try {
        const response = await fetch(API_BASE + '/api/orders');
        const data = await response.json();
        console.log('Orders data:', data);

        if (data.success && data.data) {
          const today = new Date().toISOString().split('T')[0];
          const todayOrders = data.data.filter(function(order) {
            return order.created_at && order.created_at.startsWith(today);
          });
          ordersToday.textContent = todayOrders.length;
        } else {
          ordersToday.textContent = '0';
        }
      } catch (error) {
        console.error('Orders error:', error);
        ordersToday.textContent = '--';
      }
    }

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
  // SETTINGS PAGE - CONNECTION STATUS
  // ==========================================

  async function loadSettingsStatus() {
    console.log('Loading settings status...');

    const claudeStatus = document.getElementById('settingsClaudeStatus');
    const shopifyStatus = document.getElementById('settingsShopifyStatus');
    const metaStatus = document.getElementById('settingsMetaStatus');

    if (claudeStatus) {
      try {
        const response = await fetch(API_BASE + '/api/chat');
        const data = await response.json();
        if (data.status === 'ready') {
          claudeStatus.innerHTML = '<span class="status-badge connected">✓ מחובר</span>';
        } else {
          claudeStatus.innerHTML = '<span class="status-badge disconnected">לא מחובר</span>';
        }
      } catch (error) {
        claudeStatus.innerHTML = '<span class="status-badge disconnected">שגיאה</span>';
      }
    }

    if (shopifyStatus) {
      try {
        const response = await fetch(API_BASE + '/api/shopify/test');
        const data = await response.json();
        if (data.success) {
          const shopName = data.shop && data.shop.name ? data.shop.name : 'מחובר';
          shopifyStatus.innerHTML = '<span class="status-badge connected">✓ ' + shopName + '</span>';
        } else {
          shopifyStatus.innerHTML = '<span class="status-badge disconnected">לא מחובר</span>';
        }
      } catch (error) {
        shopifyStatus.innerHTML = '<span class="status-badge disconnected">שגיאה</span>';
      }
    }

    if (metaStatus) {
      try {
        const response = await fetch(API_BASE + '/api/meta/status');
        const data = await response.json();
        if (data.connected) {
          const pageName = data.page && data.page.name ? data.page.name : 'מחובר';
          metaStatus.innerHTML = '<span class="status-badge connected">✓ ' + pageName + '</span>';
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

  console.log('Starting initialization...');

  // Run status checks immediately
  checkAllStatuses();
  loadQuickStats();
  loadSettingsStatus();

  // Auto-refresh every 30 seconds
  setInterval(function() {
    console.log('Auto-refresh triggered');
    checkAllStatuses();
    loadQuickStats();
  }, 30000);

  console.log('=== Dashboard Fully Initialized ===');
});
