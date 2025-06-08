import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import Redis from 'ioredis';

// 导入配置和 IP 源
import config from './config.js';
import ipSources from './ip_sources.js';

const redis = new Redis(config.REDIS);

let total = 0;
let processed = 0;
let validCount = 0;

function initProgress(_total) {
  total = _total;
  processed = 0;
  validCount = 0;
}

function updateProgress(valid = false) {
  processed++;
  if (valid) validCount++;
}

function printProgress() {
  const progress = Math.round((processed / total) * 100);
  console.log(`⏳ 当前进度: ${processed}/${total} | 百分比: ${progress}% | 合格数: ${validCount}`);
}

/**
 * 使用 Playwright 检查代理是否可以绕过 Cloudflare
 * @param {string} ipPort - 带端口的 IP 地址，例如：192.168.1.1:8080
 */
async function checkProxy(ipPort) {
  const [ip, port] = ipPort.split(':');
  let browser = null;

  try {
    // 检查 Redis 中是否已缓存该代理的结果
    const cached = await redis.get(`proxy:${ip}`);
    if (cached === 'valid') {
      updateProgress(true);
      return { ip, port };
    }

    // 启动带代理的浏览器
    browser = await chromium.launch({
      proxy: {
        server: `${ip}:${port}`
      },
      headless: !config.DEBUG
    });

    const page = await browser.newPage();

    // 设置真实 User-Agent 和 Headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/'
    });

    // 访问目标页面
    await page.goto(config.TEST_URL, {
      waitUntil: 'networkidle',
      timeout: config.TIMEOUT
    });

    const content = await page.content();
    await browser.close();

    // 判断是否通过 Cloudflare
    if (!content.includes("Just a moment...")) {
      updateProgress(true);
      await redis.setex(`proxy:${ip}`, 3600 * 24, 'valid'); // 缓存 24 小时
      return { ip, port };
    }

    await redis.setex(`proxy:${ip}`, 3600 * 2, 'invalid'); // 缓存失败结果 2 小时
  } catch (e) {
    await redis.setex(`proxy:${ip}`, 3600 * 2, 'invalid');
  } finally {
    if (browser) await browser.close();
    updateProgress();
    printProgress();
  }

  return null;
}

/**
 * 主函数：获取 IP 列表并检查有效性
 */
async function fetchAndCheckIps() {
  let allIps = [];

  if (config.AUTO_UPDATE_SOURCES) {
    for (let source of ipSources) {
      try {
        const res = await fetch(source);
        const text = await res.text();
        const ips = text
          .split('\n')
          .map(line => line.split('#')[0].trim())
          .filter(line => /^(\d{1,3}\.){3}\d{1,3}:\d+$/.test(line));
        allIps.push(...ips);
      } catch (e) {
        console.error(`获取失败: ${source}`);
      }
    }
  } else {
    console.log('⚠️ 已关闭自动更新代理源，请手动维护 ip_sources.js');
  }

  // 去重处理
  const uniqueIps = [...new Set(allIps)];
  console.log(`🔍 共获取到 ${uniqueIps.length} 个IP`);

  initProgress(uniqueIps.length);

  // 构建任务队列
  const tasks = uniqueIps.map(ipPort => () => checkProxy(ipPort));

  // 手写并发控制
  const results = await runConcurrent(tasks, config.CONCURRENCY);

  // 过滤出有效的 IP
  const validProxies = results.filter(proxy => proxy !== null);
  console.log(`✅ 最终合格IP数量: ${validProxies.length}`);

  // 写入文本文件
  const ipOnly = validProxies.map(p => p.ip);
  await fs.writeFile(config.OUTPUT_TXT, ipOnly.join('\n'));
  console.log(`💾 已保存至 ${config.OUTPUT_TXT}`);

  // 写入 JSON 文件
  const jsonContent = validProxies.map(proxy => ({
    ip: proxy.ip,
    port: proxy.port,
    country: 'Unknown', // 可替换为实际地理信息接口
    lastChecked: Date.now()
  }));
  await fs.writeFile(config.OUTPUT_JSON, JSON.stringify(jsonContent, null, 2));
  console.log(`📄 已保存至 ${config.OUTPUT_JSON}`);

  // 自动提交到 GitHub
  exec('git config --local user.email "bot@example.com" && git config --local user.name "Bot" && git add pyip.txt proxies.json && git commit -m "Update IPs" && git push', (err) => {
    if (err) console.error('Git 提交失败:', err);
    else console.log('✅ Git 提交成功');
  });
}

/**
 * 手写并发控制器（无 p-queue）
 * @param {Array<Function>} tasks - 函数数组，每个函数返回一个 Promise
 * @param {number} concurrency - 最大并发数
 */
async function runConcurrent(tasks, concurrency) {
  const results = [];
  let i = 0;

  while (i < tasks.length) {
    const promises = [];
    for (let j = 0; j < concurrency && i < tasks.length; j++) {
      const task = tasks[i++];
      promises.push(task().catch(() => null));
    }
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  return results;
}

// 启动主程序
fetchAndCheckIps();

// 如果启用自动更新，则设置定时器
if (config.AUTO_UPDATE_SOURCES) {
  setInterval(fetchAndCheckIps, config.UPDATE_INTERVAL_HOURS * 60 * 60 * 1000);
}
