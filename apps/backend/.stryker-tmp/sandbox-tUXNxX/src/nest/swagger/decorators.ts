// @ts-nocheck
import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { ErrorEnvelopeSchema } from './error-envelope';

export const ApiErrorResponses = () =>
  applyDecorators(
    ApiBadRequestResponse({ schema: ErrorEnvelopeSchema }),
    ApiUnauthorizedResponse({ schema: ErrorEnvelopeSchema }),
    ApiForbiddenResponse({ schema: ErrorEnvelopeSchema }),
    ApiNotFoundResponse({ schema: ErrorEnvelopeSchema }),
    ApiConflictResponse({ schema: ErrorEnvelopeSchema }),
  );

export const ApiOk = (type: any) => applyDecorators(ApiOkResponse({ type }));

