// pages/address/address.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    addressList: [],
    defaultAddressId: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadAddressList();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    this.loadAddressList();
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
   * 加载地址列表
   */
  async loadAddressList() {
    try {
      const db = wx.cloud.database();
      const openid = await this.ensureOpenId();

      if (!openid) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        this.setData({
          addressList: []
        });
        return;
      }

      const result = await db.collection('T_address')
        .where({
          _openid: openid
        })
        .orderBy('isDefault', 'desc')
        .orderBy('createTime', 'desc')
        .get();

      let defaultAddressId = null;
      if (result.data && result.data.length > 0) {
        const defaultAddr = result.data.find(addr => addr.isDefault);
        if (defaultAddr) {
          defaultAddressId = defaultAddr._id;
        }
      }

      this.setData({
        addressList: result.data || [],
        defaultAddressId: defaultAddressId
      });
    } catch (err) {
      console.error('加载地址列表失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 添加地址
   */
  onAddAddress() {
    wx.navigateTo({
      url: '/pages/address-edit/address-edit'
    });
  },

  /**
   * 编辑地址
   */
  onEditAddress(e) {
    const addressId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/address-edit/address-edit?id=${addressId}`
    });
  },

  /**
   * 删除地址
   */
  async onDeleteAddress(e) {
    const addressId = e.currentTarget.dataset.id;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除该地址吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database();
            await db.collection('T_address').doc(addressId).remove();

            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });

            this.loadAddressList();
          } catch (err) {
            console.error('删除地址失败:', err);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 设置默认地址
   */
  async onSetDefault(e) {
    const addressId = e.currentTarget.dataset.id;

    try {
      const db = wx.cloud.database();
      const openid = await this.ensureOpenId();

      if (!openid) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        return;
      }

      // 先将所有地址设为非默认
      await db.collection('T_address')
        .where({
          _openid: openid
        })
        .update({
          data: {
            isDefault: false
          }
        });

      // 设置当前地址为默认
      await db.collection('T_address').doc(addressId).update({
        data: {
          isDefault: true
        }
      });

      wx.showToast({
        title: '设置成功',
        icon: 'success'
      });

      this.loadAddressList();
    } catch (err) {
      console.error('设置默认地址失败:', err);
      wx.showToast({
        title: '设置失败',
        icon: 'none'
      });
    }
  }
});

