// pages/product-detail/product-detail.js
const reco = require('../../utils/recommendation.js');
Page({
  /**
   * 页面的初始数据
   */
  data: {
    productId: '',
    product: null,
    loading: true,
    
    // 图片相关
    imageUrls: [],
    currentImageIndex: 0,
    
    // 购物车数量
    cartCount: 0,
    
    // 收藏状态
    isFavorite: false,
    
    // 是否已添加到购物车
    inCart: false,

    // 位置信息与推荐交易点
    buyerLocation: null,            // { latitude, longitude }
    tradeLocation: null,            // { latitude, longitude, name }
    distanceText: '',               // "距你 Xkm"
    recommendedSpot: null,          // { name, latitude, longitude, score }
    landmarks: [],                  // 校园官方交易点
    buyerAddress: '',
    tradeAddress: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    const productId = options.id;
    if (!productId) {
      wx.showToast({
        title: '商品不存在',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }
    
    this.setData({
      productId: productId
    });
    
    this.loadProductDetail();
    this.loadCartCount();
    this.loadFavoriteStatus();

    // 初始化定位，仅用于计算与交易地点距离
    this.initBuyerLocation();
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
   * 加载收藏状态
   */
  async loadFavoriteStatus() {
    try {
      const db = wx.cloud.database();
      const openid = await this.ensureOpenId();
      const userInfo = wx.getStorageSync('userInfo') || {};
      const loggedInUserId = userInfo._id || '';
      
      if (!openid) {
        this.setData({
          isFavorite: false
        });
        return;
      }
      
      // 从数据库查询是否已收藏（优先按用户ID，其次按openid）
      try {
        let result;
        if (loggedInUserId) {
          result = await db.collection('T_favorites')
            .where({ userId: loggedInUserId, productId: this.data.productId })
            .get();
        } else {
          result = await db.collection('T_favorites')
            .where({ _openid: openid, productId: this.data.productId })
            .get();
        }
        const isFavorite = result.data && result.data.length > 0;
        this.setData({ isFavorite });
      } catch (err) {
        // 如果集合不存在，认为未收藏
        if (err.errMsg && err.errMsg.includes('not exist')) {
          this.setData({
            isFavorite: false
          });
        } else {
          // 其他错误，从本地存储读取
          const favorites = wx.getStorageSync('favorites') || [];
          const isFavorite = favorites.includes(this.data.productId);
          this.setData({
            isFavorite: isFavorite
          });
        }
      }
    } catch (err) {
      console.error('加载收藏状态失败:', err);
      // 失败时从本地存储读取
      try {
        const favorites = wx.getStorageSync('favorites') || [];
        const isFavorite = favorites.includes(this.data.productId);
        this.setData({
          isFavorite: isFavorite
        });
      } catch (e) {
        this.setData({
          isFavorite: false
        });
      }
    }
  },

  /**
   * 加载商品详情
   */
  async loadProductDetail() {
    wx.showLoading({
      title: '加载中...',
      mask: true
    });

    try {
      const db = wx.cloud.database();
      const result = await db.collection('T_product').doc(this.data.productId).get();
      
      if (!result.data) {
        throw new Error('商品不存在');
      }

      const product = result.data;
      
      console.log('========== 商品详情加载 ==========');
      console.log('商品ID:', this.data.productId);
      console.log('完整商品数据:', JSON.stringify(product, null, 2));
      console.log('商品图片字段(productImage):', product.productImage);
      console.log('图片字段类型:', typeof product.productImage);
      console.log('是否为数组:', Array.isArray(product.productImage));
      
      // 获取图片URL
      let imageUrls = [];
      
      // 获取图片数据（支持多种格式）
      let rawImages = [];
      
      if (product.productImage) {
        if (Array.isArray(product.productImage)) {
          rawImages = product.productImage.filter(img => img); // 过滤空值
        } else if (typeof product.productImage === 'string') {
          rawImages = [product.productImage];
        }
      }
      
      // 兼容其他可能的字段名
      if (rawImages.length === 0) {
        if (product.imageUrls && Array.isArray(product.imageUrls)) {
          rawImages = product.imageUrls.filter(img => img);
        } else if (product.imageUrl) {
          rawImages = [product.imageUrl];
        }
      }
      
      console.log('原始图片数据:', rawImages);
      console.log('原始图片数量:', rawImages.length);
      
      if (rawImages.length === 0) {
        console.warn('⚠️ 商品没有图片数据');
        imageUrls.push('https://via.placeholder.com/600x400/cccccc/ffffff?text=Product');
      } else {
        // 处理每张图片
        for (let i = 0; i < rawImages.length; i++) {
          const img = rawImages[i];
          console.log(`\n处理图片 ${i + 1}/${rawImages.length}:`, img);
          
          if (!img || typeof img !== 'string') {
            console.warn(`图片 ${i + 1} 无效，跳过`);
            continue;
          }
          
          // 云存储路径处理
          if (img.startsWith('cloud://')) {
            console.log('检测到云存储路径，获取临时URL...');
            try {
              const tempFileURL = await wx.cloud.getTempFileURL({
                fileList: [img]
              });
              
              console.log('getTempFileURL返回:', tempFileURL);
              
              if (tempFileURL && tempFileURL.fileList && tempFileURL.fileList.length > 0) {
                const tempURL = tempFileURL.fileList[0].tempFileURL;
                if (tempURL) {
                  console.log(`✅ 成功获取临时URL: ${tempURL}`);
                  imageUrls.push(tempURL);
                } else {
                  console.warn(`⚠️ 临时URL为空`);
                  // 尝试直接使用原路径
                  imageUrls.push(img);
                }
              } else {
                console.warn('⚠️ fileList为空或不存在');
                // 尝试直接使用原路径
                imageUrls.push(img);
              }
            } catch (err) {
              console.error(`❌ 获取临时URL失败:`, err);
              console.error('错误详情:', JSON.stringify(err, null, 2));
              // 即使出错，也尝试使用原路径
              imageUrls.push(img);
            }
          } 
          // HTTP/HTTPS网络URL
          else if (img.startsWith('http://') || img.startsWith('https://')) {
            console.log('使用网络URL:', img);
            imageUrls.push(img);
          } 
          // 相对路径
          else if (img.startsWith('/')) {
            console.log('使用相对路径:', img);
            imageUrls.push(img);
          } 
          // 其他情况，直接尝试使用
          else {
            console.log('使用其他格式路径:', img);
            imageUrls.push(img);
          }
        }
      }
      
      // 确保至少有一张图片
      if (imageUrls.length === 0) {
        console.warn('⚠️ 所有图片处理失败，使用默认图片');
        imageUrls.push('https://via.placeholder.com/750x750/E0E0E0/999999?text=暂无图片');
      }
      
      // 如果图片URLs为空或者都是无效的，添加一个测试图片
      const validUrls = imageUrls.filter(url => url && url !== 'https://via.placeholder.com/750x750/E0E0E0/999999?text=暂无图片');
      if (validUrls.length === 0 && imageUrls.length > 0) {
        console.warn('⚠️ 所有图片URL无效，尝试使用测试图片');
        imageUrls.push('https://via.placeholder.com/750x750/4285F4/ffffff?text=测试图片');
      }
      
      console.log('\n========== 图片处理结果 ==========');
      console.log('最终图片URLs:', imageUrls);
      console.log('图片URLs数量:', imageUrls.length);
      console.log('第一张图片URL:', imageUrls[0]);
      console.log('=====================================\n');
      
      // 确保 imageUrls 不为空
      if (!imageUrls || imageUrls.length === 0) {
        console.error('❌ imageUrls为空，设置默认值');
        imageUrls = ['https://via.placeholder.com/750x750/4285F4/ffffff?text=暂无图片'];
      }

      // 获取卖家信息 - 优先从product.sellerInfo获取；其次 sellerUserId；最后 sellerOpenId
      let sellerInfo = {
        name: '用户',
        avatar: 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U',
        sno: '',
        phone: '',
        userId: '',
        openId: ''
      };

      // 1) 若 product.sellerInfo 存在，直接使用，同时补充 userId/openId 以便跳转聊天
      if (product.sellerInfo) {
        sellerInfo = {
          name: product.sellerInfo.sname || product.sellerInfo.name || '用户',
          avatar: product.sellerInfo.avatar || 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U',
          sno: product.sellerInfo.sno || '',
          phone: product.sellerInfo.phone || '',
          userId: product.sellerInfo.userId || product.sellerUserId || '',
          openId: product.sellerInfo.openId || product.sellerOpenId || ''
        };
      } else if (product.sellerUserId) {
        // 2) 优先按 sellerUserId 查询 T_user，避免 openid 变更导致关联错误
        try {
          const byId = await db.collection('T_user').doc(product.sellerUserId).get();
          const seller = byId.data || null;
          if (seller) {
            sellerInfo = {
              name: seller.sname || seller.nickName || '用户',
              avatar: seller.avatar || 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U',
              sno: seller.sno || '',
              phone: seller.phone || '',
              userId: seller._id || product.sellerUserId,
              openId: seller._openid || product.sellerOpenId || ''
            };
          }
        } catch (err) {
          console.error('通过 sellerUserId 获取卖家信息失败:', err);
        }
      } else if (product.sellerOpenId) {
        // 3) 回退按 sellerOpenId 查询 T_user
        try {
          const sellerResult = await db.collection('T_user')
            .where({ _openid: product.sellerOpenId })
            .limit(1)
            .get();
          const seller = (sellerResult.data && sellerResult.data[0]) || null;
          if (seller) {
            sellerInfo = {
              name: seller.sname || seller.nickName || '用户',
              avatar: seller.avatar || 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U',
              sno: seller.sno || '',
              phone: seller.phone || '',
              userId: seller._id || '',
              openId: seller._openid || product.sellerOpenId
            };
          }
        } catch (err) {
          console.error('通过 sellerOpenId 获取卖家信息失败:', err);
        }
      }
      
      console.log('卖家信息:', sellerInfo);

      // 格式化时间
      const publishTime = this.formatTime(product.createTime);

      this.setData({
        product: {
          ...product,
          imageUrls: imageUrls,
          sellerInfo: sellerInfo,
          publishTime: publishTime,
          conditionText: product.conditionLevel || '未知',
          aiScoreText: product.aiScore || '--',
          priceRangeText: product.priceRange || '--'
        },
        imageUrls: imageUrls,
        loading: false
      });

      wx.hideLoading();

      // 同步交易地点并计算距离与推荐点
      this.updateTradeLocationFromProduct(product);
      await this.resolveTradeAddress();
      this.updateDistanceAndRecommend();
      
      // 记录用户浏览行为（云端 + 本地权重）
      this.recordBehavior('view', product.productCategory);
      try { reco.recordView(product); } catch (e) {}
    } catch (err) {
      console.error('加载商品详情失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  /**
   * 初始化买家定位
   */
  initBuyerLocation() {
    try {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.setData({
            buyerLocation: {
              latitude: res.latitude,
              longitude: res.longitude
            }
          });
          this.resolveBuyerAddress();
          this.updateDistanceAndRecommend();
        },
        fail: (err) => {
          console.warn('获取定位失败，距离功能将受限:', err);
        }
      });
    } catch (err) {
      console.warn('定位异常:', err);
    }
  },

  /**
   * 加载校园官方交易点
   */
  async loadLandmarks() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('T_campus_landmarks').get();
      const list = (res.data || []).map(it => ({
        name: it.name || it.landmarkName || '交易点',
        latitude: it.lat || it.latitude,
        longitude: it.lng || it.longitude
      })).filter(x => typeof x.latitude === 'number' && typeof x.longitude === 'number');
      // 已不使用推荐点，保留方法但不更新UI
      if (list.length > 0) {
        this.setData({ landmarks: list });
        return;
      }
    } catch (err) {
      console.warn('加载官方交易点失败:', err);
      // 无交易点时不影响主流程
    }
    // 数据库为空或异常时，回退到内置校园官方交易点（仅作为备用数据，不用于推荐）
    try {
      const { officialTradeSpots } = require('../../utils/campusMap.js');
      const spots = (officialTradeSpots || []).map(s => ({
        name: s.name,
        latitude: s.latitude,
        longitude: s.longitude
      })).filter(x => typeof x.latitude === 'number' && typeof x.longitude === 'number');
      if (spots.length > 0) {
        this.setData({ landmarks: spots });
      }
    } catch (e) {
      console.warn('本地交易点加载失败:', e);
    }
  },

  /**
   * 从商品同步交易地点
   */
  updateTradeLocationFromProduct(product) {
    if (!product) return;
    const lat = product.tradeLocationLat;
    const lng = product.tradeLocationLng;
    const name = product.tradeLandmarkName || product.tradeLocationName || '';
    if (typeof lat === 'number' && typeof lng === 'number') {
      this.setData({
        tradeLocation: { latitude: lat, longitude: lng, name },
        tradeAddress: product.tradeAddress || this.data.tradeAddress
      });
    } else {
      // 坐标缺失时，尝试根据校园地标名匹配坐标
      if (name) {
        try {
          const { campusLandmarks } = require('../../utils/campusMap.js');
          const m = campusLandmarks.find(l => String(name).includes(l.name));
          if (m && typeof m.latitude === 'number' && typeof m.longitude === 'number') {
            this.setData({ tradeLocation: { latitude: m.latitude, longitude: m.longitude, name } });
            return;
          }
        } catch (_) {}
      }
      this.setData({ tradeLocation: null });
    }
  },

  async resolveBuyerAddress() {
    const buyer = this.data.buyerLocation;
    if (!buyer || typeof buyer.latitude !== 'number' || typeof buyer.longitude !== 'number') return;
    try {
      const { reverseGeocode } = require('../../utils/geocoder.js');
      const addr = await reverseGeocode(buyer);
      this.setData({ buyerAddress: addr });
    } catch (e) {
      console.warn('解析我的位置地址失败:', e);
    }
  },

  async resolveTradeAddress() {
    const loc = this.data.tradeLocation;
    if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return;
    try {
      const { reverseGeocode } = require('../../utils/geocoder.js');
      const addr = await reverseGeocode(loc);
      this.setData({ tradeAddress: addr });
    } catch (e) {
      console.warn('解析交易地点地址失败:', e);
    }
  },

  /**
   * 计算距离与推荐交易点
   */
  updateDistanceAndRecommend() {
    const buyer = this.data.buyerLocation;
    const trade = this.data.tradeLocation;
    if (buyer && trade) {
      const km = this.calcDistanceKm(buyer.latitude, buyer.longitude, trade.latitude, trade.longitude);
      this.setData({ distanceText: this.formatDistance(km) });
      // 不再计算推荐交易点，仅展示商品交易地点
      this.setData({ recommendedSpot: null });
    }
  },

  /**
   * Haversine 距离计算（单位：km）
   */
  calcDistanceKm(lat1, lon1, lat2, lon2) {
    const toRad = (d) => d * Math.PI / 180;
    const R = 6371; // 地球半径(km)
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  /**
   * 距离显示格式化
   */
  formatDistance(km) {
    if (km < 1) {
      const m = Math.round(km * 1000);
      return `${m}m`;
    }
    return `${km.toFixed(1)}km`;
  },

  /**
   * 导航到商品交易地点
   */
  onNavigateToTradeLocation() {
    const loc = this.data.tradeLocation;
    if (!loc) {
      wx.showToast({ title: '暂无交易地点', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude: loc.latitude,
      longitude: loc.longitude,
      name: loc.name ? `交易地点：${loc.name}` : '交易地点',
      scale: 17
    });
  },

  /**
   * 导航到推荐安全交易点
   */
  onNavigateToRecommendedSpot() {
    const spot = this.data.recommendedSpot;
    if (!spot) {
      wx.showToast({ title: '暂无推荐地点', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude: spot.latitude,
      longitude: spot.longitude,
      name: spot.name ? `推荐交易点：${spot.name}` : '推荐交易点',
      scale: 17
    });
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
   * 图片加载错误处理
   */
  onImageError(e) {
    const index = e.currentTarget.dataset.index;
    const failedUrl = this.data.imageUrls[index];
    
    console.error('========== 图片加载失败 ==========');
    console.error('图片索引:', index);
    console.error('失败URL:', failedUrl);
    console.error('错误对象:', e.detail);
    console.error('=====================================');
    
    wx.showToast({
      title: '图片加载失败',
      icon: 'none',
      duration: 2000
    });
    
    // 如果失败的是云存储临时URL，尝试重新获取
    if (failedUrl && failedUrl.includes('myqcloud.com')) {
      console.log('尝试重新获取云存储图片URL...');
      // 可以在这里添加重试逻辑
    }
  },

  /**
   * 图片轮播切换
   */
  onImageChange(e) {
    this.setData({
      currentImageIndex: e.detail.current
    });
  },

  /**
   * 预览图片
   */
  onPreviewImage(e) {
    const index = e.currentTarget.dataset.index !== undefined ? e.currentTarget.dataset.index : this.data.currentImageIndex;
    const imageUrls = this.data.imageUrls || [];
    
    if (!imageUrls || imageUrls.length === 0) {
      wx.showToast({
        title: '暂无图片',
        icon: 'none'
      });
      return;
    }
    
    // 确保索引有效
    const currentIndex = index >= 0 && index < imageUrls.length ? index : 0;
    
    wx.previewImage({
      urls: imageUrls,
      current: imageUrls[currentIndex],
      fail: (err) => {
        console.error('预览图片失败:', err);
        wx.showToast({
          title: '预览失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 联系卖家
   */
  onContactSeller() {
    const sellerInfo = this.data.product?.sellerInfo;
    const sellerOpenId = sellerInfo?.openId || this.data.product?.sellerOpenId || '';
    const sellerUserId = this.data.product?.sellerUserId || sellerInfo?.userId || '';
    const sellerName = sellerInfo?.name || '用户';

    if (!sellerOpenId) {
      wx.showToast({ title: '卖家信息不存在', icon: 'none' });
      return;
    }

    // 跳转到与卖家的聊天窗口
    const params = `toUserId=${sellerUserId}&toOpenId=${sellerOpenId}&toName=${encodeURIComponent(sellerName)}&productId=${this.data.productId}`;
    const url = `/pages/chat/chat?${params}`;
    wx.navigateTo({ url });
  },

  /**
   * 加入购物车
   */
  onAddToCart() {
    if (this.data.product.status !== '在售') {
      wx.showToast({
        title: '商品已下架或已售出',
        icon: 'none'
      });
      return;
    }

    try {
      // 获取购物车数据
      let cart = wx.getStorageSync('cart') || [];
      
      // 检查商品是否已在购物车中
      const existingIndex = cart.findIndex(item => item.id === this.data.productId);
      
      if (existingIndex >= 0) {
        wx.showToast({
          title: '已在购物车中',
          icon: 'none'
        });
        return;
      }

      // 添加到购物车
      const cartItem = {
        id: this.data.productId,
        name: this.data.product.productName,
        price: this.data.product.salePrice || this.data.product.suggestedPrice,
        image: this.data.imageUrls[0] || 'https://via.placeholder.com/600x400/cccccc/666666?text=商品图',
        category: this.data.product.productCategory,
        sellerName: this.data.product.sellerInfo?.name || '用户',
        addTime: new Date(),
        count: 1
      };

      cart.push(cartItem);
      wx.setStorageSync('cart', cart);

      this.setData({
        inCart: true,
        cartCount: cart.length
      });

      wx.showToast({
        title: '已加入购物车',
        icon: 'success'
      });
    } catch (err) {
      console.error('加入购物车失败:', err);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  /**
   * 加载购物车数量
   */
  loadCartCount() {
    try {
      const cart = wx.getStorageSync('cart') || [];
      const inCart = cart.some(item => item.id === this.data.productId);
      
      this.setData({
        cartCount: cart.length,
        inCart: inCart
      });
    } catch (err) {
      console.error('加载购物车失败:', err);
    }
  },

  /**
   * 立即购买
   */
  onBuyNow() {
    if (this.data.product.status !== '在售') {
      wx.showToast({
        title: '商品已下架或已售出',
        icon: 'none'
      });
      return;
    }

    // 显示确认购买对话框
    wx.showModal({
      title: '确认购买',
      content: `确定要购买"${this.data.product.productName}"吗？\n价格：¥${this.data.product.salePrice || this.data.product.suggestedPrice}`,
      confirmText: '确认购买',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.processPayment();
        }
      }
    });
  },

  /**
   * 处理支付（模拟支付流程）
   */
  async processPayment() {
    wx.showLoading({
      title: '处理中...',
      mask: true
    });

    try {
      const db = wx.cloud.database();
      
      // 获取当前用户openid和userId
      let buyerOpenId = null;
      let buyerUserId = null;
      
      // 优先使用登录的用户ID获取openid
      const userInfo = wx.getStorageSync('userInfo') || {};
      const loggedInUserId = userInfo._id;
      
      if (loggedInUserId) {
        try {
          // 使用登录的用户ID查询用户信息，获取其_openid
          const userResult = await db.collection('T_user')
            .doc(loggedInUserId)
            .get();
          
          if (userResult.data && userResult.data._openid) {
            buyerOpenId = userResult.data._openid;
            buyerUserId = loggedInUserId;
          }
        } catch (err) {
          console.error('通过用户ID获取openid失败:', err);
        }
      }
      
      // 如果无法通过用户ID获取openid，尝试从缓存获取
      if (!buyerOpenId) {
        buyerOpenId = await this.ensureOpenId();
      }
      
      if (!buyerOpenId) {
        wx.hideLoading();
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        return;
      }

      const product = this.data.product;
      
      // 获取卖家信息（从商品信息中）
      let sellerUserId = null;
      if (product?.sellerUserId) {
        sellerUserId = product.sellerUserId;
      }
      
      // 构建订单数据
      const orderData = {
        // 订单基本信息
        orderNumber: `ORD${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        status: '待付款', // 待付款、待发货、待收货、已完成、已取消
        
        // 商品信息
        productId: this.data.productId,
        productName: product?.productName || '商品',
        productImage: product?.productImage || (this.data.imageUrls && this.data.imageUrls[0]) || 'https://via.placeholder.com/600x400/cccccc/ffffff?text=Product',
        // 上面默认图片替换为远程占位图
        // 注意：订单中图片建议存云端真实地址
        productCategory: product?.productCategory || '其他',
        
        // 价格信息
        price: product?.salePrice || product?.suggestedPrice || product?.originalPrice || 0,
        originalPrice: product?.originalPrice || 0,
        
        // 买家信息
        buyerOpenId: buyerOpenId,
        buyerUserId: buyerUserId || '', // 添加buyerUserId字段，用于精确区分买家
        
        // 卖家信息
        sellerOpenId: product?.sellerOpenId || '',
        sellerUserId: sellerUserId || '', // 添加sellerUserId字段，用于精确区分卖家
        sellerName: product?.sellerInfo?.name || '用户',
        sellerPhone: product?.sellerInfo?.phone || product?.contactInfo || '',
        
        // 商品信息（数组格式，兼容订单可能有多个商品）
        products: [{
          productId: this.data.productId,
          name: product?.productName || '商品',
          price: product?.salePrice || product?.suggestedPrice || product?.originalPrice || 0,
          count: 1,
          image: product?.productImage || (this.data.imageUrls && this.data.imageUrls[0]) || 'https://via.placeholder.com/600x400/cccccc/666666?text=商品图',
          specs: product?.productCategory || '标准'
        }],
        
        // 订单金额
        totalPrice: product?.salePrice || product?.suggestedPrice || product?.originalPrice || 0,
        totalCount: 1,
        
        // 交易方式
        transactionMethod: product?.transactionMethod || '面交',
        
        // 时间信息
        createTime: new Date(),
        updateTime: new Date()
      };

      console.log('创建订单数据:', orderData);

      // 同时执行：1. 创建订单 2. 更新商品状态为“交易中”
      const [orderResult, productResult] = await Promise.all([
        // 创建订单
        db.collection('T_order').add({
          data: orderData
        }),
        // 更新商品状态为交易中（买家已下单，进入交易流程）
        db.collection('T_product').doc(this.data.productId).update({
          data: {
            status: '交易中',
            updateTime: new Date()
          }
        })
      ]);

      console.log('订单创建成功:', orderResult);
      console.log('商品状态更新成功:', productResult);

      // 写入卖家通知：提示该商品正在被购买
      try {
        const notifyData = {
          productId: this.data.productId,
          productName: product?.productName || '商品',
          orderId: orderResult._id || '',
          sellerUserId: sellerUserId || '',
          sellerOpenId: product?.sellerOpenId || '',
          type: 'purchase',
          content: '您的商品正在被购买，请在“我的商品”中处理交易',
          status: 'unread',
          createTime: new Date(),
          updateTime: new Date()
        };
        await db.collection('T_notify').add({ data: notifyData });
        console.log('卖家通知已写入:', notifyData);
      } catch (notifyErr) {
        console.warn('写入卖家通知失败，尝试创建集合后重试:', notifyErr);
        if (notifyErr && (notifyErr.errMsg?.includes('not exist') || notifyErr.errCode === -502005)) {
          try {
            await wx.cloud.callFunction({
              name: 'quickstartFunctions',
              data: { type: 'createNotifyCollection' }
            });
            // 重新尝试写入
            const notifyDataRetry = {
              productId: this.data.productId,
              productName: product?.productName || '商品',
              orderId: orderResult._id || '',
              sellerUserId: sellerUserId || '',
              sellerOpenId: product?.sellerOpenId || '',
              type: 'purchase',
              content: '您的商品正在被购买，请在“我的商品”中处理交易',
              status: 'unread',
              createTime: new Date(),
              updateTime: new Date()
            };
            await db.collection('T_notify').add({ data: notifyDataRetry });
            console.log('卖家通知集合创建后写入成功');
          } catch (createErr) {
            console.error('创建通知集合或重试写入失败:', createErr);
          }
        }
      }

      // 在聊天中通知卖家：买家已下单
      try {
        const buyerId = buyerOpenId;
        const sellerId = product?.sellerOpenId || '';
        const buyerUserId2 = buyerUserId || '';
        const sellerUserId2 = sellerUserId || '';
        if (buyerId && sellerId) {
          const sessionKey = [buyerId, sellerId].sort().join('|');
          const sessionKeyUser = (buyerUserId2 && sellerUserId2) ? [buyerUserId2, sellerUserId2].sort().join('|') : '';
          await wx.cloud.callFunction({
            name: 'quickstartFunctions',
            data: {
              type: 'sendChatMessage',
              contentType: 'text',
              content: `[系统] 买家已下单：订单号 ${orderData.orderNumber}，商品 ${orderData.productName}，金额 ¥${orderData.totalPrice}`,
              toUserId: sellerUserId2 || '',
              toOpenId: sellerId || '',
              productId: this.data.productId || '',
              orderId: orderResult._id || '',
              isSystem: true
            }
          });
        }
      } catch (e) {
        console.error('写入下单系统消息失败:', e);
      }

      wx.hideLoading();
      
      wx.showModal({
        title: '购买成功',
        content: '订单已创建，请尽快联系卖家完成交易',
        showCancel: false,
        confirmText: '查看订单',
        success: (res) => {
          if (res.confirm) {
            // 记录购买行为
            this.recordBehavior('purchase', this.data.product?.productCategory);
            
            // 跳转到订单页面
            wx.navigateTo({
              url: '/pages/orders/orders'
            });
          } else {
            // 刷新商品详情
            this.loadProductDetail();
          }
        }
      });
    } catch (err) {
      console.error('购买失败:', err);
      console.error('错误详情:', JSON.stringify(err, null, 2));
      wx.hideLoading();
      
      let errorMsg = '购买失败，请重试';
      if (err.errMsg) {
        if (err.errMsg.includes('network') || err.errMsg.includes('Failed to fetch')) {
          errorMsg = '网络连接失败，请检查网络设置';
        } else if (err.errMsg.includes('permission')) {
          errorMsg = '权限不足，请联系管理员';
        } else if (err.errMsg.includes('not exist')) {
          errorMsg = '订单功能需要初始化，请稍后再试';
        } else {
          errorMsg = '购买失败：' + err.errMsg;
        }
      }
      
      wx.showModal({
        title: '购买失败',
        content: errorMsg,
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  /**
   * 收藏/取消收藏
   */
  async onToggleFavorite() {
    try {
      const db = wx.cloud.database();
      const openid = await this.ensureOpenId();
      const userInfo = wx.getStorageSync('userInfo') || {};
      const loggedInUserId = userInfo._id || '';
      
      if (!openid) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        return;
      }

      // 先查询是否已收藏
      let existingResult;
      try {
        existingResult = await db.collection('T_favorites')
          .where({
            _openid: openid,
            productId: this.data.productId
          })
          .get();
      } catch (err) {
        // 如果集合不存在，继续执行添加收藏操作（创建集合）
        if (err.errMsg && err.errMsg.includes('not exist')) {
          existingResult = { data: [] };
        } else {
          throw err;
        }
      }

      const isFavorite = existingResult && existingResult.data && existingResult.data.length > 0;
      const favoriteRecord = isFavorite ? existingResult.data[0] : null;

      if (isFavorite && favoriteRecord) {
        // 取消收藏：从数据库删除
        try {
          await db.collection('T_favorites').doc(favoriteRecord._id).remove();
          
          this.setData({
            isFavorite: false
          });
          try { reco.recordUnfavorite(this.data.product); } catch (e) {}
          
          wx.showToast({
            title: '已取消收藏',
            icon: 'success'
          });
        } catch (err) {
          console.error('取消收藏失败:', err);
          wx.showToast({
            title: '操作失败',
            icon: 'none'
          });
        }
      } else {
        // 添加收藏：保存到数据库
        const product = this.data.product;
        
        const favoriteData = {
          productId: this.data.productId,
          productName: product?.productName || '商品',
          productImage: product?.productImage || (this.data.imageUrls && this.data.imageUrls[0]) || 'https://via.placeholder.com/600x400/cccccc/ffffff?text=Product',
          productCategory: product?.productCategory || '其他',
          productPrice: product?.salePrice || product?.suggestedPrice || product?.originalPrice || 0,
          userId: loggedInUserId,
          createTime: new Date(),
          updateTime: new Date()
        };

        try {
          await db.collection('T_favorites').add({
            data: favoriteData
          });

          this.setData({
            isFavorite: true
          });

          // 记录收藏行为
          this.recordBehavior('favorite', this.data.product?.productCategory);
          try { reco.recordFavorite(this.data.product); } catch (e) {}

          wx.showToast({
            title: '已收藏',
            icon: 'success'
          });
        } catch (err) {
          console.error('添加收藏失败:', err);
          console.error('错误详情:', JSON.stringify(err, null, 2));
          
          // 如果集合不存在，尝试创建（第一次添加时）
          if (err.errMsg && err.errMsg.includes('not exist')) {
            // 集合不存在，但我们已经在 add 操作中，这个错误可能表示需要先创建集合
            // 可以提示用户或静默处理
            console.warn('收藏集合不存在，需要先在云数据库中创建 T_favorites 集合');
            wx.showToast({
              title: '收藏功能需要初始化，请稍后再试',
              icon: 'none',
              duration: 3000
            });
          } else {
            let errorMsg = '操作失败';
            if (err.errMsg) {
              if (err.errMsg.includes('network') || err.errMsg.includes('Failed to fetch')) {
                errorMsg = '网络连接失败';
              } else if (err.errMsg.includes('permission')) {
                errorMsg = '权限不足';
              } else {
                errorMsg = '操作失败：' + err.errMsg;
              }
            }
            wx.showToast({
              title: errorMsg,
              icon: 'none'
            });
          }
        }
      }
    } catch (err) {
      console.error('收藏操作失败:', err);
      console.error('错误详情:', JSON.stringify(err, null, 2));
      
      let errorMsg = '操作失败';
      if (err.errMsg) {
        if (err.errMsg.includes('network') || err.errMsg.includes('Failed to fetch')) {
          errorMsg = '网络连接失败';
        } else if (err.errMsg.includes('permission')) {
          errorMsg = '权限不足';
        } else {
          errorMsg = '操作失败：' + err.errMsg;
        }
      }
      
      wx.showToast({
        title: errorMsg,
        icon: 'none'
      });
    }
  },

  /**
   * 记录用户行为（用于协同过滤推荐）
   */
  async recordBehavior(behaviorType, productCategory) {
    try {
      const openid = await this.ensureOpenId();
      if (!openid || !this.data.productId) {
        console.warn('记录用户行为失败：缺少openid或productId', { openid, productId: this.data.productId });
        return;
      }
      
      console.log('开始记录用户行为:', { behaviorType, productId: this.data.productId, productCategory });
      
      // 异步记录，不阻塞主流程
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'recordUserBehavior',
          productId: this.data.productId,
          behaviorType: behaviorType,
          productCategory: productCategory || ''
        },
        success: (res) => {
          console.log('用户行为记录成功:', behaviorType, res);
          if (res.result && !res.result.success) {
            console.error('用户行为记录失败:', res.result.error);
            // 如果是因为集合不存在，尝试创建
            if (res.result.error && res.result.error.includes('not exist')) {
              this.createBehaviorCollection();
            }
          }
        },
        fail: (err) => {
          console.error('用户行为记录失败:', err);
          // 如果是因为集合不存在，尝试创建
          if (err.errMsg && err.errMsg.includes('not exist')) {
            this.createBehaviorCollection();
          }
        }
      });
    } catch (err) {
      console.error('记录用户行为异常:', err);
    }
  },

  /**
   * 创建用户行为集合
   */
  async createBehaviorCollection() {
    try {
      console.log('尝试创建 T_user_behavior 集合');
      await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'createBehaviorCollection'
        },
        success: (res) => {
          console.log('创建集合结果:', res);
        },
        fail: (err) => {
          console.error('创建集合失败:', err);
        }
      });
    } catch (err) {
      console.error('创建集合异常:', err);
    }
  },

  /**
   * 分享商品
   */
  onShareAppMessage() {
    return {
      title: `推荐商品：${this.data.product?.productName || '商品'}`,
      path: `/pages/product-detail/product-detail?id=${this.data.productId}`,
      imageUrl: this.data.imageUrls[0] || ''
    };
  },

  /**
   * 查看购物车
   */
  onViewCart() {
    wx.navigateTo({
      url: '/pages/cart/cart'
    });
  }
});

