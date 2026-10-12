const SAVE_PREFIX = 'nexus2048:save:';
const STATS_KEY = 'nexus2048:stats';
const SETTINGS_KEY = 'nexus2048:settings';

/**
 * 获取安全的本地存储对象，SSR 或隐私模式下返回内存实现。
 * @returns {Storage} 存储对象
 */
function getStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // 隐私模式访问 localStorage 可能抛错，回退到内存实现。
  }
  const memory = new Map();
  return {
    getItem: (key) => memory.has(key) ? memory.get(key) : null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
}

/**
 * 读取 JSON 值，解析失败时返回默认值。
 * @param {string} key 存储键
 * @param {*} fallback 默认值
 * @returns {*} 解析结果
 */
function readJson(key, fallback) {
  try {
    const value = getStorage().getItem(key);
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * 写入 JSON 值，失败时静默忽略。
 * @param {string} key 存储键
 * @param {*} value 待写入值
 * @returns {boolean} 是否写入成功
 */
function writeJson(key, value) {
  try {
    getStorage().setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * 保存一局游戏。
 * @param {object} state 游戏状态
 * @returns {boolean} 是否保存成功
 */
export function saveGame(state) {
  return writeJson(`${SAVE_PREFIX}${state.modeId}`, { ...state, savedAt: Date.now() });
}

/**
 * 读取指定模式的最新存档。
 * @param {string} modeId 模式 id
 * @returns {object|null} 存档或 null
 */
export function loadGame(modeId) {
  return readJson(`${SAVE_PREFIX}${modeId}`, null);
}

/**
 * 清除指定模式的存档。
 * @param {string} modeId 模式 id
 * @returns {boolean} 是否清除成功
 */
export function clearGame(modeId) {
  try {
    getStorage().removeItem(`${SAVE_PREFIX}${modeId}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取所有模式的统计数据。
 * @returns {object} 统计数据
 */
export function getStats() {
  return readJson(STATS_KEY, {});
}

/**
 * 获取指定模式统计，缺省时创建空记录。
 * @param {string} modeId 模式 id
 * @returns {object} 模式统计
 */
export function getModeStats(modeId) {
  const stats = getStats();
  return stats[modeId] || { bestScore: 0, bestTile: 0, games: 0, wins: 0, totalMoves: 0, bestCombo: 0, fastestWinSeconds: null, history: [] };
}

/**
 * 更新一局结束或进行中的统计。
 * @param {object} state 游戏状态
 * @param {boolean} [finished] 是否为最终结算
 * @returns {object} 更新后的模式统计
 */
export function updateStats(state, finished = false) {
  const stats = getStats();
  const previous = stats[state.modeId] || { bestScore: 0, bestTile: 0, games: 0, wins: 0, totalMoves: 0, bestCombo: 0, fastestWinSeconds: null, history: [] };
  const current = {
    ...previous,
    bestScore: Math.max(previous.bestScore, state.score),
    bestTile: Math.max(previous.bestTile, state.maxTile),
    bestCombo: Math.max(previous.bestCombo || 0, state.bestCombo || 0),
    totalMoves: (previous.totalMoves || 0) + (finished ? state.moves : Math.max(0, state.moves - (previous.totalMoves || 0))),
    history: finished ? [...(previous.history || []), { score: state.score, tile: state.maxTile, moves: state.moves, won: state.status === 'won', at: Date.now() }].slice(-20) : previous.history,
  };
  if (finished) {
    current.games = (previous.games || 0) + (state.status === 'lost' || state.status === 'won' ? 1 : 0);
    if (state.status === 'won') {
      current.wins = (previous.wins || 0) + 1;
      current.fastestWinSeconds = previous.fastestWinSeconds == null ? state.elapsedSeconds : Math.min(previous.fastestWinSeconds, state.elapsedSeconds);
    }
  }
  stats[state.modeId] = current;
  writeJson(STATS_KEY, stats);
  return current;
}

/**
 * 读取用户设置。
 * @returns {object} 设置
 */
export function getSettings() {
  return readJson(SETTINGS_KEY, { sound: true, vibration: true, theme: 'aurora', aiHints: true, autoSave: true });
}

/**
 * 合并并保存用户设置。
 * @param {object} patch 设置补丁
 * @returns {object} 完整设置
 */
export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeJson(SETTINGS_KEY, next);
  return next;
}

/**
 * 清空所有本地数据。
 * @returns {boolean} 是否清空成功
 */
export function resetAll() {
  try {
    const storage = getStorage();
    ['classic', 'mini', 'zen', 'blitz', 'chaos', 'daily'].forEach((mode) => storage.removeItem(`${SAVE_PREFIX}${mode}`));
    storage.removeItem(STATS_KEY);
    storage.removeItem(SETTINGS_KEY);
    return true;
  } catch {
    return false;
  }
}
