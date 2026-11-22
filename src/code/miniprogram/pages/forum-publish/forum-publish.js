// pages/forum-publish/forum-publish.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    category: 'study',
    categories: [
      { label: '学习交流', value: 'study' },
      { label: '生活分享', value: 'life' },
      { label: '二手交易', value: 'trade' },
      { label: '校园活动', value: 'activity' },
      { label: '求助问答', value: 'help' },
      { label: '其他', value: 'other' }
    ],
    title: '',
    content: '',
    images: [],
    submitting: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    const category = options.category || 'study';
    this.setData({
      category: category
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
   * 分类选择
   */
  onCategorySelect(e) {
    const category = e.currentTarget.dataset.value;
    this.setData({
      category: category
    });
  },

  /**
   * 标题输入
   */
  onTitleInput(e) {
    this.setData({
      title: e.detail.value
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
   * 选择图片
   */
  onChooseImage() {
    const maxCount = 9 - this.data.images.length;
    wx.chooseImage({
      count: maxCount,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({
          title: '上传中...',
          mask: true
        });

        try {
          const uploadPromises = res.tempFilePaths.map(async (filePath) => {
            const cloudPath = `forum/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
            const uploadResult = await wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: filePath
            });
            return uploadResult.fileID;
          });

          const fileIDs = await Promise.all(uploadPromises);
          
          this.setData({
            images: [...this.data.images, ...fileIDs]
          });

          wx.hideLoading();
        } catch (err) {
          console.error('上传图片失败:', err);
          wx.hideLoading();
          wx.showToast({
            title: '上传失败',
            icon: 'none'
          });
        }
      }
    });
  },

  /**
   * 删除图片
   */
  onDeleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images;
    images.splice(index, 1);
    this.setData({
      images: images
    });
  },

  /**
   * 检查是否可以提交
   */
  get canSubmit() {
    return this.data.title.trim().length > 0 && this.data.content.trim().length > 0;
  },

  /**
   * 提交帖子
   */
  async onSubmit() {
    if (!this.canSubmit) {
      wx.showToast({
        title: '请填写标题和内容',
        icon: 'none'
      });
      return;
    }

    const openid = await this.ensureOpenId();
    if (!openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    this.setData({
      submitting: true
    });

    try {
      const db = wx.cloud.database();
      
      // 创建帖子
      await db.collection('T_forum_post').add({
        data: {
          authorOpenId: openid,
          category: this.data.category,
          title: this.data.title.trim(),
          content: this.data.content.trim(),
          images: this.data.images,
          viewCount: 0,
          commentCount: 0,
          likeCount: 0,
          status: 'published',
          createTime: new Date(),
          updateTime: new Date()
        }
      });

      wx.showToast({
        title: '发布成功',
        icon: 'success'
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error('发布帖子失败:', err);
      
      // 如果集合不存在，尝试创建
      if (err.errMsg && (err.errMsg.includes('not exist') || err.errMsg.includes('not exists') || err.errCode === -502005)) {
        try {
          await wx.cloud.callFunction({
            name: 'quickstartFunctions',
            data: {
              type: 'createForumCollection'
            }
          });
          
          // 重新尝试发布
          const db = wx.cloud.database();
          await db.collection('T_forum_post').add({
            data: {
              authorOpenId: openid,
              category: this.data.category,
              title: this.data.title.trim(),
              content: this.data.content.trim(),
              images: this.data.images,
              viewCount: 0,
              commentCount: 0,
              likeCount: 0,
              status: 'published',
              createTime: new Date(),
              updateTime: new Date()
            }
          });

          wx.showToast({
            title: '发布成功',
            icon: 'success'
          });

          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        } catch (createErr) {
          console.error('创建集合失败:', createErr);
          wx.showModal({
            title: '提示',
            content: '论坛功能需要初始化数据库集合。请在云开发控制台创建 T_forum_post 集合，或联系管理员。',
            showCancel: false,
            confirmText: '知道了'
          });
        }
      } else {
        wx.showToast({
          title: '发布失败',
          icon: 'none'
        });
      }
    } finally {
      this.setData({
        submitting: false
      });
    }
  }
});

