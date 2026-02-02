// Asif Cosmetics Hub - Dashboard JavaScript
// Comprehensive dashboard with all features

document.addEventListener('DOMContentLoaded', function() {
  const API_BASE = window.location.origin;

  // Inject loading spinner CSS if not already present
  if (!document.getElementById('dashboard-spinner-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'dashboard-spinner-styles';
    styleSheet.textContent = `
      .spinner {
        width: 30px;
        height: 30px;
        border: 3px solid var(--border, #333);
        border-top-color: var(--accent, #d4a853);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 20px;
        color: var(--text-muted, #888);
      }
      .kpi-loading {
        color: var(--text-muted, #888);
        animation: pulse 1s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .period-btn.active {
        background: var(--accent, #d4a853) !important;
        color: var(--bg, #000) !important;
      }
      .period-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(styleSheet);
  }

  // Store for recent posts
  let recentPosts = JSON.parse(localStorage.getItem('recentPosts') || '[]');
  let products = [];

  // ==========================================
  // PAGE NAVIGATION
  // ==========================================

  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page');
  const pageTitle = document.getElementById('pageTitle');

  const pageTitles = {
    'dashboard': 'דשבורד ראשי',
    'publish': 'פרסום ברשתות',
    'creative-agent': 'סוכן קריאטיב',
    'shopify-analytics': '📊 דוחות מכירות',
    'shopify-customers': '👥 לקוחות',
    'shopify-products': 'מוצרים מובילים',
    'shopify-coupons': 'קופונים',
    'settings': 'הגדרות'
  };

  navItems.forEach(function(item) {
    item.addEventListener('click', function() {
      const page = item.dataset.page;
      if (!page) return;

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      pages.forEach(p => p.classList.remove('active'));
      const pageEl = document.getElementById('page-' + page);
      if (pageEl) pageEl.classList.add('active');

      pageTitle.textContent = pageTitles[page] || 'דשבורד';

      // Load page-specific data
      if (page === 'shopify-analytics') loadMetorikAnalytics();
      if (page === 'shopify-customers') loadCustomersPage();
      if (page === 'shopify-products') loadTopProducts();
      if (page === 'shopify-coupons') loadCoupons();
      if (page === 'creative-agent') loadProducts();
      if (page === 'publish') renderRecentPosts('publishedPostsList');
    });
  });

  // ==========================================
  // STATUS CHECKING
  // ==========================================

  async function checkClaudeStatus() {
    const statusCard = document.getElementById('statusClaude');
    if (!statusCard) return;
    const badge = statusCard.querySelector('.status-badge');
    const desc = statusCard.querySelector('.status-card-content p');

    try {
      const response = await fetch(API_BASE + '/api/chat');
      const data = await response.json();

      if (data.status === 'ready') {
        badge.textContent = '✓ מחובר';
        badge.className = 'status-badge connected';
        if (desc) desc.textContent = 'בינה מלאכותית פעילה';
      } else {
        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
      }
    } catch (error) {
      badge.textContent = 'שגיאה';
      badge.className = 'status-badge disconnected';
    }
  }

  async function checkShopifyStatus() {
    const statusCard = document.getElementById('statusShopify');
    if (!statusCard) return;
    const badge = statusCard.querySelector('.status-badge');
    const desc = statusCard.querySelector('.status-card-content p');

    try {
      const response = await fetch(API_BASE + '/api/shopify/test');

      // Handle HTTP errors
      if (!response.ok) {
        // Try fallback - if analytics works, Shopify is connected
        try {
          const analyticsResponse = await fetch(API_BASE + '/api/shopify/analytics');
          const analyticsData = await analyticsResponse.json();
          if (analyticsData.success) {
            badge.textContent = '✓ מחובר';
            badge.className = 'status-badge connected';
            if (desc) desc.textContent = 'Shopify Store';
            return;
          }
        } catch (e) { /* fallback failed */ }

        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
        return;
      }

      const data = await response.json();

      if (data.success) {
        badge.textContent = '✓ מחובר';
        badge.className = 'status-badge connected';
        if (desc && data.shop && data.shop.name) {
          desc.textContent = data.shop.name;
        }
      } else if (data.error) {
        // API returned error - try fallback
        try {
          const analyticsResponse = await fetch(API_BASE + '/api/shopify/analytics');
          const analyticsData = await analyticsResponse.json();
          if (analyticsData.success) {
            badge.textContent = '✓ מחובר';
            badge.className = 'status-badge connected';
            if (desc) desc.textContent = 'Shopify Store';
            return;
          }
        } catch (e) { /* fallback failed */ }

        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
      } else {
        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
      }
    } catch (error) {
      console.error('Shopify status check error:', error);
      badge.textContent = 'שגיאה';
      badge.className = 'status-badge disconnected';
    }
  }

  async function checkMetaStatus() {
    const statusCard = document.getElementById('statusMeta');
    if (!statusCard) return;
    const badge = statusCard.querySelector('.status-badge');
    const desc = statusCard.querySelector('.status-card-content p');

    try {
      const response = await fetch(API_BASE + '/api/meta/status');

      // Handle HTTP errors
      if (!response.ok) {
        console.error('Meta status HTTP error:', response.status);
        badge.textContent = 'שגיאה';
        badge.className = 'status-badge disconnected';
        return;
      }

      const data = await response.json();
      console.log('Meta status response:', data);

      // Check if connected - handle both boolean and truthy values
      if (data.connected) {
        badge.textContent = '✓ מחובר';
        badge.className = 'status-badge connected';
        if (desc) {
          if (data.page && data.page.name) {
            desc.textContent = data.page.name;
          } else {
            desc.textContent = 'Meta Business';
          }
        }
      } else if (data.configured) {
        // Has config but API call failed
        badge.textContent = 'טוקן לא תקין';
        badge.className = 'status-badge disconnected';
        if (desc && data.error) {
          desc.textContent = data.error.substring(0, 50);
        }
      } else {
        badge.textContent = 'לא מוגדר';
        badge.className = 'status-badge pending';
      }
    } catch (error) {
      console.error('Meta status check error:', error);
      badge.textContent = 'שגיאה';
      badge.className = 'status-badge disconnected';
    }
  }

  async function checkAllStatuses() {
    await Promise.all([checkClaudeStatus(), checkShopifyStatus(), checkMetaStatus()]);
  }

  // ==========================================
  // QUICK STATS (Dashboard)
  // ==========================================

  async function loadQuickStats() {
    try {
      // Use the new summary endpoint with calendar week and month
      const [weekResponse, monthResponse] = await Promise.all([
        fetch(API_BASE + '/api/shopify/analytics/summary?period=week'),
        fetch(API_BASE + '/api/shopify/analytics/summary?period=month')
      ]);

      const weekData = await weekResponse.json();
      const monthData = await monthResponse.json();

      const el = (id) => document.getElementById(id);

      // Today's orders - from month response which includes todayOrders
      if (monthData.success) {
        if (el('statOrdersToday')) el('statOrdersToday').textContent = monthData.data.todayOrders || 0;
        // Month sales - calendar month (from 1st of month)
        if (el('statSalesMonth')) el('statSalesMonth').textContent = formatCurrency(monthData.data.totalSales || 0);
      }

      // Week orders - calendar week (from Sunday)
      if (weekData.success) {
        if (el('statOrdersWeek')) el('statOrdersWeek').textContent = weekData.data.orderCount || 0;
      }

      console.log('Quick stats loaded: Today orders:', monthData.data?.todayOrders,
                  'Week orders:', weekData.data?.orderCount,
                  'Month sales:', monthData.data?.totalSales);
    } catch (error) {
      console.error('Stats error:', error);
    }

    // Posts count
    const postsMonth = document.getElementById('statPostsMonth');
    if (postsMonth) postsMonth.textContent = recentPosts.length;
  }

  // ==========================================
  // CHAT FUNCTIONALITY
  // ==========================================

  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');
  const chatMessages = document.getElementById('chatMessages');

  function addMessage(text, type) {
    if (!chatMessages) return;
    const msg = document.createElement('div');
    msg.className = 'chat-message ' + type;
    msg.textContent = text;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function sendChatMessage() {
    if (!chatInput) return;
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
          system: 'You are a helpful assistant for Asif Cosmetics. Respond in Hebrew.'
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

  if (chatSend) chatSend.onclick = sendChatMessage;
  if (chatInput) chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendChatMessage(); };

  // ==========================================
  // SOCIAL PUBLISHING
  // ==========================================

  const postContent = document.getElementById('postContent');
  const postImageUrl = document.getElementById('postImageUrl');
  const publishFacebook = document.getElementById('publishFacebook');
  const publishInstagram = document.getElementById('publishInstagram');
  const btnPublishNow = document.getElementById('btnPublishNow');
  const btnClaudeWrite = document.getElementById('btnClaudeWrite');
  const publishResult = document.getElementById('publishResult');

  function showPublishResult(message, isError) {
    if (!publishResult) return;
    publishResult.textContent = message;
    publishResult.className = 'result-message ' + (isError ? 'error' : 'success');
    setTimeout(() => { publishResult.className = 'result-message'; }, 5000);
  }

  function addRecentPost(platform, content) {
    recentPosts.unshift({
      platform,
      content: content.substring(0, 100),
      time: new Date().toISOString()
    });
    if (recentPosts.length > 10) recentPosts.pop();
    localStorage.setItem('recentPosts', JSON.stringify(recentPosts));
    renderRecentPosts('recentPostsList');
    renderRecentPosts('publishedPostsList');

    const postsMonth = document.getElementById('statPostsMonth');
    if (postsMonth) postsMonth.textContent = recentPosts.length;
  }

  function renderRecentPosts(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (recentPosts.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">אין פוסטים אחרונים</p>';
      return;
    }

    container.innerHTML = recentPosts.slice(0, 5).map(post => `
      <div class="recent-post">
        <div class="recent-post-icon ${post.platform}">${post.platform === 'facebook' ? '📘' : '📷'}</div>
        <div class="recent-post-content">
          <div class="recent-post-text">${post.content}...</div>
          <div class="recent-post-time">${formatTimeAgo(post.time)}</div>
        </div>
      </div>
    `).join('');
  }

  if (btnPublishNow) {
    btnPublishNow.onclick = async function() {
      const content = postContent ? postContent.value.trim() : '';
      const imageUrl = postImageUrl ? postImageUrl.value.trim() : '';
      const toFacebook = publishFacebook ? publishFacebook.checked : false;
      const toInstagram = publishInstagram ? publishInstagram.checked : false;

      if (!content) {
        showPublishResult('נא להזין תוכן לפוסט', true);
        return;
      }

      if (!toFacebook && !toInstagram) {
        showPublishResult('נא לבחור לפחות פלטפורמה אחת', true);
        return;
      }

      if (toInstagram && !imageUrl) {
        showPublishResult('נדרשת תמונה לפרסום באינסטגרם', true);
        return;
      }

      btnPublishNow.disabled = true;
      btnPublishNow.textContent = '📤 מפרסם...';

      let results = [];

      if (toFacebook) {
        try {
          const body = { message: content };
          if (imageUrl) body.imageUrl = imageUrl;

          const response = await fetch(API_BASE + '/api/meta/facebook/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const data = await response.json();
          if (data.success) {
            results.push('✓ פייסבוק');
            addRecentPost('facebook', content);
          } else {
            results.push('✗ פייסבוק: ' + data.message);
          }
        } catch (e) {
          results.push('✗ פייסבוק: שגיאת חיבור');
        }
      }

      if (toInstagram) {
        try {
          const response = await fetch(API_BASE + '/api/meta/instagram/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl, caption: content })
          });
          const data = await response.json();
          if (data.success) {
            results.push('✓ אינסטגרם');
            addRecentPost('instagram', content);
          } else {
            results.push('✗ אינסטגרם: ' + data.message);
          }
        } catch (e) {
          results.push('✗ אינסטגרם: שגיאת חיבור');
        }
      }

      const hasError = results.some(r => r.startsWith('✗'));
      showPublishResult(results.join(' | '), hasError);

      if (!hasError) {
        postContent.value = '';
        postImageUrl.value = '';
      }

      btnPublishNow.disabled = false;
      btnPublishNow.textContent = '📤 פרסם עכשיו';
    };
  }

  if (btnClaudeWrite) {
    btnClaudeWrite.onclick = async function() {
      btnClaudeWrite.disabled = true;
      btnClaudeWrite.textContent = '🤖 כותב...';

      try {
        const response = await fetch(API_BASE + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'כתוב פוסט קצר ומושך לרשתות החברתיות עבור חנות בשמים וקוסמטיקה בשם אסיף קוסמטיקס. הפוסט צריך להיות בעברית, מקסימום 3 משפטים, עם אימוג\'י מתאימים.',
            system: 'You are a social media copywriter for Asif Cosmetics, a perfume and cosmetics store. Write engaging Hebrew posts.'
          })
        });

        const data = await response.json();
        if (data.success && postContent) {
          postContent.value = data.response;
          showPublishResult('התוכן נוצר בהצלחה!', false);
        } else {
          showPublishResult('שגיאה ביצירת תוכן', true);
        }
      } catch (e) {
        showPublishResult('שגיאת חיבור', true);
      }

      btnClaudeWrite.disabled = false;
      btnClaudeWrite.textContent = '🤖 Claude יכתוב לי';
    };
  }

  // ==========================================
  // CREATIVE AGENT
  // ==========================================

  const productSelect = document.getElementById('productSelect');
  const selectedProductInfo = document.getElementById('selectedProductInfo');
  const btnGeneratePost = document.getElementById('btnGeneratePost');
  const btnGenerateScript = document.getElementById('btnGenerateScript');
  const generatedContent = document.getElementById('generatedContent');
  const btnUseContent = document.getElementById('btnUseContent');

  async function loadProducts() {
    if (!productSelect || products.length > 0) return;

    try {
      const response = await fetch(API_BASE + '/api/shopify/products');
      const data = await response.json();

      if (data.success) {
        products = data.data;
        productSelect.innerHTML = '<option value="">-- בחר מוצר --</option>' +
          products.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
      }
    } catch (e) {
      console.error('Error loading products:', e);
    }
  }

  if (productSelect) {
    productSelect.onchange = function() {
      const productId = this.value;
      const product = products.find(p => p.id == productId);

      if (product && selectedProductInfo) {
        document.getElementById('selectedProductImage').src = product.image || '';
        document.getElementById('selectedProductTitle').textContent = product.title;
        document.getElementById('selectedProductPrice').textContent = '₪' + product.price;
        document.getElementById('selectedProductDesc').textContent = product.description || '';
        selectedProductInfo.style.display = 'block';
      } else if (selectedProductInfo) {
        selectedProductInfo.style.display = 'none';
      }
    };
  }

  if (btnGeneratePost) {
    btnGeneratePost.onclick = async function() {
      const productId = productSelect ? productSelect.value : '';
      const product = products.find(p => p.id == productId);

      if (!product) {
        alert('נא לבחור מוצר');
        return;
      }

      btnGeneratePost.disabled = true;
      btnGeneratePost.textContent = '📝 יוצר...';

      try {
        const response = await fetch(API_BASE + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `כתוב פוסט מושך לרשתות החברתיות עבור המוצר הבא:
            שם: ${product.title}
            מחיר: ₪${product.price}
            תיאור: ${product.description || 'מוצר איכותי מבית אסיף קוסמטיקס'}

            הפוסט צריך להיות בעברית, 2-3 משפטים, עם אימוג'י מתאימים.`,
            system: 'You are a social media copywriter for Asif Cosmetics. Write engaging Hebrew posts for their products.'
          })
        });

        const data = await response.json();
        if (data.success && generatedContent) {
          generatedContent.value = data.response;
        }
      } catch (e) {
        alert('שגיאה ביצירת תוכן');
      }

      btnGeneratePost.disabled = false;
      btnGeneratePost.textContent = '📝 צור פוסט למוצר';
    };
  }

  if (btnGenerateScript) {
    btnGenerateScript.onclick = async function() {
      const productId = productSelect ? productSelect.value : '';
      const product = products.find(p => p.id == productId);

      if (!product) {
        alert('נא לבחור מוצר');
        return;
      }

      btnGenerateScript.disabled = true;
      btnGenerateScript.textContent = '🎬 יוצר...';

      try {
        const response = await fetch(API_BASE + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `כתוב תסריט קצר לסרטון TikTok/Reels עבור המוצר:
            שם: ${product.title}
            מחיר: ₪${product.price}

            התסריט צריך להיות בעברית, 30-60 שניות, עם הוראות בימוי פשוטות.`,
            system: 'You are a video script writer. Write short, engaging video scripts in Hebrew for social media.'
          })
        });

        const data = await response.json();
        if (data.success && generatedContent) {
          generatedContent.value = data.response;
        }
      } catch (e) {
        alert('שגיאה ביצירת תסריט');
      }

      btnGenerateScript.disabled = false;
      btnGenerateScript.textContent = '🎬 צור תסריט לסרטון';
    };
  }

  if (btnUseContent) {
    btnUseContent.onclick = function() {
      const content = generatedContent ? generatedContent.value : '';
      if (content && postContent) {
        postContent.value = content;
        // Navigate to publish page
        document.querySelector('[data-page="publish"]').click();
      }
    };
  }

  // ==========================================
  // SHOPIFY ANALYTICS
  // ==========================================

  async function loadAnalytics() {
    try {
      const response = await fetch(API_BASE + '/api/shopify/analytics');
      const data = await response.json();

      if (data.success) {
        const { today, week, month, dailySales, currency } = data.data;

        // Update cards
        const el = (id) => document.getElementById(id);
        if (el('analyticsTodaySales')) el('analyticsTodaySales').textContent = formatCurrency(today.total, currency);
        if (el('analyticsTodayOrders')) el('analyticsTodayOrders').textContent = today.orders + ' הזמנות';
        if (el('analyticsWeekSales')) el('analyticsWeekSales').textContent = formatCurrency(week.total, currency);
        if (el('analyticsWeekOrders')) el('analyticsWeekOrders').textContent = week.orders + ' הזמנות';
        if (el('analyticsMonthSales')) el('analyticsMonthSales').textContent = formatCurrency(month.total, currency);
        if (el('analyticsMonthOrders')) el('analyticsMonthOrders').textContent = month.orders + ' הזמנות';
        if (el('analyticsAvgOrder')) el('analyticsAvgOrder').textContent = formatCurrency(month.average, currency);

        // Render chart
        renderSalesChart(dailySales, currency);
      }
    } catch (e) {
      console.error('Analytics error:', e);
    }
  }

  function renderSalesChart(dailySales, currency) {
    const container = document.getElementById('salesChart');
    if (!container || !dailySales) return;

    const maxTotal = Math.max(...dailySales.map(d => d.total), 1);

    container.innerHTML = dailySales.map(day => {
      const height = Math.max((day.total / maxTotal) * 150, 5);
      return `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
          <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">${formatCurrency(day.total, currency)}</div>
          <div style="width: 100%; max-width: 40px; height: ${height}px; background: linear-gradient(to top, var(--accent), var(--accent-hover)); border-radius: 4px 4px 0 0;"></div>
          <div style="font-size: 0.75rem; margin-top: 8px; color: var(--text-muted);">${day.day}</div>
          <div style="font-size: 0.65rem; color: var(--text-muted);">${day.orders} הזמנות</div>
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // METORIK-STYLE ANALYTICS (NEW)
  // ==========================================

  let salesChart = null;
  let currentPeriod = 'month';
  let analyticsSetupDone = false;
  let isLoadingAnalytics = false;

  // Show loading spinner in KPI cards
  function showKPILoading() {
    const el = (id) => document.getElementById(id);
    const loadingHTML = '<span class="kpi-loading">...</span>';
    if (el('kpiTodaySales')) el('kpiTodaySales').innerHTML = loadingHTML;
    if (el('kpiTodayOrders')) el('kpiTodayOrders').innerHTML = loadingHTML;
    if (el('kpiTodayOrderCount')) el('kpiTodayOrderCount').innerHTML = loadingHTML;
    if (el('kpiAvgOrder')) el('kpiAvgOrder').innerHTML = loadingHTML;
    if (el('kpiReturningRate')) el('kpiReturningRate').innerHTML = loadingHTML;
  }

  // Show loading spinner in chart
  function showChartLoading() {
    const chartContainer = document.querySelector('#page-shopify-analytics .chart-container');
    if (chartContainer) {
      chartContainer.innerHTML = '<div class="loading" style="display: flex; justify-content: center; align-items: center; height: 200px;"><div class="spinner"></div><p style="margin-right: 10px;">טוען נתונים...</p></div>';
    }
  }

  async function loadMetorikAnalytics(period = currentPeriod) {
    // Prevent double-loading
    if (isLoadingAnalytics) {
      console.log('[Analytics] Already loading, skipping...');
      return;
    }

    isLoadingAnalytics = true;
    currentPeriod = period;
    console.log('[Analytics] Loading analytics page, period:', period);

    // IMMEDIATELY show loading states before any async operations
    showKPILoading();
    showChartLoading();

    // Setup period selector ONCE
    if (!analyticsSetupDone) {
      setupPeriodSelector();
      analyticsSetupDone = true;
    }

    // Load all data in parallel
    try {
      await Promise.all([
        loadKPICards(period),
        loadSalesChart(period),
        loadTopProductsTable(),
        loadRecentOrders()
      ]);
      console.log('[Analytics] All data loaded');
    } catch (err) {
      console.error('[Analytics] Error loading data:', err);
    } finally {
      isLoadingAnalytics = false;
    }
  }

  async function loadKPICards(period) {
    try {
      console.log('Loading KPI cards for period:', period);
      const response = await fetch(API_BASE + '/api/shopify/analytics/summary?period=' + period);
      const data = await response.json();

      if (data.success) {
        const d = data.data;
        const el = (id) => document.getElementById(id);

        // Update KPI values with smooth transition
        if (el('kpiTodaySales')) el('kpiTodaySales').textContent = '₪' + Math.round(d.totalSales || d.todaySales || 0).toLocaleString();
        if (el('kpiTodayOrders')) el('kpiTodayOrders').textContent = (d.orderCount || d.todayOrders || 0) + ' הזמנות';
        if (el('kpiTodayOrderCount')) el('kpiTodayOrderCount').textContent = d.orderCount || d.todayOrders || 0;
        if (el('kpiAvgOrder')) el('kpiAvgOrder').textContent = '₪' + Math.round(d.avgOrderValue || 0).toLocaleString();
        if (el('kpiReturningRate')) el('kpiReturningRate').textContent = (d.returningRate || 0) + '%';

        // Update period label if available
        if (data.data.period) {
          const periodLabel = document.getElementById('chartPeriodLabel');
          if (periodLabel) {
            periodLabel.textContent = data.data.period.start + ' - ' + data.data.period.end;
          }
        }

        console.log('KPI cards updated successfully');
      } else {
        // Show error in KPI cards
        const el = (id) => document.getElementById(id);
        const errorText = 'שגיאה';
        if (el('kpiTodaySales')) el('kpiTodaySales').textContent = errorText;
        if (el('kpiTodayOrders')) el('kpiTodayOrders').textContent = errorText;
      }
    } catch (e) {
      console.error('KPI cards error:', e);
      // Show error state
      const el = (id) => document.getElementById(id);
      if (el('kpiTodaySales')) el('kpiTodaySales').textContent = 'שגיאה';
    }
  }

  async function loadSalesChart(period) {
    try {
      console.log('[Chart] Loading sales chart for period:', period);

      const response = await fetch(API_BASE + '/api/shopify/analytics/sales-chart?period=' + period);

      if (!response.ok) {
        console.error('[Chart] HTTP error:', response.status);
        return;
      }

      const data = await response.json();

      console.log('[Chart] API response:', {
        success: data.success,
        dataPoints: data.data?.length || 0,
        period: data.period,
        totalOrders: data.totalOrders,
        totalSales: data.totalSales
      });

      if (data.success && data.data && data.data.length > 0) {
        renderChartJS(data.data);

        // Update period label - show start first, then end
        const label = document.getElementById('chartPeriodLabel');
        if (label && data.period) {
          label.textContent = data.period.start + ' עד ' + data.period.end;
        }
      } else {
        console.warn('[Chart] No data to display');
        const chartContainer = document.querySelector('.chart-container');
        if (chartContainer) {
          chartContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">אין נתוני מכירות לתקופה זו</p>';
        }
      }
    } catch (e) {
      console.error('[Chart] Error:', e);
    }
  }

  function renderChartJS(chartData) {
    console.log('[Chart] renderChartJS called with', chartData?.length, 'data points');

    // Find the chart container inside the analytics page
    const analyticsPage = document.getElementById('page-shopify-analytics');
    const chartContainer = analyticsPage ? analyticsPage.querySelector('.chart-container') : document.querySelector('.chart-container');

    if (!chartContainer) {
      console.error('[Chart] Container not found');
      return;
    }

    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
      console.error('[Chart] Chart.js not loaded yet, retrying in 500ms');
      setTimeout(() => renderChartJS(chartData), 500);
      return;
    }

    console.log('[Chart] Chart.js loaded, container found');

    // Destroy existing chart properly
    if (salesChart) {
      console.log('[Chart] Destroying existing chart');
      try {
        salesChart.destroy();
      } catch (e) {
        console.warn('[Chart] Error destroying chart:', e);
      }
      salesChart = null;
    }

    // Handle empty or invalid data
    if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
      console.warn('[Chart] No chart data available');
      chartContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">אין נתוני מכירות לתקופה זו</p>';
      return;
    }

    // Always recreate canvas to avoid stale state
    chartContainer.innerHTML = '<canvas id="salesChartCanvas" style="width:100%;height:100%;"></canvas>';
    const canvas = document.getElementById('salesChartCanvas');

    if (!canvas) {
      console.error('[Chart] Could not create canvas');
      return;
    }

    // Prepare data - show last 14 days max for readability
    const displayData = chartData.slice(-14);

    // Filter out days with zero sales for cleaner display, unless all are zero
    const hasNonZero = displayData.some(d => d.sales > 0);
    const finalData = hasNonZero ? displayData : displayData.slice(-7);

    console.log('[Chart] Rendering with', finalData.length, 'data points');

    try {
      const ctx = canvas.getContext('2d');
      salesChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: finalData.map(d => {
            const parts = d.label.split('/');
            return parts[0] + '/' + parts[1];
          }),
          datasets: [{
            label: 'מכירות',
            data: finalData.map(d => d.sales),
            borderColor: '#d4a853',
            backgroundColor: 'rgba(212, 168, 83, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointBackgroundColor: '#d4a853',
            pointBorderColor: '#d4a853',
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              rtl: true,
              textDirection: 'rtl',
              callbacks: {
                label: function(context) {
                  return '₪' + context.parsed.y.toLocaleString();
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { color: '#888', font: { size: 10 } }
            },
            y: {
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: {
                color: '#888',
                callback: function(value) {
                  return '₪' + value.toLocaleString();
                }
              },
              beginAtZero: true
            }
          }
        }
      });
      console.log('[Chart] SUCCESS - Chart rendered with', finalData.length, 'points');
    } catch (err) {
      console.error('[Chart] ERROR rendering:', err);
      chartContainer.innerHTML = '<p style="color: var(--error); text-align: center; padding: 40px;">שגיאה בטעינת הגרף</p>';
    }
  }

  async function loadTopProductsTable() {
    const tbody = document.getElementById('topProductsBody');
    if (!tbody) return;

    // Show loading immediately
    tbody.innerHTML = '<tr><td colspan="4" class="loading"><div class="spinner"></div></td></tr>';

    try {
      const response = await fetch(API_BASE + '/api/shopify/analytics/top-products?limit=8');
      const data = await response.json();

      if (data.success && data.data.length > 0) {
        tbody.innerHTML = data.data.map(p => `
          <tr>
            <td class="product-cell">
              ${p.image ? `<img src="${p.image}" class="product-image-small" alt="">` : ''}
              <span>${p.title.substring(0, 30)}${p.title.length > 30 ? '...' : ''}</span>
            </td>
            <td>${p.quantity}</td>
            <td><strong>₪${p.revenue.toLocaleString()}</strong></td>
            <td style="color: ${p.inventory <= 5 ? 'var(--error)' : 'var(--text-muted)'}">${p.inventory}</td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">אין נתונים</td></tr>';
      }
    } catch (e) {
      console.error('Top products table error:', e);
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--error);">שגיאה בטעינה</td></tr>';
    }
  }

  async function loadRecentOrders() {
    const tbody = document.getElementById('recentOrdersBody');
    if (!tbody) return;

    // Show loading immediately
    tbody.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div></td></tr>';

    try {
      const response = await fetch(API_BASE + '/api/shopify/orders/recent?limit=10');
      const data = await response.json();

      if (data.success && data.data.length > 0) {
        tbody.innerHTML = data.data.map(o => `
          <tr>
            <td><strong>#${o.orderNumber}</strong></td>
            <td>${o.customerName}</td>
            <td>₪${o.total.toLocaleString()}</td>
            <td>${o.discountCode !== '-' ? `<span class="discount-code">${o.discountCode}</span>` : '-'}</td>
            <td><span class="order-status ${o.statusRaw}">${o.status}</span></td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">אין הזמנות</td></tr>';
      }
    } catch (e) {
      console.error('Recent orders error:', e);
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--error);">שגיאה בטעינה</td></tr>';
    }
  }

  function setupPeriodSelector() {
    console.log('[Setup] Setting up period selector');

    // Use event delegation on the selector container
    const analyticsSelector = document.getElementById('analyticsPeriodSelector');
    if (analyticsSelector) {
      // Remove old listener and add new one using onclick
      analyticsSelector.onclick = function(e) {
        const btn = e.target.closest('.period-btn[data-period]');
        if (btn) {
          e.preventDefault();
          const period = btn.dataset.period;
          console.log('[Period] Button clicked:', period);

          // Update active state IMMEDIATELY
          analyticsSelector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          // Show loading states IMMEDIATELY before fetching
          showKPILoading();
          showChartLoading();

          // Update global state and load data
          currentPeriod = period;

          // Load data (async - user sees loading spinner right away)
          Promise.all([
            loadKPICards(period),
            loadSalesChart(period),
            loadTopProductsTable()
          ]).catch(err => console.error('Error loading period data:', err));
        }
      };
      console.log('[Setup] Analytics period selector ready');
    }

    // Custom date button
    const analyticsCustomBtn = document.getElementById('analyticsCustomDateBtn');
    if (analyticsCustomBtn) {
      analyticsCustomBtn.onclick = function(e) {
        e.preventDefault();
        const startDate = document.getElementById('analyticsStartDate').value;
        const endDate = document.getElementById('analyticsEndDate').value;
        console.log('[Period] Custom date:', startDate, '-', endDate);

        if (startDate && endDate) {
          // Show loading IMMEDIATELY
          analyticsSelector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
          showKPILoading();
          showChartLoading();

          // Load data
          Promise.all([
            loadSalesChartWithDates(startDate, endDate),
            loadKPICardsWithDates(startDate, endDate)
          ]).catch(err => console.error('Error loading custom date data:', err));
        } else {
          alert('נא לבחור תאריך התחלה ותאריך סיום');
        }
      };
    }
  }

  async function loadKPICardsWithDates(startDate, endDate) {
    try {
      const response = await fetch(API_BASE + '/api/shopify/analytics/summary?startDate=' + startDate + '&endDate=' + endDate);
      const data = await response.json();

      if (data.success) {
        const d = data.data;
        const el = (id) => document.getElementById(id);

        if (el('kpiTodaySales')) el('kpiTodaySales').textContent = '₪' + Math.round(d.totalSales || d.todaySales || 0).toLocaleString();
        if (el('kpiTodayOrders')) el('kpiTodayOrders').textContent = (d.orderCount || d.todayOrders || 0) + ' הזמנות';
        if (el('kpiTodayOrderCount')) el('kpiTodayOrderCount').textContent = d.orderCount || d.todayOrders || 0;
        if (el('kpiAvgOrder')) el('kpiAvgOrder').textContent = '₪' + Math.round(d.avgOrderValue || 0).toLocaleString();
        if (el('kpiReturningRate')) el('kpiReturningRate').textContent = (d.returningRate || 0) + '%';
      }
    } catch (e) {
      console.error('KPI cards error:', e);
    }
  }

  async function loadSalesChartWithDates(startDate, endDate) {
    try {
      const response = await fetch(API_BASE + '/api/shopify/analytics/sales-chart?startDate=' + startDate + '&endDate=' + endDate);
      const data = await response.json();

      if (data.success) {
        renderChartJS(data.data);

        const label = document.getElementById('chartPeriodLabel');
        if (label && data.period) {
          label.textContent = data.period.start + ' - ' + data.period.end;
        }
      }
    } catch (e) {
      console.error('Sales chart error:', e);
    }
  }

  // Legacy function for backward compatibility
  function setupPeriodSelectorLegacy() {
    // Period buttons
    document.querySelectorAll('.period-btn[data-period]').forEach(btn => {
      btn.onclick = function() {
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const period = this.dataset.period;
        loadKPICards(period);
        loadSalesChart(period);
      };
    });

    // Custom date button
    const customBtn = document.getElementById('customDateBtn');
    if (customBtn) {
      customBtn.onclick = function() {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        if (startDate && endDate) {
          document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
          loadSalesChart('custom&startDate=' + startDate + '&endDate=' + endDate);
        }
      };
    }
  }

  // ==========================================
  // CUSTOMERS PAGE WITH SORTING
  // ==========================================

  let customersPeriod = 'month';
  let customersSearchTerm = '';
  let customersData = [];
  let customersSortColumn = 'totalSpend';
  let customersSortAsc = false; // false = high to low (default)
  let customersSetupDone = false;
  let isLoadingCustomers = false;

  // Show loading in customer stats
  function showCustomerStatsLoading() {
    const el = (id) => document.getElementById(id);
    const loadingHTML = '...';
    if (el('statTotalCustomers')) el('statTotalCustomers').textContent = loadingHTML;
    if (el('statNewCustomers')) el('statNewCustomers').textContent = loadingHTML;
    if (el('statReturningRate')) el('statReturningRate').textContent = loadingHTML;
    if (el('statAvgLTV')) el('statAvgLTV').textContent = loadingHTML;
  }

  async function loadCustomersPage() {
    if (isLoadingCustomers) return;
    isLoadingCustomers = true;

    console.log('[Customers] Loading customers page');

    // Show loading IMMEDIATELY
    showCustomerStatsLoading();
    const tbody = document.getElementById('topCustomersBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div></td></tr>';

    if (!customersSetupDone) {
      setupCustomersPeriodSelector();
      setupCustomersSearch();
      setupCustomersSorting();
      customersSetupDone = true;
    }

    // Load data with current period
    try {
      await Promise.all([
        loadCustomerStatsFiltered(customersPeriod),
        loadTopCustomersFiltered(customersPeriod, customersSearchTerm)
      ]);
    } finally {
      isLoadingCustomers = false;
    }
  }

  async function loadCustomerStatsFiltered(period = customersPeriod) {
    try {
      // Use the summary endpoint with period parameter
      const response = await fetch(API_BASE + '/api/shopify/analytics/top-customers?limit=250&period=' + period);
      const data = await response.json();

      if (data.success) {
        const el = (id) => document.getElementById(id);
        const customers = data.data || [];

        // Calculate stats from the filtered data
        const totalCustomers = data.stats?.totalCustomers || customers.length;
        const newCustomers = customers.filter(c => {
          // If this is a new customer in the period
          return c.orderCount === 1;
        }).length;
        const returningCustomers = customers.filter(c => c.orderCount > 1).length;
        const returningRate = totalCustomers > 0 ? Math.round((returningCustomers / totalCustomers) * 100) : 0;
        const totalSpend = customers.reduce((sum, c) => sum + (c.totalSpend || 0), 0);
        const avgLTV = totalCustomers > 0 ? Math.round(totalSpend / totalCustomers) : 0;

        if (el('statTotalCustomers')) el('statTotalCustomers').textContent = totalCustomers;
        if (el('statNewCustomers')) el('statNewCustomers').textContent = newCustomers;
        if (el('statReturningRate')) el('statReturningRate').textContent = returningRate + '%';
        if (el('statAvgLTV')) el('statAvgLTV').textContent = '₪' + avgLTV.toLocaleString();
      }
    } catch (e) {
      console.error('Customer stats error:', e);
    }
  }

  async function loadTopCustomersFiltered(period = customersPeriod, search = customersSearchTerm) {
    const tbody = document.getElementById('topCustomersBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div></td></tr>';

    try {
      let url = API_BASE + '/api/shopify/analytics/top-customers?limit=100&period=' + period;
      if (search) url += '&search=' + encodeURIComponent(search);

      console.log('Loading customers with period:', period);
      const response = await fetch(url);
      const data = await response.json();

      const countLabel = document.getElementById('customersCountLabel');
      if (countLabel && data.stats) {
        countLabel.textContent = `${data.stats.totalCustomers} לקוחות | ${data.period?.start || ''} - ${data.period?.end || ''}`;
      }

      if (data.success && data.data.length > 0) {
        customersData = data.data;
        renderCustomersTable();
      } else {
        customersData = [];
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">אין נתונים לתקופה זו</td></tr>';
      }
    } catch (e) {
      console.error('Top customers error:', e);
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--error);">שגיאה בטעינה</td></tr>';
    }
  }

  function sortCustomers(column) {
    if (customersSortColumn === column) {
      customersSortAsc = !customersSortAsc;
    } else {
      customersSortColumn = column;
      customersSortAsc = false; // default high to low
    }
    renderCustomersTable();
    updateSortIndicators();
  }

  function updateSortIndicators() {
    const headers = document.querySelectorAll('#topCustomersTable th[data-sort]');
    headers.forEach(th => {
      const arrow = th.querySelector('.sort-arrow');
      if (th.dataset.sort === customersSortColumn) {
        if (arrow) arrow.textContent = customersSortAsc ? ' ▲' : ' ▼';
      } else {
        if (arrow) arrow.textContent = ' ⇅';
      }
    });
  }

  function renderCustomersTable() {
    const tbody = document.getElementById('topCustomersBody');
    if (!tbody || customersData.length === 0) return;

    // Sort data
    const sorted = [...customersData].sort((a, b) => {
      let aVal, bVal;

      switch (customersSortColumn) {
        case 'name':
          aVal = a.name || '';
          bVal = b.name || '';
          return customersSortAsc ? aVal.localeCompare(bVal, 'he') : bVal.localeCompare(aVal, 'he');
        case 'email':
          aVal = a.email || '';
          bVal = b.email || '';
          return customersSortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'orderCount':
          aVal = a.orderCount || 0;
          bVal = b.orderCount || 0;
          break;
        case 'totalSpend':
          aVal = a.totalSpend || 0;
          bVal = b.totalSpend || 0;
          break;
        case 'lastOrderDate':
          aVal = new Date(a.lastOrderDateRaw || a.lastOrderDate || 0).getTime();
          bVal = new Date(b.lastOrderDateRaw || b.lastOrderDate || 0).getTime();
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'number') {
        return customersSortAsc ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

    tbody.innerHTML = sorted.map((c, i) => `
      <tr>
        <td>
          <span style="color: ${i < 3 ? 'var(--accent)' : 'var(--text)'}; font-weight: ${i < 3 ? '600' : '400'}">
            ${i < 3 ? '👑 ' : ''}${c.name}
          </span>
        </td>
        <td style="font-size: 0.8rem; color: var(--text-muted)">${c.email || '-'}</td>
        <td>${c.orderCount}</td>
        <td><strong style="color: var(--accent)">₪${c.totalSpend.toLocaleString()}</strong></td>
        <td style="font-size: 0.85rem">${c.lastOrderDate}</td>
      </tr>
    `).join('');
  }

  function setupCustomersSorting() {
    const table = document.getElementById('topCustomersTable');
    if (!table) return;

    // Update headers to be sortable
    const thead = table.querySelector('thead tr');
    if (thead) {
      thead.innerHTML = `
        <th data-sort="name" style="cursor: pointer;">לקוח<span class="sort-arrow"> ⇅</span></th>
        <th data-sort="email" style="cursor: pointer;">אימייל<span class="sort-arrow"> ⇅</span></th>
        <th data-sort="orderCount" style="cursor: pointer;">הזמנות<span class="sort-arrow"> ⇅</span></th>
        <th data-sort="totalSpend" style="cursor: pointer;">סה"כ קניות<span class="sort-arrow"> ▼</span></th>
        <th data-sort="lastOrderDate" style="cursor: pointer;">הזמנה אחרונה<span class="sort-arrow"> ⇅</span></th>
      `;

      thead.querySelectorAll('th[data-sort]').forEach(th => {
        th.onclick = () => sortCustomers(th.dataset.sort);
      });
    }
  }

  function setupCustomersPeriodSelector() {
    const selector = document.getElementById('customersPeriodSelector');
    if (!selector) return;

    console.log('[Customers] Setting up period selector');

    // Use event delegation instead of cloning
    selector.onclick = function(e) {
      const btn = e.target.closest('.period-btn[data-period]');
      if (btn) {
        e.preventDefault();
        const period = btn.dataset.period;
        console.log('[Customers] Period clicked:', period);

        // Update active state IMMEDIATELY
        selector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Show loading IMMEDIATELY
        showCustomerStatsLoading();
        const tbody = document.getElementById('topCustomersBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div></td></tr>';

        // Update global state and reload data
        customersPeriod = period;
        Promise.all([
          loadCustomerStatsFiltered(period),
          loadTopCustomersFiltered(period, customersSearchTerm)
        ]).catch(err => console.error('Error loading customer data:', err));
      }
    };

    const customBtn = document.getElementById('customersCustomDateBtn');
    if (customBtn) {
      customBtn.onclick = function(e) {
        e.preventDefault();
        const startDate = document.getElementById('customersStartDate').value;
        const endDate = document.getElementById('customersEndDate').value;
        if (startDate && endDate) {
          selector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
          loadTopCustomersWithDates(startDate, endDate, customersSearchTerm);
        } else {
          alert('נא לבחור תאריך התחלה ותאריך סיום');
        }
      };
    }
  }

  async function loadTopCustomersWithDates(startDate, endDate, search = '') {
    const tbody = document.getElementById('topCustomersBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div></td></tr>';

    try {
      let url = API_BASE + '/api/shopify/analytics/top-customers?limit=20&startDate=' + startDate + '&endDate=' + endDate;
      if (search) url += '&search=' + encodeURIComponent(search);

      const response = await fetch(url);
      const data = await response.json();

      const countLabel = document.getElementById('customersCountLabel');
      if (countLabel && data.stats) {
        countLabel.textContent = `${data.stats.totalCustomers} לקוחות | ${data.period?.start || ''} - ${data.period?.end || ''}`;
      }

      if (data.success && data.data.length > 0) {
        tbody.innerHTML = data.data.map((c, i) => `
          <tr>
            <td>
              <span style="color: ${i < 3 ? 'var(--accent)' : 'var(--text)'}; font-weight: ${i < 3 ? '600' : '400'}">
                ${i < 3 ? '👑 ' : ''}${c.name}
              </span>
            </td>
            <td style="font-size: 0.8rem; color: var(--text-muted)">${c.email || '-'}</td>
            <td>${c.orderCount}</td>
            <td><strong style="color: var(--accent)">₪${c.totalSpend.toLocaleString()}</strong></td>
            <td style="font-size: 0.85rem">${c.lastOrderDate}</td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">אין נתונים לתקופה זו</td></tr>';
      }
    } catch (e) {
      console.error('Top customers error:', e);
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--error);">שגיאה בטעינה</td></tr>';
    }
  }

  function setupCustomersSearch() {
    const searchInput = document.getElementById('customerSearch');
    if (!searchInput) return;

    let debounceTimer;
    searchInput.oninput = function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        customersSearchTerm = this.value;
        loadTopCustomersFiltered(customersPeriod, customersSearchTerm);
      }, 300);
    };
  }

  // Legacy function
  async function loadTopCustomers() {
    loadTopCustomersFiltered();
  }

  // ==========================================
  // TOP PRODUCTS
  // ==========================================

  let productsPeriod = 'month';
  let productsSearchTerm = '';
  let productsSetupDone = false;
  let isLoadingProducts = false;

  // Show loading in product lists
  function showProductsLoading() {
    const qtyContainer = document.getElementById('topProductsQuantity');
    const revContainer = document.getElementById('topProductsRevenue');
    const loadingHTML = '<div class="loading" style="padding: 20px; text-align: center;"><div class="spinner"></div></div>';
    if (qtyContainer) qtyContainer.innerHTML = loadingHTML;
    if (revContainer) revContainer.innerHTML = loadingHTML;
  }

  async function loadTopProducts() {
    if (isLoadingProducts) return;
    isLoadingProducts = true;

    console.log('[Products] Loading products page');

    // Show loading IMMEDIATELY
    showProductsLoading();

    try {
      await loadTopProductsFiltered();
      if (!productsSetupDone) {
        setupProductsPeriodSelector();
        setupProductsSearch();
        productsSetupDone = true;
      }
      loadLowStockProducts();
    } finally {
      isLoadingProducts = false;
    }
  }

  async function loadTopProductsFiltered(period = productsPeriod, search = productsSearchTerm) {
    const qtyContainer = document.getElementById('topProductsQuantity');
    const revContainer = document.getElementById('topProductsRevenue');

    if (qtyContainer) qtyContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    if (revContainer) revContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      let url = API_BASE + '/api/shopify/analytics/top-products?limit=10&period=' + period;
      if (search) url += '&search=' + encodeURIComponent(search);

      const response = await fetch(url);
      const data = await response.json();

      // Update counts
      const qtyCount = document.getElementById('productsQuantityCount');
      const revCount = document.getElementById('productsRevenueCount');
      if (qtyCount && data.period) qtyCount.textContent = data.period.start + ' - ' + data.period.end;
      if (revCount && data.period) revCount.textContent = data.period.start + ' - ' + data.period.end;

      if (data.success) {
        const byQuantity = data.byQuantity || [];
        const byRevenue = data.byRevenue || data.data || [];

        // Render quantity list
        if (qtyContainer) {
          if (byQuantity.length === 0) {
            qtyContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center;">אין נתונים לתקופה זו</p>';
          } else {
            qtyContainer.innerHTML = byQuantity.map((p, i) => `
              <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
                <span>${i + 1}. ${p.title}</span>
                <span style="color: var(--accent); font-weight: 600;">${p.quantity} נמכרו</span>
              </div>
            `).join('');
          }
        }

        // Render revenue list
        if (revContainer) {
          if (byRevenue.length === 0) {
            revContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center;">אין נתונים לתקופה זו</p>';
          } else {
            revContainer.innerHTML = byRevenue.map((p, i) => `
              <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
                <span>${i + 1}. ${p.title}</span>
                <span style="color: var(--accent); font-weight: 600;">₪${p.revenue.toLocaleString()}</span>
              </div>
            `).join('');
          }
        }
      }
    } catch (e) {
      console.error('Top products error:', e);
      if (qtyContainer) qtyContainer.innerHTML = '<p style="color: var(--error); text-align: center;">שגיאה בטעינה</p>';
      if (revContainer) revContainer.innerHTML = '<p style="color: var(--error); text-align: center;">שגיאה בטעינה</p>';
    }
  }

  async function loadLowStockProducts() {
    const stockContainer = document.getElementById('lowStockProducts');
    if (!stockContainer) return;

    try {
      const response = await fetch(API_BASE + '/api/shopify/top-products');
      const data = await response.json();

      if (data.success) {
        const lowStock = data.data.lowStock || [];

        if (lowStock.length === 0) {
          stockContainer.innerHTML = '<p style="color: var(--success); text-align: center;">✓ כל המוצרים במלאי תקין</p>';
        } else {
          stockContainer.innerHTML = `
            <table class="data-table">
              <thead><tr><th>מוצר</th><th>מלאי</th><th>מחיר</th></tr></thead>
              <tbody>
                ${lowStock.map(p => `
                  <tr>
                    <td>${p.title}</td>
                    <td style="color: ${p.inventory === 0 ? 'var(--error)' : 'var(--warn)'}; font-weight: 600;">${p.inventory}</td>
                    <td>₪${p.price}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
        }
      }
    } catch (e) {
      console.error('Low stock error:', e);
    }
  }

  function setupProductsPeriodSelector() {
    const selector = document.getElementById('productsPeriodSelector');
    if (!selector) return;

    console.log('[Products] Setting up period selector');

    // Use event delegation
    selector.onclick = function(e) {
      const btn = e.target.closest('.period-btn[data-period]');
      if (btn) {
        e.preventDefault();
        const period = btn.dataset.period;
        console.log('[Products] Period clicked:', period);

        // Update active state IMMEDIATELY
        selector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Show loading IMMEDIATELY
        showProductsLoading();

        productsPeriod = period;
        loadTopProductsFiltered(productsPeriod, productsSearchTerm)
          .catch(err => console.error('Error loading products:', err));
      }
    };

    const customBtn = document.getElementById('productsCustomDateBtn');
    if (customBtn) {
      customBtn.onclick = function(e) {
        e.preventDefault();
        const startDate = document.getElementById('productsStartDate').value;
        const endDate = document.getElementById('productsEndDate').value;
        if (startDate && endDate) {
          selector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
          loadTopProductsWithDates(startDate, endDate, productsSearchTerm);
        } else {
          alert('נא לבחור תאריך התחלה ותאריך סיום');
        }
      };
    }
  }

  async function loadTopProductsWithDates(startDate, endDate, search = '') {
    const qtyContainer = document.getElementById('topProductsQuantity');
    const revContainer = document.getElementById('topProductsRevenue');

    if (qtyContainer) qtyContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    if (revContainer) revContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      let url = API_BASE + '/api/shopify/analytics/top-products?limit=10&startDate=' + startDate + '&endDate=' + endDate;
      if (search) url += '&search=' + encodeURIComponent(search);

      const response = await fetch(url);
      const data = await response.json();

      const qtyCount = document.getElementById('productsQuantityCount');
      const revCount = document.getElementById('productsRevenueCount');
      if (qtyCount && data.period) qtyCount.textContent = data.period.start + ' - ' + data.period.end;
      if (revCount && data.period) revCount.textContent = data.period.start + ' - ' + data.period.end;

      if (data.success) {
        const byQuantity = data.byQuantity || [];
        const byRevenue = data.byRevenue || data.data || [];

        if (qtyContainer) {
          if (byQuantity.length === 0) {
            qtyContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center;">אין נתונים לתקופה זו</p>';
          } else {
            qtyContainer.innerHTML = byQuantity.map((p, i) => `
              <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
                <span>${i + 1}. ${p.title}</span>
                <span style="color: var(--accent); font-weight: 600;">${p.quantity} נמכרו</span>
              </div>
            `).join('');
          }
        }

        if (revContainer) {
          if (byRevenue.length === 0) {
            revContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center;">אין נתונים לתקופה זו</p>';
          } else {
            revContainer.innerHTML = byRevenue.map((p, i) => `
              <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
                <span>${i + 1}. ${p.title}</span>
                <span style="color: var(--accent); font-weight: 600;">₪${p.revenue.toLocaleString()}</span>
              </div>
            `).join('');
          }
        }
      }
    } catch (e) {
      console.error('Top products error:', e);
    }
  }

  function setupProductsSearch() {
    const searchInput = document.getElementById('productSearch');
    if (!searchInput) return;

    let debounceTimer;
    searchInput.oninput = function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        productsSearchTerm = this.value;
        loadTopProductsFiltered(productsPeriod, productsSearchTerm);
      }, 300);
    };
  }

  // ==========================================
  // COUPONS - SEARCH-BASED SYSTEM
  // ==========================================

  // Load tracked coupons from localStorage
  let trackedCoupons = JSON.parse(localStorage.getItem('trackedCoupons') || '[]');
  let lastSearchedCoupon = null;

  function saveTrackedCoupons() {
    localStorage.setItem('trackedCoupons', JSON.stringify(trackedCoupons));
  }

  function isTracked(couponCode) {
    return trackedCoupons.some(c => c.code.toUpperCase() === couponCode.toUpperCase());
  }

  function addToTracked(coupon) {
    if (!isTracked(coupon.code)) {
      trackedCoupons.push({
        id: coupon.id,
        code: coupon.code,
        value: coupon.value,
        valueType: coupon.valueType,
        usageCount: coupon.usageCount || 0,
        isActive: coupon.isActive,
        startsAt: coupon.startsAt,
        endsAt: coupon.endsAt
      });
      saveTrackedCoupons();
      renderTrackedCoupons();
    }
  }

  function removeTrackedCoupon(couponCode) {
    trackedCoupons = trackedCoupons.filter(c => c.code.toUpperCase() !== couponCode.toUpperCase());
    saveTrackedCoupons();
    renderTrackedCoupons();
  }

  function formatDiscount(value, valueType) {
    if (!value) return '-';
    if (valueType === 'percentage') return Math.abs(parseFloat(value)) + '%';
    return '₪' + Math.abs(parseFloat(value));
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }

  function renderTrackedCoupons() {
    const container = document.getElementById('trackedCouponsList');
    if (!container) return;

    if (trackedCoupons.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">חפש קופון והוסף אותו למעקב</p>';
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>קוד</th><th>הנחה</th><th>שימושים</th><th>סטטוס</th><th></th></tr></thead>
        <tbody>
          ${trackedCoupons.map(c => `
            <tr>
              <td><strong>${c.code}</strong></td>
              <td>${formatDiscount(c.value, c.valueType)}</td>
              <td>${c.usageCount || 0}</td>
              <td>
                <span class="order-status ${c.isActive ? 'paid' : 'pending'}">
                  ${c.isActive ? 'פעיל' : 'לא פעיל'}
                </span>
              </td>
              <td>
                <button class="btn-remove-coupon" data-code="${c.code}" title="הסר ממעקב"
                  style="background: none; border: none; color: var(--error); cursor: pointer; font-size: 1rem;">
                  ✕
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Add remove button handlers
    container.querySelectorAll('.btn-remove-coupon').forEach(btn => {
      btn.onclick = () => removeTrackedCoupon(btn.dataset.code);
    });
  }

  function renderCouponSearchResult(coupon) {
    const container = document.getElementById('couponSearchResult');
    if (!container) return;

    if (!coupon) {
      container.innerHTML = '';
      return;
    }

    const tracked = isTracked(coupon.code);

    container.innerHTML = `
      <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-top: 15px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h3 style="margin: 0; color: var(--accent);">${coupon.code}</h3>
          <span class="order-status ${coupon.isActive ? 'paid' : 'pending'}" style="font-size: 0.9rem;">
            ${coupon.isActive ? '✓ פעיל' : '✗ לא פעיל'}
          </span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
          <div>
            <div style="color: var(--text-muted); font-size: 0.8rem;">הנחה</div>
            <div style="font-size: 1.3rem; font-weight: 600; color: var(--accent);">${formatDiscount(coupon.value, coupon.valueType)}</div>
          </div>
          <div>
            <div style="color: var(--text-muted); font-size: 0.8rem;">שימושים</div>
            <div style="font-size: 1.3rem; font-weight: 600;">${coupon.usageCount || 0}${coupon.usageLimit ? ' / ' + coupon.usageLimit : ''}</div>
          </div>
          <div>
            <div style="color: var(--text-muted); font-size: 0.8rem;">תאריך התחלה</div>
            <div>${formatDate(coupon.startsAt)}</div>
          </div>
          <div>
            <div style="color: var(--text-muted); font-size: 0.8rem;">תאריך סיום</div>
            <div>${formatDate(coupon.endsAt)}</div>
          </div>
          ${coupon.minimumAmount ? `
          <div>
            <div style="color: var(--text-muted); font-size: 0.8rem;">מינימום הזמנה</div>
            <div>₪${coupon.minimumAmount}</div>
          </div>` : ''}
          <div>
            <div style="color: var(--text-muted); font-size: 0.8rem;">פעם אחת ללקוח</div>
            <div>${coupon.oncePerCustomer ? 'כן' : 'לא'}</div>
          </div>
        </div>

        <button id="btnAddToTracked" class="btn ${tracked ? 'btn-secondary' : 'btn-primary'}" style="margin-top: 20px; width: 100%;">
          ${tracked ? '✓ במעקב' : '⭐ הוסף למעקב'}
        </button>
      </div>
    `;

    // Add track button handler
    const addBtn = document.getElementById('btnAddToTracked');
    if (addBtn && !tracked) {
      addBtn.onclick = () => {
        addToTracked(coupon);
        renderCouponSearchResult(coupon);
      };
    }
  }

  async function searchCoupon(code) {
    const resultContainer = document.getElementById('couponSearchResult');
    const searchBtn = document.getElementById('couponSearchBtn');

    if (!code || code.trim().length === 0) {
      if (resultContainer) resultContainer.innerHTML = '<p style="color: var(--error); text-align: center; margin-top: 15px;">נא להזין קוד קופון</p>';
      return;
    }

    // Show loading
    if (searchBtn) {
      searchBtn.disabled = true;
      searchBtn.textContent = '🔍 מחפש...';
    }
    if (resultContainer) {
      resultContainer.innerHTML = '<div class="loading" style="padding: 20px;"><div class="spinner"></div><p>מחפש קופון...</p></div>';
    }

    try {
      const response = await fetch(API_BASE + '/api/shopify/discounts/search?code=' + encodeURIComponent(code.trim()));
      const data = await response.json();

      if (data.success && data.data) {
        lastSearchedCoupon = data.data;
        renderCouponSearchResult(data.data);
      } else {
        if (resultContainer) {
          let html = `<p style="color: var(--error); text-align: center; margin-top: 15px;">${data.message || 'לא נמצא קופון'}</p>`;
          if (data.hint) {
            html += `<p style="color: var(--text-muted); text-align: center; margin-top: 10px; font-size: 0.85rem;">${data.hint}</p>`;
          }
          resultContainer.innerHTML = html;
        }
      }
    } catch (e) {
      console.error('Coupon search error:', e);
      if (resultContainer) {
        resultContainer.innerHTML = '<p style="color: var(--error); text-align: center; margin-top: 15px;">שגיאה בחיפוש</p>';
      }
    }

    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.textContent = '🔍 חפש';
    }
  }

  function loadCoupons() {
    // Just render tracked coupons and setup search
    renderTrackedCoupons();

    const searchInput = document.getElementById('couponSearch');
    const searchBtn = document.getElementById('couponSearchBtn');
    const resultContainer = document.getElementById('couponSearchResult');

    // Show initial message
    if (resultContainer) {
      resultContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 15px;">הזן קוד קופון למעלה ולחץ חפש</p>';
    }

    // Setup search button
    if (searchBtn) {
      searchBtn.onclick = () => {
        if (searchInput) searchCoupon(searchInput.value);
      };
    }

    // Setup enter key
    if (searchInput) {
      searchInput.onkeydown = (e) => {
        if (e.key === 'Enter') searchCoupon(searchInput.value);
      };
    }
  }

  // Make loadCoupons available globally for retry button
  window.loadCoupons = loadCoupons;

  // ==========================================
  // SETTINGS STATUS
  // ==========================================

  async function loadSettingsStatus() {
    const claudeStatus = document.getElementById('settingsClaudeStatus');
    const shopifyStatus = document.getElementById('settingsShopifyStatus');
    const metaStatus = document.getElementById('settingsMetaStatus');

    if (claudeStatus) {
      try {
        const response = await fetch(API_BASE + '/api/chat');
        const data = await response.json();
        claudeStatus.innerHTML = data.status === 'ready'
          ? '<span class="status-badge connected">✓ מחובר</span>'
          : '<span class="status-badge disconnected">לא מחובר</span>';
      } catch (e) {
        claudeStatus.innerHTML = '<span class="status-badge disconnected">שגיאה</span>';
      }
    }

    if (shopifyStatus) {
      try {
        const response = await fetch(API_BASE + '/api/shopify/test');
        const data = await response.json();
        if (data.success) {
          const name = data.shop && data.shop.name ? data.shop.name : 'מחובר';
          shopifyStatus.innerHTML = `<span class="status-badge connected">✓ ${name}</span>`;
        } else {
          shopifyStatus.innerHTML = '<span class="status-badge disconnected">לא מחובר</span>';
        }
      } catch (e) {
        shopifyStatus.innerHTML = '<span class="status-badge disconnected">שגיאה</span>';
      }
    }

    if (metaStatus) {
      try {
        const response = await fetch(API_BASE + '/api/meta/status');
        const data = await response.json();
        if (data.connected) {
          const name = data.page && data.page.name ? data.page.name : 'מחובר';
          metaStatus.innerHTML = `<span class="status-badge connected">✓ ${name}</span>`;
        } else if (data.configured) {
          metaStatus.innerHTML = '<span class="status-badge disconnected">לא מחובר</span>';
        } else {
          metaStatus.innerHTML = '<span class="status-badge pending">לא מוגדר</span>';
        }
      } catch (e) {
        metaStatus.innerHTML = '<span class="status-badge disconnected">שגיאה</span>';
      }
    }
  }

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  function formatCurrency(amount, currency = 'ILS') {
    if (typeof amount !== 'number') return '--';
    return '₪' + amount.toFixed(0);
  }

  function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'עכשיו';
    if (diff < 3600) return Math.floor(diff / 60) + ' דקות';
    if (diff < 86400) return Math.floor(diff / 3600) + ' שעות';
    return Math.floor(diff / 86400) + ' ימים';
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  checkAllStatuses();
  loadQuickStats();
  loadSettingsStatus();
  renderRecentPosts('recentPostsList');

  // Auto-refresh every 30 seconds
  setInterval(() => {
    checkAllStatuses();
    loadQuickStats();
  }, 30000);

  console.log('Dashboard initialized');
});
