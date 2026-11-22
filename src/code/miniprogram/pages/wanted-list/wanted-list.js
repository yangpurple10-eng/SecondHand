// pages/wanted-list/wanted-list.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    wantedList: [],
    searchText: '',
    loading: false,
    refreshing: false,
    hasMore: true,
    pageSize: 20,
    currentPage: 0,
    selectedWantedId: null, // 用于详情页
    filterMy: false // 是否只显示我的求购
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    console.log('求购列表页面加载', options);
    
    // 判断是否只显示我的求购
    const filterMy = options.filter === 'my';
    this.setData({
      filterMy: filterMy
    });
    
    // 如果传入了id，说明是从热门求购点击进入的，先加载该条目的详情
    if (options.id) {
      this.setData({
        selectedWantedId: options.id
      });
    }
    
    // 清除可能缓存的旧openid，确保使用登录的用户ID获取正确的openid
    const userInfo = wx.getStorageSync('userInfo') || {};
    if (userInfo._id) {
      // 如果有登录的用户ID，清除旧的openid缓存，强制重新获取
      wx.removeStorageSync('openid');
    }
    
    // 如果带有搜索关键词，预填并优先按关键词加载
    if (options && options.q) {
      try {
        const keyword = decodeURIComponent(options.q);
        this.setData({ searchText: keyword });
      } catch (e) {
        this.setData({ searchText: options.q });
      }
    }
    await this.loadWantedList();
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
   * 搜索输入
   */
  onSearchInput(e) {
    this.setData({
      searchText: e.detail.value
    });
  },

  /**
   * 搜索确认
   */
  onSearch() {
    this.setData({
      currentPage: 0,
      wantedList: [],
      hasMore: true
    });
    this.loadWantedList();
  },

  /**
   * 加载求购列表
   */
  async loadWantedList() {
    if (this.data.loading) return;
    
    this.setData({
      loading: true
    });
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 构建查询条件
      let queryCondition = {
        status: 'active'
      };
      
      // 如果只显示我的求购，优先使用userId字段筛选（最准确）
      if (this.data.filterMy) {
        const userInfo = wx.getStorageSync('userInfo') || {};
        const loggedInUserId = userInfo._id;
        
        if (loggedInUserId) {
          // 优先使用userId字段查询（最准确）
          queryCondition.userId = loggedInUserId;
          console.log('使用userId查询求购:', loggedInUserId);
        } else {
          // 如果没有登录的用户ID，使用_openid（向后兼容）
          let openid = null;
          
          try {
            // 使用登录的用户ID查询用户信息，获取其_openid
            const userResult = await db.collection('T_user')
              .doc(loggedInUserId)
              .get();
            
            if (userResult.data && userResult.data._openid) {
              openid = userResult.data._openid;
            }
          } catch (err) {
            console.error('通过用户ID获取openid失败:', err);
          }
          
          // 如果无法通过用户ID获取openid，尝试从缓存获取
          if (!openid) {
            openid = await this.ensureOpenId();
          }
          
          if (openid) {
            queryCondition._openid = openid;
          } else {
            // 如果没有openid，清空列表
            this.setData({
              wantedList: [],
              loading: false,
              refreshing: false,
              hasMore: false
            });
            wx.showToast({
              title: '请先登录',
              icon: 'none'
            });
            return;
          }
        }
      }
      
      let query = db.collection('T_want').where(queryCondition);
      
      // 如果有搜索关键词，获取更多数据以便筛选；否则正常分页
      const limit = this.data.searchText.trim() ? 100 : (this.data.pageSize * 2);
      const skip = this.data.searchText.trim() ? 0 : (this.data.currentPage * this.data.pageSize);
      
      // 查询数据，按点击量降序排序（微信云数据库不支持多个orderBy）
      const result = await query
        .orderBy('viewCount', 'desc')
        .skip(skip)
        .limit(limit)
        .get();
      
      console.log('求购列表查询结果:', result);
      
      if (result.data && result.data.length > 0) {
        // 如果有搜索关键词，先进行筛选
        let filteredData = result.data;
        if (this.data.searchText.trim()) {
          const searchText = this.data.searchText.trim().toLowerCase();
          filteredData = result.data.filter(item => {
            const name = (item.productName || '').toLowerCase();
            const desc = (item.description || '').toLowerCase();
            const category = (item.productCategory || '').toLowerCase();
            return name.includes(searchText) || desc.includes(searchText) || category.includes(searchText);
          });
        }
        
        // 在客户端进行排序：先按点击量降序，点击量相同则按时间降序（时间更晚的在前）
        const sortedData = filteredData.sort((a, b) => {
          const viewCountA = a.viewCount || 0;
          const viewCountB = b.viewCount || 0;
          
          // 如果点击量不同，按点击量降序
          if (viewCountA !== viewCountB) {
            return viewCountB - viewCountA;
          }
          
          // 点击量相同，按时间降序（时间更晚的在前）
          const timeA = new Date(a.createTime).getTime();
          const timeB = new Date(b.createTime).getTime();
          return timeB - timeA;
        });
        
        // 限制返回数量
        const limitedData = sortedData.slice(0, this.data.pageSize);
        
        const wantedList = limitedData.map(item => ({
          ...item,
          formattedTime: this.formatTime(item.createTime)
        }));
        
        // 判断是否还有更多数据
        // 如果有搜索关键词，不显示"加载更多"（因为已经获取了所有数据）
        // 如果没有搜索关键词，判断是否还有更多数据
        const hasMoreData = !this.data.searchText.trim() && result.data.length === limit;
        
        // 如果有搜索关键词，只显示筛选后的数据；否则追加数据
        const finalList = this.data.searchText.trim() 
          ? wantedList 
          : (this.data.currentPage === 0 ? wantedList : [...this.data.wantedList, ...wantedList]);
        
        this.setData({
          wantedList: finalList,
          hasMore: hasMoreData && limitedData.length > 0,
          loading: false,
          refreshing: false
        });
        
        // 如果传入了id，滚动到对应位置
        if (this.data.selectedWantedId) {
          wx.nextTick(() => {
            const index = this.data.wantedList.findIndex(item => item._id === this.data.selectedWantedId);
            if (index >= 0) {
              // 可以添加滚动到指定位置的逻辑
            }
          });
        }
      } else {
        this.setData({
          hasMore: false,
          loading: false,
          refreshing: false
        });
        
        if (this.data.currentPage === 0) {
          this.setData({
            wantedList: []
          });
        }
      }
    } catch (err) {
      console.error('加载求购列表失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({
        loading: false,
        refreshing: false
      });
    }
  },

  /**
   * 格式化时间
   */
  formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    
    if (diff < minute) {
      return '刚刚';
    } else if (diff < hour) {
      return Math.floor(diff / minute) + '分钟前';
    } else if (diff < day) {
      return Math.floor(diff / hour) + '小时前';
    } else if (diff < 7 * day) {
      return Math.floor(diff / day) + '天前';
    } else {
      return d.getMonth() + 1 + '月' + d.getDate() + '日';
    }
  },

  /**
   * 求购点击事件（增加点击量并显示详情）
   */
  async onWantedTap(e) {
    const wantedId = e.currentTarget.dataset.id;
    
    // 增加点击量
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      await db.collection('T_want').doc(wantedId).update({
        data: {
          viewCount: _.inc(1),
          updateTime: new Date()
        }
      });
      
      // 更新本地列表中的点击量
      const updatedList = this.data.wantedList.map(item => {
        if (item._id === wantedId) {
          return {
            ...item,
            viewCount: (item.viewCount || 0) + 1
          };
        }
        return item;
      });
      
      this.setData({
        wantedList: updatedList
      });
    } catch (err) {
      console.error('更新点击量失败:', err);
    }
    
    // 显示求购详情
    const wanted = this.data.wantedList.find(w => w._id === wantedId);
    if (wanted) {
      this.showWantedDetail(wanted);
    }
  },

  /**
   * 显示求购详情
   */
  showWantedDetail(wanted) {
    let detailContent = `商品名称：${wanted.productName}\n`;
    detailContent += `商品类别：${wanted.productCategory || '其他'}\n`;
    if (wanted.description) {
      detailContent += `求购描述：${wanted.description}\n`;
    }
    detailContent += `预算价格：¥${wanted.expectedPrice || 0}\n`;
    if (wanted.conditionLevel) {
      detailContent += `成色要求：${wanted.conditionLevel}\n`;
    }
    if (wanted.expectedBrand) {
      detailContent += `期望品牌：${wanted.expectedBrand}\n`;
    }
    if (wanted.expectedModel) {
      detailContent += `期望型号：${wanted.expectedModel}\n`;
    }
    if (wanted.validityPeriod) {
      detailContent += `有效期：${wanted.validityPeriod}\n`;
    }
    detailContent += `联系人：${wanted.contactName}\n`;
    detailContent += `联系方式：${wanted.contactPhone}\n`;
    if (wanted.contactWechat) {
      detailContent += `微信号：${wanted.contactWechat}\n`;
    }
    detailContent += `交易方式：${wanted.transactionMethod || '面交'}\n`;
    detailContent += `浏览量：${wanted.viewCount || 0}`;
    
    wx.showModal({
      title: '求购详情',
      content: detailContent,
      showCancel: true,
      confirmText: '联系TA',
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm) {
          const toUserId = wanted.userId || '';
          const toOpenId = wanted._openid || '';
          const toName = wanted.contactName || '求购用户';
          if (toUserId || toOpenId) {
            wx.navigateTo({
              url: `/pages/chat/chat?toUserId=${toUserId}&toOpenId=${toOpenId}&toName=${encodeURIComponent(toName)}`
            });
          } else {
            wx.showToast({
              title: '无法获取联系人信息',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 下拉刷新
   */
  onRefresh() {
    this.setData({
      currentPage: 0,
      wantedList: [],
      hasMore: true,
      refreshing: true
    });
    this.loadWantedList();
  },

  /**
   * 加载更多
   */
  onLoadMore() {
    if (!this.data.hasMore || this.data.loading) return;
    
    this.setData({
      currentPage: this.data.currentPage + 1
    });
    this.loadWantedList();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 如果从其他页面返回，刷新列表
    // 清除可能缓存的旧openid，确保使用登录的用户ID获取正确的openid
    const userInfo = wx.getStorageSync('userInfo') || {};
    if (userInfo._id) {
      // 如果有登录的用户ID，清除旧的openid缓存，强制重新获取
      wx.removeStorageSync('openid');
    }
    
    if (this.data.wantedList.length > 0 || this.data.filterMy) {
      this.setData({
        currentPage: 0,
        wantedList: [],
        hasMore: true
      });
      this.loadWantedList();
    }
  }
})

