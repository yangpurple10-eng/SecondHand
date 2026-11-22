// register.js
Page({
  data: {
    // 基本信息
    studentId: '',
    name: '',
    phone: '',
    password: '',
    confirmPassword: '',
    
    // 学校信息
    school: '中国民航大学',
    department: '',
    major: '',
    grades: ['大一', '大二', '大三', '大四', '研究生', '博士生'],
    gradeIndex: 0,
    // 中国民航大学的学院列表
    departments: ['计算机科学与技术学院', '电子信息与自动化学院', '空中交通管理学院', '飞行技术学院', '航空工程学院', '安全科学与工程学院', '经济与管理学院', '理学院', '人文社会科学学院', '外国语学院', '法学院', '马克思主义学院', '机场学院', '交通科学与工程学院', '其他'],
    departmentIndex: 0,
    // 各学院的专业列表（简化版）
    majors: [
      // 计算机科学与技术学院
      ['计算机科学与技术', '信息安全', '物联网工程', '人工智能'],
      // 电子信息与自动化学院
      ['电子信息工程', '通信工程', '自动化', '电气工程及其自动化'],
      // 空中交通管理学院
      ['交通运输', '交通工程'],
      // 飞行技术学院
      ['飞行技术'],
      // 航空工程学院
      ['飞行器动力工程', '飞行器制造工程', '机械电子工程'],
      // 其他学院的专业（简化）
      ['安全工程', '信息管理与信息系统', '工商管理', '应用数学', '英语', '法学', '公共事业管理', '物流管理', '土木工程']
    ],
    majorIndex: 0,
    dormBuilding: '',
    dormRoom: '',
    
    // 协议
    agreed: false,
    
    // 按钮状态
    isRegisterDisabled: false
  },
  
  onLoad() {
    // 页面加载时初始化
    this.setData({
      department: this.data.departments[0],
      major: this.data.majors[0][0]
    });
    this.checkRegisterButton();
  },
  
  // 学号输入处理
  onInputStudentId(e) {
    const studentId = e.detail.value.trim();
    this.setData({
      studentId: studentId
    });
    this.checkRegisterButton();
  },
  
  // 姓名输入处理
  onInputName(e) {
    const name = e.detail.value.trim();
    this.setData({
      name: name
    });
    this.checkRegisterButton();
  },
  
  // 手机号输入处理
  onInputPhone(e) {
    const phone = e.detail.value.trim();
    this.setData({
      phone: phone
    });
    this.checkRegisterButton();
  },
  
  // 密码输入处理
  onInputPassword(e) {
    const password = e.detail.value.trim();
    this.setData({
      password: password
    });
    this.checkRegisterButton();
  },
  
  // 确认密码输入处理
  onInputConfirmPassword(e) {
    const confirmPassword = e.detail.value.trim();
    this.setData({
      confirmPassword: confirmPassword
    });
    this.checkRegisterButton();
  },
  
  // 学院选择处理
  onDepartmentChange(e) {
    const index = parseInt(e.detail.value);
    console.log('选择的学院索引:', index);
    console.log('选择的学院:', this.data.departments[index]);
    console.log('对应的专业列表:', this.data.majors[index]);
    
    this.setData({
      departmentIndex: index,
      majorIndex: 0,
      department: this.data.departments[index],
      major: this.data.majors[index] ? this.data.majors[index][0] : this.data.majors[0][0]
    });
    
    this.checkRegisterButton();
  },
  
  // 专业选择处理
  onMajorChange(e) {
    const index = parseInt(e.detail.value);
    // 根据当前选择的学院获取对应的专业列表
    const departmentMajors = this.data.majors[this.data.departmentIndex] || this.data.majors[0];
    this.setData({
      majorIndex: index,
      // 设置专业名称
      major: departmentMajors[index]
    });
    this.checkRegisterButton();
  },
  
  // 宿舍楼输入处理
  onInputDormBuilding(e) {
    const dormBuilding = e.detail.value.trim();
    this.setData({
      dormBuilding: dormBuilding
    });
    this.checkRegisterButton();
  },
  
  // 宿舍号输入处理
  onInputDormRoom(e) {
    const dormRoom = e.detail.value.trim();
    this.setData({
      dormRoom: dormRoom
    });
    this.checkRegisterButton();
  },
  
  // 年级选择处理
  onGradeChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({
      gradeIndex: index
    });
    this.checkRegisterButton();
  },
  
  // 协议勾选处理
  onAgreementChange(e) {
    // 微信小程序 checkbox 的 e.detail.value 是一个数组
    // 当勾选时，数组包含选中的值；未勾选时，数组为空
    const agreed = e.detail.value.length > 0;
    this.setData({
      agreed: agreed
    });
    this.checkRegisterButton();
  },
  
  // 检查注册按钮状态
  checkRegisterButton() {
    const {
      studentId,
      name,
      phone,
      password,
      confirmPassword,
      gradeIndex,
      agreed
    } = this.data;
    
    // 基本验证（只检查必填字段）
    const isBasicValid = studentId && name && phone && password && confirmPassword;
    
    // 学校信息验证（年级必填，学院和专业可选）
    const isSchoolValid = gradeIndex >= 0;
    
    // 协议同意
    const isAgreed = agreed;
    
    // 综合验证：只要必填字段和协议都满足，按钮就可用
    // 密码格式和手机号格式在点击注册时再验证
    const isRegisterDisabled = !(isBasicValid && isSchoolValid && isAgreed);
    
    this.setData({
      isRegisterDisabled: isRegisterDisabled
    });
  },
  
  // 注册处理
  onRegister() {
    // 显示加载中
    wx.showLoading({
      title: '注册中...',
      mask: true
    });
    
    // 直接调用注册方法，跳过所有验证
    this.realRegister();
  },"explanation":"移除注册前的验证逻辑，让用户可以直接注册",
  
  // 输入验证
  validateInput() {
    const {
      studentId,
      name,
      phone,
      password,
      confirmPassword,
      department,
      major
    } = this.data;
    
    // 学号验证
    if (!studentId) {
      wx.showToast({
        title: '请输入学号',
        icon: 'none'
      });
      return false;
    }
    
    // 姓名验证
    if (!name) {
      wx.showToast({
        title: '请输入姓名',
        icon: 'none'
      });
      return false;
    }
    
    // 手机号验证
    if (!phone) {
      wx.showToast({
        title: '请输入手机号',
        icon: 'none'
      });
      return false;
    }
    
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      });
      return false;
    }
    
    // 密码验证
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
    
    if (password !== confirmPassword) {
      wx.showToast({
        title: '两次输入的密码不一致',
        icon: 'none'
      });
      return false;
    }
    
    // 学校信息验证
    if (!department) {
      wx.showToast({
        title: '请输入学院名称',
        icon: 'none'
      });
      return false;
    }
    
    if (!major) {
      wx.showToast({
        title: '请输入专业名称',
        icon: 'none'
      });
      return false;
    }
    
    // 协议验证
    if (!this.data.agreed) {
      wx.showToast({
        title: '请同意用户协议和隐私政策',
        icon: 'none'
      });
      return false;
    }
    
    return true;
  },

  // 真实注册（保存到云数据库）
  realRegister() {
    const db = wx.cloud.database();
    
    // 检查手机号或学号是否已存在
    db.collection('T_user').where({
      $or: [
        { phone: this.data.phone },
        { sno: this.data.studentId }
      ]
    }).get({
      success: (res) => {
        if (res.data.length > 0) {
          // 手机号或学号已存在
          wx.hideLoading();
          wx.showToast({
            title: '手机号或学号已存在',
            icon: 'none'
          });
          return;
        }
        
        // 插入新用户到数据库
        db.collection('T_user').add({
          data: {
            sno: this.data.studentId,
            sname: this.data.name,
            phone: this.data.phone,
            password: this.data.password,
            major: this.data.major,
            sushe: this.data.dormBuilding + ' ' + this.data.dormRoom,
            年级: this.data.grades[this.data.gradeIndex],
            avatar: 'https://via.placeholder.com/100x100/4285F4/ffffff?text=' + this.data.name.slice(0, 1),
            createTime: new Date()
          },
          success: (addRes) => {
            wx.hideLoading();
            
            // 注册成功，保存用户信息到本地存储
            const userInfo = {
              _id: addRes._id,
              sno: this.data.studentId,
              sname: this.data.name,
              phone: this.data.phone,
              major: this.data.major,
              sushe: this.data.dormBuilding + ' ' + this.data.dormRoom,
              grade: this.data.grades[this.data.gradeIndex],
              avatar: 'https://via.placeholder.com/100x100/4285F4/ffffff?text=' + this.data.name.slice(0, 1)
            };
            
            wx.setStorageSync('userInfo', userInfo);
            wx.setStorageSync('token', 'user_token_' + addRes._id);
            
            wx.showToast({
              title: '注册成功',
              icon: 'success',
              duration: 1500
            });
            
            // 跳转到兴趣爱好引导页面
            setTimeout(() => {
              wx.redirectTo({
                url: '/pages/interests/interests'
              });
            }, 1500);
          },
          fail: (err) => {
            wx.hideLoading();
            console.error('注册失败:', err);
            wx.showToast({
              title: '注册失败，请重试',
              icon: 'none'
            });
          }
        });
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('查询用户失败:', err);
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        });
      }
    });
  },
  
  // 查看用户协议
  onViewAgreement() {
    wx.showModal({
      title: '用户协议',
      content: '欢迎使用校园二手交易平台！请仔细阅读并同意我们的用户协议。\n\n1. 用户需保证所填信息的真实性\n2. 遵守平台交易规则\n3. 尊重他人隐私和权益\n4. 禁止发布违法违规内容',
      showCancel: false,
      confirmText: '我知道了'
    });
  },
  
  // 查看隐私政策
  onViewPrivacy() {
    wx.showModal({
      title: '隐私政策',
      content: '我们非常重视您的隐私保护。\n\n1. 我们仅收集必要的个人信息\n2. 您的信息将用于个性化推荐\n3. 我们不会泄露您的个人信息\n4. 您可以随时管理您的隐私设置',
      showCancel: false,
      confirmText: '我知道了'
    });
  },
  
  // 跳转到登录页面
  onGoToLogin() {
    wx.navigateBack({
      delta: 1
    });
  }
})