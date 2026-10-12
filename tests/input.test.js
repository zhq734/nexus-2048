import test from 'node:test';
import assert from 'node:assert/strict';
import { directionFromKey, directionFromPoint, directionFromSwipe } from '../src/input.js';

const rect = { left: 0, top: 0, width: 400, height: 400 };

test('directionFromPoint 根据点击位置解析方向', () => {
  assert.equal(directionFromPoint(rect, 390, 200), 'right');
  assert.equal(directionFromPoint(rect, 10, 200), 'left');
  assert.equal(directionFromPoint(rect, 200, 390), 'down');
  assert.equal(directionFromPoint(rect, 200, 10), 'up');
  assert.equal(directionFromPoint(rect, 380, 40), 'right');
  assert.equal(directionFromPoint(rect, 40, 380), 'down');
});

test('directionFromPoint 在中心死区返回 null', () => {
  assert.equal(directionFromPoint(rect, 200, 200), null);
  assert.equal(directionFromPoint(rect, 204, 197), null);
});

test('directionFromKey 支持方向键与 WASD', () => {
  assert.equal(directionFromKey('ArrowUp'), 'up');
  assert.equal(directionFromKey('ArrowRight'), 'right');
  assert.equal(directionFromKey('ArrowDown'), 'down');
  assert.equal(directionFromKey('ArrowLeft'), 'left');
  assert.equal(directionFromKey('w'), 'up');
  assert.equal(directionFromKey('A'), 'left');
  assert.equal(directionFromKey('s'), 'down');
  assert.equal(directionFromKey('D'), 'right');
  assert.equal(directionFromKey('x'), null);
});

test('directionFromSwipe 根据拖动位移解析方向', () => {
  assert.equal(directionFromSwipe({ x: 100, y: 100 }, { x: 170, y: 108 }, 24), 'right');
  assert.equal(directionFromSwipe({ x: 100, y: 100 }, { x: 30, y: 108 }, 24), 'left');
  assert.equal(directionFromSwipe({ x: 100, y: 100 }, { x: 108, y: 170 }, 24), 'down');
  assert.equal(directionFromSwipe({ x: 100, y: 100 }, { x: 108, y: 30 }, 24), 'up');
});

test('directionFromSwipe 在位移不足或参数缺失时返回 null', () => {
  assert.equal(directionFromSwipe({ x: 100, y: 100 }, { x: 110, y: 108 }, 24), null);
  assert.equal(directionFromSwipe(null, { x: 1, y: 1 }, 24), null);
  assert.equal(directionFromSwipe({ x: 0, y: 0 }, null, 24), null);
});
