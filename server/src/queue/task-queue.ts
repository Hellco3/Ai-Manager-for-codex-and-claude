type JobHandler<T> = (job: T) => Promise<void>;

interface QueueJob<T> {
  id: string;
  data: T;
  handler: JobHandler<T>;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error?: string;
}

/**
 * Simple in-memory task queue.
 * Interface is designed to be swappable with BullMQ later.
 */
export class TaskQueue<T = any> {
  private jobs: QueueJob<T>[] = [];
  private concurrency: number;
  private running = 0;
  private processing = false;

  constructor(concurrency = 3) {
    this.concurrency = concurrency;
  }

  async enqueue(id: string, data: T, handler: JobHandler<T>): Promise<void> {
    this.jobs.push({ id, data, handler, status: 'queued' });
    this.processLoop();
  }

  private async processLoop(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.running < this.concurrency && this.jobs.some(j => j.status === 'queued')) {
      const job = this.jobs.find(j => j.status === 'queued');
      if (!job) break;

      job.status = 'running';
      this.running++;

      // Fire and forget — don't await
      job.handler(job.data)
        .then(() => { job.status = 'completed'; })
        .catch(err => { job.status = 'failed'; job.error = String(err); })
        .finally(() => {
          this.running--;
          this.processLoop();
        });
    }

    this.processing = false;
  }

  getQueueLength(): number {
    return this.jobs.filter(j => j.status === 'queued').length;
  }

  getRunningCount(): number {
    return this.running;
  }

  clear(): void {
    this.jobs = [];
  }
}

// Singleton
export const taskQueue = new TaskQueue(5);
