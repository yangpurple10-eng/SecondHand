// pages/feedback/feedback.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    feedbackType: 'suggestion',
    types: [
      { value: 'suggestion', label: '意见反馈' },
      { value: 'bug', label: '问题反馈' },
      { value: 'feature', label: '功能建议' },
      { value: 'other', label: '其他' }
    ],
    content: '',
    contact: '',
    images: []
  },

  /**
   * 选择反馈类型
   */
  onTypeChange(e) {
    this.setData({
      feedbackType: e.currentTarget.dataset.type
    });
  },

  /**
   * 内容输入
   */
  onContentInput(e) {
    this.setData({
      content: e.detail.value
    });
  },

  /**
   * 联系方式输入
   */
  onContactInput(e) {
    this.setData({
      contact: e.detail.value
    });
  },

  /**
   * 选择图片
   */
  chooseImage() {
    wx.chooseImage({
      count: 3,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePaths = res.tempFilePaths;
        this.uploadImages(tempFilePaths);
      }
    });
  },

  /**
   * 上传图片
   */
  async uploadImages(filePaths) {
    wx.showLoading({
      title: '上传中...'
    });

    try {
      const uploadPromises = filePaths.map(filePath => {
        const cloudPath = `feedback/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
        return wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: filePath
        });
      });

      const uploadResults = await Promise.all(uploadPromises);
      const imageUrls = uploadResults.map(result => result.fileID);

      this.setData({
        images: [...this.data.images, ...imageUrls]
      });

      wx.hideLoading();
      wx.showToast({
        title: '上传成功',
        icon: 'success'
      });
    } catch (err) {
      console.error('上传图片失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      });
    }
  },

  /**
   * 删除图片
   */
  onDeleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.filter((_, i) => i !== index);
    this.setData({
      images: images
    });
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
   * 提交反馈
   */
  async submitFeedback() {
    const { feedbackType, content, contact, images } = this.data;

    // 验证必填项
    if (!content || !content.trim()) {
      wx.showToast({
        title: '请输入反馈内容',
        icon: 'none'
      });
      return;
    }

    if (content.trim().length < 10) {
      wx.showToast({
        title: '反馈内容至少10个字',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '提交中...'
    });

    try {
      const db = wx.cloud.database();
      const openid = await this.ensureOpenId();

      if (!openid) {
        wx.hideLoading();
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        return;
      }

      await db.collection('T_feedback').add({
        data: {
          _openid: openid,
          type: feedbackType,
          content: content.trim(),
          contact: contact.trim() || '',
          images: images,
          status: 'pending', // pending: 待处理, processing: 处理中, resolved: 已解决
          createTime: new Date(),
          updateTime: new Date()
        }
      });

      wx.hideLoading();
      wx.showToast({
        title: '提交成功',
        icon: 'success'
      });

      // 清空表单
      this.setData({
        content: '',
        contact: '',
        images: []
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error('提交反馈失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '提交失败',
        icon: 'none'
      });
    }
  }
});

