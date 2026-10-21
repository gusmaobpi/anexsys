import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationModule } from 'src/modules/authorization/authorization.module';
import { EmailModule } from 'src/modules/email/email.module';
import { AuditModule } from 'src/modules/audit/audit.module';
import { BranchModule } from 'src/modules/branch/branch.module';
import { TenantModule } from 'src/modules/tenant/tenant.module';
import { PasswordHasherService } from 'src/platform/auth/password-hasher.service';
import { TokenFactoryService } from 'src/platform/auth/token-factory.service';
import { AuthController } from './http/auth.controller';
import { UsersController } from './http/users.controller';
import { AuthService } from './application/auth/auth.service';
import { LoginAttemptLimiterService } from './application/auth/login-attempt-limiter.service';
import { IdentityService } from './application/identity/identity.service';
import { FirstAccessTokenEntity } from './infrastructure/persistence/entities/first-access-token.entity';
import { UserContextPreferenceEntity } from './infrastructure/persistence/entities/user-context-preference.entity';
import { UserCredentialEntity } from './infrastructure/persistence/entities/user-credential.entity';
import { UserIdentityEntity } from './infrastructure/persistence/entities/user-identity.entity';
import { UserSessionEntity } from './infrastructure/persistence/entities/user-session.entity';
import { FirstAccessTokenRepository } from './infrastructure/persistence/repositories/first-access-token.repository';
import { UserContextPreferenceRepository } from './infrastructure/persistence/repositories/user-context-preference.repository';
import { UserCredentialRepository } from './infrastructure/persistence/repositories/user-credential.repository';
import { UserIdentityRepository } from './infrastructure/persistence/repositories/user-identity.repository';
import { UserSessionRepository } from './infrastructure/persistence/repositories/user-session.repository';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      UserIdentityEntity,
      UserCredentialEntity,
      UserSessionEntity,
      FirstAccessTokenEntity,
      UserContextPreferenceEntity,
    ]),
    AuditModule,
    TenantModule,
    BranchModule,
    forwardRef(() => AuthorizationModule),
    EmailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET must be configured.');
        }

        return { secret };
      },
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    IdentityService,
    AuthService,
    LoginAttemptLimiterService,
    UserIdentityRepository,
    UserCredentialRepository,
    UserSessionRepository,
    FirstAccessTokenRepository,
    UserContextPreferenceRepository,
    PasswordHasherService,
    TokenFactoryService,
  ],
  exports: [
    IdentityService,
    AuthService,
    UserIdentityRepository,
    UserCredentialRepository,
    UserSessionRepository,
    FirstAccessTokenRepository,
    UserContextPreferenceRepository,
    PasswordHasherService,
    TokenFactoryService,
  ],
})
export class IdentityModule {}
