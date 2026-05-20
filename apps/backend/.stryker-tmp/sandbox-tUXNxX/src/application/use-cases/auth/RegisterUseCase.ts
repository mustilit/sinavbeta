// @ts-nocheck
import { randomUUID } from 'crypto';
import { User, UserPublic } from '../../../domain/entities/User';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { PasswordService } from '../../../infrastructure/services/PasswordService';
// RegisterDTO previously lived in presentation layer; accept plain input here

/**
 * Aday (CANDIDATE) kullanıcı kaydını gerçekleştirir.
 * Kayıt sonrası hesap hemen ACTIVE olur — eğiticilerden farklı olarak onay gerekmez.
 */
export class RegisterUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordService: PasswordService
  ) {}

  /**
   * Yeni bir aday hesabı oluşturur.
   * @param dto.email    - Kullanıcının e-posta adresi (küçük harfe dönüştürülür).
   * @param dto.username - Kullanıcı adı.
   * @param dto.password - Şifre (hash'lenerek saklanır).
   * @returns Kaydedilen kullanıcının public bilgileri (passwordHash içermez).
   */
  async execute(dto: { email: string; username: string; password: string }): Promise<UserPublic> {
    const passwordHash = await this.passwordService.hash(dto.password);

    // Aday rolüyle ve hemen aktif statüsüyle oluşturulur
    const user: User = {
      id: randomUUID(),
      email: dto.email.toLowerCase(),
      username: dto.username,
      passwordHash,
      role: 'CANDIDATE',
      status: 'ACTIVE',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const saved = await this.userRepository.save(user);

    return this.toPublic(saved);
  }

  /** Kullanıcı entity'sini güvenli public tipine dönüştürür (passwordHash dahil edilmez). */
  private toPublic(user: User): UserPublic {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
