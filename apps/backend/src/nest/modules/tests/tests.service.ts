import { Injectable } from '@nestjs/common';
import { TestPublishService as AppTestPublishService } from '../../../application/services/TestPublishService';

@Injectable()
export class TestsService {
  constructor(private readonly testPublishService: AppTestPublishService) {}

  async publish(testId: string, actorId?: string) {
    // actorId zorunlu olarak provider'a iletilmeli; aksi takdirde AuditLog
    // actorId=null kaydeder ve "kim yayınladı" sorusu cevapsız kalır.
    return this.testPublishService.publish(testId, actorId);
  }

  async unpublish(testId: string, actorId?: string) {
    return this.testPublishService.unpublish(testId, actorId);
  }
}

