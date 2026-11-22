// pages/forum-detail/forum-detail.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    postId: '',
    post: null,
    comments: [],
    inputText: '',
    loading: true,
    isLiked: false,
    categories: [
      { label: '学习交流', value: 'study' },
      { label: '生活分享', value: 'life' },
      { label: '二手交易', value: 'trade' },
      { label: '校园活动', value: 'activity' },
      { label: '求助问答', value: 'help' },
      { label: '其他', value: 'other' }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    const postId = options.id;
    if (!postId) {
      wx.showToast({
        title: '帖子不存在',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }

    this.setData({
      postId: postId
    });

    this.loadPostDetail();
    this.loadComments();
    this.checkLikeStatus();
    this.increaseViewCount();
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
   * 加载帖子详情
   */
  async loadPostDetail() {
    try {
      const db = wx.cloud.database();
      const result = await db.collection('T_forum_post').doc(this.data.postId).get();
      
      if (!result.data) {
        throw new Error('帖子不存在');
      }

      const post = result.data;

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

      this.setData({
        post: {
          ...post,
          authorInfo: authorInfo,
          timeText: timeText,
          categoryText: categoryText,
          images: Array.isArray(post.images) ? post.images : (post.images ? [post.images] : [])
        },
        loading: false
      });
    } catch (err) {
      console.error('加载帖子详情失败:', err);
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
   * 加载评论列表
   */
  async loadComments() {
    try {
      const db = wx.cloud.database();
      const result = await db.collection('T_forum_comment')
        .where({
          postId: this.data.postId
        })
        .orderBy('createTime', 'asc')
        .get();

      // 获取评论作者信息
      const comments = await Promise.all(result.data.map(async (comment) => {
        let authorInfo = {
          name: '匿名用户',
          avatar: 'https://via.placeholder.com/80x80/cccccc/ffffff?text=U'
        };

        if (comment.authorOpenId) {
          try {
            const userResult = await db.collection('T_user')
              .where({
                _openid: comment.authorOpenId
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
            console.error('获取评论作者信息失败:', err);
          }
        }

        return {
          ...comment,
          authorInfo: authorInfo,
          timeText: this.formatTime(comment.createTime)
        };
      }));

      this.setData({
        comments: comments
      });
    } catch (err) {
      console.error('加载评论失败:', err);
      // 如果集合不存在，创建空列表
      if (err.errMsg && (err.errMsg.includes('not exist') || err.errMsg.includes('not exists') || err.errCode === -502005)) {
        this.setData({
          comments: []
        });
      }
    }
  },

  /**
   * 检查点赞状态
   */
  async checkLikeStatus() {
    try {
      const openid = await this.ensureOpenId();
      if (!openid) return;

      const db = wx.cloud.database();
      try {
        const result = await db.collection('T_forum_like')
          .where({
            _openid: openid,
            postId: this.data.postId
          })
          .get();

        this.setData({
          isLiked: result.data && result.data.length > 0
        });
      } catch (err) {
        // 如果集合不存在，默认为未点赞
        if (err.errMsg && (err.errMsg.includes('not exist') || err.errMsg.includes('not exists') || err.errCode === -502005)) {
          this.setData({
            isLiked: false
          });
        }
      }
    } catch (err) {
      console.error('检查点赞状态失败:', err);
    }
  },

  /**
   * 增加浏览量
   */
  async increaseViewCount() {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      await db.collection('T_forum_post').doc(this.data.postId).update({
        data: {
          viewCount: _.inc(1),
          updateTime: new Date()
        }
      });
    } catch (err) {
      console.error('增加浏览量失败:', err);
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
   * 输入框内容变化
   */
  onInputChange(e) {
    this.setData({
      inputText: e.detail.value
    });
  },

  /**
   * 提交评论
   */
  async onSubmitComment() {
    const content = this.data.inputText.trim();
    if (!content) {
      return;
    }

    const openid = await this.ensureOpenId();
    if (!openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 添加评论
      await db.collection('T_forum_comment').add({
        data: {
          postId: this.data.postId,
          authorOpenId: openid,
          content: content,
          createTime: new Date()
        }
      });

      // 更新帖子评论数
      await db.collection('T_forum_post').doc(this.data.postId).update({
        data: {
          commentCount: _.inc(1),
          updateTime: new Date()
        }
      });

      // 清空输入框
      this.setData({
        inputText: ''
      });

      // 重新加载评论和帖子
      this.loadComments();
      this.loadPostDetail();
    } catch (err) {
      console.error('提交评论失败:', err);
      
      // 如果集合不存在，尝试创建
      if (err.errMsg && (err.errMsg.includes('not exist') || err.errMsg.includes('not exists') || err.errCode === -502005)) {
        try {
          await wx.cloud.callFunction({
            name: 'quickstartFunctions',
            data: {
              type: 'createForumCollection'
            }
          });
          
          // 重新尝试提交
          const db = wx.cloud.database();
          const _ = db.command;
          await db.collection('T_forum_comment').add({
            data: {
              postId: this.data.postId,
              authorOpenId: openid,
              content: content,
              createTime: new Date()
            }
          });

          await db.collection('T_forum_post').doc(this.data.postId).update({
            data: {
              commentCount: _.inc(1),
              updateTime: new Date()
            }
          });

          this.setData({
            inputText: ''
          });

          this.loadComments();
          this.loadPostDetail();
        } catch (createErr) {
          console.error('创建集合失败:', createErr);
          wx.showToast({
            title: '评论失败',
            icon: 'none'
          });
        }
      } else {
        wx.showToast({
          title: '评论失败',
          icon: 'none'
        });
      }
    }
  },

  /**
   * 点赞/取消点赞
   */
  async onToggleLike() {
    const openid = await this.ensureOpenId();
    if (!openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      if (this.data.isLiked) {
        // 取消点赞
        try {
          const likeResult = await db.collection('T_forum_like')
            .where({
              _openid: openid,
              postId: this.data.postId
            })
            .get();

          if (likeResult.data && likeResult.data.length > 0) {
            await db.collection('T_forum_like').doc(likeResult.data[0]._id).remove();
          }
        } catch (err) {
          // 如果集合不存在，忽略错误
          if (!err.errMsg || (!err.errMsg.includes('not exist') && !err.errMsg.includes('not exists') && err.errCode !== -502005)) {
            throw err;
          }
        }

        await db.collection('T_forum_post').doc(this.data.postId).update({
          data: {
            likeCount: _.inc(-1),
            updateTime: new Date()
          }
        });

        this.setData({
          isLiked: false
        });
      } else {
        // 点赞
        try {
          await db.collection('T_forum_like').add({
            data: {
              postId: this.data.postId,
              authorOpenId: openid,
              createTime: new Date()
            }
          });
        } catch (err) {
          // 如果集合不存在，尝试创建
          if (err.errMsg && (err.errMsg.includes('not exist') || err.errMsg.includes('not exists') || err.errCode === -502005)) {
            await wx.cloud.callFunction({
              name: 'quickstartFunctions',
              data: {
                type: 'createForumCollection'
              }
            });
            
            // 重新尝试点赞
            await db.collection('T_forum_like').add({
              data: {
                postId: this.data.postId,
                authorOpenId: openid,
                createTime: new Date()
              }
            });
          } else {
            throw err;
          }
        }

        await db.collection('T_forum_post').doc(this.data.postId).update({
          data: {
            likeCount: _.inc(1),
            updateTime: new Date()
          }
        });

        this.setData({
          isLiked: true
        });
      }

      // 重新加载帖子
      this.loadPostDetail();
    } catch (err) {
      console.error('点赞操作失败:', err);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
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
  }
});

