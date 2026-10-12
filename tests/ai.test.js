import test from 'node:test';
import assert from 'node:assert/strict';
import { dangerLevel, recommendMove } from '../src/ai.js';
import { createRngState } from '../src/engine.js';

/**
 * 构造 AI 测试状态。
 * @param {number[]} board 棋盘
 * @param {object} [patch] 额外字段
 * @returns {object} 状态
 */
function stateFrom(board, patch = {}) {
  return {
    modeId: 'classic', size: 4, target: 2048, board, score: 0, moves: 0, status: 'playing', won: false,
    seed: 1, rngState: createRngState(1), history: [], powerups: { undo: 0, shuffle: 0, hammer: 0, freeze: 0 },
    frozenMoves: 0, combo: 0, bestCombo: 0, maxTile: 0, merges: 0, spawned: 0, scoreHistory: [0],
    lastMerges: [], lastMove: null, startedAt: 0, elapsedSeconds: 0, timeLeft: null, earnedPowerupAt: 0,
    obstacleCount: 0, paused: false, ...patch,
  };
}

test('recommendMove 会优先给出可以合并的方向', () => {
  const state = stateFrom([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const result = recommendMove(state, { depth: 1 });
  assert.ok(['left', 'right'].includes(result.direction));
  assert.ok(result.evaluations.length > 0);
});

test('recommendMove 在无合法移动时返回 null', () => {
  const board = [2, 4, 8, 16, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 128];
  assert.equal(recommendMove(stateFrom(board)).direction, null);
});

test('dangerLevel 根据空格数量给出预警等级', () => {
  const safe = stateFrom([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const critical = stateFrom([2, 4, 8, 16, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 0]);
  assert.equal(dangerLevel(safe), 'safe');
  assert.equal(dangerLevel(critical), 'critical');
});
