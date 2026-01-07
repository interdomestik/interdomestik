export interface Job {
  id: string;
  type: string;
  data: any;
  priority: 'low' | 'medium' | 'high';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  scheduledAt?: Date;
  error?: string;
}

export interface JobHandler<T = any> {
  type: string;
  handler: (job: T) => Promise<void>;
}

class SimpleJobQueue {
  private readonly jobs: Map<string, Job> = new Map();
  private readonly handlers: Map<string, JobHandler> = new Map();
  private processing = false;
  private readonly batchSize = 10;
  private readonly pollInterval = 5000; // 5 seconds

  registerHandler<T>(handler: JobHandler<T>) {
    this.handlers.set(handler.type, handler);
  }

  async addJob<T>(
    type: string,
    data: T,
    priority: Job['priority'] = 'medium',
    delayMs = 0
  ): Promise<string> {
    const job: Job = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      type,
      data,
      priority,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      scheduledAt: delayMs > 0 ? new Date(Date.now() + delayMs) : undefined,
    };

    this.jobs.set(job.id, job);
    console.log(`Job queued: ${job.id} (${type})`);
    return job.id;
  }

  getJobStats() {
    const stats = {
      pending: 0,
      processing: 0,
      failed: 0,
      byType: {} as Record<string, number>,
    };

    for (const job of this.jobs.values()) {
      if (job.attempts >= job.maxAttempts) {
        stats.failed++;
      } else {
        stats.pending++;
      }

      stats.byType[job.type] = (stats.byType[job.type] || 0) + 1;
    }

    return stats;
  }

  async start() {
    if (this.processing) return;

    this.processing = true;
    console.log('Job queue started');

    while (this.processing) {
      try {
        await this.processBatch();
      } catch (error) {
        console.error('Error processing job batch:', error);
      }

      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
    }
  }

  stop() {
    this.processing = false;
    console.log('Job queue stopped');
  }

  private async processBatch() {
    const now = new Date();
    const readyJobs = Array.from(this.jobs.values())
      .filter(job => job.attempts < job.maxAttempts && (!job.scheduledAt || job.scheduledAt <= now))
      .sort((a, b) => {
        // Sort by priority first
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;

        // Then by creation time
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .slice(0, this.batchSize);

    for (const job of readyJobs) {
      await this.processJob(job);
    }

    // Clean up old failed jobs
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    for (const [id, job] of this.jobs.entries()) {
      if (job.attempts >= job.maxAttempts && job.createdAt < cutoff) {
        this.jobs.delete(id);
      }
    }
  }

  private async processJob(job: Job) {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      console.error(`No handler found for job type: ${job.type}`);
      return;
    }

    job.attempts++;

    try {
      await handler.handler(job.data);
      this.jobs.delete(job.id);
      console.log(`Job completed: ${job.id} (${job.type})`);
    } catch (error) {
      job.error = error instanceof Error ? error.message : 'Unknown error';

      if (job.attempts >= job.maxAttempts) {
        console.error(`Job failed permanently: ${job.id} (${job.type}) - ${job.error}`);
      } else {
        console.warn(
          `Job failed (attempt ${job.attempts}/${job.maxAttempts}): ${job.id} (${job.type}) - ${job.error}`
        );
      }
    }
  }
}

// Singleton instance
export const jobQueue = new SimpleJobQueue();

// Auto-start in production
if (process.env.NODE_ENV === 'production') {
  jobQueue.start();
}
