import { Controller, Get, Req, Inject } from '@nestjs/common';
import { GetMyModerationStatusUseCase } from '../../application/use-cases/moderation/GetMyModerationStatusUseCase';
import { Roles } from '../decorators/roles.decorator';

const TENANT_ID = process.env.DEFAULT_TENANT_ID ?? 'dev-tenant';

@Controller('me')
export class MeModerationController {
  constructor(
    @Inject(GetMyModerationStatusUseCase) private readonly getMyStatusUC: GetMyModerationStatusUseCase,
  ) {}

  @Roles('EDUCATOR', 'ADMIN')
  @Get('moderation-status')
  async getModerationStatus(@Req() req: any) {
    const userId = req.user?.id;
    return this.getMyStatusUC.execute(userId, TENANT_ID);
  }
}
