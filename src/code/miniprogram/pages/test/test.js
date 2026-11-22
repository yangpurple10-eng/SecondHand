// test.js
Page({
  data: {
    dbStatus: '',
    userCount: 0,
    userList: [],
    testResult: ''
  },

  onLoad() {
    this.checkDatabase();
  },

  // 检查数据库状态
  checkDatabase() {
    wx.showLoading({
      title: '检查数据库中...',
    });

    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'queryTUser'
      },
      success: (res) => {
        wx.hideLoading();
        if (res.result.success) {
          this.setData({
            dbStatus: '数据库连接正常',
            userCount: res.result.count,
            userList: res.result.data
          });
        } else {
          this.setData({
            dbStatus: '数据库查询失败: ' + res.result.error
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({
          dbStatus: '云函数调用失败: ' + err.errMsg
        });
      }
    });
  },

  // 添加测试用户
  addTestUser() {
    wx.showLoading({
      title: '添加测试用户...',
    });

    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'addTestUser',
        userData: {
          sno: "230340151",
          sname: "测试用户",
          phone: "13800138000",
          password: "100997@mkg",
          major: "计算机科学",
          sushe: "1号楼 101",
          年级: "大三",
          avatar: "https://via.placeholder.com/100x100/4285F4/ffffff?text=T"
        }
      },
      success: (res) => {
        wx.hideLoading();
        if (res.result.success) {
          this.setData({
            testResult: '测试用户添加成功！现在可以尝试登录。'
          });
          this.checkDatabase(); // 刷新数据
        } else {
          this.setData({
            testResult: '添加失败: ' + res.result.error
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({
          testResult: '云函数调用失败: ' + err.errMsg
        });
      }
    });
  },

  // 测试登录功能
  testLogin() {
    // 直接调用登录页面的登录方法
    const pages = getCurrentPages();
    const indexPage = pages.find(page => page.route === 'pages/index/index');
    
    if (indexPage) {
      indexPage.setData({
        studentId: '230340151',
        password: '100997@mkg'
      });
      indexPage.onLogin();
    } else {
      wx.showToast({
        title: '请先返回登录页面',
        icon: 'none'
      });
    }
  },

  // 跳转到登录页面
  goToLogin() {
    wx.navigateTo({
      url: '/pages/index/index'
    });
  }
})