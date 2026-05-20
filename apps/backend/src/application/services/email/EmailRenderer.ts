import { promises as fs } from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';

export type RenderInput = {
  htmlPath: string;
  textPath?: string;
  subject: string;
  data: Record<string, unknown>;
};

export type RenderResult = {
  subject: string;
  html: string;
  text?: string;
};

/**
 * Handlebars tabanlı şablon render — dosya tabanlı template'leri okur, compile cache'ler.
 * TEMPLATE_DIR env var ile kök dizin override edilebilir (test için).
 */
export class EmailRenderer {
  private compileCache = new Map<string, HandlebarsTemplateDelegate>();
  private readonly rootDir: string;
  private partialsRegistered = false;

  constructor(rootDir?: string) {
    this.rootDir =
      rootDir ||
      process.env.EMAIL_TEMPLATE_DIR ||
      path.resolve(__dirname, '../../../infrastructure/email/templates');
  }

  async render(input: RenderInput): Promise<RenderResult> {
    await this.ensurePartials();
    const html = await this.renderFile(input.htmlPath, input.data);
    const subject = this.compileInline(input.subject)(input.data);
    let text: string | undefined;
    if (input.textPath) {
      text = await this.renderFile(input.textPath, input.data);
    }
    return { subject, html, text };
  }

  private async renderFile(relPath: string, data: Record<string, unknown>): Promise<string> {
    const abs = path.resolve(this.rootDir, relPath);
    const cached = this.compileCache.get(abs);
    if (cached) return cached(data);
    const src = await fs.readFile(abs, 'utf8');
    const tmpl = Handlebars.compile(src, { noEscape: false });
    this.compileCache.set(abs, tmpl);
    return tmpl(data);
  }

  private compileInline(src: string): HandlebarsTemplateDelegate {
    const key = `inline:${src}`;
    const cached = this.compileCache.get(key);
    if (cached) return cached;
    const tmpl = Handlebars.compile(src, { noEscape: true });
    this.compileCache.set(key, tmpl);
    return tmpl;
  }

  private async ensurePartials(): Promise<void> {
    if (this.partialsRegistered) return;
    const partialsDir = path.join(this.rootDir, 'partials');
    try {
      const files = await fs.readdir(partialsDir);
      for (const f of files) {
        if (!f.endsWith('.hbs')) continue;
        const name = f.replace(/\.hbs$/, '');
        const src = await fs.readFile(path.join(partialsDir, f), 'utf8');
        Handlebars.registerPartial(name, src);
      }
    } catch {
      // partials dir yoksa atla (test ortamı)
    }
    this.partialsRegistered = true;
  }

  /**
   * Test/dev için cache'i sıfırlar.
   */
  clearCache() {
    this.compileCache.clear();
    this.partialsRegistered = false;
  }
}

let _renderer: EmailRenderer | null = null;
export function getEmailRenderer(): EmailRenderer {
  if (!_renderer) _renderer = new EmailRenderer();
  return _renderer;
}
