export default {
  // 测试网站（必须能绕过 Cloudflare）
  TEST_URL: 'https://cf-clearance.pages.dev',

  // 默认测试端口（所有 IP 都使用这个端口进行验证）
  DEFAULT_PORT: 443,

  // 输出结果文件路径
  OUTPUT_TXT: 'pyip.txt',
  OUTPUT_JSON: 'proxies.json',

  // 并发数量（建议 5~10）
  CONCURRENCY: 5,

  // 单个代理测试超时时间（毫秒）
  TIMEOUT: 30000,

  // 是否开启调试模式（显示浏览器界面）
  DEBUG: false,

  // 是否启用自动更新代理源（true/false）
  AUTO_UPDATE_SOURCES: true,

  // 自动更新间隔（单位：小时）
  UPDATE_INTERVAL_HOURS: 10,

  // Redis 配置（GitHub Actions 中使用 localhost）
  REDIS: {
    host: '127.0.0.1', // ← 修改为本地地址，适用于 CI/CD 环境
    port: 6379,
    db: 0
  },

  // 地理位置查询 API
  GEOLOCATION_API: 'http://ip-api.com/json/'
};
