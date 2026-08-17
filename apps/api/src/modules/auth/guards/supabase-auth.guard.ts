import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { ApiException } from '../../../common/errors/api-exception';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AuthService } from '../services';
import { AuthenticatedUser } from '../interfaces';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.readBearerToken(request);

    if (!token) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ERROR_CODE.AUTHENTICATION_REQUIRED);
    }

    request.user = await this.authService.authenticate(token);
    return true;
  }

  private readBearerToken(request: Request): string | null {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : null;
  }
}
