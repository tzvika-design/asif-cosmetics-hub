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
    'shopify-analytics': 'דוחות מכירות',
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
      if (page === 'shopify-analytics') loadAnalytics();
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
      const data = await response.json();

      if (data.success) {
        badge.textContent = '✓ מחובר';
        badge.className = 'status-badge connected';
        if (desc && data.shop && data.shop.name) {
          desc.textContent = data.shop.name;
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

  async function checkMetaStatus() {
    const statusCard = document.getElementById('statusMeta');
    if (!statusCard) return;
    const badge = statusCard.querySelector('.status-badge');
    const desc = statusCard.querySelector('.status-card-content p');

    try {
      const response = await fetch(API_BASE + '/api/meta/status');
      const data = await response.json();

      if (data.connected) {
        badge.textContent = '✓ מחובר';
        badge.className = 'status-badge connected';
        if (desc && data.page && data.page.name) {
          desc.textContent = data.page.name;
        }
      } else if (data.configured) {
        badge.textContent = 'לא מחובר';
        badge.className = 'status-badge disconnected';
      } else {
        badge.textContent = 'לא מוגדר';
        badge.className = 'status-badge pending';
      }
    } catch (error) {
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
      const response = await fetch(API_BASE + '/api/shopify/analytics');
      const data = await response.json();

      if (data.success) {
        const { today, week, month, currency } = data.data;

        const el = (id) => document.getElementById(id);
        if (el('statOrdersToday')) el('statOrdersToday').textContent = today.orders;
        if (el('statOrdersWeek')) el('statOrdersWeek').textContent = week.orders;
        if (el('statSalesMonth')) el('statSalesMonth').textContent = formatCurrency(month.total, currency);
      }
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
  // TOP PRODUCTS
  // ==========================================

  async function loadTopProducts() {
    try {
      const response = await fetch(API_BASE + '/api/shopify/top-products');
      const data = await response.json();

      if (data.success) {
        const { bestByQuantity, bestByRevenue, lowStock } = data.data;

        // Render quantity list
        const qtyContainer = document.getElementById('topProductsQuantity');
        if (qtyContainer) {
          if (bestByQuantity.length === 0) {
            qtyContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center;">אין נתונים</p>';
          } else {
            qtyContainer.innerHTML = bestByQuantity.map((p, i) => `
              <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
                <span>${i + 1}. ${p.title}</span>
                <span style="color: var(--accent); font-weight: 600;">${p.quantity} נמכרו</span>
              </div>
            `).join('');
          }
        }

        // Render revenue list
        const revContainer = document.getElementById('topProductsRevenue');
        if (revContainer) {
          if (bestByRevenue.length === 0) {
            revContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center;">אין נתונים</p>';
          } else {
            revContainer.innerHTML = bestByRevenue.map((p, i) => `
              <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
                <span>${i + 1}. ${p.title}</span>
                <span style="color: var(--accent); font-weight: 600;">₪${p.revenue.toFixed(0)}</span>
              </div>
            `).join('');
          }
        }

        // Render low stock
        const stockContainer = document.getElementById('lowStockProducts');
        if (stockContainer) {
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
      }
    } catch (e) {
      console.error('Top products error:', e);
    }
  }

  // ==========================================
  // COUPONS
  // ==========================================

  async function loadCoupons() {
    const container = document.getElementById('couponsList');
    if (!container) return;

    try {
      const response = await fetch(API_BASE + '/api/shopify/discounts');
      const data = await response.json();

      if (data.success) {
        const discounts = data.data;

        if (discounts.length === 0) {
          container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">אין קופונים פעילים</p>';
          return;
        }

        container.innerHTML = `
          <table class="data-table">
            <thead><tr><th>קוד הנחה</th><th>הנחה</th><th>שימושים</th></tr></thead>
            <tbody>
              ${discounts.map(d => `
                <tr>
                  <td><strong>${d.title}</strong></td>
                  <td>${d.valueType === 'percentage' ? d.value + '%' : '₪' + Math.abs(d.value)}</td>
                  <td>${d.totalUsage}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    } catch (e) {
      container.innerHTML = '<p style="color: var(--error); text-align: center;">שגיאה בטעינת קופונים</p>';
    }
  }

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
