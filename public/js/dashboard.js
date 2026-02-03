/**
 * Asif Cosmetics Hub - Dashboard JavaScript
 * Proper state management with loading states
 */

document.addEventListener('DOMContentLoaded', function() {
  const API_BASE = window.location.origin;

  // ==========================================
  // LOADING STATE MANAGEMENT
  // ==========================================

  // Inject CSS for loading states
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid var(--border, #333);
      border-top-color: var(--accent, #d4a853);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 20px;
      color: var(--text-muted, #888);
    }
    .skeleton {
      background: linear-gradient(90deg, var(--bg-secondary, #1a1a1a) 25%, var(--border, #333) 50%, var(--bg-secondary, #1a1a1a) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 4px;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .skeleton-text {
      height: 1.2em;
      width: 80%;
    }
    .skeleton-number {
      height: 2em;
      width: 60%;
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

  // Store for app state
  const state = {
    currentPeriod: 'month',
    customersPeriod: 'month',
    productsPeriod: 'month',
    isLoading: {
      analytics: false,
      customers: false,
      products: false
    },
    recentPosts: JSON.parse(localStorage.getItem('recentPosts') || '[]'),
    products: [],
    trackedCoupons: JSON.parse(localStorage.getItem('trackedCoupons') || '[]')
  };

  // ==========================================
  // SKELETON LOADERS
  // ==========================================

  function showKPISkeletons() {
    const ids = ['kpiTodaySales', 'kpiTodayOrders', 'kpiTodayOrderCount', 'kpiAvgOrder', 'kpiReturningRate'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="skeleton skeleton-number"></div>';
    });
  }

  function showChartSkeleton() {
    const container = document.querySelector('#page-shopify-analytics .chart-container');
    if (container) {
      container.innerHTML = `
        <div class="loading-container" style="height: 200px;">
          <div class="spinner"></div>
          <span>טוען נתונים...</span>
        </div>
      `;
    }
  }

  function showTableSkeleton(tbodyId, cols = 5, rows = 5) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    tbody.innerHTML = Array(rows).fill(0).map(() => `
      <tr>
        ${Array(cols).fill(0).map(() => '<td><div class="skeleton skeleton-text"></div></td>').join('')}
      </tr>
    `).join('');
  }

  function showProductsSkeletons() {
    const qtyContainer = document.getElementById('topProductsQuantity');
    const revContainer = document.getElementById('topProductsRevenue');
    const skeleton = `
      <div class="loading-container">
        <div class="spinner"></div>
        <span>טוען...</span>
      </div>
    `;
    if (qtyContainer) qtyContainer.innerHTML = skeleton;
    if (revContainer) revContainer.innerHTML = skeleton;
  }

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

      // Load page data - show loading FIRST, then fetch
      if (page === 'shopify-analytics') {
        showAnalyticsLoading();
        loadAnalyticsPage();
      }
      if (page === 'shopify-customers') {
        showCustomersLoading();
        loadCustomersPage();
      }
      if (page === 'shopify-products') {
        showProductsLoading();
        loadProductsPage();
      }
      if (page === 'shopify-coupons') loadCouponsPage();
      if (page === 'creative-agent') loadCreativeAgent();
      if (page === 'publish') renderRecentPosts('publishedPostsList');
    });
  });

  // ==========================================
  // ANALYTICS PAGE
  // ==========================================

  let analyticsInitialized = false;

  function showAnalyticsLoading() {
    showKPISkeletons();
    showChartSkeleton();
    showTableSkeleton('topProductsBody', 4, 5);
    showTableSkeleton('recentOrdersBody', 5, 5);
  }

  async function loadAnalyticsPage() {
    if (state.isLoading.analytics) return;
    state.isLoading.analytics = true;

    // Setup event listeners only once
    if (!analyticsInitialized) {
      setupAnalyticsPeriodSelector();
      analyticsInitialized = true;
    }

    try {
      // Load all data in parallel
      await Promise.all([
        loadKPICards(state.currentPeriod),
        loadSalesChart(state.currentPeriod),
        loadTopProductsTable(),
        loadRecentOrders()
      ]);
    } catch (error) {
      console.error('[Analytics] Error:', error);
    } finally {
      state.isLoading.analytics = false;
    }
  }

  function setupAnalyticsPeriodSelector() {
    const selector = document.getElementById('analyticsPeriodSelector');
    if (!selector) return;

    selector.onclick = function(e) {
      const btn = e.target.closest('.period-btn[data-period]');
      if (!btn || state.isLoading.analytics) return;

      e.preventDefault();
      const period = btn.dataset.period;

      // Update UI immediately
      selector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Show loading IMMEDIATELY
      showKPISkeletons();
      showChartSkeleton();

      // Update state and load
      state.currentPeriod = period;
      loadKPICards(period);
      loadSalesChart(period);
      loadTopProductsTable();
    };

    // Custom date button
    const customBtn = document.getElementById('analyticsCustomDateBtn');
    if (customBtn) {
      customBtn.onclick = function(e) {
        e.preventDefault();
        const startDate = document.getElementById('analyticsStartDate')?.value;
        const endDate = document.getElementById('analyticsEndDate')?.value;

        if (startDate && endDate) {
          selector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
          showKPISkeletons();
          showChartSkeleton();
          loadKPICardsWithDates(startDate, endDate);
          loadSalesChartWithDates(startDate, endDate);
        } else {
          alert('נא לבחור תאריך התחלה ותאריך סיום');
        }
      };
    }
  }

  async function loadKPICards(period, retryCount = 0) {
    try {
      const response = await fetch(`${API_BASE}/api/shopify/analytics/summary?period=${period}`);
      const data = await response.json();

      if (data.success) {
        const d = data.data;
        const totalSales = Math.round(d.totalSales || 0);
        const orderCount = d.orderCount || 0;
        const avgOrder = Math.round(d.avgOrderValue || 0);
        const returningRate = d.returningRate || 0;

        updateElement('kpiTodaySales', '₪' + totalSales.toLocaleString());
        updateElement('kpiTodayOrders', orderCount + ' הזמנות');
        updateElement('kpiTodayOrderCount', orderCount);
        updateElement('kpiAvgOrder', '₪' + avgOrder.toLocaleString());
        updateElement('kpiReturningRate', returningRate + '%');

        // Update period label
        if (d.period) {
          updateElement('chartPeriodLabel', `${d.period.start} - ${d.period.end}`);
        }

        // Log detailed info for debugging
        console.log(`[KPI] Loaded: ₪${totalSales}, ${orderCount} orders, avg ₪${avgOrder} (${data.responseTime}ms, cached: ${data.cached})`);

        // Show warning if all values are 0
        if (totalSales === 0 && orderCount === 0) {
          console.warn('[KPI] All values are 0 - check /api/shopify/debug for diagnostics');
        }
      } else {
        throw new Error(data.message || 'API returned error');
      }
    } catch (error) {
      console.error('[KPI] Error:', error);

      // Retry once after 2 seconds
      if (retryCount < 1) {
        console.log('[KPI] Retrying in 2 seconds...');
        setTimeout(() => loadKPICards(period, retryCount + 1), 2000);
        return;
      }

      updateElement('kpiTodaySales', 'שגיאה');
      updateElement('kpiTodayOrders', '-');
      updateElement('kpiAvgOrder', '-');
      updateElement('kpiReturningRate', '-');
    }
  }

  async function loadKPICardsWithDates(startDate, endDate) {
    try {
      const response = await fetch(`${API_BASE}/api/shopify/analytics/summary?startDate=${startDate}&endDate=${endDate}`);
      const data = await response.json();

      if (data.success) {
        const d = data.data;
        updateElement('kpiTodaySales', '₪' + Math.round(d.totalSales || 0).toLocaleString());
        updateElement('kpiTodayOrders', (d.orderCount || 0) + ' הזמנות');
        updateElement('kpiTodayOrderCount', d.orderCount || 0);
        updateElement('kpiAvgOrder', '₪' + Math.round(d.avgOrderValue || 0).toLocaleString());
        updateElement('kpiReturningRate', (d.returningRate || 0) + '%');

        if (d.period) {
          updateElement('chartPeriodLabel', `${d.period.start} - ${d.period.end}`);
        }
      }
    } catch (error) {
      console.error('[KPI] Error:', error);
    }
  }

  async function loadSalesChart(period) {
    try {
      const response = await fetch(`${API_BASE}/api/shopify/analytics/sales-chart?period=${period}`);
      const data = await response.json();

      if (data.success && data.data?.length > 0) {
        renderChart(data.data);
        console.log(`[Chart] Loaded ${data.data.length} points (${data.responseTime}ms)`);
      } else {
        showChartEmpty();
      }
    } catch (error) {
      console.error('[Chart] Error:', error);
      showChartError();
    }
  }

  async function loadSalesChartWithDates(startDate, endDate) {
    try {
      const response = await fetch(`${API_BASE}/api/shopify/analytics/sales-chart?startDate=${startDate}&endDate=${endDate}`);
      const data = await response.json();

      if (data.success && data.data?.length > 0) {
        renderChart(data.data);
      } else {
        showChartEmpty();
      }
    } catch (error) {
      console.error('[Chart] Error:', error);
      showChartError();
    }
  }

  let salesChart = null;

  function renderChart(chartData) {
    const container = document.querySelector('#page-shopify-analytics .chart-container');
    if (!container) return;

    if (typeof Chart === 'undefined') {
      console.error('[Chart] Chart.js not loaded');
      showChartError();
      return;
    }

    // Destroy existing chart
    if (salesChart) {
      salesChart.destroy();
      salesChart = null;
    }

    // Create canvas
    container.innerHTML = '<canvas id="salesChartCanvas" style="width:100%;height:100%;"></canvas>';
    const canvas = document.getElementById('salesChartCanvas');
    if (!canvas) return;

    // Limit to last 14 days for readability
    const displayData = chartData.slice(-14);

    try {
      salesChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: displayData.map(d => d.label.split('/').slice(0, 2).join('/')),
          datasets: [{
            label: 'מכירות',
            data: displayData.map(d => d.sales),
            borderColor: '#d4a853',
            backgroundColor: 'rgba(212, 168, 83, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointBackgroundColor: '#d4a853',
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              rtl: true,
              callbacks: {
                label: ctx => '₪' + ctx.parsed.y.toLocaleString()
              }
            }
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
            y: {
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { color: '#888', callback: v => '₪' + v.toLocaleString() },
              beginAtZero: true
            }
          }
        }
      });
    } catch (error) {
      console.error('[Chart] Render error:', error);
      showChartError();
    }
  }

  function showChartEmpty() {
    const container = document.querySelector('#page-shopify-analytics .chart-container');
    if (container) {
      container.innerHTML = '<div class="loading-container"><span>אין נתוני מכירות לתקופה זו</span></div>';
    }
  }

  function showChartError() {
    const container = document.querySelector('#page-shopify-analytics .chart-container');
    if (container) {
      container.innerHTML = '<div class="loading-container"><span style="color: var(--error);">שגיאה בטעינת הגרף</span></div>';
    }
  }

  async function loadTopProductsTable() {
    const tbody = document.getElementById('topProductsBody');
    if (!tbody) return;

    try {
      const response = await fetch(`${API_BASE}/api/shopify/analytics/top-products?limit=8`);
      const data = await response.json();

      if (data.success && data.data?.length > 0) {
        tbody.innerHTML = data.data.map(p => `
          <tr>
            <td class="product-cell">
              ${p.image ? `<img src="${p.image}" class="product-image-small" alt="">` : ''}
              <span>${truncate(p.title, 30)}</span>
            </td>
            <td>${p.quantity}</td>
            <td><strong>₪${p.revenue.toLocaleString()}</strong></td>
            <td style="color: ${p.inventory <= 5 ? 'var(--error)' : 'var(--text-muted)'}">${p.inventory || '-'}</td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">אין נתונים</td></tr>';
      }
    } catch (error) {
      console.error('[TopProducts] Error:', error);
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--error);">שגיאה בטעינה</td></tr>';
    }
  }

  async function loadRecentOrders() {
    const tbody = document.getElementById('recentOrdersBody');
    if (!tbody) return;

    try {
      const response = await fetch(`${API_BASE}/api/shopify/orders/recent?limit=10`);
      const data = await response.json();

      if (data.success && data.data?.length > 0) {
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
    } catch (error) {
      console.error('[RecentOrders] Error:', error);
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--error);">שגיאה בטעינה</td></tr>';
    }
  }

  // ==========================================
  // CUSTOMERS PAGE
  // ==========================================

  let customersInitialized = false;
  let customersData = [];
  let customersSortColumn = 'totalSpend';
  let customersSortAsc = false;
  let customersSearchTerm = '';

  function showCustomersLoading() {
    showCustomerStatsSkeletons();
    showTableSkeleton('topCustomersBody', 5, 8);
  }

  function showCustomerStatsSkeletons() {
    const ids = ['statTotalCustomers', 'statNewCustomers', 'statReturningRate', 'statAvgLTV'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="skeleton skeleton-number"></div>';
    });
  }

  async function loadCustomersPage() {
    if (state.isLoading.customers) return;
    state.isLoading.customers = true;

    if (!customersInitialized) {
      setupCustomersPeriodSelector();
      setupCustomersSearch();
      setupCustomersSorting();
      customersInitialized = true;
    }

    try {
      await loadCustomers(state.customersPeriod, customersSearchTerm);
    } catch (error) {
      console.error('[Customers] Error:', error);
    } finally {
      state.isLoading.customers = false;
    }
  }

  function setupCustomersPeriodSelector() {
    const selector = document.getElementById('customersPeriodSelector');
    if (!selector) return;

    selector.onclick = function(e) {
      const btn = e.target.closest('.period-btn[data-period]');
      if (!btn) return;

      e.preventDefault();
      const period = btn.dataset.period;

      selector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      showCustomersLoading();
      state.customersPeriod = period;
      loadCustomers(period, customersSearchTerm);
    };
  }

  function setupCustomersSearch() {
    const searchInput = document.getElementById('customerSearch');
    if (!searchInput) return;

    let debounceTimer;
    searchInput.oninput = function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        customersSearchTerm = this.value;
        showTableSkeleton('topCustomersBody', 5, 8);
        loadCustomers(state.customersPeriod, customersSearchTerm);
      }, 300);
    };
  }

  function setupCustomersSorting() {
    const table = document.getElementById('topCustomersTable');
    if (!table) return;

    const thead = table.querySelector('thead tr');
    if (thead) {
      thead.innerHTML = `
        <th data-sort="name" style="cursor: pointer;">לקוח<span class="sort-arrow"> ⇅</span></th>
        <th data-sort="email" style="cursor: pointer;">אימייל<span class="sort-arrow"> ⇅</span></th>
        <th data-sort="orderCount" style="cursor: pointer;">הזמנות<span class="sort-arrow"> ⇅</span></th>
        <th data-sort="totalSpend" style="cursor: pointer;">סה"כ<span class="sort-arrow"> ▼</span></th>
        <th data-sort="lastOrderDate" style="cursor: pointer;">אחרון<span class="sort-arrow"> ⇅</span></th>
      `;

      thead.querySelectorAll('th[data-sort]').forEach(th => {
        th.onclick = () => {
          const col = th.dataset.sort;
          if (customersSortColumn === col) {
            customersSortAsc = !customersSortAsc;
          } else {
            customersSortColumn = col;
            customersSortAsc = false;
          }
          renderCustomersTable();
          updateSortIndicators(thead);
        };
      });
    }
  }

  function updateSortIndicators(thead) {
    thead.querySelectorAll('th[data-sort]').forEach(th => {
      const arrow = th.querySelector('.sort-arrow');
      if (th.dataset.sort === customersSortColumn) {
        arrow.textContent = customersSortAsc ? ' ▲' : ' ▼';
      } else {
        arrow.textContent = ' ⇅';
      }
    });
  }

  async function loadCustomers(period, search = '') {
    try {
      let url = `${API_BASE}/api/shopify/analytics/top-customers?limit=100&period=${period}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const response = await fetch(url);
      const data = await response.json();

      // Update stats
      if (data.stats) {
        updateElement('statTotalCustomers', data.stats.totalCustomers || 0);
        updateElement('statNewCustomers', data.stats.newCustomers || 0);
        updateElement('statReturningRate', (data.stats.returningRate || 0) + '%');
        updateElement('statAvgLTV', '₪' + Math.round(data.stats.avgLTV || 0).toLocaleString());
      }

      // Update period label
      const countLabel = document.getElementById('customersCountLabel');
      if (countLabel && data.period) {
        countLabel.textContent = `${data.stats?.totalCustomers || 0} לקוחות | ${data.period.start} - ${data.period.end}`;
      }

      if (data.success && data.data?.length > 0) {
        customersData = data.data;
        renderCustomersTable();
      } else {
        customersData = [];
        const tbody = document.getElementById('topCustomersBody');
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">אין נתונים לתקופה זו</td></tr>';
        }
      }

      console.log(`[Customers] Loaded ${data.data?.length || 0} (${data.responseTime}ms)`);
    } catch (error) {
      console.error('[Customers] Error:', error);
    }
  }

  function renderCustomersTable() {
    const tbody = document.getElementById('topCustomersBody');
    if (!tbody || customersData.length === 0) return;

    // Sort data
    const sorted = [...customersData].sort((a, b) => {
      let aVal, bVal;

      switch (customersSortColumn) {
        case 'name':
          return customersSortAsc
            ? (a.name || '').localeCompare(b.name || '', 'he')
            : (b.name || '').localeCompare(a.name || '', 'he');
        case 'email':
          return customersSortAsc
            ? (a.email || '').localeCompare(b.email || '')
            : (b.email || '').localeCompare(a.email || '');
        case 'orderCount':
          aVal = a.orderCount || 0;
          bVal = b.orderCount || 0;
          break;
        case 'totalSpend':
          aVal = a.totalSpend || 0;
          bVal = b.totalSpend || 0;
          break;
        default:
          return 0;
      }

      return customersSortAsc ? aVal - bVal : bVal - aVal;
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

  // ==========================================
  // PRODUCTS PAGE
  // ==========================================

  let productsInitialized = false;
  let productsSearchTerm = '';

  function showProductsLoading() {
    showProductsSkeletons();
  }

  async function loadProductsPage() {
    if (state.isLoading.products) return;
    state.isLoading.products = true;

    if (!productsInitialized) {
      setupProductsPeriodSelector();
      setupProductsSearch();
      productsInitialized = true;
    }

    try {
      await loadProducts(state.productsPeriod, productsSearchTerm);
      loadLowStockProducts();
    } catch (error) {
      console.error('[Products] Error:', error);
    } finally {
      state.isLoading.products = false;
    }
  }

  function setupProductsPeriodSelector() {
    const selector = document.getElementById('productsPeriodSelector');
    if (!selector) return;

    selector.onclick = function(e) {
      const btn = e.target.closest('.period-btn[data-period]');
      if (!btn) return;

      e.preventDefault();
      const period = btn.dataset.period;

      selector.querySelectorAll('.period-btn[data-period]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      showProductsSkeletons();
      state.productsPeriod = period;
      loadProducts(period, productsSearchTerm);
    };
  }

  function setupProductsSearch() {
    const searchInput = document.getElementById('productSearch');
    if (!searchInput) return;

    let debounceTimer;
    searchInput.oninput = function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        productsSearchTerm = this.value;
        showProductsSkeletons();
        loadProducts(state.productsPeriod, productsSearchTerm);
      }, 300);
    };
  }

  async function loadProducts(period, search = '') {
    const qtyContainer = document.getElementById('topProductsQuantity');
    const revContainer = document.getElementById('topProductsRevenue');

    try {
      let url = `${API_BASE}/api/shopify/analytics/top-products?limit=10&period=${period}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const response = await fetch(url);
      const data = await response.json();

      // Update period labels
      const qtyCount = document.getElementById('productsQuantityCount');
      const revCount = document.getElementById('productsRevenueCount');
      if (qtyCount && data.period) qtyCount.textContent = `${data.period.start} - ${data.period.end}`;
      if (revCount && data.period) revCount.textContent = `${data.period.start} - ${data.period.end}`;

      if (data.success) {
        const byQuantity = data.byQuantity || [];
        const byRevenue = data.byRevenue || data.data || [];

        if (qtyContainer) {
          qtyContainer.innerHTML = byQuantity.length === 0
            ? '<p style="color: var(--text-muted); text-align: center;">אין נתונים</p>'
            : byQuantity.map((p, i) => `
                <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
                  <span>${i + 1}. ${p.title}</span>
                  <span style="color: var(--accent); font-weight: 600;">${p.quantity} נמכרו</span>
                </div>
              `).join('');
        }

        if (revContainer) {
          revContainer.innerHTML = byRevenue.length === 0
            ? '<p style="color: var(--text-muted); text-align: center;">אין נתונים</p>'
            : byRevenue.map((p, i) => `
                <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
                  <span>${i + 1}. ${p.title}</span>
                  <span style="color: var(--accent); font-weight: 600;">₪${p.revenue.toLocaleString()}</span>
                </div>
              `).join('');
        }
      }
    } catch (error) {
      console.error('[Products] Error:', error);
      if (qtyContainer) qtyContainer.innerHTML = '<p style="color: var(--error);">שגיאה בטעינה</p>';
      if (revContainer) revContainer.innerHTML = '<p style="color: var(--error);">שגיאה בטעינה</p>';
    }
  }

  async function loadLowStockProducts() {
    const container = document.getElementById('lowStockProducts');
    if (!container) return;

    try {
      const response = await fetch(`${API_BASE}/api/shopify/top-products`);
      const data = await response.json();

      if (data.success) {
        const lowStock = data.data.lowStock || [];

        container.innerHTML = lowStock.length === 0
          ? '<p style="color: var(--success); text-align: center;">✓ כל המוצרים במלאי תקין</p>'
          : `
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
    } catch (error) {
      console.error('[LowStock] Error:', error);
    }
  }

  // ==========================================
  // COUPONS PAGE
  // ==========================================

  function loadCouponsPage() {
    renderTrackedCoupons();

    const searchBtn = document.getElementById('couponSearchBtn');
    const searchInput = document.getElementById('couponSearch');
    const resultContainer = document.getElementById('couponSearchResult');

    if (resultContainer) {
      resultContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 15px;">הזן קוד קופון ולחץ חפש</p>';
    }

    if (searchBtn) {
      searchBtn.onclick = () => {
        if (searchInput) searchCoupon(searchInput.value);
      };
    }

    if (searchInput) {
      searchInput.onkeydown = (e) => {
        if (e.key === 'Enter') searchCoupon(searchInput.value);
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

    if (searchBtn) {
      searchBtn.disabled = true;
      searchBtn.textContent = '🔍 מחפש...';
    }

    if (resultContainer) {
      resultContainer.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>מחפש קופון...</p></div>';
    }

    try {
      const response = await fetch(`${API_BASE}/api/shopify/discounts/search?code=${encodeURIComponent(code.trim())}`);
      const data = await response.json();

      if (data.success && data.data) {
        renderCouponResult(data.data);
      } else {
        resultContainer.innerHTML = `
          <p style="color: var(--error); text-align: center; margin-top: 15px;">${data.message || 'לא נמצא קופון'}</p>
          ${data.hint ? `<p style="color: var(--text-muted); text-align: center; margin-top: 10px; font-size: 0.85rem;">${data.hint}</p>` : ''}
        `;
      }
    } catch (error) {
      console.error('[Coupon] Error:', error);
      if (resultContainer) {
        resultContainer.innerHTML = '<p style="color: var(--error); text-align: center; margin-top: 15px;">שגיאה בחיפוש</p>';
      }
    }

    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.textContent = '🔍 חפש';
    }
  }

  function renderCouponResult(coupon) {
    const container = document.getElementById('couponSearchResult');
    if (!container) return;

    const isTracked = state.trackedCoupons.some(c => c.code.toUpperCase() === coupon.code.toUpperCase());

    container.innerHTML = `
      <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-top: 15px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h3 style="margin: 0; color: var(--accent);">${coupon.code}</h3>
          <span class="order-status ${coupon.isActive ? 'paid' : 'pending'}">
            ${coupon.isActive ? '✓ פעיל' : '✗ לא פעיל'}
          </span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
          <div>
            <div style="color: var(--text-muted); font-size: 0.8rem;">הנחה</div>
            <div style="font-size: 1.3rem; font-weight: 600; color: var(--accent);">
              ${formatDiscount(coupon.value, coupon.valueType)}
            </div>
          </div>
          <div>
            <div style="color: var(--text-muted); font-size: 0.8rem;">שימושים</div>
            <div style="font-size: 1.3rem; font-weight: 600;">
              ${coupon.usageCount || 0}${coupon.usageLimit ? ' / ' + coupon.usageLimit : ''}
            </div>
          </div>
        </div>
        <button id="btnAddToTracked" class="btn ${isTracked ? 'btn-secondary' : 'btn-primary'}" style="margin-top: 20px; width: 100%;">
          ${isTracked ? '✓ במעקב' : '⭐ הוסף למעקב'}
        </button>
      </div>
    `;

    if (!isTracked) {
      document.getElementById('btnAddToTracked').onclick = () => {
        addTrackedCoupon(coupon);
        renderCouponResult(coupon);
      };
    }
  }

  function formatDiscount(value, valueType) {
    if (!value) return '-';
    if (valueType === 'percentage') return Math.abs(parseFloat(value)) + '%';
    return '₪' + Math.abs(parseFloat(value));
  }

  function addTrackedCoupon(coupon) {
    if (!state.trackedCoupons.some(c => c.code.toUpperCase() === coupon.code.toUpperCase())) {
      state.trackedCoupons.push({
        id: coupon.id,
        code: coupon.code,
        value: coupon.value,
        valueType: coupon.valueType,
        usageCount: coupon.usageCount || 0,
        isActive: coupon.isActive
      });
      localStorage.setItem('trackedCoupons', JSON.stringify(state.trackedCoupons));
      renderTrackedCoupons();
    }
  }

  function removeTrackedCoupon(code) {
    state.trackedCoupons = state.trackedCoupons.filter(c => c.code.toUpperCase() !== code.toUpperCase());
    localStorage.setItem('trackedCoupons', JSON.stringify(state.trackedCoupons));
    renderTrackedCoupons();
  }

  function renderTrackedCoupons() {
    const container = document.getElementById('trackedCouponsList');
    if (!container) return;

    if (state.trackedCoupons.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">חפש קופון והוסף אותו למעקב</p>';
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>קוד</th><th>הנחה</th><th>שימושים</th><th>סטטוס</th><th></th></tr></thead>
        <tbody>
          ${state.trackedCoupons.map(c => `
            <tr>
              <td><strong>${c.code}</strong></td>
              <td>${formatDiscount(c.value, c.valueType)}</td>
              <td>${c.usageCount || 0}</td>
              <td><span class="order-status ${c.isActive ? 'paid' : 'pending'}">${c.isActive ? 'פעיל' : 'לא פעיל'}</span></td>
              <td>
                <button class="btn-remove-coupon" data-code="${c.code}"
                  style="background: none; border: none; color: var(--error); cursor: pointer; font-size: 1rem;">✕</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    container.querySelectorAll('.btn-remove-coupon').forEach(btn => {
      btn.onclick = () => removeTrackedCoupon(btn.dataset.code);
    });
  }

  // ==========================================
  // CREATIVE AGENT
  // ==========================================

  async function loadCreativeAgent() {
    const productSelect = document.getElementById('productSelect');
    if (!productSelect || state.products.length > 0) return;

    try {
      const response = await fetch(`${API_BASE}/api/shopify/products`);
      const data = await response.json();

      if (data.success) {
        state.products = data.data;
        productSelect.innerHTML = '<option value="">-- בחר מוצר --</option>' +
          state.products.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
      }
    } catch (error) {
      console.error('[Creative] Error:', error);
    }
  }

  // ==========================================
  // QUICK STATS (Dashboard)
  // ==========================================

  async function loadQuickStats() {
    try {
      const [weekResponse, monthResponse, todayResponse] = await Promise.all([
        fetch(`${API_BASE}/api/shopify/analytics/summary?period=week`),
        fetch(`${API_BASE}/api/shopify/analytics/summary?period=month`),
        fetch(`${API_BASE}/api/shopify/analytics/summary?period=today`)
      ]);

      const weekData = await weekResponse.json();
      const monthData = await monthResponse.json();
      const todayData = await todayResponse.json();

      // Today's orders - use today period
      if (todayData.success) {
        const todayOrders = todayData.data.orderCount || 0;
        updateElement('statOrdersToday', todayOrders);
        console.log(`[QuickStats] Today: ${todayOrders} orders`);
      }

      // Week's orders
      if (weekData.success) {
        const weekOrders = weekData.data.orderCount || 0;
        updateElement('statOrdersWeek', weekOrders);
        console.log(`[QuickStats] Week: ${weekOrders} orders`);
      }

      // Month's sales
      if (monthData.success) {
        const monthSales = Math.round(monthData.data.totalSales || 0);
        updateElement('statSalesMonth', '₪' + monthSales.toLocaleString());
        console.log(`[QuickStats] Month: ₪${monthSales}`);
      }

      // Debug: Log if all values are 0
      if (todayData.success && weekData.success && monthData.success) {
        const allZero = (todayData.data.orderCount === 0 &&
                        weekData.data.orderCount === 0 &&
                        monthData.data.totalSales === 0);
        if (allZero) {
          console.warn('[QuickStats] All values are 0 - Visit /api/shopify/debug to diagnose');
        }
      }
    } catch (error) {
      console.error('[QuickStats] Error:', error);
      updateElement('statOrdersToday', '-');
      updateElement('statOrdersWeek', '-');
      updateElement('statSalesMonth', '-');
    }

    updateElement('statPostsMonth', state.recentPosts.length);
  }

  // ==========================================
  // STATUS CHECKING
  // ==========================================

  async function checkAllStatuses() {
    await Promise.all([checkClaudeStatus(), checkShopifyStatus(), checkMetaStatus()]);
  }

  async function checkClaudeStatus() {
    const statusCard = document.getElementById('statusClaude');
    const settingsStatus = document.getElementById('settingsClaudeStatus');

    try {
      const response = await fetch(`${API_BASE}/api/chat`);
      const data = await response.json();

      const isConnected = data.status === 'ready';
      const statusText = isConnected ? '✓ מחובר' : 'לא מחובר';
      const statusClass = isConnected ? 'connected' : 'disconnected';

      // Update dashboard card
      if (statusCard) {
        const badge = statusCard.querySelector('.status-badge');
        if (badge) {
          badge.textContent = statusText;
          badge.className = 'status-badge ' + statusClass;
        }
      }

      // Update settings page
      if (settingsStatus) {
        settingsStatus.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
      }
    } catch (error) {
      console.error('[Claude Status] Error:', error);
      if (statusCard) {
        const badge = statusCard.querySelector('.status-badge');
        if (badge) {
          badge.textContent = 'שגיאה';
          badge.className = 'status-badge disconnected';
        }
      }
    }
  }

  async function checkShopifyStatus() {
    const statusCard = document.getElementById('statusShopify');
    const settingsStatus = document.getElementById('settingsShopifyStatus');

    try {
      const response = await fetch(`${API_BASE}/api/shopify/test`);
      const data = await response.json();

      const isConnected = data.success;
      const statusText = isConnected ? '✓ מחובר' : (data.configured ? 'שגיאת חיבור' : 'לא מוגדר');
      const statusClass = isConnected ? 'connected' : 'disconnected';

      // Update dashboard card
      if (statusCard) {
        const badge = statusCard.querySelector('.status-badge');
        if (badge) {
          badge.textContent = statusText;
          badge.className = 'status-badge ' + statusClass;
        }
      }

      // Update settings page
      if (settingsStatus) {
        settingsStatus.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
      }
    } catch (error) {
      console.error('[Shopify Status] Error:', error);
      if (statusCard) {
        const badge = statusCard.querySelector('.status-badge');
        if (badge) {
          badge.textContent = 'שגיאה';
          badge.className = 'status-badge disconnected';
        }
      }
    }
  }

  async function checkMetaStatus() {
    const statusCard = document.getElementById('statusMeta');
    const settingsStatus = document.getElementById('settingsMetaStatus');

    try {
      const response = await fetch(`${API_BASE}/api/meta/status`);
      const data = await response.json();

      let statusText, statusClass;
      if (data.connected) {
        statusText = '✓ מחובר';
        statusClass = 'connected';
      } else if (data.configured) {
        statusText = 'טוקן לא תקין';
        statusClass = 'disconnected';
      } else {
        statusText = 'לא מוגדר';
        statusClass = 'pending';
      }

      // Update dashboard card
      if (statusCard) {
        const badge = statusCard.querySelector('.status-badge');
        if (badge) {
          badge.textContent = statusText;
          badge.className = 'status-badge ' + statusClass;
        }
      }

      // Update settings page
      if (settingsStatus) {
        settingsStatus.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
      }
    } catch (error) {
      console.error('[Meta Status] Error:', error);
      if (statusCard) {
        const badge = statusCard.querySelector('.status-badge');
        if (badge) {
          badge.textContent = 'שגיאה';
          badge.className = 'status-badge disconnected';
        }
      }
    }
  }

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  function updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function truncate(str, len) {
    return str.length > len ? str.substring(0, len) + '...' : str;
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

  function renderRecentPosts(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (state.recentPosts.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">אין פוסטים אחרונים</p>';
      return;
    }

    container.innerHTML = state.recentPosts.slice(0, 5).map(post => `
      <div class="recent-post">
        <div class="recent-post-icon ${post.platform}">${post.platform === 'facebook' ? '📘' : '📷'}</div>
        <div class="recent-post-content">
          <div class="recent-post-text">${post.content}...</div>
          <div class="recent-post-time">${formatTimeAgo(post.time)}</div>
        </div>
      </div>
    `).join('');
  }

  // ==========================================
  // DEBUG / DIAGNOSTICS
  // ==========================================

  async function runDebugCheck() {
    const resultsDiv = document.getElementById('debugResults');
    if (!resultsDiv) return;

    resultsDiv.innerHTML = '<span style="color: var(--accent);">⏳ מריץ בדיקות...</span>';

    try {
      const response = await fetch(`${API_BASE}/api/shopify/debug`);
      const data = await response.json();

      let html = '';

      // Environment
      html += `<div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--border);">`;
      html += `<strong style="color: var(--accent);">🔧 סביבה:</strong><br>`;
      html += `Shopify URL: ${data.environment?.hasShopifyUrl ? '✅ מוגדר' : '❌ חסר'}<br>`;
      html += `Access Token: ${data.environment?.hasAccessToken ? '✅ מוגדר' : '❌ חסר'}<br>`;
      html += `</div>`;

      // Preloader Status
      html += `<div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--border);">`;
      html += `<strong style="color: var(--accent);">📦 Preloader:</strong><br>`;
      html += `מוכן: ${data.preloader?.isReady ? '✅' : '❌'}<br>`;
      html += `טעינה אחרונה: ${data.preloader?.lastLoadTime || 'לא טען'}<br>`;
      html += `</div>`;

      // Tests
      html += `<div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--border);">`;
      html += `<strong style="color: var(--accent);">🧪 בדיקות:</strong><br>`;

      if (data.tests?.todayOrders) {
        const t = data.tests.todayOrders;
        html += `הזמנות היום: ${t.success ? `✅ ${t.count} הזמנות, ₪${t.totalSales}` : `❌ ${t.error}`}<br>`;
      }

      if (data.tests?.monthStats) {
        const t = data.tests.monthStats;
        html += `סטטיסטיקת חודש: ${t.success ? `✅ ₪${t.totalSales}, ${t.orderCount} הזמנות` : `❌ ${t.error}`}<br>`;
      }

      if (data.tests?.topProducts) {
        const t = data.tests.topProducts;
        html += `מוצרים: ${t.success ? `✅ ${t.count} מוצרים` : `❌ ${t.error}`}<br>`;
      }

      if (data.tests?.customers) {
        const t = data.tests.customers;
        html += `לקוחות: ${t.success ? `✅ ${t.count} לקוחות` : `❌ ${t.error}`}<br>`;
      }
      html += `</div>`;

      // Preloaded Data Status
      if (data.tests?.preloadedData) {
        html += `<div style="margin-bottom: 15px;">`;
        html += `<strong style="color: var(--accent);">💾 נתונים טעונים:</strong><br>`;
        Object.entries(data.tests.preloadedData).forEach(([key, value]) => {
          const icon = value === 'LOADED' ? '✅' : '❌';
          html += `${key}: ${icon} ${value}<br>`;
        });
        html += `</div>`;
      }

      // Summary
      if (data.tests?.preloadedMonthStats) {
        const s = data.tests.preloadedMonthStats;
        html += `<div style="background: var(--panel); padding: 10px; border-radius: 6px; margin-top: 10px;">`;
        html += `<strong style="color: var(--success);">📊 סיכום החודש:</strong><br>`;
        html += `מכירות: ₪${(s.totalSales || 0).toLocaleString()}<br>`;
        html += `הזמנות: ${s.orderCount || 0}<br>`;
        html += `ממוצע: ₪${(s.avgOrderValue || 0).toLocaleString()}<br>`;
        html += `</div>`;
      }

      html += `<div style="color: var(--text-muted); font-size: 0.7rem; margin-top: 15px;">`;
      html += `זמן תגובה: ${data.responseTime}ms`;
      html += `</div>`;

      resultsDiv.innerHTML = html;

    } catch (error) {
      resultsDiv.innerHTML = `<span style="color: var(--error);">❌ שגיאה: ${error.message}</span>`;
    }
  }

  // Setup debug button
  const debugBtn = document.getElementById('runDebugBtn');
  if (debugBtn) {
    debugBtn.addEventListener('click', runDebugCheck);
  }

  // ==========================================
  // WEBHOOKS MANAGEMENT
  // ==========================================

  async function listWebhooks() {
    const resultsDiv = document.getElementById('webhooksResults');
    if (!resultsDiv) return;

    resultsDiv.innerHTML = '<span style="color: var(--accent);">⏳ טוען...</span>';

    try {
      const response = await fetch(`${API_BASE}/webhooks/shopify/list`);
      const data = await response.json();

      if (!data.success) {
        resultsDiv.innerHTML = `<span style="color: var(--error);">❌ ${data.error}</span>`;
        return;
      }

      if (data.count === 0) {
        resultsDiv.innerHTML = `
          <div style="color: var(--warn);">
            ⚠️ אין webhooks רשומים<br><br>
            לחץ על "רשום Webhooks" כדי להפעיל עדכונים בזמן אמת
          </div>
        `;
        return;
      }

      let html = `<div style="color: var(--success); margin-bottom: 10px;">✅ ${data.count} webhooks רשומים:</div>`;
      html += '<table style="width: 100%; font-size: 0.75rem;">';
      html += '<tr style="color: var(--text-muted);"><th style="text-align: right;">סוג</th><th style="text-align: right;">כתובת</th></tr>';

      data.webhooks.forEach(w => {
        const topicIcon = w.topic.includes('order') ? '🛒' :
                         w.topic.includes('product') ? '📦' :
                         w.topic.includes('customer') ? '👤' :
                         w.topic.includes('inventory') ? '📊' : '🔔';
        html += `<tr>
          <td>${topicIcon} ${w.topic}</td>
          <td style="color: var(--text-muted); font-size: 0.7rem;">${w.address.split('/webhooks')[1] || w.address}</td>
        </tr>`;
      });

      html += '</table>';
      resultsDiv.innerHTML = html;

    } catch (error) {
      resultsDiv.innerHTML = `<span style="color: var(--error);">❌ שגיאה: ${error.message}</span>`;
    }
  }

  async function registerWebhooks() {
    const resultsDiv = document.getElementById('webhooksResults');
    if (!resultsDiv) return;

    resultsDiv.innerHTML = '<span style="color: var(--accent);">⏳ רושם webhooks...</span>';

    try {
      const response = await fetch(`${API_BASE}/webhooks/shopify/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();

      if (!data.success) {
        resultsDiv.innerHTML = `<span style="color: var(--error);">❌ ${data.error}</span>`;
        return;
      }

      let html = '<div style="margin-bottom: 10px;">';
      html += `<strong>App URL:</strong> ${data.appUrl}<br><br>`;

      if (data.results.success.length > 0) {
        html += `<div style="color: var(--success);">✅ נרשמו בהצלחה (${data.results.success.length}):</div>`;
        data.results.success.forEach(t => {
          html += `<div style="margin-right: 15px;">• ${t}</div>`;
        });
      }

      if (data.results.existing.length > 0) {
        html += `<br><div style="color: var(--info);">ℹ️ כבר רשומים (${data.results.existing.length}):</div>`;
        data.results.existing.forEach(t => {
          html += `<div style="margin-right: 15px; color: var(--text-muted);">• ${t}</div>`;
        });
      }

      if (data.results.failed.length > 0) {
        html += `<br><div style="color: var(--error);">❌ נכשלו (${data.results.failed.length}):</div>`;
        data.results.failed.forEach(f => {
          html += `<div style="margin-right: 15px;">• ${f.topic}: ${JSON.stringify(f.error)}</div>`;
        });
      }

      html += '</div>';
      resultsDiv.innerHTML = html;

    } catch (error) {
      resultsDiv.innerHTML = `<span style="color: var(--error);">❌ שגיאה: ${error.message}</span>`;
    }
  }

  // Setup webhook buttons
  const listWebhooksBtn = document.getElementById('listWebhooksBtn');
  const registerWebhooksBtn = document.getElementById('registerWebhooksBtn');

  if (listWebhooksBtn) {
    listWebhooksBtn.addEventListener('click', listWebhooks);
  }

  if (registerWebhooksBtn) {
    registerWebhooksBtn.addEventListener('click', registerWebhooks);
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  console.log('[Dashboard] Initializing...');

  // Initial load
  checkAllStatuses();
  loadQuickStats();
  renderRecentPosts('recentPostsList');

  // Auto-refresh every 30 seconds
  setInterval(() => {
    console.log('[Dashboard] Auto-refreshing data...');
    checkAllStatuses();
    loadQuickStats();
  }, 30000);

  // Log when page is fully loaded
  console.log('[Dashboard] Initialized successfully');
  console.log('[Dashboard] Auto-refresh: every 30 seconds');
  console.log('[Dashboard] Debug: visit /api/shopify/debug for diagnostics');
});
