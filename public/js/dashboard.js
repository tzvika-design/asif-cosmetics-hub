// Asif Cosmetics Hub - Dashboard JavaScript
// Comprehensive dashboard with all features

document.addEventListener('DOMContentLoaded', function() {
  const API_BASE = window.location.origin;

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

  async function loadMetorikAnalytics(period = currentPeriod) {
    currentPeriod = period;

    // Setup period selector FIRST to ensure buttons work
    setupPeriodSelector();

    // Load all data in parallel
    await Promise.all([
      loadKPICards(period),
      loadSalesChart(period),
      loadTopProductsTable(),
      loadRecentOrders()
    ]);
  }

  async function loadKPICards(period) {
    try {
      console.log('Loading KPI cards for period:', period);
      const response = await fetch(API_BASE + '/api/shopify/analytics/summary?period=' + period);
      const data = await response.json();

      if (data.success) {
        const d = data.data;
        const el = (id) => document.getElementById(id);

        // Update KPI values
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
      }
    } catch (e) {
      console.error('KPI cards error:', e);
    }
  }

  async function loadSalesChart(period) {
    try {
      console.log('Loading sales chart for period:', period);
      const response = await fetch(API_BASE + '/api/shopify/analytics/sales-chart?period=' + period);
      const data = await response.json();

      console.log('Sales chart API response:', data.success, 'Data points:', data.data?.length || 0);

      if (data.success) {
        renderChartJS(data.data);

        // Update period label
        const label = document.getElementById('chartPeriodLabel');
        if (label && data.period) {
          label.textContent = data.period.start + ' - ' + data.period.end;
        }
      } else {
        console.error('Sales chart API returned error:', data.message);
      }
    } catch (e) {
      console.error('Sales chart error:', e);
    }
  }

  function renderChartJS(chartData) {
    const canvas = document.getElementById('salesChartCanvas');
    if (!canvas) {
      console.error('Chart canvas not found');
      return;
    }

    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
      console.error('Chart.js not loaded');
      return;
    }

    // Destroy existing chart properly
    if (salesChart) {
      salesChart.destroy();
      salesChart = null;
    }

    // Handle empty or invalid data
    if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
      console.warn('No chart data available');
      const parent = canvas.parentElement;
      if (parent) {
        parent.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">אין נתוני מכירות לתקופה זו</p>';
      }
      return;
    }

    // Prepare data - show last 14 days max for readability
    const displayData = chartData.slice(-14);

    try {
      const ctx = canvas.getContext('2d');
      salesChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: displayData.map(d => d.dayName + ' ' + d.label.split('/').slice(0, 2).join('/')),
          datasets: [{
            label: 'מכירות',
            data: displayData.map(d => d.sales),
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
      console.log('Chart rendered successfully with', displayData.length, 'data points');
    } catch (err) {
      console.error('Error rendering chart:', err);
    }
  }

  async function loadTopProductsTable() {
    const tbody = document.getElementById('topProductsBody');
    if (!tbody) return;

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
    // Period buttons for Analytics page
    const analyticsSelector = document.getElementById('analyticsPeriodSelector');
    if (analyticsSelector) {
      const periodBtns = analyticsSelector.querySelectorAll('.period-btn[data-period]');
      console.log('Setting up', periodBtns.length, 'period buttons');

      periodBtns.forEach(btn => {
        // Remove any existing listeners by cloning
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', function(e) {
          e.preventDefault();
          console.log('Period button clicked:', this.dataset.period);

          // Update active state
          analyticsSelector.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
          this.classList.add('active');

          const period = this.dataset.period;
          currentPeriod = period;

          // Reload all data with new period
          loadKPICards(period);
          loadSalesChart(period);
          loadTopProductsTable();
        });
      });
    }

    // Custom date button for Analytics
    const analyticsCustomBtn = document.getElementById('analyticsCustomDateBtn');
    if (analyticsCustomBtn) {
      const newCustomBtn = analyticsCustomBtn.cloneNode(true);
      analyticsCustomBtn.parentNode.replaceChild(newCustomBtn, analyticsCustomBtn);

      newCustomBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const startDate = document.getElementById('analyticsStartDate').value;
        const endDate = document.getElementById('analyticsEndDate').value;
        console.log('Custom date clicked:', startDate, '-', endDate);

        if (startDate && endDate) {
          const selector = document.getElementById('analyticsPeriodSelector');
          if (selector) {
            selector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
          }
          loadSalesChartWithDates(startDate, endDate);
          loadKPICardsWithDates(startDate, endDate);
        } else {
          alert('נא לבחור תאריך התחלה ותאריך סיום');
        }
      });
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
  // CUSTOMERS PAGE
  // ==========================================

  let customersPeriod = 'month';
  let customersSearchTerm = '';

  async function loadCustomersPage() {
    await Promise.all([
      loadCustomerStats(),
      loadTopCustomersFiltered()
    ]);
    setupCustomersPeriodSelector();
    setupCustomersSearch();
  }

  async function loadCustomerStats() {
    try {
      const response = await fetch(API_BASE + '/api/shopify/customers/stats');
      const data = await response.json();

      if (data.success) {
        const d = data.data;
        const el = (id) => document.getElementById(id);

        if (el('statTotalCustomers')) el('statTotalCustomers').textContent = d.totalCustomers;
        if (el('statNewCustomers')) el('statNewCustomers').textContent = d.newThisMonth;
        if (el('statReturningRate')) el('statReturningRate').textContent = d.returningRate + '%';
        if (el('statAvgLTV')) el('statAvgLTV').textContent = '₪' + d.avgLTV.toLocaleString();
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
      let url = API_BASE + '/api/shopify/analytics/top-customers?limit=20&period=' + period;
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

  function setupCustomersPeriodSelector() {
    const selector = document.getElementById('customersPeriodSelector');
    if (!selector) return;

    const periodBtns = selector.querySelectorAll('.period-btn[data-period]');
    console.log('Setting up', periodBtns.length, 'customer period buttons');

    periodBtns.forEach(btn => {
      // Remove existing listeners by cloning
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      newBtn.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('Customer period clicked:', this.dataset.period);
        selector.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        customersPeriod = this.dataset.period;
        loadTopCustomersFiltered(customersPeriod, customersSearchTerm);
      });
    });

    const customBtn = document.getElementById('customersCustomDateBtn');
    if (customBtn) {
      const newCustomBtn = customBtn.cloneNode(true);
      customBtn.parentNode.replaceChild(newCustomBtn, customBtn);

      newCustomBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const startDate = document.getElementById('customersStartDate').value;
        const endDate = document.getElementById('customersEndDate').value;
        if (startDate && endDate) {
          selector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
          loadTopCustomersWithDates(startDate, endDate, customersSearchTerm);
        } else {
          alert('נא לבחור תאריך התחלה ותאריך סיום');
        }
      });
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

  async function loadTopProducts() {
    await loadTopProductsFiltered();
    setupProductsPeriodSelector();
    setupProductsSearch();
    loadLowStockProducts();
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

    const periodBtns = selector.querySelectorAll('.period-btn[data-period]');
    console.log('Setting up', periodBtns.length, 'product period buttons');

    periodBtns.forEach(btn => {
      // Remove existing listeners by cloning
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      newBtn.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('Product period clicked:', this.dataset.period);
        selector.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        productsPeriod = this.dataset.period;
        loadTopProductsFiltered(productsPeriod, productsSearchTerm);
      });
    });

    const customBtn = document.getElementById('productsCustomDateBtn');
    if (customBtn) {
      const newCustomBtn = customBtn.cloneNode(true);
      customBtn.parentNode.replaceChild(newCustomBtn, customBtn);

      newCustomBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const startDate = document.getElementById('productsStartDate').value;
        const endDate = document.getElementById('productsEndDate').value;
        if (startDate && endDate) {
          selector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
          loadTopProductsWithDates(startDate, endDate, productsSearchTerm);
        } else {
          alert('נא לבחור תאריך התחלה ותאריך סיום');
        }
      });
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
  // COUPONS WITH TRACKING
  // ==========================================

  // Load tracked coupons from localStorage
  let trackedCoupons = JSON.parse(localStorage.getItem('trackedCoupons') || '[]');
  let allCoupons = [];

  function saveTrackedCoupons() {
    localStorage.setItem('trackedCoupons', JSON.stringify(trackedCoupons));
  }

  function isTracked(couponId) {
    return trackedCoupons.some(c => c.id === couponId || c.id == couponId);
  }

  function toggleTrackCoupon(coupon) {
    if (isTracked(coupon.id)) {
      trackedCoupons = trackedCoupons.filter(c => c.id !== coupon.id);
    } else {
      trackedCoupons.push({
        id: coupon.id,
        code: coupon.code || coupon.title,
        value: coupon.value,
        valueType: coupon.valueType,
        usageCount: coupon.usageCount || 0
      });
    }
    saveTrackedCoupons();
    renderTrackedCoupons();
    renderCouponsList(document.getElementById('couponSearch')?.value || '');
  }

  function removeTrackedCoupon(couponId) {
    trackedCoupons = trackedCoupons.filter(c => c.id != couponId);
    saveTrackedCoupons();
    renderTrackedCoupons();
    renderCouponsList(document.getElementById('couponSearch')?.value || '');
  }

  function renderTrackedCoupons() {
    const container = document.getElementById('trackedCouponsList');
    if (!container) return;

    // Update tracked coupons with latest data from allCoupons
    trackedCoupons = trackedCoupons.map(tc => {
      const latest = allCoupons.find(c => c.id === tc.id || c.code === tc.code);
      return latest ? { ...tc, usageCount: latest.usageCount || 0 } : tc;
    });
    saveTrackedCoupons();

    if (trackedCoupons.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">לחץ על ⭐ כדי להוסיף קופונים למעקב</p>';
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>קוד הנחה</th><th>הנחה</th><th>שימושים</th><th></th></tr></thead>
        <tbody>
          ${trackedCoupons.map(c => `
            <tr>
              <td><strong>⭐ ${c.code || c.title}</strong></td>
              <td>${formatDiscount(c.value, c.valueType)}</td>
              <td>${c.usageCount || 0}</td>
              <td>
                <button class="btn-remove-coupon" data-id="${c.id}" title="הסר ממעקב"
                  style="background: none; border: none; color: var(--error); cursor: pointer; font-size: 1.2rem;">
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
      btn.onclick = () => removeTrackedCoupon(btn.dataset.id);
    });
  }

  function formatDiscount(value, valueType) {
    if (!value) return '-';
    if (valueType === 'percentage') return value + '%';
    return '₪' + Math.abs(parseFloat(value));
  }

  function renderCouponsList(searchTerm = '') {
    const container = document.getElementById('couponsList');
    if (!container) return;

    let filtered = allCoupons;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = allCoupons.filter(c => (c.code || c.title || '').toLowerCase().includes(term));
    }

    if (filtered.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">לא נמצאו קופונים</p>';
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th></th><th>קוד הנחה</th><th>הנחה</th><th>שימושים</th><th>סטטוס</th></tr></thead>
        <tbody>
          ${filtered.map(d => `
            <tr>
              <td>
                <button class="btn-track-coupon" data-id="${d.id}" title="${isTracked(d.id) ? 'הסר ממעקב' : 'הוסף למעקב'}"
                  style="background: none; border: none; cursor: pointer; font-size: 1.2rem; color: ${isTracked(d.id) ? '#ffc107' : 'var(--text-muted)'};">
                  ${isTracked(d.id) ? '⭐' : '☆'}
                </button>
              </td>
              <td><strong>${d.code || d.title}</strong></td>
              <td>${formatDiscount(d.value, d.valueType)}</td>
              <td>${d.usageCount || 0}</td>
              <td>
                <span class="order-status ${d.isActive ? 'paid' : 'pending'}">
                  ${d.isActive ? 'פעיל' : 'לא פעיל'}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Add track button handlers
    container.querySelectorAll('.btn-track-coupon').forEach(btn => {
      btn.onclick = () => {
        const couponId = btn.dataset.id;
        const coupon = allCoupons.find(c => c.id == couponId);
        if (coupon) toggleTrackCoupon(coupon);
      };
    });
  }

  async function loadCoupons() {
    const container = document.getElementById('couponsList');
    if (!container) return;

    // Render tracked coupons first (from localStorage)
    renderTrackedCoupons();

    // Show loading state
    container.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>טוען קופונים...</p>
      </div>
    `;

    try {
      console.log('Fetching coupons from API...');

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(API_BASE + '/api/shopify/discounts', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Coupons API response:', data);

      if (data.success) {
        allCoupons = data.data || [];
        console.log(`Loaded ${allCoupons.length} coupons${data.cached ? ' (from cache)' : ''}`);

        if (allCoupons.length === 0) {
          container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">אין קופונים פעילים</p>';
          return;
        }

        // Update tracked coupons with latest data
        renderTrackedCoupons();
        renderCouponsList();

        // Setup search handler
        const searchInput = document.getElementById('couponSearch');
        if (searchInput) {
          searchInput.oninput = function() {
            renderCouponsList(this.value);
          };
        }
      } else {
        console.error('Coupons API error:', data.message);
        container.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <p style="color: var(--error);">שגיאה בטעינת קופונים</p>
            <p style="color: var(--text-muted); font-size: 0.85rem;">${data.message || 'Unknown error'}</p>
            <button onclick="loadCoupons()" style="margin-top: 10px; padding: 8px 16px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer;">נסה שוב</button>
          </div>
        `;
      }
    } catch (e) {
      console.error('Coupons fetch error:', e);
      const errorMessage = e.name === 'AbortError' ? 'הבקשה נכשלה - timeout' : e.message;
      container.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <p style="color: var(--error);">שגיאה בטעינת קופונים</p>
          <p style="color: var(--text-muted); font-size: 0.85rem;">${errorMessage}</p>
          <button onclick="loadCoupons()" style="margin-top: 10px; padding: 8px 16px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer;">נסה שוב</button>
        </div>
      `;
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
