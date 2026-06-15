import { Global, Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessGuard } from './jwt-access.guard';
import { PasswordService } from './password.service';
import { RolesGuard } from './roles.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [ObservabilityModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    JwtAccessGuard,
    TenantContextGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    JwtAccessGuard,
    TenantContextGuard,
    TokenService,
    RolesGuard,
  ],
})
export class AuthModule {}
