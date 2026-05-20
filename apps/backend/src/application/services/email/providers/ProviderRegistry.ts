import { EmailProviderConfig, EmailProviderKind, PrismaClient } from '@prisma/client';
import { prisma } from '../../../../infrastructure/database/prisma';
import { decryptJson } from '../utils/encryption';
import { BrevoApiProvider } from './BrevoApiProvider';
import { ConsoleProvider } from './ConsoleProvider';
import { IEmailTransport } from './IEmailTransport';
import { SmtpProvider, SmtpSecrets } from './SmtpProvider';

export type ResolvedProvider = {
  config: EmailProviderConfig;
  transport: IEmailTransport;
};

/**
 * EmailProviderConfig tablosundan aktif sağlayıcıları okur, secret'larını çözer
 * ve cache'lenmiş transport instance döner. ProviderConfig güncellenince cache invalidate edilir.
 */
export class ProviderRegistry {
  private cache = new Map<string, IEmailTransport>(); // configId → transport
  private cacheVersion = new Map<string, number>();    // configId → updatedAt epoch

  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * tenantId için aktif sağlayıcıları priority ASC sırasıyla döner.
   * Brevo günlük cap aşıldıysa atlanır (dailyResetAt 24h öncesinden eski olabilir, cron sıfırlar).
   */
  async listActive(tenantId: string): Promise<ResolvedProvider[]> {
    const isProd = process.env.NODE_ENV === 'production';
    const configs = await this.db.emailProviderConfig.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(isProd ? { NOT: { kind: 'CONSOLE' } } : {}),
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    const out: ResolvedProvider[] = [];
    for (const cfg of configs) {
      // Günlük kota dolduysa atla
      if (cfg.dailyCap != null && cfg.dailySentCount >= cfg.dailyCap) {
        continue;
      }
      try {
        const transport = this.getOrBuild(cfg);
        out.push({ config: cfg, transport });
      } catch {
        // secret decryption hatası → bu sağlayıcı atlanır
        continue;
      }
    }
    return out;
  }

  /**
   * Tek bir config'i tekil olarak çözer (admin test maili gönderimi için).
   */
  async resolveById(id: string): Promise<ResolvedProvider | null> {
    const cfg = await this.db.emailProviderConfig.findUnique({ where: { id } });
    if (!cfg) return null;
    return { config: cfg, transport: this.getOrBuild(cfg) };
  }

  /**
   * Config güncellenince/silinince cache'i temizle.
   */
  invalidate(configId: string) {
    this.cache.delete(configId);
    this.cacheVersion.delete(configId);
  }

  private getOrBuild(cfg: EmailProviderConfig): IEmailTransport {
    const version = cfg.updatedAt.getTime();
    if (this.cache.has(cfg.id) && this.cacheVersion.get(cfg.id) === version) {
      return this.cache.get(cfg.id)!;
    }
    const transport = this.buildTransport(cfg);
    this.cache.set(cfg.id, transport);
    this.cacheVersion.set(cfg.id, version);
    return transport;
  }

  private buildTransport(cfg: EmailProviderConfig): IEmailTransport {
    switch (cfg.kind) {
      case 'BREVO_API': {
        const secrets = decryptJson<{ apiKey: string }>(cfg.encryptedSecrets);
        return new BrevoApiProvider({ apiKey: secrets.apiKey });
      }
      case 'SMTP': {
        const secrets = decryptJson<SmtpSecrets>(cfg.encryptedSecrets);
        return new SmtpProvider(secrets);
      }
      case 'CONSOLE':
        return new ConsoleProvider();
      default:
        throw new Error(`Unknown EmailProviderKind: ${String(cfg.kind)}`);
    }
  }
}

let _registry: ProviderRegistry | null = null;
export function getProviderRegistry(): ProviderRegistry {
  if (!_registry) _registry = new ProviderRegistry();
  return _registry;
}
