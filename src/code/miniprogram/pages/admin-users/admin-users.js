// pages/admin-users/admin-users.js
Page({
  data: {
    users: [],
    keyword: '',
    page: 0,
    pageSize: 20,
    hasMore: true,
    loading: true,
    refreshing: false
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

    this.loadUsers();
  },

  /**
   * 加载用户列表
   */
  async loadUsers(refresh = false) {
    if (refresh) {
      this.setData({
        page: 0,
        users: [],
        hasMore: true
      });
    }

    if (!this.data.hasMore && !refresh) {
      return;
    }

    this.setData({
      loading: true
    });

    try {
      const result = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'adminGetUsers',
          page: this.data.page,
          pageSize: this.data.pageSize,
          keyword: this.data.keyword
        }
      });

      if (result.result && result.result.success) {
        const users = result.result.data.users.map(item => ({
          ...item,
          timeText: this.formatTime(item.createTime)
        }));

        this.setData({
          users: refresh ? users : [...this.data.users, ...users],
          page: this.data.page + 1,
          hasMore: users.length === this.data.pageSize,
          loading: false,
          refreshing: false
        });
      } else {
        throw new Error(result.result?.error || '获取用户列表失败');
      }
    } catch (err) {
      console.error('加载用户列表失败:', err);
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
   * 格式化时间
   */
  formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  /**
   * 搜索输入
   */
  onSearchInput(e) {
    this.setData({
      keyword: e.detail.value
    });
  },

  /**
   * 搜索
   */
  onSearch() {
    this.loadUsers(true);
  },

  /**
   * 下拉刷新
   */
  onRefresh() {
    this.setData({
      refreshing: true
    });
    this.loadUsers(true);
  },

  /**
   * 加载更多
   */
  onLoadMore() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadUsers();
    }
  },

  /**
   * 编辑用户
   */
  onEditUser(e) {
    const userId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/admin-user-edit/admin-user-edit?id=${userId}`
    });
  },

  /**
   * 页面显示时刷新
   */
  onShow() {
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (prevPage && (prevPage.route === 'pages/admin-user-edit/admin-user-edit')) {
      this.loadUsers(true);
    }
  }
});
