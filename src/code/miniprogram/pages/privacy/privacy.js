// pages/privacy/privacy.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    showPhone: true,
    showEmail: true,
    allowSearch: true,
    allowRecommend: true
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadPrivacySettings();
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
   * 加载隐私设置
   */
  async loadPrivacySettings() {
    try {
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
          const privacySettings = userData.privacySettings || {};
          
          this.setData({
            showPhone: privacySettings.showPhone !== false,
            showEmail: privacySettings.showEmail !== false,
            allowSearch: privacySettings.allowSearch !== false,
            allowRecommend: privacySettings.allowRecommend !== false
          });
          
          // 更新本地存储
          wx.setStorageSync('privacySettings', {
            showPhone: privacySettings.showPhone !== false,
            showEmail: privacySettings.showEmail !== false,
            allowSearch: privacySettings.allowSearch !== false,
            allowRecommend: privacySettings.allowRecommend !== false
          });
        }
      }

      // 从本地存储获取（如果数据库中没有）
      const localSettings = wx.getStorageSync('privacySettings') || {};
      if (localSettings.showPhone !== undefined) {
        this.setData({
          showPhone: localSettings.showPhone,
          showEmail: localSettings.showEmail,
          allowSearch: localSettings.allowSearch,
          allowRecommend: localSettings.allowRecommend
        });
      }
    } catch (err) {
      console.error('加载隐私设置失败:', err);
    }
  },

  /**
   * 显示手机号开关
   */
  async onShowPhoneChange(e) {
    const value = e.detail.value;
    await this.updatePrivacySetting('showPhone', value);
    this.setData({
      showPhone: value
    });
  },

  /**
   * 显示邮箱开关
   */
  async onShowEmailChange(e) {
    const value = e.detail.value;
    await this.updatePrivacySetting('showEmail', value);
    this.setData({
      showEmail: value
    });
  },

  /**
   * 允许搜索开关
   */
  async onAllowSearchChange(e) {
    const value = e.detail.value;
    await this.updatePrivacySetting('allowSearch', value);
    this.setData({
      allowSearch: value
    });
  },

  /**
   * 允许推荐开关
   */
  async onAllowRecommendChange(e) {
    const value = e.detail.value;
    await this.updatePrivacySetting('allowRecommend', value);
    this.setData({
      allowRecommend: value
    });
  },

  /**
   * 更新隐私设置
   */
  async updatePrivacySetting(key, value) {
    try {
      const db = wx.cloud.database();
      const openid = await this.ensureOpenId();

      if (!openid) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        return;
      }

      if (openid) {
        const currentSettings = this.data;
        const privacySettings = {
          showPhone: currentSettings.showPhone,
          showEmail: currentSettings.showEmail,
          allowSearch: currentSettings.allowSearch,
          allowRecommend: currentSettings.allowRecommend,
          [key]: value
        };

        await db.collection('T_user')
          .where({
            _openid: openid
          })
          .update({
            data: {
              privacySettings: privacySettings,
              updateTime: new Date()
            }
          });
      }

      // 更新本地存储
      const localSettings = {
        showPhone: this.data.showPhone,
        showEmail: this.data.showEmail,
        allowSearch: this.data.allowSearch,
        allowRecommend: this.data.allowRecommend,
        [key]: value
      };
      wx.setStorageSync('privacySettings', localSettings);

      wx.showToast({
        title: '设置已保存',
        icon: 'success'
      });
    } catch (err) {
      console.error('更新隐私设置失败:', err);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  }
});

