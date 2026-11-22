// pages/main/main.js
const reco = require('../../utils/recommendation.js');
Page({

  /**
   * 页面的初始数据
   */
  data: {
    currentTab: 'home',
    userInfo: {},
    searchText: '',
    hasMessageAlert: false,
    
    // 推荐商品数据
    recommendProducts: [
      {
        id: 1,
        name: '二手iPhone 13',
        price: '2999',
        image: '/images/仓鼠.png',
        tag: '电子产品'
      },
      {
        id: 2,
        name: 'Java编程思想',
        price: '35',
        image: '/images/更多犬种.png',
        tag: '二手书'
      },
      {
        id: 3,
        name: '耐克运动鞋',
        price: '180',
        image: '/images/边牧.png',
        tag: '服装鞋帽'
      },
      {
        id: 4,
        name: '戴尔笔记本电脑',
        price: '3200',
        image: '/images/羊.png',
        tag: '电子产品'
      }
    ],
    
    // 热门求购数据
    hotWanted: [
      {
        id: 1,
        title: '求购二手iPad Pro',
        budget: '2500',
        time: '2小时前'
      },
      {
        id: 2,
        title: '急需高数教材',
        budget: '30',
        time: '5小时前'
      },
      {
        id: 3,
        title: '求购健身器材',
        budget: '200',
        time: '1天前'
      }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadUserInfo();
    this.loadRecommendations();
    this.loadHotWanted();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    this.loadUserInfo();
    this.loadRecommendations();
    this.loadUnreadStatus();
    try {
      if (this.getTabBar && this.getTabBar()) {
        this.getTabBar().setSelected(0);
      }
    } catch (e) {}
  },

  /**
   * 加载用户信息
   */
  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    // 兜底替换占位域名，避免渲染层网络超时
    if (typeof userInfo.avatar === 'string' && userInfo.avatar.startsWith('https://via.placeholder.com')) {
      userInfo.avatar = '/images/更多犬种.png';
    }
    this.setData({ userInfo });
  },

  /**
   * 加载推荐商品（实时：基于兴趣 + 行为权重）
   */
  loadRecommendations() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const userInterests = userInfo.interests || [];
    const privacy = wx.getStorageSync('privacySettings') || {};
    const allowRecommend = privacy.allowRecommend !== false;
    console.log('用户兴趣:', userInterests);

    wx.showLoading({ title: '加载推荐中...', mask: false });

    if (!allowRecommend) {
      wx.hideLoading();
      this.loadDefaultProducts();
      return;
    }

    this.loadRecommendationsFromMoreList(userInterests)
      .then(() => wx.hideLoading())
      .catch(() => {
        this.loadRecommendationsFromBehavior(userInterests)
          .then(() => wx.hideLoading())
          .catch(() => {
            wx.hideLoading();
            this.loadDefaultProducts();
          });
      });
  },

  /**
   * 基于本地行为权重实时生成推荐
   */
  async loadRecommendationsFromBehavior(userInterests) {
    const db = wx.cloud.database();
    const _ = db.command;
    const weights = reco.getWeights();
    const last = wx.getStorageSync('lastInteraction') || {};
    // 强优先使用用户选择的兴趣；若为空再回退到行为权重
    let interests = Array.isArray(userInterests) ? userInterests.filter(Boolean) : [];
    if (last.category && interests.indexOf(last.category) === -1) interests.unshift(last.category);
    if (interests.length === 0) {
      const cats = Object.keys(weights.categories || {}).sort((a,b)=> (weights.categories[b]||0) - (weights.categories[a]||0));
      interests = cats.slice(0, 3);
    }
    interests = [...new Set(interests)].filter(Boolean);
    let where = { status: '在售' };
    if (interests.length > 0) {
      where = _.and([
        { status: '在售' },
        { productCategory: _.in(interests) }
      ]);
    }
    const res = await db.collection('T_product')
      .where(where)
      .orderBy('createTime', 'desc')
      .limit(100)
      .get();
    let raw = res.data || [];
    if (last.productId) raw = raw.filter(x => x._id !== last.productId);
    const list = raw.map(item => ({
      id: item._id,
      name: item.productName || '商品',
      price: item.salePrice || item.suggestedPrice || item.originalPrice || 0,
      image: Array.isArray(item.productImage) ? (item.productImage[0] || '/images/仓鼠.png') : (item.productImage || '/images/仓鼠.png'),
      tag: item.productCategory || '其他',
      productName: item.productName,
      productDescription: item.productDescription || item.description || '',
      productCategory: item.productCategory,
      createTime: item.createTime
    }));
    const sorted = reco.reorderProductsByWeights(list).slice(0, 12);
    this.setData({ recommendProducts: sorted });
    wx.hideLoading();
    console.log('行为权重推荐完成，数量:', sorted.length);
  },

  /**
   * 与“更多推荐”统一的推荐源：按兴趣过滤，分页取全量后按权重排序，首页取前12个
   */
  async loadRecommendationsFromMoreList(userInterests) {
    const interests = await this.resolveInterestsForRecommend();
    const db = wx.cloud.database();
    const _ = db.command;
    let where = { status: '在售' };
    if (interests.length > 0) {
      where = _.and([{ status: '在售' }, { productCategory: _.in(interests) }]);
    }
    const countRes = await db.collection('T_product').where(where).count();
    const total = countRes.total || 0;
    const pageSize = 100;
    const all = [];
    for (let skip = 0; skip < Math.max(total, pageSize * 2); skip += pageSize) {
      const page = await db.collection('T_product')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get();
      if (page && Array.isArray(page.data)) all.push(...page.data);
      if (!page || !page.data || page.data.length < pageSize) break;
    }
    const list = all.map(item => ({
      id: item._id,
      name: item.productName || '商品',
      price: item.salePrice || item.suggestedPrice || item.originalPrice || 0,
      image: Array.isArray(item.productImage) ? (item.productImage[0] || '/images/仓鼠.png') : (item.productImage || '/images/仓鼠.png'),
      tag: item.productCategory || '其他',
      productName: item.productName,
      productDescription: item.productDescription || item.description || '',
      productCategory: item.productCategory,
      createTime: item.createTime,
      viewCount: item.viewCount || 0
    }));
    const sorted = reco.reorderProductsByWeights(list);
    const top12 = sorted.slice(0, 12);
    this.setData({ recommendProducts: top12 });
  },

  async ensureOpenId() {
    let openid = wx.getStorageSync('openid');
    if (!openid) {
      try {
        const result = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'getOpenId' } });
        if (result.result && result.result.openid) {
          openid = result.result.openid;
          wx.setStorageSync('openid', openid);
        }
      } catch (_) {}
    }
    return openid;
  },

  async resolveInterestsForRecommend() {
    const db = wx.cloud.database();
    const userInfo = wx.getStorageSync('userInfo') || {};
    const loggedInUserId = userInfo._id || '';
    let openid = null;
    if (loggedInUserId) {
      try {
        const r = await db.collection('T_user').doc(loggedInUserId).get();
        openid = r.data && r.data._openid;
      } catch (_) {}
    }
    if (!openid) {
      openid = await this.ensureOpenId();
    }
    let favRes = { data: [] };
    try {
      if (loggedInUserId) {
        favRes = await db.collection('T_favorites').where({ userId: loggedInUserId }).orderBy('createTime', 'desc').limit(300).get();
      } else if (openid) {
        favRes = await db.collection('T_favorites').where({ _openid: openid }).orderBy('createTime', 'desc').limit(300).get();
      }
    } catch (_) {}
    const counts = {};
    (favRes.data || []).forEach(f => {
      const c = f.productCategory || f.category;
      if (c) counts[c] = (counts[c] || 0) + 1;
    });
    const favTop = Object.keys(counts).sort((a,b)=> (counts[b]||0) - (counts[a]||0)).slice(0,3);
    const baseInterests = Array.isArray(userInfo.interests) ? userInfo.interests.filter(Boolean) : [];
    const interests = favTop.length > 0 ? favTop : baseInterests;
    return [...new Set(interests)].filter(Boolean);
  },

  /**
   * 加载空商品数据（当数据库中没有商品时）
   */
  loadEmptyProducts() {
    const emptyProducts = [
      { 
        id: 'empty', 
        name: '暂无推荐商品', 
        price: '0.00', 
        tag: '其他', 
        image: '/images/更多犬种.png',
        isEmpty: true
      }
    ];
    
    this.setData({
      recommendProducts: emptyProducts
    });
  },

  /**
   * 加载默认商品数据（当云数据库查询失败时）
   */
  loadDefaultProducts() {
    const defaultProducts = [
      { 
        id: 'error', 
        name: '加载失败，请稍后重试', 
        price: '0.00', 
        tag: '其他', 
        image: '/images/仓鼠.png',
        isError: true
      }
    ];
    
    this.setData({
      recommendProducts: defaultProducts
    });
    
    wx.showToast({
      title: '推荐加载失败',
      icon: 'none',
      duration: 2000
    });
  },

  /**
   * 搜索输入事件
   */
  onSearchInput(e) {
    this.setData({
      searchText: e.detail.value
    });
  },

  /**
   * 搜索确认：选择搜商品或搜求购并跳转
   */
  onSearchConfirm(e) {
    const keyword = (e && e.detail && e.detail.value ? e.detail.value : this.data.searchText || '').trim();
    if (!keyword) {
      wx.showToast({
        title: '请输入搜索关键词',
        icon: 'none'
      });
      return;
    }
    wx.showActionSheet({
      itemList: ['搜商品', '搜求购'],
      success: (res) => {
        const idx = res.tapIndex;
        const q = encodeURIComponent(keyword);
        if (idx === 0) {
          // 记录商品搜索行为
          reco.recordSearch(keyword, 'product');
          wx.navigateTo({
            url: `/pages/buy/buy?q=${q}`
          });
        } else if (idx === 1) {
          // 记录求购搜索行为
          reco.recordSearch(keyword, 'wanted');
          wx.navigateTo({
            url: `/pages/wanted-list/wanted-list?q=${q}`
          });
        }
      }
    });
  },

  /**
   * 功能导航点击事件
   */
  onNavigateTo(e) {
    const page = e.currentTarget.dataset.page;
    
    switch(page) {
      case 'pricing':
        wx.navigateTo({
          url: '/pages/pricing/pricing'
        });
        break;
      case 'buy':
        wx.navigateTo({
          url: '/pages/buy/buy'
        });
        break;
      case 'wanted':
        wx.navigateTo({
          url: '/pages/purchase/purchase'
        });
        break;
      case 'publish':
        wx.navigateTo({
          url: '/pages/publish/publish'
        });
        break;
    }
  },

  /**
   * 商品点击事件
   */
  onProductTap(e) {
    const productId = e.currentTarget.dataset.id;
    try {
      const product = e.currentTarget.dataset.product;
      if (product) {
        reco.recordClick(product);
      }
    } catch (err) {}
    wx.navigateTo({
      url: `/pages/product-detail/product-detail?id=${productId}`
    });
  },

  /**
   * 加载热门求购（点击量前三）
   */
  async loadHotWanted() {
    try {
      const db = wx.cloud.database();
      
      // 查询所有活跃的求购信息（微信云数据库不支持多个orderBy，先用viewCount排序）
      const result = await db.collection('T_want')
        .where({
          status: 'active'
        })
        .orderBy('viewCount', 'desc')
        .limit(20) // 先获取更多数据，然后在客户端排序
        .get();
      
      console.log('热门求购查询结果:', result);
      
      if (result.data && result.data.length > 0) {
        // 在客户端进行排序：先按点击量降序，点击量相同则按时间降序（时间更晚的在前）
        const sortedData = result.data.sort((a, b) => {
          const viewCountA = a.viewCount || 0;
          const viewCountB = b.viewCount || 0;
          
          // 如果点击量不同，按点击量降序
          if (viewCountA !== viewCountB) {
            return viewCountB - viewCountA;
          }
          
          // 点击量相同，按时间降序（时间更晚的在前）
          const timeA = new Date(a.createTime).getTime();
          const timeB = new Date(b.createTime).getTime();
          return timeB - timeA;
        });
        
        // 取前3条
        const hotWanted = sortedData.slice(0, 3).map(item => ({
          id: item._id,
          title: item.productName || '求购商品',
          budget: item.expectedPrice || 0,
          time: this.formatTime(item.createTime),
          viewCount: item.viewCount || 0,
          category: item.productCategory || '其他'
        }));
        
        this.setData({
          hotWanted: hotWanted
        });
      } else {
        // 如果没有数据，显示空状态
        this.setData({
          hotWanted: []
        });
      }
    } catch (err) {
      console.error('加载热门求购失败:', err);
      // 失败时使用默认数据
      this.setData({
        hotWanted: []
      });
    }
  },

  /**
   * 格式化时间
   */
  formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    
    if (diff < minute) {
      return '刚刚';
    } else if (diff < hour) {
      return Math.floor(diff / minute) + '分钟前';
    } else if (diff < day) {
      return Math.floor(diff / hour) + '小时前';
    } else if (diff < 7 * day) {
      return Math.floor(diff / day) + '天前';
    } else {
      return d.getMonth() + 1 + '月' + d.getDate() + '日';
    }
  },

  /**
   * 求购点击事件（增加点击量）
   */
  async onWantedTap(e) {
    const wantedId = e.currentTarget.dataset.id;
    const wanted = this.data.hotWanted.find(w => w.id === wantedId);
    
    if (!wanted) return;
    
    // 增加点击量
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      await db.collection('T_want').doc(wantedId).update({
        data: {
          viewCount: _.inc(1),
          updateTime: new Date()
        }
      });
      
      // 更新本地数据
      const updatedWanted = this.data.hotWanted.map(item => {
        if (item.id === wantedId) {
          return {
            ...item,
            viewCount: (item.viewCount || 0) + 1
          };
        }
        return item;
      });
      
      this.setData({
        hotWanted: updatedWanted
      });
      
      // 跳转到求购详情页面（或显示详情）
      wx.navigateTo({
        url: `/pages/wanted-list/wanted-list?id=${wantedId}`
      });
    } catch (err) {
      console.error('更新点击量失败:', err);
      // 即使更新失败也跳转
      wx.navigateTo({
        url: `/pages/wanted-list/wanted-list?id=${wantedId}`
      });
    }
  },

  /**
   * 跳转到求购列表页面
   */
  onViewMoreWanted() {
    wx.navigateTo({
      url: '/pages/wanted-list/wanted-list'
    });
  },

  /**
   * 底部导航切换
   */
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    
    if (tab === this.data.currentTab) {
      return;
    }
    
    this.setData({
      currentTab: tab
    });
    
    // 根据不同的tab加载不同的内容
    switch(tab) {
      case 'home':
        this.loadHomeContent();
        break;
      case 'market':
        this.loadMarketContent();
        break;
      case 'cart':
        // 跳转到购物车页面
        wx.navigateTo({
          url: '/pages/cart/cart'
        });
        // 保持当前tab状态
        setTimeout(() => {
          this.setData({ currentTab: 'home' });
        }, 100);
        break;
      case 'message':
        // 跳转到消息列表页面
        wx.navigateTo({
          url: '/pages/messages/messages'
        });
        // 保持首页tab高亮
        setTimeout(() => {
          this.setData({ currentTab: 'home' });
        }, 100);
        break;
      case 'profile':
        // 跳转到个人中心页面
        wx.navigateTo({
          url: '/pages/profile/profile'
        });
        // 保持当前tab状态
        setTimeout(() => {
          this.setData({
            currentTab: 'home'
          });
        }, 100);
        break;
    }
  },

  /**
   * 加载首页内容
   */
  loadHomeContent() {
    console.log('加载首页内容');
  },

  /**
   * 加载市场内容
   */
  loadMarketContent() {
    // 跳转到市场页面（地图/列表）
    wx.navigateTo({
      url: '/pages/market/market'
    });
    // 保持首页tab高亮
    setTimeout(() => {
      this.setData({ currentTab: 'home' });
    }, 100);
  },

  /**
   * 加载消息内容
   */
  loadMessageContent() {
    // 已改为跳转到消息列表页
    wx.navigateTo({
      url: '/pages/messages/messages'
    });
  },

  async loadUnreadStatus() {
    try {
      const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'listChatSessions' } });
      const list = (res.result?.data || []);
      const total = list.reduce((sum, s) => sum + (Number(s.unreadCount) || 0), 0);
      this.setData({ hasMessageAlert: total > 0 });
    } catch (e) {
      this.setData({ hasMessageAlert: false });
    }
  },

  /**
   * 加载个人中心内容
   */
  loadProfileContent() {
    console.log('加载个人中心内容');
  },

  /**
   * 用户头像点击事件
   */
  onUserProfile() {
    wx.showActionSheet({
      itemList: ['查看资料', '设置', '退出登录'],
      success: (res) => {
        switch(res.tapIndex) {
          case 0:
            wx.showToast({
              title: '查看用户资料',
              icon: 'none'
            });
            break;
          case 1:
            wx.showToast({
              title: '打开设置',
              icon: 'none'
            });
            break;
          case 2:
            this.onLogout();
            break;
        }
      }
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
          
          // 跳转到登录页面
          wx.redirectTo({
            url: '/pages/index/index'
          });
        }
      }
    });
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    console.log('下拉刷新');
    
    // 立即停止下拉刷新，不显示任何提示
    wx.stopPullDownRefresh();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    console.log('上拉触底');
    // 不执行任何操作，避免显示加载提示
  },
  /**
   * 更多推荐入口
   */
  onViewMoreRecommendations() {
    wx.navigateTo({ url: '/pages/recommend-list/recommend-list' });
  }
})