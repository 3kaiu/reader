import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 配置文件
 * 用于 Nexus-Reader 自动化测试
 * https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './tests',
    /* 每个测试的最长运行时间 */
    timeout: 30 * 1000,
    expect: {
        timeout: 5000
    },
    /* 失败时重试 */
    retries: process.env.CI ? 2 : 0,
    /* 全量运行时的并行度 */
    workers: process.env.CI ? 1 : undefined,
    /* 报告器格式 */
    reporter: 'html',
    /* 基础路径和浏览器配置 */
    use: {
        baseURL: 'http://localhost:3000',
        /* 捕获痕迹 (只在第一次失败重试时执行) */
        trace: 'on-first-retry',
        /* 自动截屏 */
        screenshot: 'only-on-failure',
    },

    /* 在多个浏览器中运行 */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 5'] },
        },
        {
            name: 'mobile-safari',
            use: { ...devices['iPhone 12'] },
        },
    ],

    /* 运行测试前先启动本地服务器 */
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
    },
});
