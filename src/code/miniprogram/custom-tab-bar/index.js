Component({
  data: {
    selected: 0,
    tabs: [
      { pagePath: '/pages/main/main' },
      { pagePath: '/pages/market/market' },
      { pagePath: '/pages/cart/cart' },
      { pagePath: '/pages/messages/messages' },
      { pagePath: '/pages/profile/profile' }
    ]
  },
  methods: {
    setSelected(index) {
      this.setData({ selected: index });
    },
    onTabTap(e) {
      const idx = Number(e.currentTarget.dataset.index);
      const tab = this.data.tabs[idx];
      if (!tab) return;
      wx.switchTab({ url: tab.pagePath });
    }
  }
});