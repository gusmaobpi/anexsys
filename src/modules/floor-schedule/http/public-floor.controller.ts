import { Body, Controller, Header, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { Public } from 'src/platform/auth/public.decorator';
import { FloorScheduleService } from '../application/floor-schedule.service';

class PublicCodeBody {
  @IsUUID()
  code!: string;
}

class PublicSessionBody extends PublicCodeBody {
  @IsUUID()
  technicianId!: string;
}

class PublicReadBody extends PublicCodeBody {
  @IsString()
  codeValue!: string;
}

class PublicOrderBody extends PublicCodeBody {
  @IsUUID()
  serviceOrderId!: string;
}

class PublicDecisionBody extends PublicOrderBody {
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  reason?: string;
}

@Public()
@Controller('public/floor')
export class PublicFloorController {
  constructor(
    @Inject(FloorScheduleService)
    private readonly floorScheduleService: FloorScheduleService,
  ) {}

  @Public()
  @Post('checkin')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  checkin(@Body() body: PublicCodeBody) {
    return this.floorScheduleService.openPublicCheckin(body.code);
  }

  @Public()
  @Post('sessions')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  openSession(@Body() body: PublicSessionBody) {
    return this.floorScheduleService.openPublicSession(body.code, body.technicianId);
  }

  @Public()
  @Post('sessions/:sessionId/close')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  close(@Param('sessionId', new ParseUUIDPipe()) sessionId: string, @Body() body: PublicCodeBody) {
    return this.floorScheduleService.closePublicSession(body.code, sessionId);
  }

  @Public()
  @Post('sessions/:sessionId/read')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  read(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: PublicReadBody,
  ) {
    return this.floorScheduleService.readPublicOrder(body.code, sessionId, body.codeValue);
  }

  @Public()
  @Post('sessions/:sessionId/advance')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  advance(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: PublicOrderBody,
  ) {
    return this.floorScheduleService.advancePublic(body.code, sessionId, body.serviceOrderId);
  }

  @Public()
  @Post('sessions/:sessionId/production')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  productionItems(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: PublicOrderBody,
  ) {
    return this.floorScheduleService.productionItemsPublic(body.code, sessionId, body.serviceOrderId);
  }

  @Public()
  @Post('sessions/:sessionId/production-items/:itemId')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  finishItem(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() body: PublicOrderBody,
  ) {
    return this.floorScheduleService.finishPublicItem(body.code, sessionId, body.serviceOrderId, itemId);
  }

  @Public()
  @Post('sessions/:sessionId/items/:itemId')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  decide(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() body: PublicDecisionBody,
  ) {
    return this.floorScheduleService.decidePublic(
      body.code,
      sessionId,
      body.serviceOrderId,
      itemId,
      body.decision,
      body.reason,
    );
  }

  @Public()
  @Post('sessions/:sessionId/start-return')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  startReturn(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: PublicOrderBody,
  ) {
    return this.floorScheduleService.startPublicReturn(body.code, sessionId, body.serviceOrderId);
  }
}
