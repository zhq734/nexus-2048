/**
 * 基于 Web Audio API 的轻量音效合成器，无需外部音频文件。
 */
export class SoundEngine {
  /** @param {boolean} [enabled] 是否默认开启 */
  constructor(enabled = true) {
    this.enabled = enabled;
    this.context = null;
  }

  /**
   * 更新音效开关。
   * @param {boolean} enabled 是否开启
   */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  /**
   * 惰性创建音频上下文，遵守浏览器自动播放策略。
   * @returns {AudioContext|null} 音频上下文
   */
  getContext() {
    if (!this.enabled) return null;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!this.context) this.context = new AudioContextClass();
      if (this.context.state === 'suspended') this.context.resume();
      return this.context;
    } catch {
      return null;
    }
  }

  /**
   * 播放一个合成音符。
   * @param {number} frequency 频率
   * @param {number} duration 时长秒数
   * @param {OscillatorType} type 波形
   * @param {number} gain 音量
   */
  tone(frequency, duration = 0.08, type = 'sine', gain = 0.05) {
    const context = this.getContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gainNode.gain.setValueAtTime(gain, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  /**
   * 播放方块移动音效。
   * @param {number} intensity 强度
   */
  move(intensity = 1) {
    this.tone(180 + Math.min(intensity, 12) * 24, 0.06, 'triangle', 0.035);
  }

  /** 播放合并音效。 */
  merge(value = 4) {
    this.tone(240 + Math.log2(value) * 55, 0.12, 'sine', 0.055);
  }

  /** 播放胜利和弦。 */
  win() {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      setTimeout(() => this.tone(frequency, 0.28, 'sine', 0.06), index * 90);
    });
  }

  /** 播放失败音效。 */
  lose() {
    [330, 262, 196].forEach((frequency, index) => {
      setTimeout(() => this.tone(frequency, 0.22, 'sawtooth', 0.035), index * 110);
    });
  }

  /** 播放道具激活音效。 */
  powerup() {
    this.tone(880, 0.12, 'square', 0.03);
    setTimeout(() => this.tone(1320, 0.1, 'sine', 0.025), 70);
  }
}
