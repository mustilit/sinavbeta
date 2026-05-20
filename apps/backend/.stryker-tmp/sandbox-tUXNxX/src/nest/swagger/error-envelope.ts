// @ts-nocheck
export const ErrorEnvelopeSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'object', nullable: true },
      },
      required: ['code', 'message'],
    },
    path: { type: 'string' },
    timestamp: { type: 'string' },
  },
  required: ['error', 'path', 'timestamp'],
};

