import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';
import { CurrentRequest } from 'src/platform/http/request-context.decorators';
import { Public } from 'src/platform/auth/public.decorator';
import { PlatformRequest } from 'src/platform/http/request-context';
import { IdentityService } from '../application/identity/identity.service';
import { AuthService } from '../application/auth/auth.service';
import { LoginAttemptLimiterService } from '../application/auth/login-attempt-limiter.service';
import { AuthenticationFailedError } from 'src/shared/errors/authentication-failed.error';
import { LoginPasswordDto } from '../contracts/dto/login-password.dto';

class RefreshTokenBody {
  @IsString()
  refreshToken!: string;
}

class SelectCompanyBody {
  @IsUUID()
  tenantId!: string;
}

class SelectBranchBody {
  @IsUUID()
  branchId!: string;
}

class ForgotPasswordBody {
  @IsEmail()
  email!: string;
}

class FirstAccessValidateBody {
  @IsEmail()
  email!: string;

  @IsString()
  token!: string;
}

class FirstAccessCompleteBody extends FirstAccessValidateBody {
  @IsString()
  @MinLength(8)
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(IdentityService)
    private readonly identityService: IdentityService,
    @Inject(LoginAttemptLimiterService)
    private readonly loginAttemptLimiter: LoginAttemptLimiterService,
  ) {}

  @Public()
  @Post('login/password')
  async loginWithPassword(@Body() body: LoginPasswordDto, @CurrentRequest() request: PlatformRequest) {
    const address = request.ip ?? null;
    this.loginAttemptLimiter.assertAllowed(body.email, address);

    try {
      const result = await this.authService.loginWithPassword(body);
      this.loginAttemptLimiter.recordSuccess(body.email, address);
      return result;
    } catch (error) {
      if (error instanceof AuthenticationFailedError) {
        this.loginAttemptLimiter.recordFailure(body.email, address);
      }
      throw error;
    }
  }

  @Public()
  @Post('token/refresh')
  async refreshToken(@Body() body: RefreshTokenBody) {
    return this.authService.refreshTokens(body);
  }

  @Public()
  @Post('password/forgot')
  async forgotPassword(@Body() body: ForgotPasswordBody) {
    return this.authService.requestPasswordReset(body.email);
  }

  @Public()
  @Post('first-access/validate')
  async validateFirstAccess(@Body() body: FirstAccessValidateBody) {
    return this.authService.validateFirstAccessToken(body);
  }

  @Public()
  @Post('first-access/complete')
  async completeFirstAccess(@Body() body: FirstAccessCompleteBody) {
    return this.authService.completeFirstAccess(body);
  }

  @Post('context/company')
  async selectCompany(@Body() body: SelectCompanyBody, @CurrentRequest() request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!principal) {
      throw new UnauthorizedException('Authenticated session is required.');
    }

    return this.authService.selectCompany({
      sessionId: principal.sessionId,
      actorUserId: principal.userId,
      tenantId: body.tenantId,
    });
  }

  @Post('context/branch')
  async selectBranch(@Body() body: SelectBranchBody, @CurrentRequest() request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!principal) {
      throw new UnauthorizedException('Authenticated session is required.');
    }

    await this.authService.selectBranch({
      sessionId: principal.sessionId,
      actorUserId: principal.userId,
      branchId: body.branchId,
    });
    return { success: true };
  }

  @Post('logout')
  async logout(@CurrentRequest() request: PlatformRequest) {
    const actorUserId = request.requestContext.authenticatedPrincipal?.userId;
    const sessionId = request.requestContext.authenticatedPrincipal?.sessionId;
    if (!actorUserId || !sessionId) {
      throw new UnauthorizedException('Authenticated session is required.');
    }

    await this.authService.logout({ sessionId, actorUserId });
    return { success: true };
  }

  @Get('me')
  async getMe(@CurrentRequest() request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!principal) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    const user = await this.identityService.getById(principal.userId);
    if (user.tenantId !== principal.tenantId) {
      throw new UnauthorizedException('Authenticated user is outside the tenant scope.');
    }

    const sessionContext = await this.authService.getSessionContext(principal.sessionId, principal.userId);

    return {
      user,
      effectiveAccess: {
        branchIds: principal.effectiveBranchIds,
        permissions: principal.effectivePermissions,
        communities: principal.communities,
      },
      context: {
        tenantId: principal.tenantId,
        branchId: request.requestContext.requestedBranchId ?? sessionContext.lastBranchId,
        companySelectionRequired: sessionContext.companySelectionRequired,
        availableCompanies: sessionContext.availableCompanies,
      },
    };
  }
}
