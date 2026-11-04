import {
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsInt } from 'class-validator';

class ProbeQueryDto {
  @Type(() => Number)
  @IsInt()
  age!: number;

  @IsEmail()
  email!: string;
}

/**
 * Test-only controller mounted alongside AppModule. It exercises the global
 * filter and validation pipe without adding probe routes to the shipped app.
 */
@Controller('probe')
export class ProbeController {
  @Get('validation')
  validation(@Query() query: ProbeQueryDto): { age: number; email: string } {
    return { age: query.age, email: query.email };
  }

  @Get('unauthorized')
  unauthorized(): never {
    throw new UnauthorizedException();
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException();
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundException('Probe resource not found');
  }

  @Get('conflict')
  conflict(): never {
    throw new ConflictException();
  }

  @Get('failure')
  failure(): never {
    throw new Error('password=hunter2 should never reach the client');
  }
}
