#!/usr/bin/env node

/**
 * 优化效果测试脚本
 * 用于验证 Cloudflare Workers 优化版本的性能提升
 */

const https = require("https");
const http = require("http");

class OptimizationTester {
  constructor(workerUrl) {
    this.workerUrl = workerUrl.replace(/\/$/, "");
    this.testDuration = 60000; // 1分钟测试
    this.concurrency = 10; // 并发请求数
    this.results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      errors: [],
      startTime: Date.now(),
      endTime: 0,
    };
  }

  async runTest() {
    console.log("🚀 开始优化效果测试...");
    console.log(`📍 测试目标: ${this.workerUrl}`);
    console.log(`⏱️  测试时长: ${this.testDuration / 1000}秒`);
    console.log(`🔄 并发数: ${this.concurrency}`);
    console.log("");

    const testPromises = [];
    for (let i = 0; i < this.concurrency; i++) {
      testPromises.push(this.runWorker(i));
    }

    // 等待测试完成
    await Promise.all(testPromises);
    this.results.endTime = Date.now();

    this.printResults();
  }

  async runWorker(workerId) {
    const endTime = Date.now() + this.testDuration;

    while (Date.now() < endTime) {
      await this.makeRequest(workerId);
      // 小延迟避免完全压垮服务
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async makeRequest(workerId) {
    const requestId = this.results.totalRequests++;
    const startTime = Date.now();

    try {
      const response = await this.httpRequest(
        {
          hostname: new URL(this.workerUrl).hostname,
          path: "/decode",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": `OptimizationTester/${workerId}`,
          },
        },
        JSON.stringify({
          bookId: `test-book-${workerId}`,
          chapterId: `test-chapter-${requestId}`,
          content: `测试内容 ${requestId}：马芸今天去了鹅厂开会，讨论猪厂的新项目进展。东哥和雷布斯也参加了会议，大家对字节的新功能很感兴趣。`,
          bookMeta: { type: "urban" },
        })
      );

      const responseTime = Date.now() - startTime;

      if (response.statusCode === 200) {
        this.results.successfulRequests++;
        this.results.responseTimes.push(responseTime);

        // 解析响应，检查优化特性
        try {
          const data = JSON.parse(response.data);
          if (data._meta) {
            // 这是优化版本的响应
            console.log(
              `✅ 请求 ${requestId} 成功: ${responseTime}ms (优化版)`
            );
          } else {
            console.log(`✅ 请求 ${requestId} 成功: ${responseTime}ms`);
          }
        } catch (e) {
          console.log(`✅ 请求 ${requestId} 成功: ${responseTime}ms`);
        }
      } else {
        this.results.failedRequests++;
        this.results.errors.push({
          requestId,
          statusCode: response.statusCode,
          responseTime,
          error: response.data,
        });
        console.log(
          `❌ 请求 ${requestId} 失败: ${response.statusCode} (${responseTime}ms)`
        );
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.results.failedRequests++;
      this.results.errors.push({
        requestId,
        error: error.message,
        responseTime,
      });
      console.log(
        `💥 请求 ${requestId} 异常: ${error.message} (${responseTime}ms)`
      );
    }
  }

  httpRequest(options, data = null) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: body,
          });
        });
      });

      req.on("error", reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      if (data) {
        req.write(data);
      }
      req.end();
    });
  }

  printResults() {
    const duration = (this.results.endTime - this.results.startTime) / 1000;
    const qps = this.results.totalRequests / duration;
    const successRate =
      (this.results.successfulRequests / this.results.totalRequests) * 100;

    console.log("");
    console.log("📊 测试结果");
    console.log("=".repeat(50));
    console.log(`总请求数: ${this.results.totalRequests}`);
    console.log(`成功请求: ${this.results.successfulRequests}`);
    console.log(`失败请求: ${this.results.failedRequests}`);
    console.log(`成功率: ${successRate.toFixed(2)}%`);
    console.log(`测试时长: ${duration.toFixed(2)}秒`);
    console.log(`QPS: ${qps.toFixed(2)}`);

    if (this.results.responseTimes.length > 0) {
      const sorted = this.results.responseTimes.sort((a, b) => a - b);
      const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      console.log("");
      console.log("响应时间统计:");
      console.log(`  平均: ${avg.toFixed(0)}ms`);
      console.log(`  P50:  ${p50}ms`);
      console.log(`  P95:  ${p95}ms`);
      console.log(`  P99:  ${p99}ms`);
    }

    if (this.results.errors.length > 0) {
      console.log("");
      console.log("❌ 错误统计:");
      const errorGroups = {};
      this.results.errors.forEach((err) => {
        const key = err.statusCode || err.error;
        errorGroups[key] = (errorGroups[key] || 0) + 1;
      });

      Object.entries(errorGroups).forEach(([error, count]) => {
        console.log(`  ${error}: ${count}次`);
      });
    }

    console.log("");
    console.log("🎯 性能评估:");

    if (qps > 50) {
      console.log("✅ QPS 优秀 (>50)");
    } else if (qps > 20) {
      console.log("✅ QPS 良好 (20-50)");
    } else {
      console.log("⚠️ QPS 需要优化 (<20)");
    }

    if (successRate > 95) {
      console.log("✅ 成功率 优秀 (>95%)");
    } else if (successRate > 90) {
      console.log("✅ 成功率 良好 (90-95%)");
    } else {
      console.log("⚠️ 成功率 需要优化 (<90%)");
    }

    const avgResponse =
      this.results.responseTimes.length > 0
        ? this.results.responseTimes.reduce((a, b) => a + b, 0) /
          this.results.responseTimes.length
        : Infinity;

    if (avgResponse < 500) {
      console.log("✅ 响应时间 优秀 (<500ms)");
    } else if (avgResponse < 1000) {
      console.log("✅ 响应时间 良好 (500-1000ms)");
    } else {
      console.log("⚠️ 响应时间 需要优化 (>1000ms)");
    }

    console.log("");
    console.log("💡 优化建议:");
    if (successRate < 95) {
      console.log("• 检查服务配置和资源限制");
    }
    if (avgResponse > 1000) {
      console.log("• 考虑启用更多缓存层");
    }
    if (qps < 20) {
      console.log("• 检查网络延迟和并发配置");
    }
    if (this.results.errors.some((e) => e.statusCode === 429)) {
      console.log("• 遇到速率限制，考虑升级计划");
    }

    console.log("");
    console.log("🎉 测试完成！");
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("用法: node test-optimization.js <worker-url>");
    console.log(
      "示例: node test-optimization.js https://my-worker.workers.dev"
    );
    process.exit(1);
  }

  const workerUrl = args[0];
  const tester = new OptimizationTester(workerUrl);

  try {
    await tester.runTest();
  } catch (error) {
    console.error("测试失败:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = OptimizationTester;
