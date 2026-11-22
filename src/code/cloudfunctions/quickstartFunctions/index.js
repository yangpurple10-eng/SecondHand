const cloud = require("wx-server-sdk");
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const axios = require('axios');
const crypto = require('crypto');

const db = cloud.database();
const _ = db.command; // 数据库命令引用
// 获取openid
const getOpenId = async () => {
  // 获取基础信息
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};

const sendChatMessage = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const fromOpenId = wxContext.OPENID;
    const toUserIdParam = String(event?.toUserId || '').trim();
    const toOpenIdParam = String(event?.toOpenId || '').trim();
    const contentType = String(event?.contentType || '').trim();
    const content = String(event?.content || '').trim();
    const imageUrl = String(event?.imageUrl || '');
    const productId = String(event?.productId || '');
    if (!contentType) return { success: false, error: 'contentType required' };
    if (contentType === 'text' && !content) return { success: false, error: 'content required' };
    if (contentType === 'image' && !imageUrl) return { success: false, error: 'imageUrl required' };
    let toUserId = '';
    let toOpenId = '';
    if (toUserIdParam) {
      const uById = await db.collection('T_user').doc(toUserIdParam).get();
      const uDoc = uById.data || null;
      toUserId = uDoc ? (uDoc._id || toUserIdParam) : toUserIdParam;
      toOpenId = uDoc ? (uDoc._openid || '') : toOpenIdParam;
    } else if (toOpenIdParam) {
      const uByOpen = await db.collection('T_user').where({ _openid: toOpenIdParam }).limit(1).get();
      const uDoc = (uByOpen.data && uByOpen.data[0]) || null;
      toOpenId = toOpenIdParam;
      toUserId = uDoc ? (uDoc._id || '') : '';
    }
    if (!toOpenId && !toUserId) return { success: false, error: 'toUserId or toOpenId required' };
    if (!toOpenId && toUserId) {
      const uById2 = await db.collection('T_user').doc(toUserId).get();
      const uDoc2 = uById2.data || null;
      toOpenId = uDoc2 ? (uDoc2._openid || '') : '';
    }
    if (!toOpenId || toOpenId === fromOpenId) return { success: false, error: 'invalid recipient' };
    const meRes = await db.collection('T_user').where({ _openid: fromOpenId }).limit(1).get();
    const meDoc = (meRes.data && meRes.data[0]) || null;
    const fromUserId = meDoc ? (meDoc._id || '') : '';
    const sessionKey = [fromOpenId, toOpenId].sort().join('|');
    const sessionKeyUser = (fromUserId && toUserId) ? [fromUserId, toUserId].sort().join('|') : '';
    const nowTs = Date.now();
    const isSystem = Boolean(event?.isSystem);
    const orderId = String(event?.orderId || '');
    const chatDoc = {
      sessionKey,
      sessionKeyUser,
      productId,
      fromOpenId,
      toOpenId,
      fromUserId,
      toUserId,
      contentType,
      content,
      imageUrl,
      isSystem,
      orderId,
      timestamp: nowTs,
      createTime: new Date()
    };
    const addRes = await db.collection('T_chat').add({ data: chatDoc });
    return { success: true, id: addRes._id || '', data: { ...chatDoc, _id: addRes._id || '' } };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

const getChatMessages = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const myOpenId = wxContext.OPENID;
    const toUserIdParam = String(event?.toUserId || '').trim();
    const toOpenIdParam = String(event?.toOpenId || '').trim();
    const limit = Math.max(1, Math.min(200, Number(event?.limit) || 100));
    const before = Number(event?.before) || 0;
    let toOpenId = '';
    let toUserId = '';
    if (toUserIdParam) {
      const uById = await db.collection('T_user').doc(toUserIdParam).get();
      const uDoc = uById.data || null;
      toUserId = uDoc ? (uDoc._id || toUserIdParam) : toUserIdParam;
      toOpenId = uDoc ? (uDoc._openid || '') : toOpenIdParam;
    } else if (toOpenIdParam) {
      const uByOpen = await db.collection('T_user').where({ _openid: toOpenIdParam }).limit(1).get();
      const uDoc = (uByOpen.data && uByOpen.data[0]) || null;
      toOpenId = toOpenIdParam;
      toUserId = uDoc ? (uDoc._id || '') : '';
    }
    if (!toOpenId && !toUserId) return { success: false, error: 'toUserId or toOpenId required' };
    if (!toOpenId && toUserId) {
      const uById2 = await db.collection('T_user').doc(toUserId).get();
      const uDoc2 = uById2.data || null;
      toOpenId = uDoc2 ? (uDoc2._openid || '') : '';
    }
    const sessionKey = [myOpenId, toOpenId].sort().join('|');
    let query = null;
    if (toUserId) {
      const meRes = await db.collection('T_user').where({ _openid: myOpenId }).limit(1).get();
      const meDoc = (meRes.data && meRes.data[0]) || null;
      const myUserId = meDoc ? (meDoc._id || '') : '';
      const sessionKeyUser = (myUserId && toUserId) ? [myUserId, toUserId].sort().join('|') : '';
      query = sessionKeyUser ? db.collection('T_chat').where({ sessionKeyUser }) : db.collection('T_chat').where({ sessionKey });
    } else {
      query = db.collection('T_chat').where({ sessionKey });
    }
    if (before > 0) {
      query = query.where({ timestamp: _.lt(before) });
    }
    const ret = await query.orderBy('timestamp', 'asc').limit(limit).get();
    const docs = (ret.data || []).filter(d => d && (d.fromOpenId === myOpenId || d.toOpenId === myOpenId));
    return { success: true, data: docs };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

const revokeChatMessage = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const myOpenId = wxContext.OPENID;
    const id = String(event?.id || '').trim();
    if (!id) return { success: false, error: 'id required' };
    const doc = await db.collection('T_chat').doc(id).get();
    const m = doc.data || null;
    if (!m) return { success: false, error: 'not found' };
    if (m.fromOpenId !== myOpenId) return { success: false, error: 'not sender' };
    const now = Date.now();
    if ((now - (m.timestamp || 0)) > 2 * 60 * 1000) return { success: false, error: 'timeout' };
    await db.collection('T_chat').doc(id).update({ data: { isRevoked: true, contentType: 'revoke', content: '' } });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

const listChatSessions = async () => {
  try {
    const wxContext = cloud.getWXContext();
    const myOpenId = wxContext.OPENID;
    const uRes = await db.collection('T_user').where({ _openid: myOpenId }).limit(1).get();
    const me = (uRes.data && uRes.data[0]) || null;
    const myUserId = me ? (me._id || '') : '';

    let msgs = [];
    if (myUserId) {
      const retUser = await db.collection('T_chat')
        .where(_.or([{ fromUserId: myUserId }, { toUserId: myUserId }]))
        .orderBy('timestamp', 'desc')
        .limit(200)
        .get();
      msgs = retUser.data || [];
    }
    if (!msgs.length) {
      const retOpen = await db.collection('T_chat')
        .where(_.or([{ fromOpenId: myOpenId }, { toOpenId: myOpenId }]))
        .orderBy('timestamp', 'desc')
        .limit(200)
        .get();
      msgs = retOpen.data || [];
    }

    const bySession = {};
    msgs.forEach(m => {
      const sk = m.sessionKeyUser || (m.sessionKey || [m.fromOpenId, m.toOpenId].sort().join('|'));
      const ts = m.timestamp || 0;
      if (!bySession[sk] || ts > (bySession[sk].timestamp || 0)) bySession[sk] = m;
    });
    let sessions = Object.values(bySession).map(m => {
      const peerUserId = (m.fromUserId === myUserId ? m.toUserId : m.fromUserId) || '';
      const peerOpenId = (m.fromOpenId === myOpenId ? m.toOpenId : m.fromOpenId) || '';
      return {
        sessionKey: m.sessionKey || [m.fromOpenId, m.toOpenId].sort().join('|'),
        sessionKeyUser: m.sessionKeyUser || ((myUserId && peerUserId) ? [myUserId, peerUserId].sort().join('|') : ''),
        peerUserId,
        peerOpenId,
        lastContentType: m.contentType,
        lastContent: m.contentType === 'text' ? m.content : '[图片]',
        lastTime: m.timestamp || Date.now(),
        peerName: '',
        peerAvatar: '',
        unreadCount: 0
      };
    });

    const peerUserIds = sessions.map(s => s.peerUserId).filter(Boolean);
    if (peerUserIds.length) {
      const uresById = await db.collection('T_user').where({ _id: _.in(peerUserIds) }).get();
      const umap = {};
      (uresById.data || []).forEach(u => { umap[u._id] = u; });
      sessions = sessions.map(s => {
        const u = umap[s.peerUserId] || {};
        return { ...s, peerName: u.sname || u.nickName || '用户', peerAvatar: u.avatar || '' };
      });
    } else {
      const peerOpenIds = sessions.map(s => s.peerOpenId).filter(Boolean);
      if (peerOpenIds.length) {
        const uresByOpen = await db.collection('T_user').where({ _openid: _.in(peerOpenIds) }).get();
        const umap2 = {};
        (uresByOpen.data || []).forEach(u => { umap2[u._openid] = u; });
        sessions = sessions.map(s => {
          const u = umap2[s.peerOpenId] || {};
          return { ...s, peerName: u.sname || u.nickName || '用户', peerAvatar: u.avatar || '' };
        });
      }
    }

    sessions.sort((a, b) => b.lastTime - a.lastTime);
    // 计算未读数
    const statesRes = await db.collection('T_chat_read_state').where({ myOpenId }).get();
    const states = statesRes.data || [];
    const stateMap = new Map();
    states.forEach(s => {
      const key = s.sessionKeyUser || s.sessionKey;
      stateMap.set(key, s.lastReadTime || 0);
    });
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const key = s.sessionKeyUser || s.sessionKey;
      const lastRead = stateMap.get(key) || 0;
      let q = null;
      if (s.sessionKeyUser) {
        q = db.collection('T_chat').where({ sessionKeyUser: s.sessionKeyUser, toOpenId: myOpenId, timestamp: _.gt(lastRead) });
      } else {
        q = db.collection('T_chat').where({ sessionKey: s.sessionKey, toOpenId: myOpenId, timestamp: _.gt(lastRead) });
      }
      try {
        const cnt = await q.count();
        s.unreadCount = cnt.total || 0;
      } catch (e) {
        s.unreadCount = 0;
      }
    }
    return { success: true, data: sessions };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

const updateChatReadState = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const myOpenId = wxContext.OPENID;
    const toUserIdParam = String(event?.toUserId || '').trim();
    const toOpenIdParam = String(event?.toOpenId || '').trim();
    let toOpenId = '';
    let toUserId = '';
    if (toUserIdParam) {
      const uById = await db.collection('T_user').doc(toUserIdParam).get();
      const uDoc = uById.data || null;
      toUserId = uDoc ? (uDoc._id || toUserIdParam) : toUserIdParam;
      toOpenId = uDoc ? (uDoc._openid || '') : toOpenIdParam;
    } else if (toOpenIdParam) {
      const uByOpen = await db.collection('T_user').where({ _openid: toOpenIdParam }).limit(1).get();
      const uDoc = (uByOpen.data && uByOpen.data[0]) || null;
      toOpenId = toOpenIdParam;
      toUserId = uDoc ? (uDoc._id || '') : '';
    }
    if (!toOpenId && toUserId) {
      const uById2 = await db.collection('T_user').doc(toUserId).get();
      const uDoc2 = uById2.data || null;
      toOpenId = uDoc2 ? (uDoc2._openid || '') : '';
    }
    const meRes = await db.collection('T_user').where({ _openid: myOpenId }).limit(1).get();
    const meDoc = (meRes.data && meRes.data[0]) || null;
    const myUserId = meDoc ? (meDoc._id || '') : '';
    const sessionKey = [myOpenId, toOpenId].sort().join('|');
    const sessionKeyUser = (myUserId && toUserId) ? [myUserId, toUserId].sort().join('|') : '';
    const now = Date.now();
    const col = db.collection('T_chat_read_state');
    const where = sessionKeyUser ? { sessionKeyUser, myOpenId } : { sessionKey, myOpenId };
    const exist = await col.where(where).limit(1).get();
    if (exist.data && exist.data[0]) {
      await col.doc(exist.data[0]._id).update({ data: { lastReadTime: now } });
    } else {
      await col.add({ data: { sessionKey, sessionKeyUser, myOpenId, myUserId, lastReadTime: now, createTime: new Date() } });
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
// 获取小程序二维码
const getMiniProgramCode = async () => {
  // 获取小程序二维码的buffer
  const resp = await cloud.openapi.wxacode.get({
    path: "pages/index/index",
  });
  const { buffer } = resp;
  // 将图片上传云存储空间
  const upload = await cloud.uploadFile({
    cloudPath: "code.png",
    fileContent: buffer,
  });
  return upload.fileID;
};

// 创建集合
const createCollection = async () => {
  try {
    // 创建集合
    await db.createCollection("sales");
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "上海",
        sales: 11,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "南京",
        sales: 11,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "广州",
        sales: 22,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "深圳",
        sales: 22,
      },
    });
    return {
      success: true,
    };
  } catch (e) {
    // 这里catch到的是该collection已经存在，从业务逻辑上来说是运行成功的，所以catch返回success给前端，避免工具在前端抛出异常
    return {
      success: true,
      data: "create collection success",
    };
  }
};

// 查询数据
const selectRecord = async () => {
  // 返回数据库查询结果
  return await db.collection("sales").get();
};

// 更新数据
const updateRecord = async (event) => {
  try {
    // 遍历修改数据库信息
    for (let i = 0; i < event.data.length; i++) {
      await db
        .collection("sales")
        .where({
          _id: event.data[i]._id,
        })
        .update({
          data: {
            sales: event.data[i].sales,
          },
        });
    }
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 新增数据
const insertRecord = async (event) => {
  try {
    const insertRecord = event.data;
    // 插入数据
    await db.collection("sales").add({
      data: {
        region: insertRecord.region,
        city: insertRecord.city,
        sales: Number(insertRecord.sales),
      },
    });
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 删除数据
const deleteRecord = async (event) => {
  try {
    await db
      .collection("sales")
      .where({
        _id: event.data._id,
      })
      .remove();
    return {
      success: true,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 通过云函数进行腾讯位置服务逆地理编码（更安全，避免前端域名/密钥限制）
const cloudReverseGeocode = async (event) => {
  try {
    const lat = Number(event.latitude || (event.location && event.location.latitude));
    const lng = Number(event.longitude || (event.location && event.location.longitude));
    // 组装可用 Keys：优先单 Key，其次多 Key 列表（逗号分隔）
    const primaryKey = process.env.QQMAP_KEY || event.key; // 优先使用云环境变量
    const multiKeysStr = process.env.QQMAP_KEYS || event.keys || '';
    const extraKeys = multiKeysStr.split(',').map(k => k.trim()).filter(Boolean);
    const keys = [];
    if (primaryKey) keys.push(primaryKey);
    for (const k of extraKeys) { if (!keys.includes(k)) keys.push(k); }
    if (keys.length === 0) {
      return { success: false, error: '缺少QQMAP_KEY，请在云环境变量配置或传入key' };
    }
    if (!isFinite(lat) || !isFinite(lng)) {
      return { success: false, error: '坐标参数无效' };
    }

    // 规范化 Referer：移除所有非 URL 合法字符（含空格、反引号等），避免校验失败
    const refererRaw = process.env.QQMAP_REFERER || event.referer || '';
    // 规范化 Referer：显式去除常见引号字符（包含反引号、中文引号），并移除空白
    const normalizeReferer = (val) => {
      let s = String(val || '')
        .replace(/[`"'“”‘’]/g, '')
        .replace(/\s+/g, '');
      // 二次清理：仅保留 URL 常见合法字符
      s = s.replace(/[^a-zA-Z0-9:\/._-]/g, '');
      // 若为空或不以 http(s) 开头，兜底为微信域
      if (!s || !/^https?:\/\//.test(s)) return 'https://servicewechat.com';
      // 若包含 servicewechat.com，则统一为基础域，避免子路径差异
      if (s.includes('servicewechat.com')) return 'https://servicewechat.com';
      return s;
    };
    const referer = normalizeReferer(refererRaw);
    const sk = process.env.QQMAP_SK || event.sk || '';
    const urlBase = 'https://apis.map.qq.com';
    const apiPathVariants = ['/ws/geocoder/v1', '/ws/geocoder/v1/'];
    let lastError = null;
    console.log('[Reverse] using referer:', referer);
    for (const k of keys) {
      // 仅使用必需参数参与签名，避免含 '=' 的值（如 poi_options）造成歧义
      const base = { key: k, location: `${lat},${lng}` };
      const keysSorted = Object.keys(base).sort();
      const qsPlain = keysSorted.map(p => `${p}=${base[p]}`).join('&');
      const qsEncoded = keysSorted.map(p => `${p}=${encodeURIComponent(String(base[p]))}`).join('&');
      const qsReqBase = qsEncoded;

      for (const apiPath of apiPathVariants) {
        let qsReq = qsReqBase;
        // 先尝试带签名
        if (sk) {
          // 同时尝试“未编码”和“已编码”两种签名算法
          const sigStrPlain = `${apiPath}?${qsPlain}${sk}`;
          const sigPlain = crypto.createHash('md5').update(sigStrPlain).digest('hex');
          console.log('[Reverse] try sigPlain', { apiPath, qsPlain, sigPlain });
          let tried = false;
          // 先尝试 plain 签名
          try {
            const resp = await axios.get(`${urlBase}${apiPath}?${qsReq}&sig=${sigPlain}`, {
              timeout: 5000,
              headers: referer ? { Referer: referer } : {}
            });
            tried = true;
            if (resp.data && resp.data.status === 0) {
              const r = resp.data.result || {};
              return {
                success: true,
                data: {
                  address: r.address || '',
                  formatted_addresses: r.formatted_addresses || {},
                  address_component: r.address_component || {},
                  address_reference: r.address_reference || {},
                  ad_info: r.ad_info || {},
                  location: { lat, lng }
                }
              };
            } else {
              lastError = new Error(resp.data?.message || '逆地理编码失败');
            }
          } catch (e) {
            lastError = e;
          }

          // 若失败再尝试 encoded 签名
          try {
            const sigStrEnc = `${apiPath}?${qsEncoded}${sk}`;
            const sigEnc = crypto.createHash('md5').update(sigStrEnc).digest('hex');
            console.log('[Reverse] try sigEnc', { apiPath, qsEncoded, sigEnc });
            const resp = await axios.get(`${urlBase}${apiPath}?${qsReq}&sig=${sigEnc}`, {
              timeout: 5000,
              headers: referer ? { Referer: referer } : {}
            });
            if (resp.data && resp.data.status === 0) {
              const r = resp.data.result || {};
              return {
                success: true,
                data: {
                  address: r.address || '',
                  formatted_addresses: r.formatted_addresses || {},
                  address_component: r.address_component || {},
                  address_reference: r.address_reference || {},
                  ad_info: r.ad_info || {},
                  location: { lat, lng }
                }
              };
            } else {
              lastError = new Error(resp.data?.message || '逆地理编码失败');
            }
          } catch (e) {
            lastError = e;
          }
          // 如果上面两种签名都失败，将在后面尝试无签名请求
        }
        try {
          const resp = await axios.get(`${urlBase}${apiPath}?${qsReq}`, {
            timeout: 5000,
            headers: referer ? { Referer: referer } : {}
          });
          if (resp.data && resp.data.status === 0) {
            const r = resp.data.result || {};
            return {
              success: true,
              data: {
                address: r.address || '',
                formatted_addresses: r.formatted_addresses || {},
                address_component: r.address_component || {},
                address_reference: r.address_reference || {},
                ad_info: r.ad_info || {},
                location: { lat, lng }
              }
            };
          } else {
            lastError = new Error(resp.data?.message || '逆地理编码失败');
          }
        } catch (e) {
          lastError = e;
        }

        // 若签名失败且开启了签名校验，尝试不带签名的请求（部分控制台配置允许）
        try {
          const resp = await axios.get(`${urlBase}${apiPath}?${qsReqBase}`, {
            timeout: 5000,
            headers: referer ? { Referer: referer } : {}
          });
          if (resp.data && resp.data.status === 0) {
            const r = resp.data.result || {};
            return {
              success: true,
              data: {
                address: r.address || '',
                formatted_addresses: r.formatted_addresses || {},
                address_component: r.address_component || {},
                address_reference: r.address_reference || {},
                ad_info: r.ad_info || {},
                location: { lat, lng }
              }
            };
          }
        } catch (e) {
          // 保留最后的错误用于返回
          lastError = e;
        }
      }
    }
    return { success: false, error: lastError?.message || '逆地理编码失败' };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

// 正向地理编码：根据地址获取坐标（支持多 Key 与签名）
const cloudGeocode = async (event) => {
  try {
    const address = String(event.address || '').trim();
    if (!address) {
      return { success: false, error: '地址为空' };
    }
    const primaryKey = process.env.QQMAP_KEY || event.key; // 优先环境变量
    const multiKeysStr = process.env.QQMAP_KEYS || event.keys || '';
    const extraKeys = multiKeysStr.split(',').map(k => k.trim()).filter(Boolean);
    const keys = [];
    if (primaryKey) keys.push(primaryKey);
    for (const k of extraKeys) { if (!keys.includes(k)) keys.push(k); }
    if (keys.length === 0) {
      return { success: false, error: '缺少QQMAP_KEY，请在云环境变量配置或传入key' };
    }
    const refererRaw = process.env.QQMAP_REFERER || event.referer || '';
    const normalizeReferer = (val) => {
      let s = String(val || '')
        .replace(/[`"'“”‘’]/g, '')
        .replace(/\s+/g, '');
      s = s.replace(/[^a-zA-Z0-9:\/._-]/g, '');
      if (!s || !/^https?:\/\//.test(s)) return 'https://servicewechat.com';
      if (s.includes('servicewechat.com')) return 'https://servicewechat.com';
      return s;
    };
    const referer = normalizeReferer(refererRaw);
    const sk = process.env.QQMAP_SK || event.sk || '';
    const urlBase = 'https://apis.map.qq.com';
    const apiPathVariants = ['/ws/geocoder/v1', '/ws/geocoder/v1/'];
    let lastError = null;
    console.log('[Forward] using referer:', referer);
    for (const k of keys) {
      // 仅使用必需参数参与签名
      const base = { address, key: k };
      const keysSorted = Object.keys(base).sort();
      const qsPlain = keysSorted.map(p => `${p}=${base[p]}`).join('&');
      const qsEncoded = keysSorted.map(p => `${p}=${encodeURIComponent(String(base[p]))}`).join('&');
      const qsReqBase = qsEncoded;

      for (const apiPath of apiPathVariants) {
        let qsReq = qsReqBase;
        // 先尝试带签名
        if (sk) {
          // 同时尝试“未编码”和“已编码”两种签名算法
          const sigStrPlain = `${apiPath}?${qsPlain}${sk}`;
          const sigPlain = crypto.createHash('md5').update(sigStrPlain).digest('hex');
          console.log('[Forward] try sigPlain', { apiPath, qsPlain, sigPlain });
          try {
            const resp = await axios.get(`${urlBase}${apiPath}?${qsReq}&sig=${sigPlain}`, {
              timeout: 5000,
              headers: referer ? { Referer: referer } : {}
            });
            if (resp.data && resp.data.status === 0 && resp.data.result && resp.data.result.location) {
              const loc = resp.data.result.location;
              return { success: true, data: { latitude: loc.lat, longitude: loc.lng } };
            } else {
              lastError = new Error(resp.data?.message || '正向地理编码失败');
            }
          } catch (e) {
            lastError = e;
          }

          try {
            const sigStrEnc = `${apiPath}?${qsEncoded}${sk}`;
            const sigEnc = crypto.createHash('md5').update(sigStrEnc).digest('hex');
            console.log('[Forward] try sigEnc', { apiPath, qsEncoded, sigEnc });
            const resp = await axios.get(`${urlBase}${apiPath}?${qsReq}&sig=${sigEnc}`, {
              timeout: 5000,
              headers: referer ? { Referer: referer } : {}
            });
            if (resp.data && resp.data.status === 0 && resp.data.result && resp.data.result.location) {
              const loc = resp.data.result.location;
              return { success: true, data: { latitude: loc.lat, longitude: loc.lng } };
            } else {
              lastError = new Error(resp.data?.message || '正向地理编码失败');
            }
          } catch (e) {
            lastError = e;
          }
        }
        try {
          const resp = await axios.get(`${urlBase}${apiPath}?${qsReq}`, {
            timeout: 5000,
            headers: referer ? { Referer: referer } : {}
          });
          if (resp.data && resp.data.status === 0 && resp.data.result && resp.data.result.location) {
            const loc = resp.data.result.location;
            return { success: true, data: { latitude: loc.lat, longitude: loc.lng } };
          } else {
            lastError = new Error(resp.data?.message || '正向地理编码失败');
          }
        } catch (e) {
          lastError = e;
        }

        // 若签名失败，尝试不带签名
        try {
          const resp = await axios.get(`${urlBase}${apiPath}?${qsReqBase}`, {
            timeout: 5000,
            headers: referer ? { Referer: referer } : {}
          });
          if (resp.data && resp.data.status === 0 && resp.data.result && resp.data.result.location) {
            const loc = resp.data.result.location;
            return { success: true, data: { latitude: loc.lat, longitude: loc.lng } };
          }
        } catch (e) {
          lastError = e;
        }
      }
    }
    return { success: false, error: lastError?.message || '正向地理编码失败' };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

// 创建通知集合 T_notify
const createNotifyCollection = async () => {
  try {
    await db.createCollection('T_notify');
    return { success: true };
  } catch (e) {
    // 集合可能已存在，视为成功
    return { success: true, data: 'T_notify exists' };
  }
};

// 创建聊天集合 T_chat，并为 sessionKey/sessionKeyUser + timestamp 建索引（若环境支持）
const createChatCollection = async () => {
  try {
    await db.createCollection('T_chat');
    try {
      // 索引创建在部分环境可能不支持，失败不影响主要功能
      await db.collection('T_chat').createIndex({
        fields: {
          sessionKey: 1,
          timestamp: -1
        },
        name: 'idx_session_time'
      });
      await db.collection('T_chat').createIndex({
        fields: {
          sessionKeyUser: 1,
          timestamp: -1
        },
        name: 'idx_session_user_time'
      });
    } catch (e) {
      // 忽略索引创建失败
    }
    return { success: true };
  } catch (e) {
    // 集合可能已存在，视为成功
    return { success: true, data: 'T_chat exists' };
  }
};

const createMessageCollection = async () => {
  try {
    await db.createCollection('T_message');
    try {
      await db.collection('T_message').createIndex({
        fields: { toUserId: 1, fromUserId: 1 },
        name: 'idx_to_from'
      });
    } catch (e) {}
    return { success: true };
  } catch (e) {
    return { success: true, data: 'T_message exists' };
  }
};

// 批量为 T_product 补齐缺失的 sellerUserId（根据 sellerOpenId 关联 T_user）
const backfillSellerUserId = async (event) => {
  try {
    const batchSize = Math.max(10, Math.min(500, Number(event?.batchSize) || 100));
    const dryRun = Boolean(event?.dryRun);

    const colProduct = db.collection('T_product');
    const colUser = db.collection('T_user');

    // 统计总数
    const countRes = await colProduct.count();
    const total = countRes.total || 0;

    let processed = 0;
    let corrected = 0;
    let skipped = 0;
    const openIdToUserId = new Map();

    for (let offset = 0; offset < total; offset += batchSize) {
      const page = await colProduct.skip(offset).limit(batchSize).get();
      const items = page.data || [];
      for (const p of items) {
        processed += 1;
        const hasSellerUserId = !!(p.sellerUserId && String(p.sellerUserId).trim() !== '');
        if (hasSellerUserId) {
          skipped += 1;
          continue;
        }

        const sellerOpenId = p.sellerOpenId || '';
        if (!sellerOpenId) {
          skipped += 1;
          continue;
        }

        // 缓存查询，避免重复命中数据库
        let userId = openIdToUserId.get(sellerOpenId);
        if (!userId) {
          const uRes = await colUser.where({ _openid: sellerOpenId }).limit(1).get();
          const u = (uRes.data && uRes.data[0]) || null;
          userId = u ? u._id : undefined;
          if (userId) openIdToUserId.set(sellerOpenId, userId);
        }

        if (!userId) {
          skipped += 1;
          continue;
        }

        if (!dryRun) {
          try {
            await colProduct.doc(p._id).update({
              data: {
                sellerUserId: userId
              }
            });
            corrected += 1;
          } catch (e) {
            // 单条失败不影响整体流程
            console.error('更新商品 sellerUserId 失败:', p._id, e?.message);
          }
        } else {
          corrected += 1; // 试运行只统计可修复数
        }
      }
    }

    return {
      success: true,
      message: dryRun ? '试运行完成（未实际写库）' : '回填完成',
      total,
      processed,
      corrected,
      skipped,
      batchSize,
      dryRun
    };
  } catch (e) {
    return {
      success: false,
      error: e?.message || 'backfillSellerUserId 执行失败'
    };
  }
};

// 创建用户地址集合 T_address（用于存储默认地址等）
const createAddressCollection = async () => {
  try {
    await db.createCollection('T_address');
    return { success: true };
  } catch (e) {
    // 已存在也视为成功
    return { success: true, data: 'T_address exists' };
  }
};

// 便捷初始化：为当前用户写入一个默认地址（校园地址），便于测试“地址附近交易点”
const seedDefaultAddress = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) {
      return { success: false, error: '未获取openid' };
    }

    const col = db.collection('T_address');
    // 若已有默认地址则直接返回成功
    const existing = await col.where({ _openid: openid, isDefault: true }).limit(1).get();
    if (existing.data && existing.data.length > 0) {
      return { success: true, data: '已有默认地址' };
    }

  const now = new Date();
  await col.add({
    data: {
      name: event?.name || '默认地址',
      phone: event?.phone || '',
      province: event?.province || '天津市',
      city: event?.city || '东丽区',
      district: event?.district || '',
      detail: event?.detail || '中国民航大学',
      isDefault: true,
      createTime: now
    }
  });
  return { success: true };
} catch (e) {
  return { success: false, error: e.message };
}
};

// 批量修复商品缺失坐标：优先地标匹配，其次地址正向地理编码
// 用法：wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'fixProductCoords', limit: 200, dryRun: false } })
const fixProductCoords = async (event) => {
  try {
    const limit = Number(event?.limit) > 0 ? Math.min(Number(event.limit), 500) : 200;
    const dryRun = !!event?.dryRun;
    const col = db.collection('T_product');
    // QQMap 配置（若云环境变量未设，可通过 event 传入）
    const qqKey = process.env.QQMAP_KEY || event?.key || '';
    const qqKeys = process.env.QQMAP_KEYS || event?.keys || '';
    const qqSk = process.env.QQMAP_SK || event?.sk || '';
    const qqReferer = process.env.QQMAP_REFERER || event?.referer || 'https://servicewechat.com';

    // 内置校园地标（云端版，可加入更细的别名以提高匹配率）
  const campusLandmarksCloud = [
      { name: '图书馆', latitude: 39.1234, longitude: 117.3365 },
      { name: '体育馆', latitude: 39.1216, longitude: 117.3394 },
      { name: '第一食堂', latitude: 39.1242, longitude: 117.3396 },
      { name: '第二食堂', latitude: 39.1211, longitude: 117.3358 },
      { name: '西门快递点', latitude: 39.1209, longitude: 117.3349 },
      { name: '南门', latitude: 39.1198, longitude: 117.3382 },
      { name: '北门', latitude: 39.1255, longitude: 117.3361 },
      // 常见别称与扩展（示例）
      { name: '礼堂', latitude: 39.112869, longitude: 117.349220 },
      { name: '中国民航大学北校区礼堂', latitude: 39.112869, longitude: 117.349220 },
      { name: '北校区礼堂', latitude: 39.112869, longitude: 117.349220 }
    ];

    const normalizeNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const extractCoordsFromString = (s) => {
      if (!s || typeof s !== 'string') return null;
      const m = s.match(/(-?\d+\.?\d*)[\s,]+(-?\d+\.?\d*)/);
      if (m) {
        const lat = normalizeNum(m[1]);
        const lng = normalizeNum(m[2]);
        if (lat != null && lng != null) return { lat, lng };
      }
      return null;
    };

    const simplify = (s) => String(s || '')
      .replace(/[（）()]/g, '')
      .replace(/附近$/g, '')
      .trim();

    const matchLandmark = (names) => {
      const cands = (names || []).filter(Boolean).map(v => simplify(v));
      if (cands.length === 0) return null;
      for (const candidate of cands) {
        const m = campusLandmarksCloud.find(l => candidate.includes(l.name) || l.name.includes(candidate));
        if (m && Number.isFinite(m.latitude) && Number.isFinite(m.longitude)) {
          return { lat: m.latitude, lng: m.longitude };
        }
      }
      return null;
    };

    // 分页获取，筛选出缺坐标的记录
    const countRes = await col.count();
    const total = (countRes && countRes.total) || 0;
    const pageSize = 100;
    const toFix = [];
    for (let skip = 0; skip < Math.max(total, pageSize) && toFix.length < limit; skip += pageSize) {
      const page = await col.skip(skip).limit(pageSize).get();
      const batch = (page && page.data) || [];
      for (const p of batch) {
        const lat = normalizeNum(p.tradeLocationLat ?? p.tradeLat ?? p.lat ?? p.latitude ?? p?.tradeLocation?.latitude);
        const lng = normalizeNum(p.tradeLocationLng ?? p.tradeLng ?? p.lng ?? p.longitude ?? p?.tradeLocation?.longitude);
        if (!(lat != null && lng != null)) {
          toFix.push(p);
        }
        if (toFix.length >= limit) break;
      }
      if (!page || !page.data || page.data.length < pageSize) break;
    }

    const results = [];
    let fixedCount = 0;
    for (const p of toFix) {
      let latLng = null;
      // 1) 解析字符串坐标
      latLng = latLng || extractCoordsFromString(String(p.tradeLocation || ''));
      // 2) 地标匹配
      latLng = latLng || matchLandmark([p.tradeLandmarkName, p.tradeLocationName, p.tradeAddress]);
      // 3) 地址正向地理编码
      if (!latLng) {
        const addr = simplify(p.tradeAddress || '') || `${simplify(p.tradeLandmarkName || p.tradeLocationName || '')} 中国民航大学 东丽校区`;
        if (addr) {
          try {
            const r = await cloudGeocode({ address: addr, key: qqKey, keys: qqKeys, sk: qqSk, referer: qqReferer });
            if (r && r.success && r.data && Number.isFinite(r.data.latitude) && Number.isFinite(r.data.longitude)) {
              latLng = { lat: r.data.latitude, lng: r.data.longitude };
            }
          } catch (e) {
            // 忽略该条错误，继续下一个
          }
        }
      }

      if (latLng) {
        if (!dryRun) {
          try {
            await col.doc(p._id).update({ data: { tradeLocationLat: latLng.lat, tradeLocationLng: latLng.lng } });
            fixedCount += 1;
            results.push({ id: p._id, ok: true, lat: latLng.lat, lng: latLng.lng });
          } catch (e) {
            results.push({ id: p._id, ok: false, error: e.message });
          }
        } else {
          results.push({ id: p._id, ok: true, lat: latLng.lat, lng: latLng.lng, dryRun: true });
        }
      } else {
        results.push({ id: p._id, ok: false, error: '未能解析或编码地址' });
      }
    }

    return { success: true, fixedCount, totalCandidates: toFix.length, dryRun, results };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

// 创建地标集合 T_campus_landmarks（若不存在）
const createCampusLandmarksCollection = async () => {
  try {
    await db.createCollection('T_campus_landmarks');
    return { success: true };
  } catch (e) {
    // 已存在也视为成功
    return { success: true, data: 'T_campus_landmarks exists' };
  }
};

// 规范化/去噪地标名称（用于去重与匹配）
const normalizeLandmarkName = (s) => String(s || '')
  .replace(/[（）()]/g, '')
  .replace(/附近$/g, '')
  .replace(/\s+/g, '')
  .trim();

// 上报/同步单条地标：按规范化名称去重，存在则更新，不存在则新增
// 用法：wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'upsertCampusLandmark', name, latitude, longitude, address, tags } })
const upsertCampusLandmark = async (event) => {
  try {
    const name = String(event?.name || '').trim();
    const latitude = Number(event?.latitude);
    const longitude = Number(event?.longitude);
    const address = String(event?.address || '').trim();
    const tags = Array.isArray(event?.tags) ? event.tags : [];
    const source = event?.source || 'product';
    const productId = String(event?.productId || '').trim();
    const selling = typeof event?.selling === 'boolean' ? event.selling : undefined;
    const productCategory = String(event?.productCategory || '').trim();
    const thumbUrl = String(event?.thumbUrl || '').trim();

    if (!name) return { success: false, error: 'name不能为空' };
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { success: false, error: '坐标无效' };
    }

    const col = db.collection('T_campus_landmarks');
    const normalizedName = normalizeLandmarkName(name);

    // 若集合不存在，尝试创建
    try { await db.collection('T_campus_landmarks').limit(1).get(); } catch (e) {
      const msg = String(e?.message || e?.errMsg || '');
      if (/DATABASE_COLLECTION_NOT_EXIST|ResourceNotFound|Db or Table not exist/i.test(msg)) {
        await createCampusLandmarksCollection();
      }
    }

    const existing = await col.where({ normalizedName }).limit(1).get();
    const now = new Date();
    if (existing.data && existing.data.length > 0) {
      const id = existing.data[0]._id;
      const prev = existing.data[0] || {};
      const prevIds = Array.isArray(prev.productIds) ? prev.productIds : [];
      const nextIds = productId && !prevIds.includes(productId) ? [...prevIds, productId] : prevIds;
      const data = {
        name,
        normalizedName,
        latitude,
        longitude,
        address,
        tags,
        source,
        productIds: nextIds,
        selling: selling === undefined ? prev.selling : selling,
        productCategory: productCategory ? productCategory : prev.productCategory,
        thumbUrl: thumbUrl ? thumbUrl : prev.thumbUrl,
        updateTime: now
      };
      await col.doc(id).update({ data });
      return { success: true, updated: 1, id };
    } else {
      const addRes = await col.add({
        data: {
          name,
          normalizedName,
          latitude,
          longitude,
          address,
          tags,
          source,
          productIds: productId ? [productId] : [],
          selling: selling === undefined ? true : selling,
          productCategory,
          thumbUrl,
          createTime: now,
          updateTime: now
        }
      });
      return { success: true, created: 1, id: addRes._id };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
};

// 批量从商品集合同步可用地标到 T_campus_landmarks（去重，保留最新坐标）
// 支持：旧字段、字符串坐标解析；若无坐标但有 tradeAddress，则云端正向地理编码补齐
// 用法：wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'syncProductLandmarks', limit: 500, dryRun: false, key: '<QQMAP_KEY>', referer: '<Referer>' } })
const syncProductLandmarks = async (event) => {
  try {
    const limit = Number(event?.limit) > 0 ? Math.min(Number(event.limit), 1000) : 500;
    const dryRun = !!event?.dryRun;
    const col = db.collection('T_product');

    // 工具：数值规范化与字符串坐标解析、名称简化
    const normalizeNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const parseStringCoords = (s) => {
      if (!s || typeof s !== 'string') return null;
      const m = s.match(/(-?\d+\.?\d*)[\s,]+(-?\d+\.?\d*)/);
      if (!m) return null;
      const lat = normalizeNum(m[1]);
      const lng = normalizeNum(m[2]);
      return lat != null && lng != null ? { lat, lng } : null;
    };
    const simplify = (s) => String(s || '')
      .replace(/[（）()]/g, '')
      .replace(/附近$/g, '')
      .trim();

    const countRes = await col.count();
    const total = (countRes && countRes.total) || 0;
    const pageSize = 100;
    const candidates = [];
    for (let skip = 0; skip < Math.max(total, pageSize) && candidates.length < limit; skip += pageSize) {
      const page = await col.skip(skip).limit(pageSize).get();
      const batch = (page && page.data) || [];
      for (const p of batch) {
        // 解析坐标：优先数值字段，其次字符串坐标
        let lat = normalizeNum(p.tradeLocationLat ?? p.tradeLat ?? p.lat ?? p.latitude ?? p?.tradeLocation?.latitude);
        let lng = normalizeNum(p.tradeLocationLng ?? p.tradeLng ?? p.lng ?? p.longitude ?? p?.tradeLocation?.longitude);
        if (lat == null || lng == null) {
          const sc = parseStringCoords(String(p.tradeLocation || p.location || p.coords || ''));
          if (sc) { lat = sc.lat; lng = sc.lng; }
        }

        // 名称：支持嵌套字段与地址，并做简化
        const rawName = p.tradeLandmarkName || p.tradeLocationName || p?.tradeLocation?.landmarkName || p.tradeAddress || '';
        const name = simplify(rawName);

        if (name && lat != null && lng != null) {
          candidates.push({ name, lat, lng, address: String(p.tradeAddress || ''), source: 'product', productId: String(p._id || '') });
        }
        if (candidates.length >= limit) break;
      }
      if (!page || !page.data || page.data.length < pageSize) break;
    }

    const results = [];
    let created = 0;
    let updated = 0;
    let geocoded = 0;

    // 若存在缺坐标但有地址的潜在项，尝试地理编码补齐
    const potentials = [];
    {
      // 重新扫描一次（避免漏掉仅有地址的商品），但不超过 limit
      const countRes2 = await col.count();
      const total2 = (countRes2 && countRes2.total) || 0;
      const pageSize2 = 100;
      for (let skip = 0; skip < Math.max(total2, pageSize2) && potentials.length < limit; skip += pageSize2) {
        const page = await col.skip(skip).limit(pageSize2).get();
        const batch = (page && page.data) || [];
        for (const p of batch) {
          // 名称与地址
          const rawName = p.tradeLandmarkName || p.tradeLocationName || p?.tradeLocation?.landmarkName || p.tradeAddress || '';
          const name = simplify(rawName);
          const address = String(p.tradeAddress || '').trim();
          // 坐标（含字符串解析）
          let lat = normalizeNum(p.tradeLocationLat ?? p.tradeLat ?? p.lat ?? p.latitude ?? p?.tradeLocation?.latitude);
          let lng = normalizeNum(p.tradeLocationLng ?? p.tradeLng ?? p.lng ?? p.longitude ?? p?.tradeLocation?.longitude);
          if (lat == null || lng == null) {
            const sc = parseStringCoords(String(p.tradeLocation || p.location || p.coords || ''));
            if (sc) { lat = sc.lat; lng = sc.lng; }
          }
          if ((name || address) && (lat == null || lng == null) && address) {
            potentials.push({ name, address, lat, lng, productId: String(p._id || '') });
          }
          if (potentials.length >= limit) break;
        }
        if (!page || !page.data || page.data.length < pageSize2) break;
      }
    }

    // 并发地理编码补齐
    if (potentials.length > 0) {
      const concurrency = 6;
      let idx = 0;
      const worker = async () => {
        while (idx < potentials.length) {
          const item = potentials[idx++];
          try {
            const r = await cloudGeocode({ address: item.address, key: event?.key, keys: event?.keys, referer: event?.referer, sk: event?.sk });
            if (r.success && r.data && typeof r.data.latitude === 'number' && typeof r.data.longitude === 'number') {
              item.lat = r.data.latitude;
              item.lng = r.data.longitude;
              geocoded += 1;
              // 若名称有效，直接纳入候选进行 upsert
              if (item.name && item.lat != null && item.lng != null) {
                candidates.push({ name: item.name, lat: item.lat, lng: item.lng, address: item.address, source: 'product', productId: String(item.productId || '') });
              }
            }
          } catch (e) {
            // 忽略失败，继续
          }
        }
      };
      const workers = Array.from({ length: Math.min(concurrency, potentials.length) }, () => worker());
      await Promise.allSettled(workers);
    }

    for (const c of candidates) {
      const normalizedName = normalizeLandmarkName(c.name);
      if (dryRun) {
        results.push({ name: c.name, normalizedName, latitude: c.lat, longitude: c.lng, dryRun: true });
        continue;
      }
      try {
        // 直接调用内部 upsert 逻辑
         const r = await upsertCampusLandmark({ name: c.name, latitude: c.lat, longitude: c.lng, address: c.address, source: c.source, productId: c.productId });
         if (r.success && r.created) created += r.created;
         if (r.success && r.updated) updated += r.updated;
         results.push({ name: c.name, normalizedName, latitude: c.lat, longitude: c.lng, ok: r.success, id: r.id });
       } catch (e) {
         results.push({ name: c.name, normalizedName, error: e.message });
       }
     }
    return { success: true, totalCandidates: candidates.length, created, updated, geocoded, dryRun, results };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

// const getOpenId = require('./getOpenId/index');
// const getMiniProgramCode = require('./getMiniProgramCode/index');
// const createCollection = require('./createCollection/index');
// const selectRecord = require('./selectRecord/index');
// const updateRecord = require('./updateRecord/index');
// const sumRecord = require('./sumRecord/index');
// const fetchGoodsList = require('./fetchGoodsList/index');
// const genMpQrcode = require('./genMpQrcode/index');
// 查询T_user表数据
const queryTUser = async () => {
  try {
    const result = await db.collection("T_user").get();
    return {
      success: true,
      data: result.data,
      count: result.data.length
    };
  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
};

// 根据openid查询用户信息（用于表关联）
const getUserByOpenId = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = event.openid || wxContext.OPENID;
    
    console.log('查询用户信息，openid:', openid);
    
    if (!openid) {
      return {
        success: false,
        error: 'openid不能为空'
      };
    }
    
    // 先尝试通过_openid查询（微信云开发自动添加的字段）
    let userResult = await db.collection("T_user").where({
      _openid: openid
    }).get();
    
    // 如果没找到，尝试通过其他方式查询（如果T_user表中有openid字段）
    if (userResult.data.length === 0) {
      // 这里可以根据实际需求添加其他查询方式
      // 例如：如果有存储openid字段，可以查询
      // userResult = await db.collection("T_user").where({
      //   openid: openid
      // }).get();
    }
    
    if (userResult.data.length > 0) {
      const userData = userResult.data[0];
      return {
        success: true,
        data: {
          userId: userData._id,
          sno: userData.sno || '',
          sname: userData.sname || '',
          phone: userData.phone || '',
          major: userData.major || '',
          sushe: userData.sushe || '',
          grade: userData.年级 || '',
          avatar: userData.avatar || '',
          openid: openid
        }
      };
    } else {
      return {
        success: false,
        error: '未找到用户信息',
        openid: openid
      };
    }
  } catch (e) {
    console.error('查询用户信息失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};

// 添加测试用户到T_user表
const addTestUser = async (event) => {
  try {
    const userData = event.userData || {
      sno: "230340151",
      sname: "测试用户",
      phone: "13800138000",
      password: "100997@mkg",
      major: "计算机科学",
      sushe: "1号楼 101",
      年级: "大三",
      avatar: "https://via.placeholder.com/100x100/4285F4/ffffff?text=T"
    };
    
    const result = await db.collection("T_user").add({
      data: userData
    });
    
    return {
      success: true,
      data: result,
      message: "测试用户添加成功"
    };
  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
};

// AI定价功能 - 调用Coze工作流分析商品图片
const analyzeProductPrice = async (event) => {
  const axios = require('axios');
  const FormData = require('form-data');
  
  const COZE_API_TOKEN = 'pat_EB0pYMqiuAjIEnGK3i1e12RWwBjF5iZzrzMgdLQE8jNgZWVykJo6ZPGZ2YESYamq';
  const COZE_UPLOAD_URL = 'https://api.coze.cn/v1/files/upload';
  const COZE_WORKFLOW_URL = 'https://api.coze.cn/v1/workflow/run';
  const WORKFLOW_ID = '7567021771821105167';
  
  try {
    console.log('========== AI定价功能开始 ==========');
    console.log('接收到的参数:', JSON.stringify(event, null, 2));
    
    // 获取参数
    const { fileID, originalPrice, imageUrl } = event;
    
    // 确保originalPrice是数字类型
    const priceNum = originalPrice ? parseFloat(originalPrice) : null;
    if (priceNum && isNaN(priceNum)) {
      throw new Error('原价必须是有效的数字');
    }
    
    console.log('接收到的参数详情:');
    console.log('  fileID:', fileID);
    console.log('  originalPrice:', originalPrice, '类型:', typeof originalPrice);
    console.log('  imageUrl:', imageUrl);
    
    // 第一步：获取图片文件内容
    let imageBuffer = null;
    let fileName = 'image.jpg';
    
    if (fileID) {
      // 从云存储下载文件
      console.log('步骤1: 从云存储下载文件, fileID:', fileID);
      try {
        if (!fileID || typeof fileID !== 'string') {
          throw new Error('fileID参数无效');
        }
        
        const result = await cloud.downloadFile({
          fileID: fileID
        });
        
        if (!result || !result.fileContent) {
          throw new Error('下载文件结果为空');
        }
        
        imageBuffer = result.fileContent;
        fileName = fileID.split('/').pop() || 'image.jpg';
        
        // 确保imageBuffer是Buffer类型
        if (!Buffer.isBuffer(imageBuffer)) {
          imageBuffer = Buffer.from(imageBuffer);
        }
        
        console.log('✅ 文件下载成功，文件名:', fileName, '文件大小:', imageBuffer.length, 'bytes');
      } catch (downloadError) {
        console.error('❌ 下载云存储文件失败:', downloadError);
        console.error('下载错误详情:', JSON.stringify(downloadError, Object.getOwnPropertyNames(downloadError)));
        throw new Error('下载图片文件失败: ' + (downloadError.message || downloadError));
      }
    } else if (imageUrl) {
      // 从URL下载图片
      console.log('步骤1: 从URL下载图片, imageUrl:', imageUrl);
      try {
        if (!imageUrl || typeof imageUrl !== 'string') {
          throw new Error('imageUrl参数无效');
        }
        
        const response = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 30000 // 30秒超时
        });
        
        imageBuffer = Buffer.from(response.data);
        fileName = imageUrl.split('/').pop().split('?')[0] || 'image.jpg';
        console.log('✅ 图片下载成功，文件名:', fileName, '文件大小:', imageBuffer.length, 'bytes');
      } catch (downloadError) {
        console.error('❌ 下载图片失败:', downloadError);
        console.error('下载错误详情:', downloadError.response?.data || downloadError.message);
        throw new Error('下载图片失败: ' + (downloadError.message || downloadError));
      }
    } else {
      throw new Error('缺少必要参数：需要提供fileID或imageUrl');
    }
    
    // 验证图片缓冲区
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('图片数据为空');
    }
    
    // 第二步：上传图片到Coze
    console.log('步骤2: 上传图片到Coze');
    let cozeFileId = null;
    let uploadResponse = null;  // 在外部声明，确保在返回时能访问
    
    try {
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('图片数据为空，无法上传');
      }
      
      const formData = new FormData();
      formData.append('file', imageBuffer, {
        filename: fileName,
        contentType: 'image/jpeg'
      });
      
      console.log('准备上传到Coze，文件大小:', imageBuffer.length, 'bytes');
      
      uploadResponse = await axios.post(COZE_UPLOAD_URL, formData, {
        headers: {
          'Authorization': `Bearer ${COZE_API_TOKEN}`,
          ...formData.getHeaders()
        },
        timeout: 60000, // 60秒超时
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      
      console.log('✅ 图片上传到Coze成功');
      console.log('上传响应数据:', JSON.stringify(uploadResponse.data, null, 2));
      
      if (uploadResponse.data.code === 0 && uploadResponse.data.data && uploadResponse.data.data.id) {
        cozeFileId = uploadResponse.data.data.id;
        console.log('✅ 获取到Coze file_id:', cozeFileId);
      } else {
        throw new Error('上传响应格式错误: ' + JSON.stringify(uploadResponse.data));
      }
    } catch (uploadError) {
      console.error('❌ 上传图片到Coze失败:', uploadError.response?.data || uploadError.message);
      throw new Error('上传图片到Coze失败: ' + (uploadError.response?.data?.msg || uploadError.message));
    }
    
    // 第三步：调用Coze工作流
    console.log('步骤3: 调用Coze工作流');
    console.log('workflow_id:', WORKFLOW_ID);
    console.log('file_id:', cozeFileId);
    
    try {
      // 根据curl示例，input参数应该是数字类型（原价）
      // curl示例: "input": 30
      // 不再需要inputText，直接使用priceNum
      
      // 验证file_id
      if (!cozeFileId || typeof cozeFileId !== 'string') {
        throw new Error('Coze file_id无效: ' + cozeFileId);
      }
      
      // 根据API文档，image参数应该是字符串，内容是JSON格式的字符串
      // 格式: "{\"file_id\":\"...\"}"
      // 注意：需要手动构建JSON字符串，确保格式正确
      const imageParam = JSON.stringify({ file_id: String(cozeFileId) });
      
      // 验证image参数格式
      try {
        const imageObj = JSON.parse(imageParam);
        if (!imageObj.file_id || typeof imageObj.file_id !== 'string') {
          throw new Error('image参数格式错误: file_id无效');
        }
        console.log('✅ image参数格式验证通过:', imageObj);
      } catch (parseError) {
        console.error('❌ image参数格式验证失败:', parseError);
        throw new Error('image参数格式错误: ' + parseError.message);
      }
      
      // 构建请求对象
      const workflowRequest = {
        workflow_id: String(WORKFLOW_ID),
        parameters: {
          image: imageParam,  // JSON字符串: "{\"file_id\":\"7567222758887850038\"}"
          input: Number(priceNum || 0)  // 数字类型（原价），根据curl示例
        }
      };
      
      // 验证最终请求格式
      const testSerialize = JSON.stringify(workflowRequest);
      console.log('测试序列化结果:', testSerialize);
      const testParse = JSON.parse(testSerialize);
      console.log('测试解析结果:', JSON.stringify(testParse, null, 2));
      
      // 验证解析后的image参数格式
      const parsedImage = JSON.parse(testParse.parameters.image);
      console.log('解析后的image对象:', parsedImage);
      if (!parsedImage.file_id) {
        throw new Error('序列化后image参数格式错误');
      }
      
      // 打印最终发送的请求（序列化后的格式）
      const requestBody = JSON.stringify(workflowRequest);
      console.log('========== 请求参数详情 ==========');
      console.log('工作流请求数据（序列化前）:', JSON.stringify(workflowRequest, null, 2));
      console.log('工作流请求数据（序列化后，将发送给API）:', requestBody);
      console.log('参数类型检查:');
      console.log('  workflow_id类型:', typeof workflowRequest.workflow_id);
      console.log('  workflow_id值:', workflowRequest.workflow_id);
      console.log('  image类型:', typeof workflowRequest.parameters.image);
      console.log('  image值:', workflowRequest.parameters.image);
      console.log('  image值长度:', workflowRequest.parameters.image.length);
      console.log('  image值解析:', JSON.parse(workflowRequest.parameters.image));
      console.log('  input类型:', typeof workflowRequest.parameters.input);
      console.log('  input值:', workflowRequest.parameters.input);
      console.log('===================================');
      
      // 验证input是数字类型
      if (typeof workflowRequest.parameters.input !== 'number') {
        throw new Error('input参数必须是数字类型，当前类型: ' + typeof workflowRequest.parameters.input);
      }
      
      // 模拟curl命令格式，用于对比
      const curlFormat = JSON.stringify({
        workflow_id: workflowRequest.workflow_id,
        parameters: {
          image: workflowRequest.parameters.image,
          input: workflowRequest.parameters.input
        }
      }, null, 2);
      console.log('预期格式（类似curl）:', curlFormat);
      console.log('✅ 参数格式验证通过，符合curl示例格式');
      
      const workflowResponse = await axios.post(COZE_WORKFLOW_URL, workflowRequest, {
        headers: {
          'Authorization': `Bearer ${COZE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 120秒超时，因为AI分析可能需要较长时间
      });
      
      console.log('✅ Coze工作流HTTP请求成功');
      console.log('HTTP状态码:', workflowResponse.status);
      console.log('工作流响应数据:', JSON.stringify(workflowResponse.data, null, 2));
      
      // 检查响应状态
      if (workflowResponse.data.code !== 0) {
        const errorData = workflowResponse.data;
        console.error('❌ Coze API返回错误');
        console.error('错误代码:', errorData.code);
        console.error('错误消息:', errorData.msg);
        console.error('错误详情:', errorData.detail);
        console.error('调试URL:', errorData.debug_url);
        
        // 如果是参数错误，提供更详细的诊断信息
        if (errorData.code === 4000) {
          console.error('参数错误诊断:');
          console.error('  发送的请求数据:', JSON.stringify(workflowRequest, null, 2));
          console.error('  image参数原始值:', imageParam);
          console.error('  input参数原始值:', inputText);
        }
        
        throw new Error(`Coze API错误 (${errorData.code}): ${errorData.msg || '未知错误'}`);
      }
      
      // 解析返回结果
      let parsedResult = {};
      if (workflowResponse.data.data) {
        try {
          // data字段是字符串，需要解析
          const dataStr = typeof workflowResponse.data.data === 'string' 
            ? workflowResponse.data.data 
            : JSON.stringify(workflowResponse.data.data);
          
          const parsedData = JSON.parse(dataStr);
          
          // 解析output字段
          if (parsedData.output) {
            let outputStr = typeof parsedData.output === 'string' 
              ? parsedData.output 
              : JSON.stringify(parsedData.output);
            
            console.log('步骤3.1: 原始output字符串:', outputStr);
            
            // 尝试解析output中的JSON字符串
            try {
              // 处理多重转义的情况
              // 如果output是被双重转义的JSON字符串，需要先解析一次
              if (outputStr.startsWith('"') && outputStr.endsWith('"')) {
                try {
                  outputStr = JSON.parse(outputStr);
                  console.log('步骤3.2: 解析外层引号后的output:', outputStr);
                } catch (e) {
                  // 如果解析失败，继续使用原始字符串
                  console.warn('步骤3.2: 解析外层引号失败，继续使用原始字符串');
                }
              }
              
              // 处理转义字符
              let cleanedOutput = outputStr;
              
              // 如果仍然是字符串，尝试多次解析转义
              if (typeof cleanedOutput === 'string') {
                // 尝试解析转义的JSON字符串
                try {
                  // 如果看起来像转义的JSON，尝试解析
                  if (cleanedOutput.includes('\\"')) {
                    cleanedOutput = cleanedOutput.replace(/\\"/g, '"').replace(/\\n/g, '\n');
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
              
              console.log('步骤3.3: 清理后的output:', cleanedOutput);
              console.log('步骤3.3: output类型:', typeof cleanedOutput);
              
              // 使用正则表达式提取字段值
              // 匹配格式: "name":"值" 或 name:"值" 或 name=值
              const outputContent = typeof cleanedOutput === 'string' ? cleanedOutput : JSON.stringify(cleanedOutput);
              
              const nameMatch = outputContent.match(/["']?name["']?\s*[:=]\s*["']([^"']+)["']/);
              const priceMatch = outputContent.match(/["']?price["']?\s*[:=]\s*["']([^"']+)["']/);
              const chengseMatch = outputContent.match(/["']?chengse["']?\s*[:=]\s*["']([^"']+)["']/);
              const gradeMatch = outputContent.match(/["']?grade["']?\s*[:=]\s*["']([^"']+)["']/);
              const suggMatch = outputContent.match(/["']?sugg["']?\s*[:=]\s*["']([^"']+)["']/);
              
              console.log('步骤3.4: 正则匹配结果:');
              console.log('  name:', nameMatch ? nameMatch[1] : '未匹配');
              console.log('  price:', priceMatch ? priceMatch[1] : '未匹配');
              console.log('  chengse:', chengseMatch ? chengseMatch[1] : '未匹配');
              console.log('  grade:', gradeMatch ? gradeMatch[1] : '未匹配');
              console.log('  sugg:', suggMatch ? (suggMatch[1].substring(0, 50) + '...') : '未匹配');
              
              // 如果正则匹配失败，尝试直接解析为JSON对象
              let parsedOutput = null;
              try {
                // 尝试构建一个完整的JSON对象
                if (outputContent.includes('name') && outputContent.includes('price')) {
                  // 尝试提取JSON部分
                  const jsonMatch = outputContent.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    parsedOutput = JSON.parse(jsonMatch[0]);
                    console.log('步骤3.5: 成功解析为JSON对象:', parsedOutput);
                  } else {
                    // 尝试手动构建JSON字符串
                    const jsonStr = '{' + outputContent.replace(/\n/g, ',') + '}';
                    try {
                      parsedOutput = JSON.parse(jsonStr);
                      console.log('步骤3.5: 成功构建并解析JSON对象:', parsedOutput);
                    } catch (e) {
                      // 忽略错误
                    }
                  }
                }
              } catch (e) {
                console.warn('步骤3.5: 解析JSON对象失败:', e.message);
              }
              
              // 优先使用解析后的对象，否则使用正则匹配
              parsedResult = {
                productName: parsedOutput?.name || nameMatch?.[1] || '--',
                suggestedPrice: parsedOutput?.price || priceMatch?.[1] || '0.00',
                conditionLevel: parsedOutput?.chengse || chengseMatch?.[1] || '--',
                aiScore: parsedOutput?.grade || gradeMatch?.[1] || '--',
                analysisReport: parsedOutput?.sugg || suggMatch?.[1] || 'AI分析完成',
                rawOutput: outputContent
              };
              
              console.log('✅ 步骤3.6: 最终解析结果:', JSON.stringify(parsedResult, null, 2));
            } catch (parseError) {
              console.warn('⚠️ 解析output失败，使用原始数据:', parseError.message);
              console.warn('解析错误堆栈:', parseError.stack);
              parsedResult = {
                productName: '--',
                suggestedPrice: originalPrice ? (originalPrice * 0.8).toFixed(2) : '0.00',
                conditionLevel: '--',
                aiScore: '--',
                analysisReport: outputStr.substring(0, 200),
                rawOutput: outputStr
              };
            }
          } else {
            parsedResult = {
              productName: '--',
              suggestedPrice: originalPrice ? (originalPrice * 0.8).toFixed(2) : '0.00',
              conditionLevel: '--',
              aiScore: '--',
              analysisReport: 'AI分析完成，但未获取到详细信息',
              rawOutput: dataStr
            };
          }
        } catch (parseError) {
          console.error('❌ 解析响应数据失败:', parseError);
          parsedResult = {
            productName: '--',
            suggestedPrice: originalPrice ? (originalPrice * 0.8).toFixed(2) : '0.00',
            conditionLevel: '--',
            aiScore: '--',
            analysisReport: '解析响应数据失败: ' + parseError.message,
            rawResponse: workflowResponse.data
          };
        }
      } else {
        console.warn('⚠️ 工作流响应中没有data字段');
        console.warn('响应内容:', JSON.stringify(workflowResponse.data, null, 2));
        
        // 如果响应中没有data，返回默认结果
        parsedResult = {
          productName: '--',
          suggestedPrice: originalPrice ? (originalPrice * 0.8).toFixed(2) : '0.00',
          conditionLevel: '--',
          aiScore: '--',
          analysisReport: 'AI分析完成，但未获取到详细信息',
          rawResponse: workflowResponse.data
        };
      }
      
      console.log('========== AI定价功能完成 ==========');
      
      return {
        success: true,
        data: parsedResult,
        debug: {
          uploadResponse: uploadResponse ? uploadResponse.data : null,
          workflowResponse: workflowResponse.data
        }
      };
      
    } catch (workflowError) {
      console.error('❌ 调用Coze工作流失败');
      console.error('错误对象:', workflowError);
      console.error('错误响应:', workflowError.response?.data);
      console.error('错误状态码:', workflowError.response?.status);
      console.error('错误消息:', workflowError.message);
      
      // 提取详细的错误信息
      let errorMsg = '调用Coze工作流失败';
      if (workflowError.response?.data) {
        const errorData = workflowError.response.data;
        errorMsg = errorData.msg || errorData.message || errorMsg;
        if (errorData.detail) {
          errorMsg += '\n详情: ' + JSON.stringify(errorData.detail);
        }
        if (errorData.code) {
          errorMsg += '\n错误代码: ' + errorData.code;
        }
      } else {
        errorMsg += ': ' + workflowError.message;
      }
      
      throw new Error(errorMsg);
    }
    
  } catch (error) {
    console.error('========== AI定价功能出错 ==========');
    console.error('错误信息:', error.message);
    console.error('错误堆栈:', error.stack);
    
    return {
      success: false,
      error: error.message,
      details: error.response?.data || error.stack
    };
  }
};

// 初始化T_category表（如果不存在则创建）
const initCategoryTable = async () => {
  try {
    // 默认类别数据
    const defaultCategories = [
      { categoryName: '电子产品', description: '手机、电脑、配件', icon: '📱', iconBg: '#2196F3', sort: 1, enabled: true },
      { categoryName: '图书文具', description: '教材、小说、专业书籍、文具', icon: '📚', iconBg: '#4CAF50', sort: 2, enabled: true },
      { categoryName: '服装鞋帽', description: '衣服、鞋子、配饰', icon: '👕', iconBg: '#FF9800', sort: 3, enabled: true },
      { categoryName: '家居用品', description: '桌椅、小家电、生活用品', icon: '🛋️', iconBg: '#795548', sort: 4, enabled: true },
      { categoryName: '运动户外', description: '健身器材、球类运动、户外用品', icon: '⚽', iconBg: '#9C27B0', sort: 5, enabled: true },
      { categoryName: '美妆个护', description: '美妆护肤产品', icon: '💄', iconBg: '#FF6B9D', sort: 6, enabled: true },
      { categoryName: '其他', description: '其他各类商品', icon: '📦', iconBg: '#757575', sort: 7, enabled: true }
    ];
    
    // 检查T_category表是否存在数据
    const existing = await db.collection("T_category").get();
    
    if (existing.data.length === 0) {
      // 初始化类别数据（使用循环add，避免batch兼容性问题）
      for (const category of defaultCategories) {
        await db.collection("T_category").add({
          data: {
            ...category,
            createTime: new Date(),
            updateTime: new Date()
          }
        });
      }
      console.log('T_category表初始化成功');
    }
    
    return {
      success: true,
      message: 'T_category表已初始化'
    };
  } catch (e) {
    console.error('初始化T_category表失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};

// 获取所有商品类别（优先从T_category表获取，如果没有则从T_product表提取）
const getProductCategories = async () => {
  try {
    // 先尝试从T_category表获取
    let categoriesResult = await db.collection("T_category")
      .where({
        enabled: true
      })
      .orderBy('sort', 'asc')
      .get();
    
    if (categoriesResult.data.length > 0) {
      // 从T_category表获取类别
      const categories = categoriesResult.data.map(item => ({
        id: item.categoryName,
        name: item.categoryName,
        description: item.description || getCategoryDescription(item.categoryName),
        icon: item.icon || getCategoryIcon(item.categoryName),
        iconBg: item.iconBg || getCategoryBg(item.categoryName)
      }));
      
      return {
        success: true,
        data: categories,
        source: 'T_category'
      };
    }
    
    // 如果T_category表为空，从T_product表提取（兼容旧数据）
    console.log('T_category表为空，从T_product表提取类别');
    const result = await db.collection("T_product").field({
      productCategory: true
    }).get();
    
    // 提取不重复的类别
    const categoriesSet = new Set();
    result.data.forEach(item => {
      if (item.productCategory) {
        categoriesSet.add(item.productCategory);
      }
    });
    
    // 转换为数组并返回
    const categories = Array.from(categoriesSet).map(category => ({
      id: category,
      name: category,
      description: getCategoryDescription(category),
      icon: getCategoryIcon(category),
      iconBg: getCategoryBg(category)
    }));
    
    // 如果数据库中没有类别，返回默认类别
    if (categories.length === 0) {
      return {
        success: true,
        data: [
          { id: '电子产品', name: '电子产品', description: '手机、电脑、配件', icon: '📱', iconBg: '#2196F3' },
          { id: '图书文具', name: '图书文具', description: '教材、小说、专业书籍、文具', icon: '📚', iconBg: '#4CAF50' },
          { id: '服装鞋帽', name: '服装鞋帽', description: '衣服、鞋子、配饰', icon: '👕', iconBg: '#FF9800' },
          { id: '家居用品', name: '家居用品', description: '桌椅、小家电、生活用品', icon: '🛋️', iconBg: '#795548' },
          { id: '运动户外', name: '运动户外', description: '健身器材、球类运动、户外用品', icon: '⚽', iconBg: '#9C27B0' },
          { id: '美妆个护', name: '美妆个护', description: '美妆护肤产品', icon: '💄', iconBg: '#FF6B9D' },
          { id: '其他', name: '其他', description: '其他各类商品', icon: '📦', iconBg: '#757575' }
        ],
        source: 'default'
      };
    }
    
    return {
      success: true,
      data: categories,
      source: 'T_product'
    };
  } catch (e) {
    console.error('获取商品类别失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};

// 获取类别描述
const getCategoryDescription = (category) => {
  const descriptions = {
    '电子产品': '手机、电脑、配件',
    '图书文具': '教材、小说、专业书籍、文具',
    '服装鞋帽': '衣服、鞋子、配饰',
    '家居用品': '桌椅、小家电、生活用品',
    '运动户外': '健身器材、球类运动、户外用品',
    '美妆个护': '美妆护肤产品',
    '其他': '其他各类商品'
  };
  return descriptions[category] || '各类商品';
};

// 获取类别图标（使用emoji）
const getCategoryIcon = (category) => {
  const icons = {
    '电子产品': '📱',
    '图书文具': '📚',
    '服装鞋帽': '👕',
    '家居用品': '🛋️',
    '运动户外': '⚽',
    '美妆个护': '💄',
    '其他': '📦'
  };
  return icons[category] || '📦';
};

// 获取类别背景色
const getCategoryBg = (category) => {
  const colors = {
    '电子产品': '#2196F3',
    '图书文具': '#4CAF50',
    '服装鞋帽': '#FF9800',
    '家居用品': '#795548',
    '运动户外': '#9C27B0',
    '美妆个护': '#FF6B9D',
    '其他': '#757575'
  };
  return colors[category] || '#757575';
};

// 更新用户兴趣
const updateUserInterests = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const interests = event.interests || [];
    
    console.log('更新用户兴趣，openid:', openid, 'interests:', interests);
    
    if (!openid) {
      return {
        success: false,
        error: 'openid不能为空'
      };
    }
    
    // 查询用户是否存在
    const userResult = await db.collection("T_user").where({
      _openid: openid
    }).get();
    
    if (userResult.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      };
    }
    
    // 更新用户兴趣
    const updateResult = await db.collection("T_user").where({
      _openid: openid
    }).update({
      data: {
        interests: interests,
        updateTime: new Date()
      }
    });
    
    console.log('更新用户兴趣成功:', updateResult);
    
    return {
      success: true,
      data: {
        interests: interests,
        updateResult: updateResult
      }
    };
  } catch (e) {
    console.error('更新用户兴趣失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};

// 类别名称映射（兼容旧数据）
const mapCategoryName = (category) => {
  const categoryMap = {
    '化妆品': '美妆个护',
    '二手书': '图书文具',
    '运动器材': '运动户外',
    '家具家电': '家居用品',
    '文具用品': '图书文具',
    '其他商品': '其他'
  };
  return categoryMap[category] || category;
};

// 记录用户行为（浏览、收藏、购买）
const recordUserBehavior = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const { productId, behaviorType, productCategory } = event; // behaviorType: 'view', 'favorite', 'purchase'
    
    console.log('记录用户行为，参数:', { openid, productId, behaviorType, productCategory });
    
    if (!productId || !behaviorType) {
      console.error('缺少必要参数:', { productId, behaviorType });
      return {
        success: false,
        error: '缺少必要参数'
      };
    }
    
    if (!openid) {
      console.error('缺少openid');
      return {
        success: false,
        error: '用户未登录'
      };
    }
    
    // 行为权重：浏览1分，收藏3分，购买5分
    const behaviorWeights = {
      'view': 1,
      'favorite': 3,
      'purchase': 5
    };
    
    const score = behaviorWeights[behaviorType] || 1;
    
    try {
      // 检查是否已存在该行为记录
      const existingRecord = await db.collection('T_user_behavior')
        .where({
          _openid: openid,
          productId: productId,
          behaviorType: behaviorType
        })
        .get();
      
      if (existingRecord.data && existingRecord.data.length > 0) {
        // 更新现有记录的时间
        await db.collection('T_user_behavior')
          .doc(existingRecord.data[0]._id)
          .update({
            data: {
              updateTime: new Date(),
              count: _.inc(1) // 增加行为次数
            }
          });
        console.log('更新用户行为记录成功');
      } else {
        // 创建新记录
        const result = await db.collection('T_user_behavior').add({
          data: {
            _openid: openid,
            productId: productId,
            productCategory: productCategory || '',
            behaviorType: behaviorType,
            score: score,
            count: 1,
            createTime: new Date(),
            updateTime: new Date()
          }
        });
        console.log('创建用户行为记录成功，ID:', result._id);
      }
      
      return {
        success: true,
        message: '行为记录成功'
      };
    } catch (dbError) {
      console.error('数据库操作失败:', dbError);
      // 如果集合不存在，尝试创建
      if (dbError.errMsg && (dbError.errMsg.includes('not exist') || dbError.errMsg.includes('not exists') || dbError.errCode === -502005)) {
        console.log('集合不存在，尝试创建 T_user_behavior 集合');
        try {
          await db.createCollection('T_user_behavior');
          console.log('集合创建成功，重新尝试添加记录');
          
          // 重新尝试添加记录
          await db.collection('T_user_behavior').add({
            data: {
              _openid: openid,
              productId: productId,
              productCategory: productCategory || '',
              behaviorType: behaviorType,
              score: score,
              count: 1,
              createTime: new Date(),
              updateTime: new Date()
            }
          });
          
          return {
            success: true,
            message: '行为记录成功（集合已创建）'
          };
        } catch (createError) {
          console.error('创建集合失败:', createError);
          return {
            success: false,
            error: '集合创建失败: ' + createError.message
          };
        }
      } else {
        return {
          success: false,
          error: dbError.message || '数据库操作失败'
        };
      }
    }
  } catch (e) {
    console.error('记录用户行为失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};

// 创建用户行为集合
const createBehaviorCollection = async () => {
  try {
    // 检查集合是否已存在
    const collections = await db.listCollections();
    const collectionNames = collections.data.map(col => col.name);
    
    if (collectionNames.includes('T_user_behavior')) {
      return {
        success: true,
        message: "集合已存在",
      };
    }
    
    // 创建 T_user_behavior 集合
    await db.createCollection("T_user_behavior");
    
    return {
      success: true,
      message: "T_user_behavior 集合创建成功",
    };
  } catch (e) {
    // 如果集合已存在，也返回成功
    if (e.message && e.message.includes('already exists')) {
      return {
        success: true,
        message: "集合已存在",
      };
    }
    console.error('创建 T_user_behavior 集合失败:', e);
    return {
      success: false,
      error: e.message,
    };
  }
};

// 管理员登录验证
const adminLogin = async (event) => {
  try {
    const { username, password } = event;
    
    if (!username || !password) {
      return {
        success: false,
        error: '缺少必要参数'
      };
    }

    // 查询管理员表（如果不存在，使用默认管理员）
    try {
      const adminResult = await db.collection('T_admin')
        .where({
          username: username,
          password: password,
          status: 'active'
        })
        .get();

      if (adminResult.data && adminResult.data.length > 0) {
        const admin = adminResult.data[0];
        return {
          success: true,
          adminId: admin._id,
          username: admin.username,
          name: admin.name || '管理员',
          role: admin.role || 'admin'
        };
      }
    } catch (err) {
      // 如果集合不存在，使用默认管理员账号
      if (err.errMsg && err.errMsg.includes('not exist')) {
        // 默认管理员账号：admin / admin123
        if (username === 'admin' && password === 'admin123') {
          return {
            success: true,
            adminId: 'default_admin',
            username: 'admin',
            name: '系统管理员',
            role: 'admin'
          };
        }
      }
    }

    return {
      success: false,
      error: '账号或密码错误'
    };
  } catch (e) {
    console.error('管理员登录失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};

// 获取管理员统计数据
const getAdminStats = async () => {
  try {
    console.log('开始获取管理员统计数据...');
    
    // 获取商品总数（包括所有状态的商品）
    const productsResult = await db.collection('T_product').count();
    const totalProducts = productsResult.total || 0;
    console.log('商品总数:', totalProducts);

    // 获取用户总数
    const usersResult = await db.collection('T_user').count();
    const totalUsers = usersResult.total || 0;
    console.log('用户总数:', totalUsers);

    // 获取订单总数和总销售额
    let totalOrders = 0;
    let totalSales = 0;
    try {
      const ordersResult = await db.collection('T_order')
        .where({
          status: _.in(['已完成', '已支付'])
        })
        .get();
      
      totalOrders = ordersResult.data.length;
      totalSales = ordersResult.data.reduce((sum, order) => {
        return sum + (parseFloat(order.totalPrice) || 0);
      }, 0);
      console.log('订单总数:', totalOrders, '总销售额:', totalSales);
    } catch (err) {
      console.error('获取订单数据失败:', err);
    }

    // 获取最近6个月的月度商品发布量
    const monthlyProducts = await getMonthlyProducts();
    
    // 获取最近6个月的月度销售额
    const monthlySales = await getMonthlySales();
    
    // 获取商品分类统计
    const categoryStats = await getCategoryStats();

    const result = {
      success: true,
      data: {
        totalProducts,
        totalUsers,
        totalSales: Math.round(totalSales * 100) / 100,
        totalOrders,
        monthlyProducts,
        monthlySales,
        categoryStats
      }
    };
    
    console.log('统计数据获取成功:', JSON.stringify(result.data, null, 2));
    
    return result;
  } catch (e) {
    console.error('获取统计数据失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};

// 获取月度商品发布量
const getMonthlyProducts = async () => {
  try {
    const now = new Date();
    const months = [];
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      
      const monthStr = `${date.getMonth() + 1}月`;
      
      const result = await db.collection('T_product')
        .where({
          createTime: _.gte(date).and(_.lt(nextDate))
        })
        .count();
      
      months.push({
        month: monthStr,
        count: result.total || 0
      });
    }
    
    return months;
  } catch (e) {
    console.error('获取月度商品发布量失败:', e);
    return [];
  }
};

// 获取月度销售额
const getMonthlySales = async () => {
  try {
    const now = new Date();
    const months = [];
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      
      const monthStr = `${date.getMonth() + 1}月`;
      
      try {
        const result = await db.collection('T_order')
          .where({
            createTime: _.gte(date).and(_.lt(nextDate)),
            status: _.in(['已完成', '已支付'])
          })
          .get();
        
        const sales = result.data.reduce((sum, order) => {
          return sum + (parseFloat(order.totalPrice) || 0);
        }, 0);
        
        months.push({
          month: monthStr,
          sales: Math.round(sales * 100) / 100
        });
      } catch (err) {
        months.push({
          month: monthStr,
          sales: 0
        });
      }
    }
    
    return months;
  } catch (e) {
    console.error('获取月度销售额失败:', e);
    return [];
  }
};

// 获取商品分类统计
const getCategoryStats = async () => {
  try {
    const result = await db.collection('T_product')
      .field({
        productCategory: true
      })
      .get();
    
    const categoryMap = {};
    result.data.forEach(item => {
      const category = item.productCategory || '其他';
      categoryMap[category] = (categoryMap[category] || 0) + 1;
    });
    
    return Object.entries(categoryMap).map(([category, count]) => ({
      category,
      count
    })).sort((a, b) => b.count - a.count).slice(0, 8);
  } catch (e) {
    console.error('获取分类统计失败:', e);
    return [];
  }
};

// 管理端：聚合求购关键词词云（基于T_want）
const getWantedKeywordCloud = async (event) => {
  try {
    const limit = event && event.limit ? parseInt(event.limit) : 60;
    // 拉取活跃求购数据（字段：productName、purchaseDescription、expectedBrand、expectedModel、productCategory）
    const res = await db.collection('T_want')
      .field({ productName: true, description: true, purchaseDescription: true, expectedBrand: true, expectedModel: true, productCategory: true, status: true })
      .get();

    const stopwords = new Set(['求购','求','购买','需要','急需','求助','有没有','二手','全新','新','的','和','及','或','我','我们','联系','微信','电话','价','价格','预算','希望','求一个','一个','一台','一本','一套']);
    const freq = {};

    const toTokens = (text) => {
      if (!text || typeof text !== 'string') return [];
      const cleaned = text.replace(/[\s\n\r\t]+/g, ' ')
        .replace(/[，。、“”‘’！!？?：:；;、,/\.\-]+/g, ' ')
        .trim();
      const parts = cleaned.split(' ').filter(Boolean);
      return parts;
    };

    res.data.forEach(item => {
      if (item.status && item.status !== 'active') return; // 只统计活跃求购
      const texts = [item.productName, item.purchaseDescription || item.description, item.expectedBrand, item.expectedModel];
      const tokens = texts.flatMap(t => toTokens(t));
      tokens.forEach(tok => {
        const token = (tok || '').trim();
        if (!token) return;
        if (token.length < 2) return; // 过滤过短词
        if (stopwords.has(token)) return;
        // 统一大小写处理英文
        const key = /[A-Za-z]/.test(token) ? token.toLowerCase() : token;
        freq[key] = (freq[key] || 0) + 1;
      });
    });

    const entries = Object.entries(freq).map(([text, count]) => ({ text, count }));
    entries.sort((a, b) => b.count - a.count);
    const top = entries.slice(0, limit);
    const max = top.length > 0 ? top[0].count : 1;
    const min = top.length > 0 ? top[top.length - 1].count : 1;
    const norm = (c) => {
      if (max === min) return 1;
      return (c - min) / (max - min);
    };
    const keywords = top.map(k => ({
      text: k.text,
      weight: k.count,
      score: norm(k.count) // 0..1
    }));

    return { success: true, data: { keywords, total: entries.length } };
  } catch (e) {
    console.error('聚合求购关键词失败:', e);
    return { success: false, error: e.message };
  }
};

// 计算分类供需统计与发布建议（不分校区，支持个性化权重，并返回类别指引）
const getPublishRecommendations = async (event) => {
  try {
    const forType = event && event.forType; // 'product' | 'wanted' | admin
    const campusFilter = ''; // 不分校区
    const wxContext = cloud.getWXContext();
    const callerOpenId = (event && event.openid) || (wxContext && wxContext.OPENID) || '';
    let interestsFromEvent = Array.isArray(event && event.interests) ? (event.interests || []) : [];

    // 辅助：从用户信息推断校区
    const getCampusFromUser = (user) => {
      if (!user) return '未知';
      if (user.campus) return user.campus;
      const dorm = user.sushe || '';
      if (/闵行/.test(dorm)) return '闵行校区';
      if (/徐汇/.test(dorm)) return '徐汇校区';
      if (/松江/.test(dorm)) return '松江校区';
      return '未知';
    };

    // 统计供给（商品在售/交易中），顺便收集sellerUserId用于校区映射
    const productRes = await db.collection('T_product')
      .field({ productCategory: true, status: true, transactionMethod: true, salePrice: true, suggestedPrice: true, sellerUserId: true, sellerOpenId: true })
      .get();

    // 批量获取卖家用户校区
    const sellerIds = [...new Set(productRes.data.map(p => p.sellerUserId).filter(Boolean))];
    let sellerUsers = { };
    if (sellerIds.length > 0) {
      try {
        const sellerUserDocs = await db.collection('T_user').where({ _id: _.in(sellerIds) }).field({ _id: true, campus: true, sushe: true, interests: true, _openid: true }).get();
        sellerUserDocs.data.forEach(u => { sellerUsers[u._id] = u; });
      } catch (err) {
        console.error('批量获取卖家用户信息失败:', err);
      }
    }

    // 统计需求（求购信息），收集openids用于校区映射
    let wantResData = [];
    try {
      const wantRes = await db.collection('T_want')
        .field({ productCategory: true, _openid: true })
        .get();
      wantResData = wantRes.data || [];
    } catch (e) {
      wantResData = [];
    }

    const wantOpenIds = [...new Set(wantResData.map(w => w._openid).filter(Boolean))];
    let wantUsersByOpenId = { };
    if (wantOpenIds.length > 0) {
      try {
        const wantUserDocs = await db.collection('T_user').where({ _openid: _.in(wantOpenIds) }).field({ _openid: true, campus: true, sushe: true, interests: true, _id: true }).get();
        wantUserDocs.data.forEach(u => { wantUsersByOpenId[u._openid] = u; });
      } catch (err) {
        console.error('批量获取求购用户信息失败:', err);
      }
    }

    // 如果没有传入兴趣，尝试从当前调用者的用户信息获取
    if (!interestsFromEvent || interestsFromEvent.length === 0) {
      try {
        const curUser = await db.collection('T_user').where({ _openid: callerOpenId }).field({ interests: true, campus: true, sushe: true }).get();
        const userDoc = (curUser.data && curUser.data[0]) || null;
        if (userDoc && Array.isArray(userDoc.interests)) {
          interestsFromEvent = userDoc.interests;
        }
      } catch (err) {
        // 忽略错误
      }
    }

    // 供需统计（可选校区过滤）
    const supplyMap = {};
    const demandMap = {};
    const campusBreakdown = {}; // { 校区: { category -> { supply, demand } } }

    const supplyStatuses = new Set(['在售','交易中','已发布','待卖家确认','待发货','待收货']);

    productRes.data.forEach(item => {
      const cat = item.productCategory || '其他';
      const status = item.status || '';
      const isSupply = supplyStatuses.has(status);
      const sellerUser = item.sellerUserId ? sellerUsers[item.sellerUserId] : null;
      const campus = getCampusFromUser(sellerUser);

      if (isSupply) {
        // 总体
        supplyMap[cat] = (supplyMap[cat] || 0) + 1;
        // 校区分布
        campusBreakdown[campus] = campusBreakdown[campus] || {};
        campusBreakdown[campus][cat] = campusBreakdown[campus][cat] || { supply: 0, demand: 0 };
        campusBreakdown[campus][cat].supply += 1;
      }
    });

    wantResData.forEach(item => {
      const cat = item.productCategory || '其他';
      const user = wantUsersByOpenId[item._openid];
      const campus = getCampusFromUser(user);
      demandMap[cat] = (demandMap[cat] || 0) + 1;
      campusBreakdown[campus] = campusBreakdown[campus] || {};
      campusBreakdown[campus][cat] = campusBreakdown[campus][cat] || { supply: 0, demand: 0 };
      campusBreakdown[campus][cat].demand += 1;
    });

    // 如果指定校区，则使用该校区下的供需统计替换总体视图
    let effectiveSupplyMap = supplyMap;
    let effectiveDemandMap = demandMap;
    if (campusFilter && campusBreakdown[campusFilter]) {
      const campusStats = campusBreakdown[campusFilter];
      effectiveSupplyMap = {};
      effectiveDemandMap = {};
      Object.keys(campusStats).forEach(cat => {
        effectiveSupplyMap[cat] = campusStats[cat].supply || 0;
        effectiveDemandMap[cat] = campusStats[cat].demand || 0;
      });
    }

    // 汇总所有出现过的类别
    const allCats = new Set([...Object.keys(effectiveSupplyMap), ...Object.keys(effectiveDemandMap)]);
    const stats = Array.from(allCats).map(cat => {
      const supply = effectiveSupplyMap[cat] || 0;
      const demand = effectiveDemandMap[cat] || 0;
      return {
        category: cat,
        supply,
        demand,
        gap: demand - supply
      };
    }).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

    // 价格与交易方式指引
    const categoryGuides = {};
    const methodCountByCat = {};
    const priceByCat = {};
    productRes.data.forEach(item => {
      const status = item.status || '';
      if (!supplyStatuses.has(status)) return;
      const cat = item.productCategory || '其他';
      const price = (typeof item.salePrice === 'number' && item.salePrice > 0) ? item.salePrice
        : ((typeof item.suggestedPrice === 'number' && item.suggestedPrice > 0) ? item.suggestedPrice : null);
      if (price !== null) {
        priceByCat[cat] = priceByCat[cat] || [];
        priceByCat[cat].push(price);
      }
      const method = item.transactionMethod || '面交';
      methodCountByCat[cat] = methodCountByCat[cat] || {};
      methodCountByCat[cat][method] = (methodCountByCat[cat][method] || 0) + 1;
    });
    Object.keys(allCats).forEach(() => {}); // no-op to satisfy lint
    for (const cat of allCats) {
      const prices = priceByCat[cat] || [];
      let guide = { avgPrice: 0, minPrice: 0, maxPrice: 0, typicalPriceRange: '', commonTrade: '面交', methodsRanked: [] };
      if (prices.length > 0) {
        const sum = prices.reduce((a, b) => a + b, 0);
        const avg = Math.round((sum / prices.length) * 100) / 100;
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        guide.avgPrice = avg;
        guide.minPrice = min;
        guide.maxPrice = max;
        guide.typicalPriceRange = `${Math.round(min)}-${Math.round(max)}`;
      }
      const mc = methodCountByCat[cat] || {};
      const ranked = Object.entries(mc).sort((a, b) => b[1] - a[1]).map(([m]) => m);
      guide.commonTrade = ranked[0] || '面交';
      guide.methodsRanked = ranked;
      categoryGuides[cat] = guide;
    }

    // 生成建议（支持forType与兴趣权重）
    const shortage = stats.filter(s => s.gap >= 3).sort((a, b) => b.gap - a.gap).slice(0, 5);
    const oversupply = stats.filter(s => (s.supply - s.demand) >= 3).sort((a, b) => (b.supply - b.demand) - (a.supply - a.demand)).slice(0, 5);
    const hotDemand = [...stats].sort((a, b) => b.demand - a.demand).slice(0, 5);
    const richSupply = [...stats].sort((a, b) => b.supply - a.supply).slice(0, 5);

    const interestSet = new Set((interestsFromEvent || []).map(i => i));
    let candidates = [];
    let baseMessage = '';
    if (forType === 'product') {
      candidates = (shortage.length > 0 ? shortage : hotDemand);
      baseMessage = shortage.length > 0 ? '以下类别买家需求旺盛、供给偏少，优先发布：' : '以下类别近期需求较高，发布更易成交：';
    } else if (forType === 'wanted') {
      candidates = (oversupply.length > 0 ? oversupply : richSupply);
      baseMessage = oversupply.length > 0 ? '以下类别货源充足、响应更快，建议求购：' : '以下类别当前货源较多，求购更容易被响应：';
    } else {
      candidates = shortage.slice(0, 3);
      baseMessage = '供需缺口较大的类别：';
    }

    // 应用兴趣加权
    const scored = candidates.map(c => {
      const interestBoost = interestSet.has(c.category) ? 1 : 0;
      const score = (Math.abs(c.gap) || 0) + interestBoost;
      return { cat: c.category, score };
    }).sort((a, b) => b.score - a.score);

    const recommended = scored.map(s => s.cat);
    const message = `${baseMessage}${recommended.join('、')}`;

    return {
      success: true,
      data: {
        stats,
        shortage,
        oversupply,
        hotDemand,
        richSupply,
        recommended,
        message,
        campus: '全部校区',
        interestsUsed: Array.from(interestSet),
        categoryGuides,
        campusBreakdown
      }
    };
  } catch (e) {
    console.error('计算发布建议失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};

// 管理员：一键推送建议到用户群（不分校区）
const adminPushRecommendations = async (event) => {
  try {
    const categories = Array.isArray(event.categories) ? event.categories : [];
    const target = event.target || 'sellers'; // sellers | buyers | all
    const campus = ''; // 不分校区
    const customMessage = event.message || '';

    // 本地工具：从用户资料推断校区
    const getCampusFromUserLocal = (user) => {
      if (!user) return '未知';
      if (user.campus) return user.campus;
      const dorm = user.dorm || user.sushe || '';
      if (/闵行/.test(dorm)) return '闵行校区';
      if (/徐汇/.test(dorm)) return '徐汇校区';
      if (/松江/.test(dorm)) return '松江校区';
      return '未知';
    };

    if (categories.length === 0) {
      return { success: false, error: '缺少要推送的类别列表' };
    }

    // 查询用户（按兴趣筛选，不分校区）
    const userQuery = {};
    // 拉取可能的兴趣用户（这里不在where里使用数组匹配，改为拉取后过滤，兼容旧数据）
    const usersRes = await db.collection('T_user').where(userQuery).field({ _id: true, _openid: true, interests: true, campus: true, sushe: true, notificationEnabled: true, sname: true }).get();

    // 可能的买家（发布过求购）
    let wantUsersOpenIds = new Set();
    try {
      const wantRes = await db.collection('T_want').where({ productCategory: _.in(categories) }).field({ _openid: true }).get();
      wantRes.data.forEach(w => { if (w._openid) wantUsersOpenIds.add(w._openid); });
    } catch (err) {
      // ignore
    }

    // 过滤用户：兴趣命中或是活跃求购用户
    const getCampus = (u) => u.campus || getCampusFromUserLocal(u);
    const recipients = [];
    usersRes.data.forEach(u => {
      const enabled = (u.notificationEnabled !== false);
      if (!enabled) return;
      const campusOk = true;
      const interests = Array.isArray(u.interests) ? u.interests : [];
      const interestHit = interests.some(i => categories.includes(i));
      const wantHit = wantUsersOpenIds.has(u._openid);
      if (campusOk && (interestHit || (target !== 'sellers' && wantHit) || target === 'all')) {
        recipients.push(u);
      }
    });

    // 写入通知集合
    let successCount = 0;
    for (const user of recipients) {
      try {
        const content = customMessage || `当前【${categories.join('、')}】类别存在供需变化，建议关注并发布/求购。`;
        await db.collection('T_notify').add({
          data: {
            userId: user._id,
            _openid: user._openid,
            type: 'recommendation',
            title: '供需发布建议',
            content,
            categories,
            campus: '全部校区',
            target,
            read: false,
            createTime: new Date()
          }
        });
        successCount += 1;
      } catch (err) {
        console.error('写入通知失败:', err);
      }
    }

    return { success: true, pushed: successCount, recipients: recipients.length };
  } catch (e) {
    console.error('管理员推送建议失败:', e);
    return { success: false, error: e.message };
  }
};

// 管理员更新商品
const adminUpdateProduct = async (event) => {
  try {
    const { productId, data } = event;
    
    if (!productId) {
      return {
        success: false,
        error: '缺少商品ID'
      };
    }

    await db.collection('T_product').doc(productId).update({
      data: {
        ...data,
        updateTime: new Date()
      }
    });

    return {
      success: true,
      message: '更新成功'
    };
  } catch (e) {
    console.error('更新商品失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};

// 管理员删除商品（下架）
const adminDeleteProduct = async (event) => {
  try {
    const { productId } = event;
    
    if (!productId) {
      return {
        success: false,
        error: '缺少商品ID'
      };
    }

    // 更新商品状态为已下架
    await db.collection('T_product').doc(productId).update({
      data: {
        status: '已下架',
        updateTime: new Date()
      }
    });

    return {
      success: true,
      message: '商品已下架'
    };
  } catch (e) {
    console.error('下架商品失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};

// 管理员获取用户列表
const adminGetUsers = async (event) => {
  try {
    const { page = 0, pageSize = 20, keyword = '' } = event;
    
    let queryCondition = {};
    
    if (keyword) {
      // 微信小程序云数据库使用db.RegExp
      const regex = db.RegExp({
        regexp: keyword,
        options: 'i'
      });
      queryCondition = _.or([
        { sno: regex },
        { sname: regex },
        { phone: regex }
      ]);
    }

    const result = await db.collection('T_user')
      .where(queryCondition)
      .skip(page * pageSize)
      .limit(pageSize)
      .orderBy('createTime', 'desc')
      .get();

    const countResult = await db.collection('T_user')
      .where(queryCondition)
      .count();

    return {
      success: true,
      data: {
        users: result.data,
        total: countResult.total,
        page: page,
        pageSize: pageSize
      }
    };
  } catch (e) {
    console.error('获取用户列表失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};

// 管理员更新用户信息
const adminUpdateUser = async (event) => {
  try {
    const { userId, data } = event;
    
    console.log('管理员更新用户信息，userId:', userId, 'data:', JSON.stringify(data, null, 2));
    
    if (!userId) {
      return {
        success: false,
        error: '缺少用户ID'
      };
    }

    // 检查用户是否存在
    const userDoc = await db.collection('T_user').doc(userId).get();
    if (!userDoc.data) {
      return {
        success: false,
        error: '用户不存在'
      };
    }

    // 更新用户信息
    const updateResult = await db.collection('T_user').doc(userId).update({
      data: {
        ...data,
        updateTime: new Date()
      }
    });

    console.log('更新用户信息成功，结果:', updateResult);

    return {
      success: true,
      message: '更新成功',
      data: updateResult
    };
  } catch (e) {
    console.error('更新用户失败:', e);
    return {
      success: false,
      error: e.message || '更新失败'
    };
  }
};

// 安全订单状态更新（基于角色和状态流转校验）
const updateOrderStatus = async (event) => {
  try {
    const { orderId, action, callerUserId } = event || {};
    if (!orderId || !action) {
      return { success: false, error: '缺少必要参数：orderId 或 action' };
    }

    const ctx = cloud.getWXContext();
    const callerOpenId = ctx.OPENID || event.openid || '';

    const orderRes = await db.collection('T_order').doc(orderId).get();
    const order = orderRes.data;
    if (!order) {
      return { success: false, error: '订单不存在' };
    }

    const flows = {
      buyerPay: { from: '待付款', to: '待确认付款', role: 'buyer' },
      sellerConfirmPayment: { from: '待确认付款', to: '待发货', role: 'seller' },
      sellerShip: { from: '待发货', to: '待收货', role: 'seller' },
      buyerConfirmReceipt: { from: '待收货', to: '已完成', role: 'buyer' },
      buyerCancel: { from: '待付款', to: '已取消', role: 'buyer' }
    };

    const flow = flows[action];
    if (!flow) {
      return { success: false, error: '不支持的动作' };
    }

    const isSeller = (
      (order.sellerOpenId && order.sellerOpenId === callerOpenId) ||
      (order.sellerUserId && callerUserId && order.sellerUserId === callerUserId)
    );
    const isBuyer = (
      (order.buyerOpenId && order.buyerOpenId === callerOpenId) ||
      (order.buyerUserId && callerUserId && order.buyerUserId === callerUserId)
    );

    if (flow.role === 'seller' && !isSeller) {
      return { success: false, error: '无权执行：仅卖家可进行该操作' };
    }
    if (flow.role === 'buyer' && !isBuyer) {
      return { success: false, error: '无权执行：仅买家可进行该操作' };
    }

    if (order.status !== flow.from) {
      return { success: false, error: `状态不匹配：当前为${order.status}，期望${flow.from}` };
    }

    const now = new Date();
    const updates = { status: flow.to, updateTime: now };

    switch (action) {
      case 'buyerPay':
        updates.paymentTime = now;
        break;
      case 'sellerConfirmPayment':
        updates.sellerConfirmTime = now;
        break;
      case 'sellerShip':
        updates.shipTime = now;
        if (event.shipInfo) updates.shipInfo = event.shipInfo;
        break;
      case 'buyerConfirmReceipt':
        updates.finishTime = now;
        break;
      case 'buyerCancel':
        updates.cancelTime = now;
        break;
    }

    const updateRes = await db.collection('T_order')
      .where({ _id: orderId, status: flow.from })
      .update({ data: updates });

    if (!updateRes.stats || updateRes.stats.updated !== 1) {
      return { success: false, error: '更新失败或状态已变化，请刷新重试' };
    }

    // 写入系统聊天消息（买家/卖家互相通知订单状态）
    try {
      const buyerOpenId = order.buyerOpenId || '';
      const sellerOpenId = order.sellerOpenId || '';
      if (buyerOpenId && sellerOpenId) {
        const sessionKey = [buyerOpenId, sellerOpenId].sort().join('|');
        let fromOpenId = '';
        let toOpenId = '';
        let content = '';

        if (action === 'buyerPay') {
          fromOpenId = buyerOpenId;
          toOpenId = sellerOpenId;
          content = `[系统] 买家已付款：订单号 ${order.orderNumber}，金额 ¥${order.totalPrice}`;
        } else if (action === 'sellerConfirmPayment') {
          fromOpenId = sellerOpenId;
          toOpenId = buyerOpenId;
          content = `[系统] 卖家已确认收款：订单号 ${order.orderNumber}`;
        } else if (action === 'sellerShip') {
          fromOpenId = sellerOpenId;
          toOpenId = buyerOpenId;
          const shipText = event.shipInfo ? `，物流：${event.shipInfo}` : '';
          content = `[系统] 卖家已发货：订单号 ${order.orderNumber}${shipText}`;
        } else if (action === 'buyerConfirmReceipt') {
          fromOpenId = buyerOpenId;
          toOpenId = sellerOpenId;
          content = `[系统] 买家已确认收货：订单号 ${order.orderNumber}`;
        } else if (action === 'buyerCancel') {
          fromOpenId = buyerOpenId;
          toOpenId = sellerOpenId;
          content = `[系统] 买家已取消订单：订单号 ${order.orderNumber}`;
        }

        if (fromOpenId && toOpenId && content) {
          const buyerUserId = order.buyerUserId || '';
          const sellerUserId = order.sellerUserId || '';
          const sessionKeyUser = (buyerUserId && sellerUserId) ? [buyerUserId, sellerUserId].sort().join('|') : '';

          let fromUserId = '';
          let toUserId = '';
          if (action === 'buyerPay' || action === 'buyerConfirmReceipt' || action === 'buyerCancel') {
            fromUserId = buyerUserId;
            toUserId = sellerUserId;
          } else {
            // sellerConfirmPayment / sellerShip
            fromUserId = sellerUserId;
            toUserId = buyerUserId;
          }

          const chatDoc = {
            fromOpenId,
            toOpenId,
            fromUserId,
            toUserId,
            sessionKey,
            sessionKeyUser,
            contentType: 'text',
            content,
            timestamp: Date.now(),
            orderId: orderId,
            productId: order.productId || (Array.isArray(order.products) && order.products.length === 1 ? order.products[0].productId : ''),
            isSystem: true
          };
          try {
            await db.collection('T_chat').add({ data: chatDoc });
          } catch (e) {
            // 如果集合不存在，先创建再重试一次
            if (String(e.errMsg || '').includes('does not exist') || e.errCode === -502005) {
              await createChatCollection();
              await db.collection('T_chat').add({ data: chatDoc });
            } else {
              throw e;
            }
          }
        }
      }
    } catch (e) {
      // 聊天消息写入失败不影响主流程
      console.error('写入订单状态聊天消息失败:', e);
    }

    if (action === 'buyerConfirmReceipt' && order.productId) {
      try {
        await db.collection('T_product').doc(order.productId).update({
          data: { status: '已售', updateTime: now }
        });
      } catch (e) {
        console.error('更新商品为已售失败:', e);
        return { success: true, warning: '订单完成成功，但商品状态更新失败', newStatus: flow.to };
      }
      try {
        const pr = await db.collection('T_product').doc(order.productId).get();
        const p = pr.data || {};
        const name = String(p.tradeLandmarkName || p.tradeLocationName || p.tradeAddress || '').trim();
        const lat = Number(p.tradeLocationLat);
        const lng = Number(p.tradeLocationLng);
        if (name && Number.isFinite(lat) && Number.isFinite(lng)) {
          await upsertCampusLandmark({ name, latitude: lat, longitude: lng, address: String(p.tradeAddress || ''), source: 'product', productId: order.productId, selling: false });
        }
      } catch (e) {
        console.error('同步地标为非在售失败:', e);
      }
    }

    return { success: true, newStatus: flow.to };
  } catch (e) {
    console.error('安全更新订单状态失败:', e);
    return { success: false, error: e.message };
  }
};

// 创建论坛集合
const createForumCollection = async () => {
  try {
    const collections = await db.listCollections();
    const collectionNames = collections.data.map(col => col.name);
    
    const collectionsToCreate = ['T_forum_post', 'T_forum_comment', 'T_forum_like'];
    const created = [];
    
    for (const collectionName of collectionsToCreate) {
      if (!collectionNames.includes(collectionName)) {
        try {
          await db.createCollection(collectionName);
          created.push(collectionName);
          console.log(`${collectionName} 集合创建成功`);
        } catch (err) {
          if (err.message && !err.message.includes('already exists')) {
            console.error(`创建 ${collectionName} 失败:`, err);
          }
        }
      }
    }
    
    return {
      success: true,
      message: created.length > 0 ? `成功创建 ${created.join(', ')} 集合` : "所有集合已存在",
      created: created
    };
  } catch (e) {
    console.error('创建论坛集合失败:', e);
    return {
      success: false,
      error: e.message,
    };
  }
};

// 计算余弦相似度
const cosineSimilarity = (vecA, vecB) => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  
  for (const key of keys) {
    const a = vecA[key] || 0;
    const b = vecB[key] || 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// 基于用户的协同过滤推荐
const userBasedCF = async (openid, limit = 10) => {
  try {
    // 获取所有用户行为数据
    const allBehaviors = await db.collection('T_user_behavior').get();
    
    if (allBehaviors.data.length === 0) {
      return [];
    }
    
    // 构建用户-商品评分矩阵
    const userProductMatrix = {};
    allBehaviors.data.forEach(behavior => {
      const userId = behavior._openid;
      const productId = behavior.productId;
      const score = behavior.score * (behavior.count || 1); // 考虑行为次数
      
      if (!userProductMatrix[userId]) {
        userProductMatrix[userId] = {};
      }
      userProductMatrix[userId][productId] = (userProductMatrix[userId][productId] || 0) + score;
    });
    
    // 获取当前用户的行为数据
    const currentUserProducts = userProductMatrix[openid] || {};
    
    if (Object.keys(currentUserProducts).length === 0) {
      return []; // 新用户，没有行为数据
    }
    
    // 计算当前用户与其他用户的相似度
    const userSimilarities = [];
    for (const userId in userProductMatrix) {
      if (userId === openid) continue;
      
      const similarity = cosineSimilarity(currentUserProducts, userProductMatrix[userId]);
      if (similarity > 0) {
        userSimilarities.push({
          userId: userId,
          similarity: similarity
        });
      }
    }
    
    // 按相似度排序
    userSimilarities.sort((a, b) => b.similarity - a.similarity);
    
    // 获取相似用户喜欢的商品（当前用户未交互过的）
    const recommendedProducts = {};
    const topSimilarUsers = userSimilarities.slice(0, 20); // 取前20个相似用户
    
    for (const similarUser of topSimilarUsers) {
      const similarUserProducts = userProductMatrix[similarUser.userId];
      for (const productId in similarUserProducts) {
        if (!currentUserProducts[productId]) {
          // 当前用户未交互过的商品
          const score = similarUserProducts[productId] * similarUser.similarity;
          recommendedProducts[productId] = (recommendedProducts[productId] || 0) + score;
        }
      }
    }
    
    // 转换为数组并排序
    const productScores = Object.entries(recommendedProducts)
      .map(([productId, score]) => ({ productId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    return productScores.map(item => item.productId);
  } catch (e) {
    console.error('基于用户的协同过滤失败:', e);
    return [];
  }
};

// 基于物品的协同过滤推荐
const itemBasedCF = async (openid, limit = 10) => {
  try {
    // 获取所有用户行为数据
    const allBehaviors = await db.collection('T_user_behavior').get();
    
    if (allBehaviors.data.length === 0) {
      return [];
    }
    
    // 构建商品-用户评分矩阵
    const productUserMatrix = {};
    allBehaviors.data.forEach(behavior => {
      const productId = behavior.productId;
      const userId = behavior._openid;
      const score = behavior.score * (behavior.count || 1);
      
      if (!productUserMatrix[productId]) {
        productUserMatrix[productId] = {};
      }
      productUserMatrix[productId][userId] = (productUserMatrix[productId][userId] || 0) + score;
    });
    
    // 获取当前用户交互过的商品
    const currentUserBehaviors = await db.collection('T_user_behavior')
      .where({
        _openid: openid
      })
      .get();
    
    if (currentUserBehaviors.data.length === 0) {
      return []; // 新用户
    }
    
    const currentUserProducts = {};
    currentUserBehaviors.data.forEach(behavior => {
      currentUserProducts[behavior.productId] = behavior.score * (behavior.count || 1);
    });
    
    // 计算当前用户交互过的商品与其他商品的相似度
    const productSimilarities = {};
    
    for (const productId in currentUserProducts) {
      if (!productUserMatrix[productId]) continue;
      
      const currentProductUsers = productUserMatrix[productId];
      
      // 计算与其他商品的相似度
      for (const otherProductId in productUserMatrix) {
        if (otherProductId === productId || currentUserProducts[otherProductId]) {
          continue; // 跳过自己或已交互过的商品
        }
        
        const similarity = cosineSimilarity(currentProductUsers, productUserMatrix[otherProductId]);
        if (similarity > 0) {
          const weightedScore = currentUserProducts[productId] * similarity;
          productSimilarities[otherProductId] = (productSimilarities[otherProductId] || 0) + weightedScore;
        }
      }
    }
    
    // 转换为数组并排序
    const productScores = Object.entries(productSimilarities)
      .map(([productId, score]) => ({ productId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    return productScores.map(item => item.productId);
  } catch (e) {
    console.error('基于物品的协同过滤失败:', e);
    return [];
  }
};

// 根据用户兴趣推荐商品（保留原有功能作为备用）
const getRecommendedProductsByInterest = async (userInterests, limit) => {
  const mappedInterests = userInterests.map(cat => mapCategoryName(cat));
  
  let queryCondition = {
    status: '在售'
  };
  
  if (mappedInterests.length > 0) {
      queryCondition.productCategory = _.in(mappedInterests);
  }
  
  const result = await db.collection("T_product")
    .where(queryCondition)
    .orderBy('createTime', 'desc')
    .limit(limit)
    .get();
  
  return result.data.map(item => item._id);
};

// 根据用户兴趣推荐商品（增强版：结合协同过滤）
const getRecommendedProducts = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const userInterests = event.interests || [];
    const limit = event.limit || 8;
    const useCF = event.useCF !== false; // 默认使用协同过滤
    
    console.log('获取推荐商品，openid:', openid, '使用协同过滤:', useCF);
    
    let recommendedProductIds = [];
    
    // 优先使用协同过滤算法
    if (useCF) {
      try {
        // 尝试基于用户的协同过滤
        const userCFIds = await userBasedCF(openid, limit);
        console.log('基于用户的CF推荐数量:', userCFIds.length);
        
        // 如果基于用户的CF结果不足，尝试基于物品的CF
        if (userCFIds.length < limit) {
          const itemCFIds = await itemBasedCF(openid, limit - userCFIds.length);
          console.log('基于物品的CF推荐数量:', itemCFIds.length);
          
          // 合并结果，去重
          const allCFIds = [...new Set([...userCFIds, ...itemCFIds])];
          recommendedProductIds = allCFIds.slice(0, limit);
        } else {
          recommendedProductIds = userCFIds;
        }
        
        console.log('协同过滤推荐商品ID:', recommendedProductIds);
      } catch (cfError) {
        console.error('协同过滤推荐失败，使用兴趣推荐:', cfError);
        recommendedProductIds = [];
      }
    }
    
    // 如果协同过滤结果不足，使用兴趣推荐补充
    if (recommendedProductIds.length < limit && userInterests.length > 0) {
      const interestIds = await getRecommendedProductsByInterest(userInterests, limit - recommendedProductIds.length);
      // 去重并合并
      const allIds = [...new Set([...recommendedProductIds, ...interestIds])];
      recommendedProductIds = allIds.slice(0, limit);
    }
    
    // 如果还是没有足够的推荐，获取热门商品
    if (recommendedProductIds.length < limit) {
      const hotProducts = await db.collection("T_product")
        .where({
          status: '在售'
        })
        .orderBy('createTime', 'desc')
        .limit(limit - recommendedProductIds.length)
        .get();
      
      const hotIds = hotProducts.data.map(item => item._id);
      const allIds = [...new Set([...recommendedProductIds, ...hotIds])];
      recommendedProductIds = allIds.slice(0, limit);
    }
    
    // 根据ID获取商品详细信息
    const products = [];
    for (const productId of recommendedProductIds) {
      try {
        const productDoc = await db.collection("T_product").doc(productId).get();
        if (productDoc.data && productDoc.data.status === '在售') {
          const item = productDoc.data;
          products.push({
            id: item._id,
            name: item.productName || '商品名称',
            price: item.salePrice || item.suggestedPrice || item.originalPrice || 0,
            image: Array.isArray(item.productImage) ? (item.productImage[0] || '') : (item.productImage || 'https://via.placeholder.com/280x200/4285F4/ffffff?text=商品'),
            tag: item.productCategory || '其他',
            category: item.productCategory || '其他',
            description: item.productDescription || '',
            createTime: item.createTime
          });
        }
      } catch (err) {
        console.error('获取商品详情失败:', productId, err);
      }
    }
    
    console.log('最终推荐商品数量:', products.length);
    
    return {
      success: true,
      data: products,
      count: products.length,
      message: products.length === 0 ? '暂无推荐商品' : '推荐商品加载成功',
      algorithm: useCF && recommendedProductIds.length > 0 ? '协同过滤' : '兴趣推荐'
    };
  } catch (e) {
    console.error('获取推荐商品失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 获取操作类型，支持多种参数格式
    const type = event.type || event.userInfo?.type || (event.tcbContext && event.tcbContext.type);
    
    console.log('云函数被调用，type:', type);
    console.log('event参数:', JSON.stringify(event, null, 2));
    
    if (!type) {
      return {
        success: false,
        error: '缺少操作类型参数(type)',
        event: event
      };
    }
    
    // 添加调试日志
    console.log('开始执行switch，type值:', type, '类型:', typeof type);
    
  switch (type) {
      case "getOpenId":
        return await getOpenId();
      case "getMiniProgramCode":
        return await getMiniProgramCode();
      case "createCollection":
        return await createCollection();
      case "selectRecord":
        return await selectRecord();
      case "updateRecord":
        return await updateRecord(event);
      case "insertRecord":
        return await insertRecord(event);
      case "deleteRecord":
        return await deleteRecord(event);
      case "queryTUser":
        return await queryTUser();
      case "addTestUser":
        return await addTestUser(event);
      case "analyzeProductPrice":
        return await analyzeProductPrice(event);
      case "getUserByOpenId":
        return await getUserByOpenId(event);
      case "getProductCategories":
        return await getProductCategories();
      case "updateUserInterests":
        return await updateUserInterests(event);
      case "getRecommendedProducts":
        console.log('匹配到getRecommendedProducts case');
        return await getRecommendedProducts(event);
      case "getPublishRecommendations":
        // 基于分类供需对比的发布建议（商品/求购）
        return await getPublishRecommendations(event);
      case "adminPushRecommendations":
        // 管理员一键推送建议到指定用户群
        return await adminPushRecommendations(event);
      case "recordUserBehavior":
        return await recordUserBehavior(event);
      case "createBehaviorCollection":
        return await createBehaviorCollection();
      case "createForumCollection":
        return await createForumCollection();
      case "createNotifyCollection":
        return await createNotifyCollection();
      case "createChatCollection":
        return await createChatCollection();
      case "createMessageCollection":
        return await createMessageCollection();
      case "sendChatMessage":
        return await sendChatMessage(event);
      case "getChatMessages":
        return await getChatMessages(event);
      case "listChatSessions":
        return await listChatSessions();
      case "updateChatReadState":
        return await updateChatReadState(event);
      case "revokeChatMessage":
        return await revokeChatMessage(event);
      case "backfillSellerUserId":
        // 批量为商品补齐缺失的卖家用户ID（通过 sellerOpenId 关联 T_user）
        return await backfillSellerUserId(event);
      case "createAddressCollection":
        return await createAddressCollection();
      case "createCampusLandmarksCollection":
        return await createCampusLandmarksCollection();
      case "seedDefaultAddress":
        return await seedDefaultAddress(event);
      case "adminLogin":
        console.log('匹配到adminLogin case');
        return await adminLogin(event);
      case "getAdminStats":
        return await getAdminStats();
      case "getWantedKeywordCloud":
        // 管理端词云：求购关键词聚合
        return await getWantedKeywordCloud(event);
      case "adminUpdateProduct":
        return await adminUpdateProduct(event);
      case "adminDeleteProduct":
        return await adminDeleteProduct(event);
      case "adminGetUsers":
        return await adminGetUsers(event);
      case "adminUpdateUser":
        return await adminUpdateUser(event);
      case "updateOrderStatus":
        // 安全更新订单状态（带角色和状态校验）
        return await updateOrderStatus(event);
      case "initCategoryTable":
        return await initCategoryTable();
      case "cloudReverseGeocode":
        return await cloudReverseGeocode(event);
      case "cloudGeocode":
        return await cloudGeocode(event);
      case "fixProductCoords":
        // 批量修复商品缺失坐标（地标匹配 + 地址地理编码）
        return await fixProductCoords(event);
      case "upsertCampusLandmark":
        // 上报/同步单条地标
        return await upsertCampusLandmark(event);
      case "syncProductLandmarks":
        // 批量从商品同步地标到 T_campus_landmarks
        return await syncProductLandmarks(event);
      default:
        console.log('未匹配到任何case，type:', type, 'type类型:', typeof type);
        return {
          success: false,
          error: '未知的操作类型: ' + type
        };
    }
  } catch (error) {
    console.error('========== 云函数入口函数错误 ==========');
    console.error('错误信息:', error.message);
    console.error('错误堆栈:', error.stack);
    console.error('event:', JSON.stringify(event, null, 2));
    
    const type = event.type || event.userInfo?.type || (event.tcbContext && event.tcbContext.type);
    
    return {
      success: false,
      error: error.message || '云函数执行失败',
      details: error.stack,
      type: type
    };
  }
};
