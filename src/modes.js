/**
 * 游戏模式配置。
 * 每个模式都通过声明式配置驱动引擎，避免在玩法逻辑中散落条件分支。
 */
export const MODES = Object.freeze({
  classic: {
    id: 'classic',
    name: '经典 4×4',
    shortName: '经典',
    description: '原汁原味的 2048，用最少步数合成 2048。',
    size: 4,
    target: 2048,
    timeLimit: null,
    fourChance: 0.1,
    obstacleEvery: 0,
    allowPowerups: true,
    accent: '#6ee7ff',
  },
  mini: {
    id: 'mini',
    name: '迷你 3×3',
    shortName: '迷你',
    description: '空间更小、节奏更快，目标 512。',
    size: 3,
    target: 512,
    timeLimit: null,
    fourChance: 0.08,
    obstacleEvery: 0,
    allowPowerups: true,
    accent: '#a78bfa',
  },
  zen: {
    id: 'zen',
    name: '禅意 5×5',
    shortName: '禅意',
    description: '宽阔棋盘与从容节奏，适合长线运营。',
    size: 5,
    target: 4096,
    timeLimit: null,
    fourChance: 0.12,
    obstacleEvery: 0,
    allowPowerups: true,
    accent: '#34d399',
  },
  blitz: {
    id: 'blitz',
    name: '闪电战',
    shortName: '闪电',
    description: '120 秒限时挑战，时间就是分数。',
    size: 4,
    target: 2048,
    timeLimit: 120,
    fourChance: 0.15,
    obstacleEvery: 0,
    allowPowerups: true,
    accent: '#fb923c',
  },
  chaos: {
    id: 'chaos',
    name: '混沌入侵',
    shortName: '混沌',
    description: '每 5 步出现一堵石墙，路线规划变得至关重要。',
    size: 4,
    target: 2048,
    timeLimit: null,
    fourChance: 0.18,
    obstacleEvery: 5,
    allowPowerups: true,
    accent: '#f472b6',
  },
  daily: {
    id: 'daily',
    name: '每日挑战',
    shortName: '每日',
    description: '全球同一天同一副牌，挑战你的每日最佳。',
    size: 4,
    target: 2048,
    timeLimit: null,
    fourChance: 0.1,
    obstacleEvery: 0,
    allowPowerups: false,
    daily: true,
    accent: '#facc15',
  },
});

/**
 * 根据模式 id 获取配置，未知 id 回退到经典模式。
 * @param {string} id 模式 id
 * @returns {object} 模式配置
 */
export function getMode(id) {
  return MODES[id] || MODES.classic;
}

/**
 * 获取所有模式的数组快照。
 * @returns {object[]} 模式配置列表
 */
export function getModeList() {
  return Object.values(MODES);
}
