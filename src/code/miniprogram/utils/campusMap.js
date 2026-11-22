// 中国民航大学（天津·东丽校区）校园地标（楼号与公共点）
// 注：坐标为校园内合理近似点，供“最近楼号推荐”和初始选点使用；用户可通过“地图选点”进一步精确。
const campusLandmarks = [
  // 教学区
  { name: '主教学楼A', latitude: 39.1228, longitude: 117.3386, area: '教学楼' },
  { name: '主教学楼B', latitude: 39.1223, longitude: 117.3378, area: '教学楼' },
  { name: '主教学楼C', latitude: 39.1219, longitude: 117.3369, area: '教学楼' },
  // 图书馆/体育馆
  { name: '图书馆', latitude: 39.1234, longitude: 117.3365, area: '图书馆' },
  { name: '体育馆', latitude: 39.1216, longitude: 117.3394, area: '体育馆' },
  // 食堂/快递点
  { name: '第一食堂', latitude: 39.1242, longitude: 117.3396, area: '食堂' },
  { name: '第二食堂', latitude: 39.1211, longitude: 117.3358, area: '食堂' },
  { name: '西门快递点', latitude: 39.1209, longitude: 117.3349, area: '快递点' },
  // 宿舍区（示意）
  { name: '东区宿舍', latitude: 39.1248, longitude: 117.3408, area: '宿舍区' },
  { name: '西区宿舍', latitude: 39.1208, longitude: 117.3350, area: '宿舍区' },
  // 校门
  { name: '南门', latitude: 39.1198, longitude: 117.3382, area: '校门' },
  { name: '北门', latitude: 39.1255, longitude: 117.3361, area: '校门' }
];

// 官方诚信交易点（公共、安全、方便）
const officialTradeSpots = [
  { name: '诚信交易点 · 图书馆正门', latitude: 39.1234, longitude: 117.3365, tags: ['监控', '人流量大'] },
  { name: '诚信交易点 · 第一食堂北侧', latitude: 39.1243, longitude: 117.3397, tags: ['明亮', '人流量大'] },
  { name: '诚信交易点 · 西门快递点', latitude: 39.1209, longitude: 117.3349, tags: ['便利', '监控'] }
];

module.exports = { campusLandmarks, officialTradeSpots };