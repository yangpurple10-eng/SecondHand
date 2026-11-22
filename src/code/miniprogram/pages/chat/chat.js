// pages/chat/chat.js
Page({
  data: {
    peer: { name: '', avatar: '', openId: '', userId: '' },
    myOpenId: '',
    myAvatar: '',
    myUserId: '',
    productId: '',
    sessionKey: '',
    sessionKeyUser: '',
    messages: [],
    textInput: '',
    sending: false,
    uploading: false,
    scrollInto: '',
    watcher: null
  },

  async onLoad(options) {
    // 参数：toUserId(推荐), toOpenId(兼容), toName, productId
    const toOpenId = options.toOpenId || '';
    const toName = decodeURIComponent(options.toName || '');
    const productId = options.productId || '';
    const toUserId = options.toUserId || '';

    const myOpenId = await this.ensureOpenId();
    const myAvatar = (wx.getStorageSync('userInfo') || {}).avatar || '';
    const myUserId = (wx.getStorageSync('userInfo') || {})._id || '';

    const sessionKey = [myOpenId, toOpenId].sort().join('|');
    const sessionKeyUser = (toUserId && myUserId) ? [myUserId, toUserId].sort().join('|') : '';

    this.setData({
      peer: { name: toName || '对话', avatar: '', openId: toOpenId, userId: toUserId },
      myOpenId,
      myAvatar,
      myUserId,
      productId,
      sessionKey,
      sessionKeyUser
    });

    await this.loadPeerInfo();
    await this.loadMessages();
    this.startWatch();
  },

  onUnload() {
    try { if (this.data.watcher) this.data.watcher.close(); } catch(e){}
  },

  goBack() { wx.navigateBack({ delta: 1 }); },

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

  async loadPeerInfo() {
    try {
      const db = wx.cloud.database();
      let u = null;
      if (this.data.peer.userId) {
        const byId = await db.collection('T_user').doc(this.data.peer.userId).get();
        u = byId.data || null;
      }
      if (!u && this.data.peer.openId) {
        const byOpen = await db.collection('T_user').where({ _openid: this.data.peer.openId }).limit(1).get();
        u = (byOpen.data && byOpen.data[0]) || null;
      }
      if (u) {
        const name = u.sname || u.nickName || this.data.peer.name || '对话';
        const avatar = u.avatar || this.data.peer.avatar || '';
        const openId = u._openid || this.data.peer.openId || '';
        const userId = u._id || this.data.peer.userId || '';
        this.setData({ peer: { ...this.data.peer, name, avatar, openId, userId } });
      }
    } catch(e){}
  },

  async loadMessages() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('T_message').where({ toUserId: this.data.peer.userId, fromUserId: this.data.myUserId }).limit(1).get();
      const doc = (res.data && res.data[0]) || null;
      if (!doc) {
        await db.collection('T_message').add({ data: { toUserId: this.data.peer.userId, fromUserId: this.data.myUserId, message: [] } });
        this.setData({ messages: [] });
        return;
      }
      const list = (doc.message || []).map(m => ({ ...m, _id: m._id || `${m.timestamp}`, timeText: this.formatTime(m.timestamp) }));
      this.setData({ messages: list });
      this.scrollToBottom();
    } catch(err) { console.error('加载消息失败:', err); }
  },

  startWatch() {
    try {
      const db = wx.cloud.database();
      const watcher = db.collection('T_message').where({ toUserId: this.data.peer.userId, fromUserId: this.data.myUserId })
        .watch({
          onChange: snapshot => {
            const doc = (snapshot.docs && snapshot.docs[0]) || null;
            const list = doc ? (doc.message || []).map(m => ({ ...m, _id: m._id || `${m.timestamp}`, timeText: this.formatTime(m.timestamp) })) : [];
            this.setData({ messages: list });
            this.scrollToBottom();
          },
          onError: err => { this.startPolling(); }
        });
      this.setData({ watcher });
    } catch(e) {
      this.startPolling();
    }
  },

  startPolling() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = setInterval(()=>this.loadMessages(), 3000);
  },

  onTextInput(e) { this.setData({ textInput: e.detail.value }); },

  async sendText() {
    const content = (this.data.textInput || '').trim();
    if (!content) return;
    this.setData({ sending: true });
    try {
      await this._sendMessage({ contentType: 'text', content });
      this.setData({ textInput: '' });
    } catch(err) {
      wx.showToast({ title: '发送失败', icon: 'none' });
    } finally {
      this.setData({ sending: false });
    }
  },

  async chooseImage() {
    this.setData({ uploading: true });
    try {
      const pick = await wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album','camera'] });
      const filePath = pick.tempFilePaths[0];
      const cloudPath = `chat-images/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const up = await wx.cloud.uploadFile({ cloudPath, filePath });
      // 可直接用 fileID；也尝试获取临时URL用于展示
      let imageUrl = up.fileID;
      try {
        const tmp = await wx.cloud.getTempFileURL({ fileList: [up.fileID] });
        if (tmp.fileList && tmp.fileList[0] && tmp.fileList[0].tempFileURL) imageUrl = tmp.fileList[0].tempFileURL;
      } catch(e){}
      await this._sendMessage({ contentType: 'image', content: up.fileID, imageUrl });
    } catch(err) {
      wx.showToast({ title: '选择图片失败', icon: 'none' });
    } finally { this.setData({ uploading: false }); }
  },

  async _sendMessage({ contentType, content, imageUrl }) {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const msg = {
        fromUserId: this.data.myUserId,
        fromOpenId: this.data.myOpenId,
        contentType,
        content,
        imageUrl: imageUrl || '',
        timestamp: Date.now()
      };
      const a = { toUserId: this.data.peer.userId, fromUserId: this.data.myUserId };
      const b = { toUserId: this.data.myUserId, fromUserId: this.data.peer.userId };
      const chkA = await db.collection('T_message').where(a).limit(1).get();
      if (!(chkA.data && chkA.data[0])) { await db.collection('T_message').add({ data: { toUserId: a.toUserId, fromUserId: a.fromUserId, message: [] } }); }
      try { await db.collection('T_message').where(a).update({ data: { message: _.push(msg) } }); }
      catch(e){
        if (String(e.errMsg||'').includes('does not exist')||e.errCode===-502005){ await wx.cloud.callFunction({ name:'quickstartFunctions', data:{ type:'createMessageCollection' } }); await db.collection('T_message').where(a).update({ data: { message: _.push(msg) } }); }
        else { throw e; }
      }
      const chkB = await db.collection('T_message').where(b).limit(1).get();
      if (!(chkB.data && chkB.data[0])) { await db.collection('T_message').add({ data: { toUserId: b.toUserId, fromUserId: b.fromUserId, message: [] } }); }
      try { await db.collection('T_message').where(b).update({ data: { message: _.push(msg) } }); }
      catch(e){
        if (String(e.errMsg||'').includes('does not exist')||e.errCode===-502005){ await wx.cloud.callFunction({ name:'quickstartFunctions', data:{ type:'createMessageCollection' } }); await db.collection('T_message').where(b).update({ data: { message: _.push(msg) } }); }
      }
      const messages = [...this.data.messages, { ...msg, _id: `local-${msg.timestamp}`, timeText: this.formatTime(msg.timestamp) }];
      this.setData({ messages });
      this.scrollToBottom();
    } catch (err) {
      console.error('发送消息失败:', err);
      throw err;
    }
  },

  async loadMore() {
    try {
      const oldest = this.data.messages[0]?.timestamp || 0;
      if (!oldest) return;
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'getChatMessages',
          toUserId: this.data.peer.userId || '',
          toOpenId: this.data.peer.openId || '',
          before: oldest,
          limit: 50
        }
      });
      const ret = res.result || {};
      const list = (ret.data || []).map(m => ({ ...m, timeText: this.formatTime(m.timestamp) }));
      const merged = [...list, ...this.data.messages];
      this.setData({ messages: merged });
    } catch (e) {}
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({ urls: [url], current: url });
  },

  async onMessageLongPress(e) {
    const id = e.currentTarget.dataset.id;
    const mine = !!e.currentTarget.dataset.mine;
    if (!mine) return;
    try {
      wx.showActionSheet({ itemList: ['撤回'], success: async (res) => {
        if (res.tapIndex === 0) {
          try {
            const ret = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'revokeChatMessage', id } });
            if (ret.result && ret.result.success) {
              await this.loadMessages();
            } else {
              wx.showToast({ title: '撤回失败', icon: 'none' });
            }
          } catch (err) { wx.showToast({ title: '撤回失败', icon: 'none' }); }
        }
      }});
    } catch (e) {}
  },

  scrollToBottom() {
    const last = this.data.messages[this.data.messages.length - 1];
    if (last) this.setData({ scrollInto: `msg-${last._id || 'bottom-anchor'}` });
    else this.setData({ scrollInto: 'bottom-anchor' });
  },

  formatTime(ts) {
    const d = new Date(ts);
    const pad = n => (n<10?'0'+n:n);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
});