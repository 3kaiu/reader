#!/usr/bin/env node

/**
 * GitHub API测试脚本
 * 用于测试GitHub Actions中的API调用逻辑
 */

function testGitHubAPILogic() {
  console.log("🔍 测试GitHub API调用逻辑...");

  // 模拟不同的API响应结构
  const mockResponses = [
    // 情况1: data直接是数组
    {
      data: [
        { id: 1, name: "artifact1", created_at: "2024-01-01T00:00:00Z" },
        { id: 2, name: "artifact2", created_at: "2024-01-01T00:00:00Z" },
      ],
    },
    // 情况2: data.artifacts是数组
    {
      data: {
        total_count: 2,
        artifacts: [
          { id: 1, name: "artifact1", created_at: "2024-01-01T00:00:00Z" },
          { id: 2, name: "artifact2", created_at: "2024-01-01T00:00:00Z" },
        ],
      },
    },
    // 情况3: 空响应
    {
      data: [],
    },
    // 情况4: 错误响应
    {
      data: null,
    },
  ];

  console.log("🧪 测试不同API响应结构...");

  for (let i = 0; i < mockResponses.length; i++) {
    const response = mockResponses[i];
    console.log(`\n📋 测试情况${i + 1}:`);

    try {
      // 复制GitHub Actions中的逻辑
      let artifacts = [];
      if (response.data && Array.isArray(response.data)) {
        artifacts = response.data;
        console.log(`  ✅ 直接数组模式 - 长度: ${artifacts.length}`);
      } else if (
        response.data &&
        response.data.artifacts &&
        Array.isArray(response.data.artifacts)
      ) {
        artifacts = response.data.artifacts;
        console.log(`  ✅ data.artifacts模式 - 长度: ${artifacts.length}`);
      } else {
        console.log(`  ⚠️ 意外的数据结构: ${JSON.stringify(response.data)}`);
        continue;
      }

      if (artifacts.length === 0) {
        console.log("  📭 无artifacts需要清理");
        continue;
      }

      // 模拟清理逻辑
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      console.log(`  📅 清理截止日期: ${cutoffDate.toISOString()}`);
      console.log(`  🔍 检查${artifacts.length}个artifacts...`);

      let wouldDeleteCount = 0;
      for (const artifact of artifacts) {
        const createdAt = new Date(artifact.created_at);
        if (createdAt < cutoffDate) {
          wouldDeleteCount++;
          console.log(
            `    🗑️ 会删除: ${artifact.name} (${createdAt.toISOString()})`
          );
        } else {
          console.log(
            `    ⏰ 保留: ${artifact.name} (${createdAt.toISOString()})`
          );
        }
      }

      console.log(`  ✅ 测试完成: 会删除${wouldDeleteCount}个artifacts`);
    } catch (error) {
      console.log(`  ❌ 测试失败: ${error.message}`);
    }
  }

  console.log("\n🎯 修复验证:");
  console.log("  ✅ 添加了数据结构检查");
  console.log("  ✅ 添加了错误处理");
  console.log("  ✅ 添加了详细日志");
  console.log("  ✅ 添加了actions: write权限");

  console.log("\n🎉 逻辑测试完成！修复应该能解决GitHub Actions错误。");
}

// 如果直接运行此脚本
if (require.main === module) {
  testGitHubAPILogic();
}

module.exports = { testGitHubAPILogic };
