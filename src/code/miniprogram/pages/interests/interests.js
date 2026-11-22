// pages/interests/interests.js
const reco = require('../../utils/recommendation.js');

Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 商品类别数据（默认类别，使用中文类别名作为ID）
    // 注意：类别名称必须与数据库中T_product表的productCategory字段值一致
    categories: [
      {
        id: '电子产品',
        name: '电子产品',
        description: '手机、电脑、配件',
        icon: '💻',
        iconBg: '#2196F3'
      },
      {
        id: '图书文具',
        name: '图书文具',
        description: '教材、小说、专业书籍、文具',
        icon: '📖',
        iconBg: '#4CAF50'
      },
      {
        id: '服装鞋帽',
        name: '服装鞋帽',
        description: '衣服、鞋子、配饰',
        icon: '👔',
        iconBg: '#FF9800'
      },
      {
        id: '家居用品',
        name: '家居用品',
        description: '桌椅、小家电、生活用品',
        icon: '🏠',
        iconBg: '#795548'
      },
      {
        id: '运动户外',
        name: '运动户外',
        description: '健身器材、球类运动、户外用品',
        icon: '🏃',
        iconBg: '#9C27B0'
      },
      {
        id: '美妆个护',
        name: '美妆个护',
        description: '美妆护肤产品',
        icon: '💅',
        iconBg: '#FF6B9D'
      },
      {
        id: '其他',
        name: '其他',
        description: '其他各类商品',
        icon: '📦',
        iconBg: '#757575'
      }
    ],
    // 已选择的商品类别
    selectedInterests: [],
    // 类别选中状态映射
    categorySelectedMap: {}
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 延迟执行所有初始化操作，避免立即执行导致的问题
    setTimeout(() => {
      try {
        // 先初始化选中状态映射（使用默认类别）
        this.updateCategoriesSelection();
        
        // 加载商品类别列表（已禁用云函数调用）
        this.loadCategories();
        
        // 从本地存储获取用户信息，检查是否已有选择的兴趣
        const userInfo = wx.getStorageSync('userInfo');
        if (userInfo && userInfo.interests && userInfo.interests.length > 0) {
          this.setData({
            selectedInterests: userInfo.interests
          });
          // 更新选中状态
          this.updateCategoriesSelection();
        }
      } catch (e) {
        console.error('onLoad初始化失败:', e);
      }
    }, 100);
  },

  /**
   * 从云数据库加载商品类别
   */
  loadCategories() {
    // 暂时禁用云函数调用，直接使用前端默认类别数据
    // 这样可以确保图标正确显示
    console.log('使用前端默认类别数据');
    
    // 直接使用data中定义的默认类别
    this.setData({
      categories: this.data.categories
    });
    
    // 更新选中状态映射
    this.updateCategoriesSelection();
    
    // 如果需要从云数据库加载，取消下面的注释
    /*
    wx.showLoading({
      title: '加载类别中...',
      mask: true
    });

    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'getProductCategories'
      },
      success: (res) => {
        wx.hideLoading();
        console.log('获取商品类别成功:', res);
        
        if (res.result && res.result.success && res.result.data && res.result.data.length > 0) {
          // 使用从数据库获取的类别，但强制使用前端图标映射
          const iconMap = {
            '电子产品': '💻',
            '图书文具': '📖',
            '服装鞋帽': '👔',
            '家居用品': '🏠',
            '运动户外': '🏃',
            '美妆个护': '💅',
            '其他': '📦'
          };
          
          const categories = res.result.data.map(item => ({
            id: item.id || item.name,
            name: item.name,
            description: item.description || '各类商品',
            icon: iconMap[item.name] || item.icon || '📦', // 优先使用前端图标映射
            iconBg: item.iconBg || '#757575'
          }));
          
          console.log('从数据库获取的类别:', categories);
          
          this.setData({
            categories: categories
          });
          
          // 更新选中状态映射
          this.updateCategoriesSelection();
        } else {
          console.warn('数据库中没有商品类别，使用默认类别');
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('获取商品类别失败:', err);
      }
    });
    */
  },

  /**
   * 更新商品类别的选中状态
   */
  updateCategoriesSelection() {
    try {
      const categorySelectedMap = {};
      const categories = this.data.categories || [];
      const selectedInterests = this.data.selectedInterests || [];
      
      categories.forEach(category => {
        // 检查是否选中（支持多种匹配方式）
        const isSelected = selectedInterests.some(selected => {
          // 直接匹配ID
          if (selected === category.id) return true;
          // 匹配名称
          if (selected === category.name) return true;
          return false;
        });
        
        categorySelectedMap[category.id] = isSelected;
      });
      
      // 使用同步方式更新，不传入任何回调
      this.setData({
        categorySelectedMap: categorySelectedMap
      });
    } catch (e) {
      console.error('更新选中状态失败:', e);
    }
  },

  /**
   * 商品类别点击事件
   */
  onCategoryTap(e) {
    // 立即阻止所有默认行为和事件冒泡
    if (e) {
      try {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      } catch (err) {
        // 静默处理
      }
    }
    
    // 获取类别ID
    let categoryId = null;
    try {
      categoryId = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id;
    } catch (err) {
      return false;
    }
    
    if (!categoryId) {
      return false;
    }
    
    // 使用防抖，避免快速连续点击
    const now = Date.now();
    if (this._lastTapTime && now - this._lastTapTime < 300) {
      return false;
    }
    this._lastTapTime = now;
    
    // 复制当前选择列表
    let selectedInterests = [...(this.data.selectedInterests || [])];
    
    // 切换选择状态
    let index = selectedInterests.indexOf(categoryId);
    
    if (index === -1) {
      const category = (this.data.categories || []).find(cat => cat.id === categoryId);
      if (category) {
        index = selectedInterests.findIndex(selected => selected === category.name || selected === category.id);
      }
    }
    
    if (index > -1) {
      selectedInterests.splice(index, 1);
    } else {
      if (selectedInterests.length >= 2) {
        wx.showToast({
          title: '最多只能选择2种商品类别',
          icon: 'none',
          duration: 2000
        });
        return false;
      }
      selectedInterests.push(categoryId);
    }
    
    // 直接计算选中状态映射
    const categorySelectedMap = {};
    (this.data.categories || []).forEach(category => {
      categorySelectedMap[category.id] = selectedInterests.indexOf(category.id) > -1 || 
                                          selectedInterests.indexOf(category.name) > -1;
    });
    
    // 直接同步更新数据，不使用任何延迟或回调
    try {
      this.setData({
        selectedInterests: selectedInterests,
        categorySelectedMap: categorySelectedMap
      });
    } catch (error) {
      console.error('更新数据失败:', error);
    }
    
    return false;
  },

  /**
   * 保存用户兴趣到数据库
   */
  saveUserInterests(interests) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'updateUserInterests',
          interests: interests
        },
        success: (res) => {
          console.log('保存用户兴趣成功:', res);
          if (res.result && res.result.success) {
            // 更新本地存储的用户信息
            const userInfo = wx.getStorageSync('userInfo') || {};
            userInfo.interests = interests;
            wx.setStorageSync('userInfo', userInfo);
            try { reco.recordInterests(interests); } catch (e) {}
            resolve(res.result);
          } else {
            // 即使云函数失败，也保存到本地，确保用户可以继续使用
            const userInfo = wx.getStorageSync('userInfo') || {};
            userInfo.interests = interests;
            wx.setStorageSync('userInfo', userInfo);
            console.warn('云函数保存失败，已保存到本地:', res.result?.error);
            try { reco.recordInterests(interests); } catch (e) {}
            resolve({ success: true, localOnly: true });
          }
        },
        fail: (err) => {
          console.error('保存用户兴趣失败:', err);
          // 即使云函数失败，也保存到本地，确保用户可以继续使用
          const userInfo = wx.getStorageSync('userInfo') || {};
          userInfo.interests = interests;
          wx.setStorageSync('userInfo', userInfo);
          console.warn('云函数调用失败，已保存到本地');
          try { reco.recordInterests(interests); } catch (e) {}
          resolve({ success: true, localOnly: true });
        }
      });
    });
  },

  /**
   * 确认选择
   */
  onConfirm() {
    if (this.data.selectedInterests.length === 0) {
      wx.showToast({
        title: '请至少选择一个商品类别',
        icon: 'none'
      });
      return;
    }

    // 显示加载中
    wx.showLoading({
      title: '保存兴趣中...',
    });

    // 保存用户兴趣到数据库
    this.saveUserInterests(this.data.selectedInterests)
      .then(() => {
        wx.hideLoading();
        // 显示注册成功提示
        wx.showToast({
          title: '兴趣保存成功',
          icon: 'success',
          duration: 2000
        });

        // 直接切换到首页 Tab
        wx.switchTab({ url: '/pages/main/main' });
      })
      .catch((err) => {
        wx.hideLoading();
        console.error('保存兴趣失败:', err);
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'none'
        });
      });
  },

  /**
   * 跳过选择
   */
  onSkip() {
    // 显示加载中
    wx.showLoading({
      title: '处理中...',
    });

    // 保存空兴趣数组到数据库
    this.saveUserInterests([])
      .then(() => {
        wx.hideLoading();
        // 显示注册成功提示
        wx.showToast({
          title: '注册成功',
          icon: 'success',
          duration: 2000
        });

        // 直接切换到首页 Tab
        wx.switchTab({ url: '/pages/main/main' });
      })
      .catch((err) => {
        wx.hideLoading();
        console.error('跳过选择失败:', err);
        wx.showToast({
          title: '处理失败，请重试',
          icon: 'none'
        });
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
    // 完全禁用onShow中的所有操作，避免任何可能的跳转或闪烁
    // 不执行任何操作，确保页面稳定
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