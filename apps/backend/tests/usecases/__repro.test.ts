import { prisma } from '../../src/infrastructure/database/prisma';
describe('repro', () => { it('loads singleton', () => { expect(typeof prisma).toBe('object'); }); });
