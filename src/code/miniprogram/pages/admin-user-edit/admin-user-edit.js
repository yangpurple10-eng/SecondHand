// pages/admin-user-edit/admin-user-edit.js
Page({
  data: {
    userId: '',
    userInfo: {
      sno: '',
      sname: '',
      phone: '',
      major: '',
      grade: '',
      sushe: '',
      avatar: ''
    },
    newPassword: '',
    grades: [
      { label: '大一', value: '大一' },
      { label: '大二', value: '大二' },
      { label: '大三', value: '大三' },
      { label: '大四', value: '大四' },
      { label: '研究生', value: '研究生' },
      { label: '博士生', value: '博士生' }
    ],
    gradeIndex: 0,
    loading: true,
    submitting: false,
    canSubmit: false
  },

  onLoad(options) {
    // 检查管理员登录状态
    const adminInfo = wx.getStorageSync('adminInfo');
    if (!adminInfo) {
      wx.redirectTo({
        url: '/pages/admin-login/admin-login'
      });
      return;
    }

    const userId = options.id;
    if (userId) {
      this.setData({
        userId: userId
      });
      this.loadUserInfo(userId);
    } else {
      // 新建用户（可选功能）
      this.setData({
        loading: false
      });
    }
  },

  /**
   * 加载用户信息
   */
  async loadUserInfo(userId) {
    try {
      const db = wx.cloud.database();
      const result = await db.collection('T_user').doc(userId).get();
      
      if (result.data) {
        const userInfo = result.data;
        // 找到年级索引
        const gradeValue = userInfo.年级 || userInfo.grade || '';
        const gradeIndex = this.data.grades.findIndex(grade => grade.value === gradeValue);
        
        this.setData({
          userInfo: {
            sno: userInfo.sno || '',
            sname: userInfo.sname || '',
            phone: userInfo.phone || '',
            major: userInfo.major || '',
            grade: gradeValue,
            sushe: userInfo.sushe || '',
      avatar: userInfo.avatar || 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U'
          },
          gradeIndex: gradeIndex >= 0 ? gradeIndex : 0,
          loading: false
        });
        
        // 检查是否可以提交
        this.checkCanSubmit();
      } else {
        throw new Error('用户不存在');
      }
    } catch (err) {
      console.error('加载用户信息失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  /**
   * 检查是否可以提交
   */
  checkCanSubmit() {
    const { userInfo } = this.data;
    const canSubmit = !!(userInfo.sno && userInfo.sname && userInfo.phone);
    this.setData({
      canSubmit: canSubmit
    });
  },

  /**
   * 输入处理
   */
  onInputSno(e) {
    this.setData({
      'userInfo.sno': e.detail.value
    });
    this.checkCanSubmit();
  },

  onInputSname(e) {
    this.setData({
      'userInfo.sname': e.detail.value
    });
    this.checkCanSubmit();
  },

  onInputPhone(e) {
    this.setData({
      'userInfo.phone': e.detail.value
    });
    this.checkCanSubmit();
  },

  onInputMajor(e) {
    this.setData({
      'userInfo.major': e.detail.value
    });
  },

  onInputSushe(e) {
    this.setData({
      'userInfo.sushe': e.detail.value
    });
  },

  onInputPassword(e) {
    this.setData({
      newPassword: e.detail.value
    });
  },

  /**
   * 年级选择
   */
  onGradeChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({
      gradeIndex: index,
      'userInfo.grade': this.data.grades[index].value
    });
  },

  /**
   * 选择头像
   */
  onChooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({
          title: '上传中...',
          mask: true
        });

        try {
          const filePath = res.tempFilePaths[0];
          const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
          
          const uploadResult = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: filePath
          });

          this.setData({
            'userInfo.avatar': uploadResult.fileID
          });

          wx.hideLoading();
        } catch (err) {
          console.error('上传头像失败:', err);
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
   * 提交修改
   */
  async onSubmit() {
    if (!this.data.canSubmit) {
      wx.showToast({
        title: '请填写必填项',
        icon: 'none'
      });
      return;
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(this.data.userInfo.phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      });
      return;
    }

    // 如果设置了新密码，验证密码长度
    if (this.data.newPassword && this.data.newPassword.length < 6) {
      wx.showToast({
        title: '密码长度不能少于6位',
        icon: 'none'
      });
      return;
    }

    this.setData({
      submitting: true
    });

    try {
      // 构建更新数据
      const updateData = {
        sno: this.data.userInfo.sno.trim(),
        sname: this.data.userInfo.sname.trim(),
        phone: this.data.userInfo.phone.trim(),
        major: this.data.userInfo.major.trim() || '',
        年级: this.data.userInfo.grade || '', // 保存到数据库时使用中文字段名
        sushe: this.data.userInfo.sushe.trim() || '',
      avatar: this.data.userInfo.avatar || 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U',
        updateTime: new Date()
      };

      // 如果设置了新密码，添加到更新数据中
      if (this.data.newPassword) {
        updateData.password = this.data.newPassword.trim();
      }

      // 调用云函数更新用户信息
      wx.showLoading({
        title: '保存中...',
        mask: true
      });

      const result = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'adminUpdateUser',
          userId: this.data.userId,
          data: updateData
        }
      });

      wx.hideLoading();

      console.log('更新用户信息结果:', result);

      if (result.result && result.result.success) {
        wx.showToast({
          title: '保存成功',
          icon: 'success',
          duration: 2000
        });

        setTimeout(() => {
          wx.navigateBack();
        }, 2000);
      } else {
        const errorMsg = result.result?.error || result.errMsg || '保存失败';
        console.error('保存失败:', errorMsg);
        wx.showToast({
          title: errorMsg,
          icon: 'none',
          duration: 3000
        });
      }
    } catch (err) {
      console.error('保存用户信息失败:', err);
      wx.showToast({
        title: err.message || '保存失败',
        icon: 'none'
      });
    } finally {
      this.setData({
        submitting: false
      });
    }
  }
});

