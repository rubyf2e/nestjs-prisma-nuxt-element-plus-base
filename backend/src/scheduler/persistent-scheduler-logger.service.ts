import { Injectable, Logger } from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const SCHEDULER_LOG_FILE_PATH = '/app/logs/backend-scheduler.jsonl';

export interface SchedulerRunLog {
  schedulerName: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'failure';
  durationMs: number;
  deletedCount?: number;
  error?: {
    message: string;
    stack: string;
  };
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(password|passwd|secret|token|authorization|magic[_ -]?link)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1=[REDACTED]',
    )
    .replace(/(postgres(?:ql)?|redis):\/\/[^/@\s]+@/gi, '$1://[REDACTED]@');
}

function redactLog(entry: SchedulerRunLog): SchedulerRunLog {
  if (!entry.error) {
    return entry;
  }

  return {
    ...entry,
    error: {
      message: redactSensitiveText(entry.error.message),
      stack: redactSensitiveText(entry.error.stack),
    },
  };
}

@Injectable()
export class PersistentSchedulerLogger {
  private readonly logger = new Logger(PersistentSchedulerLogger.name);

  async append(
    entry: SchedulerRunLog,
    filePath = SCHEDULER_LOG_FILE_PATH,
  ): Promise<void> {
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, `${JSON.stringify(redactLog(entry))}\n`, {
        encoding: 'utf8',
        flag: 'a',
        mode: 0o640,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`無法寫入 Scheduler log：${redactSensitiveText(message)}`);
    }
  }
}