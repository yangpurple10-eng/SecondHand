// pages/cart/cart.js
const reco = require('../../utils/recommendation.js');
Page({
  data: {
    items: [],
    totalPrice: '0.00'
  },

  onShow() {
    this.loadCart();
    try {
      if (this.getTabBar && this.getTabBar()) {
        this.getTabBar().setSelected(2);
      }
    } catch (e) {}
  },

  loadCart() {
    try {
      const cart = wx.getStorageSync('cart') || [];
      const items = (cart || []).map(it => ({
        id: it.id,
        name: it.name || '商品',
        price: Number(it.price || 0),
        image: it.image || '/images/仓鼠.png',
        category: it.category || '其他',
        sellerName: it.sellerName || '用户',
        count: Number(it.count || 1)
      }));
      this.setData({ items });
      this.updateTotal();
    } catch (e) {
      console.error('加载购物车失败:', e);
    }
  },

  updateTotal() {
    const sum = this.data.items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.count) || 1), 0);
    this.setData({ totalPrice: sum.toFixed(2) });
  },

  incQty(e) {
    const idx = e.currentTarget.dataset.index;
    const items = [...this.data.items];
    items[idx].count = Math.min(99, (items[idx].count || 1) + 1);
    this.setData({ items });
    wx.setStorageSync('cart', items);
    this.updateTotal();
  },

  decQty(e) {
    const idx = e.currentTarget.dataset.index;
    const items = [...this.data.items];
    items[idx].count = Math.max(1, (items[idx].count || 1) - 1);
    this.setData({ items });
    wx.setStorageSync('cart', items);
    this.updateTotal();
  },

  removeItem(e) {
    const idx = e.currentTarget.dataset.index;
    const items = [...this.data.items];
    items.splice(idx, 1);
    this.setData({ items });
    wx.setStorageSync('cart', items);
    this.updateTotal();
  },

  clearCart() {
    wx.showModal({
      title: '清空购物车',
      content: '确定要清空所有商品吗？',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('cart', []);
          this.setData({ items: [], totalPrice: '0.00' });
        }
      }
    });
  },

  onItemTap(e) {
    try {
      const id = e.currentTarget.dataset.id;
      const p = (this.data.items || []).find(x => x.id === id);
      if (p) { try { reco.recordClick({ _id: p.id, productName: p.name, productCategory: p.category }); } catch (_) {} }
      if (!id) return;
      wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${id}` });
    } catch (err) { /* 忽略 */ }
  },

  goShopping() {
    wx.switchTab({ url: '/pages/main/main' });
  },

  async ensureOpenId() {
    let openid = wx.getStorageSync('openid');
    if (!openid) {
      try {
        const result = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'getOpenId' } });
        if (result.result && result.result.openid) {
          openid = result.result.openid;
          wx.setStorageSync('openid', openid);
        }
      } catch (err) { console.error('获取openid失败:', err); }
    }
    return openid;
  },

  async checkout() {
    const items = this.data.items;
    if (!items || items.length === 0) {
      wx.showToast({ title: '购物车为空', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '创建订单...', mask: true });

    try {
      const db = wx.cloud.database();
      const userInfo = wx.getStorageSync('userInfo') || {};
      const buyerUserId = userInfo._id || '';
      let buyerOpenId = '';
      if (buyerUserId) {
        try {
          const userRes = await db.collection('T_user').doc(buyerUserId).get();
          buyerOpenId = userRes.data && userRes.data._openid ? userRes.data._openid : '';
        } catch (err) { console.warn('通过用户ID获取openid失败:', err); }
      }
      if (!buyerOpenId) buyerOpenId = await this.ensureOpenId();
      if (!buyerOpenId) {
        wx.hideLoading();
        wx.showToast({ title: '请先登录', icon: 'none' });
        return;
      }

      // 拉取商品详情，确认在售，并获取卖家信息
      const productDocs = await Promise.all(items.map(async it => {
        try {
          const res = await db.collection('T_product').doc(it.id).get();
          return res.data || null;
        } catch (e) { return null; }
      }));

      // 过滤不可购买的商品
      const valid = [];
      const removedIds = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const doc = productDocs[i];
        if (!doc || doc.status !== '在售') {
          removedIds.push(it.id);
        } else {
          valid.push({ it, doc });
        }
      }
      if (removedIds.length > 0) {
        wx.showToast({ title: `部分商品不可购买，已移除`, icon: 'none' });
      }

      if (valid.length === 0) {
        wx.hideLoading();
        // 移除不可购买商品
        const still = items.filter(x => !removedIds.includes(x.id));
        wx.setStorageSync('cart', still);
        this.setData({ items: still });
        this.updateTotal();
        return;
      }

      // 按卖家分组生成订单
      const groups = new Map();
      valid.forEach(({ it, doc }) => {
        const key = doc.sellerUserId || doc.sellerOpenId || ('unknown-' + (doc._id || it.id));
        if (!groups.has(key)) groups.set(key, { sellerUserId: doc.sellerUserId || '', sellerOpenId: doc.sellerOpenId || '', sellerName: (doc.sellerInfo && doc.sellerInfo.name) || '用户', sellerPhone: (doc.sellerInfo && doc.sellerInfo.phone) || (doc.contactInfo || ''), items: [] });
        groups.get(key).items.push({ it, doc });
      });

      const createdOrderIds = [];
      for (const [key, group] of groups.entries()) {
        const products = group.items.map(({ it, doc }) => ({
          productId: doc._id,
          name: doc.productName || it.name,
          price: Number(doc.salePrice || doc.suggestedPrice || it.price || 0),
          count: Number(it.count || 1),
          image: Array.isArray(doc.productImage) ? (doc.productImage[0] || it.image) : (doc.productImage || it.image),
          specs: doc.productCategory || it.category || '标准'
        }));
        const totalPrice = products.reduce((s, p) => s + (p.price || 0) * (p.count || 1), 0);

        const orderData = {
          orderNumber: `ORD${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
          status: '待付款',
          buyerOpenId: buyerOpenId,
          buyerUserId: buyerUserId,
          sellerOpenId: group.sellerOpenId,
          sellerUserId: group.sellerUserId,
          sellerName: group.sellerName,
          sellerPhone: group.sellerPhone,
          products,
          totalPrice,
          totalCount: products.reduce((s, p) => s + (Number(p.count) || 0), 0),
          transactionMethod: '面交',
          createTime: new Date(),
          updateTime: new Date()
        };

        const orderRes = await db.collection('T_order').add({ data: orderData });
        createdOrderIds.push(orderRes._id);

        // 将本组商品状态更新为交易中
        await Promise.all(group.items.map(({ doc }) => db.collection('T_product').doc(doc._id).update({ data: { status: '交易中', updateTime: new Date() } })));

        // 写入卖家通知
        try {
          await db.collection('T_notify').add({ data: {
            productId: group.items[0].doc._id,
            productName: group.items[0].doc.productName || '商品',
            orderId: orderRes._id || '',
            sellerUserId: group.sellerUserId || '',
            sellerOpenId: group.sellerOpenId || '',
            type: 'purchase',
            content: '有新的购物车订单，请及时处理',
            status: 'unread',
            createTime: new Date(),
            updateTime: new Date()
          } });
        } catch (e) {
          // 忽略通知错误
        }

        // 在聊天中通知该卖家：买家已下单（购物车结算）
        try {
          if (buyerOpenId && group.sellerOpenId) {
            const sessionKey = [buyerOpenId, group.sellerOpenId].sort().join('|');
            const sessionKeyUser = (buyerUserId && group.sellerUserId) ? [buyerUserId, group.sellerUserId].sort().join('|') : '';
            await wx.cloud.callFunction({
              name: 'quickstartFunctions',
              data: {
                type: 'sendChatMessage',
                contentType: 'text',
                content: `[系统] 买家已下单（购物车）：订单号 ${orderData.orderNumber}，合计 ¥${orderData.totalPrice}，件数 ${orderData.totalCount}`,
                toUserId: group.sellerUserId || '',
                toOpenId: group.sellerOpenId || '',
                productId: group.items[0].doc._id || '',
                orderId: orderRes._id || '',
                isSystem: true
              }
            });
          }
        } catch (e) {
          console.warn('写入购物车下单系统消息失败:', e);
        }
      }

      // 结算成功：从购物车移除已下单的商品
      const orderedIds = valid.map(v => v.it.id);
      const remaining = items.filter(x => !orderedIds.includes(x.id));
      wx.setStorageSync('cart', remaining);
      this.setData({ items: remaining });
      this.updateTotal();

      wx.hideLoading();
      wx.showModal({
        title: '下单成功',
        content: '订单已创建，请前往订单页查看并支付',
        showCancel: false,
        confirmText: '查看订单',
        success: () => {
          wx.navigateTo({ url: '/pages/orders/orders?tab=pending' });
        }
      });
    } catch (err) {
      console.error('购物车结算失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '结算失败', icon: 'none' });
    }
  }
});