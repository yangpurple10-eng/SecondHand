// pages/admin-login/admin-login.js
Page({
  data: {
    username: '',
    password: '',
    isLoginDisabled: false
  },
  
  onLoad() {
    // 检查是否已登录
    const adminInfo = wx.getStorageSync('adminInfo');
    if (adminInfo) {
      wx.redirectTo({
        url: '/pages/admin-dashboard/admin-dashboard'
      });
    }
  },
  
  // 账号输入处理
  onInputUsername(e) {
    this.setData({
      username: e.detail.value.trim()
    });
    this.checkLoginButton();
  },
  
  // 密码输入处理
  onInputPassword(e) {
    this.setData({
      password: e.detail.value.trim()
    });
    this.checkLoginButton();
  },
  
  // 检查登录按钮状态
  checkLoginButton() {
    this.setData({
      isLoginDisabled: false
    });
  },
  
  // 登录处理
  onLogin() {
    const { username, password } = this.data;
    
    if (!this.validateInput(username, password)) {
      return;
    }
    
    wx.showLoading({
      title: '登录中...',
      mask: true
    });
    
    // 调用云函数验证管理员身份
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'adminLogin',
        username: username,
        password: password
      },
      success: (res) => {
        wx.hideLoading();
        
        if (res.result && res.result.success) {
          // 登录成功
          const adminInfo = {
            _id: res.result.adminId,
            username: res.result.username,
            name: res.result.name || '管理员',
            role: res.result.role || 'admin'
          };
          
          wx.setStorageSync('adminInfo', adminInfo);
          wx.setStorageSync('adminToken', 'admin_token_' + res.result.adminId);
          
          wx.showToast({
            title: '登录成功',
            icon: 'success',
            duration: 1500
          });
          
          setTimeout(() => {
            wx.redirectTo({
              url: '/pages/admin-dashboard/admin-dashboard'
            });
          }, 1500);
        } else {
          wx.showToast({
            title: res.result?.error || '账号或密码错误',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('管理员登录失败:', err);
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        });
      }
    });
  },
  
  // 输入验证
  validateInput(username, password) {
    if (!username) {
      wx.showToast({
        title: '请输入管理员账号',
        icon: 'none'
      });
      return false;
    }
    
    if (!password) {
      wx.showToast({
        title: '请输入密码',
        icon: 'none'
      });
      return false;
    }
    
    if (password.length < 6) {
      wx.showToast({
        title: '密码长度不能少于6位',
        icon: 'none'
      });
      return false;
    }
    
    return true;
  },
  
  // 返回用户登录
  onBackToUserLogin() {
    wx.navigateBack();
  }
});

