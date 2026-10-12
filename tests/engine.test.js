import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OBSTACLE,
  addObstacle,
  addRandomTile,
  canMove,
  cloneState,
  continueAfterWin,
  createGame,
  createRngState,
  emptyCells,
  evaluateState,
  freeze,
  getDailySeed,
  hammer,
  move,
  nextRandom,
  shuffle,
  slide,
  tick,
  undo,
} from '../src/engine.js';

/**
 * 创建一个棋盘状态，供测试直接注入。
 * @param {number[]} board 棋盘
 * @param {object} [patch] 额外字段
 * @returns {object} 状态对象
 */
function stateFrom(board, patch = {}) {
  const size = Math.sqrt(board.length);
  return {
    modeId: 'classic', size, target: 2048, board, score: 0, moves: 0, status: 'playing', won: false,
    seed: 1, rngState: createRngState(1), history: [], powerups: { undo: 3, shuffle: 1, hammer: 1, freeze: 1 },
    frozenMoves: 0, combo: 0, bestCombo: 0, maxTile: Math.max(0, ...board), merges: 0, spawned: 0,
    scoreHistory: [0], lastMerges: [], lastMove: null, startedAt: 0, elapsedSeconds: 0, timeLeft: null,
    earnedPowerupAt: 0, obstacleCount: board.filter((value) => value === OBSTACLE).length, paused: false,
    ...patch,
  };
}

test('createGame 会生成指定尺寸的棋盘与两个初始方块', () => {
  const game = createGame('classic', { seed: 'test' });
  assert.equal(game.size, 4);
  assert.equal(game.board.length, 16);
  assert.equal(game.board.filter((value) => value > 0).length, 2);
  assert.equal(game.status, 'playing');
});

test('每日挑战使用同一日期作为确定性种子', () => {
  const a = createGame('daily', { now: new Date('2026-10-12T00:00:00Z') });
  const b = createGame('daily', { now: new Date('2026-10-12T23:59:59Z') });
  assert.equal(a.seed, 'daily-2026-10-12');
  assert.deepEqual(a.board, b.board);
  assert.equal(getDailySeed(new Date('2026-10-12T12:00:00Z')), '2026-10-12');
});

test('伪随机数在同一种子下可复现', () => {
  const first = nextRandom(createRngState('seed'));
  const second = nextRandom(createRngState('seed'));
  assert.equal(first.value, second.value);
  assert.equal(first.state, second.state);
});

test('slide 向左合并相同数字且每个方块只合并一次', () => {
  const state = stateFrom([2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const result = slide(state, 'left');
  assert.deepEqual(result.line ? result.line : result.state.board.slice(0, 4), [4, 4, 0, 0]);
  assert.equal(result.gained, 8);
});

test('slide 向右合并并正确对齐', () => {
  const state = stateFrom([2, 2, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const result = slide(state, 'right');
  assert.deepEqual(result.state.board.slice(0, 4), [0, 0, 4, 8]);
});

test('slide 向上和向下处理列', () => {
  const state = stateFrom([2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0]);
  assert.deepEqual(slide(state, 'up').state.board.filter((_, i) => i % 4 === 0), [4, 8, 0, 0]);
  assert.deepEqual(slide(state, 'down').state.board.filter((_, i) => i % 4 === 0), [0, 0, 4, 8]);
});

test('slide 不会越过石墙合并', () => {
  const state = stateFrom([2, 0, OBSTACLE, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const result = slide(state, 'right');
  assert.deepEqual(result.state.board.slice(0, 4), [0, 2, OBSTACLE, 2]);
  assert.equal(result.gained, 0);
});

test('move 在合法移动后计分、生成方块并记录历史', () => {
  const state = stateFrom([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { rngState: createRngState('move') });
  const result = move(state, 'left');
  assert.equal(result.moved, true);
  assert.equal(result.gained, 4);
  assert.equal(result.state.score, 4);
  assert.equal(result.state.moves, 1);
  assert.equal(result.state.history.length, 1);
  assert.equal(result.state.board.filter((value) => value > 0).length, 2);
});

test('move 在无变化时返回原状态', () => {
  const state = stateFrom([2, 4, 8, 16, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 128]);
  const result = move(state, 'left');
  assert.equal(result.moved, false);
  assert.equal(result.state, state);
});

test('合成目标数字后进入胜利状态', () => {
  const state = stateFrom([1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { target: 2048 });
  const result = move(state, 'left');
  assert.equal(result.state.status, 'won');
  assert.equal(result.state.maxTile, 2048);
});

test('continueAfterWin 会提高目标并继续游戏', () => {
  const state = stateFrom([2048, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { status: 'won', target: 2048 });
  const result = continueAfterWin(state);
  assert.equal(result.status, 'playing');
  assert.equal(result.target, 4096);
});

test('canMove 能识别仍有空格的棋盘', () => {
  assert.equal(canMove(stateFrom([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), true);
});

test('canMove 在满盘且无相邻相同时返回 false', () => {
  const board = [2, 4, 8, 16, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 128];
  assert.equal(canMove(stateFrom(board)), false);
});

test('addRandomTile 在指定空位生成方块', () => {
  const state = stateFrom(Array(16).fill(0));
  const result = addRandomTile(state, 4);
  assert.equal(result.spawned, true);
  assert.equal(result.value, 4);
  assert.equal(result.state.board[result.index], 4);
});

test('emptyCells 返回全部空格索引', () => {
  const state = stateFrom([2, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(emptyCells(state.board), [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
});

test('addObstacle 会在空格放置石墙', () => {
  const state = stateFrom(Array(16).fill(0));
  const result = addObstacle(state);
  assert.notEqual(result.index, null);
  assert.equal(result.state.board[result.index], OBSTACLE);
  assert.equal(result.state.obstacleCount, 1);
});

test('undo 恢复上一步并消耗道具', () => {
  const state = stateFrom([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const moved = move(state, 'left').state;
  const result = undo(moved);
  assert.equal(result.undone, true);
  assert.deepEqual(result.state.board, state.board);
  assert.equal(result.state.powerups.undo, 2);
});

test('undo 在没有历史或道具时失败', () => {
  const state = stateFrom(Array(16).fill(0), { powerups: { undo: 0, shuffle: 0, hammer: 0, freeze: 0 } });
  assert.equal(undo(state).undone, false);
});

test('shuffle 会保留方块数量并消耗道具', () => {
  const state = stateFrom([2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 0, 0, 0, 0, 0, 0]);
  const before = [...state.board].sort((a, b) => a - b);
  const result = shuffle(state);
  assert.equal(result.shuffled, true);
  assert.deepEqual([...result.state.board].sort((a, b) => a - b), before);
  assert.equal(result.state.powerups.shuffle, 0);
});

test('hammer 可以移除方块或石墙', () => {
  const state = stateFrom([2, OBSTACLE, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const result = hammer(state, 1);
  assert.equal(result.removed, true);
  assert.equal(result.state.board[1], 0);
  assert.equal(result.state.obstacleCount, 0);
});

test('freeze 会让后续三次移动不生成方块', () => {
  const state = stateFrom([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const frozen = freeze(state).state;
  const moved = move(frozen, 'left').state;
  assert.equal(moved.frozenMoves, 2);
  assert.equal(moved.board.filter((value) => value > 0).length, 1);
});

test('tick 只影响限时模式', () => {
  const classic = stateFrom(Array(16).fill(0));
  assert.equal(tick(classic), classic);
  const timed = stateFrom(Array(16).fill(0), { timeLeft: 10 });
  const result = tick(timed, 3);
  assert.equal(result.timeLeft, 7);
  assert.equal(result.elapsedSeconds, 3);
});

test('tick 到零时判定失败', () => {
  const timed = stateFrom(Array(16).fill(0), { timeLeft: 2 });
  assert.equal(tick(timed, 5).status, 'lost');
});

test('evaluateState 偏好更多空格', () => {
  const open = stateFrom([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const crowded = stateFrom([2, 4, 8, 16, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 0]);
  assert.ok(evaluateState(open) > evaluateState(crowded));
});

test('cloneState 不共享棋盘与道具引用', () => {
  const state = stateFrom([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const clone = cloneState(state);
  clone.board[0] = 4;
  clone.powerups.undo = 0;
  assert.equal(state.board[0], 2);
  assert.equal(state.powerups.undo, 3);
});
