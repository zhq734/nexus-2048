import { SoundEngine } from './audio.js';
import { dangerLevel, recommendMove } from './ai.js';
import {
  OBSTACLE,
  continueAfterWin,
  createGame,
  freeze,
  getDailySeed,
  hammer,
  move,
  shuffle,
  tick,
  undo,
} from './engine.js';
import { getMode, getModeList } from './modes.js';
import { directionFromKey, directionFromPoint, directionFromSwipe } from './input.js';
import {
  clearGame,
  getModeStats,
  getSettings,
  getStats,
  loadGame,
  resetAll,
  saveGame,
  saveSettings,
  updateStats,
} from './storage.js';

const els = {
  modeGrid: document.querySelector('#mode-grid'),
  modeNote: document.querySelector('#mode-note'),
  board: document.querySelector('#board'),
  boardWrap: document.querySelector('#board-wrap'),
  boardFrame: document.querySelector('.board-frame'),
  dpad: document.querySelector('#dpad'),
  boardModeName: document.querySelector('#board-mode-name'),
  overlay: document.querySelector('#board-overlay'),
  overlayBadge: document.querySelector('#overlay-badge'),
  overlayTitle: document.querySelector('#overlay-title'),
  overlayText: document.querySelector('#overlay-text'),
  overlayActions: document.querySelector('#overlay-actions'),
  statScore: document.querySelector('#stat-score'),
  statGain: document.querySelector('#stat-gain'),
  statTile: document.querySelector('#stat-tile'),
  statTarget: document.querySelector('#stat-target'),
  statTimeLabel: document.querySelector('#stat-time-label'),
  statMoves: document.querySelector('#stat-moves'),
  statCombo: document.querySelector('#stat-combo'),
  statBest: document.querySelector('#stat-best'),
  statGames: document.querySelector('#stat-games'),
  powerups: document.querySelector('#powerups'),
  riskBadge: document.querySelector('#risk-badge'),
  insightCopy: document.querySelector('#insight-copy'),
  radarDot: document.querySelector('.radar__dot'),
  metricEmpty: document.querySelector('#metric-empty'),
  metricEfficiency: document.querySelector('#metric-efficiency'),
  metricCombo: document.querySelector('#metric-combo'),
  scoreChart: document.querySelector('#score-chart'),
  historyDelta: document.querySelector('#history-delta'),
  careerGrid: document.querySelector('#career-grid'),
  statsTable: document.querySelector('#stats-table'),
  aiTip: document.querySelector('#ai-tip'),
  boardHint: document.querySelector('#board-hint'),
  settingsModal: document.querySelector('#settings-modal'),
  statsModal: document.querySelector('#stats-modal'),
  settingSound: document.querySelector('#setting-sound'),
  settingInput: document.querySelector('#setting-input'),
  settingVibration: document.querySelector('#setting-vibration'),
  settingAi: document.querySelector('#setting-ai'),
  settingAutosave: document.querySelector('#setting-autosave'),
  toastStack: document.querySelector('#toast-stack'),
  confetti: document.querySelector('#confetti'),
};

const MODE_ICONS = {
  classic: '◆',
  mini: '▣',
  zen: '◎',
  blitz: '⚡',
  chaos: '✦',
  daily: '☀',
};

const POWERUPS = {
  undo: { icon: '↶', label: '撤销上一步' },
  shuffle: { icon: '⇄', label: '打乱数字位置' },
  hammer: { icon: '⌁', label: '锤掉一个方块或石墙' },
  freeze: { icon: '❄', label: '冻结三次方块生成' },
};

const DIRECTION_LABELS = { up: '向上', right: '向右', down: '向下', left: '向左' };

let settings = getSettings();
let sound = new SoundEngine(settings.sound);
let game = null;
let selectedMode = settings.lastMode || 'classic';
let hammerArmed = false;
let terminalHandled = false;
let hintTimer = null;
let swipeStart = null;
let timerId = null;
let userHasInteracted = false;
let persistTimer = null;
let careerSignature = '';
let chartSignature = '';
let chartThemeCache = null;
let statsCache = { modeId: null, data: null };

/**
 * 读取并缓存当前主题的绘图配色。
 *
 * getComputedStyle 会强制同步样式计算，缓存后避免每次重绘都触发一次布局。
 * @returns {{accent:string, border:string}} 主题配色
 */
function chartTheme() {
  if (!chartThemeCache) {
    const styles = getComputedStyle(document.documentElement);
    chartThemeCache = {
      accent: styles.getPropertyValue('--accent').trim(),
      border: styles.getPropertyValue('--border-default').trim(),
    };
  }
  return chartThemeCache;
}

/**
 * 读取当前模式的统计数据，并在内存中缓存。
 *
 * 统计值只在开局与结算时变化，缓存后可避免每次移动都同步读取 localStorage。
 * @returns {object} 当前模式的统计数据
 */
function currentModeStats() {
  if (!statsCache.data || statsCache.modeId !== game.modeId) {
    statsCache = { modeId: game.modeId, data: getModeStats(game.modeId) };
  }
  return statsCache.data;
}

/** 使统计数据缓存失效，下一次渲染时重新读取。 */
function invalidateStatsCache() {
  statsCache = { modeId: null, data: null };
}

/**
 * 启动指定模式，并在可用时恢复存档。
 * @param {string} modeId 模式 id
 * @param {boolean} [restore] 是否尝试恢复存档
 */
function startMode(modeId, restore = true) {
  selectedMode = getMode(modeId).id;
  settings = saveSettings({ lastMode: selectedMode });
  careerSignature = '';
  chartSignature = '';
  invalidateStatsCache();
  const saved = restore ? loadGame(selectedMode) : null;
  const dailyValid = saved?.seed === `daily-${getDailySeed()}`;
  const canRestore = saved && saved.status === 'playing' && (selectedMode !== 'daily' || dailyValid);
  game = canRestore ? createGame(selectedMode, { restore: saved }) : createGame(selectedMode);
  hammerArmed = false;
  terminalHandled = false;
  renderModes();
  renderAll();
  if (canRestore) toast('已恢复上次进度');
  startTimer();
}

/** 启动或重启限时模式计时器。 */
function startTimer() {
  if (timerId) clearInterval(timerId);
  let ticksSinceSave = 0;
  timerId = setInterval(() => {
    if (!game || game.status !== 'playing' || game.paused || game.timeLeft == null) return;
    game = tick(game, 1);
    if (game.status === 'lost') handleTerminal();
    renderStats();
    // 限时模式每 5 秒落盘一次，避免每秒写 localStorage。
    ticksSinceSave += 1;
    if (ticksSinceSave >= 5 && settings.autoSave) {
      ticksSinceSave = 0;
      saveGame(game);
    }
  }, 1000);
}

/** 渲染模式选择卡片。 */
function renderModes() {
  els.modeGrid.innerHTML = '';
  getModeList().forEach((mode) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode-card';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(mode.id === selectedMode));
    button.style.setProperty('--mode-accent', mode.accent);
    button.dataset.mode = mode.id;
    button.innerHTML = `
      <span class="mode-card__icon">${MODE_ICONS[mode.id] || '◇'}</span>
      <strong>${mode.name}</strong>
      <p>${mode.description}</p>
      <small>${mode.timeLimit ? `${mode.timeLimit}s` : `目标 ${mode.target}`}</small>
    `;
    button.addEventListener('click', () => startMode(mode.id, true));
    els.modeGrid.append(button);
  });
  const mode = getMode(selectedMode);
  els.modeNote.textContent = `${mode.name} · 目标 ${mode.target}${mode.timeLimit ? ` · ${mode.timeLimit} 秒` : ''}`;
}

/**
 * 渲染棋盘。
 * @param {{ spawnIndex?: number|null, mergeValues?: number[], hint?: string|null }} [effects] 动画效果
 */
function renderBoard(effects = {}) {
  const mode = getMode(game.modeId);
  els.board.style.setProperty('--grid-size', game.size);
  // 用 DocumentFragment 批量组装后再一次性替换，避免逐格插入触发多次重排。
  const fragment = document.createDocumentFragment();
  const mergeValues = new Set(effects.mergeValues || []);
  const danger = dangerLevel(game);

  game.board.forEach((value, index) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.setAttribute('role', 'gridcell');
    tile.dataset.index = index;
    tile.setAttribute('aria-label', value === OBSTACLE ? '石墙' : value === 0 ? '空格' : String(value));

    if (value === OBSTACLE) {
      tile.classList.add('tile--obstacle');
      if (hammerArmed) {
        tile.classList.add('tile--hammerable');
        tile.addEventListener('click', (event) => { event.stopPropagation(); useHammer(index); });
      }
    } else if (value > 0) {
      tile.classList.add('tile--filled');
      tile.textContent = value;
      tile.style.setProperty('--tile-color', `var(--tile-${Math.min(value, 32768)})`);
      if (value > 9999) tile.classList.add('tile--tiny');
      else if (value > 999) tile.classList.add('tile--small');
      if (index === effects.spawnIndex) tile.classList.add('tile--spawn');
      if (mergeValues.has(value)) tile.classList.add('tile--merge');
      if (danger === 'critical' && value === game.maxTile) tile.classList.add('tile--danger');
      if (effects.hint === 'left' && index % game.size === 0) tile.classList.add('tile--hint');
      if (effects.hint === 'right' && index % game.size === game.size - 1) tile.classList.add('tile--hint');
      if (effects.hint === 'up' && index < game.size) tile.classList.add('tile--hint');
      if (effects.hint === 'down' && index >= game.board.length - game.size) tile.classList.add('tile--hint');
      if (hammerArmed) {
        tile.classList.add('tile--hammerable');
        tile.addEventListener('click', (event) => { event.stopPropagation(); useHammer(index); });
      }
    }
    fragment.append(tile);
  });

  els.board.replaceChildren(fragment);
  els.boardModeName.textContent = `${mode.name} · ${mode.timeLimit ? '限时' : `目标 ${game.target}`}`;
}

/**
 * 渲染全部界面。
 * @param {object} [effects] 棋盘动画效果
 */
function renderAll(effects = {}) {
  renderBoard(effects);
  renderStats();
  renderPowerups();
  renderInsight();
  renderChart();
  renderCareer();
  renderOverlay();
}

/** 渲染顶部统计卡。 */
function renderStats() {
  const modeStats = currentModeStats();
  els.statScore.textContent = game.score.toLocaleString('zh-CN');
  els.statGain.textContent = game.lastMerges.length > 0 ? `+${game.lastMerges.reduce((sum, item) => sum + item.to, 0)}` : '+0';
  els.statTile.textContent = game.maxTile || 2;
  els.statTarget.textContent = `目标 ${game.target}`;
  els.statMoves.textContent = game.timeLeft == null ? game.moves : `${Math.floor(game.timeLeft / 60)}:${String(game.timeLeft % 60).padStart(2, '0')}`;
  els.statTimeLabel.textContent = game.timeLeft == null ? '步数' : '剩余时间';
  els.statCombo.textContent = `连击 ${game.combo}${game.frozenMoves ? ` · 冻结 ${game.frozenMoves}` : ''}`;
  els.statBest.textContent = Math.max(modeStats.bestScore || 0, game.score).toLocaleString('zh-CN');
  els.statGames.textContent = `${modeStats.games || 0} 局 · 胜 ${modeStats.wins || 0}`;
}

/**
 * 渲染道具栏。
 *
 * 首次调用时创建按钮，之后只更新计数、禁用态与激活态，
 * 避免每步移动都重建 DOM 节点。
 */
function renderPowerups() {
  const keys = Object.keys(POWERUPS);
  if (els.powerups.childElementCount !== keys.length) {
    els.powerups.innerHTML = '';
    keys.forEach((key) => {
      const meta = POWERUPS[key];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'powerup';
      button.dataset.powerup = key;
      button.innerHTML = `<span class="powerup__icon">${meta.icon}</span><span class="powerup__count"></span>`;
      button.addEventListener('click', () => activatePowerup(key));
      els.powerups.append(button);
    });
  }
  keys.forEach((key) => {
    const meta = POWERUPS[key];
    const button = els.powerups.querySelector(`[data-powerup="${key}"]`);
    const count = game.powerups[key];
    button.title = `${meta.label}（${count}）`;
    button.setAttribute('aria-label', `${meta.label}，剩余 ${count}`);
    button.disabled = count <= 0 || game.status !== 'playing';
    button.classList.toggle('is-armed', key === 'hammer' && hammerArmed);
    button.querySelector('.powerup__count').textContent = count;
  });
}

/** 渲染局势雷达。 */
function renderInsight() {
  const empty = game.board.filter((value) => value === 0).length;
  const total = game.board.length;
  const emptyRate = empty / total;
  const level = dangerLevel(game);
  const labels = { safe: '安全', warning: '注意', critical: '危险' };
  els.riskBadge.textContent = labels[level];
  els.riskBadge.dataset.level = level;
  els.metricEmpty.textContent = `${Math.round(emptyRate * 100)}%`;
  els.metricEfficiency.textContent = game.moves > 0 ? (game.score / game.moves).toFixed(1) : '0.0';
  els.metricCombo.textContent = game.bestCombo;

  const dotAngle = (1 - emptyRate) * Math.PI * 1.7 - Math.PI * 0.35;
  els.radarDot.style.left = `${50 + Math.cos(dotAngle) * 32}%`;
  els.radarDot.style.top = `${50 + Math.sin(dotAngle) * 32}%`;
  els.radarDot.style.background = level === 'critical' ? 'var(--danger)' : level === 'warning' ? 'var(--warning)' : 'var(--accent)';
  els.insightCopy.textContent = level === 'critical'
    ? '可用空间告急，优先合并小数字打开缺口。'
    : level === 'warning'
      ? '空间正在收紧，避免把最大方块推离角落。'
      : '局势平稳，继续扩大棋盘空间并维持单调排列。';
}

/** 绘制本局分数曲线。 */
function renderChart() {
  const canvas = els.scoreChart;
  const context = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(220, Math.round(rect.width));
  const height = Math.max(120, Math.round(rect.height));
  // 先取尺寸再比对签名，避免额外的 clientWidth/clientHeight 强制同步布局。
  const signature = `${game.modeId}:${game.scoreHistory.length}:${game.score}:${width}x${height}`;
  if (signature === chartSignature) return;
  chartSignature = signature;
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const values = game.scoreHistory.length > 1 ? game.scoreHistory : [0, game.score];
  const max = Math.max(...values, 10);
  const padding = 12;
  const { accent, border } = chartTheme();

  context.strokeStyle = border;
  context.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = padding + ((height - padding * 2) / 3) * i;
    context.beginPath();
    context.moveTo(padding, y);
    context.lineTo(width - padding, y);
    context.stroke();
  }

  const points = values.map((value, index) => ({
    x: padding + ((width - padding * 2) * index) / Math.max(1, values.length - 1),
    y: height - padding - ((height - padding * 2) * value) / max,
  }));

  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `${accent}66`);
  gradient.addColorStop(1, `${accent}00`);
  context.beginPath();
  context.moveTo(points[0].x, height - padding);
  points.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(points[points.length - 1].x, height - padding);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
  context.strokeStyle = accent;
  context.lineWidth = 2.5;
  context.lineJoin = 'round';
  context.stroke();

  const last = points[points.length - 1];
  context.beginPath();
  context.arc(last.x, last.y, 4, 0, Math.PI * 2);
  context.fillStyle = accent;
  context.fill();

  const previous = values.length > 1 ? values[values.length - 2] : 0;
  els.historyDelta.textContent = `+${Math.max(0, game.score - previous)}`;
}

/** 渲染当前模式的生涯摘要。 */
function renderCareer() {
  const stats = currentModeStats();
  const signature = `${game.modeId}:${stats.bestScore}:${stats.bestTile}:${stats.wins}:${stats.games}`;
  if (signature === careerSignature) return;
  careerSignature = signature;
  const items = [
    ['最佳分数', (stats.bestScore || 0).toLocaleString('zh-CN')],
    ['最大方块', stats.bestTile || 0],
    ['胜利局数', stats.wins || 0],
    ['完成局数', stats.games || 0],
  ];
  els.careerGrid.innerHTML = items.map(([label, value]) => `<div class="career-item"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

/** 渲染结算与暂停遮罩。 */
function renderOverlay() {
  let config = null;
  if (game.paused && game.status === 'playing') {
    config = { badge: 'PAUSED', title: '游戏已暂停', text: '深呼吸一下，回来继续布局。', actions: [['resume', '继续游戏']] };
  } else if (game.status === 'won') {
    config = { badge: '目标达成', title: `${game.target} 达成！`, text: '你打开了新的数字维度。继续挑战，或开启一局新游戏。', actions: [['continue', '继续挑战'], ['new', '新游戏']] };
  } else if (game.status === 'lost') {
    const reason = game.timeLeft === 0 ? '时间耗尽' : '没有可移动的空间';
    config = { badge: 'GAME OVER', title: reason, text: `本局得分 ${game.score.toLocaleString('zh-CN')}，最大方块 ${game.maxTile}。`, actions: [['new', '再来一局'], ['stats', '查看统计']] };
  }

  if (!config) {
    els.overlay.hidden = true;
    return;
  }
  els.overlay.hidden = false;
  els.overlayBadge.textContent = config.badge;
  els.overlayTitle.textContent = config.title;
  els.overlayText.textContent = config.text;
  els.overlayActions.innerHTML = '';
  config.actions.forEach(([action, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action === 'continue' || action === 'resume' ? 'primary-button' : 'text-button';
    button.dataset.overlayAction = action;
    button.textContent = label;
    els.overlayActions.append(button);
  });
}

/**
 * 处理一次移动。
 * @param {string} direction 移动方向
 */
function performMove(direction) {
  if (!game || game.status !== 'playing' || game.paused) return;
  const result = move(game, direction);
  if (!result.moved) {
    vibrate(8);
    return;
  }
  game = result.state;
  if (result.gained > 0) sound.merge(result.gained);
  else sound.move(game.moves);
  vibrate(result.gained > 0 ? 18 : 8);
  // 进行中的统计与存档改为延迟写入，避免每步移动都同步读写 localStorage。
  schedulePersist();
  if (game.status === 'won' || game.status === 'lost') handleTerminal();
  renderAll({ spawnIndex: result.spawn?.index ?? null, mergeValues: result.state.lastMerges.map((item) => item.to) });
}

/**
 * 延迟持久化当前对局。
 *
 * 合并短时间内的多次移动，只做一次 JSON 序列化与 localStorage 写入，
 * 显著降低连续操作时的主线程开销。
 */
function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!game || game.status !== 'playing') return;
    // 统计与存档合并到同一批，连续移动时只写一次 localStorage。
    updateStats(game, false);
    invalidateStatsCache();
    if (settings.autoSave) saveGame(game);
  }, 350);
}

/** 处理胜利或失败结算。 */
function handleTerminal() {
  if (terminalHandled) return;
  terminalHandled = true;
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  updateStats(game, true);
  invalidateStatsCache();
  if (game.status === 'won') {
    sound.win();
    burstConfetti();
    toast('🎉 目标达成，新的维度已解锁！');
  } else {
    sound.lose();
    toast('本局结束，数据已记录');
  }
  renderStats();
  renderCareer();
}

/**
 * 激活道具。
 * @param {string} key 道具键
 */
function activatePowerup(key) {
  if (!game || game.status !== 'playing') return;
  if (key === 'hammer') {
    if (game.powerups.hammer <= 0) return;
    hammerArmed = !hammerArmed;
    renderBoard();
    renderPowerups();
    toast(hammerArmed ? '请选择要锤掉的方块或石墙' : '已取消锤子');
    return;
  }

  let result;
  if (key === 'undo') result = undo(game);
  if (key === 'shuffle') result = shuffle(game);
  if (key === 'freeze') result = freeze(game);
  const successKey = { undo: 'undone', shuffle: 'shuffled', freeze: 'activated' }[key];
  if (!result || !result[successKey]) {
    toast('该道具暂时不可用');
    return;
  }
  game = result.state;
  sound.powerup();
  vibrate(24);
  hammerArmed = false;
  schedulePersist();
  renderAll();
  toast(`${POWERUPS[key].label} 已生效`);
}

/**
 * 使用锤子移除指定格子。
 * @param {number} index 格子索引
 */
function useHammer(index) {
  if (!hammerArmed) return;
  const result = hammer(game, index);
  if (!result.removed) return;
  game = result.state;
  hammerArmed = false;
  sound.powerup();
  vibrate(24);
  schedulePersist();
  renderAll();
  toast('已清除目标格子');
}

/** 请求并显示 AI 提示。 */
function showHint() {
  if (!game || game.status !== 'playing' || game.paused) return;
  const result = recommendMove(game, { depth: 1 });
  if (!result.direction) {
    toast('当前没有可执行的移动');
    return;
  }
  const direction = DIRECTION_LABELS[result.direction];
  els.aiTip.hidden = false;
  els.aiTip.textContent = `AI 建议：${direction}移动 · 局势评分 ${Math.round(result.score)}`;
  renderBoard({ hint: result.direction });
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    els.aiTip.hidden = true;
    renderBoard();
  }, 4200);
  sound.powerup();
}

/** 暂停或继续游戏。 */
function togglePause() {
  if (game.status !== 'playing') return;
  game = { ...game, paused: !game.paused };
  renderOverlay();
  toast(game.paused ? '游戏已暂停' : '继续游戏');
}

/** 开启一局新游戏。 */
function newGame() {
  clearGame(selectedMode);
  game = createGame(selectedMode);
  terminalHandled = false;
  hammerArmed = false;
  chartSignature = '';
  careerSignature = '';
  invalidateStatsCache();
  els.aiTip.hidden = true;
  renderAll();
  toast(`已开始 ${getMode(selectedMode).name}`);
}

/** 胜利后继续提高目标。 */
function continueGame() {
  game = continueAfterWin(game);
  renderAll();
  toast(`新目标：${game.target}`);
}

/**
 * 弹出轻提示。
 * @param {string} message 消息
 */
function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  els.toastStack.append(node);
  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 260);
  }, 2200);
}

/** 触发一次短震动。 */
function vibrate(pattern) {
  if (!settings.vibration || !navigator.vibrate) return;
  // Chrome 要求当前页面帧内发生过真实用户手势，否则调用会触发控制台策略错误。
  if (!userHasInteracted) return;
  try { navigator.vibrate(pattern); } catch { /* 忽略不支持震动的环境。 */ }
}

/** 播放胜利彩带。 */
function burstConfetti() {
  els.confetti.innerHTML = '';
  const colors = ['var(--accent)', 'var(--accent-two)', 'var(--accent-three)', 'var(--success)', 'var(--warning)'];
  for (let i = 0; i < 70; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.6}s`;
    piece.style.animationDuration = `${2 + Math.random() * 1.4}s`;
    piece.style.setProperty('--drift', `${-100 + Math.random() * 200}px`);
    els.confetti.append(piece);
  }
  setTimeout(() => { els.confetti.innerHTML = ''; }, 4200);
}

/** 打开生涯统计弹窗。 */
function openStats() {
  const stats = getStats();
  els.statsTable.innerHTML = '';
  getModeList().forEach((mode) => {
    const item = stats[mode.id] || {};
    const row = document.createElement('div');
    row.className = 'stats-row-item';
    row.innerHTML = `<strong>${mode.name}</strong><span>最佳 ${(item.bestScore || 0).toLocaleString('zh-CN')}</span><span>方块 ${item.bestTile || 0}</span><span>胜 ${item.wins || 0}</span><span>局 ${item.games || 0}</span>`;
    els.statsTable.append(row);
  });
  els.statsModal.showModal();
}

/** 同步设置表单。 */
function syncSettingsForm() {
  els.settingSound.checked = settings.sound;
  if (els.settingInput) els.settingInput.value = settings.inputMode === 'swipe' ? 'swipe' : 'click';
  els.settingVibration.checked = settings.vibration;
  els.settingAi.checked = settings.aiHints;
  els.settingAutosave.checked = settings.autoSave;
  document.querySelector('[data-icon="sound"]').textContent = settings.sound ? '♪' : '×';
}

/** 根据当前操作方式刷新棋盘操作提示。 */
function updateInputHint() {
  if (!els.boardHint) return;
  const swipe = settings.inputMode === 'swipe';
  document.documentElement.dataset.input = swipe ? 'swipe' : 'click';
  els.boardHint.innerHTML = swipe
    ? '<span aria-hidden="true">🖐</span> 在棋盘上拖动鼠标或手指滑动，也可使用下方方向键'
    : '<span aria-hidden="true">🖱</span> 点击棋盘任意一侧，或用下方方向键移动';
}

/** 循环切换主题。 */
function toggleTheme() {
  const themes = ['aurora', 'sunrise', 'nebula'];
  const current = document.documentElement.dataset.theme || 'aurora';
  const next = themes[(themes.indexOf(current) + 1) % themes.length];
  document.documentElement.dataset.theme = next;
  settings = saveSettings({ theme: next });
  // 主题变量会改变曲线配色，这里强制失效缓存后重绘。
  chartSignature = '';
  chartThemeCache = null;
  renderChart();
  toast(`主题：${next === 'aurora' ? '极光' : next === 'sunrise' ? '日出' : '星云'}`);
}

/** 应用主题设置。 */
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme || 'aurora';
}

/** 绑定全局交互。 */
function bindEvents() {
  ['pointerdown', 'keydown', 'touchstart'].forEach((type) => {
    window.addEventListener(type, () => { userHasInteracted = true; }, { once: true, capture: true });
  });

  document.addEventListener('click', (event) => {
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    if (action === 'new-game') newGame();
    if (action === 'pause') togglePause();
    if (action === 'ai-hint') showHint();
    if (action === 'toggle-theme') toggleTheme();
    if (action === 'open-settings') els.settingsModal.showModal();
    if (action === 'open-stats') openStats();
    if (action === 'reset-data') {
      resetAll();
      settings = getSettings();
      sound.setEnabled(settings.sound);
      syncSettingsForm();
      startMode('classic', false);
      toast('本地数据已清空');
    }
    if (action === 'toggle-sound') {
      settings = saveSettings({ sound: !settings.sound });
      sound.setEnabled(settings.sound);
      syncSettingsForm();
      toast(settings.sound ? '音效已开启' : '音效已关闭');
    }
  });

  document.addEventListener('click', (event) => {
    const overlayAction = event.target.closest('[data-overlay-action]')?.dataset.overlayAction;
    if (!overlayAction) return;
    if (overlayAction === 'resume') togglePause();
    if (overlayAction === 'continue') continueGame();
    if (overlayAction === 'new') newGame();
    if (overlayAction === 'stats') openStats();
  });

  els.settingSound.addEventListener('change', () => {
    settings = saveSettings({ sound: els.settingSound.checked });
    sound.setEnabled(settings.sound);
    syncSettingsForm();
  });
  els.settingVibration.addEventListener('change', () => { settings = saveSettings({ vibration: els.settingVibration.checked }); });
  els.settingAi.addEventListener('change', () => { settings = saveSettings({ aiHints: els.settingAi.checked }); });
  els.settingAutosave.addEventListener('change', () => { settings = saveSettings({ autoSave: els.settingAutosave.checked }); });
  els.settingInput?.addEventListener('change', () => {
    settings = saveSettings({ inputMode: els.settingInput.value === 'swipe' ? 'swipe' : 'click' });
    updateInputHint();
    toast(settings.inputMode === 'swipe' ? '已切换为滑动操作' : '已切换为点击操作');
  });

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;
    const direction = directionFromKey(event.key);
    if (direction) {
      event.preventDefault();
      performMove(direction);
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      togglePause();
    }
    if (event.key === 'n' || event.key === 'N') newGame();
    if (event.key === 'u' || event.key === 'U') activatePowerup('undo');
    if (event.key === 'h' || event.key === 'H') showHint();
  });

  // 点击棋盘：以点击点相对棋盘中心的方向作为移动方向。
  els.boardFrame.addEventListener('click', (event) => {
    if (settings.inputMode === 'swipe') return;
    if (hammerArmed) return;
    if (event.target.closest('.board-overlay')) return;
    const direction = directionFromPoint(els.board.getBoundingClientRect(), event.clientX, event.clientY);
    if (direction) performMove(direction);
  });

  // 点击方向键：与键盘共用同一套方向指令。
  els.dpad?.addEventListener('click', (event) => {
    const key = event.target.closest('[data-direction]');
    if (!key) return;
    performMove(key.dataset.direction);
  });

  // 滑动操作：鼠标拖动与触屏滑动共用同一套方向解析。
  els.boardFrame.addEventListener('pointerdown', (event) => {
    if (settings.inputMode !== 'swipe') return;
    if (hammerArmed) return;
    swipeStart = { x: event.clientX, y: event.clientY, time: Date.now() };
    els.boardFrame.setPointerCapture?.(event.pointerId);
  });
  els.boardFrame.addEventListener('pointerup', (event) => {
    if (!swipeStart) return;
    const start = swipeStart;
    swipeStart = null;
    const direction = directionFromSwipe(start, { x: event.clientX, y: event.clientY }, 22);
    if (!direction) return;
    performMove(direction);
  });
  els.boardFrame.addEventListener('pointercancel', () => { swipeStart = null; });

  window.addEventListener('resize', renderChart);
  document.addEventListener('visibilitychange', () => {
    // 页面不可见时暂停持续动画并立即落盘，避免后台空转占用 CPU。
    document.documentElement.dataset.motion = document.visibilityState === 'hidden' ? 'paused' : '';
    if (document.visibilityState === 'hidden' && settings.autoSave && game) {
      if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
      updateStats(game, false);
      invalidateStatsCache();
      saveGame(game);
    }
  });
}

/** 注册离线缓存。 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

/** 初始化应用。 */
function init() {
  applyTheme();
  syncSettingsForm();
  updateInputHint();
  bindEvents();
  startMode(selectedMode, true);
  registerServiceWorker();
}

init();
