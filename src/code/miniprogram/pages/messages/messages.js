Page({
  data: {
    myOpenId: '',
    myUserId: '',
    sessions: [],
    loading: true
  },

  async onLoad() {
    const myOpenId = await this.ensureOpenId();
    const myUserId = (wx.getStorageSync('userInfo') || {})._id || '';
    this.setData({ myOpenId, myUserId });
    await this.loadSessions();
    this.startPolling();
  },

  onShow() {
    try {
      if (this.getTabBar && this.getTabBar()) {
        this.getTabBar().setSelected(3);
      }
    } catch (e) {}
  },

  onUnload() {
    if (this._pollTimer) clearInterval(this._pollTimer);
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
      } catch (err) {
        console.error('获取openid失败:', err);
      }
    }
    return openid;
  },

  startPolling() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = setInterval(() => this.loadSessions(), 5000);
  },

  async loadSessions() {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      // 双向聚合：同时查询“我发给对方”和“对方发给我”的会话文档
      const ret = await db.collection('T_message').where(_.or([
        { fromUserId: this.data.myUserId },
        { toUserId: this.data.myUserId }
      ])).get();
      const docs = ret.data || [];

      // 以对方 userId 归并会话，取最新一条消息作为预览
      const byPeer = {};
      for (const d of docs) {
        const msgs = Array.isArray(d.message) ? d.message : [];
        const last = msgs[msgs.length - 1] || {};
        const peerUserId = d.fromUserId === this.data.myUserId ? d.toUserId : d.fromUserId;
        if (!peerUserId) continue;
        const sessionKey = [this.data.myUserId, peerUserId].sort().join('|');
        const prev = byPeer[peerUserId];
        const cur = {
          sessionKey,
          peerUserId,
          peerOpenId: '',
          lastContentType: last.contentType || 'text',
          lastContent: last.content || '',
          lastTime: last.timestamp || Date.now(),
          timeText: this.formatTime(last.timestamp || Date.now()),
          peerName: '',
          peerAvatar: '',
          unreadCount: 0
        };
        if (!prev || cur.lastTime > prev.lastTime) byPeer[peerUserId] = cur;
      }

      let sessions = Object.values(byPeer);
      const peerIds = sessions.map(s => s.peerUserId).filter(Boolean);
      if (peerIds.length) {
        const ures = await db.collection('T_user').where({ _id: _.in(peerIds) }).get();
        const umap = {};
        (ures.data || []).forEach(u => { umap[u._id] = u; });
        sessions = sessions.map(s => {
          const u = umap[s.peerUserId] || {};
          return { ...s, peerName: u.sname || u.nickName || '用户', peerAvatar: u.avatar || '', peerOpenId: u._openid || '' };
        });
      }
      sessions.sort((a,b)=>b.lastTime - a.lastTime);
      this.setData({ sessions, loading: false });
    } catch (err) {
      console.error('加载会话失败:', err);
      this.setData({ loading: false });
    }
  },

  openChat(e) {
    const userid = e.currentTarget.dataset.userid;
    const name = e.currentTarget.dataset.name || '用户';
    // 同时携带 openid 以兼容旧数据
    const openid = e.currentTarget.dataset.openid || '';
    const params = `toUserId=${userid}&toOpenId=${openid}&toName=${encodeURIComponent(name)}`;
    wx.navigateTo({ url: `/pages/chat/chat?${params}` });
  },

  formatTime(ts) {
    const d = new Date(ts);
    const pad = n => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
});