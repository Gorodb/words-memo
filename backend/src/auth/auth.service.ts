import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../users/user.entity.ts';
import { AuthToken } from './auth-token.entity.ts';
import type { AuthResponse, CredentialsDto } from './auth.dto.ts';
import {
  hashPassword,
  hashToken,
  newToken,
  normalizeEmail,
  verifyPassword,
} from './password.ts';

/** Machine-readable `code` in error bodies; the app branches on these. */
export const AuthErrorCode = {
  userNotFound: 'USER_NOT_FOUND',
  wrongPassword: 'WRONG_PASSWORD',
  emailTaken: 'EMAIL_TAKEN',
  unauthorized: 'UNAUTHORIZED',
} as const;

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AuthToken)
    private readonly tokens: Repository<AuthToken>,
  ) {}

  /** No email confirmation: a unique email and a password are enough. */
  async register({ email, password }: CredentialsDto): Promise<AuthResponse> {
    const normalized = normalizeEmail(email);
    const passwordHash = await hashPassword(password);
    let user: User;
    try {
      user = await this.users.save(
        this.users.create({ email: normalized, passwordHash }),
      );
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e.driverError as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException({
          code: AuthErrorCode.emailTaken,
          message: 'An account with this email already exists',
        });
      }
      throw e;
    }
    return this.startSession(user);
  }

  /**
   * Tells "no such account" apart from "wrong password" on purpose: the app
   * offers to register when the email is unknown.
   */
  async login({ email, password }: CredentialsDto): Promise<AuthResponse> {
    const user = await this.users.findOneBy({ email: normalizeEmail(email) });
    if (!user) {
      throw new NotFoundException({
        code: AuthErrorCode.userNotFound,
        message: 'There is no account with this email',
      });
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: AuthErrorCode.wrongPassword,
        message: 'Wrong password',
      });
    }
    return this.startSession(user);
  }

  async logout(token: string): Promise<void> {
    await this.tokens.delete({ tokenHash: hashToken(token) });
  }

  /** The user behind a bearer token, or null. */
  async userForToken(token: string): Promise<User | null> {
    const session = await this.tokens.findOne({
      where: { tokenHash: hashToken(token) },
      relations: { user: true },
    });
    return session?.user ?? null;
  }

  private async startSession(user: User): Promise<AuthResponse> {
    const { token, hash } = newToken();
    await this.tokens.insert({ userId: user.id, tokenHash: hash });
    return { token, user: { id: user.id, email: user.email } };
  }
}
