// pages/security/security.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    phone: '',
    email: '',
    passwordSet: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadSecurityInfo();
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
   * 加载安全信息
   */
  async loadSecurityInfo() {
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
          this.setData({
            phone: userData.phone || '',
            email: userData.email || '',
            passwordSet: !!userData.password
          });
        }
      }
    } catch (err) {
      console.error('加载安全信息失败:', err);
    }
  },

  /**
   * 修改手机号
   */
  onChangePhone() {
    wx.showModal({
      title: '修改手机号',
      content: '请联系客服修改手机号',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  /**
   * 修改邮箱
   */
  onChangeEmail() {
    wx.navigateTo({
      url: '/pages/change-email/change-email'
    });
  },

  /**
   * 修改密码
   */
  onChangePassword() {
    wx.navigateTo({
      url: '/pages/change-password/change-password'
    });
  },

  /**
   * 账号安全
   */
  onAccountSecurity() {
    wx.showModal({
      title: '账号安全',
      content: '当前账号状态正常',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});

