const { QQMAP_KEY, QQMAP_REFERER } = require('./config.js');

function formatAddress(comp) {
  if (!comp) return '';
  const parts = [comp.province, comp.city, comp.district, comp.street, comp.street_number].filter(Boolean);
  return parts.join('');
}

function reverseGeocode(point) {
  return new Promise((resolve, reject) => {
    try {
      if (!point || typeof point.latitude !== 'number' || typeof point.longitude !== 'number') {
        reject(new Error('Invalid coordinates'));
        return;
      }
      // 先走云函数，失败后总是尝试前端直连；都失败则给出校园语义化兜底
      callCloudReverse(point)
        .then((addr) => resolve(addr))
        .catch(() => {
          // 前端直连（需要合法域名；若失败继续兜底）
          wx.request({
            url: 'https://apis.map.qq.com/ws/geocoder/v1',
            method: 'GET',
            data: {
              location: `${point.latitude},${point.longitude}`,
              key: QQMAP_KEY,
              get_poi: 1,
              poi_options: 'policy=1'
            },
            success: (res) => {
              if (res.statusCode === 200 && res.data && res.data.status === 0 && res.data.result) {
                const r = res.data.result;
                const addr = (r.formatted_addresses && (r.formatted_addresses.recommend || r.formatted_addresses.rough))
                  || r.address
                  || (r.address_reference && (r.address_reference.landmark_l2?.title || r.address_reference.landmark?.title))
                  || formatAddress(r.address_component);
                resolve(addr || '');
              } else {
                // 最后兜底：根据地标名/校园名构造语义地址
                const name = point.landmarkName || point.name || '';
                const fallback = name ? `中国民航大学（东丽校区）${name} 附近` : '中国民航大学（东丽校区）校园内附近';
                resolve(fallback);
              }
            },
            fail: () => {
              const name = point.landmarkName || point.name || '';
              const fallback = name ? `中国民航大学（东丽校区）${name} 附近` : '中国民航大学（东丽校区）校园内附近';
              resolve(fallback);
            }
          });
        });
    } catch (e) {
      callCloudReverse(point)
        .then((addr) => resolve(addr))
        .catch(() => {
          const name = point.landmarkName || point.name || '';
          const fallback = name ? `中国民航大学（东丽校区）${name} 附近` : '中国民航大学（东丽校区）校园内附近';
          resolve(fallback);
        });
    }
  });
}

function callCloudReverse(point) {
  return new Promise((resolve, reject) => {
    try {
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'cloudReverseGeocode',
          latitude: point.latitude,
          longitude: point.longitude,
          // 直接传入前端配置的 QQMAP_KEY，避免云端未配置环境变量时报“缺少QQMAP_KEY”
          key: QQMAP_KEY,
          referer: QQMAP_REFERER
        },
        success: (res) => {
          try {
            if (res.result && res.result.success && res.result.data) {
              const r = res.result.data;
              const addr = (r.formatted_addresses && (r.formatted_addresses.recommend || r.formatted_addresses.rough))
                || r.address
                || (r.address_reference && (r.address_reference.landmark_l2?.title || r.address_reference.landmark?.title))
                || formatAddress(r.address_component);
              resolve(addr || '');
            } else {
              reject(new Error(res.result?.error || 'Cloud reverse geocode failed'));
            }
          } catch (e) {
            reject(e);
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { reverseGeocode, formatAddress };

/**
 * 正向地理编码：根据地址字符串获取坐标
 * 返回 { latitude, longitude }
 */
function geocode(address) {
  return new Promise((resolve, reject) => {
    try {
      if (!address || typeof address !== 'string') {
        reject(new Error('Invalid address'));
        return;
      }
      // 优先走云函数（支持多 Key 和签名），失败再回退前端直连
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'cloudGeocode', address, key: QQMAP_KEY, referer: QQMAP_REFERER },
        success: (res) => {
          if (res.result && res.result.success && res.result.data) {
            resolve(res.result.data);
          } else {
            // 回退前端直连
            wx.request({
              url: 'https://apis.map.qq.com/ws/geocoder/v1',
              method: 'GET',
              data: { address, key: QQMAP_KEY },
              success: (resp) => {
                if (resp.statusCode === 200 && resp.data && resp.data.status === 0 && resp.data.result && resp.data.result.location) {
                  const loc = resp.data.result.location;
                  resolve({ latitude: loc.lat, longitude: loc.lng });
                } else {
                  reject(new Error(resp.data?.message || 'Geocode failed'));
                }
              },
              fail: (e) => reject(e)
            });
          }
        },
        fail: () => {
          // 云函数不可用时回退前端直连
          wx.request({
            url: 'https://apis.map.qq.com/ws/geocoder/v1',
            method: 'GET',
            data: { address, key: QQMAP_KEY },
            success: (resp) => {
              if (resp.statusCode === 200 && resp.data && resp.data.status === 0 && resp.data.result && resp.data.result.location) {
                const loc = resp.data.result.location;
                resolve({ latitude: loc.lat, longitude: loc.lng });
              } else {
                reject(new Error(resp.data?.message || 'Geocode failed'));
              }
            },
            fail: (e) => reject(e)
          });
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

module.exports.geocode = geocode;