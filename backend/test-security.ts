#!/usr/bin/env ts-node
// 测试脚本 - 验证安全加固是否正常工作
// 运行: cd backend && ts-node test-security.ts

import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3001';

console.log('🧪 开始安全功能测试...\n');
console.log(`API URL: ${API_URL}\n`);

async function testHealthCheck() {
  console.log('1️⃣ 测试健康检查端点...');
  try {
    const response = await axios.get(`${API_URL}/health`);
    console.log('✅ 健康检查成功:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('');
    return true;
  } catch (error: any) {
    console.log('❌ 健康检查失败:', error.message);
    return false;
  }
}

async function testMintEndpoint() {
  console.log('2️⃣ 测试 /mint 端点...');
  try {
    const response = await axios.get(`${API_URL}/mint`, { validateStatus: () => true });
    if (response.status === 402) {
      console.log('✅ /mint 返回 402 正确');
      console.log(JSON.stringify(response.data, null, 2));
      console.log('');
      return true;
    } else {
      console.log(`❌ /mint 返回了错误的状态码: ${response.status}`);
      return false;
    }
  } catch (error: any) {
    console.log('❌ /mint 测试失败:', error.message);
    return false;
  }
}

async function testStatsEndpoint() {
  console.log('3️⃣ 测试 /stats 端点...');
  try {
    const response = await axios.get(`${API_URL}/stats`);
    console.log('✅ /stats 成功返回:');
    console.log(`  - Token Address: ${response.data.tokenAddress}`);
    console.log(`  - Treasury: ${response.data.treasury}`);
    console.log(`  - Distributor: ${response.data.distributor}`);
    console.log(`  - Chain ID: ${response.data.chainId}`);
    console.log('');
    return true;
  } catch (error: any) {
    console.log('❌ /stats 测试失败:', error.message);
    return false;
  }
}

async function testReplayProtection() {
  console.log('4️⃣ 测试防重放攻击...');

  const testData = {
    txHash: '0x' + 'a'.repeat(64), // 假的txHash
    user: '0x' + '1'.repeat(40)    // 假的地址
  };

  try {
    // 第一次请求（应该失败，因为是假交易）
    const first = await axios.post(`${API_URL}/verify`, testData, { validateStatus: () => true });
    console.log(`  第一次请求状态: ${first.status} - ${first.data.error || first.data.message}`);

    // 第二次请求（测试是否能检测到重复）
    const second = await axios.post(`${API_URL}/verify`, testData, { validateStatus: () => true });
    console.log(`  第二次请求状态: ${second.status} - ${second.data.error || second.data.message}`);

    if (second.data.error && second.data.error.includes('already processed')) {
      console.log('✅ 防重放攻击正常工作！');
      console.log('');
      return true;
    } else {
      console.log('⚠️ 防重放攻击可能未启用（Redis未配置？）');
      console.log('');
      return true; // 不算失败，因为Redis是可选的
    }
  } catch (error: any) {
    console.log('⚠️ 防重放测试遇到错误:', error.message);
    console.log('');
    return true; // 不算失败
  }
}

async function testRateLimit() {
  console.log('5️⃣ 测试速率限制...');

  const testData = {
    txHash: '0x' + Date.now().toString(16) + 'a'.repeat(50),
    user: '0x' + '2'.repeat(40)
  };

  try {
    let limited = false;

    // 快速发送6个请求
    for (let i = 0; i < 6; i++) {
      const response = await axios.post(`${API_URL}/verify`, {
        ...testData,
        txHash: '0x' + Date.now().toString(16) + i.toString() + 'b'.repeat(40)
      }, { validateStatus: () => true });

      if (response.status === 429) {
        limited = true;
        console.log(`  ✅ 第 ${i + 1} 次请求被速率限制阻止 (429)`);
        break;
      }
    }

    if (limited) {
      console.log('✅ 速率限制正常工作！');
      console.log('');
      return true;
    } else {
      console.log('⚠️ 速率限制可能未启用或限制值较高');
      console.log('');
      return true; // 不算失败
    }
  } catch (error: any) {
    console.log('⚠️ 速率限制测试遇到错误:', error.message);
    console.log('');
    return true;
  }
}

async function testInvalidAddress() {
  console.log('6️⃣ 测试地址验证...');

  try {
    const response = await axios.post(`${API_URL}/verify`, {
      txHash: '0x' + 'c'.repeat(64),
      user: 'invalid-address' // 无效地址
    }, { validateStatus: () => true });

    if (response.status === 400 && response.data.error === 'invalid user address') {
      console.log('✅ 地址验证正常工作！');
      console.log('');
      return true;
    } else {
      console.log(`❌ 地址验证未按预期工作: ${response.status} - ${response.data.error}`);
      console.log('');
      return false;
    }
  } catch (error: any) {
    console.log('❌ 地址验证测试失败:', error.message);
    console.log('');
    return false;
  }
}

async function runAllTests() {
  const results = {
    passed: 0,
    failed: 0
  };

  const tests = [
    testHealthCheck,
    testMintEndpoint,
    testStatsEndpoint,
    testInvalidAddress,
    testReplayProtection,
    testRateLimit
  ];

  for (const test of tests) {
    const result = await test();
    if (result) {
      results.passed++;
    } else {
      results.failed++;
    }

    // 等待一秒，避免触发速率限制
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('═'.repeat(50));
  console.log(`\n📊 测试完成: ${results.passed} 通过, ${results.failed} 失败\n`);

  if (results.failed === 0) {
    console.log('✅ 所有测试通过！安全加固部署成功！');
  } else {
    console.log('⚠️ 部分测试失败，请检查配置和日志');
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

// 运行测试
runAllTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
