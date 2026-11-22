// pages/profile-edit/profile-edit.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    userInfo: {
      nickName: '',
      avatar: '',
      phone: '',
      major: '',
      grade: '',
      dorm: ''
    },
    avatarTemp: '',
    grades: ['大一', '大二', '大三', '大四', '研究生', '博士生'],
    gradeIndex: 0
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadUserInfo();
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
   * 加载用户信息
   */
  async loadUserInfo() {
    try {
      // 先从本地存储获取登录时保存的用户信息
      const localUserInfo = wx.getStorageSync('userInfo') || {};
      const loggedInUserId = localUserInfo._id; // 获取登录时保存的用户ID
      
      const db = wx.cloud.database();
      let userData = null;
      
      // 优先使用登录时保存的用户ID来查询数据库
      if (loggedInUserId) {
        try {
          const userResult = await db.collection('T_user')
            .doc(loggedInUserId)
            .get();
          
          if (userResult.data) {
            userData = userResult.data;
          }
        } catch (err) {
          console.error('通过用户ID获取用户信息失败:', err);
          // 如果使用_id查询失败，尝试使用openid查询（向后兼容）
          const openid = await this.ensureOpenId();
          if (openid) {
            try {
              const userResult = await db.collection('T_user')
                .where({
                  _openid: openid
                })
                .get();
              
              if (userResult.data && userResult.data.length > 0) {
                userData = userResult.data[0];
              }
            } catch (err2) {
              console.error('使用openid查询用户信息也失败:', err2);
            }
          }
        }
      } else {
        // 如果没有登录的用户ID，尝试使用openid（向后兼容）
        const openid = await this.ensureOpenId();
        if (openid) {
          try {
            const userResult = await db.collection('T_user')
              .where({
                _openid: openid
              })
              .get();
            
            if (userResult.data && userResult.data.length > 0) {
              userData = userResult.data[0];
            }
          } catch (err) {
            console.error('从云数据库获取用户信息失败:', err);
          }
        }
      }
      
      // 如果从数据库获取到数据，使用数据库数据
      if (userData) {
        const gradeIndex = this.data.grades.findIndex(g => g === userData.年级) >= 0 
          ? this.data.grades.findIndex(g => g === userData.年级) 
          : 0;
        
        this.setData({
          userInfo: {
            nickName: userData.sname || userData.nickName || '',
            avatar: userData.avatar || 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U',
            phone: userData.phone || '',
            major: userData.major || '',
            grade: userData.年级 || '',
            dorm: userData.sushe || ''
          },
          gradeIndex: gradeIndex
        });
      } else if (localUserInfo.sname || localUserInfo.nickName) {
        // 如果数据库中没有数据，从本地存储获取
        this.setData({
          userInfo: {
            nickName: localUserInfo.sname || localUserInfo.nickName || '',
            avatar: localUserInfo.avatar || 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U',
            phone: localUserInfo.phone || '',
            major: localUserInfo.major || '',
            grade: localUserInfo.grade || localUserInfo.年级 || '',
            dorm: localUserInfo.sushe || localUserInfo.dorm || ''
          }
        });
      }
    } catch (err) {
      console.error('加载用户信息失败:', err);
      const localUserInfo = wx.getStorageSync('userInfo') || {};
      this.setData({
        userInfo: {
          nickName: localUserInfo.sname || localUserInfo.nickName || '',
          avatar: localUserInfo.avatar || 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U',
          phone: localUserInfo.phone || '',
          major: localUserInfo.major || '',
          grade: localUserInfo.grade || localUserInfo.年级 || '',
          dorm: localUserInfo.sushe || localUserInfo.dorm || ''
        }
      });
    }
  },

  /**
   * 昵称输入
   */
  onNickNameInput(e) {
    this.setData({
      'userInfo.nickName': e.detail.value
    });
  },

  /**
   * 手机号输入
   */
  onPhoneInput(e) {
    this.setData({
      'userInfo.phone': e.detail.value
    });
  },

  /**
   * 专业输入
   */
  onMajorInput(e) {
    this.setData({
      'userInfo.major': e.detail.value
    });
  },

  /**
   * 宿舍输入
   */
  onDormInput(e) {
    this.setData({
      'userInfo.dorm': e.detail.value
    });
  },

  /**
   * 选择年级
   */
  onGradeChange(e) {
    const index = e.detail.value;
    this.setData({
      gradeIndex: index,
      'userInfo.grade': this.data.grades[index]
    });
  },

  /**
   * 选择头像
   */
  chooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        this.setData({
          avatarTemp: tempFilePath
        });
        // 上传头像
        this.uploadAvatar(tempFilePath);
      }
    });
  },

  /**
   * 上传头像
   */
  async uploadAvatar(filePath) {
    wx.showLoading({
      title: '上传中...'
    });

    try {
      const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      });

      this.setData({
        'userInfo.avatar': uploadResult.fileID,
        avatarTemp: uploadResult.fileID
      });

      wx.hideLoading();
      wx.showToast({
        title: '头像上传成功',
        icon: 'success'
      });
    } catch (err) {
      console.error('上传头像失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      });
    }
  },

  /**
   * 保存个人信息
   */
  async saveProfile() {
    const { userInfo } = this.data;
    
    // 验证必填项
    if (!userInfo.nickName || !userInfo.nickName.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      });
      return;
    }

    if (!userInfo.phone || !userInfo.phone.trim()) {
      wx.showToast({
        title: '请输入手机号',
        icon: 'none'
      });
      return;
    }

    // 验证手机号格式
    const phoneReg = /^1[3-9]\d{9}$/;
    if (!phoneReg.test(userInfo.phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '保存中...'
    });

    try {
      const db = wx.cloud.database();
      const localUserInfo = wx.getStorageSync('userInfo') || {};
      const loggedInUserId = localUserInfo._id; // 获取登录时保存的用户ID
      
      if (!loggedInUserId) {
        // 如果没有登录的用户ID，尝试使用openid（向后兼容）
        const openid = await this.ensureOpenId();
        if (!openid) {
          wx.showToast({
            title: '请先登录',
            icon: 'none'
          });
          return;
        }
      }
      
      // 更新数据库
      const updateData = {
        sname: userInfo.nickName,
        phone: userInfo.phone,
        major: userInfo.major,
        年级: userInfo.grade,
        sushe: userInfo.dorm,
        updateTime: new Date()
      };

      if (userInfo.avatar && userInfo.avatar.startsWith('cloud://')) {
        updateData.avatar = userInfo.avatar;
      }

      // 优先使用登录的用户ID来更新
      if (loggedInUserId) {
        await db.collection('T_user')
          .doc(loggedInUserId)
          .update({
            data: updateData
          });
      } else {
        // 如果没有用户ID，使用openid（向后兼容）
        const openid = await this.ensureOpenId();
        if (openid) {
          await db.collection('T_user')
            .where({
              _openid: openid
            })
            .update({
              data: updateData
            });
        }
      }

      // 更新本地存储
      const updatedUserInfo = {
        ...wx.getStorageSync('userInfo') || {},
        nickName: userInfo.nickName,
        avatar: userInfo.avatar,
        phone: userInfo.phone,
        major: userInfo.major,
        grade: userInfo.grade,
        dorm: userInfo.dorm,
        sname: userInfo.nickName,
        sushe: userInfo.dorm,
        年级: userInfo.grade
      };
      wx.setStorageSync('userInfo', updatedUserInfo);

      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error('保存个人信息失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  }
});

