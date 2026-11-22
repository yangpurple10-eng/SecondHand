// pages/pricing/pricing.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 图片相关
    imagePath: '', // 临时路径
    imageFileID: '', // 云存储路径（上传后）
    showResult: false,
    isAnalyzing: false,
    
    // 原价信息
    originalPrice: '',
    
    // AI定价结果
    suggestedPrice: '0.00',
    conditionLevel: '--',
    marketRange: '--',
    aiScore: '--',
    analysisReport: '请先上传商品图片进行AI分析',
    
    // AI生成的商品信息
    productName: '--',
    productCategory: '--',
    productDescription: '请先进行AI分析以生成商品信息',
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('AI定价页面加载');
  },

  /**
   * 选择图片
   */
  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      maxDuration: 30,
      camera: 'back',
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          imagePath: tempFilePath,
          imageFileID: '', // 重置云存储路径
          showResult: false  // 重置结果，等待用户点击智能定价按钮
        });
        
        wx.showToast({
          title: '图片选择成功',
          icon: 'success',
          duration: 1500
        });
      },
      fail: (err) => {
        console.error('选择图片失败:', err);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 拍照上传
   */
  onTakePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      maxDuration: 30,
      camera: 'back',
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          imagePath: tempFilePath,
          imageFileID: '', // 重置云存储路径
          showResult: false  // 重置结果，等待用户点击智能定价按钮
        });
        
        wx.showToast({
          title: '图片选择成功',
          icon: 'success',
          duration: 1500
        });
      },
      fail: (err) => {
        console.error('拍照失败:', err);
        wx.showToast({
          title: '拍照失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 智能定价
   */
  onAIPricing() {
    if (!this.data.imagePath) {
      wx.showToast({
        title: '请先选择图片',
        icon: 'none'
      });
      return;
    }

    if (!this.data.originalPrice) {
      wx.showToast({
        title: '请先输入商品原价',
        icon: 'none'
      });
      return;
    }

    // 直接开始AI分析
    this.startAIAnalysis();
  },

  /**
   * 开始AI分析
   */
  startAIAnalysis() {
    if (!this.data.imagePath || !this.data.originalPrice) {
      wx.showToast({
        title: '请先上传图片并输入原价',
        icon: 'none'
      });
      return;
    }

    this.setData({
      isAnalyzing: true,
      showResult: false
    });

    wx.showLoading({
      title: 'AI分析中...',
      mask: true
    });

    // 先上传图片到云存储
    const cloudPath = `pricing/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
    
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: this.data.imagePath,
      success: (uploadRes) => {
        console.log('图片上传成功:', uploadRes);
        
        // 保存云存储路径
        const imageFileID = uploadRes.fileID;
        
        // 调用云函数进行AI分析
        wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: {
            type: 'analyzeProductPrice',
            fileID: imageFileID,
            originalPrice: parseFloat(this.data.originalPrice)
          },
          success: (res) => {
            console.log('云函数调用成功:', res);
            console.log('完整响应:', JSON.stringify(res, null, 2));
            wx.hideLoading();
            
            // 检查是否有错误
            if (res.result) {
              if (res.result.success) {
                const resultData = res.result.data;
                
                console.log('解析结果数据:', JSON.stringify(resultData, null, 2));
      
      this.setData({
        isAnalyzing: false,
        showResult: true,
                  imageFileID: imageFileID, // 保存云存储路径
                  suggestedPrice: resultData.suggestedPrice || '0.00',
                  conditionLevel: resultData.conditionLevel || '--',
                  aiScore: resultData.aiScore || '--',
                  analysisReport: resultData.analysisReport || 'AI分析完成',
                  productName: resultData.productName || '--',
                  productCategory: resultData.productCategory || '--',
                  productDescription: resultData.analysisReport || '请先进行AI分析以生成商品信息',
                  marketRange: `¥${(parseFloat(resultData.suggestedPrice || 0) * 0.9).toFixed(2)}-¥${(parseFloat(resultData.suggestedPrice || 0) * 1.1).toFixed(2)}`
      });
      
      wx.showToast({
        title: 'AI分析完成',
        icon: 'success'
      });
              } else {
                // 云函数返回了错误
                const errorMsg = res.result.error || 'AI分析失败';
                console.error('AI分析失败:', res.result);
                
                wx.showModal({
                  title: 'AI分析失败',
                  content: errorMsg + '\n\n详细信息请查看控制台日志',
                  showCancel: false,
                  confirmText: '知道了'
                });
                
                this.setData({
                  isAnalyzing: false
                });
              }
            } else {
              // 响应格式异常
              console.error('响应格式异常:', res);
              wx.showToast({
                title: '响应格式异常',
                icon: 'none',
                duration: 3000
              });
              this.setData({
                isAnalyzing: false
              });
            }
          },
          fail: (err) => {
            console.error('云函数调用失败:', err);
            console.error('错误详情:', JSON.stringify(err, null, 2));
            wx.hideLoading();
            
            // 显示更详细的错误信息
            let errorMsg = '调用失败，请重试';
            if (err.errMsg) {
              errorMsg = err.errMsg;
            } else if (err.message) {
              errorMsg = err.message;
            }
            
            wx.showModal({
              title: '调用失败',
              content: errorMsg + '\n\n请检查：\n1. 云函数是否已部署\n2. 网络连接是否正常\n3. 查看控制台日志',
              showCancel: false,
              confirmText: '知道了'
            });
            
            this.setData({
              isAnalyzing: false
            });
          }
        });
      },
      fail: (err) => {
        console.error('图片上传失败:', err);
        wx.hideLoading();
        wx.showToast({
          title: '图片上传失败',
          icon: 'none'
        });
        this.setData({
          isAnalyzing: false
        });
      }
    });
  },

  /**
   * 生成模拟AI定价结果
   */
  generateMockAIPricing() {
    const originalPrice = parseFloat(this.data.originalPrice);
    if (!originalPrice || originalPrice <= 0) {
      return {
        price: '0.00',
        condition: '--',
        range: '--',
        score: '--',
        report: '请输入有效的商品原价',
        productName: '--',
        productCategory: '--',
        productDescription: '请输入有效的商品原价'
      };
    }

    // 基于原价生成合理的二手价格范围
    const depreciationRates = [0.3, 0.4, 0.5, 0.6, 0.7]; // 折旧率：30%-70%
    const conditionFactors = [0.9, 0.8, 0.7, 0.6, 0.5]; // 成色系数
    
    const randomDepreciation = depreciationRates[Math.floor(Math.random() * depreciationRates.length)];
    const randomCondition = conditionFactors[Math.floor(Math.random() * conditionFactors.length)];
    
    // 计算建议价格
    const basePrice = originalPrice * (1 - randomDepreciation);
    const suggestedPrice = basePrice * randomCondition;
    
    // 生成价格范围（±10%）
    const minPrice = suggestedPrice * 0.9;
    const maxPrice = suggestedPrice * 1.1;
    
    // 成色描述
    const conditions = ['全新', '95新', '9成新', '85新', '8成新', '7成新'];
    const conditionIndex = Math.floor(randomCondition * 5);
    
    // AI评分（基于折旧率和成色）
    const aiScore = Math.floor(60 + (1 - randomDepreciation) * 20 + randomCondition * 20);
    
    // 分析报告
    const reports = [
      `基于原价¥${originalPrice.toFixed(2)}分析，商品折旧率约${(randomDepreciation * 100).toFixed(0)}%，建议二手价格为¥${suggestedPrice.toFixed(2)}`,
      `商品原价¥${originalPrice.toFixed(2)}，当前成色${conditions[conditionIndex]}，市场参考价格区间为¥${minPrice.toFixed(2)}-${maxPrice.toFixed(2)}`,
      `AI分析：原价¥${originalPrice.toFixed(2)}的商品，考虑到${conditions[conditionIndex]}的成色，建议定价为¥${suggestedPrice.toFixed(2)}`,
      `根据原价¥${originalPrice.toFixed(2)}和商品状况评估，二手市场合理价格为¥${suggestedPrice.toFixed(2)}，价格浮动范围±10%`
    ];
    
    const randomReportIndex = Math.floor(Math.random() * reports.length);
    
    // 生成商品信息
    const productInfo = this.generateProductInfo(originalPrice, conditions[conditionIndex]);
    
    return {
      price: suggestedPrice.toFixed(2),
      condition: conditions[conditionIndex],
      range: `¥${minPrice.toFixed(2)}-${maxPrice.toFixed(2)}`,
      score: aiScore,
      report: reports[randomReportIndex],
      ...productInfo
    };
  },

  /**
   * 生成商品信息
   */
  generateProductInfo(originalPrice, condition) {
    // 商品类别库
    const categories = [
      { name: '电子产品', items: ['iPhone 13', 'MacBook Pro', 'iPad Air', 'AirPods Pro', 'Apple Watch'] },
      { name: '服装鞋帽', items: ['Nike运动鞋', 'Adidas卫衣', '优衣库T恤', 'Zara外套', '李宁运动裤'] },
      { name: '图书文具', items: ['Python编程书', '英语四级词汇', '考研数学真题', '精美笔记本', '钢笔套装'] },
      { name: '生活用品', items: ['保温杯', '电动牙刷', '吹风机', '台灯', '收纳盒'] },
      { name: '运动户外', items: ['篮球', '羽毛球拍', '瑜伽垫', '登山包', '滑板'] },
      { name: '美妆个护', items: ['口红', '粉底液', '面膜', '洗发水', '香水'] }
    ];
    
    // 根据原价范围选择类别
    let selectedCategory;
    if (originalPrice < 100) {
      selectedCategory = categories[2]; // 图书文具
    } else if (originalPrice < 500) {
      selectedCategory = categories[3]; // 生活用品
    } else if (originalPrice < 2000) {
      selectedCategory = categories[4]; // 运动户外
    } else {
      selectedCategory = categories[0]; // 电子产品
    }
    
    const randomItemIndex = Math.floor(Math.random() * selectedCategory.items.length);
    const productName = selectedCategory.items[randomItemIndex];
    
    // 生成商品描述
    const descriptions = [
      `这是一款${condition}的${productName}，外观保存良好，功能正常使用。适合日常使用，性价比较高。`,
      `${productName}，${condition}成色，无明显划痕和损坏。经过测试各项功能正常，可以放心使用。`,
      `商品为${condition}的${productName}，包装配件齐全。使用痕迹轻微，保养得当，值得推荐。`,
      `这款${productName}保持${condition}状态，性能稳定可靠。适合学生或上班族使用，实用性强。`
    ];
    
    const randomDescIndex = Math.floor(Math.random() * descriptions.length);
    
    return {
      productName: productName,
      productCategory: selectedCategory.name,
      productDescription: descriptions[randomDescIndex]
    };
  },

  /**
   * 原价输入
   */
  onOriginalPriceInput(e) {
    this.setData({
      originalPrice: e.detail.value
    });
  },

  /**
   * 保存商品信息
   */
  onSaveProduct() {
    if (!this.validateForm()) {
      return;
    }

    wx.showLoading({
      title: '保存中...'
    });

    // 模拟保存过程
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });
      
      // 返回主界面
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }, 2000);
  },

  /**
   * 立即发布 - 跳转到发布商品页面
   */
  onPublishProduct() {
    // 验证是否有AI分析结果
    if (!this.data.showResult) {
      wx.showToast({
        title: '请先进行AI分析',
        icon: 'none'
      });
      return;
    }

    // 优先使用云存储路径，如果没有则使用临时路径
    const imagePath = this.data.imageFileID || this.data.imagePath;

    // 准备跳转参数
    const params = {
      imagePath: imagePath, // 使用云存储路径或临时路径
      productName: this.data.productName,
      productCategory: this.data.productCategory,
      productDescription: this.data.productDescription,
      originalPrice: this.data.originalPrice,
      suggestedPrice: this.data.suggestedPrice,
      priceRange: this.data.marketRange,
      conditionLevel: this.data.conditionLevel,
      aiScore: this.data.aiScore,
      analysisReport: this.data.analysisReport
    };

    // 编码参数（处理特殊字符和长文本）
    const queryString = Object.keys(params)
      .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
      .map(key => {
        const value = params[key];
        // 对于长文本，可能需要截断，但这里先完整传递
        return `${key}=${encodeURIComponent(value)}`;
      })
      .join('&');

    console.log('跳转到发布页面，参数:', params);

    // 跳转到发布商品页面
    wx.navigateTo({
      url: `/pages/publish/publish?${queryString}`,
      fail: (err) => {
        console.error('跳转失败:', err);
        wx.showToast({
          title: '跳转失败，请重试',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 表单验证
   */
  validateForm() {
    if (!this.data.imagePath) {
      wx.showToast({
        title: '请上传商品图片',
        icon: 'none'
      });
      return false;
    }

    if (!this.data.originalPrice || parseFloat(this.data.originalPrice) <= 0) {
      wx.showToast({
        title: '请输入有效的商品原价',
        icon: 'none'
      });
      return false;
    }

    if (!this.data.showResult) {
      wx.showToast({
        title: '请先进行AI分析',
        icon: 'none'
      });
      return false;
    }

    return true;
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