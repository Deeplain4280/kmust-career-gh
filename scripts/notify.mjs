#!/usr/bin/env node
// 把日报推送到微信：支持 企业微信群机器人 / 企业微信应用 / Server酱 / PushPlus / WxPusher
// 用法: node scripts/notify.mjs [--dry] [--file reports/latest.msg.md]
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY = args.includes("--dry") || process.env.DRY_RUN === "1";
const fileArg = args.indexOf("--file");

/* ---------- 配置：环境变量优先，其次 config.json ---------- */
function loadCfg() {
  let j = {};
  const f = path.join(ROOT, "config.json");
  if (fs.existsSync(f)) { try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { console.error("[config] 解析失败: " + e.message); } }
  const get = (k) => {
    const v = String(process.env[k] || j[k] || "").trim();
    if (!v || /把群机器人|填这里|your|xxx|^(<|请)/i.test(v)) return "";
    return v;
  };
  return {
    wecomWebhook: get("WECOM_WEBHOOK"),
    wecomCorpId: get("WECOM_CORPID"),
    wecomSecret: get("WECOM_SECRET"),
    wecomAgentId: get("WECOM_AGENTID"),
    wecomToUser: get("WECOM_TOUSER") || "@all",
    serverchanKey: get("SERVERCHAN_KEY"),
    pushplusToken: get("PUSHPLUS_TOKEN"),
    wxpusherAppToken: get("WXPUSHER_APPTK"),
    wxpusherUids: get("WXPUSHER_UIDS"),
    titlePrefix: get("TITLE_PREFIX") || "",
  };
}

function readMsg() {
  const p = fileArg > -1 ? path.resolve(args[fileArg + 1]) : path.join(ROOT, "reports", "latest.msg.md");
  if (!fs.existsSync(p)) throw new Error("找不到消息文件: " + p + "（先运行 scripts/daily.mjs）");
  return { text: fs.readFileSync(p, "utf8").trim(), file: p };
}

/* ---------- 各通道发送 ---------- */
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 20) + "\n…（内容过长已截断）");

async function sendWecomBot(cfg, text) {
  // 企业微信群机器人 markdown，上限 4096 字节
  const body = { msgtype: "markdown", markdown: { content: clip(text, 1900) + "\n" } };
  if (DRY) return { channel: "企业微信群机器人", dry: true, payload: body };
  const r = await fetch(cfg.wecomWebhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { channel: "企业微信群机器人", ok: j.errcode === 0, resp: j };
}

async function wecomToken(cfg) {
  const u = "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=" + encodeURIComponent(cfg.wecomCorpId) + "&corpsecret=" + encodeURIComponent(cfg.wecomSecret);
  const j = await (await fetch(u)).json();
  if (!j.access_token) throw new Error("gettoken 失败: " + JSON.stringify(j));
  return j.access_token;
}

async function sendWecomApp(cfg, text) {
  const body = { touser: cfg.wecomToUser, msgtype: "text", agentid: Number(cfg.wecomAgentId), text: { content: clip(text, 1800) }, safe: 0 };
  if (DRY) return { channel: "企业微信应用消息", dry: true, payload: body };
  const token = await wecomToken(cfg);
  const r = await fetch("https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=" + token, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { channel: "企业微信应用消息", ok: j.errcode === 0, resp: j };
}

async function sendServerchan(cfg, text) {
  const title = ((cfg.titlePrefix || "") + (text.split("\n")[0] || "宣讲会日报")).slice(0, 32);
  const key = cfg.serverchanKey.trim();
  // Server酱³ (SCT 且形如 sctp12345txxxx) 与 Turbo 版接口不同
  const m3 = key.match(/^sctp(\d+)t/i);
  const url = m3 ? "https://" + m3[1] + ".push.ft07.com/send" : "https://sctapi.ftqq.com/" + encodeURIComponent(key) + ".send";
  const body = m3 ? { sendkey: key, title, desp: text } : new URLSearchParams({ title, desp: text.replace(/\n/g, "\n\n") });
  if (DRY) return { channel: "Server酱", dry: true, payload: { url, title, desp: clip(text, 300) } };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": m3 ? "application/json" : "application/x-www-form-urlencoded" },
    body: m3 ? JSON.stringify(body) : body,
  });
  const j = await r.json().catch(() => ({}));
  const ok = m3 ? j.code === 0 : j.code === 0;
  return { channel: "Server酱", ok, resp: j };
}

async function sendPushplus(cfg, text) {
  const body = { token: cfg.pushplusToken, title: (cfg.titlePrefix || "") + (text.split("\n")[0] || "宣讲会日报"), content: text.replace(/\n/g, "<br/>"), template: "html", channel: "wechat" };
  if (DRY) return { channel: "PushPlus", dry: true, payload: { ...body, content: clip(text, 200) } };
  const r = await fetch("https://www.pushplus.plus/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { channel: "PushPlus", ok: j.code === 200, resp: j };
}

async function sendWxpusher(cfg, text) {
  const body = { appToken: cfg.wxpusherAppToken, content: text.replace(/\n/g, "<br/>"), summary: text.split("\n")[0], contentType: 2, uids: cfg.wxpusherUids.split(",").map((s) => s.trim()).filter(Boolean) };
  if (DRY) return { channel: "WxPusher", dry: true, payload: { ...body, content: clip(text, 200) } };
  const r = await fetch("https://wxpusher.zjiecode.com/api/send/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { channel: "WxPusher", ok: j.code === 1000, resp: j };
}

/* ---------- 主流程 ---------- */
const cfg = loadCfg();
const { text, file } = readMsg();
const tasks = [];
if (cfg.wecomWebhook) tasks.push(() => sendWecomBot(cfg, text));
if (cfg.wecomCorpId && cfg.wecomSecret && cfg.wecomAgentId) tasks.push(() => sendWecomApp(cfg, text));
if (cfg.serverchanKey) tasks.push(() => sendServerchan(cfg, text));
if (cfg.pushplusToken) tasks.push(() => sendPushplus(cfg, text));
if (cfg.wxpusherAppToken && cfg.wxpusherUids) tasks.push(() => sendWxpusher(cfg, text));

console.error("[msg] " + file + "（" + text.length + " 字）");
if (!tasks.length) {
  console.error("[!] 未配置任何推送通道。请在 kmust-career-daily/config.json 里填写 Server酱 SendKey（SERVERCHAN_KEY）。");
  process.exitCode = 2;
}

let okCount = 0;
for (const t of tasks.length ? tasks : []) {
  try {
    const res = await t();
    const label = res.channel + (res.dry ? " [DRY]" : "");
    if (res.dry) { console.error("[dry] " + label); console.log(JSON.stringify(res.payload, null, 2)); okCount++; }
    else if (res.ok) { console.error("[ok] " + label); okCount++; }
    else { console.error("[fail] " + label + " → " + JSON.stringify(res.resp)); }
  } catch (e) { console.error("[error] " + String(e.message || e)); }
}
if (DRY) console.log("\n--- 待推送文案 ---\n" + text);
if (tasks.length) process.exitCode = okCount > 0 ? 0 : 1;
