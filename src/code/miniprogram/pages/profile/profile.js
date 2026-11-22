// pages/profile/profile.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    userInfo: {},
    userStats: {
      products: 0,
      wanted: 0,
      orders: 0,
      favorites: 0
    },
    notificationEnabled: true,
    hasOrderAlert: false,
    // 图表数据
    monthlyPosted: [],
    monthlyPurchased: []
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    try {
      await this.ensureOpenId();
      await this.loadUserInfo();
      await this.loadUserStats();
      await this.loadNotificationSetting();
    } catch (err) {
      console.error('页面加载失败:', err);
      // 即使加载失败，也尝试显示基本页面
      const userInfo = wx.getStorageSync('userInfo') || {};
      this.setData({
        userInfo: userInfo
      });
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  async onShow() {
    try {
      // 页面显示时强制重新加载所有数据，确保使用最新的登录信息
      // 先清空可能的旧数据缓存
      await this.ensureOpenId();
      // 强制重新加载用户信息和统计数据
      await this.loadUserInfo();
      await this.loadUserStats();
      await this.loadNotificationSetting();
      await this.checkOrderAlerts();
      await this.loadMonthlyCharts();
      try { if (this.getTabBar && this.getTabBar()) { this.getTabBar().setSelected(4); } } catch (e) {}
    } catch (err) {
      console.error('页面显示失败:', err);
      // 即使加载失败，也尝试显示基本页面
      const userInfo = wx.getStorageSync('userInfo') || {};
      this.setData({
        userInfo: userInfo
      });
    }
  },

  /**
   * 加载消息通知设置
   */
  async loadNotificationSetting() {
    try {
      // 先从本地存储获取
      const localSetting = wx.getStorageSync('notificationEnabled');
      if (localSetting !== undefined && localSetting !== null) {
        this.setData({
          notificationEnabled: localSetting
        });
      }
      
      // 从数据库获取
      const db = wx.cloud.database();
      const openid = await this.ensureOpenId();
      
      if (openid) {
        const userResult = await db.collection('T_user')
          .where({
            _openid: openid
          })
          .get();
        
        if (userResult.data && userResult.data.length > 0) {
          const userData = userResult.data[0];
          if (userData.notificationEnabled !== undefined && userData.notificationEnabled !== null) {
            this.setData({
              notificationEnabled: userData.notificationEnabled
            });
            wx.setStorageSync('notificationEnabled', userData.notificationEnabled);
          }
        }
      }
    } catch (err) {
      console.error('加载通知设置失败:', err);
    }
  },

  /**
   * 确保有openid（如果没有则从云函数获取）
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
   * 加载用户信息
   */
  async loadUserInfo() {
    try {
      // 强制从本地存储获取最新的登录用户ID（登录时会更新）
      const localUserInfo = wx.getStorageSync('userInfo') || {};
      const loggedInUserId = localUserInfo._id; // 获取登录时保存的用户ID
      
      let userInfo = {};
      
      // 优先使用登录时保存的用户ID来查询数据库
      if (loggedInUserId) {
        try {
          const db = wx.cloud.database();
          const userResult = await db.collection('T_user')
            .doc(loggedInUserId)
            .get();
          
          if (userResult.data) {
            const userData = userResult.data;
            userInfo = {
              _id: userData._id,
              id: userData.sno || userData._id || '',
              nickName: userData.sname || userData.nickName || '未设置昵称',
              avatar: userData.avatar || 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U',
              level: userData.level || '普通会员',
              phone: userData.phone || '',
              major: userData.major || '',
              sno: userData.sno,
              sushe: userData.sushe,
              grade: userData.年级
            };
            // 强制更新本地存储
            wx.setStorageSync('userInfo', userInfo);
          } else {
            // 如果数据库中没有找到，使用本地存储的数据
            userInfo = localUserInfo;
          }
        } catch (err) {
          console.error('从云数据库获取用户信息失败:', err);
          // 如果使用_id查询失败，尝试使用openid查询（向后兼容）
          const openid = await this.ensureOpenId();
          if (openid) {
            try {
              const db = wx.cloud.database();
              const userResult = await db.collection('T_user')
                .where({
                  _openid: openid
                })
                .get();
              
              if (userResult.data && userResult.data.length > 0) {
                const userData = userResult.data[0];
                userInfo = {
                  _id: userData._id,
                  id: userData.sno || userData._id || '',
                  nickName: userData.sname || userData.nickName || '未设置昵称',
                  avatar: userData.avatar || 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U',
                  level: userData.level || '普通会员',
                  phone: userData.phone || '',
                  major: userData.major || '',
                  sno: userData.sno,
                  sushe: userData.sushe,
                  grade: userData.年级
                };
                // 更新本地存储
                wx.setStorageSync('userInfo', userInfo);
              } else {
                userInfo = localUserInfo;
              }
            } catch (err2) {
              console.error('使用openid查询用户信息也失败:', err2);
              userInfo = localUserInfo;
            }
          } else {
            userInfo = localUserInfo;
          }
        }
      } else {
        // 如果没有登录的用户ID，尝试使用openid（向后兼容）
        const openid = await this.ensureOpenId();
        if (openid) {
          try {
            const db = wx.cloud.database();
            const userResult = await db.collection('T_user')
              .where({
                _openid: openid
              })
              .get();
            
            if (userResult.data && userResult.data.length > 0) {
              const userData = userResult.data[0];
              userInfo = {
                _id: userData._id,
                id: userData.sno || userData._id || '',
                nickName: userData.sname || userData.nickName || '未设置昵称',
                  avatar: userData.avatar || 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U',
                level: userData.level || '普通会员',
                phone: userData.phone || '',
                major: userData.major || '',
                sno: userData.sno,
                sushe: userData.sushe,
                grade: userData.年级
              };
              // 更新本地存储
              wx.setStorageSync('userInfo', userInfo);
            } else {
              userInfo = localUserInfo;
            }
          } catch (err) {
            console.error('从云数据库获取用户信息失败:', err);
            userInfo = localUserInfo;
          }
        } else {
          userInfo = localUserInfo;
        }
      }
      
      // 强制更新页面数据
      this.setData({
        userInfo: userInfo
      });
    } catch (err) {
      console.error('加载用户信息失败:', err);
      const userInfo = wx.getStorageSync('userInfo') || {};
      this.setData({
        userInfo: userInfo
      });
    }
  },

  /**
   * 加载用户统计数据
   */
  async loadUserStats() {
    try {
      const db = wx.cloud.database();
      let openid = null;
      
      // 强制从本地存储获取最新的登录用户ID（登录时会更新）
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
        // 如果没有openid，使用默认值
        this.setData({
          userStats: {
            products: 0,
            wanted: 0,
            orders: 0,
            favorites: 0
          }
        });
        // 同时清空本地缓存
        wx.removeStorageSync('userStats');
        return;
      }
      
      // 并行查询各项统计数据
      const _ = db.command;
      
      // 优先使用sellerUserId查询商品数量（最准确）
      let productsCountPromise;
      
      if (loggedInUserId) {
        // 优先使用sellerUserId查询
        productsCountPromise = (async () => {
          try {
            return await db.collection('T_product').where({
              sellerUserId: loggedInUserId
            }).count();
          } catch (err) {
            // 如果失败，回退到使用sellerOpenId和_openid（向后兼容）
            try {
              return await db.collection('T_product').where(
                _.or([
                  { sellerOpenId: openid },
                  { _openid: openid }
                ])
              ).count();
            } catch (err2) {
              return { total: 0 };
            }
          }
        })();
      } else {
        // 如果没有登录的用户ID，使用sellerOpenId和_openid
        productsCountPromise = db.collection('T_product').where(
          _.or([
            { sellerOpenId: openid },
            { _openid: openid }
          ])
        ).count().catch(() => ({ total: 0 }));
      }
      
      const [productsResult, wantedResult, ordersResult, favoritesResult] = await Promise.all([
        // 我的商品数量（优先使用sellerUserId，否则使用sellerOpenId和_openid）
        productsCountPromise,
        
        // 我的求购数量（优先使用userId，否则使用_openid）
        (async () => {
          try {
            if (loggedInUserId) {
              return await db.collection('T_want').where({
                userId: loggedInUserId,
                status: 'active'
              }).count();
            } else {
              return await db.collection('T_want').where({
                _openid: openid,
                status: 'active'
              }).count();
            }
          } catch (err) {
            return { total: 0 };
          }
        })(),
        
        // 我的订单数量（优先使用buyerUserId，否则使用buyerOpenId和_openid）
        (async () => {
          try {
            if (loggedInUserId) {
              return await db.collection('T_order').where({
                buyerUserId: loggedInUserId
              }).count();
            } else {
              return await db.collection('T_order').where(
                _.or([
                  { buyerOpenId: openid },
                  { _openid: openid }
                ])
              ).count();
            }
          } catch (err) {
            return { total: 0 };
          }
        })(),
        
        // 我的收藏数量
        (async () => {
          try {
            if (loggedInUserId) {
              return await db.collection('T_favorites').where({ userId: loggedInUserId }).count();
            } else {
              return await db.collection('T_favorites').where({ _openid: openid }).count();
            }
          } catch (err) {
            return { total: 0 };
          }
        })()
      ]);
      
      const stats = {
        products: productsResult.total || 0,
        wanted: wantedResult.total || 0,
        orders: ordersResult.total || 0,
        favorites: favoritesResult.total || 0
      };
      
      // 更新本地存储
      wx.setStorageSync('userStats', stats);
      
      this.setData({
        userStats: stats
      });
    } catch (err) {
      console.error('加载用户统计数据失败:', err);
      // 失败时使用本地存储或默认值
      const stats = wx.getStorageSync('userStats') || {
        products: 0,
        wanted: 0,
        orders: 0,
        favorites: 0
      };
      this.setData({
        userStats: stats
      });
    }
  },

  /**
   * 月度图表：发布与购买数量
   */
  async loadMonthlyCharts() {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const userInfo = wx.getStorageSync('userInfo') || {};
      const loggedInUserId = userInfo._id;
      const openid = await this.ensureOpenId();

      // 最近12个月标签
      const now = new Date();
      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = `${d.getFullYear()}-${('0' + (d.getMonth()+1)).slice(-2)}`;
        months.push({ y: d.getFullYear(), m: d.getMonth()+1, label });
      }

      // 拉取我的发布商品（按 createTime）
      let postedQuery;
      if (loggedInUserId) {
        postedQuery = db.collection('T_product').where({ sellerUserId: loggedInUserId });
      } else {
        postedQuery = db.collection('T_product').where(_.or([{ sellerOpenId: openid }, { _openid: openid }]));
      }
      const postedRes = await postedQuery.orderBy('createTime', 'asc').get();
      const posted = (postedRes.data || []).filter(p => !!p.createTime);

      // 拉取我的购买订单（按 createTime）
      let purchaseQuery;
      if (loggedInUserId) {
        purchaseQuery = db.collection('T_order').where({ buyerUserId: loggedInUserId });
      } else {
        purchaseQuery = db.collection('T_order').where(_.or([{ buyerOpenId: openid }, { _openid: openid }]));
      }
      const orderRes = await purchaseQuery.orderBy('createTime', 'asc').get();
      const purchased = (orderRes.data || []).filter(o => !!o.createTime);

      // 统计每月数量
      const countByMonth = (list) => {
        const map = new Map(months.map(m => [m.label, 0]));
        list.forEach(item => {
          const d = new Date(item.createTime);
          const label = `${d.getFullYear()}-${('0' + (d.getMonth()+1)).slice(-2)}`;
          if (map.has(label)) map.set(label, (map.get(label) || 0) + 1);
        });
        return months.map(m => ({ month: m.label, count: map.get(m.label) || 0 }));
      };
      const postedMonthly = countByMonth(posted);
      const purchasedMonthly = countByMonth(purchased);

      // 归一化到百分比用于图表高度/位置
      const maxPosted = Math.max(1, ...postedMonthly.map(x => x.count));
      const maxPurchased = Math.max(1, ...purchasedMonthly.map(x => x.count));
      const postedDisplay = postedMonthly.map(x => ({ month: x.month, count: x.count, percentage: Math.round(100 * x.count / maxPosted) }));
      const purchasedDisplay = purchasedMonthly.map((x, idx) => ({ month: x.month, sales: x.count, percentage: Math.round(100 * x.count / maxPurchased), position: Math.round(100 * idx / (purchasedMonthly.length - 1 || 1)) }));

      this.setData({ monthlyPosted: postedDisplay, monthlyPurchased: purchasedDisplay });
    } catch (err) {
      console.error('加载月度图表失败:', err);
      this.setData({ monthlyPosted: [], monthlyPurchased: [] });
    }
  },

  /**
   * 我的商品点击事件
   */
  onMyProducts() {
    wx.navigateTo({
      url: '/pages/myProducts/myProducts'
    });
  },

  /**
   * 我的求购点击事件
   */
  onMyWanted() {
    wx.navigateTo({
      url: '/pages/wanted-list/wanted-list?filter=my'
    });
  },

  /**
   * 我的订单点击事件
   */
  onMyOrders() {
    // 进入订单页后清除本地变更标记
    wx.removeStorageSync('orderChanged');
    wx.navigateTo({
      url: '/pages/orders/orders'
    });
  },

  /**
   * 我的收藏点击事件
   */
  onMyFavorites() {
    wx.navigateTo({
      url: '/pages/favorites/favorites'
    });
  },

  /**
   * 个人信息编辑
   */
  onProfileEdit() {
    wx.navigateTo({
      url: '/pages/profile-edit/profile-edit'
    });
  },

  /**
   * 安全设置
   */
  onSecurity() {
    wx.navigateTo({
      url: '/pages/security/security'
    });
  },

  /**
   * 收货地址管理
   */
  onAddress() {
    wx.navigateTo({
      url: '/pages/address/address'
    });
  },

  /**
   * 意见反馈
   */
  onFeedback() {
    wx.navigateTo({
      url: '/pages/feedback/feedback'
    });
  },

  /**
   * 消息通知开关
   */
  async onNotificationChange(e) {
    const enabled = e.detail.value;
    this.setData({
      notificationEnabled: enabled
    });
    
    try {
      const db = wx.cloud.database();
      const openid = await this.ensureOpenId();
      
      if (openid) {
        // 更新数据库中的通知设置
        await db.collection('T_user')
          .where({
            _openid: openid
          })
          .update({
            data: {
              notificationEnabled: enabled,
              updateTime: new Date()
            }
          });
      }
      
      // 更新本地存储
      wx.setStorageSync('notificationEnabled', enabled);
      
      wx.showToast({
        title: enabled ? '通知已开启' : '通知已关闭',
        icon: 'success'
      });
    } catch (err) {
      console.error('保存通知设置失败:', err);
    wx.showToast({
      title: enabled ? '通知已开启' : '通知已关闭',
      icon: 'success'
    });
    }
  },

  /**
   * 隐私设置
   */
  onPrivacy() {
    wx.navigateTo({
      url: '/pages/privacy/privacy'
    });
  },
  
  /**
   * 消息通知设置（用于菜单项点击，实际开关在switch中）
   */
  onNotification() {
    // 这个方法用于菜单项点击，但实际功能由switch组件处理
    // 可以在这里添加跳转到详细通知设置页面的逻辑
  },

  /**
   * 关于我们
   */
  onAbout() {
    wx.showModal({
      title: '关于SContact',
      content: '版本: 1.0.0\n开发者: SContact团队\n联系方式: support@scontact.com',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  /**
   * 退出登录
   */
  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除登录信息
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('token');
          wx.removeStorageSync('userStats');
          wx.removeStorageSync('openid');
          wx.removeStorageSync('notificationEnabled');
          
          // 显示退出成功提示
          wx.showToast({
            title: '退出成功',
            icon: 'success',
            duration: 1500
          });
          
          // 延迟跳转到登录页面
          setTimeout(() => {
            wx.redirectTo({
              url: '/pages/index/index'
            });
          }, 1500);
        }
      }
    });
  },

  /**
   * 用户下拉刷新
   */
  async onPullDownRefresh() {
    console.log('下拉刷新个人中心');
    
    // 重新加载用户信息
    await this.loadUserInfo();
    await this.loadUserStats();
    await this.loadNotificationSetting();
    
    // 模拟刷新延迟
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 300);
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    console.log('上拉加载更多');
    
    // 可以在这里加载更多数据
    // 页面不再弹出“加载中”，直接静默处理或忽略
  },
  /**
   * 检查订单红点提醒：未读通知或待处理订单
   */
  async checkOrderAlerts() {
    try {
      const db = wx.cloud.database();
      const userInfo = wx.getStorageSync('userInfo') || {};
      const loggedInUserId = userInfo._id;
      const openid = await this.ensureOpenId();
      const _ = db.command;

      let hasUnreadNotify = false;
      let hasPendingOrders = false;

      // 卖家未读通知（如：商品被购买）
      if (loggedInUserId) {
        try {
          const notifyRes = await db.collection('T_notify')
            .where({ sellerUserId: loggedInUserId, status: 'unread' })
            .get();
          hasUnreadNotify = !!(notifyRes.data && notifyRes.data.length > 0);
        } catch (e) { /* 忽略错误 */ }
      } else if (openid) {
        try {
          const notifyRes = await db.collection('T_notify')
            .where(_.and([
              _.or([{ sellerOpenId: openid }, { _openid: openid }]),
              { status: 'unread' }
            ]))
            .get();
          hasUnreadNotify = !!(notifyRes.data && notifyRes.data.length > 0);
        } catch (e) { /* 忽略错误 */ }
      }

      // 买家/卖家待处理订单（待付款、待确认付款、待发货、待收货）
      const pendingStatuses = ['待付款', '待确认付款', '待发货', '待收货'];
      try {
        let orderQuery;
        if (loggedInUserId) {
          orderQuery = db.collection('T_order').where(
            _.or([
              { buyerUserId: loggedInUserId },
              { sellerUserId: loggedInUserId }
            ])
          ).where({ status: _.in(pendingStatuses) });
        } else if (openid) {
          orderQuery = db.collection('T_order').where(
            _.or([
              { buyerOpenId: openid },
              { sellerOpenId: openid },
              { _openid: openid }
            ])
          ).where({ status: _.in(pendingStatuses) });
        }
        if (orderQuery) {
          const orderRes = await orderQuery.get();
          hasPendingOrders = !!(orderRes.data && orderRes.data.length > 0);
        }
      } catch (e) { /* 忽略错误 */ }

      // 本地变更标记（订单状态刚被更新）
      const localChanged = !!wx.getStorageSync('orderChanged');

      this.setData({
        hasOrderAlert: hasUnreadNotify || hasPendingOrders || localChanged
      });
    } catch (err) {
      console.error('检查订单提醒失败:', err);
    }
  }
})