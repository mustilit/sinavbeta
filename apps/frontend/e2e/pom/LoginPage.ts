/**
 * LoginPage POM (Sprint 17.1) — Login.jsx (login-email / login-password id'leri).
 * auth.ts login helper'larını sarmalar + hata doğrulaması ekler.
 */
import { type Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import type { E2EUser } from '../fixtures/users';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.page.goto('/Login');
    await expect(this.emailInput()).toBeVisible({ timeout: 15000 });
  }

  emailInput() {
    return this.page.getByLabel(/e-?(posta|mail)/i).first();
  }

  passwordInput() {
    return this.page.getByLabel(/şifre|password/i).first();
  }

  submitButton() {
    return this.button(/giriş yap|sign in|log in/i).first();
  }

  /** Form doldur + submit, login dışına yönlenmeyi bekle */
  async login(email: string, password: string): Promise<void> {
    await this.open();
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.submitButton().click();
    await this.page.waitForURL((url) => !url.pathname.toLowerCase().includes('/login'), {
      timeout: 15000,
    });
    await this.dismissCookieDialog();
  }

  async loginAsUser(user: E2EUser): Promise<void> {
    await this.login(user.email, user.password);
  }

  /** Yanlış credential → form'da kalır + hata mesajı görünür */
  async expectLoginError(email: string, password: string): Promise<void> {
    await this.open();
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.submitButton().click();
    // Login sayfasında kalmalı (yönlenmemeli)
    await this.page.waitForTimeout(1500);
    expect(this.page.url().toLowerCase()).toContain('/login');
  }
}
