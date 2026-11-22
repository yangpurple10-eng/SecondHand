// pages/admin-products/admin-products.js
Page({
  data: {
    products: [],
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

    this.loadProducts();
  },

  /**
   * 加载商品列表
   */
  async loadProducts(refresh = false) {
    if (refresh) {
      this.setData({
        page: 0,
        products: [],
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
      const db = wx.cloud.database();
      let queryCondition = {};

      // 搜索条件
      if (this.data.keyword) {
        queryCondition.productName = db.RegExp({
          regexp: this.data.keyword,
          options: 'i'
        });
      }

      const result = await db.collection('T_product')
        .where(queryCondition)
        .orderBy('createTime', 'desc')
        .skip(this.data.page * this.data.pageSize)
        .limit(this.data.pageSize)
        .get();

      const products = result.data.map(item => ({
        ...item,
        timeText: this.formatTime(item.createTime)
      }));

      this.setData({
        products: refresh ? products : [...this.data.products, ...products],
        page: this.data.page + 1,
        hasMore: result.data.length === this.data.pageSize,
        loading: false,
        refreshing: false
      });
    } catch (err) {
      console.error('加载商品列表失败:', err);
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
    this.loadProducts(true);
  },

  /**
   * 下拉刷新
   */
  onRefresh() {
    this.setData({
      refreshing: true
    });
    this.loadProducts(true);
  },

  /**
   * 加载更多
   */
  onLoadMore() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadProducts();
    }
  },

  /**
   * 编辑商品
   */
  onEditProduct(e) {
    const productId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/admin-product-edit/admin-product-edit?id=${productId}`
    });
  },

  /**
   * 切换商品状态（上架/下架）
   */
  async onToggleStatus(e) {
    const productId = e.currentTarget.dataset.id;
    const currentStatus = e.currentTarget.dataset.status;
    const newStatus = currentStatus === '在售' ? '已下架' : '在售';

    wx.showModal({
      title: '提示',
      content: `确定要${newStatus === '在售' ? '上架' : '下架'}该商品吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '处理中...',
            mask: true
          });

          try {
            const result = await wx.cloud.callFunction({
              name: 'quickstartFunctions',
              data: {
                type: 'adminUpdateProduct',
                productId: productId,
                data: {
                  status: newStatus
                }
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '操作成功',
                icon: 'success'
              });
              this.loadProducts(true);
            } else {
              wx.showToast({
                title: result.result?.error || '操作失败',
                icon: 'none'
              });
            }
          } catch (err) {
            wx.hideLoading();
            console.error('操作失败:', err);
            wx.showToast({
              title: '操作失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 添加商品
   */
  onAddProduct() {
    wx.navigateTo({
      url: '/pages/admin-product-edit/admin-product-edit'
    });
  },

  /**
   * 页面显示时刷新
   */
  onShow() {
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (prevPage && prevPage.route === 'pages/admin-product-edit/admin-product-edit') {
      this.loadProducts(true);
    }
  }
});
