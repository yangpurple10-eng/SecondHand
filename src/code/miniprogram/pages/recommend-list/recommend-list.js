// pages/recommend-list/recommend-list.js
const reco = require('../../utils/recommendation.js');

Page({
  data: {
    items: [],
    loading: true,
    _allSorted: [],
    _renderCount: 0,
  },

  onLoad() {
    this.loadMoreRecommendations();
  },

  async ensureOpenId() {
    let openid = wx.getStorageSync('openid');
    if (!openid) {
      try {
        const result = await wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: { type: 'getOpenId' }
        });
        if (result.result && result.result.openid) {
          openid = result.result.openid;
          wx.setStorageSync('openid', openid);
        }
      } catch (_) {}
    }
    return openid;
  },

  async resolveInterestsForRecommend() {
    const db = wx.cloud.database();
    const userInfo = wx.getStorageSync('userInfo') || {};
    const loggedInUserId = userInfo._id || '';
    let openid = null;
    if (loggedInUserId) {
      try {
        const r = await db.collection('T_user').doc(loggedInUserId).get();
        openid = r.data && r.data._openid;
      } catch (_) {}
    }
    if (!openid) {
      openid = await this.ensureOpenId();
    }
    let favRes = { data: [] };
    try {
      if (loggedInUserId) {
        favRes = await db.collection('T_favorites').where({ userId: loggedInUserId }).orderBy('createTime', 'desc').limit(300).get();
      } else if (openid) {
        favRes = await db.collection('T_favorites').where({ _openid: openid }).orderBy('createTime', 'desc').limit(300).get();
      }
    } catch (_) {}
    const counts = {};
    (favRes.data || []).forEach(f => {
      const c = f.productCategory || f.category;
      if (c) counts[c] = (counts[c] || 0) + 1;
    });
    const favTop = Object.keys(counts).sort((a,b)=> (counts[b]||0) - (counts[a]||0)).slice(0,3);
    const baseInterests = Array.isArray(userInfo.interests) ? userInfo.interests.filter(Boolean) : [];
    const interests = favTop.length > 0 ? favTop : baseInterests;
    return [...new Set(interests)].filter(Boolean);
  },

  async loadMoreRecommendations() {
    try {
      const interests = await this.resolveInterestsForRecommend();
      const db = wx.cloud.database();
      const _ = db.command;
      let where = { status: '在售' };
      if (interests.length > 0) {
        where = _.and([{ status: '在售' }, { productCategory: _.in(interests) }]);
      }

      // 分页拉取更多在售商品，再统一排序（仿淘宝更多推荐）
      const countRes = await db.collection('T_product').where(where).count();
      const total = countRes.total || 0;
      const pageSize = 100;
      const all = [];
      for (let skip = 0; skip < Math.max(total, pageSize * 2); skip += pageSize) {
        const page = await db.collection('T_product')
          .where(where)
          .orderBy('createTime', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get();
        if (page && Array.isArray(page.data)) all.push(...page.data);
        if (!page || !page.data || page.data.length < pageSize) break;
      }
      const list = all.map(item => ({
        id: item._id,
        name: item.productName || '商品',
        price: item.salePrice || item.suggestedPrice || item.originalPrice || 0,
        image: Array.isArray(item.productImage) ? (item.productImage[0] || '/images/仓鼠.png') : (item.productImage || '/images/仓鼠.png'),
        tag: item.productCategory || '其他',
        productName: item.productName,
        productDescription: item.productDescription || item.description || '',
        productCategory: item.productCategory,
        createTime: item.createTime,
        viewCount: item.viewCount || 0
      }));
      const sorted = reco.reorderProductsByWeights(list);
      try { wx.setStorageSync('moreRecommendCache', sorted); } catch (_) {}
      const renderCount = Math.min(sorted.length, 40);
      this.setData({ _allSorted: sorted, items: sorted.slice(0, renderCount), _renderCount: renderCount, loading: false });
    } catch (e) {
      console.error('加载更多推荐失败:', e);
      this.setData({ loading: false });
    }
  },

  onReachBottom() {
    const { _allSorted, _renderCount } = this.data;
    if (!_allSorted || _allSorted.length <= _renderCount) return;
    const nextCount = Math.min(_renderCount + 30, _allSorted.length);
    this.setData({ items: _allSorted.slice(0, nextCount), _renderCount: nextCount });
  },

  onItemTap(e) {
    try {
      const product = e.currentTarget.dataset.product;
      if (product) reco.recordClick(product);
    } catch (_) {}
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${id}` });
  }
});