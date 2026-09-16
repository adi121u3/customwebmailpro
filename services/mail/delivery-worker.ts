import { getLocalMailStore } from './local-store.js';
import { MailDeliveryService } from './delivery-adapters.js';

export class DeliveryWorker {
  store: any;
  delivery: any;
  intervalMs: number;
  running: boolean;
  timer: any;
  constructor({ store = getLocalMailStore(), delivery = new MailDeliveryService(), intervalMs = 500 } = {}) {
    this.store = store;
    this.delivery = delivery;
    this.intervalMs = intervalMs;
    this.running = false;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch((error: any) => console.error('Delivery worker error:', error.message)), this.intervalMs);
    this.timer.unref();
    void this.tick().catch((error: any) => console.error('Delivery worker startup error:', error.message));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      let job;
      while ((job = this.store.claimJob())) {
        try {
          const result = await this.delivery.deliver(job.message);
          this.store.completeJob(job, result);
        } catch (error) {
          this.store.failJob(job, error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
