import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './authenticated-user.type';
import { JwtAccessGuard } from './jwt-access.guard';
import { LoginDto, LogoutDto, RefreshTokenDto, RegisterDto } from './auth.dto';

function getRequestMetadata(request: Request) {
  return {
    userAgent: request.get('user-agent') ?? null,
    ipAddress: request.ip ?? null,
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a user, organization, and owner membership' })
  async register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.authService.register(dto, getRequestMetadata(request));
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate with email and password' })
  async login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, getRequestMetadata(request));
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate a refresh token and issue new tokens' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(dto.refreshToken, getRequestMetadata(request));
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke the provided refresh token session' })
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user and memberships' })
  async me(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.authService.getMe(user!.userId);
  }
}
