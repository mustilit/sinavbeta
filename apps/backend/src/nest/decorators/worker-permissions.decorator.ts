import { SetMetadata } from '@nestjs/common';

export const WORKER_PERMISSIONS_KEY = 'worker_permissions';

export const WorkerPermissions = (...pages: string[]) =>
  SetMetadata(WORKER_PERMISSIONS_KEY, pages);
