#!/usr/bin/env node
// 昆明理工大学 2026 宣讲会日报 —— 数据源：腾讯文档《2026宣讲会集锦》
// 用法: node scripts/daily.mjs [YYYY-MM-DD]   默认取北京时间当天
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const DOC_ID = "DRGFzVkJOZURwaVRs";
const DOC_URL = "https://docs.qq.com/sheet/" + DOC_ID;
const TAB = "BB08J2";
const ROOT = process.cwd();
const OUT_DIR = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(ROOT, "reports");
const CACHE = path.join(ROOT, "scripts", "cache", "ids.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* ---------- 1. 从文档取宣讲会详情链接 ---------- */
async function fetchDocIds() {
  const url = "https://docs.qq.com/dop-api/opendoc?id=" + DOC_ID +
    "&normal=1&outformat=1&wb=1&nowb=0&noEscape=1&tab=" + TAB +
    "&needSheetState=1&sliceStates=1&enableSmartsheetSplit=1&block_start_row=0&block_end_row=255&block_start_col=0&block_end_col=31&startrow=0&endrow=200";
  const r = await fetch(url, { headers: { Referer: DOC_URL, "User-Agent": UA } });
  if (!r.ok) throw new Error("opendoc HTTP " + r.status);
  const j = await r.json();
  const blocks = j?.clientVars?.collab_client_vars?.initialAttributedText?.text?.[0]?.block_datas ?? [];
  const ids = [];
  for (const b of blocks) {
    if (!b.related_sheet) continue;
    const s = zlib.inflateSync(Buffer.from(b.related_sheet, "base64")).toString("latin1");
    for (const m of s.matchAll(/career\?id=(\d+)/g)) ids.push(m[1]);
  }
  return [...new Set(ids)];
}

async function idsWithCache() {
  try {
    const ids = await fetchDocIds();
    if (!ids.length) throw new Error("no ids in document");
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(ids, null, 2));
    console.error("[doc] " + ids.length + " 条宣讲会链接（已更新缓存）");
    return ids;
  } catch (e) {
    console.error("[doc] 抓取失败，改用缓存: " + String(e.message || e));
    if (!fs.existsSync(CACHE)) throw new Error("文档抓取失败且无缓存可用");
    const ids = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    console.error("[cache] " + ids.length + " 条链接");
    return ids;
  }
}

/* ---------- 2. 抓宣讲会详情页 window.PAGE_DATA ---------- */
function extractPageData(html) {
  const start = html.indexOf("window.PAGE_DATA");
  if (start < 0) return null;
  const i = html.indexOf("{", html.indexOf("=", start));
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < html.length; j++) {
    const ch = html[j];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return JSON.parse(html.slice(i, j + 1)); }
  }
  return null;
}

async function fetchCareer(id) {
  for (let a = 0; a < 3; a++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 25000);
      const r = await fetch("http://job.kmust.edu.cn/detail/career?id=" + id, { headers: { "User-Agent": UA }, signal: ctl.signal });
      const html = await r.text();
      clearTimeout(t);
      const pd = extractPageData(html);
      if (!pd?.career) throw new Error("no career data");
      const c = pd.career;
      const jobs = (c.jobs || []).map((j) => ({
        name: (j.job_name || "").trim(),
        major: (j.about_major || "").trim(),
        num: parseInt(String(j.job_number || "0").replace(/[^0-9]/g, ""), 10) || 0,
        degree: (j.degree_require || "").trim(),
      }));
      return {
        id,
        company: (c.company_name || c.meet_name || "").trim(),
        time: (c.meet_time || "").trim(),
        field: (c.field_type_name || "").trim(),
        address: ((c.address || "") + (c.room ? "，" + c.room : "")).trim(),
        signEnd: (c.sign_up_end_time || "").trim(),
        overdue: !!c.is_overdue,
        jobs,
        totalNum: jobs.reduce((s, j) => s + j.num, 0),
      };
    } catch (e) {
      if (a === 2) return { id, error: String(e?.message || e) };
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}

/* ---------- 3. 打分：计算机科学与技术应届生 ---------- */
const STRONG = /计算机|软件工程|信息安全|网络工程|人工智能|数据科学|大数据|物联网|信息管理|信息与计算|智能科学/;
const OPEN = /不限专业/;
const WEAK = /电子|通信|自动化|电气|控制|仪器|测控|数学|统计|物理/;

function splitTime(t) {
  const m = (t || "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}:\d{2})?/);
  if (!m) return { date: "日期待定", hm: "", raw: t };
  const p = (x) => String(x).padStart(2, "0");
  return { date: m[1] + "-" + p(m[2]) + "-" + p(m[3]), hm: m[4] || "待定", raw: t };
}
function classify(j) {
  const mj = j.major || "";
  if (STRONG.test(mj)) return "strong";
  if (OPEN.test(mj)) return "open";
  if (WEAK.test(mj)) return "weak";
  return "none";
}
function scoreEvent(ev) {
  let strong = 0, open = 0, weak = 0;
  for (const j of ev.jobs) {
    const k = classify(j);
    if (k === "strong") strong += j.num;
    else if (k === "open") open += j.num;
    else if (k === "weak") weak += j.num;
  }
  return { ...ev, strong, open, weak, csNum: strong + open, score: Math.round((strong * 3 + open * 1.2 + weak * 0.6 + ev.totalNum * 0.15) * 10) / 10 };
}
function majorsShort(ev) {
  const tags = new Set();
  for (const j of ev.jobs) {
    const k = classify(j);
    if (k === "strong") for (const x of j.major.match(/计算机|软件工程|信息安全|网络工程|人工智能|数据科学|大数据|物联网|信息管理/g) || []) tags.add(x);
    else if (k === "open") tags.add("不限专业");
    else if (k === "weak") for (const x of j.major.match(/电子|通信|自动化|电气|控制|测控/g) || []) tags.add(x);
    else if (j.major) tags.add(j.major.split(/[，,、\/]/)[0].slice(0, 8));
  }
  return [...tags].slice(0, 6).join("、") || "见详情";
}
const addr = (e) => ((e.field || "") + (e.address || "").replace(/^呈贡校区/, "").replace(/,/g, "，")).trim();

/* ---------- 4. 生成日报 ---------- */
async function main() {
  const today = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])
    ? process.argv[2]
    : new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });

  const ids = await idsWithCache();
  const all = [];
  let idx = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (idx < ids.length) { const id = ids[idx++]; all.push(await fetchCareer(id)); }
  }));

  const ok = all.filter((c) => !c.error).map((c) => ({ ...c, ...splitTime(c.time) }));
  ok.forEach((e) => { e.majorsShort = majorsShort(e); });
  const failed = all.filter((c) => c.error);
  console.error("[career] 成功 " + ok.length + " / " + all.length + (failed.length ? "，失败 id: " + failed.map((f) => f.id).join(",") : ""));

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 全抓取失败 → 推送告警并让工作流失败，避免"静默无场次"
  if (!ok.length) {
    const alert = "⚠️ " + today + " 宣讲会抓取失败\n\n文档/详情页均未取到数据（共 " + all.length + " 条链接）。\n" +
      "可能原因：网络不可达、站点改版、或缓存失效。\n请检查 Actions 日志：" + (process.env.GITHUB_SERVER_URL || "") + "/" +
      (process.env.GITHUB_REPOSITORY || "") + "/actions";
    fs.writeFileSync(path.join(OUT_DIR, "latest.msg.md"), alert, "utf8");
    console.error("[!] 全部抓取失败");
    process.exitCode = 1;
    return;
  }

  const todays = ok.filter((e) => e.date === today).map(scoreEvent).sort((a, b) => a.time.localeCompare(b.time));
  const upcoming = ok.filter((e) => e.date > today).sort((a, b) => a.time.localeCompare(b.time));

  const L = [];
  L.push("# " + today + " 宣讲会日报（来源：2026宣讲会集锦）", "");
  L.push("> 数据源：" + DOC_URL + "（文档内共解析到 " + ok.length + " 场已链接详情的宣讲会）", "");
  if (!todays.length) {
    L.push("## 今日无宣讲会", "");
    if (upcoming.length) L.push("最近一场：" + upcoming[0].date + " " + upcoming[0].hm + "｜" + upcoming[0].company + "｜" + upcoming[0].totalNum + "人", "");
  } else {
    L.push("## 今日宣讲会（" + todays.length + " 场）", "");
    L.push("| 时间 | 公司 | 地点 | 招聘人数 | 专业要求 |", "| --- | --- | --- | --- | --- |");
    for (const e of todays) L.push("| " + e.hm + " | " + e.company + " | " + addr(e) + " | " + e.totalNum + " | " + e.majorsShort + " |");
    L.push("");

    const ranked = [...todays].sort((a, b) => b.score - a.score || b.totalNum - a.totalNum || a.time.localeCompare(b.time));
    const best = ranked[0];
    L.push("## 今日推荐：" + best.company + "（" + best.hm + "）", "");
    L.push("- 地点：" + addr(best));
    L.push("- 招聘人数：" + best.totalNum + " 人（计算机/不限专业可投 " + best.csNum + " 人）");
    L.push("- 专业要求：" + best.majorsShort);
    const why = [];
    if (best.strong > 0) why.push("明确招收计算机类专业约 " + best.strong + " 人");
    if (best.open > 0) why.push("不限专业岗位约 " + best.open + " 人，计算机专业可直接投");
    why.push(best.totalNum >= 60 ? "全场招 " + best.totalNum + " 人，当天规模最大一档" : "当天全场共招 " + best.totalNum + " 人");
    L.push("- 推荐理由：综合“招聘人数 + 专业相关度”打分最高（" + best.score + " 分）；" + why.join("；"));
    const aj = best.jobs.filter((j) => ["strong", "open"].includes(classify(j))).sort((a, b) => b.num - a.num).slice(0, 5);
    if (aj.length) { L.push("- 计算机专业可投岗位："); for (const j of aj) L.push("  - " + j.name + "｜" + j.num + " 人｜" + (j.major || "专业不限")); }
    if (best.signEnd) L.push("- 报名截止：" + best.signEnd + "（务必在此之前完成线上投递）");
    L.push("- 建议：提前 15 分钟到场，先投人数最多的岗位，再补投其他不限专业岗位。", "");

    const second = ranked[1];
    if (second) {
      L.push("## 备选推荐：" + second.company + "（" + second.hm + "）", "");
      L.push("- 地点：" + addr(second) + "｜招聘 " + second.totalNum + " 人｜专业：" + second.majorsShort);
      const sj = second.jobs.filter((j) => ["strong", "open"].includes(classify(j))).sort((a, b) => b.num - a.num).slice(0, 3);
      if (sj.length) L.push("- 可投岗位：" + sj.map((j) => j.name + "(" + j.num + "人)").join("、"));
      L.push("- 适用情况：想投研发/技术类岗位或更看重岗位贴近度时优先选这场（" + second.score + " 分）。", "");
    }
  }
  if (upcoming.length) {
    L.push("## 后续场次", "");
    for (const e of upcoming.slice(0, 5)) L.push("- " + e.date + " " + e.hm + "｜" + e.company + "｜" + e.totalNum + "人");
    L.push("");
  }
  const md = L.join("\n");
  const file = path.join(OUT_DIR, today + "-宣讲会日报.md");
  fs.writeFileSync(file, md, "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "latest.md"), md, "utf8");
  console.log(md);

  /* ---------- 微信推送用短文 ---------- */
  const W = [];
  W.push("📣 " + today + " 昆工宣讲会（共 " + todays.length + " 场）", "");
  if (!todays.length) {
    W.push("今日无宣讲会。");
    if (upcoming.length) W.push("最近一场：" + upcoming[0].date + " " + upcoming[0].hm + " " + upcoming[0].company);
  } else {
    todays.forEach((e, i) => {
      W.push((i + 1) + ". " + e.hm + " " + e.company);
      W.push("   " + addr(e) + "｜" + e.totalNum + "人｜" + e.majorsShort);
    });
    const ranked = [...todays].sort((a, b) => b.score - a.score || b.totalNum - a.totalNum || a.time.localeCompare(b.time));
    const best = ranked[0];
    W.push("", "⭐ 今日推荐：" + best.company + " " + best.hm);
    W.push("   地点：" + addr(best));
    W.push("   规模：" + best.totalNum + " 人（计算机/不限可投 " + best.csNum + " 人）｜专业：" + best.majorsShort);
    const aj = best.jobs.filter((j) => ["strong", "open"].includes(classify(j))).sort((a, b) => b.num - a.num).slice(0, 3);
    if (aj.length) W.push("   可投：" + aj.map((j) => j.name + "(" + j.num + ")").join("、"));
    W.push("   理由：人数×专业相关度综合最高（" + best.score + " 分）");
    if (best.signEnd) W.push("   ⏰ 报名截止：" + best.signEnd);
    const second = ranked[1];
    if (second) W.push("", "备选：" + second.company + " " + second.hm + "｜" + second.totalNum + "人｜" + second.majorsShort);
  }
  if (upcoming.length) W.push("", "近期：" + upcoming.slice(0, 3).map((e) => e.date.slice(5) + " " + e.hm + " " + e.company + "(" + e.totalNum + "人)").join("｜"));
  W.push("", "来源：腾讯文档《2026宣讲会集锦》");
  const msg = W.join("\n");
  fs.writeFileSync(path.join(OUT_DIR, "latest.msg.md"), msg, "utf8");
  console.error("[saved] " + file + "（推送文案 " + msg.length + " 字）");
}

main().catch((e) => { console.error("[fatal] " + (e?.stack || e)); process.exitCode = 1; });
