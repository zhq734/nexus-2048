/**
 * 输入解析工具。
 *
 * 负责把鼠标点击坐标、键盘按键转换为引擎可消费的方向指令，
 * 让「点击操作」与「键盘操作」共用同一套纯函数逻辑，便于单元测试。
 */

/** 点击中心死区比例：小于该比例的偏移不产生方向，避免误触。 */
const DEAD_ZONE_RATIO = 0.06;

const KEY_DIRECTIONS = {
  arrowup: 'up',
  arrowright: 'right',
  arrowdown: 'down',
  arrowleft: 'left',
  w: 'up',
  d: 'right',
  s: 'down',
  a: 'left',
};

/**
 * 根据点击位置相对棋盘中心的方向，解析出移动方向。
 *
 * 以棋盘中心为原点，比较横向与纵向偏移的绝对值，
 * 取偏移更大的轴作为主方向；中心死区内返回 null。
 * @param {{left:number, top:number, width:number, height:number}} rect 棋盘包围盒
 * @param {number} clientX 点击点相对视口的横坐标
 * @param {number} clientY 点击点相对视口的纵坐标
 * @returns {'up'|'right'|'down'|'left'|null} 解析出的方向，无有效方向时为 null
 */
export function directionFromPoint(rect, clientX, clientY) {
  if (!rect || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const deadZone = Math.min(rect.width, rect.height) * DEAD_ZONE_RATIO;
  if (Math.hypot(dx, dy) < deadZone) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * 把键盘按键解析为方向指令。
 * @param {string} key 键盘事件 key 值
 * @returns {'up'|'right'|'down'|'left'|null} 解析出的方向，非方向键时为 null
 */
export function directionFromKey(key) {
  if (typeof key !== 'string') return null;
  return KEY_DIRECTIONS[key.toLowerCase()] ?? null;
}
