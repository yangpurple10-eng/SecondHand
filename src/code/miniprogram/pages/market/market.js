// pages/market/market.js
const { haversineDistance, formatDistance } = require('../../utils/geo.js');
const { geocode } = require('../../utils/geocoder.js');
const { officialTradeSpots } = require('../../utils/campusMap.js');
const reco = require('../../utils/recommendation.js');
const normalizeStatus = (s) => {
  const raw = String(s || '').trim();
  const lower = raw.toLowerCase();
  if (raw === '在售' || lower === 'selling') return 'selling';
  if (raw === '已售' || raw === '已售出' || lower === 'sold') return 'sold';
  if (raw === '已下架' || raw.includes('下架') || lower === 'off') return 'off';
  if (raw === '交易中' || raw === '待确认付款' || raw === '待发货' || raw === '待收货' || raw === '待付款' || lower === 'transacting') return 'transacting';
  return 'selling';
};
const DISPLAY_LIMIT = 100;

Page({
  data: {
    categories: ['全部', '电子产品', '图书文具', '服装鞋帽', '家居用品', '运动户外', '美妆个护', '其他'],
    categoryIndex: 0,
    

    // 默认中心：中国民航大学（天津·东丽校区）图书馆附近
    center: { latitude: 39.1234, longitude: 117.3365 },
    myLocation: { latitude: null, longitude: null },
    mapScale: 16,
    mapRuntimeScale: 16,
    // 为商品标记分配稳定的 markerId，避免每次刷新导致气泡重建
    productMarkerIdMap: {},
    nextProductMarkerId: 1,

    allProducts: [],
    visibleProducts: [],
    displayMarkers: [],
    markerProductMap: {},
    landmarkMarkerMap: {},
    landmarkCategoryMap: {},
    // 数据库校园地标标记
    campusLandmarks: [],
    campusLandmarksForDisplay: [],
    campusLandmarkMarkers: [],
    // 用户默认地址坐标，以及其附近推荐交易点标记
    userAddressLoc: { latitude: null, longitude: null },
    tradeSpotMarkers: [],
    // 距离扫描圈与弹窗
    scanCircles: [],
    nearestModalVisible: false,
    nearestProducts: [],
    // 半径选择
    scanRadiusOptions: [300, 500, 1000, 2000, 3000],
    scanRadiusLabels: ['300m', '500m', '1km', '2km', '3km'],
    scanRadiusIndex: 2,
    scanRadius: 1000,
    nearestModalTitle: '距我最近（1km内）',
    
  },

  onLoad() {
    // 初始化地图上下文，避免后续获取中心失败
    try { this.mapCtx = wx.createMapContext('marketMap'); } catch (_) {}
    this.initLocation();
    this.loadProducts();
    this.loadCampusLandmarksMarkers();
    // 不再叠加推荐交易点，仅显示商品交易地点
  },

  onShow() {
    // 返回页面时再次尝试定位，避免首次拒绝权限后不再更新
    this.initLocation();
    // 保持地图与列表同步，仅展示商品标记
    this.loadProducts();
    this.loadCampusLandmarksMarkers();
    try {
      if (this.getTabBar && this.getTabBar()) {
        this.getTabBar().setSelected(1);
      }
    } catch (e) {}
  },

  /** 读取 T_campus_landmarks 并生成地标标记 */
  async loadCampusLandmarksMarkers() {
    const db = wx.cloud.database();
    try {
      const res = await db.collection('T_campus_landmarks').limit(500).get();
      const list = (res.data || [])
        .filter(x => Number.isFinite(Number(x.latitude)) && Number.isFinite(Number(x.longitude)))
        .filter(x => (typeof x.selling === 'boolean') ? x.selling === true : true);

      // 并发拉取商品信息：缩略图与分类
      const resolveProductInfo = async (pid) => {
        if (!pid) return { thumbUrl: '', category: '', status: '', statusNormalized: 'off' };
        try {
          const pr = await db.collection('T_product').doc(pid).get();
          const p = pr.data || {};
          let url = '';
          if (Array.isArray(p.productImage) && p.productImage.length > 0) url = p.productImage[0];
          else if (typeof p.productImage === 'string') url = p.productImage;
          else if (Array.isArray(p.imageUrls) && p.imageUrls.length > 0) url = p.imageUrls[0];
          else if (typeof p.imageUrl === 'string') url = p.imageUrl;
          const category = p.productCategory || p.category || '';
          const status = p.status || '';
          const statusNormalized = normalizeStatus(status);
          return { thumbUrl: (url || ''), category, status, statusNormalized };
        } catch (_) {
          return { thumbUrl: '', category: '', status: '', statusNormalized: 'off' };
        }
      };
      const toLocalIcon = async (url) => {
        if (!url) return '/images/更多犬种.png';
        try {
          if (url.startsWith('cloud://')) {
            const t = await wx.cloud.getTempFileURL({ fileList: [url] });
            const temp = (t.fileList && t.fileList[0] && t.fileList[0].tempFileURL) || '';
            if (!temp) return '/images/更多犬种.png';
            const info = await wx.getImageInfo({ src: temp });
            return info && info.path ? info.path : '/images/更多犬种.png';
          }
          const info = await wx.getImageInfo({ src: url });
          return info && info.path ? info.path : '/images/更多犬种.png';
        } catch (_) {
          return '/images/更多犬种.png';
        }
      };

      const concurrency = 6;
      let idx = 0;
      const landmarks = [];
      const markers = [];
      const landmarkMarkerMap = {};
      const landmarkCategoryMap = {};
      const worker = async () => {
        while (idx < list.length) {
          // capture index before awaits to keep ids stable per item
          const i = idx++;
          const x = list[i];
          const name = x.name || x.normalizedName || '';
          const latitude = Number(x.latitude);
          const longitude = Number(x.longitude);
          const address = x.address || '';
          const productIds = Array.isArray(x.productIds) ? x.productIds : [];
          let chosenPid = '';
          let info = { thumbUrl: '', category: '', statusNormalized: 'off' };
          const landmarkSelling = (typeof x.selling === 'boolean') ? x.selling : undefined;
          const storedCategory = x.productCategory || '';
          const storedThumb = x.thumbUrl || '';
          if (landmarkSelling === true) {
            chosenPid = productIds[0] || '';
            if (chosenPid) info = await resolveProductInfo(chosenPid);
          } else if (landmarkSelling === false) {
            continue;
          } else {
            for (let k = 0; k < Math.min(productIds.length, 5); k++) {
              const pidTry = productIds[k];
              const iTry = await resolveProductInfo(pidTry);
              if (iTry.statusNormalized === 'selling') {
                chosenPid = pidTry;
                info = iTry;
                break;
              }
            }
          }
          const resolvedThumb = info.thumbUrl || storedThumb;
          const resolvedCategory = info.category || storedCategory;
          const iconPath = await toLocalIcon(resolvedThumb);
          const markerId = 5000 + i;
          // 将 bubble 使用的缩略图也改为本地路径，避免网络超时
          landmarks.push({ name, latitude, longitude, address, _markerId: markerId, thumbUrl: iconPath, firstProductId: chosenPid, productCategory: resolvedCategory });
          markers.push({
            id: markerId,
            latitude,
            longitude,
            width: 32,
            height: 32,
            iconPath,
            // 去掉文字callout，保留自定义图片气泡（cover-view slot="callout"）
          });
          if (chosenPid) landmarkMarkerMap[markerId] = chosenPid;
          if (resolvedCategory) landmarkCategoryMap[markerId] = resolvedCategory;
        }
      };
      const workers = Array.from({ length: Math.min(concurrency, list.length) }, () => worker());
      await Promise.allSettled(workers);

      this.setData({ campusLandmarks: landmarks, campusLandmarkMarkers: markers, landmarkMarkerMap, landmarkCategoryMap });
      this.updateMarkers();
    } catch (e) {
      // 集合未创建时忽略，不影响商品显示
      console.warn('读取校园地标失败或集合不存在:', e);
    }
  },

  initLocation() {
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 10000,
      success: (res) => {
        const my = { latitude: res.latitude, longitude: res.longitude };
        // 不自动移动视角，仅记录“我的位置”
        this.setData({ myLocation: my });
      },
      fail: (err) => {
        console.warn('市场页获取当前位置失败:', err);
        wx.showToast({ title: '定位失败，请检查权限', icon: 'none' });
        // 保持默认中心，不强制覆盖
      }
    });
  },

  async loadProducts() {
    const db = wx.cloud.database();
    try {
      const col = db.collection('T_product');
      // 分页拉取全量商品
      const countRes = await col.count();
      const total = (countRes && countRes.total) || 0;
      const pageSize = 100;
      const raw = [];
      for (let skip = 0; skip < Math.max(total, pageSize); skip += pageSize) {
        const page = await col.skip(skip).limit(pageSize).get();
        if (page && Array.isArray(page.data)) raw.push(...page.data);
        if (!page || !page.data || page.data.length < pageSize) break; // 最后一页
      }
      // 尝试为缺少坐标的商品补齐坐标（支持旧字段名、地标名称匹配与地址编码）
      let products = raw.slice();
      try {
        const { campusLandmarks } = require('../../utils/campusMap.js');

        const normalizeNum = (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        const simplify = (s) => String(s || '')
          .replace(/[（）()]/g, '')
          .replace(/附近$/g, '')
          .trim();
        // 读取数据库中的地标，合并到匹配源
        let allLandmarks = Array.isArray(campusLandmarks) ? campusLandmarks.slice() : [];
        try {
          const lr = await db.collection('T_campus_landmarks').limit(500).get();
          const dyn = (lr.data || [])
            .filter(x => Number.isFinite(Number(x.latitude)) && Number.isFinite(Number(x.longitude)))
            .map(x => ({ name: x.name || x.normalizedName || '', latitude: Number(x.latitude), longitude: Number(x.longitude) }));
          if (dyn.length > 0) allLandmarks = [...dyn, ...allLandmarks];
        } catch (_) { /* 集合不存在或读取失败时，沿用内置地标 */ }

        const matchLandmark = (p) => {
          const names = [p.tradeLandmarkName, p.tradeLocationName, p.tradeAddress]
            .filter(Boolean)
            .map(s => simplify(s));
          if (names.length === 0) return null;
          for (const candidate of names) {
            // 双向包含，尽量模糊匹配（支持数据库地标 + 内置地标）
            const m = allLandmarks.find(l => candidate.includes(l.name) || l.name.includes(candidate));
            if (m && Number.isFinite(m.latitude) && Number.isFinite(m.longitude)) {
              return { lat: m.latitude, lng: m.longitude };
            }
          }
          return null;
        };

        products = products.map(p => {
          // 直接复制旧字段或嵌套字段
          const directLat = normalizeNum(p.tradeLocationLat ?? p.tradeLat ?? p.lat ?? p.latitude ?? p?.tradeLocation?.latitude);
          const directLng = normalizeNum(p.tradeLocationLng ?? p.tradeLng ?? p.lng ?? p.longitude ?? p?.tradeLocation?.longitude);
          if (directLat != null && directLng != null) {
            p.tradeLocationLat = directLat;
            p.tradeLocationLng = directLng;
            return p;
          }
          // 从字符串坐标解析 "lat,lng" 或 "lat lng"
          if (typeof p.tradeLocation === 'string') {
            const m = String(p.tradeLocation).match(/(-?\d+\.?\d*)[\s,]+(-?\d+\.?\d*)/);
            if (m) {
              const lat = normalizeNum(m[1]);
              const lng = normalizeNum(m[2]);
              if (lat != null && lng != null) {
                p.tradeLocationLat = lat;
                p.tradeLocationLng = lng;
                return p;
              }
            }
          }
          // 地标名称匹配
          const lm = matchLandmark(p);
          if (lm) {
            p.tradeLocationLat = lm.lat;
            p.tradeLocationLng = lm.lng;
          }
          return p;
        });
      } catch (e) {
        console.warn('校园地标或坐标补齐失败，继续显示原数据:', e);
      }
      // 仍无坐标但有地址时，尝试正向地理编码补齐（限制并发，避免卡顿）
      try {
        const missingAll = products.filter(p => (
          !Number.isFinite(Number(p.tradeLocationLat)) || !Number.isFinite(Number(p.tradeLocationLng))
        ) && p.tradeAddress && String(p.tradeAddress).trim() !== '');
        const sortedMissing = missingAll.sort((a,b)=> {
          const ta = new Date(a.createTime || 0).getTime();
          const tb = new Date(b.createTime || 0).getTime();
          return tb - ta;
        });
        const missing = sortedMissing.slice(0, 40);
        if (missing.length > 0) {
          const { geocode } = require('../../utils/geocoder.js');
          const concurrency = 5;
          let index = 0;
          const worker = async () => {
            while (index < missing.length) {
              const current = missing[index++];
              try {
                const loc = await geocode(String(current.tradeAddress));
                if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
                  current.tradeLocationLat = loc.latitude;
                  current.tradeLocationLng = loc.longitude;
                }
              } catch (e) {
                // 忽略失败，继续下一个
              }
            }
          };
          const workers = Array.from({ length: concurrency }, () => worker());
          await Promise.allSettled(workers);
        }
      } catch (e) {
        console.warn('批量正向地理编码异常:', e);
      }
      // 计算距离与列表字段（如果无法获取我的定位，则用中心点作为参考）
      const my = this.data.myLocation;
      const ref = (my && my.latitude) ? my : this.data.center;
      const formatted = products.map(p => {
        let distanceText = '';
        const plat = Number(p.tradeLocationLat);
        const plng = Number(p.tradeLocationLng);
        if (Number.isFinite(plat) && Number.isFinite(plng)) {
          const d = haversineDistance(ref.latitude, ref.longitude, plat, plng);
          distanceText = formatDistance(d);
          p._distance = d;
        } else {
          p._distance = Infinity;
          distanceText = '未知';
        }
        // 默认使用本地占位图片，避免网络超时
        let thumbUrl = '/images/仓鼠.png';
        if (p.productImage) {
          if (Array.isArray(p.productImage) && p.productImage.length > 0) {
            thumbUrl = p.productImage[0];
          } else if (typeof p.productImage === 'string') {
            thumbUrl = p.productImage;
          }
        }
        const statusNormalized = normalizeStatus(p.status);
        return { ...p, distanceText, thumbUrl, statusNormalized };
      });
      this.setData({ allProducts: formatted });
      this.applyFilters();
    } catch (e) {
      console.error('加载市场商品失败:', e);
    }
  },

  applyFilters() {
    const { categoryIndex, categories } = this.data;
    const category = categories[categoryIndex];
    let list = this.data.allProducts.slice();

    if (category && category !== '全部') {
      list = list.filter(p => p.productCategory === category);
    }
    list = list.filter(p => (p.statusNormalized || 'selling') === 'selling');
    // 仅显示具备有效坐标的商品（字符串坐标也接受）
    list = list.filter(p => Number.isFinite(Number(p.tradeLocationLat)) && Number.isFinite(Number(p.tradeLocationLng)));

    this.setData({ visibleProducts: list });
    this.updateMarkers();
  },

  // 简易聚类：基于缩放将附近点归为一个cluster
  updateMarkers() {
    const { visibleProducts, campusLandmarkMarkers, tradeSpotMarkers, productMarkerIdMap, landmarkCategoryMap } = this.data;
    const mapScale = (typeof this.data.mapRuntimeScale === 'number') ? this.data.mapRuntimeScale : this.data.mapScale;
    const categories = this.data.categories || [];
    const selectedCategory = categories[this.data.categoryIndex] || '全部';
    // 使用稳定的 markerId，避免覆盖层频繁销毁/重建导致闪烁
    const markerMap = {};
    const idByPid = { ...productMarkerIdMap };
    let nextId = this.data.nextProductMarkerId || 1;
    const withMarkerIds = visibleProducts.map(p => {
      const pid = p._id;
      let mkid = idByPid[pid];
      if (!mkid) { mkid = nextId++; idByPid[pid] = mkid; }
      if (p._markerId === mkid) return p;
      return { ...p, _markerId: mkid };
    });
    const limited = withMarkerIds.slice().sort((a, b) => {
      const ta = new Date(a.updateTime || a.createTime || 0).getTime();
      const tb = new Date(b.updateTime || b.createTime || 0).getTime();
      return tb - ta;
    }).slice(0, DISPLAY_LIMIT);
    limited.forEach(p => { markerMap[p._markerId] = p._id; });
    // 仅更新映射与 displayMarkers；在需要显示气泡时同步 visibleProducts（包含 _markerId）
    this.setData({ markerProductMap: markerMap, productMarkerIdMap: idByPid, nextProductMarkerId: nextId });
    // 根据分类筛选校园地标标记与气泡
    const campusMarkersFiltered = (selectedCategory && selectedCategory !== '全部')
      ? campusLandmarkMarkers.filter(m => landmarkCategoryMap[m.id] === selectedCategory)
      : campusLandmarkMarkers;
    const campusLandmarksFiltered = (selectedCategory && selectedCategory !== '全部')
      ? this.data.campusLandmarks.filter(l => l.productCategory === selectedCategory)
      : this.data.campusLandmarks;
    if (mapScale >= 16) {
      const productMarkers = limited
        .filter(p => p.tradeLocationLat && p.tradeLocationLng)
        .map(p => ({
          id: p._markerId,
          latitude: Number(p.tradeLocationLat),
          longitude: Number(p.tradeLocationLng),
          width: 32,
          height: 32,
          iconPath: '/images/仓鼠.png'
        }));
      const merged = productMarkers.concat(campusMarkersFiltered);
      const includeSpots = Array.isArray(tradeSpotMarkers) && tradeSpotMarkers.length > 0 && merged.length === 0;
      const finalMarkers = includeSpots ? merged.concat(tradeSpotMarkers) : merged;
      this.setData({ displayMarkers: finalMarkers, visibleProducts: limited, campusLandmarksForDisplay: campusLandmarksFiltered });
      return;
    }
    // 低缩放：聚类
    const grid = new Map();
    const keyFor = (lat, lng) => `${Math.round(lat * 10)}/${Math.round(lng * 10)}`;
    limited.forEach(p => {
      if (!p.tradeLocationLat || !p.tradeLocationLng) return;
      const key = keyFor(p.tradeLocationLat, p.tradeLocationLng);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(p);
    });
    const clusterMarkers = [];
    for (const [key, arr] of grid.entries()) {
      if (arr.length === 1) {
        const p = arr[0];
        clusterMarkers.push({
          id: p._markerId,
          latitude: Number(p.tradeLocationLat),
          longitude: Number(p.tradeLocationLng),
          width: 32,
          height: 32,
          iconPath: '/images/仓鼠.png',
        });
      } else {
        // 聚类点：显示数量
        const lat = arr.reduce((s, x) => s + Number(x.tradeLocationLat), 0) / arr.length;
        const lng = arr.reduce((s, x) => s + Number(x.tradeLocationLng), 0) / arr.length;
        clusterMarkers.push({
          id: Date.now() + Math.random(),
          latitude: lat,
          longitude: lng,
          width: 40,
          height: 40,
          label: { content: `${arr.length}`, color: '#fff', bgColor: '#4285F4', padding: 6, borderRadius: 20 }
        });
      }
    }
    const merged = clusterMarkers.concat(campusMarkersFiltered);
    const includeSpotsLow = Array.isArray(tradeSpotMarkers) && tradeSpotMarkers.length > 0 && merged.length === 0;
    const finalMarkers = includeSpotsLow ? merged.concat(tradeSpotMarkers) : merged;
    this.setData({ displayMarkers: finalMarkers, visibleProducts: limited, campusLandmarksForDisplay: campusLandmarksFiltered });
  },

  onCategoryChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const cat = this.data.categories[idx];
    this.setData({ categoryIndex: idx });
    this.applyFilters();
    if (cat && cat !== '全部') {
      try { reco.recordInterests([cat], 3); } catch (_) {}
    }
  },

  onScanRadiusChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const radius = this.data.scanRadiusOptions[idx] || 1000;
    const label = this.data.scanRadiusLabels[idx] || '1km';
    this.setData({ scanRadiusIndex: idx, scanRadius: radius, nearestModalTitle: `距我最近（${label}内）` });
  },

  onToggleMode() {},

  onRegionChange(e) {
    // 仅在结束事件中更新运行时缩放与标记，不再写入受控中心，避免视角抽搐
    if (e.type === 'end') {
      if (typeof e.detail.scale === 'number') {
        this.setData({ mapRuntimeScale: e.detail.scale });
      }
      this.scheduleUpdateMarkers();
    }
  },

  scheduleUpdateMarkers() {
    if (this._updateMarkersTimer) clearTimeout(this._updateMarkersTimer);
    this._updateMarkersTimer = setTimeout(() => {
      this._updateMarkersTimer = null;
      try { this.updateMarkers(); } catch (_) {}
    }, 120);
  },

  onMarkerTap(e) {
    const id = e.markerId;
    const pid = this.data.markerProductMap[id];
    const p = this.data.visibleProducts.find(x => x._id === pid);
    if (p) {
      try { reco.recordClick(p); } catch (_) {}
      wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${p._id}` });
      return;
    }
    // 地标标记：跳转到关联商品详情（使用第一个productId）
    const lpid = this.data.landmarkMarkerMap[id];
    if (lpid) {
      const lp = this.data.allProducts.find(x => x._id === lpid);
      if (lp) { try { reco.recordClick(lp); } catch (_) {} } else {
        const cat = this.data.landmarkCategoryMap[id];
        if (cat) { try { reco.recordInterests([cat], 1); } catch (_) {} }
      }
      wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${lpid}` });
      return;
    }
    // 其他非商品标记（聚类/推荐点）：不再自动居中或放大，保持用户视角自由
  },

  onLandmarkBubbleTap(e) {
    const pid = (e?.currentTarget?.dataset?.pid) || '';
    if (pid) {
      wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${pid}` });
    }
  },

  onListTap(e) {
    const id = e.currentTarget.dataset.id;
    const np = Array.isArray(this.data.nearestProducts) ? this.data.nearestProducts.find(x => x._id === id) : null;
    const vp = Array.isArray(this.data.visibleProducts) ? this.data.visibleProducts.find(x => x._id === id) : null;
    const ap = Array.isArray(this.data.allProducts) ? this.data.allProducts.find(x => x._id === id) : null;
    const p = np || vp || ap;
    if (!p) return;
    try { reco.recordClick(p); } catch (_) {}
    this.setData({ nearestModalVisible: false });
    wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${p._id}` });
  },

  onResetCenter() {
    if (this.data.myLocation && this.data.myLocation.latitude) {
      this.setData({ center: this.data.myLocation, mapScale: 16, mapRuntimeScale: 16 });
      return;
    }
    // 若尚未有定位信息，主动尝试获取一次
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 10000,
      success: (res) => {
        const center = { latitude: res.latitude, longitude: res.longitude };
        this.setData({ myLocation: center, center, mapScale: 16, mapRuntimeScale: 16 });
      },
      fail: () => {
        wx.showToast({ title: '无法获取定位，请在设置中授权', icon: 'none' });
        // 可引导打开设置
        if (wx.openSetting) {
          wx.openSetting({});
        }
      }
    });
  },

  async onNearestScan() {
    try {
      const my = this.data.myLocation && this.data.myLocation.latitude ? this.data.myLocation : this.data.center;
      if (!my || typeof my.latitude !== 'number' || typeof my.longitude !== 'number') {
        wx.showToast({ title: '定位信息缺失', icon: 'none' });
        return;
      }
      const radius = this.data.scanRadius || 1000;
      const label = (this.data.scanRadiusLabels && this.data.scanRadiusLabels[this.data.scanRadiusIndex])
        || (radius >= 1000 ? `${(radius/1000).toFixed(0)}km` : `${radius}m`);
      const circle = [{ latitude: Number(my.latitude), longitude: Number(my.longitude), radius: radius, color: '#4f8bff80', fillColor: '#4f8bff20', strokeWidth: 2 }];

      // 以当前显示的标记为准，避免因数据尚未加载完全导致误判
      const { displayMarkers, markerProductMap, landmarkMarkerMap } = this.data;
      const nearMarkers = (Array.isArray(displayMarkers) ? displayMarkers : []).filter(m => {
        if (typeof m.latitude !== 'number' || typeof m.longitude !== 'number') return false;
        const d = haversineDistance(my.latitude, my.longitude, m.latitude, m.longitude);
        return d <= radius;
      });

      // 根据标记映射回商品ID
      const candidateIds = [];
      nearMarkers.forEach(m => {
        const pid = markerProductMap[m.id] || landmarkMarkerMap[m.id] || '';
        if (pid) candidateIds.push(pid);
      });
      // 去重
      const uniqIds = [...new Set(candidateIds)];

      // 组装商品数据：优先从已加载列表查找，缺失时读库
      const inAll = Array.isArray(this.data.allProducts) ? this.data.allProducts : [];
      const inVisible = Array.isArray(this.data.visibleProducts) ? this.data.visibleProducts : [];
      const byId = new Map();
      inAll.forEach(p => byId.set(p._id, p));
      inVisible.forEach(p => { if (!byId.has(p._id)) byId.set(p._id, p); });

      const db = wx.cloud.database();
      const resolved = [];
      for (const pid of uniqIds) {
        let p = byId.get(pid);
        if (!p) {
          try {
            const pr = await db.collection('T_product').doc(pid).get();
            p = pr.data || null;
          } catch (_) { p = null; }
        }
        if (!p) continue;
        const mk = nearMarkers.find(m => (markerProductMap[m.id] === pid) || (landmarkMarkerMap[m.id] === pid));
        const plat = mk ? Number(mk.latitude) : Number(p.tradeLocationLat ?? p.lat ?? p?.tradeLocation?.latitude);
        const plng = mk ? Number(mk.longitude) : Number(p.tradeLocationLng ?? p.lng ?? p?.tradeLocation?.longitude);
        if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;
        const d = haversineDistance(my.latitude, my.longitude, plat, plng);
        const thumbUrl = Array.isArray(p.productImage) ? (p.productImage[0] || '/images/仓鼠.png') : (p.productImage || '/images/仓鼠.png');
        resolved.push({ ...p, thumbUrl, _distance: d, _distanceText: formatDistance(d) });
      }

      const nearby = resolved.sort((a,b)=> a._distance - b._distance).slice(0, 40);
      if (nearby.length === 0) {
        wx.showToast({ title: `${label}内暂无商品`, icon: 'none' });
      }
      this.setData({ scanCircles: circle, nearestProducts: nearby, nearestModalVisible: nearby.length > 0, nearestModalTitle: `距我最近（${label}内）` });
    } catch (e) {
      console.error('最近商品扫描失败:', e);
      wx.showToast({ title: '扫描失败', icon: 'none' });
    }
  },

  onCloseNearestModal() {
    this.setData({ nearestModalVisible: false });
  },

  async onGeoServiceCheck() {
    try {
      wx.showLoading({ title: '诊断中…', mask: true });
      const { QQMAP_KEY, QQMAP_REFERER } = require('../../utils/config.js');
      const { geocode, reverseGeocode } = require('../../utils/geocoder.js');

      const keyOk = !!(QQMAP_KEY && typeof QQMAP_KEY === 'string' && QQMAP_KEY.length >= 10);
      const keyStatus = keyOk ? '已配置' : '未配置或无效';

      // 正向地理编码测试
      const testAddr = '天津市东丽区中国民航大学';
      let geocodeMsg = '';
      try {
        const loc = await geocode(testAddr);
        geocodeMsg = `成功 (${loc.latitude?.toFixed(5)}, ${loc.longitude?.toFixed(5)})`;
      } catch (e) {
        geocodeMsg = `失败：${e?.message || '请求错误'}`;
      }

      // 逆地理编码测试（优先云函数，失败走前端兜底）
      const ref = this.data.center;
      let reverseMsg = '';
      try {
        const addr = await reverseGeocode({ latitude: ref.latitude, longitude: ref.longitude });
        reverseMsg = `成功（${String(addr).slice(0, 28)}）`;
      } catch (e) {
        reverseMsg = `失败：${e?.message || '请求错误'}`;
      }

      // 云函数直测（可区分云端配置情况）
      let cloudMsg = '';
      try {
        const r = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'cloudReverseGeocode', latitude: ref.latitude, longitude: ref.longitude, key: QQMAP_KEY, referer: QQMAP_REFERER } });
        cloudMsg = (r.result && r.result.success) ? '成功' : `失败：${r.result?.error || '未知错误'}`;
      } catch (e) {
        cloudMsg = `调用失败：${e?.message || '网络错误'}`;
      }

      wx.hideLoading();
      const content = `Key：${keyStatus}\n正向编码：${geocodeMsg}\n逆向编码：${reverseMsg}\n云函数：${cloudMsg}\n\n产品：总数 ${DISPLAY_LIMIT}，可见 ${this.data.visibleProducts.length}，标记 ${this.data.displayMarkers.length}\n\n如失败：在小程序后台将 request 合法域名添加 https://apis.map.qq.com，并确认 Key 有效。`;
      wx.showModal({ title: '地理服务诊断', content, showCancel: false });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '诊断异常，请稍后重试', icon: 'none' });
    }
  }
  ,
  /**
   * 回填地标分类到 T_campus_landmarks
   * 依据地标的第一个关联商品（productIds[0]）的分类写入 productCategory 字段
   */
  async onBackfillLandmarkCategories() {
    try {
      const confirm = await new Promise((resolve) => {
        wx.showModal({
          title: '回填地标分类',
          content: '将读取地标关联商品分类并写入地标表，仅执行一次性数据修复。是否继续？',
          confirmText: '继续',
          cancelText: '取消',
          success: (res) => resolve(res.confirm),
          fail: () => resolve(false)
        });
      });
      if (!confirm) return;

      wx.showLoading({ title: '回填中…', mask: true });
      const db = wx.cloud.database();
      const colLandmarks = db.collection('T_campus_landmarks');
      const colProducts = db.collection('T_product');

      // 分页读取全部地标
      const countRes = await colLandmarks.count();
      const total = (countRes && countRes.total) || 0;
      const pageSize = 100;
      const docs = [];
      for (let skip = 0; skip < Math.max(total, pageSize); skip += pageSize) {
        const page = await colLandmarks.skip(skip).limit(pageSize).get();
        if (page && Array.isArray(page.data)) docs.push(...page.data);
        if (!page || !page.data || page.data.length < pageSize) break;
      }

      let updated = 0, skipped = 0, failed = 0;
      const concurrency = 5;
      let idx = 0;
      const worker = async () => {
        while (idx < docs.length) {
          const i = idx++;
          const d = docs[i];
          const pid = Array.isArray(d.productIds) && d.productIds.length > 0 ? d.productIds[0] : '';
          // 已有分类则跳过
          if (d.productCategory && typeof d.productCategory === 'string' && d.productCategory.trim()) {
            skipped++;
            continue;
          }
          if (!pid) { skipped++; continue; }
          try {
            const pr = await colProducts.doc(pid).get();
            const p = pr.data || {};
            const category = p.productCategory || p.category || '';
            if (!category) { skipped++; continue; }
            await colLandmarks.doc(d._id).update({ data: { productCategory: category } });
            updated++;
          } catch (e) {
            console.warn('回填失败:', d._id, e);
            failed++;
          }
        }
      };
      const workers = Array.from({ length: Math.min(concurrency, docs.length) }, () => worker());
      await Promise.allSettled(workers);

      wx.hideLoading();
      wx.showModal({ title: '回填完成', content: `成功 ${updated} 条\n跳过 ${skipped} 条\n失败 ${failed} 条`, showCancel: false });

      // 重新加载地标，使筛选与展示即时生效
      await this.loadCampusLandmarksMarkers();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '回填异常，请稍后重试', icon: 'none' });
    }
  },
  /**
   * 加载用户默认地址坐标，并在地图上叠加“地址附近的交易点”标记
   */
  async loadUserTradeSpotsNearby() {
    try {
      const db = wx.cloud.database();
      // 获取 openid
      let openid = wx.getStorageSync('openid');
      if (!openid) {
        try {
          const r = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'getOpenId' } });
          openid = r?.result?.openid || '';
          if (openid) wx.setStorageSync('openid', openid);
        } catch (_) { /* 忽略 */ }
      }
      // 查询默认地址（或最近添加的地址）
      const res = await db.collection('T_address')
        .where(openid ? { _openid: openid } : {})
        .orderBy('isDefault', 'desc')
        .orderBy('createTime', 'desc')
        .limit(1)
        .get();
      const addr = (res.data && res.data[0]) || null;
      // 兜底方法：以当前中心（我的定位或校园中心）叠加推荐交易点，保证有标记可见
      const makeFallbackByCenter = () => {
        const center = this.data.myLocation && this.data.myLocation.latitude ? this.data.myLocation : this.data.center;
        const iconFor = (name) => {
          if (String(name).includes('食堂')) return '/images/羊.png';
          if (String(name).includes('图书馆')) return '/images/边牧.png';
          return '/images/更多犬种.png';
        };
        const nearSpots = officialTradeSpots.filter(s => haversineDistance(center.latitude, center.longitude, s.latitude, s.longitude) <= 1500);
        const spotMarkers = nearSpots.map((s, i) => ({
          id: 9000 + i,
          latitude: s.latitude,
          longitude: s.longitude,
          width: 36,
          height: 36,
          iconPath: iconFor(s.name),
          // 去掉文字callout，避免遮挡视野
        }));
        this.setData({ userAddressLoc: center, tradeSpotMarkers: spotMarkers });
        this.updateMarkers();
      };
      if (!addr) {
        makeFallbackByCenter();
        return;
      }
      const addrStr = `${addr.province || ''}${addr.city || ''}${addr.district || ''}${addr.detail || ''}`.trim();
      if (!addrStr) {
        makeFallbackByCenter();
        return;
      }
      // 正向编码得到坐标
      let loc = null;
      try {
        loc = await geocode(addrStr);
      } catch (_) { /* 忽略 */ }
      if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
        makeFallbackByCenter();
        return;
      }
      let userLoc = { latitude: loc.latitude, longitude: loc.longitude };
      // 若是校园地址但正向编码坐标与校园中心相差过大，进行容错回归校园中心（图书馆）
      try {
        const centerSpot = officialTradeSpots.find(s => String(s.name).includes('图书馆')) || officialTradeSpots[0];
        const campusKeywords = ['中国民航大学', '民航大学', '东丽校区'];
        const isCampusAddr = campusKeywords.some(k => addrStr.includes(k));
        if (isCampusAddr && centerSpot && typeof centerSpot.latitude === 'number' && typeof centerSpot.longitude === 'number') {
          const dist = haversineDistance(userLoc.latitude, userLoc.longitude, centerSpot.latitude, centerSpot.longitude);
          // 若偏差超过 1.5km，采用校园中心，保证推荐交易点可见
          if (dist > 1500) {
            userLoc = { latitude: centerSpot.latitude, longitude: centerSpot.longitude };
          }
        }
      } catch (_) { /* 忽略容错 */ }
      this.setData({ userAddressLoc: userLoc });

      // 距离 1.5km 内的官方诚信交易点
      const iconFor = (name) => {
        if (String(name).includes('食堂')) return '/images/羊.png';
        if (String(name).includes('图书馆')) return '/images/边牧.png';
        return '/images/更多犬种.png';
      };
      const nearSpots = officialTradeSpots.filter(s => haversineDistance(userLoc.latitude, userLoc.longitude, s.latitude, s.longitude) <= 1500);
      const spotMarkers = nearSpots.map((s, i) => ({
        id: 9000 + i,
        latitude: s.latitude,
        longitude: s.longitude,
        width: 36,
        height: 36,
        iconPath: iconFor(s.name),
        // 去掉文字callout，避免遮挡视野
      }));
      this.setData({ tradeSpotMarkers: spotMarkers });
      // 更新地图标注叠加显示
      this.updateMarkers();
    } catch (e) {
      // 集合不存在时，自动尝试初始化 T_address 集合
      const msg = String(e?.message || e?.errMsg || '');
      const code = e?.errCode || e?.code;
      if (code === -502005 || /DATABASE_COLLECTION_NOT_EXIST|ResourceNotFound|Db or Table not exist/i.test(msg)) {
        try {
          await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'createAddressCollection' } });
          wx.showToast({ title: '已初始化地址库，请重试', icon: 'none' });
        } catch (_) { /* 忽略 */ }
      }
      console.warn('加载地址附近交易点失败:', e);
      // 失败时也使用中心兜底，确保图上有标记
      const center = this.data.myLocation && this.data.myLocation.latitude ? this.data.myLocation : this.data.center;
      const nearSpots = officialTradeSpots.filter(s => haversineDistance(center.latitude, center.longitude, s.latitude, s.longitude) <= 1500);
      const spotMarkers = nearSpots.map((s, i) => ({
        id: 9000 + i,
        latitude: s.latitude,
        longitude: s.longitude,
        width: 36,
        height: 36,
        iconPath: '/images/更多犬种.png',
        // 去掉文字callout，避免遮挡视野
      }));
      this.setData({ userAddressLoc: center, tradeSpotMarkers: spotMarkers });
      this.updateMarkers();
    }
  }
});