const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const { Feed } = require('feed');
const OpenAI = require('openai');
require('dotenv').config();

// 配置：你的 RSS 源列表
const RSS_SOURCES = [
  'https://hnrss.org/frontpage',      // Hacker News
  'https://feeds.feedburner.com/TechCrunch', // TechCrunch
  // 添加更多你想聚合的源
];

// 配置：最终生成的 RSS 信息
const FEED_INFO = {
  title: 'AI 精选周报',
  description: '聚合多个科技源，使用 AI 生成摘要后的精华内容',
  id: 'https://your-username.github.io/rss-ai-aggregator/',
  link: 'https://your-username.github.io/rss-ai-aggregator/',
  language: 'zh-cn',
  copyright: 'All rights reserved',
};

// 初始化 OpenAI（使用环境变量）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 初始化 RSS 解析器
const parser = new Parser();

// 存储所有文章
let allArticles = [];

// 调用 OpenAI 生成摘要
async function summarizeArticle(title, content) {
  if (!process.env.OPENAI_API_KEY) {
    // 如果没有 API Key，返回截断的内容作为摘要
    return content ? content.slice(0, 200) + '...' : '暂无内容';
  }

  try {
    const prompt = `
      请为以下文章生成一个简洁的中文摘要（不超过 150 字）：
      
      标题：${title}
      
      内容：${content ? content.slice(0, 2000) : '无详细内容'}
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error(`摘要生成失败 (${title}):`, error.message);
    return content ? content.slice(0, 200) + '...' : '摘要生成失败';
  }
}

// 抓取单个 RSS 源
async function fetchFeed(url) {
  try {
    console.log(`正在抓取: ${url}`);
    const feed = await parser.parseURL(url);
    const items = feed.items.map(item => ({
      title: item.title,
      link: item.link,
      content: item.content || item.contentSnippet || item.description || '',
      pubDate: new Date(item.pubDate),
      guid: item.guid || item.link,
      source: feed.title || url,
    }));
    return items;
  } catch (error) {
    console.error(`抓取失败 ${url}:`, error.message);
    return [];
  }
}

// 去重（基于 guid 或 link）
function deduplicate(articles) {
  const seen = new Set();
  return articles.filter(article => {
    const key = article.guid || article.link;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 主函数
async function main() {
  console.log('开始 RSS 聚合...');

  // 1. 抓取所有源
  const feedPromises = RSS_SOURCES.map(fetchFeed);
  const results = await Promise.allSettled(feedPromises);

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
    }
  }

  console.log(`共抓取到 ${allArticles.length} 篇文章`);

  // 2. 去重
  allArticles = deduplicate(allArticles);
  console.log(`去重后剩余 ${allArticles.length} 篇`);

  // 3. 按时间排序（最新的在前）
  allArticles.sort((a, b) => b.pubDate - a.pubDate);

  // 4. 限制文章数量（避免过多，节省 token）
  const ARTICLES_LIMIT = 20;
  const articlesToProcess = allArticles.slice(0, ARTICLES_LIMIT);
  console.log(`将处理前 ${articlesToProcess.length} 篇文章的摘要`);

  // 5. 为每篇文章生成 AI 摘要（可以并行，但注意 API 速率限制）
  for (let i = 0; i < articlesToProcess.length; i++) {
    const article = articlesToProcess[i];
    console.log(`[${i+1}/${articlesToProcess.length}] 正在生成摘要: ${article.title}`);
    article.summary = await summarizeArticle(article.title, article.content);
    // 避免过快调用 API，加入延时
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 6. 生成新 RSS
  const feed = new Feed(FEED_INFO);

  articlesToProcess.forEach(article => {
    feed.addItem({
      title: article.title,
      id: article.guid,
      link: article.link,
      description: article.summary,   // AI 生成的摘要作为 description
      content: article.content,       // 原始内容（可选）
      date: article.pubDate,
      author: [{ name: article.source }],
    });
  });

  // 7. 写入文件（存放在 public 目录，供 GitHub Pages 访问）
  const outputPath = path.join(__dirname, '../public/feed.xml');
  fs.writeFileSync(outputPath, feed.rss2());
  console.log(`✅ RSS 文件已生成: ${outputPath}`);

  // 同时生成一个 JSON 供前端展示（可选）
  const jsonPath = path.join(__dirname, '../public/feed.json');
  const jsonData = {
    title: FEED_INFO.title,
    description: FEED_INFO.description,
    updated: new Date().toISOString(),
    items: articlesToProcess.map(a => ({
      title: a.title,
      link: a.link,
      summary: a.summary,
      pubDate: a.pubDate,
      source: a.source,
    })),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
  console.log(`✅ JSON 文件已生成: ${jsonPath}`);
}

// 执行
main().catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});
