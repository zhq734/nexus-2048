import test from 'node:test';
import assert from 'node:assert/strict';
import { clearGame, getModeStats, loadGame, resetAll, saveGame, saveSettings, getSettings, updateStats } from '../src/storage.js';

/** 提供最小 localStorage 实现，供 Node 测试使用。 */
function installStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  return store;
}

test('saveGame 与 loadGame 可以往返状态', () => {
  installStorage();
  const state = { modeId: 'classic', board: [2], score: 4 };
  assert.equal(saveGame(state), true);
  const loaded = loadGame('classic');
  assert.equal(loaded.score, 4);
  assert.deepEqual(loaded.board, [2]);
  assert.ok(loaded.savedAt);
});

test('clearGame 会移除存档', () => {
  installStorage();
  saveGame({ modeId: 'classic', board: [], score: 0 });
  clearGame('classic');
  assert.equal(loadGame('classic'), null);
});

test('updateStats 会累计最佳分数与游戏局数', () => {
  installStorage();
  const state = { modeId: 'classic', score: 100, maxTile: 64, bestCombo: 3, moves: 10, status: 'lost', elapsedSeconds: 20 };
  const stats = updateStats(state, true);
  assert.equal(stats.bestScore, 100);
  assert.equal(stats.bestTile, 64);
  assert.equal(stats.games, 1);
  assert.equal(getModeStats('classic').games, 1);
});

test('updateStats 记录胜利次数和最快用时', () => {
  installStorage();
  const state = { modeId: 'blitz', score: 2048, maxTile: 2048, bestCombo: 5, moves: 100, status: 'won', elapsedSeconds: 90 };
  const stats = updateStats(state, true);
  assert.equal(stats.wins, 1);
  assert.equal(stats.fastestWinSeconds, 90);
});

test('settings 可以增量保存', () => {
  installStorage();
  const settings = saveSettings({ sound: false });
  assert.equal(settings.sound, false);
  assert.equal(getSettings().sound, false);
});

test('resetAll 清空存档、统计和设置', () => {
  installStorage();
  saveGame({ modeId: 'classic', board: [], score: 0 });
  saveSettings({ sound: false });
  resetAll();
  assert.equal(loadGame('classic'), null);
  assert.equal(getModeStats('classic').games, 0);
});
