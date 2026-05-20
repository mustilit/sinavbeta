// @ts-nocheck
import { SetMetadata } from '@nestjs/common';

// Marks a route or controller as public (bypass global auth guards)
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

