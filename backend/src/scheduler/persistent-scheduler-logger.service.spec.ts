import { Logger } from '@nestjs/common';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PersistentSchedulerLogger,
  SchedulerRunLog,
} from './persistent-scheduler-logger.service';

describe('PersistentSchedulerLogger', () => {
  let logger: PersistentSchedulerLogger;

  beforeEach(() => {
    logger = new PersistentSchedulerLogger();
  });

  it('自動建立目錄並以 append 寫入多筆 JSON Lines，同時遮蔽敏感字串', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'scheduler-log-'));
    const filePath = join(directory, 'nested', 'scheduler.jsonl');
    const entry: SchedulerRunLog = {
      schedulerName: 'MagicLinkCleanupScheduler',
      startedAt: '2026-10-02T00:00:00.000Z',
      completedAt: '2026-10-02T00:00:01.000Z',
      status: 'failure',
      durationMs: 1000,
      error: {
        message: 'Authorization: Bearer sample-token password=sample-password',
        stack: 'Error: token=sample-token',
      },
    };

    try {
      await logger.append(entry, filePath);
      await logger.append({ ...entry, status: 'success', error: undefined }, filePath);

      const lines = (await readFile(filePath, 'utf8')).trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual({
        ...entry,
        error: {
          message: 'Authorization=[REDACTED] [REDACTED] password=[REDACTED]',
          stack: 'Error: token=[REDACTED]',
        },
      });
      expect(JSON.parse(lines[1]).status).toBe('success');
      expect(lines.join('\n')).not.toContain('sample-token');
      expect(lines.join('\n')).not.toContain('sample-password');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('檔案寫入失敗時不向呼叫端拋出錯誤', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'scheduler-log-'));
    const blockerPath = join(directory, 'blocker');
    await writeFile(blockerPath, 'file prevents directory creation');
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const entry: SchedulerRunLog = {
      schedulerName: 'MagicLinkCleanupScheduler',
      startedAt: '2026-10-02T00:00:00.000Z',
      completedAt: '2026-10-02T00:00:01.000Z',
      status: 'success',
      durationMs: 1000,
    };

    try {
      await expect(logger.append(entry, join(blockerPath, 'scheduler.jsonl'))).resolves.toBeUndefined();
      expect(loggerError).toHaveBeenCalled();
    } finally {
      loggerError.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});