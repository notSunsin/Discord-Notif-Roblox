'use strict';

// dotenv aktif setelah npm install; unit test tetap bisa berjalan tanpa dependencies.
try {
  require('dotenv').config();
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const fs = require('node:fs');
const path = require('node:path');

// WEAO documentation requires this exact User-Agent.
const WEAO_AGENT = 'WEAO-3PService';
const FUTURE_URL = 'https://weao.xyz/api/versions/future';
const EXPLOITS_URL = 'https://weao.xyz/api/status/exploits';
const CHANGELOG_URL = EXPLOITS_URL + '/changelogs/potassium';

const STATE_FILE = path.join(__dirname, 'state.json');
const POLL_MINUTES = Math.max(2, Number(process.env.POLL_MINUTES) || 5);
const POLL_MS = POLL_MINUTES * 60 * 1000;

function clean(value, fallback = 'Tidak tersedia') {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const output = String(value).trim();
  return output || fallback;
}

function safe(value, fallback) {
  return clean(value, fallback)
    .replace(/@/g, '@\u200b') // prevent accidental mentions from API fields
    .replace(/`/g, 'ˋ')
    .replace(/\r/g, ' ');
}

function code(value) {
  return '`' + safe(value).slice(0, 1000) + '`';
}

function formatDate(value) {
  if (!value) return 'Tidak tersedia';
  const normalized = String(value).replace(/\s+at\s+/i, ' ');
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) return safe(value);
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  }).format(new Date(millis)) + ' WIB';
}

function parseFutureWindows(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Response /versions/future bukan objek JSON');
  }

  // Keep ONLY Windows, WindowsDate and WindowsResponse. Ignore Mac fields completely.
  const hash = typeof data.Windows === 'string' ? data.Windows.trim() : '';
  if (!/^version-[a-zA-Z0-9]+$/.test(hash)) {
    throw new Error('Windows future version tidak tersedia atau format hash tidak valid');
  }

  const extra = data.WindowsResponse && typeof data.WindowsResponse === 'object'
    ? data.WindowsResponse : {};
  return {
    hash,
    date: typeof data.WindowsDate === 'string' ? data.WindowsDate : null,
    build: typeof extra.version === 'string' ? extra.version : null,
    bootstrapper: typeof extra.bootstrapperVersion === 'string' ? extra.bootstrapperVersion : null,
  };
}

function parsePotassium(data) {
  if (!Array.isArray(data)) throw new Error('Response /status/exploits bukan array');
  const item = data.find(entry => entry &&
    typeof entry.title === 'string' &&
    entry.title.trim().toLowerCase() === 'potassium' &&
    typeof entry.platform === 'string' &&
    entry.platform.toLowerCase().includes('windows'));

  if (!item) throw new Error('Potassium Windows tidak ditemukan dalam response WEAO');
  if (typeof item.version !== 'string' || !item.version.trim()) {
    throw new Error('Versi Potassium tidak tersedia');
  }

  return {
    name: 'Potassium',
    platform: 'Windows',
    version: item.version.trim(),
    robloxVersion: typeof item.rbxversion === 'string' ? item.rbxversion.trim() : null,
    updatedDate: typeof item.updatedDate === 'string' ? item.updatedDate : null,
    updateStatus: item.updateStatus === true,
  };
}

function hasFutureChange(previous, current) {
  return !!previous && previous.hash !== current.hash;
}

function hasPotassiumUpdate(previous, current) {
  if (!previous || !current.updateStatus) return false;
  return previous.version !== current.version ||
    previous.robloxVersion !== current.robloxVersion ||
    (previous.updateStatus === false && current.updateStatus === true);
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeState(state) {
  const temporary = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, STATE_FILE);
}

function roleIds(type) {
  const keys = type === 'future'
    ? ['ROLE_FUTURE_WINDOWS_ID']
    : ['ROLE_UPDATE_ID', 'ROLE_POTASSIUM_ID'];
  return [...new Set(keys.map(key => process.env[key] || '').filter(x => /^\d{15,22}$/.test(x)))];
}

async function getJSON(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': WEAO_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`WEAO ${response.status} dari ${url}`);
  return response.json();
}

async function fetchPotassiumChangelog() {
  try {
    const data = await getJSON(CHANGELOG_URL);
    const entries = Array.isArray(data?.changelogs) ? data.changelogs : [];
    const lines = entries.slice(0, 5).map(entry => {
      if (typeof entry === 'string') return entry;
      if (!entry || typeof entry !== 'object') return '';
      return entry.description || entry.text || entry.content || entry.change || '';
    }).filter(s => typeof s === 'string' && s.trim());
    return lines.length ? lines.map(s => '- ' + safe(s)).join('\n').slice(0, 1000)
      : 'Changelog tidak tersedia dari WEAO.';
  } catch (error) {
    console.warn(`[Changelog] ${error.message}`);
    return 'Changelog tidak tersedia dari WEAO.';
  }
}

function makeFutureEmbed(current, demo) {
  return {
    color: 0x3B82F6,
    title: demo ? '[TEST] Future Roblox Version — Windows' : 'Future Roblox Version Detected! (Windows)',
    description: '**A future Roblox Windows version has been detected!**\n\nNew LIVE Channel preview build is available.',
    fields: [
      { name: 'Future Windows Version:', value: code(current.hash), inline: false },
      { name: 'Client Version:', value: code(current.build), inline: true },
      { name: 'Channel:', value: '`LIVE (Windows only)`', inline: true },
      { name: 'Date:', value: formatDate(current.date), inline: false },
    ],
    footer: { text: 'Source: WEAO Future Versions API | Unofficial tracker' },
    timestamp: new Date().toISOString(),
    ...(getImageURL(process.env.FUTURE_THUMBNAIL_URL || process.env.THUMBNAIL_URL)
      ? { thumbnail: { url: getImageURL(process.env.FUTURE_THUMBNAIL_URL || process.env.THUMBNAIL_URL) } }
      : {}),
  };
}

function makePotassiumEmbed(current, changelog, demo) {
  return {
    color: 0x57E35F,
    title: demo ? '[TEST] Potassium Executor Update' : 'An exploit update has been detected!',
    description: '**Potassium has been updated for Windows!**',
    fields: [
      { name: 'New Version:', value: code(current.version), inline: true },
      { name: 'Roblox Version:', value: code(current.robloxVersion), inline: true },
      { name: 'Date:', value: formatDate(current.updatedDate), inline: false },
      { name: 'Changelog:', value: String(changelog || 'Changelog tidak tersedia.').slice(0, 1024), inline: false },
    ],
    footer: { text: 'Source: WEAO Exploits API | Unofficial tracker' },
    timestamp: new Date().toISOString(),
    ...(getImageURL(process.env.POTASSIUM_THUMBNAIL_URL || process.env.THUMBNAIL_URL)
      ? { thumbnail: { url: getImageURL(process.env.POTASSIUM_THUMBNAIL_URL || process.env.THUMBNAIL_URL) } }
      : {}),
  };
}

function getImageURL(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function buildWebhookPayload(embed, type, demo = false) {
  const ids = roleIds(type);
  if (demo && ids.length === 0) {
    console.warn(`[TEST ${type}] Tidak ada ROLE ID valid di .env, tidak dapat melakukan mention.`);
  }
  const mentions = ids.map(id => `<@&${id}>`).join(' ');
  const payload = {
    username: process.env.WEBHOOK_NAME || 'Roblox Version & Potassium Monitor',
    // Mention harus ada di content dan ID yang sama ada dalam allowed_mentions.roles.
    // Test juga melakukan ping agar pengaturan role dapat dicek secara nyata.
    content: [demo ? '**TEST / DEMO** (bukan update live)' : '', mentions]
      .filter(Boolean).join('\n'),
    allowed_mentions: { parse: [], roles: ids },
    embeds: [embed],
  };
  const avatar = getImageURL(process.env.AVATAR_URL);
  if (avatar) payload.avatar_url = avatar;
  return payload;
}

async function sendWebhook(embed, type, demo = false) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook || !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+/.test(webhook)) {
    throw new Error('DISCORD_WEBHOOK_URL di .env belum valid');
  }
  const payload = buildWebhookPayload(embed, type, demo);
  const endpoint = webhook + (webhook.includes('?') ? '&' : '?') + 'wait=true';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 250);
    throw new Error(`Discord Webhook HTTP ${response.status}: ${detail}`);
  }
  // Karena wait=true, Discord mengembalikan pesan yang dibuat, termasuk mention_roles.
  const result = await response.json();
  const expected = payload.allowed_mentions.roles;
  if (expected.length > 0) {
    const actual = Array.isArray(result.mention_roles) ? result.mention_roles : [];
    const mentioned = actual.map(role => typeof role === 'string' ? role : role?.id);
    const missing = expected.filter(id => !mentioned.includes(id));
    if (missing.length) {
      console.warn(`[ROLE TIDAK TERPING] Discord menerima pesan, tetapi role ${missing.join(', ')} tidak muncul pada mention_roles. Periksa role berada di server yang sama, role Mentionable, dan izin channel/webhook.`);
    } else {
      console.log(`[ROLE TERDETEKSI] ${mentioned.join(', ')}`);
    }
  }
}

async function monitorFuture(state) {
  const current = parseFutureWindows(await getJSON(FUTURE_URL));
  const previous = state.futureWindows;
  if (!previous) {
    console.log(`[Baseline Future Windows] ${current.hash}`);
  } else if (hasFutureChange(previous, current)) {
    await sendWebhook(makeFutureEmbed(current, false), 'future');
    console.log(`[Sent Future Windows] ${previous.hash} -> ${current.hash}`);
  } else {
    console.log(`[Unchanged Future Windows] ${current.hash}`);
  }
  // Persist only after successful send (if a notification was due).
  state.futureWindows = current;
  writeState(state);
}

async function monitorPotassium(state) {
  const current = parsePotassium(await getJSON(EXPLOITS_URL));
  const previous = state.potassium;
  if (!previous) {
    console.log(`[Baseline Potassium] ${current.version} | updated=${current.updateStatus}`);
  } else if (hasPotassiumUpdate(previous, current)) {
    const changelog = await fetchPotassiumChangelog();
    await sendWebhook(makePotassiumEmbed(current, changelog, false), 'potassium');
    console.log(`[Sent Potassium] ${previous.version} -> ${current.version}`);
  } else {
    console.log(`[Unchanged/Not Updated Potassium] ${current.version} | updated=${current.updateStatus}`);
  }
  state.potassium = current;
  writeState(state);
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  const state = readState();
  try {
    // Independent handling: if one API fails, the other can still notify.
    try { await monitorFuture(state); }
    catch (error) { console.error(`[Future Windows ERROR] ${error.message}`); }

    try { await monitorPotassium(state); }
    catch (error) { console.error(`[Potassium ERROR] ${error.message}`); }

    console.log(`[Check done] ${new Date().toISOString()}`);
  } finally {
    running = false;
  }
}

async function test(mode) {
  if (mode !== 'potassium') {
    await sendWebhook(makeFutureEmbed({
      hash: 'version-EXAMPLE12345678',
      build: '0.999.0.1234567',
      date: '11/21/2026, 5:00:00 PM UTC',
    }, true), 'future', true);
    console.log('Future Windows demo terkirim (mention role diaktifkan).');
  }
  if (mode !== 'future') {
    await sendWebhook(makePotassiumEmbed({
      version: 'TEST-1.0.0',
      robloxVersion: 'version-EXAMPLE12345678',
      updatedDate: '11/21/2026 at 6:00 PM UTC',
      updateStatus: true,
    }, 'Changelog DEMO, bukan update resmi.', true), 'potassium', true);
    console.log('Potassium demo terkirim (mention role diaktifkan).');
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--test') || argv.includes('--test-future') || argv.includes('--test-potassium')) {
    const type = argv.includes('--test-future') ? 'future'
      : argv.includes('--test-potassium') ? 'potassium' : 'all';
    return test(type);
  }
  console.log(`Monitoring Future Windows + Potassium setiap ${POLL_MINUTES} menit`);
  tick().catch(error => console.error(`[Fatal Tick] ${error.message}`));
  if (!argv.includes('--once')) setInterval(() => {
    tick().catch(error => console.error(`[Fatal Tick] ${error.message}`));
  }, POLL_MS);
}

if (require.main === module) {
  Promise.resolve().then(main).catch(error => {
    console.error(`[FATAL] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseFutureWindows, parsePotassium, hasFutureChange, hasPotassiumUpdate, makeFutureEmbed, makePotassiumEmbed, buildWebhookPayload };
