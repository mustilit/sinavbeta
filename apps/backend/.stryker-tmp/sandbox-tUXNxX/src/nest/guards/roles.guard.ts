// @ts-nocheck
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const cls = context.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, cls]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler()) || [];
    if (requiredRoles.length === 0) return true;
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return false;
    return requiredRoles.includes(user.role);
  }
}

