// pages/orders/orders.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 当前选中的标签
    activeTab: 'all',
    // 视角：buyer（买家）/ seller（卖家）
    viewRole: 'buyer',
    
    // 订单数据
    orders: [],
    
    // 加载状态
    isLoading: true
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    // 可以从选项中获取初始标签
    if (options.tab) {
      this.setData({
        activeTab: options.tab
      });
    }
    // 支持通过参数设置初始视角（buyer/seller）
    if (options.role && (options.role === 'buyer' || options.role === 'seller')) {
      this.setData({ viewRole: options.role });
    }
    // 清除可能缓存的旧openid，确保使用登录的用户ID获取正确的openid
    const userInfo = wx.getStorageSync('userInfo') || {};
    if (userInfo._id) {
      // 如果有登录的用户ID，清除旧的openid缓存，强制重新获取
      wx.removeStorageSync('openid');
    }
    await this.loadOrders();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  async onShow() {
    // 页面显示时强制重新加载订单数据
    // 清除可能缓存的旧openid，确保使用登录的用户ID获取正确的openid
    const userInfo = wx.getStorageSync('userInfo') || {};
    if (userInfo._id) {
      // 如果有登录的用户ID，清除旧的openid缓存，强制重新获取
      wx.removeStorageSync('openid');
    }
    await this.loadOrders();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  async onPullDownRefresh() {
    await this.loadOrders();
  },

  /**
   * 切换订单标签
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      activeTab: tab,
      isLoading: true
    });
    this.loadOrders();
  },

  /**
   * 切换视角（买家/卖家）
   */
  switchRole(e) {
    const role = e.currentTarget.dataset.role;
    if (!role || (role !== 'buyer' && role !== 'seller')) return;
    this.setData({
      viewRole: role,
      isLoading: true
    });
    this.loadOrders();
  },

  /**
   * 确保有openid
   */
  async ensureOpenId() {
    let openid = wx.getStorageSync('openid');
    if (!openid) {
      try {
        const result = await wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: {
            type: 'getOpenId'
          }
        });
        if (result.result && result.result.openid) {
          openid = result.result.openid;
          wx.setStorageSync('openid', openid);
        }
      } catch (err) {
        console.error('获取openid失败:', err);
      }
    }
    return openid;
  },

  /**
   * 加载订单数据
   */
  async loadOrders() {
    this.setData({ isLoading: true });
    
    try {
      const db = wx.cloud.database();
      let openid = null;
      
      // 优先使用登录时保存的用户ID来获取openid
      const userInfo = wx.getStorageSync('userInfo') || {};
      const loggedInUserId = userInfo._id;
      
      if (loggedInUserId) {
        try {
          // 使用登录的用户ID查询用户信息，获取其_openid
          const userResult = await db.collection('T_user')
            .doc(loggedInUserId)
            .get();
          
          if (userResult.data && userResult.data._openid) {
            openid = userResult.data._openid;
          }
        } catch (err) {
          console.error('通过用户ID获取openid失败:', err);
        }
      }
      
      // 如果无法通过用户ID获取openid，尝试从缓存获取
      if (!openid) {
        openid = await this.ensureOpenId();
      }
      
      if (!openid) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        this.setData({
          orders: [],
          isLoading: false
        });
        wx.stopPullDownRefresh();
        return;
      }
      
      // 查询订单：根据视角（买家/卖家）选择查询条件
      const _ = db.command;
      let query;
      if (this.data.viewRole === 'seller') {
        if (loggedInUserId) {
          query = db.collection('T_order').where({
            sellerUserId: loggedInUserId
          });
          console.log('卖家视角，使用sellerUserId查询订单:', loggedInUserId);
        } else {
          query = db.collection('T_order').where(
            _.or([
              { sellerOpenId: openid },
              { _openid: openid }
            ])
          );
          console.log('卖家视角，使用sellerOpenId和_openid查询订单');
        }
      } else {
        // 买家视角
        if (loggedInUserId) {
          query = db.collection('T_order').where({
            buyerUserId: loggedInUserId
          });
          console.log('买家视角，使用buyerUserId查询订单:', loggedInUserId);
        } else {
          query = db.collection('T_order').where(
            _.or([
              { buyerOpenId: openid },
              { _openid: openid }
            ])
          );
          console.log('买家视角，使用buyerOpenId和_openid查询订单');
        }
      }
      
      // 根据标签筛选订单状态
      if (this.data.activeTab !== 'all') {
        const tab = this.data.activeTab;
        if (tab === 'paid') {
          // “待发货”页签同时包含“待确认付款”和“待发货”两种状态
          query = query.where({
            status: _.in(['待确认付款', '待发货'])
          });
        } else {
          const statusMap = {
            'pending': '待付款',
            'shipped': '待收货',
            'completed': '已完成',
            'cancelled': '已取消'
          };
          const status = statusMap[tab];
          if (status) {
            query = query.where({ status });
          }
        }
      }
      
      const result = await query
        .orderBy('createTime', 'desc')
        .get();
      
      console.log('订单查询结果:', result);
      
      if (result.data && result.data.length > 0) {
        // 格式化订单数据
        const orders = result.data.map(item => {
          // 状态映射
          const statusMap = {
            '待付款': { status: 'pending', statusText: '待付款' },
            '待确认付款': { status: 'paid', statusText: '待卖家确认' },
            '待发货': { status: 'paid', statusText: '待发货' },
            '待收货': { status: 'shipped', statusText: '待收货' },
            '已完成': { status: 'completed', statusText: '已完成' },
            '已取消': { status: 'cancelled', statusText: '已取消' }
          };
          
          const statusInfo = statusMap[item.status] || { status: 'pending', statusText: '待付款' };
          
          // 格式化时间
          const orderTime = item.createTime ? this.formatTime(item.createTime) : '';
          
          // 处理商品列表
          let products = [];
          let totalPrice = 0;
          let totalCount = 0;
          
          if (item.products && Array.isArray(item.products)) {
            products = item.products;
            totalCount = products.length;
            totalPrice = products.reduce((sum, p) => sum + (parseFloat(p.price) || 0) * (p.count || 1), 0);
          } else if (item.productId) {
            // 兼容单个商品的情况
            products = [{
              productId: item.productId,
              name: item.productName || '商品',
              price: item.price || 0,
              count: 1,
        image: item.productImage || 'https://via.placeholder.com/600x400/cccccc/666666?text=商品图'
            }];
            totalCount = 1;
            totalPrice = parseFloat(item.price) || 0;
          }
          
          return {
            id: item._id,
            orderNumber: item.orderNumber || item._id,
            orderTime: orderTime,
            status: statusInfo.status,
            statusText: statusInfo.statusText,
            totalCount: totalCount,
            totalPrice: totalPrice,
            products: products
          };
        });
        
        this.setData({
          orders: orders,
          isLoading: false
        });
      } else {
        this.setData({
          orders: [],
          isLoading: false
        });
      }
      
      wx.stopPullDownRefresh();
    } catch (err) {
      console.error('加载订单失败:', err);
      this.setData({
        orders: [],
        isLoading: false
      });
      wx.stopPullDownRefresh();
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 格式化时间
   */
  formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  },

  /**
   * 取消订单
   */
  async cancelOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '取消订单',
      content: '确定要取消该订单吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const userInfo = wx.getStorageSync('userInfo') || {};
            const result = await wx.cloud.callFunction({
              name: 'quickstartFunctions',
              data: {
                type: 'updateOrderStatus',
                orderId,
                action: 'buyerCancel',
                callerUserId: userInfo._id || ''
              }
            });
            if (!result?.result?.success) {
              throw new Error(result?.result?.error || '取消失败');
            }
            
            wx.showToast({
              title: '订单已取消',
              icon: 'success'
            });
            // 标记订单信息已变更，驱动个人中心红点提醒
            wx.setStorageSync('orderChanged', true);
            
            // 重新加载订单数据
            await this.loadOrders();
          } catch (err) {
            console.error('取消订单失败:', err);
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
   * 去付款
   */
  payOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    console.log('开始支付流程，订单ID:', orderId);
    
    // 显示加载中状态
    wx.showLoading({
      title: '处理中...',
    });
    
    // 1. 查找当前订单信息
    const order = this.data.orders.find(item => item.id === orderId);
    if (!order) {
      wx.hideLoading();
      wx.showToast({
        title: '订单信息不存在',
        icon: 'error'
      });
      console.error('未找到订单信息:', orderId);
      return;
    }
    console.log('找到订单信息:', order);
    
    // 2. 纯逻辑模拟支付，无需真实微信支付
    setTimeout(async () => {
      try {
        const userInfo = wx.getStorageSync('userInfo') || {};
        const result = await wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: {
            type: 'updateOrderStatus',
            orderId,
            action: 'buyerPay',
            callerUserId: userInfo._id || ''
          }
        });
        if (!result?.result?.success) {
          throw new Error(result?.result?.error || '支付更新失败');
        }
        wx.hideLoading();
        wx.showToast({
          title: '支付成功（模拟）',
          icon: 'success'
        });
        // 标记订单信息已变更，驱动个人中心红点提醒
        wx.setStorageSync('orderChanged', true);
        // 刷新订单列表
        await this.loadOrders();
        // 可选：跳转详情页
        this.viewOrderDetail(e);
      } catch (err) {
        console.error('模拟支付更新订单失败:', err);
        wx.hideLoading();
        wx.showToast({
          title: '支付失败（网络）',
          icon: 'none'
        });
      }
    }, 600);
  },

  /**
   * 卖家确认付款
   */
  async confirmPayment(e) {
    const orderId = e.currentTarget.dataset.id;
    console.log('卖家确认收款，订单ID:', orderId);
    wx.showModal({
      title: '确认收款',
      content: '确认已收到买家付款吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '更新中...' });
            const userInfo = wx.getStorageSync('userInfo') || {};
            const result = await wx.cloud.callFunction({
              name: 'quickstartFunctions',
              data: {
                type: 'updateOrderStatus',
                orderId,
                action: 'sellerConfirmPayment',
                callerUserId: userInfo._id || ''
              }
            });
            if (!result?.result?.success) {
              throw new Error(result?.result?.error || '确认收款失败');
            }
            wx.hideLoading();
            wx.showToast({ title: '已确认收款', icon: 'success' });
            // 标记订单信息已变更，驱动个人中心红点提醒
            wx.setStorageSync('orderChanged', true);
            await this.loadOrders();
          } catch (err) {
            console.error('确认付款失败:', err);
            wx.hideLoading();
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
   * 卖家发货
   */
  async shipOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '发货',
      content: '确认发货吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const userInfo = wx.getStorageSync('userInfo') || {};
            const result = await wx.cloud.callFunction({
              name: 'quickstartFunctions',
              data: {
                type: 'updateOrderStatus',
                orderId,
                action: 'sellerShip',
                callerUserId: userInfo._id || ''
              }
            });
            if (!result?.result?.success) {
              throw new Error(result?.result?.error || '发货失败');
            }
            wx.showToast({
              title: '已发货',
              icon: 'success'
            });
            // 标记订单信息已变更，驱动个人中心红点提醒
            wx.setStorageSync('orderChanged', true);
            await this.loadOrders();
          } catch (err) {
            console.error('发货失败:', err);
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
   * 确认收货
   */
  async confirmReceipt(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认收货',
      content: '确认已收到商品吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const userInfo = wx.getStorageSync('userInfo') || {};
            const result = await wx.cloud.callFunction({
              name: 'quickstartFunctions',
              data: {
                type: 'updateOrderStatus',
                orderId,
                action: 'buyerConfirmReceipt',
                callerUserId: userInfo._id || ''
              }
            });
            if (!result?.result?.success) {
              throw new Error(result?.result?.error || '确认收货失败');
            }
            
            wx.showToast({
              title: '已确认收货',
              icon: 'success'
            });
            // 标记订单信息已变更，驱动个人中心红点提醒
            wx.setStorageSync('orderChanged', true);
            // 重新加载订单数据
            await this.loadOrders();
          } catch (err) {
            console.error('确认收货失败:', err);
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
   * 查看订单详情
   */
  viewOrderDetail(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${orderId}`
    });
  },

  /**
   * 再次购买
   */
  buyAgain(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.showToast({
      title: '将商品加入购物车',
      icon: 'none'
    });
    // 这里可以实现再次购买的逻辑
  },

  /**
   * 去购物
   */
  goShopping() {
    wx.switchTab({
      url: '/pages/main/main'
    });
  }
});