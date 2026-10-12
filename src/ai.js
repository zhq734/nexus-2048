import { DIRECTIONS, OBSTACLE, emptyCells, evaluateState, move } from './engine.js';

/**
 * 使用期望最大算法评估当前局面，返回最推荐的移动方向。
 * @param {object} state 当前游戏状态
 * @param {{ depth?: number }} [options] 搜索深度
 * @returns {{ direction: string|null, score: number, evaluations: object[] }} AI 建议
 */
export function recommendMove(state, options = {}) {
  const depth = options.depth ?? 2;
  const evaluations = [];
  let bestDirection = null;
  let bestScore = -Infinity;

  for (const direction of DIRECTIONS) {
    const result = move(state, direction);
    if (!result.moved) continue;
    const score = scoreMove(result, direction, state, depth);
    evaluations.push({ direction, score });
    if (score > bestScore) {
      bestScore = score;
      bestDirection = direction;
    }
  }

  evaluations.sort((a, b) => b.score - a.score);
  return { direction: bestDirection, score: Number.isFinite(bestScore) ? bestScore : 0, evaluations };
}

/**
 * 对一步移动进行启发式评分，兼顾合并收益、空间、单调性与连锁潜力。
 * @param {object} result move 的返回结果
 * @param {string} direction 移动方向
 * @param {object} before 移动前状态
 * @param {number} depth 搜索深度
 * @returns {number} 评分
 */
export function scoreMove(result, direction, before, depth = 2) {
  const after = result.state;
  const merges = after.lastMerges || [];
  let score = evaluateState(after);
  score += result.gained * 3;
  score += merges.length * 28;
  score += after.combo * 18;

  const cornerPreference = { left: 0, right: 1, up: 2, down: 3 };
  const cornerIndex = [0, before.size - 1, before.size * (before.size - 1), before.size * before.size - 1];
  const maxTile = Math.max(...after.board.filter((value) => value > 0 && value !== OBSTACLE), 0);
  if (cornerIndex.includes(after.board.indexOf(maxTile))) score += 40;
  if (direction === 'left' && cornerPreference[direction] === 0) score += 2;

  if (depth > 1) {
    let followUp = -Infinity;
    for (const nextDirection of DIRECTIONS) {
      const next = move(after, nextDirection);
      if (!next.moved) continue;
      const nextScore = evaluateState(next.state) + next.gained * 2 + (next.state.lastMerges || []).length * 20;
      followUp = Math.max(followUp, nextScore);
    }
    if (Number.isFinite(followUp)) score += followUp * 0.35;
  }
  return score;
}

/**
 * 判断当前局面是否危险，用于 AI 提示文案。
 * @param {object} state 游戏状态
 * @returns {'safe'|'warning'|'critical'} 危险等级
 */
export function dangerLevel(state) {
  const empties = emptyCells(state.board).length;
  if (empties <= 2) return 'critical';
  if (empties <= Math.max(3, Math.floor(state.size * state.size * 0.25))) return 'warning';
  return 'safe';
}
