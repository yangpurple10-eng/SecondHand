// pages/favorites/favorites.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    favorites: [],
    loading: false,
    isEmpty: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 清除可能缓存的旧openid，确保使用登录的用户ID获取正确的openid
    const userInfo = wx.getStorageSync('userInfo') || {};
    if (userInfo._id) {
      // 如果有登录的用户ID，清除旧的openid缓存，强制重新获取
      wx.removeStorageSync('openid');
    }
    this.loadFavorites();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 清除可能缓存的旧openid，确保使用登录的用户ID获取正确的openid
    const userInfo = wx.getStorageSync('userInfo') || {};
    if (userInfo._id) {
      // 如果有登录的用户ID，清除旧的openid缓存，强制重新获取
      wx.removeStorageSync('openid');
    }
    this.loadFavorites();
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
   * 加载收藏列表
   */
  async loadFavorites() {
    this.setData({
      loading: true,
      isEmpty: false
    });

    try {
      const db = wx.cloud.database();
      let openid = null;
      
      // 优先使用登录时保存的用户ID来获取openid
      const userInfo = wx.getStorageSync('userInfo') || {};
      const loggedInUserId = userInfo._id;
      
      if (loggedInUserId) {
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
      }
      
      // 如果无法通过用户ID获取openid，尝试从缓存获取
      if (!openid) {
        openid = await this.ensureOpenId();
      }

      if (!openid) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        this.setData({
          loading: false,
          isEmpty: true,
          favorites: []
        });
        return;
      }

      // 查询收藏列表（优先按用户ID，其次按openid）
      let result;
      try {
        if (loggedInUserId) {
          result = await db.collection('T_favorites')
            .where({ userId: loggedInUserId })
            .orderBy('createTime', 'desc')
            .get();
        } else {
          result = await db.collection('T_favorites')
            .where({ _openid: openid })
            .orderBy('createTime', 'desc')
            .get();
        }
      } catch (collectionErr) {
        // 如果集合不存在，显示空列表而不是错误
        console.warn('收藏集合不存在或查询失败:', collectionErr);
        if (collectionErr.errMsg && collectionErr.errMsg.includes('not exist')) {
          // 集合不存在，显示空列表
          this.setData({
            favorites: [],
            loading: false,
            isEmpty: true
          });
          return;
        }
        // 其他错误，重新抛出
        throw collectionErr;
      }

      if (result && result.data && result.data.length > 0) {
        // 获取收藏的商品ID列表（过滤掉空值）
        const productIds = result.data
          .map(item => item.productId)
          .filter(id => id && id.trim && id.trim() !== '');
        
        let favorites = [];
        
        // 只有当有有效的商品ID时才查询商品详情
        if (productIds.length > 0) {
          try {
            // 查询商品详情
            let productsResult;
            try {
              productsResult = await db.collection('T_product')
                .where({
                  _id: db.command.in(productIds)
                })
                .get();
            } catch (productQueryErr) {
              // 如果商品查询失败，使用收藏记录中的信息
              console.warn('查询商品详情失败:', productQueryErr);
              productsResult = { data: [] };
            }

            // 将收藏信息与商品信息合并
            favorites = result.data.map(favorite => {
              // 如果收藏记录中的productId无效，直接返回null
              if (!favorite.productId || (favorite.productId.trim && favorite.productId.trim() === '')) {
                return null;
              }
              
              const product = productsResult.data && productsResult.data.find(p => p._id === favorite.productId);
              
              // 如果商品不存在，返回null（会被过滤掉）
              if (!product) {
                return null;
              }
              
              // 处理商品图片
              let productImage = 'https://via.placeholder.com/600x400/cccccc/ffffff?text=Product';
              if (product.productImage) {
                if (Array.isArray(product.productImage) && product.productImage.length > 0) {
                  productImage = product.productImage[0];
                } else if (typeof product.productImage === 'string') {
                  productImage = product.productImage;
                }
              }
              
              return {
                _id: favorite._id,
                productId: favorite.productId,
                product: {
                  id: product._id,
                  name: product.productName || '商品名称',
                  price: product.salePrice || product.suggestedPrice || product.originalPrice || 0,
                  image: productImage,
                  category: product.productCategory || '其他',
                  status: product.status || '在售'
                }
              };
            }).filter(item => item !== null); // 过滤掉null值
          } catch (productErr) {
            console.error('查询商品详情失败:', productErr);
            // 如果查询商品失败，使用收藏记录中的信息（如果有）
            favorites = result.data.map(favorite => {
              if (!favorite.productId) {
                return null;
              }
              
              return {
                _id: favorite._id,
                productId: favorite.productId,
                product: {
                  id: favorite.productId,
                  name: favorite.productName || '商品名称',
                  price: favorite.productPrice || 0,
                  image: favorite.productImage || 'https://via.placeholder.com/600x400/cccccc/ffffff?text=Product',
                  category: favorite.productCategory || '其他',
                  status: '未知'
                }
              };
            }).filter(item => item !== null);
          }
        } else {
          // 如果没有有效的商品ID，显示空列表
          favorites = [];
        }

        this.setData({
          favorites: favorites,
          loading: false,
          isEmpty: favorites.length === 0
        });
      } else {
        this.setData({
          favorites: [],
          loading: false,
          isEmpty: true
        });
      }
    } catch (err) {
      console.error('加载收藏列表失败:', err);
      console.error('错误详情:', JSON.stringify(err, null, 2));
      
      // 如果错误是集合不存在，静默处理，显示空列表
      if (err.errMsg && (err.errMsg.includes('not exist') || err.errMsg.includes('Db or Table not exist'))) {
        console.log('收藏集合不存在，显示空列表');
        this.setData({
          loading: false,
          isEmpty: true,
          favorites: []
        });
        return;
      }
      
      let errorMsg = '加载失败';
      if (err.errMsg) {
        if (err.errMsg.includes('network') || err.errMsg.includes('Failed to fetch')) {
          errorMsg = '网络连接失败';
        } else if (err.errMsg.includes('permission')) {
          errorMsg = '权限不足';
        } else {
          // 不显示详细错误信息给用户
          errorMsg = '加载失败，请稍后重试';
        }
      }
      
      // 对于非集合不存在的错误，显示提示
      wx.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 2000
      });
      
      this.setData({
        loading: false,
        isEmpty: true,
        favorites: []
      });
    }
  },

  /**
   * 查看商品详情
   */
  onProductTap(e) {
    const productId = e.currentTarget.dataset.id;
    if (productId) {
      wx.navigateTo({
        url: `/pages/product-detail/product-detail?id=${productId}`,
        fail: (err) => {
          console.error('跳转失败:', err);
          wx.showToast({
            title: '商品不存在',
            icon: 'none'
          });
        }
      });
    } else {
      wx.showToast({
        title: '商品ID无效',
        icon: 'none'
      });
    }
  },

  /**
   * 取消收藏
   */
  async onRemoveFavorite(e) {
    const favoriteId = e.currentTarget.dataset.id;
    const productName = e.currentTarget.dataset.name || '该商品';

    if (!favoriteId) {
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '取消收藏',
      content: `确定要取消收藏"${productName}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database();
            await db.collection('T_favorites').doc(favoriteId).remove();

            try {
              const reco = require('../../utils/recommendation.js');
              const item = (this.data.favorites || []).find(x => x._id === favoriteId);
              const product = item && item.product ? item.product : { name: productName, category: item && item.product ? item.product.category : '其他' };
              reco.recordUnfavorite(product);
            } catch (e) {}

            wx.showToast({
              title: '已取消收藏',
              icon: 'success'
            });

            // 重新加载收藏列表
            await this.loadFavorites();
          } catch (err) {
            console.error('取消收藏失败:', err);
            console.error('错误详情:', JSON.stringify(err, null, 2));
            
            let errorMsg = '操作失败';
            if (err.errMsg) {
              if (err.errMsg.includes('network') || err.errMsg.includes('Failed to fetch')) {
                errorMsg = '网络连接失败';
              } else if (err.errMsg.includes('permission')) {
                errorMsg = '权限不足';
              } else {
                errorMsg = '操作失败：' + err.errMsg;
              }
            }
            
            wx.showToast({
              title: errorMsg,
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
  async onPullDownRefresh() {
    await this.loadFavorites();
    wx.stopPullDownRefresh();
  }
});

