import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertUser(user: { id: string; email: string; displayName: string | null }) {
    return this.prisma.user.upsert({
      where: { id: user.id },
      create: user,
      update: {
        email: user.email,
        displayName: user.displayName,
      },
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findSupabaseUserByEmail(email: string) {
    return this.prisma.$queryRaw<
      Array<{ id: string; email: string; userMetadata: unknown }>
    >(Prisma.sql`
      SELECT
        id::text AS id,
        email,
        raw_user_meta_data AS "userMetadata"
      FROM auth.users
      WHERE lower(email) = lower(${email})
      LIMIT 1
    `);
  }
}
