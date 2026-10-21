# 昆工宣讲会日报（GitHub Actions 托管）

每天北京时间 07:30 由 GitHub Actions 自动运行：
抓取腾讯文档《2026宣讲会集锦》→ 解析每行"宣讲会详情"链接 → 抓详情页拿到公司/时间/地点/人数/专业 →
按"计算机科学与技术应届生"打分（人数多 + 专业相关）给出当日推荐 → 通过 Server酱 推送到微信。

不依赖你的电脑开机，也不需要你自己的服务器。

## 一次性配置（5 分钟）
1. 新建 GitHub 仓库（建议 **Private**，避免日报内容公开），把本目录内容推上去：
   ```bash
   cd kmust-career-gh
   git init && git add -A && git commit -m "init: career daily"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
   > 没有 git 环境也可以：在仓库页面 "Add file → Upload files"，把 `.github`、`scripts`、`README.md`、`.gitignore` 拖进去提交。

2. 加 Secret：仓库 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `SERVERCHAN_KEY`
   - Secret: 你的 Server酱 SendKey（`SCT...`）

3. 打开 Actions：仓库 **Actions** 标签 → 若提示启用就点 **I understand my workflows, go ahead and enable them**

4. 手动跑一次验证：**Actions → 宣讲会日报 → Run workflow**（date 留空即今天）

## 定时说明
- `cron: "30 23 * * *"` = UTC 23:30 = **北京时间次日 07:30**
- GitHub 定时任务只会在**默认分支**上运行；高峰期可能延迟几分钟到几十分钟
- **公开仓库连续 60 天无提交会被自动停用定时任务**：每月手动 Run 一次，或随便提交一次即可恢复（Private 仓库不适用该限制）
- 想改时间：编辑 `.github\workflows\daily.yml` 里 cron（UTC 时间 = 北京时间 - 8 小时）

## 文件
- `scripts/daily.mjs`：抓取 + 打分 + 生成 Markdown 与微信短文（`reports/latest.msg.md`）
- `scripts/notify.mjs`：推送到微信（Server酱，兼容 Turbo 与 ③；也可切企业微信/PushPlus/WxPusher）
- `scripts/cache/ids.json`：文档里全部 101 条宣讲会链接的缓存，文档接口异常时兜底
- 产物：每次运行上传 artifact（含 `reports/最新日报.md`），失败会推送 ⚠️ 告警到微信并让 Action 标红

## 本地调试
```bash
node scripts/daily.mjs 2026-10-21     # 只生成
SERVERCHAN_KEY=SCTxxx node scripts/notify.mjs --dry   # 只预览不发送
```

## 数据来源与方法
文档 https://docs.qq.com/sheet/DRGFzVkJOZURwaVRs 公开可读、无需登录。腾讯文档表格接口返回的是压缩后的表格二进制，
值池与单元格无法可靠对齐；因此改用文档每行"宣讲会详情"富文本中的链接 `job.kmust.edu.cn/detail/career?id=N`，
从其 `window.PAGE_DATA` 读取精确字段。范围严格限定在该文档出现的场次内。
