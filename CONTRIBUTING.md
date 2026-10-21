# 参与贡献

感谢你愿意帮忙 🙌 这个项目很小，规则也很简单：**能让人看懂、能跑通、不把密钥提交上来**。

## 你可以贡献什么

- 🐛 报 Bug：抓不到数据、推送失败、打分不合理
- 🏫 适配其他学校/其他表格：把 `settings.json` 换成你们的表格链接跑一遍，告诉我哪里不兼容
- 🔔 新增推送渠道：钉钉、飞书、Telegram、邮件、Bark……
- 📝 文档：错别字、写不清楚的地方、补充例子
- 🌍 翻译：目前有 [简体中文](README.md) 和 [English](README.en.md)

## 提 Issue 前

先确认这几件事，能省一轮来回：

1. Actions 的日志（**Actions → 失败的运行 → 展开红色的步骤**），把报错原文贴上来
2. 是不是 Secret 没配或名字拼错（`SERVERCHAN_KEY` 要一字不差）
3. 表格是不是公开可读、那一行是不是真的带「宣讲会详情」超链接

## 本地跑起来

只需要 Node.js 18+，**没有任何第三方依赖**，不用 `npm install`：

```bash
git clone https://github.com/<you>/<repo>.git
cd <repo>

node scripts/daily.mjs 2026-10-21          # 只生成日报，落在 reports/
node scripts/notify.mjs --dry              # 只打印将要推送的内容，不会真发
SERVERCHAN_KEY=SCTxxxx node scripts/notify.mjs   # 真发一条到自己微信
```

想试「换专业」的效果，直接改 `settings.json` 里的 `targetMajor` / `strongKeywords` 再跑一次即可。

## 代码约定

- 纯 ESM（`.mjs`），**不引入依赖**，也不要有构建步骤
- 新增可调参数时，加进 `settings.json` 的默认值（`scripts/daily.mjs` 顶部的 `DEFAULTS`），保持对老配置兼容
- 抓取类代码要带**超时 + 重试**，失败时打印 HTTP 状态码，方便排查
- 用户可见的文案用中文（英文版 README 只翻译文档，不翻译输出）
- 提交信息用约定式前缀：`feat:` / `fix:` / `docs:` / `chore:`

## 绝对不要提交

- `config.json`、任何 `SCT...` / webhook 地址 / token（已在 `.gitignore` 里）
- `reports/` 下的日报（个人信息、体积也别大）
- 学校就业网上的个人联系方式、身份证号等隐私数据

## 新增一个推送渠道

1. 在 `scripts/notify.mjs` 里加一个 `sendXxx(cfg, text)`，返回 `{ channel, ok, resp }`，并支持 `DRY` 分支（返回 `{ channel, dry: true, payload }`）
2. 在 `loadCfg()` 里读对应的环境变量
3. 在文件底部把它 push 进 `tasks`（有配置才启用）
4. 更新 `README.md` / `README.en.md` 的渠道表格

## 适配其他学校 / 其他表格

本项目靠表格里「宣讲会详情」超链接指向的详情页取数据，字段来自页面内嵌的 `window.PAGE_DATA`：

- 换表格：只改 `settings.json` 的 `sheetUrl`（`sheetTab` 视情况）
- 详情页结构不同（不是 `PAGE_DATA` 或字段名不同）：改 `scripts/daily.mjs` 里的 `extractPageData` 和 `fetchCareer`
- 表格里没有详情链接（纯文字）：需要另写解析逻辑，欢迎开 Issue 讨论

## 提交 PR

1. Fork → 新建分支（`feat/xxx`、`fix/xxx`）
2. 本地跑通 `node scripts/daily.mjs` 和 `node scripts/notify.mjs --dry`
3. 提交时说明：**改了什么、为什么改、怎么验证的**（贴一段输出最好）
4. 如果改了行为或配置项，同步更新 README

## 行为准则

对事不对人，保持友善。技术分歧用数据和复现步骤说话。

## 许可

提交的代码默认按 [Apache-2.0](LICENSE) 授权。
