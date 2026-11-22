// pages/forum/forum.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 当前分类
    currentCategory: 'all',
    // 分类列表
    categories: [
      { label: '全部', value: 'all' },
      { label: '学习交流', value: 'study' },
      { label: '生活分享', value: 'life' },
      { label: '二手交易', value: 'trade' },
      { label: '校园活动', value: 'activity' },
      { label: '求助问答', value: 'help' },
      { label: '其他', value: 'other' }
    ],
    // 帖子列表
    posts: [],
    // 分页
    page: 0,
    pageSize: 10,
    hasMore: true,
    // 加载状态
    loading: true,
    refreshing: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadPosts();
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
   * 加载帖子列表
   */
  async loadPosts(refresh = false) {
    if (refresh) {
      this.setData({
        page: 0,
        posts: [],
        hasMore: true
      });
    }

    if (!this.data.hasMore && !refresh) {
      return;
    }

    this.setData({
      loading: true
    });

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 构建查询条件
      let queryCondition = {};
      
      // 根据分类筛选
      if (this.data.currentCategory !== 'all') {
        queryCondition.category = this.data.currentCategory;
      }

      // 查询帖子
      const result = await db.collection('T_forum_post')
        .where(queryCondition)
        .orderBy('createTime', 'desc')
        .skip(this.data.page * this.data.pageSize)
        .limit(this.data.pageSize)
        .get();

      // 获取作者信息和格式化数据
      const posts = await Promise.all(result.data.map(async (post) => {
        // 获取作者信息
        let authorInfo = {
          name: '匿名用户',
          avatar: 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U'
        };

        if (post.authorOpenId) {
          try {
            const userResult = await db.collection('T_user')
              .where({
                _openid: post.authorOpenId
              })
              .get();
            
            if (userResult.data && userResult.data.length > 0) {
              const user = userResult.data[0];
              authorInfo = {
                name: user.sname || user.nickName || '用户',
                avatar: user.avatar || 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U'
              };
            }
          } catch (err) {
            console.error('获取作者信息失败:', err);
          }
        }

        // 格式化时间
        const timeText = this.formatTime(post.createTime);

        // 获取分类文本
        const categoryItem = this.data.categories.find(cat => cat.value === post.category);
        const categoryText = categoryItem ? categoryItem.label : '其他';

        return {
          ...post,
          authorInfo: authorInfo,
          timeText: timeText,
          categoryText: categoryText,
          images: Array.isArray(post.images) ? post.images : (post.images ? [post.images] : []),
          viewCount: post.viewCount || 0,
          commentCount: post.commentCount || 0,
          likeCount: post.likeCount || 0
        };
      }));

      this.setData({
        posts: refresh ? posts : [...this.data.posts, ...posts],
        page: this.data.page + 1,
        hasMore: result.data.length === this.data.pageSize,
        loading: false,
        refreshing: false
      });
    } catch (err) {
      console.error('加载帖子失败:', err);
      
      // 如果集合不存在，创建空列表
      if (err.errMsg && (err.errMsg.includes('not exist') || err.errMsg.includes('not exists') || err.errCode === -502005)) {
        this.setData({
          posts: [],
          loading: false,
          refreshing: false,
          hasMore: false
        });
      } else {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
        this.setData({
          loading: false,
          refreshing: false
        });
      }
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
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    }
  },

  /**
   * 分类切换
   */
  onCategoryChange(e) {
    const category = e.currentTarget.dataset.category;
    if (category === this.data.currentCategory) {
      return;
    }

    this.setData({
      currentCategory: category
    });

    this.loadPosts(true);
  },

  /**
   * 下拉刷新
   */
  onRefresh() {
    this.setData({
      refreshing: true
    });
    this.loadPosts(true);
  },

  /**
   * 加载更多
   */
  onLoadMore() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadPosts();
    }
  },

  /**
   * 点击帖子
   */
  onPostTap(e) {
    const postId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/forum-detail/forum-detail?id=${postId}`
    });
  },

  /**
   * 搜索
   */
  onSearchTap() {
    wx.navigateTo({
      url: '/pages/forum-search/forum-search'
    });
  },

  /**
   * 发布帖子
   */
  onPublishTap() {
    wx.navigateTo({
      url: '/pages/forum-publish/forum-publish'
    });
  },

  /**
   * 预览图片
   */
  onPreviewImage(e) {
    const urls = e.currentTarget.dataset.urls;
    const current = e.currentTarget.dataset.current;
    
    wx.previewImage({
      urls: urls,
      current: current
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 如果从发布页面返回，刷新列表
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (prevPage && prevPage.route === 'pages/forum-publish/forum-publish') {
      this.loadPosts(true);
    }
  }
});

