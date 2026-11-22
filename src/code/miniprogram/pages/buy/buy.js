// pages/buy/buy.js
const reco = require('../../utils/recommendation.js');
Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 搜索相关
    searchKeyword: '',
    
    // 筛选条件
    categories: ['全部分类', '电子产品', '图书文具', '服装鞋帽', '运动户外', '美妆个护', '家居生活', '其他'],
    selectedCategory: 0,
    categoryNavItems: [
      { id: 0, name: '全部' },
      { id: 1, name: '电子产品' },
      { id: 2, name: '图书文具' },
      { id: 3, name: '服装鞋帽' },
      { id: 4, name: '运动户外' },
      { id: 5, name: '美妆个护' },
      { id: 6, name: '家居生活' },
      { id: 7, name: '其他' }
    ],
    selectedCategoryIndex: 0,
    
    priceRanges: ['价格范围', '0-50元', '50-100元', '100-200元', '200-500元', '500元以上'],
    selectedPriceRange: 0,
    
    sortOptions: ['最新发布', '价格从低到高', '价格从高到低', '评分最高'],
    selectedSort: 0,
    
    // 商品列表
    products: [],
    filteredProducts: [],
    
    // 分页相关
    currentPage: 1,
    pageSize: 10,
    hasMore: true,
    
    // 页面状态
    refreshing: false,
    loading: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    if (options && options.q) {
      try {
        const keyword = decodeURIComponent(options.q);
        this.setData({
          searchKeyword: keyword
        });
      } catch (e) {
        // 保底：直接使用传入值
        this.setData({
          searchKeyword: options.q
        });
      }
    }
    this.loadProducts();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 页面显示时刷新数据，确保显示最新发布的商品
    this.loadProducts(true);
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.onRefresh();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    this.loadMore();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '校园二手交易 - 发现好物',
      path: '/pages/buy/buy'
    }
  },

  /**
   * 搜索输入事件
   */
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
    // 实时搜索，不需要点击搜索按钮
    this.filterProducts();
  },

  /**
   * 搜索按钮点击事件
   */
  onSearch() {
    // 若存在关键词，则刷新并按关键词从后端查询；否则仅本地筛选
    const kw = (this.data.searchKeyword || '').trim();
    if (kw) {
      try {
        const reco = require('../../utils/recommendation.js');
        reco.recordSearch(kw, 'product');
      } catch (e) {}
      this.loadProducts(true);
    } else {
      this.filterProducts();
    }
  },

  /**
   * 清空搜索
   */
  onClearSearch() {
    this.setData({
      searchKeyword: ''
    });
    this.filterProducts();
  },

  /**
   * 分类导航点击事件
   */
  onCategoryNavTap(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    this.setData({
      selectedCategoryIndex: index,
      selectedCategory: index
    });
    this.filterProducts();
  },

  /**
   * 分类选择事件
   */
  onCategoryChange(e) {
    const index = e.detail.value;
    this.setData({
      selectedCategory: index,
      selectedCategoryIndex: index
    });
    this.filterProducts();
  },

  /**
   * 价格范围选择事件
   */
  onPriceRangeChange(e) {
    this.setData({
      selectedPriceRange: e.detail.value
    });
    this.filterProducts();
  },

  /**
   * 排序方式选择事件
   */
  onSortChange() {
    wx.showActionSheet({
      itemList: this.data.sortOptions,
      success: (res) => {
        this.setData({
          selectedSort: res.tapIndex
        });
        this.sortProducts();
      }
    });
  },

  /**
   * 商品点击事件
   */
  onProductTap(e) {
    const product = e.currentTarget.dataset.product;
    try { reco.recordClick(product); } catch (e) {}
    wx.navigateTo({
      url: `/pages/product-detail/product-detail?id=${product.id}`
    });
  },

  /**
   * 下拉刷新
   */
  onRefresh() {
    this.setData({
      refreshing: true,
      currentPage: 1,
      hasMore: true
    });
    
    // 重新加载数据
      this.loadProducts(true);
      this.setData({
        refreshing: false
      });
      wx.stopPullDownRefresh();
  },

  /**
   * 加载更多
   */
  loadMore() {
    if (this.data.loading || !this.data.hasMore) {
      return;
    }
    
    // 进入加载状态，并推进到下一页，改为真实数据库分页查询
    const nextPage = this.data.currentPage + 1;
    this.setData({
      loading: true,
      currentPage: nextPage
    });
    
    // 加载下一页商品
    this.loadProducts(false);
  },

  /**
   * 加载商品数据
   */
  loadProducts(refresh = false) {
    const db = wx.cloud.database();
    const { currentPage, pageSize, selectedCategory, categories, searchKeyword } = this.data;
    const _ = db.command;

    // 如果是刷新，重置页码
    const page = refresh ? 1 : currentPage;

    this.setData({
      loading: true
    });
    
    // 构建查询条件
    let query = db.collection('T_product').where({
      status: '在售'  // 只显示在售商品
    });

    // 分类筛选
    if (selectedCategory > 0 && categories[selectedCategory]) {
      const category = categories[selectedCategory];
      query = query.where({
        productCategory: category
      });
    }

    // 关键词搜索（商品名称或描述匹配，忽略大小写）
    const kw = (searchKeyword || '').trim();
    if (kw) {
      const re = db.RegExp({ regexp: kw, options: 'i' });
      query = query.where(
        _.or([
          { productName: re },
          { productDescription: re }
        ])
      );
    }

    // 分页查询
    query = query
      .orderBy('createTime', 'desc')  // 按创建时间倒序
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    query.get({
      success: (res) => {
        console.log('查询商品成功:', res);

        if (res.data && res.data.length > 0) {
          // 处理商品数据
          this.processProducts(res.data).then((processedProducts) => {
            // 合并分页结果并按 id 去重，避免 wx:key 重复
            const merged = refresh ? processedProducts : [...this.data.products, ...processedProducts];
            const seen = new Set();
            const products = [];
            for (const p of merged) {
              const key = p.id || p._id || p._originalData?._id;
              if (!key) continue;
              if (seen.has(key)) continue;
              seen.add(key);
              products.push(p);
            }

      this.setData({
        products: products,
        filteredProducts: products,
              currentPage: page,
              hasMore: res.data.length === pageSize,
              loading: false
            });

            // 应用筛选和排序
            this.filterProducts();
          });
        } else {
          // 没有数据
          this.setData({
            hasMore: false,
            loading: false
          });
          if (refresh) {
            this.setData({
              products: [],
              filteredProducts: []
            });
          }
        }
      },
      fail: (err) => {
        console.error('查询商品失败:', err);
        wx.showToast({
          title: '加载失败，请重试',
          icon: 'none',
          duration: 2000
        });
        this.setData({
        loading: false
      });
      }
    });
  },

  /**
   * 筛选商品
   */
  filterProducts() {
    let filtered = this.data.products;
    
    // 关键词搜索
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase();
      filtered = filtered.filter(product => 
        product.name.toLowerCase().includes(keyword) ||
        product.description.toLowerCase().includes(keyword) ||
        product.category.includes(keyword)
      );
    }
    
    // 分类筛选
    if (this.data.selectedCategory > 0) {
      const category = this.data.categories[this.data.selectedCategory];
      filtered = filtered.filter(product => product.category === category);
    }
    
    // 价格范围筛选
    if (this.data.selectedPriceRange > 0) {
      const priceRange = this.data.priceRanges[this.data.selectedPriceRange];
      filtered = filtered.filter(product => {
        const price = parseFloat(product.price);
        switch (priceRange) {
          case '0-50元': return price <= 50;
          case '50-100元': return price > 50 && price <= 100;
          case '100-200元': return price > 100 && price <= 200;
          case '200-500元': return price > 200 && price <= 500;
          case '500元以上': return price > 500;
          default: return true;
        }
      });
    }
    
    this.setData({
      filteredProducts: filtered
    });
    
    this.sortProducts();
  },

  /**
   * 处理商品数据，转换格式并获取图片URL
   */
  async processProducts(products) {
    const processedProducts = await Promise.all(products.map(async (product) => {
      // 获取图片临时URL
        let imageUrl = '/images/仓鼠.png'; // 默认本地图片，避免外网占位图超时
      if (product.productImage) {
        try {
          // 如果是云存储路径，获取临时URL
          if (product.productImage.startsWith('cloud://')) {
            const tempFileURL = await wx.cloud.getTempFileURL({
              fileList: [product.productImage]
            });
            if (tempFileURL.fileList && tempFileURL.fileList.length > 0) {
              imageUrl = tempFileURL.fileList[0].tempFileURL;
            }
          } else {
            // 如果是网络URL，直接使用
            imageUrl = product.productImage;
          }
        } catch (err) {
          console.error('获取图片URL失败:', err);
        }
      }

      // 计算折扣
      let discount = null;
      if (product.originalPrice > 0 && product.salePrice > 0) {
        discount = (product.salePrice / product.originalPrice * 10).toFixed(1);
      }

      // 格式化时间
      const publishTime = this.formatTime(product.createTime);

      // 获取卖家信息
      const sellerName = product.sellerInfo?.sname || '用户';
      const sellerAvatar = product.sellerInfo?.avatar || '/images/更多犬种.png';

      // 返回格式化后的商品数据
      return {
        id: product._id,
        name: product.productName || '未命名商品',
        description: product.productDescription || '',
        price: product.salePrice || product.suggestedPrice || 0,
        originalPrice: product.originalPrice || null,
        discount: discount,
        category: product.productCategory || '其他',
        condition: product.conditionLevel || '未知',
        location: '校园', // 可以根据需要添加location字段
        publishTime: publishTime,
        image: imageUrl,
        sellerAvatar: sellerAvatar,
        sellerName: sellerName,
        sellerRating: '4.8', // 可以根据需要添加评分系统
        status: product.status === '在售' ? 'selling' : 'sold',
        // 保留原始数据字段，方便后续使用
        _originalData: product
      };
    }));

    return processedProducts;
  },

  /**
   * 格式化时间显示
   */
  formatTime(date) {
    if (!date) return '';

    const now = new Date();
    const createTime = date instanceof Date ? date : new Date(date);
    const diff = now - createTime;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) {
      return '刚刚';
    } else if (minutes < 60) {
      return `${minutes}分钟前`;
    } else if (hours < 24) {
      return `${hours}小时前`;
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      // 超过7天，显示具体日期
      const month = createTime.getMonth() + 1;
      const day = createTime.getDate();
      return `${month}月${day}日`;
    }
  },

  /**
   * 排序商品
   */
  sortProducts() {
    let sorted = [...this.data.filteredProducts];
    
    switch (this.data.selectedSort) {
      case 0: // 最新发布
        sorted.sort((a, b) => {
          const timeA = a._originalData?.createTime || new Date(0);
          const timeB = b._originalData?.createTime || new Date(0);
          return new Date(timeB) - new Date(timeA);
        });
        break;
      case 1: // 价格从低到高
        sorted.sort((a, b) => parseFloat(a.price || 0) - parseFloat(b.price || 0));
        break;
      case 2: // 价格从高到低
        sorted.sort((a, b) => parseFloat(b.price || 0) - parseFloat(a.price || 0));
        break;
      case 3: // 评分最高（暂时使用固定评分）
        sorted.sort((a, b) => parseFloat(b.sellerRating || 0) - parseFloat(a.sellerRating || 0));
        break;
    }
    
    this.setData({
      filteredProducts: sorted
    });
  },

  /**
   * 生成模拟商品数据
   */
  generateMockProducts(page, pageSize) {
    if (page > 3) return []; // 模拟只有3页数据
    
    const mockProducts = [
      {
        id: 1,
        name: 'iPhone 13 Pro Max',
        description: '99新，256GB，国行在保，无划痕无磕碰',
        price: '5999',
        originalPrice: '8999',
        discount: '6.7',
        category: '电子产品',
        condition: '99新',
        location: '闵行校区',
        publishTime: '2小时前',
        image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=400&q=60',
        sellerAvatar: 'https://via.placeholder.com/100x100/CCCCCC/444444?text=U',
        sellerName: '张同学',
        sellerRating: '4.8',
        status: 'selling'
      },
      {
        id: 2,
        name: '高等数学教材',
        description: '同济大学第七版，几乎全新，有少量笔记',
        price: '25',
        category: '图书文具',
        condition: '95新',
        location: '徐汇校区',
        publishTime: '1天前',
        image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=400&q=60',
        sellerAvatar: 'https://via.placeholder.com/100x100/CCCCCC/444444?text=U',
        sellerName: '李同学',
        sellerRating: '4.9',
        status: 'selling'
      },
      {
        id: 3,
        name: 'Nike Air Force 1',
        description: '白色经典款，42码，穿过几次，保养很好',
        price: '299',
        originalPrice: '799',
        discount: '3.7',
        category: '运动户外',
        condition: '85新',
        location: '松江校区',
        publishTime: '3天前',
        image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=400&q=60',
        sellerAvatar: 'https://via.placeholder.com/100x100/CCCCCC/444444?text=U',
        sellerName: '王同学',
        sellerRating: '4.7',
        status: 'selling'
      },
      {
        id: 4,
        name: 'MacBook Pro 2021',
        description: 'M1芯片，16GB内存，512GB硬盘，性能强劲',
        price: '8999',
        originalPrice: '12999',
        discount: '6.9',
        category: '电子产品',
        condition: '98新',
        location: '闵行校区',
        publishTime: '5小时前',
        image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=400&q=60',
        sellerAvatar: 'https://via.placeholder.com/100x100/CCCCCC/444444?text=U',
        sellerName: '赵同学',
        sellerRating: '4.9',
        status: 'selling'
      },
      {
        id: 5,
        name: 'SK-II神仙水',
        description: '230ml，正品保证，还剩大半瓶，个人原因转让',
        price: '499',
        originalPrice: '1540',
        discount: '3.2',
        category: '美妆个护',
        condition: '90新',
        location: '徐汇校区',
        publishTime: '1天前',
        image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=400&q=60',
        sellerAvatar: 'https://via.placeholder.com/100x100/CCCCCC/444444?text=U',
        sellerName: '陈同学',
        sellerRating: '4.8',
        status: 'selling'
      }
    ];
    
    // 根据页码返回数据
    const startIndex = (page - 1) * pageSize;
    return mockProducts.slice(startIndex, startIndex + pageSize);
  }
})