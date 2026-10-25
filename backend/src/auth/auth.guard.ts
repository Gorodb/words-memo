import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../users/user.entity.ts';
import { AuthErrorCode, AuthService } from './auth.service.ts';

export interface AuthedRequest extends Request {
  user: User;
  token: string;
}

export function bearerToken(request: Request): string | null {
  const [scheme, token] = (request.headers.authorization ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Requires `Authorization: Bearer <token>` of a live session. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(request);
    const user = token ? await this.auth.userForToken(token) : null;
    if (!token || !user) {
      throw new UnauthorizedException({
        code: AuthErrorCode.unauthorized,
        message: 'Sign in again',
      });
    }
    request.user = user;
    request.token = token;
    return true;
  }
}

/** The signed-in user of a route behind AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthedRequest>().user,
);
