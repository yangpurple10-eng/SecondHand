// 简单地理工具：计算两点距离与最近地标（CommonJS 导出）
function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000; // 地球半径，米
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // 返回米
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function findNearest(point, list) {
  if (!point || !list || list.length === 0) return null;
  let best = null;
  let min = Infinity;
  for (const item of list) {
    if (item.latitude == null || item.longitude == null) continue;
    const d = haversineDistance(point.latitude, point.longitude, item.latitude, item.longitude);
    if (d < min) {
      min = d;
      best = { ...item, distance: d };
    }
  }
  return best;
}

module.exports = { haversineDistance, formatDistance, findNearest };