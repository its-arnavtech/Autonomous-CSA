import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessGuard } from './jwt-access.guard';
import { PasswordService } from './password.service';
import { RolesGuard } from './roles.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { TokenService } from './token.service';

@Global()
@Module({
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
