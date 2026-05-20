// @ts-nocheck
import { PipeTransform, Injectable } from '@nestjs/common';
import { AppError } from '../../application/errors/AppError';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ParseUUIDPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value || !UUID_REGEX.test(value)) {
      throw new AppError('INVALID_UUID', 'Invalid UUID', 400);
    }
    return value;
  }
}
