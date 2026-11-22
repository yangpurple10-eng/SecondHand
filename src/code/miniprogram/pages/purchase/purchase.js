// pages/purchase/purchase.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 求购商品信息
    productName: '',
    categoryIndex: 0,
    categories: ['电子产品', '服装鞋帽', '家居用品', '图书文具', '运动户外', '美妆个护', '母婴玩具', '其他'],
    purchaseDescription: '',
    
    // 求购要求
    expectedPrice: '',
    conditionIndex: 0,
    conditionLevels: ['全新', '95新', '9成新', '8成新', '7成新', '不限'],
    expectedBrand: '',
    expectedModel: '',
    
    // 求购时间
    expectedDate: '',
    validityIndex: 0,
    validityPeriods: ['3天', '7天', '15天', '30天', '长期有效'],
    
    // 联系方式
    contactName: '',
    contactPhone: '',
    contactWechat: '',
    tradeMethodIndex: 0,
    tradeMethods: ['面交', '快递', '均可'],
    
    // 发布状态
    isPublishing: false,

    // 发布建议与推荐类别（买家视角）
    recommendLoading: false,
    recommendMessage: '',
    recommendedCategories: [],
    categoryGuides: {}
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('求购页面加载', options);
    
    // 确保云开发已初始化
    if (!wx.cloud) {
      wx.showModal({
        title: '初始化失败',
        content: '请使用 2.2.3 或以上的基础库以使用云能力',
        showCancel: false
      });
      return;
    }
    
    // 尝试初始化云开发（如果还未初始化）
    try {
      const app = getApp();
      if (app && app.globalData && app.globalData.env) {
        wx.cloud.init({
          env: app.globalData.env,
          traceUser: true
        });
        console.log('云开发初始化成功');
      }
    } catch (err) {
      console.error('云开发初始化失败:', err);
    }

    // 加载基于分类供需的发布建议（买家发布求购）
    this.loadPublishRecommendations('wanted');
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
        const cat = this.data.categories[this.data.categoryIndex];
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
   * 商品名称输入
   */
  onProductNameInput(e) {
    this.setData({
      productName: e.detail.value
    });
  },

  /**
   * 商品类别选择
   */
  onCategoryChange(e) {
    this.setData({
      categoryIndex: parseInt(e.detail.value)
    });
    const cat = this.data.categories[parseInt(e.detail.value)];
    this.applyGuideForCategory(cat);
  },

  /**
   * 点击推荐类别快速选择
   */
  onSelectRecommendedCategory(e) {
    const category = e.currentTarget.dataset.category;
    const idx = this.data.categories.indexOf(category);
    if (idx >= 0) {
      this.setData({ categoryIndex: idx });
      wx.showToast({ title: `已选择：${category}` , icon: 'none' });
      this.applyGuideForCategory(category);
    } else {
      wx.showToast({ title: '该类别不在当前列表', icon: 'none' });
    }
  },

  /**
   * 根据类别指引预填期望价格与交易方式
   */
  applyGuideForCategory(category) {
    const guide = this.data.categoryGuides && this.data.categoryGuides[category];
    if (!guide) return;
    const commonTrade = guide.commonTrade || '面交';
    const idx = this.data.tradeMethods.indexOf(commonTrade);
    const next = {};
    if (idx >= 0) next.tradeMethodIndex = idx;
    if ((!this.data.expectedPrice || this.data.expectedPrice === '') && guide.avgPrice > 0) {
      next.expectedPrice = guide.avgPrice.toString();
    }
    this.setData(next);
  },

  /**
   * 求购描述输入
   */
  onDescriptionInput(e) {
    this.setData({
      purchaseDescription: e.detail.value
    });
  },

  /**
   * 期望价格输入
   */
  onExpectedPriceInput(e) {
    this.setData({
      expectedPrice: e.detail.value
    });
  },

  /**
   * 成色要求选择
   */
  onConditionChange(e) {
    this.setData({
      conditionIndex: parseInt(e.detail.value)
    });
  },

  /**
   * 期望品牌输入
   */
  onBrandInput(e) {
    this.setData({
      expectedBrand: e.detail.value
    });
  },

  /**
   * 期望型号输入
   */
  onModelInput(e) {
    this.setData({
      expectedModel: e.detail.value
    });
  },

  /**
   * 期望到货时间选择
   */
  onDateChange(e) {
    this.setData({
      expectedDate: e.detail.value
    });
  },

  /**
   * 有效期选择
   */
  onValidityChange(e) {
    this.setData({
      validityIndex: parseInt(e.detail.value)
    });
  },

  /**
   * 联系人姓名输入
   */
  onContactNameInput(e) {
    this.setData({
      contactName: e.detail.value
    });
  },

  /**
   * 手机号码输入
   */
  onContactPhoneInput(e) {
    this.setData({
      contactPhone: e.detail.value
    });
  },

  /**
   * 微信号输入
   */
  onWechatInput(e) {
    this.setData({
      contactWechat: e.detail.value
    });
  },

  /**
   * 交易方式选择
   */
  onTradeMethodChange(e) {
    this.setData({
      tradeMethodIndex: parseInt(e.detail.value)
    });
  },

  /**
   * 表单验证
   */
  validateForm() {
    const { productName, contactName, contactPhone } = this.data;
    
    if (!productName.trim()) {
      wx.showToast({
        title: '请输入商品名称',
        icon: 'none'
      });
      return false;
    }
    
    if (!contactName.trim()) {
      wx.showToast({
        title: '请输入联系人姓名',
        icon: 'none'
      });
      return false;
    }
    
    if (!contactPhone.trim()) {
      wx.showToast({
        title: '请输入手机号码',
        icon: 'none'
      });
      return false;
    }
    
    // 手机号格式验证
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(contactPhone)) {
      wx.showToast({
        title: '请输入正确的手机号码',
        icon: 'none'
      });
      return false;
    }
    
    return true;
  },

  /**
   * 发布求购
   */
  onPublish() {
    if (this.data.isPublishing) return;
    
    if (!this.validateForm()) return;
    
    this.setData({
      isPublishing: true
    });
    
    wx.showLoading({
      title: '发布中...',
      mask: true
    });
    
    // 构建求购数据
    const purchaseData = {
      // 基本信息
      productName: this.data.productName,
      productCategory: this.data.categories[this.data.categoryIndex],
      description: this.data.purchaseDescription || '',
      
      // 求购要求
      expectedPrice: this.data.expectedPrice ? parseFloat(this.data.expectedPrice) : 0,
      conditionLevel: this.data.conditionLevels[this.data.conditionIndex],
      expectedBrand: this.data.expectedBrand || '',
      expectedModel: this.data.expectedModel || '',
      
      // 时间信息
      expectedDate: this.data.expectedDate || '',
      validityPeriod: this.data.validityPeriods[this.data.validityIndex],
      
      // 联系方式
      contactName: this.data.contactName,
      contactPhone: this.data.contactPhone,
      contactWechat: this.data.contactWechat || '',
      
      // 交易方式
      transactionMethod: this.data.tradeMethods[this.data.tradeMethodIndex],
      
      // 状态和时间
      status: 'active',
      viewCount: 0,
      responseCount: 0,
      createTime: new Date(),
      updateTime: new Date()
    };
    
    console.log('发布求购数据:', purchaseData);
    
    // 检查云开发是否可用
    if (!wx.cloud) {
      wx.hideLoading();
      wx.showModal({
        title: '功能不可用',
        content: '云开发功能未初始化，请检查网络连接或重新打开小程序',
        showCancel: false,
        confirmText: '知道了'
      });
      this.setData({
        isPublishing: false
      });
      return;
    }
    
    // 保存到云数据库 T_want
    try {
      const db = wx.cloud.database();
      
      // 获取登录用户ID
      const userInfo = wx.getStorageSync('userInfo') || {};
      const loggedInUserId = userInfo._id;
      
      // 添加userId字段，用于精确区分发布者
      if (loggedInUserId) {
        purchaseData.userId = loggedInUserId;
      }
      
        db.collection('T_want').add({
          data: purchaseData,
          success: (res) => {
            console.log('求购发布成功，数据库ID:', res._id);
            wx.hideLoading();
            try {
              const reco = require('../../utils/recommendation.js');
              const cat = this.data.categories[this.data.categoryIndex];
              reco.recordPublishWanted(cat, this.data.productName, this.data.purchaseDescription);
            } catch (e) {}
            
            // 发布成功提示
            wx.showToast({
              title: '发布成功！',
              icon: 'success',
            duration: 2000,
            mask: true
          });
          
          this.setData({
            isPublishing: false
          });
          
          // 发布成功后返回上一页或跳转到求购列表
          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
        },
        fail: (err) => {
          console.error('求购发布失败:', err);
          console.error('错误详情:', JSON.stringify(err, null, 2));
          wx.hideLoading();
          
          let errorMsg = '发布求购失败，请重试。';
          if (err.errMsg) {
            if (err.errMsg.includes('Failed to fetch') || err.errMsg.includes('network')) {
              errorMsg = '网络连接失败，请检查网络后重试。';
            } else if (err.errMsg.includes('permission')) {
              errorMsg = '没有权限访问数据库，请联系管理员。';
            } else {
              errorMsg = '错误信息：' + err.errMsg;
            }
          }
          
          wx.showModal({
            title: '发布失败',
            content: errorMsg,
            showCancel: false,
            confirmText: '知道了'
          });
          
          this.setData({
            isPublishing: false
          });
        }
      });
    } catch (error) {
      console.error('数据库操作异常:', error);
      wx.hideLoading();
      wx.showModal({
        title: '操作失败',
        content: '数据库操作异常，请重试。\n错误：' + (error.message || '未知错误'),
        showCancel: false,
        confirmText: '知道了'
      });
      this.setData({
        isPublishing: false
      });
    }
  },

  /**
   * 取消发布
   */
  onBack() {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消发布求购吗？已填写的信息将不会保存。',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack();
        }
      }
    });
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    
  }
})