import test from 'node:test';
import assert from 'node:assert/strict';
import { directionFromKey, directionFromPoint } from '../src/input.js';

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
