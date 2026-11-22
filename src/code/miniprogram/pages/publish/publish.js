// pages/publish/publish.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 页面来源标识
    fromAIPricing: false,
    // 是否展示价格信息（仅AI定价或编辑模式且有数据时显示）
    showPriceInfo: false,
    isEditMode: false,  // 是否为编辑模式
    editProductId: '',  // 编辑的商品ID
    
    // 商品基本信息
    productImage: '',
    productName: '',
    productCategory: '',
    productDescription: '',
    categories: ['电子产品', '图书文具', '服装鞋帽', '家居用品', '运动户外', '美妆个护', '其他'],
    categoryIndex: 0,
    
    // 价格信息
    originalPrice: '',
    suggestedPrice: '',
    priceRange: '',
    salePrice: '',
    
    // 商品状况
    conditionLevel: '',
    aiScore: '',
    
    // AI分析报告
    analysisReport: '',
    
    // 发布设置
    contactInfo: '',
    transactionMethods: ['面交', '快递', '自提'],
    // 兼容WXML中使用的 tradeMethods 命名
    tradeMethods: ['面交', '快递', '自提'],
    selectedMethods: [],
    tradeMethodIndex: 0,  // 默认选择第一个交易方式
    
    // 发布状态
    isPublishing: false,

    // 发布建议与推荐类别
    recommendLoading: false,
    recommendMessage: '',
    recommendedCategories: [],
    categoryGuides: {},

    // 交易地点（仅地图选点）
    tradeLocation: { latitude: null, longitude: null, landmarkName: '' },
    tradeAddress: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    console.log('发布商品页面加载，接收参数:', options);
    
    // 检查是否为编辑模式
    if (options.mode === 'edit' && options.id) {
      // 编辑模式：加载商品数据
      this.setData({
        isEditMode: true,
        editProductId: options.id
      });
      await this.loadProductData(options.id);
      return;
    }
    
    // 从页面参数中获取数据
    if (options && Object.keys(options).length > 0) {
      // 解码URL参数（小程序路由参数会自动编码，需要手动解码）
      const decodeParam = (value) => {
        if (!value) return '';
        try {
          return decodeURIComponent(value);
        } catch (e) {
          console.warn('参数解码失败:', value, e);
          return value;
        }
      };
      
      // 解码所有参数
      const decodedOptions = {};
      Object.keys(options).forEach(key => {
        decodedOptions[key] = decodeParam(options[key]);
      });
      
      console.log('解码后的参数:', decodedOptions);
      
      // 从AI定价页面跳转，带完整参数
      const receivedCategory = decodedOptions.productCategory || '';
      
      // 查找类别在列表中的索引
      let categoryIndex = 0;
      if (receivedCategory) {
        const index = this.data.categories.indexOf(receivedCategory);
        if (index >= 0) {
          categoryIndex = index;
        }
      }
      
      this.setData({
        fromAIPricing: true,
        productImage: decodedOptions.imagePath || '',
        productName: decodedOptions.productName || '',
        productCategory: receivedCategory, // 保存类别名称，但用户需要自己选择
        productDescription: decodedOptions.productDescription || '',
        originalPrice: decodedOptions.originalPrice || '',
        suggestedPrice: decodedOptions.suggestedPrice || '',
        priceRange: decodedOptions.priceRange || '',
        conditionLevel: decodedOptions.conditionLevel || '',
        aiScore: decodedOptions.aiScore || '',
        analysisReport: decodedOptions.analysisReport || '',
        categoryIndex: categoryIndex // 设置类别选择器的索引
      });

      // 根据AI定价携带的数据，决定是否显示价格信息
      this.updatePriceInfoVisibility();
      
      // 建议售价仅用于参考，不自动填充“商品售价”，需用户自行输入
      
      // 显示从AI定价跳转的提示
      wx.showToast({
        title: 'AI分析结果已加载',
        icon: 'success',
        duration: 1500
      });

      // 交易地点需用户在地图上选点设置
    } else {
      // 从主界面直接进入，显示空表单
      this.setData({
        fromAIPricing: false,
        showPriceInfo: false,
        productName: '',
        productCategory: '',
        productDescription: '',
        salePrice: '',
        categoryIndex: 0
      });
      
      // 显示直接发布的提示
      wx.showToast({
        title: '请填写商品信息',
        icon: 'none',
        duration: 1500
      });

      // 交易地点需用户在地图上选点设置
    }

    // 加载基于分类供需的发布建议（卖家视角）
    this.loadPublishRecommendations('product');
  },

  /**
   * 加载发布建议（基于分类供需对比）
   */
  async loadPublishRecommendations(forType) {
    try {
      this.setData({ recommendLoading: true });
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'getPublishRecommendations',
          forType
        }
      });
      const result = res.result || {};
      if (result.success && result.data) {
        const { recommended = [], message = '', categoryGuides = {} } = result.data;
        this.setData({
          recommendedCategories: recommended,
          recommendMessage: message,
          categoryGuides
        });
        // 应用类别指引到当前选择
        const cat = this.data.productCategory || this.data.categories[this.data.categoryIndex];
        if (cat) {
          this.applyGuideForCategory(cat);
        }
      } else {
        console.warn('获取发布建议失败:', result.error || res);
      }
    } catch (e) {
      console.error('调用发布建议云函数失败:', e);
    } finally {
      this.setData({ recommendLoading: false });
    }
  },

  /**
   * 加载商品数据（编辑模式）
   */
  async loadProductData(productId) {
    wx.showLoading({
      title: '加载中...',
      mask: true
    });

    try {
      const db = wx.cloud.database();
      const productDoc = await db.collection('T_product').doc(productId).get();

      if (productDoc.data) {
        const product = productDoc.data;
        
        // 查找类别索引
        let categoryIndex = 0;
        if (product.productCategory) {
          const index = this.data.categories.indexOf(product.productCategory);
          if (index >= 0) {
            categoryIndex = index;
          }
        }

        // 查找交易方式索引
        let tradeMethodIndex = 0;
        if (product.transactionMethod) {
          const index = this.data.transactionMethods.indexOf(product.transactionMethod);
          if (index >= 0) {
            tradeMethodIndex = index;
          }
        }

        this.setData({
          productImage: product.productImage || '',
          productName: product.productName || '',
          productCategory: product.productCategory || '',
          productDescription: product.productDescription || '',
          categoryIndex: categoryIndex,
          originalPrice: product.originalPrice ? product.originalPrice.toString() : '',
          suggestedPrice: product.suggestedPrice ? product.suggestedPrice.toString() : '',
          priceRange: product.priceRange || '',
          salePrice: product.salePrice ? product.salePrice.toString() : '',
          conditionLevel: product.conditionLevel || '',
          aiScore: product.aiScore || '',
          analysisReport: product.analysisReport || '',
          contactInfo: product.contactInfo || '',
          tradeMethodIndex: tradeMethodIndex
        });

        // 编辑模式载入交易地点
        this.setData({
          tradeLocation: {
            latitude: product.tradeLocationLat || null,
            longitude: product.tradeLocationLng || null,
            landmarkName: product.tradeLandmarkName || ''
          }
        });

        // 交易地点编辑模式已载入，如需变更请使用地图选点

        // 编辑模式：若已有建议价格/报告，显示价格信息
        this.updatePriceInfoVisibility();

        wx.hideLoading();
        wx.showToast({
          title: '商品信息已加载',
          icon: 'success',
          duration: 1500
        });
      } else {
        wx.hideLoading();
        wx.showToast({
          title: '商品不存在',
          icon: 'none'
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      }
    } catch (err) {
      console.error('加载商品数据失败:', err);
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
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('发布商品页面显示');
  },

  /**
   * 商品名称输入事件
   */
  onProductNameInput(e) {
    this.setData({
      productName: e.detail.value
    });
  },

  /**
   * 商品类别选择事件
   */
  onCategoryChange(e) {
    const index = e.detail.value;
    this.setData({
      categoryIndex: index,
      productCategory: this.data.categories[index]
    });
    // 根据类别自动预填价格区间与交易方式
    this.applyGuideForCategory(this.data.categories[index]);
  },

  /**
   * 选择推荐类别快速填充
   */
  onSelectRecommendedCategory(e) {
    const category = e.currentTarget.dataset.category;
    const idx = this.data.categories.indexOf(category);
    if (idx >= 0) {
      this.setData({
        categoryIndex: idx,
        productCategory: category
      });
      wx.showToast({ title: `已选择：${category}`, icon: 'none' });
      // 应用类别指引
      this.applyGuideForCategory(category);
    } else {
      wx.showToast({ title: '该类别不在当前列表', icon: 'none' });
    }
  },

  /**
   * 根据类别指引预填常用字段（价格区间、交易方式）
   */
  applyGuideForCategory(category) {
    const guide = this.data.categoryGuides && this.data.categoryGuides[category];
    if (!guide) return;
    const range = guide.typicalPriceRange || '';
    const commonTrade = guide.commonTrade || '面交';
    const idx = this.data.transactionMethods.indexOf(commonTrade);
    const next = {};
    if (range) next.priceRange = range;
    if (idx >= 0) next.tradeMethodIndex = idx;
    if ((!this.data.suggestedPrice || this.data.suggestedPrice === '') && guide.avgPrice > 0) {
      next.suggestedPrice = guide.avgPrice.toString();
      if (!this.data.salePrice || this.data.salePrice === '') {
        next.salePrice = guide.avgPrice.toString();
      }
    }
    this.setData(next);
    // 类别指引不触发价格信息展示（仅AI定价或编辑模式下展示）
    this.updatePriceInfoVisibility();
  },

  /**
   * 商品描述输入事件
   */
  onDescriptionInput(e) {
    this.setData({
      productDescription: e.detail.value
    });
  },

  /**
   * 上传商品图片
   */
  onUploadImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePaths = res.tempFilePaths;
        if (tempFilePaths.length > 0) {
          this.setData({
            productImage: tempFilePaths[0]
          });
          
          wx.showToast({
            title: '图片上传成功',
            icon: 'success'
          });
        }
      },
      fail: (error) => {
        console.error('选择图片失败:', error);
        wx.showToast({
          title: '图片选择失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 售价输入
   */
  onSalePriceInput(e) {
    const value = e.detail.value;
    this.setData({
      salePrice: value
    });
  },

  /**
   * 联系方式输入
   */
  onContactInput(e) {
    const value = e.detail.value;
    this.setData({
      contactInfo: value
    });
  },

  /**
   * 交易方式选择
   */
  onTradeMethodChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({
      tradeMethodIndex: index
    });
  },

  /**
   * 更新价格信息显示逻辑
   */
  updatePriceInfoVisibility() {
    const { fromAIPricing, isEditMode, suggestedPrice, priceRange, originalPrice, analysisReport } = this.data;
    const hasAIData = !!(suggestedPrice || priceRange || analysisReport || originalPrice);
    const show = (fromAIPricing && hasAIData) || (isEditMode && hasAIData);
    if (this.data.showPriceInfo !== show) {
      this.setData({ showPriceInfo: show });
    }
  },

  /**
   * 跳转到AI定价页面
   */
  goToAIPricing() {
    wx.navigateTo({
      url: '/pages/pricing/pricing'
    });
  },

  

  

  

  

  /**
   * 在地图上选点，确保交易地点坐标精准（GCJ-02）
   */
  onChooseLocation() {
    try {
      const base = (this.data.tradeLocation && typeof this.data.tradeLocation.latitude === 'number' && typeof this.data.tradeLocation.longitude === 'number')
        ? this.data.tradeLocation
        : null;
      const openChooser = (lat, lng) => {
        wx.chooseLocation({
          latitude: typeof lat === 'number' ? lat : undefined,
          longitude: typeof lng === 'number' ? lng : undefined,
          success: (res) => {
            if (typeof res.latitude === 'number' && typeof res.longitude === 'number') {
              const landmarkName = res.name || '地图选点';
              this.setData({
                tradeLocation: { latitude: res.latitude, longitude: res.longitude, landmarkName }
              });
              this.resolvePublishTradeAddress();
              wx.showToast({ title: '已设置地图选点', icon: 'success' });
            } else {
              wx.showToast({ title: '选点失败', icon: 'none' });
            }
          },
          fail: (err) => {
            console.warn('地图选点失败:', err);
            wx.showToast({ title: '未选择地点', icon: 'none' });
          }
        });
      };

      if (base) {
        openChooser(base.latitude, base.longitude);
      } else {
        wx.getLocation({
          type: 'gcj02',
          isHighAccuracy: true,
          highAccuracyExpireTime: 10000,
          success: (loc) => {
            openChooser(loc.latitude, loc.longitude);
          },
          fail: (err) => {
            console.warn('获取当前位置失败，打开选点工具默认视图:', err);
            openChooser(undefined, undefined);
          }
        });
      }
    } catch (e) {
      console.warn('调用地图选点异常:', e);
    }
  },

  

  async resolvePublishTradeAddress() {
    const loc = this.data.tradeLocation;
    if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return;
    try {
      const { reverseGeocode } = require('../../utils/geocoder.js');
      const addr = await reverseGeocode(loc);
      this.setData({ tradeAddress: addr });
    } catch (e) {
      console.warn('解析交易地址失败:', e);
    }
  },

  /**
   * 验证表单数据
   */
  validateForm() {
    const { 
      fromAIPricing,
      productName, 
      productCategory, 
      productDescription, 
      salePrice, 
      contactInfo,
      selectedMethods
    } = this.data;
    
    // 验证商品名称
    if (!productName || productName.trim() === '') {
      wx.showToast({
        title: '请输入商品名称',
        icon: 'none'
      });
      return false;
    }
    
    // 验证商品类别
    if (!productCategory || productCategory.trim() === '') {
      wx.showToast({
        title: '请选择商品类别',
        icon: 'none'
      });
      return false;
    }
    
    // 验证商品描述
    if (!productDescription || productDescription.trim() === '') {
      wx.showToast({
        title: '请输入商品描述',
        icon: 'none'
      });
      return false;
    }
    
    // 验证售价
    if (!salePrice || isNaN(parseFloat(salePrice)) || parseFloat(salePrice) <= 0) {
      wx.showToast({
        title: '请输入有效的售价',
        icon: 'none'
      });
      return false;
    }
    
    // 验证联系方式
    if (!contactInfo || contactInfo.trim() === '') {
      wx.showToast({
        title: '请输入联系方式',
        icon: 'none'
      });
      return false;
    }
    
    // 验证商品图片（无论哪种模式都需要图片）
    if (!this.data.productImage || this.data.productImage.trim() === '') {
      wx.showToast({
        title: '请上传商品图片',
        icon: 'none'
      });
      return false;
    }
    // 面交/自提必须使用地图选点，确保有坐标
    try {
      const methods = this.data.tradeMethods || this.data.transactionMethods || ['面交','快递','自提'];
      const idx = typeof this.data.tradeMethodIndex === 'number' ? this.data.tradeMethodIndex : 0;
      const method = methods[idx];
      if (method === '面交' || method === '自提') {
        const tl = this.data.tradeLocation || {};
        const hasCoords = typeof tl.latitude === 'number' && typeof tl.longitude === 'number';
        if (!hasCoords) {
          wx.showToast({ title: '请在地图上选点设置交易地点', icon: 'none' });
          return false;
        }
      }
    } catch (_) {}

    return true;
  },

  /**
   * 验证发布数据（与validateForm一致）
   */
  validatePublishData() {
    return this.validateForm();
  },

  /**
   * 发布前确保交易地点：
   * - 若已有坐标，直接通过
   * - 若仅有地标名，尝试匹配校园地标或正向地理编码
   * - 若都没有但有自动定位，采用自动定位
   * - 仍无则提示用户设置地点并返回 false
   */
  async ensureTradeLocationBeforePublish() {
    try {
      const methods = this.data.tradeMethods || this.data.transactionMethods || ['面交','快递','自提'];
      const idx = typeof this.data.tradeMethodIndex === 'number' ? this.data.tradeMethodIndex : 0;
      const method = methods[idx];
      if (method !== '面交' && method !== '自提') return true;

      const tl = this.data.tradeLocation || {};
      if (typeof tl.latitude === 'number' && typeof tl.longitude === 'number') {
        return true;
      }

      // 仅有地标名时尝试匹配校园地标
      if (tl.landmarkName && tl.landmarkName.trim() !== '') {
        try {
          const { campusLandmarks } = require('../../utils/campusMap.js');
          const match = campusLandmarks && campusLandmarks.find(l => String(tl.landmarkName).includes(l.name));
          if (match && typeof match.latitude === 'number' && typeof match.longitude === 'number') {
            this.setData({ tradeLocation: { latitude: match.latitude, longitude: match.longitude, landmarkName: tl.landmarkName } });
            await this.resolvePublishTradeAddress();
            return true;
          }
        } catch (_) {}
      }

      // 仍无可用地点
      wx.showModal({
        title: '请设置交易地点',
        content: '面交/自提需要交易地点。请在地图上选点设置交易地点。',
        showCancel: false,
        confirmText: '知道了'
      });
      return false;
    } catch (e) {
      console.warn('ensureTradeLocationBeforePublish 异常:', e);
      return false;
    }
  },

  /**
   * 发布商品
   */
  onPublish() {
    // 防止重复提交：如果正在发布中，直接返回
    if (this.data.isPublishing) {
      console.log('正在发布中，忽略重复点击');
      return;
    }

    // 验证数据
    if (!this.validateForm()) {
      return;
    }
    // 先确保交易地点（面交/自提）
    this.ensureTradeLocationBeforePublish()
      .then(async (ok) => {
        if (!ok) return;
        // 设置发布状态（立即设置，防止重复点击）
        this.setData({ isPublishing: true });
        // 显示发布中提示
        wx.showLoading({ title: '发布中...', mask: true });
        // 先上传图片到云存储（如果需要）
        this.uploadImageAndPublish();
      })
      .catch((err) => {
        console.warn('发布前地点校验异常:', err);
        wx.showToast({ title: '请稍后重试', icon: 'none' });
      });
  },

  /**
   * 上传图片并发布商品
   */
  uploadImageAndPublish() {
    // 双重检查：防止并发调用
    if (!this.data.isPublishing) {
      console.warn('发布状态异常，取消操作');
      return;
    }

    const { productImage, fromAIPricing } = this.data;
    
    console.log('准备上传图片，图片路径:', productImage);
    console.log('是否从AI定价页面:', fromAIPricing);
    
    // 如果有图片且不是云存储路径（cloud://开头），需要上传
    if (productImage && !productImage.startsWith('cloud://')) {
      // 图片是临时路径，需要上传到云存储
      const cloudPath = `products/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
      
      console.log('上传图片到云存储，路径:', cloudPath);
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: productImage,
        success: (uploadRes) => {
          console.log('图片上传成功:', uploadRes);
          // 图片上传成功后，保存商品信息
          this.saveProductToDatabase(uploadRes.fileID);
        },
        fail: (err) => {
          console.error('图片上传失败:', err);
          wx.hideLoading();
          wx.showToast({
            title: '图片上传失败: ' + (err.errMsg || '未知错误'),
            icon: 'none',
            duration: 3000
          });
          // 重置发布状态
          this.setData({
            isPublishing: false
          });
        }
      });
    } else {
      // 图片已经是云存储路径或没有图片，直接保存商品信息
      const imageFileID = productImage || '';
      console.log('图片已是云存储路径或为空，直接保存，fileID:', imageFileID);
      this.saveProductToDatabase(imageFileID);
    }
  },

  /**
   * 保存商品信息到数据库
   */
  async saveProductToDatabase(imageFileID) {
    // 双重检查：防止并发调用
    if (!this.data.isPublishing) {
      console.warn('发布状态异常，取消保存操作');
      return;
    }

    const db = wx.cloud.database();
    const {
      productName,
      productCategory,
      productDescription,
      originalPrice,
      suggestedPrice,
      priceRange,
      salePrice,
      conditionLevel,
      aiScore,
      analysisReport,
      contactInfo,
      transactionMethods,
      tradeMethodIndex
    } = this.data;

    // 获取当前用户的 openid（优先使用登录的用户ID获取）
    let openid = null;
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
    
    // 如果无法通过用户ID获取openid，尝试从缓存获取或重新获取
    if (!openid) {
      openid = wx.getStorageSync('openid');
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
    }

    // 构建商品数据
    const productData = {
      // 基本信息
      productName: productName,
      productCategory: productCategory,
      productDescription: productDescription,
      productImage: imageFileID,

      // 价格信息
      originalPrice: parseFloat(originalPrice) || 0,
      suggestedPrice: parseFloat(suggestedPrice) || 0,
      salePrice: parseFloat(salePrice) || 0,
      priceRange: priceRange || '',

      // 商品状况
      conditionLevel: conditionLevel || '',
      aiScore: aiScore || '',
      analysisReport: analysisReport || '',

      // 发布信息
      contactInfo: contactInfo,
      transactionMethod: transactionMethods[tradeMethodIndex] || '面交',

      // 交易地点：保存为公共地标与坐标（不含房间号）
      tradeLandmarkName: (this.data.tradeLocation && this.data.tradeLocation.landmarkName) || '',
      tradeLocationLat: (this.data.tradeLocation && this.data.tradeLocation.latitude) || null,
      tradeLocationLng: (this.data.tradeLocation && this.data.tradeLocation.longitude) || null,
      tradeAddress: this.data.tradeAddress || '',

      // 更新时间
      updateTime: new Date()
    };

    

    // 如果是编辑模式，不更新创建时间和统计信息
    if (!this.data.isEditMode) {
      // 新增模式：添加初始状态信息
      productData.status = '在售';
      productData.viewCount = 0;
      productData.likeCount = 0;
      productData.createTime = new Date();
      productData.sellerOpenId = openid || 'unknown';
      productData.sellerAppId = wx.getAccountInfoSync().miniProgram.appId || '';
      // 添加sellerUserId字段，直接保存登录用户的_id，用于精确区分发布者
      productData.sellerUserId = loggedInUserId || '';
    }
    // 编辑模式：只更新可编辑的字段，保持原有状态和统计数据

    console.log('准备保存商品数据:', productData);
    console.log('商品名称:', productName);
    console.log('商品描述:', productDescription);
    console.log('商品类别:', productCategory);
    console.log('成色:', conditionLevel);
    console.log('价格范围:', priceRange);
    console.log('sellerOpenId:', openid);
    
    // 检查是否有URL编码的字符（如果还有编码字符，说明解码失败）
    const hasEncodedChars = (str) => {
      if (!str) return false;
      return /%[0-9A-F]{2}/i.test(str);
    };
    
    if (hasEncodedChars(productName) || hasEncodedChars(productDescription) || hasEncodedChars(conditionLevel)) {
      console.warn('检测到可能未解码的URL编码字符！');
      console.warn('productName:', productName);
      console.warn('productDescription:', productDescription);
      console.warn('conditionLevel:', conditionLevel);
    }

    // 保存到数据库
    if (this.data.isEditMode && this.data.editProductId) {
      // 编辑模式：更新商品
      db.collection('T_product').doc(this.data.editProductId).update({
        data: productData,
        success: (res) => {
          console.log('商品更新成功:', res);

          // 成功后同步交易地标到 T_campus_landmarks，并写入当前商品ID到 productIds（不影响用户流程）
          try {
            const name = productData.tradeLandmarkName || (this.data.tradeLocation && this.data.tradeLocation.landmarkName) || productData.tradeAddress || '';
            const lat = Number(productData.tradeLocationLat);
            const lng = Number(productData.tradeLocationLng);
            const selling = String(productData.status || '').trim() === '在售';
            if (name && Number.isFinite(lat) && Number.isFinite(lng)) {
              wx.cloud.callFunction({
                name: 'quickstartFunctions',
                data: { type: 'upsertCampusLandmark', name, latitude: lat, longitude: lng, address: productData.tradeAddress, source: 'product', productId: this.data.editProductId, selling, productCategory: productData.productCategory, thumbUrl: productData.productImage }
              }).then(r => {
                console.log('地标同步完成(编辑):', r);
              }).catch(e => {
                console.warn('地标同步失败(编辑):', e);
              });
            }
          } catch (e) { console.warn('地标同步异常(编辑):', e); }
          
          wx.hideLoading();
          this.setData({
            isPublishing: false
          });
      
          wx.showToast({
            title: '更新成功',
            icon: 'success',
            duration: 2000,
            mask: true
          });

          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
        },
        fail: (err) => {
          console.error('商品更新失败:', err);
          
          wx.hideLoading();
          this.setData({
            isPublishing: false
          });

          wx.showModal({
            title: '更新失败',
            content: '商品更新失败，请重试。错误信息：' + (err.errMsg || '未知错误'),
            showCancel: false,
            confirmText: '知道了'
          });
        }
      });
    } else {
      // 新增模式：添加商品
      db.collection('T_product').add({
        data: productData,
        success: (res) => {
          console.log('商品发布成功:', res);

          // 发布成功后同步交易地标到 T_campus_landmarks，并写入新商品ID到 productIds（不影响用户流程）
          try {
            const name = productData.tradeLandmarkName || (this.data.tradeLocation && this.data.tradeLocation.landmarkName) || productData.tradeAddress || '';
            const lat = Number(productData.tradeLocationLat);
            const lng = Number(productData.tradeLocationLng);
            const selling = String(productData.status || '').trim() === '在售';
            if (name && Number.isFinite(lat) && Number.isFinite(lng)) {
              wx.cloud.callFunction({
                name: 'quickstartFunctions',
                data: { type: 'upsertCampusLandmark', name, latitude: lat, longitude: lng, address: productData.tradeAddress, source: 'product', productId: res._id, selling, productCategory: productData.productCategory, thumbUrl: productData.productImage }
              }).then(r => {
                console.log('地标同步完成(发布):', r);
              }).catch(e => {
                console.warn('地标同步失败(发布):', e);
              });
            }
          } catch (e) { console.warn('地标同步异常(发布):', e); }
          
          // 先隐藏loading
          wx.hideLoading();

          // 立即重置发布状态，防止重复提交
          this.setData({
            isPublishing: false
          });
      
          // 显示发布成功提示
          wx.showToast({
            title: '发布成功',
            icon: 'success',
            duration: 2000,
            mask: true
          });

          // 等待提示显示完整后再跳转到首页
          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/main/main',
              success: () => {
                console.log('成功跳转到首页');
              },
              fail: (err) => {
                console.error('跳转失败:', err);
                // 如果reLaunch失败，尝试使用navigateBack
                wx.navigateBack({
                  delta: 999  // 返回首页（如果有多个页面）
                });
              }
            });
          }, 2000);
        },
        fail: (err) => {
          console.error('商品保存失败:', err);
          
          // 先隐藏loading
          wx.hideLoading();

          // 重置发布状态
          this.setData({
            isPublishing: false
          });

          wx.showModal({
            title: '发布失败',
            content: '商品保存失败，请重试。错误信息：' + (err.errMsg || '未知错误'),
            showCancel: false,
            confirmText: '知道了'
          });
        }
      });
    }
  },

  /**
   * 返回修改
   */
  onBack() {
    wx.navigateBack({
      delta: 1
    });
  },

  /**
   * 分享功能
   */
  onShareAppMessage() {
    return {
      title: '我在二手市场发布了商品：' + this.data.productName,
      path: '/pages/main/main',
      imageUrl: this.data.productImage
    };
  },

  /**
   * 用户点击右上角分享
   */
  onShareTimeline() {
    return {
      title: '我在二手市场发布了商品：' + this.data.productName,
      imageUrl: this.data.productImage
    };
  }
})