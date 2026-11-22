// 测试云函数AI定价功能
async function testCloudFunction() {
  try {
    console.log('开始测试云函数AI定价功能...');
    
    // 模拟云函数调用 - 使用用户提供的具体图片URL
    const event = {
      type: 'analyzeProductPrice',
      imageUrl: 'https://pic1.zhimg.com/v2-24d60d3e9a24ce8d1f3ee0d9f05f929c_b.jpg',
      originalPrice: 100
    };
    
    // 导入云函数
    const cloudFunction = require('./index.js');
    
    console.log('调用云函数analyzeProductPrice...');
    const result = await cloudFunction.main(event, {});
    
    console.log('云函数调用结果:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 运行测试
testCloudFunction();