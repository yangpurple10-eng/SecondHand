// pages/myProducts/myProducts.js
Page({
  
  /**
   * 页面的初始数据
   */
  data: {
    // 商品分类
    categories: ['全部', '电子产品', '图书文具', '服装鞋帽', '运动户外', '美妆个护', '家居生活', '其他'],
    selectedCategory: 0,
    
    // 商品状态筛选
    statusFilter: ['全部', '在售', '交易中', '已售出', '已下架'],
    selectedStatus: 0,
    
    // 排序选项
    sortOptions: ['默认排序', '发布时间', '价格从低到高', '价格从高到低'],
    selectedSort: 0,
    
    // 商品列表数据
    products: [],
    filteredProducts: [],
    
    // 加载状态
    isLoading: true,
    error: '',
    
    // 分页相关
    currentPage: 1,
    pageSize: 10,
    hasMore: true
  },
  
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 清除可能缓存的旧openid，确保使用登录的用户ID获取正确的openid
    const userInfo = wx.getStorageSync('userInfo') || {};
    if (userInfo._id) {
      // 如果有登录的用户ID，清除旧的openid缓存，强制重新获取
      wx.removeStorageSync('openid');
    }
    this.loadMyProducts();
  },
  
  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次显示页面时强制重新加载数据，确保数据最新
    // 清除可能缓存的旧openid，确保使用登录的用户ID获取正确的openid
    const userInfo = wx.getStorageSync('userInfo') || {};
    if (userInfo._id) {
      // 如果有登录的用户ID，清除旧的openid缓存，强制重新获取
      wx.removeStorageSync('openid');
    }
    this.loadMyProducts();
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
   * 加载我的商品列表
   */
  async loadMyProducts() {
    this.setData({
      isLoading: true,
      error: ''
    });
    
    try {
      const db = wx.cloud.database();
      let openid = null;
      
      // 强制使用登录时保存的用户ID来获取openid
      const userInfo = wx.getStorageSync('userInfo') || {};
      const loggedInUserId = userInfo._id;
      
      if (!loggedInUserId) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        this.setData({
          products: [],
          filteredProducts: [],
          isLoading: false,
          hasMore: false,
          error: '请先登录'
        });
        return;
      }
      
      // 强制使用登录的用户ID查询用户信息，获取其_openid
      try {
        const userResult = await db.collection('T_user')
          .doc(loggedInUserId)
          .get();
        
        if (userResult.data && userResult.data._openid) {
          openid = userResult.data._openid;
          console.log('通过登录用户ID获取到正确的openid:', openid);
          console.log('登录的用户ID:', loggedInUserId);
          console.log('登录的用户信息:', userInfo);
        } else {
          console.error('用户记录中没有_openid:', userResult.data);
          wx.showToast({
            title: '获取用户信息失败',
            icon: 'none'
          });
          this.setData({
            products: [],
            filteredProducts: [],
            isLoading: false,
            hasMore: false,
            error: '获取用户信息失败'
          });
          return;
        }
      } catch (err) {
        console.error('通过用户ID获取openid失败:', err);
        wx.showToast({
          title: '获取用户信息失败',
          icon: 'none'
        });
        this.setData({
          products: [],
          filteredProducts: [],
          isLoading: false,
          hasMore: false,
          error: '获取用户信息失败'
        });
        return;
      }
      
      console.log('查询我的商品，使用openid:', openid);
      console.log('登录的用户ID:', loggedInUserId);
      
      // 查询当前用户的商品
      // 如果登录了账号（有loggedInUserId），强制只使用sellerUserId查询，确保精确匹配
      // 如果没有登录的用户ID，才使用sellerOpenId和_openid（向后兼容）
      const _ = db.command;
      let result;
      
      if (loggedInUserId) {
        // 强制使用sellerUserId查询，确保只显示当前登录账号发布的商品
        try {
          result = await db.collection('T_product')
            .where({
              sellerUserId: loggedInUserId
            })
            .orderBy('createTime', 'desc')
            .get();
          
          console.log('通过sellerUserId查询商品，用户ID:', loggedInUserId, '查询到:', result.data ? result.data.length : 0);
          
          // 如果没有查询到数据，直接返回空列表（新账号应该返回空）
          if (!result.data || result.data.length === 0) {
            console.log('当前账号没有发布过商品，返回空列表');
            result = { data: [] };
          }
        } catch (err) {
          console.error('通过sellerUserId查询商品失败:', err);
          // 即使查询失败，也不回退到openid查询，直接返回空列表
          result = { data: [] };
        }
      } else {
        // 如果没有登录的用户ID，使用sellerOpenId和_openid（向后兼容）
        console.log('没有登录的用户ID，使用sellerOpenId和_openid查询');
        try {
          result = await db.collection('T_product')
            .where(
              _.or([
                { sellerOpenId: openid },
                { _openid: openid }
              ])
            )
            .orderBy('createTime', 'desc')
            .get();
        } catch (err) {
          console.error('查询商品失败:', err);
          result = { data: [] };
        }
      }
      
      console.log('我的商品查询结果:', result);
      console.log('查询到的商品数量:', result.data ? result.data.length : 0);
      
      if (result.data && result.data.length > 0) {
        // 将数据库数据转换为页面需要的格式
        const products = result.data.map((item, index) => {
          // 状态映射：在售/交易中/已售出/已下架 -> selling/transacting/sold/off
          let status = 'selling';
          if (item.status === '交易中' || item.status === '待确认付款' || item.status === '待发货' || item.status === '待收货') {
            status = 'transacting';
          } else if (item.status === '已售' || item.status === '已售出') {
            status = 'sold';
          } else if (item.status === '已下架') {
            status = 'off';
          }
          
          // 格式化时间
          const publishTime = this.formatTime(item.createTime);
          
          return {
            id: item._id,
            name: item.productName || '商品名称',
            price: item.salePrice || item.suggestedPrice || item.originalPrice || 0,
            originalPrice: item.originalPrice || 0,
            image: item.productImage || 'https://via.placeholder.com/600x400/cccccc/ffffff?text=Product',
            category: item.productCategory || '其他',
            status: status,
            publishTime: publishTime,
            createTime: item.createTime ? new Date(item.createTime).getTime() : Date.now(), // 保存原始时间戳用于排序
            views: item.viewCount || 0,
            likes: item.likeCount || 0,
            comments: 0 // 评论数暂时设为0，如果有评论集合可以查询
          };
        });
        
        console.log('转换后的商品列表:', products);
        
        this.setData({
          products: products,
          isLoading: false,
          hasMore: false
        });
        
        // 应用筛选
        this.filterProducts();
      } else {
        console.log('没有查询到商品数据');
        this.setData({
          products: [],
          filteredProducts: [],
          isLoading: false,
          hasMore: false
        });
      }
    } catch (err) {
      console.error('加载我的商品失败:', err);
      console.error('错误详情:', JSON.stringify(err, null, 2));
      this.setData({
        error: '加载失败，请重试',
        isLoading: false,
        products: [],
        filteredProducts: []
      });
      wx.showToast({
        title: '加载失败: ' + (err.errMsg || '未知错误'),
        icon: 'none',
        duration: 3000
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
   * 切换商品分类
   */
  onCategoryChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      selectedCategory: index,
      currentPage: 1
    });
    this.filterProducts();
  },
  
  /**
   * 切换商品状态筛选
   */
  onStatusChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      selectedStatus: index,
      currentPage: 1
    });
    this.filterProducts();
  },
  
  /**
   * 切换排序方式
   */
  onSortChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      selectedSort: index
    });
    this.filterProducts();
  },
  
  /**
   * 根据筛选条件过滤商品
   */
  filterProducts() {
    let filtered = [...this.data.products];
    
    // 按分类筛选
    if (this.data.selectedCategory !== 0) {
      const category = this.data.categories[this.data.selectedCategory];
      filtered = filtered.filter(item => item.category === category);
    }
    
    // 按状态筛选
    if (this.data.selectedStatus !== 0) {
      const statusMap = {
        1: 'selling',      // 在售
        2: 'transacting',  // 交易中
        3: 'sold',         // 已售出
        4: 'off'           // 已下架
      };
      const status = statusMap[this.data.selectedStatus];
      filtered = filtered.filter(item => item.status === status);
    }
    
    // 排序
    switch (this.data.selectedSort) {
      case 1: // 发布时间（最新的在前）
        filtered.sort((a, b) => {
          const timeA = a.createTime || 0;
          const timeB = b.createTime || 0;
          return timeB - timeA; // 降序：最新的在前
        });
        break;
      case 2: // 价格从低到高
        filtered.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        break;
      case 3: // 价格从高到低
        filtered.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
        break;
      default: // 默认排序（保持数据库返回的顺序）
        // 保持原顺序
        break;
    }
    
    this.setData({
      filteredProducts: filtered
    });
  },
  
  /**
   * 查看商品详情
   */
  onProductDetail(e) {
    const productId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/product-detail/product-detail?id=${productId}`
    });
  },

  /**
   * 处理交易：跳转到订单页面（卖家视角）
   */
  onHandleTransaction(e) {
    const productId = e.currentTarget.dataset.id;
    // 跳转到订单页并切换为卖家视角；可附带productId用于后续扩展筛选
    wx.navigateTo({
      url: `/pages/orders/orders?role=seller&productId=${productId}`
    });
  },
  
  /**
   * 下架商品
   */
  async onOffShelf(e) {
    const productId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认下架',
      content: '确定要下架该商品吗？下架后可重新上架。',
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database();
            
            // 更新数据库中的商品状态
            await db.collection('T_product').doc(productId).update({
              data: {
                status: '已下架',
                updateTime: new Date()
              }
            });
            try {
              const pr = await db.collection('T_product').doc(productId).get();
              const p = pr.data || {};
              const name = p.tradeLandmarkName || (p.tradeLocation && p.tradeLocation.landmarkName) || p.tradeAddress || '';
              const lat = Number(p.tradeLocationLat ?? (p.tradeLocation && p.tradeLocation.latitude));
              const lng = Number(p.tradeLocationLng ?? (p.tradeLocation && p.tradeLocation.longitude));
              const selling = false;
              if (name && Number.isFinite(lat) && Number.isFinite(lng)) {
                await wx.cloud.callFunction({
                  name: 'quickstartFunctions',
                  data: { type: 'upsertCampusLandmark', name, latitude: lat, longitude: lng, address: p.tradeAddress || '', source: 'product', productId, selling, productCategory: p.productCategory || '', thumbUrl: (Array.isArray(p.productImage) ? p.productImage[0] : (typeof p.productImage === 'string' ? p.productImage : '')) }
                });
              }
            } catch (_) {}
            
            // 重新加载商品列表
            await this.loadMyProducts();
            
            wx.showToast({
              title: '商品已下架',
              icon: 'success'
            });
          } catch (err) {
            console.error('下架商品失败:', err);
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
   * 重新上架商品
   */
  async onReShelf(e) {
    const productId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '重新上架',
      content: '确定要重新上架该商品吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database();
            
            // 更新数据库中的商品状态
            await db.collection('T_product').doc(productId).update({
              data: {
                status: '在售',
                updateTime: new Date()
              }
            });
            try {
              const pr = await db.collection('T_product').doc(productId).get();
              const p = pr.data || {};
              const name = p.tradeLandmarkName || (p.tradeLocation && p.tradeLocation.landmarkName) || p.tradeAddress || '';
              const lat = Number(p.tradeLocationLat ?? (p.tradeLocation && p.tradeLocation.latitude));
              const lng = Number(p.tradeLocationLng ?? (p.tradeLocation && p.tradeLocation.longitude));
              const selling = true;
              if (name && Number.isFinite(lat) && Number.isFinite(lng)) {
                await wx.cloud.callFunction({
                  name: 'quickstartFunctions',
                  data: { type: 'upsertCampusLandmark', name, latitude: lat, longitude: lng, address: p.tradeAddress || '', source: 'product', productId, selling, productCategory: p.productCategory || '', thumbUrl: (Array.isArray(p.productImage) ? p.productImage[0] : (typeof p.productImage === 'string' ? p.productImage : '')) }
                });
              }
            } catch (_) {}
            
            // 重新加载商品列表
            await this.loadMyProducts();
            
            wx.showToast({
              title: '商品已重新上架',
              icon: 'success'
            });
          } catch (err) {
            console.error('重新上架商品失败:', err);
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
   * 编辑商品
   */
  onEditProduct(e) {
    const productId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/publish/publish?mode=edit&id=${productId}`
    });
  },
  
  /**
   * 删除商品
   */
  async onDeleteProduct(e) {
    const productId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该商品吗？删除后无法恢复。',
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database();
            
            // 从数据库中删除商品
            await db.collection('T_product').doc(productId).remove();
            
            // 重新加载商品列表（这样会自动移除不存在的商品）
            await this.loadMyProducts();
            
            wx.showToast({
              title: '商品已删除',
              icon: 'success'
            });
          } catch (err) {
            console.error('删除商品失败:', err);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },
  
  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      // 实际项目中这里应该请求下一页数据
      wx.showToast({
        title: '没有更多数据了',
        icon: 'none'
      });
    }
  },
  
  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    await this.loadMyProducts();
    wx.stopPullDownRefresh();
  },
  
  /**
   * 返回上一页
   */
  onBack() {
    wx.navigateBack();
  },

  /**
   * 去发布商品
   */
  onPublish() {
    wx.navigateTo({
      url: '/pages/publish/publish'
    });
  }
});