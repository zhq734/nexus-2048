import { getMode } from './modes.js';

export const OBSTACLE = -1;
export const DIRECTIONS = Object.freeze(['up', 'right', 'down', 'left']);

const DEFAULT_POWERUPS = Object.freeze({ undo: 3, shuffle: 1, hammer: 1, freeze: 1 });

/**
 * 创建可序列化的伪随机数状态。
 * @param {number|string} seed 随机种子
 * @returns {number} 32 位随机状态
 */
export function createRngState(seed) {
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 0x9e3779b9;
}

/**
 * 从随机状态中取出一个 [0, 1) 的随机数，并推进状态。
 * @param {number} state 随机状态
 * @returns {{ value: number, state: number }} 随机值与新状态
 */
export function nextRandom(state) {
  let next = (state + 0x6d2b79f5) | 0;
  let value = next;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  const result = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  return { value: result, state: next >>> 0 };
}

/**
 * 获取当天的 UTC 日期字符串，用于每日挑战种子。
 * @param {Date} [date] 日期对象
 * @returns {string} YYYY-MM-DD 格式日期
 */
export function getDailySeed(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * 根据模式创建一局新游戏。
 * @param {string} modeId 模式 id
 * @param {{ seed?: number|string, now?: Date, restore?: object }} [options] 创建选项
 * @returns {object} 游戏状态
 */
export function createGame(modeId = 'classic', options = {}) {
  const mode = getMode(modeId);
  const seed = options.seed ?? (mode.daily ? `daily-${getDailySeed(options.now)}` : `${Date.now()}-${Math.random()}`);
  const state = {
    version: 1,
    modeId: mode.id,
    size: mode.size,
    target: mode.target,
    board: Array(mode.size * mode.size).fill(0),
    score: 0,
    moves: 0,
    status: 'playing',
    won: false,
    seed,
    rngState: createRngState(seed),
    history: [],
    powerups: mode.allowPowerups ? { ...DEFAULT_POWERUPS } : { undo: 0, shuffle: 0, hammer: 0, freeze: 0 },
    frozenMoves: 0,
    combo: 0,
    bestCombo: 0,
    maxTile: 0,
    merges: 0,
    spawned: 0,
    scoreHistory: [0],
    lastMerges: [],
    lastMove: null,
    startedAt: Date.now(),
    elapsedSeconds: 0,
    timeLeft: mode.timeLimit,
    earnedPowerupAt: 0,
    obstacleCount: 0,
    paused: false,
  };

  if (options.restore) {
    return normalizeRestoredState(options.restore, mode);
  }

  let working = state;
  working = addRandomTile(working).state;
  working = addRandomTile(working).state;
  return working;
}

/**
 * 修正旧存档或外部导入状态，确保尺寸与模式一致。
 * @param {object} saved 存档状态
 * @param {object} mode 模式配置
 * @returns {object} 可安全使用的状态
 */
function normalizeRestoredState(saved, mode) {
  const size = mode.size;
  const board = Array.isArray(saved.board) ? saved.board.slice(0, size * size) : [];
  while (board.length < size * size) board.push(0);
  return {
    ...saved,
    modeId: mode.id,
    size,
    target: mode.target,
    board: board.map((value) => Number.isFinite(value) ? value : 0),
    history: Array.isArray(saved.history) ? saved.history.slice(-20) : [],
    powerups: { ...DEFAULT_POWERUPS, ...(saved.powerups || {}) },
    scoreHistory: Array.isArray(saved.scoreHistory) ? saved.scoreHistory.slice(-80) : [saved.score || 0],
    lastMerges: Array.isArray(saved.lastMerges) ? saved.lastMerges : [],
    timeLeft: mode.timeLimit == null ? null : Math.max(0, saved.timeLeft ?? mode.timeLimit),
    paused: false,
  };
}

/**
 * 克隆一个游戏状态，避免 UI 与历史记录共享引用。
 * @param {object} state 游戏状态
 * @returns {object} 克隆状态
 */
export function cloneState(state) {
  return {
    ...state,
    board: state.board.slice(),
    powerups: { ...state.powerups },
    scoreHistory: state.scoreHistory.slice(),
    lastMerges: state.lastMerges.map((item) => ({ ...item })),
  };
}

/**
 * 计算棋盘上的空格索引。
 * @param {number[]} board 棋盘
 * @returns {number[]} 空格索引列表
 */
export function emptyCells(board) {
  const result = [];
  board.forEach((value, index) => {
    if (value === 0) result.push(index);
  });
  return result;
}

/**
 * 在随机空格中生成一个新方块。
 * @param {object} state 当前状态
 * @param {number} [forcedValue] 强制生成值，仅用于测试
 * @returns {{ state: object, spawned: boolean, index: number|null, value: number|null }} 生成结果
 */
export function addRandomTile(state, forcedValue = null) {
  const cells = emptyCells(state.board);
  if (cells.length === 0) return { state, spawned: false, index: null, value: null };

  const randomIndex = nextRandom(state.rngState);
  const randomValue = nextRandom(randomIndex.state);
  const cell = cells[Math.floor(randomIndex.value * cells.length) % cells.length];
  const mode = getMode(state.modeId);
  const value = forcedValue ?? (randomValue.value < mode.fourChance ? 4 : 2);
  const next = cloneState(state);
  next.board[cell] = value;
  next.rngState = randomValue.state;
  next.spawned += 1;
  next.maxTile = Math.max(next.maxTile || 0, value);
  return { state: next, spawned: true, index: cell, value };
}

/**
 * 获取棋盘某一行或列，方向统一为“移动方向的前方在数组末尾”。
 * @param {number[]} board 棋盘
 * @param {number} size 边长
 * @param {number} index 行/列索引
 * @param {'row'|'column'} kind 类型
 * @returns {number[]} 提取的线段
 */
function getLine(board, size, index, kind) {
  const line = [];
  for (let i = 0; i < size; i += 1) {
    line.push(kind === 'row' ? board[index * size + i] : board[i * size + index]);
  }
  return line;
}

/**
 * 将线段写回棋盘。
 * @param {number[]} board 棋盘
 * @param {number} size 边长
 * @param {number} index 行/列索引
 * @param {'row'|'column'} kind 类型
 * @param {number[]} line 线段
 */
function setLine(board, size, index, kind, line) {
  for (let i = 0; i < size; i += 1) {
    if (kind === 'row') board[index * size + i] = line[i];
    else board[i * size + index] = line[i];
  }
}

/**
 * 将一个线段向指定方向压缩并合并，石墙会阻断滑动。
 * @param {number[]} line 原始线段
 * @param {boolean} towardEnd 是否向数组末尾移动
 * @returns {{ line: number[], gained: number, merges: object[] }} 压缩结果
 */
function collapseLine(line, towardEnd) {
  const merges = [];
  let gained = 0;
  const result = line.slice();
  const obstacles = [];
  line.forEach((value, index) => {
    if (value === OBSTACLE) obstacles.push(index);
  });
  const boundaries = [-1, ...obstacles, line.length];

  for (let boundary = 0; boundary < boundaries.length - 1; boundary += 1) {
    const start = boundaries[boundary] + 1;
    const end = boundaries[boundary + 1] - 1;
    if (start > end) continue;
    const values = [];
    for (let index = start; index <= end; index += 1) {
      if (line[index] > 0) values.push(line[index]);
    }

    const merged = [];
    if (towardEnd) {
      for (let index = values.length - 1; index >= 0; index -= 1) {
        if (index > 0 && values[index] === values[index - 1]) {
          const mergedValue = values[index] * 2;
          merged.unshift(mergedValue);
          gained += mergedValue;
          merges.push({ from: values[index], to: mergedValue, count: 2 });
          index -= 1;
        } else {
          merged.unshift(values[index]);
        }
      }
    } else {
      for (let index = 0; index < values.length; index += 1) {
        if (index < values.length - 1 && values[index] === values[index + 1]) {
          const mergedValue = values[index] * 2;
          merged.push(mergedValue);
          gained += mergedValue;
          merges.push({ from: values[index], to: mergedValue, count: 2 });
          index += 1;
        } else {
          merged.push(values[index]);
        }
      }
    }

    for (let index = start; index <= end; index += 1) result[index] = 0;
    const offset = towardEnd ? end - merged.length + 1 : start;
    merged.forEach((value, index) => {
      result[offset + index] = value;
    });
  }
  return { line: result, gained, merges };
}

/**
 * 计算一次移动，不生成新方块，也不修改原状态。
 * @param {object} state 当前状态
 * @param {'up'|'right'|'down'|'left'} direction 移动方向
 * @returns {{ state: object, moved: boolean, gained: number, merges: object[] }} 移动结果
 */
export function slide(state, direction) {
  const next = cloneState(state);
  const board = next.board.slice();
  const merges = [];
  let gained = 0;
  let moved = false;

  const isVertical = direction === 'up' || direction === 'down';
  const towardEnd = direction === 'right' || direction === 'down';

  for (let index = 0; index < state.size; index += 1) {
    const original = getLine(board, state.size, index, isVertical ? 'column' : 'row');
    const collapsed = collapseLine(original, towardEnd);
    if (collapsed.line.some((value, i) => value !== original[i])) moved = true;
    gained += collapsed.gained;
    merges.push(...collapsed.merges);
    setLine(board, state.size, index, isVertical ? 'column' : 'row', collapsed.line);
  }

  next.board = board;
  return { state: next, moved, gained, merges };
}

/**
 * 执行一次完整移动：滑动、计分、生成方块、判定胜负。
 * @param {object} state 当前状态
 * @param {'up'|'right'|'down'|'left'} direction 移动方向
 * @returns {{ state: object, moved: boolean, gained: number, spawn: object|null }} 移动结果
 */
export function move(state, direction) {
  if (state.status !== 'playing' || state.paused) return { state, moved: false, gained: 0, spawn: null };
  if (!DIRECTIONS.includes(direction)) return { state, moved: false, gained: 0, spawn: null };

  const snapshot = cloneState(state);
  const slideResult = slide(state, direction);
  if (!slideResult.moved) return { state, moved: false, gained: 0, spawn: null };

  let next = slideResult.state;
  next.history = [...state.history.slice(-19), snapshot];
  next.score += slideResult.gained;
  next.moves += 1;
  next.lastMove = direction;
  next.lastMerges = slideResult.merges;
  next.merges += slideResult.merges.length;
  next.maxTile = Math.max(...next.board, next.maxTile || 0);
  next.combo = slideResult.merges.length > 0 ? next.combo + 1 : 0;
  next.bestCombo = Math.max(next.bestCombo, next.combo);
  next.scoreHistory = [...next.scoreHistory, next.score].slice(-80);

  if (slideResult.gained > 0) {
    next.earnedPowerupAt += slideResult.gained;
    if (next.earnedPowerupAt >= 1200) {
      next.earnedPowerupAt -= 1200;
      const reward = ['undo', 'shuffle', 'hammer', 'freeze'][next.moves % 4];
      next.powerups[reward] += 1;
    }
  }

  let spawn = null;
  if (next.frozenMoves > 0) {
    next.frozenMoves -= 1;
  } else {
    const spawned = addRandomTile(next);
    next = spawned.state;
    spawn = spawned.spawned ? { index: spawned.index, value: spawned.value } : null;
  }

  const mode = getMode(next.modeId);
  if (mode.obstacleEvery > 0 && next.moves % mode.obstacleEvery === 0) {
    next = addObstacle(next).state;
  }

  if (next.maxTile >= next.target && !next.won) {
    next.won = true;
    next.status = 'won';
  } else if (!canMove(next)) {
    next.status = 'lost';
  }

  return { state: next, moved: true, gained: slideResult.gained, spawn };
}

/**
 * 在随机空格放置一堵不可合并的石墙。
 * @param {object} state 当前状态
 * @returns {{ state: object, index: number|null }} 新状态与石墙位置
 */
export function addObstacle(state) {
  const cells = emptyCells(state.board);
  if (cells.length === 0) return { state, index: null };
  const random = nextRandom(state.rngState);
  const index = cells[Math.floor(random.value * cells.length) % cells.length];
  const next = cloneState(state);
  next.board[index] = OBSTACLE;
  next.rngState = random.state;
  next.obstacleCount += 1;
  return { state: next, index };
}

/**
 * 判断棋盘是否还存在合法移动。
 * @param {object} state 当前状态
 * @returns {boolean} 是否可以继续移动
 */
export function canMove(state) {
  if (emptyCells(state.board).length > 0) return true;
  for (const direction of DIRECTIONS) {
    if (slide(state, direction).moved) return true;
  }
  return false;
}

/**
 * 撤销上一步。
 * @param {object} state 当前状态
 * @returns {{ state: object, undone: boolean }} 撤销结果
 */
export function undo(state) {
  if (state.powerups.undo <= 0 || state.history.length === 0) return { state, undone: false };
  const previous = cloneState(state.history[state.history.length - 1]);
  const next = cloneState(previous);
  next.history = state.history.slice(0, -1).map((item) => cloneState(item));
  next.powerups = { ...state.powerups, undo: state.powerups.undo - 1 };
  next.moves = state.moves - 1;
  next.status = 'playing';
  next.paused = false;
  return { state: next, undone: true };
}

/**
 * 打乱棋盘上所有数字方块的位置。
 * @param {object} state 当前状态
 * @returns {{ state: object, shuffled: boolean }} 打乱结果
 */
export function shuffle(state) {
  if (state.powerups.shuffle <= 0) return { state, shuffled: false };
  const values = state.board.filter((value) => value > 0);
  if (values.length < 2) return { state, shuffled: false };

  const next = cloneState(state);
  next.powerups.shuffle -= 1;
  for (let i = values.length - 1; i > 0; i -= 1) {
    const random = nextRandom(next.rngState);
    next.rngState = random.state;
    const j = Math.floor(random.value * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  const positions = next.board.map((value, index) => value === OBSTACLE ? index : -1).filter((index) => index >= 0);
  const target = next.board.slice();
  let valueIndex = 0;
  for (let i = 0; i < target.length; i += 1) {
    if (positions.includes(i)) continue;
    target[i] = values[valueIndex] ?? 0;
    valueIndex += 1;
  }
  next.board = target;
  next.history = [...state.history.slice(-19).map((item) => cloneState(item)), cloneState(state)];
  next.status = canMove(next) ? 'playing' : 'lost';
  return { state: next, shuffled: true };
}

/**
 * 使用锤子移除指定位置的方块或石墙。
 * @param {object} state 当前状态
 * @param {number} index 目标索引
 * @returns {{ state: object, removed: boolean }} 移除结果
 */
export function hammer(state, index) {
  if (state.powerups.hammer <= 0) return { state, removed: false };
  if (!Number.isInteger(index) || index < 0 || index >= state.board.length) return { state, removed: false };
  if (state.board[index] === 0) return { state, removed: false };

  const next = cloneState(state);
  next.history = [...state.history.slice(-19).map((item) => cloneState(item)), cloneState(state)];
  if (next.board[index] === OBSTACLE) next.obstacleCount = Math.max(0, next.obstacleCount - 1);
  next.board[index] = 0;
  next.powerups.hammer -= 1;
  next.status = canMove(next) ? 'playing' : 'lost';
  return { state: next, removed: true };
}

/**
 * 冻结接下来的若干次方块生成。
 * @param {object} state 当前状态
 * @returns {{ state: object, activated: boolean }} 激活结果
 */
export function freeze(state) {
  if (state.powerups.freeze <= 0) return { state, activated: false };
  const next = cloneState(state);
  next.powerups.freeze -= 1;
  next.frozenMoves += 3;
  return { state: next, activated: true };
}

/**
 * 从胜利状态继续挑战更高目标。
 * @param {object} state 当前状态
 * @returns {object} 继续后的状态
 */
export function continueAfterWin(state) {
  if (state.status !== 'won') return state;
  const next = cloneState(state);
  next.status = 'playing';
  next.target *= 2;
  return next;
}

/**
 * 推进限时模式计时器。
 * @param {object} state 当前状态
 * @param {number} seconds 推进秒数
 * @returns {object} 新状态
 */
export function tick(state, seconds = 1) {
  if (state.status !== 'playing' || state.paused || state.timeLeft == null) return state;
  const next = cloneState(state);
  next.elapsedSeconds += seconds;
  next.timeLeft = Math.max(0, next.timeLeft - seconds);
  if (next.timeLeft <= 0) next.status = 'lost';
  return next;
}

/**
 * 对状态进行浅层评分，供 AI 与排行榜使用。
 * @param {object} state 游戏状态
 * @returns {number} 评估分
 */
export function evaluateState(state) {
  const size = state.size;
  const board = state.board;
  let empty = 0;
  let smoothness = 0;
  let monotonicity = 0;
  let maxTile = 0;
  let cornerBonus = 0;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const index = row * size + col;
      const value = board[index];
      if (value === 0) {
        empty += 1;
        continue;
      }
      if (value === OBSTACLE) continue;
      maxTile = Math.max(maxTile, value);
      if (col + 1 < size) {
        const right = board[index + 1];
        if (right > 0) smoothness -= Math.abs(Math.log2(value) - Math.log2(right));
      }
      if (row + 1 < size) {
        const down = board[index + size];
        if (down > 0) smoothness -= Math.abs(Math.log2(value) - Math.log2(down));
      }
      if (col + 1 < size) {
        const right = board[index + 1];
        if (right > 0) monotonicity += value > right ? 1 : -1;
      }
      if (row + 1 < size) {
        const down = board[index + size];
        if (down > 0) monotonicity += value > down ? 1 : -1;
      }
    }
  }

  const corners = [0, size - 1, size * (size - 1), size * size - 1];
  if (corners.includes(board.indexOf(maxTile))) cornerBonus += Math.log2(maxTile || 1) * 8;

  return empty * 24 + smoothness * 2 + monotonicity * 1.5 + cornerBonus + Math.log2(maxTile || 1) * 4;
}
