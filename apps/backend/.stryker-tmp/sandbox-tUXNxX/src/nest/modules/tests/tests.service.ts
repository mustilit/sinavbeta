// @ts-nocheck
import { Injectable, BadRequestException } from '@nestjs/common';
import { TestPublishService as AppTestPublishService } from '../../../application/services/TestPublishService';

@Injectable()
export class TestsService {
  constructor(private readonly testPublishService: AppTestPublishService) {}

  async publish(testId: string, actorId?: string) {
    // delegate to test-publish provider which handles persistence
    return this.testPublishService.publish(testId);
  }
}

