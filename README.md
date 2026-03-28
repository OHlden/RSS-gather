# RSS AI 聚合器

自动聚合多个 RSS 源，使用 OpenAI 生成摘要，并生成新的 RSS 源和展示页面。

## 部署

1. Fork 本仓库
2. 在仓库的 Settings -> Secrets and variables -> Actions 中添加 `OPENAI_API_KEY`
3. GitHub Actions 会自动每小时运行一次，更新 `public/feed.xml`
4. 开启 GitHub Pages：仓库 Settings -> Pages -> Source = GitHub Actions 或 Deploy from branch (选择 main 分支 /public 文件夹)

## 本地测试

```bash
npm install
cp .env.example .env   # 填入你的 OPENAI_API_KEY
npm run generate
