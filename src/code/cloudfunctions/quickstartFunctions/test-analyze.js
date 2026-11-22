// 测试AI定价功能的脚本
// 用于本地测试云函数逻辑

const cloud = require("wx-server-sdk");
cloud.init({
  env: "cloud1-7gmt1869f0703287" // 使用你的环境ID
});

// 导入云函数
const analyzeProductPrice = require('./index.js').analyzeProductPrice;

async function testAnalyzeProductPrice() {
  console.log('========== 开始测试AI定价功能 ==========');
  
  // 测试用例1: 使用fileID（需要先上传一个图片到云存储）
  const testEvent1 = {
    type: 'analyzeProductPrice',
    fileID: 'cloud://cloud1-7gmt1869f0703287.636c-cloud1-7gmt1869f0703287-1316160869/pricing/test.jpg',
    originalPrice: 100
  };
  
  // 测试用例2: 使用imageUrl（使用一个公开的图片URL）
  const testEvent2 = {
    type: 'analyzeProductPrice',
    imageUrl: 'https://pic1.zhimg.com/v2-24d60d3e9a24ce8d1f3ee0d9f05f929c_b.jpg',
    originalPrice: 100
  };
  
  try {
    console.log('\n测试用例2: 使用imageUrl测试');
    console.log('测试参数:', JSON.stringify(testEvent2, null, 2));
    
    const result = await analyzeProductPrice(testEvent2);
    
    console.log('\n========== 测试结果 ==========');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n✅ 测试成功！');
      console.log('商品名称:', result.data.productName);
      console.log('建议价格:', result.data.suggestedPrice);
      console.log('商品成色:', result.data.conditionLevel);
      console.log('AI评分:', result.data.aiScore);
    } else {
      console.log('\n❌ 测试失败！');
      console.log('错误信息:', result.error);
      console.log('错误详情:', result.details);
    }
  } catch (error) {
    console.error('\n========== 测试异常 ==========');
    console.error('错误信息:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 运行测试
testAnalyzeProductPrice();

