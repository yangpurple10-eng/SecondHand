// utils/recommendation.js
// 行为权重与推荐算法（本地轻量级实时推荐）
const DEFAULT_WEIGHTS = {
  categories: {},
  keywords: {},
  lastUpdated: null
};

function getStoreKey() {
  return 'behaviorWeights';
}

function loadWeights() {
  try {
    const w = wx.getStorageSync(getStoreKey());
    if (w && typeof w === 'object') return w;
  } catch (e) {}
  return { ...DEFAULT_WEIGHTS };
}

function saveWeights(w) {
  try {
    w.lastUpdated = Date.now();
    wx.setStorageSync(getStoreKey(), w);
  } catch (e) {}
}

function inc(map, key, delta) {
  if (!key) return;
  const k = String(key).trim();
  if (!k) return;
  map[k] = (map[k] || 0) + (delta || 1);
  if (map[k] < 0) map[k] = 0; // 不允许为负，便于稳定排序
}

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  const t = text.toLowerCase();
  // 基础分词：空白/标点分割，保留中文词串
  const rough = t.split(/[\s,;，。.!！?？\-_/]+/).filter(Boolean);
  // 去重并限制长度
  const seen = new Set();
  const out = [];
  for (let i = 0; i < rough.length && out.length < 20; i++) {
    const token = rough[i].trim();
    if (!token) continue;
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

// 记录：注册兴趣 -> 类别权重
function recordInterests(interests, weight = 5) {
  const w = loadWeights();
  (interests || []).forEach(cat => inc(w.categories, cat, weight));
  saveWeights(w);
}

// 记录：搜索关键词（商品/求购）
function recordSearch(keyword, type = 'product') {
  const w = loadWeights();
  const base = type === 'wanted' ? 2 : 3; // 商品搜索更强一点
  tokenize(keyword).forEach(k => inc(w.keywords, k, base));
  saveWeights(w);
}

// 记录：浏览商品详情（类别 + 关键词）
function recordView(product) {
  const w = loadWeights();
  inc(w.categories, product?.productCategory || product?.category || '其他', 1);
  const nameTokens = tokenize(product?.productName || '');
  const descTokens = tokenize(product?.productDescription || product?.description || '');
  [...nameTokens, ...descTokens].slice(0, 15).forEach(k => inc(w.keywords, k, 1));
  saveWeights(w);
}

// 记录：点击商品卡片（比浏览稍高）
function recordClick(product) {
  const w = loadWeights();
  inc(w.categories, product?.productCategory || product?.category || '其他', 2);
  const nameTokens = tokenize(product?.productName || '');
  const descTokens = tokenize(product?.productDescription || product?.description || '');
  [...nameTokens, ...descTokens].slice(0, 15).forEach(k => inc(w.keywords, k, 2));
  saveWeights(w);
  try {
    const cat = product?.productCategory || product?.category || '其他';
    const pid = product?._id || product?.id || '';
    wx.setStorageSync('lastInteraction', { category: cat, productId: pid, ts: Date.now() });
  } catch (e) {}
}

// 记录：收藏商品（比点击更高，表示强偏好）
function recordFavorite(product) {
  const w = loadWeights();
  inc(w.categories, product?.productCategory || product?.category || '其他', 4);
  const nameTokens = tokenize(product?.productName || product?.name || '');
  const descTokens = tokenize(product?.productDescription || product?.description || '');
  [...nameTokens, ...descTokens].slice(0, 20).forEach(k => inc(w.keywords, k, 4));
  saveWeights(w);
  try {
    const cat = product?.productCategory || product?.category || '其他';
    const pid = product?._id || product?.id || '';
    wx.setStorageSync('lastInteraction', { category: cat, productId: pid, ts: Date.now() });
  } catch (e) {}
}

// 记录：取消收藏（轻度降低偏好）
function recordUnfavorite(product) {
  const w = loadWeights();
  inc(w.categories, product?.productCategory || product?.category || '其他', -2);
  const nameTokens = tokenize(product?.productName || product?.name || '');
  const descTokens = tokenize(product?.productDescription || product?.description || '');
  [...nameTokens, ...descTokens].slice(0, 20).forEach(k => inc(w.keywords, k, -2));
  saveWeights(w);
}

// 记录：发布求购（类别 + 关键词权重更高）
function recordPublishWanted(category, productName, description) {
  const w = loadWeights();
  inc(w.categories, category || '其他', 4);
  const tokens = [...tokenize(productName), ...tokenize(description)].slice(0, 20);
  tokens.forEach(k => inc(w.keywords, k, 4));
  saveWeights(w);
}

function getWeights() {
  return loadWeights();
}

function scoreProduct(product, weights) {
  const cat = product?.productCategory || product?.category || '其他';
  const catWeight = (weights.categories[cat] || 0) * 1; // 类别次要
  const nameTokens = tokenize(product?.productName || product?.name || '');
  const descTokens = tokenize(product?.productDescription || product?.description || '');
  const kw = weights.keywords || {};
  // 名称更重要，描述次之
  const nameScore = nameTokens.reduce((s, k) => s + (kw[k] || 0), 0);
  const descScore = descTokens.reduce((s, k) => s + Math.min((kw[k] || 0), 3), 0);
  const kwScore = nameScore * 2 + descScore * 1;
  // 轻度时间加成：越新越靠前
  let timeBoost = 0;
  const ct = product?.createTime ? new Date(product.createTime).getTime() : 0;
  if (ct) {
    const now = Date.now();
    const days = (now - ct) / (24 * 3600 * 1000);
    timeBoost = Math.max(0, 3 - Math.min(days, 7)); // 7天后加成耗尽
  }
  // 人气加成：浏览量等（仿电商平台，影响较轻）
  const vc = Number(product?.viewCount || 0);
  const popularity = Math.log(1 + Math.max(0, vc)) * 0.5; // 0~约2
  return catWeight + kwScore + timeBoost + popularity;
}

function reorderProductsByWeights(products) {
  const weights = getWeights();
  if (!products || products.length === 0) return [];
  const withScore = products.map(p => ({ p, s: scoreProduct(p, weights) }));
  withScore.sort((a, b) => b.s - a.s);
  return withScore.map(x => x.p);
}

module.exports = {
  recordInterests,
  recordSearch,
  recordView,
  recordClick,
  recordFavorite,
  recordUnfavorite,
  recordPublishWanted,
  getWeights,
  scoreProduct,
  reorderProductsByWeights,
  tokenize
};