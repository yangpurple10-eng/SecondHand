// pages/admin-dashboard/admin-dashboard.js
const { QQMAP_KEY, QQMAP_REFERER } = require('../../utils/config.js');
Page({
  data: {
    adminInfo: {},
    stats: {
      totalProducts: 0,
      totalUsers: 0,
      totalSales: 0,
      totalOrders: 0
    },
    monthlyProducts: [],
    monthlySales: [],
    categoryStats: [],
    loading: true,
    refreshing: false,
    // 供需缺口 Top N 展示与推送（不分校区）
    topNOptions: [3,5,8],
    topNIndex: 1, // 默认5
    topGaps: [],
    gapsLoading: false,
    pushInProgress: false,
    pushResult: null,
    // 求购关键词词云
    keywordsLoading: false,
    wantedKeywords: [],
    keywordsDisplay: []
    ,
    // 地标同步工具
    syncDryRun: true,
    syncLimit: 300,
    syncLandmarksLoading: false,
    syncResult: null
  },

  onLoad() {
    // 检查管理员登录状态
    const adminInfo = wx.getStorageSync('adminInfo');
    if (!adminInfo) {
      wx.redirectTo({
        url: '/pages/admin-login/admin-login'
      });
      return;
    }

    this.setData({
      adminInfo: adminInfo
    });

    this.loadDashboardData();
    // 加载供需缺口TopN
    this.loadSupplyDemandGaps();
    // 加载求购关键词词云
    this.loadWantedKeywords();
  },

  /** 切换地标同步 dryRun */
  onSyncDryRunToggle(e) {
    this.setData({ syncDryRun: !!e.detail.value });
  },

  /** 设置地标同步 limit */
  onSyncLimitInput(e) {
    const v = parseInt(e.detail.value, 10);
    if (Number.isFinite(v) && v > 0) {
      this.setData({ syncLimit: v });
    }
  },

  /** 一键同步地标 */
  async onSyncLandmarks() {
    if (this.data.syncLandmarksLoading) return;
    try {
      this.setData({ syncLandmarksLoading: true, syncResult: null });
      // 先确保集合存在
      try {
        await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'createCampusLandmarksCollection' } });
      } catch (_) { /* 如果已存在或创建失败，继续执行同步 */ }

      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'syncProductLandmarks', dryRun: this.data.syncDryRun, limit: this.data.syncLimit, key: QQMAP_KEY, referer: QQMAP_REFERER }
      });
      const result = res.result || {};
      // 兼容展示字段
      result.candidateCount = result.totalCandidates || result.candidateCount || 0;
      result.upserted = (result.created || 0) + (result.updated || 0);
      this.setData({ syncResult: result });
      if (result.success) {
        const candidates = result.totalCandidates || result.candidateCount || 0;
        const upserted = (result.created || 0) + (result.updated || 0);
        const msg = this.data.syncDryRun
          ? `试运行：候选 ${candidates}`
          : `已同步 ${upserted} 条地标`;
        wx.showToast({ title: msg, icon: 'success' });
      } else {
        wx.showToast({ title: result.error || '同步失败', icon: 'none' });
      }
    } catch (err) {
      console.error('同步地标失败:', err);
      wx.showToast({ title: '同步失败', icon: 'none' });
    } finally {
      this.setData({ syncLandmarksLoading: false });
    }
  },

  /**
   * 页面显示时刷新数据
   */
  onShow() {
    // 每次页面显示时都刷新统计数据，确保数据实时更新
    // 检查是否已经加载过数据（避免首次加载时重复请求）
    if (this.data.adminInfo && Object.keys(this.data.adminInfo).length > 0 && !this.data.loading) {
      // 静默刷新，不显示加载状态
      this.loadDashboardData(true);
    }
  },

  /**
   * 加载仪表盘数据
   */
  async loadDashboardData(refresh = false) {
    // 如果不是刷新操作，显示加载状态
    if (!refresh) {
      this.setData({
        loading: true
      });
    }

    try {
      // 调用云函数获取统计数据
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'getAdminStats'
        }
      });

      if (res.result && res.result.success) {
        const stats = res.result.data;
        
        // 处理月度商品发布量数据
        const monthlyProducts = this.processMonthlyData(stats.monthlyProducts || []);
        
        // 处理月度销售额数据
        const monthlySales = this.processSalesData(stats.monthlySales || []);
        
        // 处理分类统计数据
        const categoryStats = this.processCategoryData(stats.categoryStats || []);

        this.setData({
          stats: {
            totalProducts: stats.totalProducts || 0,
            totalUsers: stats.totalUsers || 0,
            totalSales: stats.totalSales || 0,
            totalOrders: stats.totalOrders || 0
          },
          monthlyProducts: monthlyProducts,
          monthlySales: monthlySales,
          categoryStats: categoryStats,
          loading: false,
          refreshing: false
        });
        
        console.log('统计数据已更新:', {
          totalProducts: stats.totalProducts,
          totalUsers: stats.totalUsers,
          totalSales: stats.totalSales,
          totalOrders: stats.totalOrders
        });
      } else {
        throw new Error(res.result?.error || '获取数据失败');
      }
    } catch (err) {
      console.error('加载仪表盘数据失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({
        loading: false,
        refreshing: false
      });
    }
  },

  /**
   * 加载供需缺口Top N（全校区合并，不分校区）
   */
  async loadSupplyDemandGaps() {
    try {
      this.setData({ gapsLoading: true });
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'getPublishRecommendations',
          forType: 'admin'
        }
      });
      const result = res.result || {};
      if (result.success && result.data) {
        const stats = result.data.stats || [];
        const n = this.data.topNOptions[this.data.topNIndex] || 5;
        const top = stats.slice(0, n);
        this.setData({ topGaps: top });
      } else {
        wx.showToast({ title: '获取供需缺口失败', icon: 'none' });
      }
    } catch (err) {
      console.error('获取供需缺口失败:', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ gapsLoading: false });
    }
  },

  /** 选择TopN */
  onTopNChange(e) {
    this.setData({ topNIndex: parseInt(e.detail.value) });
    this.loadSupplyDemandGaps();
  },

  /** 一键推送建议 */
  async onPushRecommendation() {
    if (this.data.pushInProgress) return;
    try {
      this.setData({ pushInProgress: true });
      const categories = (this.data.topGaps || []).map(item => item.category).filter(Boolean);
      if (categories.length === 0) {
        wx.showToast({ title: '暂无可推送的类别', icon: 'none' });
        return;
      }
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'adminPushRecommendations',
          categories,
          target: 'all'
        }
      });
      const result = res.result || {};
      if (result.success) {
        wx.showToast({ title: `已推送${result.pushed || 0}条`, icon: 'success' });
      } else {
        wx.showToast({ title: result.error || '推送失败', icon: 'none' });
      }
      this.setData({ pushResult: result });
    } catch (err) {
      console.error('推送建议失败:', err);
      wx.showToast({ title: '推送失败', icon: 'none' });
    } finally {
      this.setData({ pushInProgress: false });
    }
  },

  /** 加载求购关键词词云 */
  async loadWantedKeywords() {
    try {
      this.setData({ keywordsLoading: true });
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'getWantedKeywordCloud', limit: 60 }
      });
      const result = res.result || {};
      if (result.success && result.data && Array.isArray(result.data.keywords)) {
        const keywords = result.data.keywords;
        const colors = ['#3366FF','#33A852','#FBBC04','#EA4335','#7E57C2','#00ACC1','#F06292','#8D6E63'];
        const display = keywords.map((k, idx) => {
          const size = Math.round(24 + (k.score || 0) * 22); // 24~46rpx
          const opacity = (0.6 + (k.score || 0) * 0.4).toFixed(2); // 0.6~1.0
          const color = colors[idx % colors.length];
          return {
            text: k.text,
            weight: k.weight,
            style: `font-size: ${size}rpx; color: ${color}; opacity: ${opacity};`
          };
        });
        this.setData({ wantedKeywords: keywords, keywordsDisplay: display });
      } else {
        this.setData({ wantedKeywords: [], keywordsDisplay: [] });
      }
    } catch (err) {
      console.error('加载求购关键词失败:', err);
      wx.showToast({ title: '词云加载失败', icon: 'none' });
    } finally {
      this.setData({ keywordsLoading: false });
    }
  },

  /**
   * 处理月度数据（用于柱状图）
   */
  processMonthlyData(data) {
    if (!data || data.length === 0) {
      // 返回空数据
      const months = ['1月', '2月', '3月', '4月', '5月', '6月'];
      return months.map(month => ({
        month: month,
        count: 0,
        percentage: 0
      }));
    }

    const maxCount = Math.max(...data.map(item => item.count), 1);
    
    return data.map(item => ({
      month: item.month,
      count: item.count,
      percentage: (item.count / maxCount) * 100
    }));
  },

  /**
   * 处理销售额数据（用于折线图）
   */
  processSalesData(data) {
    if (!data || data.length === 0) {
      const months = ['1月', '2月', '3月', '4月', '5月', '6月'];
      return months.map((month, index) => ({
        month: month,
        sales: 0,
        percentage: 0,
        position: (index / (months.length - 1)) * 100
      }));
    }

    const maxSales = Math.max(...data.map(item => item.sales), 1);
    const totalItems = data.length;
    
    return data.map((item, index) => ({
      month: item.month,
      sales: item.sales,
      percentage: (item.sales / maxSales) * 100,
      position: totalItems > 1 ? (index / (totalItems - 1)) * 100 : 50
    }));
  },

  /**
   * 处理分类数据（用于饼图）
   */
  processCategoryData(data) {
    if (!data || data.length === 0) {
      return [];
    }

    const total = data.reduce((sum, item) => sum + item.count, 0);
    const colors = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#9C27B0', '#00BCD4', '#FF9800', '#795548'];
    
    return data.map((item, index) => ({
      category: item.category,
      count: item.count,
      percentage: (item.count / total) * 100,
      color: colors[index % colors.length]
    }));
  },

  /**
   * 下拉刷新
   */
  onRefresh() {
    this.setData({
      refreshing: true
    });
    this.loadDashboardData();
  },

  /**
   * 导航到其他页面
   */
  onNavigateTo(e) {
    const page = e.currentTarget.dataset.page;
    const pages = {
      products: '/pages/admin-products/admin-products',
      users: '/pages/admin-users/admin-users',
      orders: '/pages/admin-orders/admin-orders'
    };

    if (pages[page]) {
      wx.navigateTo({
        url: pages[page]
      });
    }
  },

  /**
   * 退出登录
   */
  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('adminInfo');
          wx.removeStorageSync('adminToken');
          wx.redirectTo({
            url: '/pages/admin-login/admin-login'
          });
        }
      }
    });
  }
});

