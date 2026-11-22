// index.js
Page({
  data: {
    studentId: '',
    password: '',
    isLoginDisabled: false
  },
  
  onLoad() {
    // 检查本地存储中是否有登录信息
    this.checkLoginStatus();
  },
  
  // 检查登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    
    if (token && userInfo) {
      // 如果已登录，跳转到主页面
      wx.switchTab({
        url: '/pages/main/main'
      });
    }
  },
  
  // 学号/手机号输入处理
  onInputStudentId(e) {
    const studentId = e.detail.value.trim();
    this.setData({
      studentId: studentId
    });
    this.checkLoginButton();
  },
  
  // 密码输入处理
  onInputPassword(e) {
    const password = e.detail.value.trim();
    this.setData({
      password: password
    });
    this.checkLoginButton();
  },
  
  // 检查登录按钮状态
  checkLoginButton() {
    // 按钮始终保持可用状态
    this.setData({
      isLoginDisabled: false
    });
  },
  
  // 登录处理
  onLogin() {
    const { studentId, password } = this.data;
    
    // 简单的前端验证
    if (!this.validateInput(studentId, password)) {
      return;
    }
    
    // 显示加载中
    wx.showLoading({
      title: '登录中...',
      mask: true
    });
    
    // 调用云数据库进行真实登录验证
    this.realLogin(studentId, password);
  },
  
  // 输入验证
  validateInput(studentId, password) {
    if (!studentId) {
      wx.showToast({
        title: '请输入学号或手机号',
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
  
  // 真实登录验证（查询云数据库）
  realLogin(loginId, password) {
    const db = wx.cloud.database();
    
    // 查询数据库中的T_user表
    db.collection('T_user').where({
      $or: [
        { phone: loginId },  // 手机号匹配
        { sno: loginId }     // 学号匹配
      ],
      password: password      // 密码匹配
    }).get({
      success: (res) => {
        wx.hideLoading();
        
        if (res.data.length > 0) {
          // 登录成功
          const userData = res.data[0];
          const userInfo = {
            _id: userData._id,
            sno: userData.sno,
            sname: userData.sname,
            phone: userData.phone,
            major: userData.major,
            sushe: userData.sushe,
            grade: userData.年级,
            avatar: userData.avatar || 'https://via.placeholder.com/100x100/4CAF50/ffffff?text=U'
          };
          
          // 清除旧的用户相关缓存（切换账号时清除）
          wx.removeStorageSync('openid');
          wx.removeStorageSync('userStats');
          wx.removeStorageSync('notificationEnabled');
          
          // 保存登录信息到本地存储
          wx.setStorageSync('token', 'user_token_' + userData._id);
          wx.setStorageSync('userInfo', userInfo);
          
          wx.showToast({
            title: '登录成功',
            icon: 'success',
            duration: 1500
          });
          
          // 跳转到主页面
          setTimeout(() => {
            wx.switchTab({
              url: '/pages/main/main'
            });
          }, 1500);
        } else {
          // 登录失败
          wx.showToast({
            title: '账号或密码错误',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('登录查询失败:', err);
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        });
      }
    });
  },
  
  // 注册处理
  onRegister() {
    wx.navigateTo({
      url: '/pages/register/register'
    });
  },
  
  // 忘记密码处理
  onForgotPassword() {
    wx.navigateTo({
      url: '/pages/forgot-password/forgot-password'
    });
  },
  
  // 管理员登录
  onAdminLogin() {
    wx.navigateTo({
      url: '/pages/admin-login/admin-login'
    });
  },
  
  // 微信一键登录
  onGetPhoneNumber(e) {
    if (e.detail.errMsg === 'getPhoneNumber:ok') {
      // 用户同意授权
      const { encryptedData, iv } = e.detail;
      
      wx.showLoading({
        title: '登录中...',
        mask: true
      });
      
      // 模拟微信登录
      setTimeout(() => {
        const userInfo = {
          studentId: 'wx_' + Date.now().toString().slice(-6),
          nickname: '微信用户',
          avatar: 'https://via.placeholder.com/100x100/07C160/ffffff?text=W',
          campus: '微信用户',
          department: '微信用户'
        };
        
        wx.setStorageSync('token', 'wx_token_' + Date.now());
        wx.setStorageSync('userInfo', userInfo);
        
        wx.hideLoading();
        wx.showToast({
          title: '微信登录成功',
          icon: 'success'
        });
        
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/main/main'
          });
        }, 1500);
      }, 1500);
    } else {
      // 用户拒绝授权
      wx.showToast({
        title: '授权失败',
        icon: 'none'
      });
    }
  }
})
