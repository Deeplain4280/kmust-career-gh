# Career Talk Daily Bot

[简体中文](README.md) | English

Checks a Tencent Docs spreadsheet of **campus recruitment talks (宣讲会 / 招聘会)** every morning,
turns "what's on today" into one WeChat message, and picks **the single best talk to attend**
for a student in a given major.

By default it targets **Computer Science** graduates and the Kunming University of Science and Technology
sheet *2026 宣讲会集锦*. Both the spreadsheet URL and the target major are configurable in
`settings.json` — **no code changes needed**.

> Every day at 07:30 (UTC+8) you get a message like the one below.
> (The sample is translated for readability — actual output follows the wording in `settings.json`.)
>
> ```
> 📣 2026-10-21 Kunming UST career talks (5 today)
>
> 1. 09:30 Xuanwei Dekang Livestock Co., Ltd.
>    Chenggong campus, Job Market 104 | 37 hires | any major
> 2. 14:00 Shenzhen Dynanonic Co., Ltd.
>    Chenggong campus, Job Market 103 | 73 hires | chemistry, any major, ...
> 3. 16:30 Baker Tilly China (Yunnan branch)
>    Chenggong campus, Job Market 103 | 90 hires | any major
>
> ⭐ Pick of the day: Baker Tilly 16:30
>    size: 90 hires (open to CS/any major) | majors: any
>    roles: tax advisor (30), consultant (30), audit assistant (30)
>    ⏰ registration closes 2026-10-21 16:30
>
> Backup: Deli Group 19:00 | 86 hires | automation, electronics, ...
> ```

## What it does every day

1. Opens the sheet configured in `settings.json` (it must be publicly readable — no login).
2. Finds the "宣讲会详情" (detail) link in every row, opens each one, and reads
   **company, time, venue, number of hires, required majors**.
3. Keeps only **today's** talks, scores them by *headcount + major relevance*,
   and picks one recommendation plus one backup.
4. Pushes the message to WeChat through ServerChan, and saves the full report as a file.

Everything runs on **GitHub's servers**, so your own machine can stay off.

## Quick start (~5 minutes)

### 1. Fork this repository
Click **Fork** (or use it as a template for a new repository).

### 2. Get a ServerChan key (for WeChat delivery)
- Open <https://sct.ftqq.com> in WeChat on your phone and scan to log in.
- Copy the **SendKey** shown on the page (looks like `SCT123456T...`).
- The free tier allows 5 messages per day; this project sends 1.

### 3. Store the key in GitHub (never in code)
Your repo → **Settings → Secrets and variables → Actions → New repository secret**

| Name | Secret |
| --- | --- |
| `SERVERCHAN_KEY` | your SendKey |

### 4. Enable Actions and run once
- **Actions** tab → if prompted, click *I understand my workflows, go ahead and enable them*
- Choose **宣讲会日报** on the left → **Run workflow** → green button
- It takes 1–2 minutes; green means success and you should receive the WeChat message

After that it runs automatically at **07:30 UTC+8** every day.

## Change the spreadsheet (no code)

Edit the first entries of **settings.json** in the repository root:

```json
"sheetUrl": "https://docs.qq.com/sheet/DRGFzVkJOZURwaVRs"
```

Three things to keep in mind:

1. The URL looks like `https://docs.qq.com/sheet/<id>` — copy it from the browser address bar.
2. The document must be **readable by anyone with the link**, otherwise nothing can be fetched.
3. Each talk row must contain a **hyperlink to its detail page**. This tool follows those links to read
   company / headcount / majors. A sheet containing plain text only will not work.
4. Switching documents needs no cache cleanup: the first run writes
   `scripts/cache/ids-<docId>.json`.
5. If the data lives in a sub-sheet, a `?tab=xxxx` parameter in the URL is detected automatically;
   otherwise put the sub-sheet ID in `sheetTab`.

## Change the target major (no code)

Also in **settings.json**:

| Field | Meaning | Example |
| --- | --- | --- |
| `targetMajor` | full name of your major (used in wording) | `"Computer Science"` |
| `targetMajorLabel` | short label shown in messages | `"CS"` |
| `strongKeywords` | keywords of closely related majors (strong match) | `["computer","software","AI"]` |
| `openKeywords` | phrasing for "any major" | `["any major","no major requirement"]` |
| `weakKeywords` | loosely related majors (weak match) | `["electronics","communications"]` |
| `weights` | scoring weights | see below |

Scoring formula (higher wins):

```
score = strong-match hires × 3
      + any-major hires  × 1.2
      + weak-match hires × 0.6
      + total hires      × 0.15
```

Example for an accounting major:

```json
"targetMajor": "Accounting",
"targetMajorLabel": "Accounting",
"strongKeywords": ["accounting", "finance", "audit", "tax"],
"openKeywords": ["any major"],
"weakKeywords": ["economics", "statistics"],
```

Raise `total` (e.g. `0.3`) to favour larger fairs, or `strong` (e.g. `5`) to favour major fit.

## Change the schedule

Edit this line in `.github/workflows/daily.yml`:

```yaml
- cron: "30 23 * * *"   # UTC! = UTC+8 minus 8 hours
```

- 07:30 Beijing → 23:30 UTC previous day → `30 23 * * *`
- 08:00 Beijing → 00:00 UTC → `0 0 * * *`

GitHub scheduled runs may be delayed by minutes (sometimes longer) under load — that is normal.

## Other delivery channels (optional)

Configure extra Secrets; no code changes required:

| Channel | Secrets | Notes |
| --- | --- | --- |
| WeCom group bot | `WECOM_WEBHOOK` | Add a bot to a WeCom group, copy the webhook |
| WeCom app message | `WECOM_CORPID` `WECOM_SECRET` `WECOM_AGENTID` | Can be received in WeChat via the WeCom plugin |
| PushPlus | `PUSHPLUS_TOKEN` | Follow their official account to get a token |
| WxPusher | `WXPUSHER_APPTK` `WXPUSHER_UIDS` | Same idea |
| ServerChan (default) | `SERVERCHAN_KEY` | Simplest, recommended |

Multiple channels can be active at the same time.

## FAQ

**No message received?**
1. Check whether the Actions run is green; open the log if red.
2. Make sure the secret is named exactly `SERVERCHAN_KEY`.
3. ServerChan's free tier allows 5 messages/day — check today's usage at sct.ftqq.com.

**It did not run the next day?**
- Scheduled workflows only run on the repository's **default branch** (usually `main`).
- **GitHub disables scheduled workflows in public repositories after 60 days without commits.**
  Trigger one manual run to re-enable them.
- To avoid that limitation entirely, make the repository private
  (Actions' free tier gives 2000 minutes/month; this job uses about 1 minute a day).

**The log says it cannot find links / data?**
- Is the sheet publicly readable? Are the links still valid?
- Does each row really carry a "detail" hyperlink?
- The detail pages live on a university site in China, so a GitHub runner may occasionally be slow or fail; re-running usually fixes it.

**How accurate is the data?**
- Company / time / venue / headcount / majors all come from the **detail pages linked in the sheet**; nothing is inferred.
- Only talks present in the sheet are covered.

**Where is the report saved?**
- Each run uploads the report as a build artifact: `YYYY-MM-DD-宣讲会日报.md`.

## Project layout

```
settings.json                # sheet URL, target major, keywords, weights
.github/workflows/daily.yml  # schedule and run steps
scripts/daily.mjs            # fetch + score + build the report
scripts/notify.mjs           # push to WeChat / WeCom / PushPlus / WxPusher
scripts/cache/               # link cache, used when a fetch fails
```

## Run locally (optional)

Requires Node.js 18+ and no dependencies:

```bash
node scripts/daily.mjs 2026-10-21                 # build the report only
node scripts/notify.mjs --dry                     # preview what would be sent
SERVERCHAN_KEY=SCTxxxx node scripts/notify.mjs    # actually send
```

## Disclaimer

- Not affiliated with the university or Tencent Docs; this project merely formats a publicly readable sheet.
- Sheet content and copyright belong to its authors; do not use commercially.
- Always refer to the original sheet / detail page for authoritative information.
- License: [Apache-2.0](LICENSE)
