import { HttpStatus, Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

import { ApiException } from '../../../common/errors/api-exception';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AuthRepository } from '../repositories';
import { AuthenticatedUser } from '../interfaces';

@Injectable()
export class AuthService {
  private readonly supabase;

  constructor(
    configService: ConfigService,
    private readonly authRepository: AuthRepository,
  ) {
    this.supabase = createClient(
      configService.getOrThrow<string>('SUPABASE_URL'),
      configService.getOrThrow<string>('SUPABASE_ANON_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  async authenticate(accessToken: string): Promise<AuthenticatedUser> {
    const { data, error } = await this.supabase.auth.getUser(accessToken);

    if (error || !data.user.email) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ERROR_CODE.AUTHENTICATION_REQUIRED);
    }

    const persistedUser = await this.authRepository.upsertUser({
      id: data.user.id,
      email: data.user.email.toLowerCase(),
      displayName: this.resolveDisplayName(data.user.user_metadata),
    });

    return {
      id: persistedUser.id,
      email: persistedUser.email,
      displayName: persistedUser.displayName,
    };
  }

  async findOrProvisionUserByEmail(email: string): Promise<AuthenticatedUser | null> {
    const normalizedEmail = email.toLowerCase();
    const existingUser = await this.authRepository.findByEmail(normalizedEmail);

    if (existingUser) {
      return {
        id: existingUser.id,
        email: existingUser.email,
        displayName: existingUser.displayName,
      };
    }

    const [supabaseUser] = await this.authRepository.findSupabaseUserByEmail(normalizedEmail);
    if (!supabaseUser) {
      return null;
    }

    const persistedUser = await this.authRepository.upsertUser({
      id: supabaseUser.id,
      email: supabaseUser.email.toLowerCase(),
      displayName: this.resolveDisplayName(supabaseUser.userMetadata),
    });

    return {
      id: persistedUser.id,
      email: persistedUser.email,
      displayName: persistedUser.displayName,
    };
  }

  private resolveDisplayName(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const record = metadata as Record<string, unknown>;
    const value = record.full_name ?? record.name;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
