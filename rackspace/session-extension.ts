import { extendSession } from './router/webmail.js';

export class RackspaceSessionExtension {
  extend: any;
  setTimer: any;
  clearTimer: any;
  running: boolean;
  timer: any;
  interval: any;
  constructor({ extend = extendSession, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.extend = extend;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.running = false;
    this.timer = null;
    this.interval = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.run();
  }

  stop() {
    this.running = false;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    this.interval = null;
  }

  async run() {
    try {
      const result = await this.extend();
      if (!this.running) return;
      this.interval = result.interval;
      this.timer = this.setTimer(() => void this.run(), result.interval * 1000);
      (this.timer as any)?.unref?.();
    } catch (error: any) {
      this.stop();
      console.warn(`Rackspace session extension stopped: ${error.code || 'RACKSPACE_SESSION_EXTENSION_FAILED'}`);
    }
  }

  status() {
    return { active: this.running, interval: this.interval };
  }
}
