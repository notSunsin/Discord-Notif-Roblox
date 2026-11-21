const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFutureWindows, parsePotassium, hasFutureChange, hasPotassiumUpdate, makeFutureEmbed } = require('../index');

test('future parser reads Windows only, ignoring Mac entirely', () => {
  const a = parseFutureWindows({
    Windows: 'version-abc123', WindowsDate: '11/21/2026, 2:00 PM UTC',
    WindowsResponse: { version: '0.1.2' },
    Mac: 'version-mac999', MacDate: '11/22/2026', MacResponse: {version:'8.8.8'},
  });
  assert.deepEqual(a, { hash: 'version-abc123', date: '11/21/2026, 2:00 PM UTC', build: '0.1.2', bootstrapper: null });
  assert.equal(hasFutureChange({ hash: 'version-abc123' }, a), false);
  assert.equal(hasFutureChange({ hash: 'version-old999' }, a), true);
  assert.equal(hasFutureChange(null, a), false);
  const embed = makeFutureEmbed(a, true);
  assert.ok(JSON.stringify(embed).includes('Windows'));
  assert.ok(!JSON.stringify(embed).includes('Mac'));
});

test('future parser rejects empty Windows data', () => {
  assert.throws(() => parseFutureWindows({ Mac: 'version-any123' }), /Windows/);
});

test('Potassium parser isolates Windows executor from other entries', () => {
  const a = parsePotassium([
    { title: 'Madium', platform: 'Windows', version: '88' },
    { title: 'Potassium', platform: 'Mac', version: 'NOPE' },
    { title: 'Potassium', platform: 'Windows', version: '2.7.0', rbxversion: 'version-a1b2', updatedDate: '11/19/2026 at 12:10 AM UTC', updateStatus: true },
  ]);
  assert.equal(a.version, '2.7.0');
  assert.equal(a.platform, 'Windows');
  assert.equal(a.updateStatus, true);
});

test('Potassium notifies on meaningful update only', () => {
  const old = { version: '2.6', robloxVersion: 'version-old', updateStatus: true, updatedDate: 'yesterday' };
  assert.equal(hasPotassiumUpdate(null, old), false);
  assert.equal(hasPotassiumUpdate(old, { ...old, updatedDate: 'today' }), false);
  assert.equal(hasPotassiumUpdate(old, { ...old, version: '2.7', updateStatus: false }), false);
  assert.equal(hasPotassiumUpdate(old, { ...old, version: '2.7' }), true);
  assert.equal(hasPotassiumUpdate(old, { ...old, robloxVersion: 'version-new' }), true);
  assert.equal(hasPotassiumUpdate({ ...old, updateStatus: false }, old), true);
});


test('TEST webhook now mentions role, including allowed_mentions', () => {
  const { buildWebhookPayload } = require('../index');
  process.env.ROLE_FUTURE_WINDOWS_ID = '1573713591826386976';
  process.env.ROLE_UPDATE_ID = '1573713591826386976';
  process.env.ROLE_POTASSIUM_ID = '1573713591826386976';
  const embed = makeFutureEmbed({ hash: 'version-demo', date: null, build: null }, true);
  const future = buildWebhookPayload(embed, 'future', true);
  assert.ok(future.content.includes('**TEST / DEMO**'));
  assert.ok(future.content.includes('<@&1573713591826386976>'));
  assert.deepEqual(future.allowed_mentions, { parse: [], roles: ['1573713591826386976'] });
  const potassium = buildWebhookPayload(embed, 'potassium', true);
  assert.equal((potassium.content.match(/<@&1573713591826386976>/g) || []).length, 1);
  assert.deepEqual(potassium.allowed_mentions.roles, ['1573713591826386976']);
});
