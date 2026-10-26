import {
  Inject,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { PlatformRequest } from 'src/platform/http/request-context';
import { DependencyValidationService } from 'src/modules/governance/application/dependency-validation.service';
import { CustomerStatus, CustomerType } from 'src/shared/domain/enums';
import { CreateCustomerDto, CreateCustomerRequestDto } from '../contracts/dto/create-customer.dto';
import {
  CreateMeasurementRecordDto,
  MeasurementSetItemInputDto,
} from '../contracts/dto/create-measurement-record.dto';
import { SearchCustomersDto } from '../contracts/dto/search-customers.dto';
import { UpdateCustomerDto, UpdateCustomerRequestDto } from '../contracts/dto/update-customer.dto';
import { CustomerService } from '../application/customer/customer.service';
import { MeasurementService } from '../application/measurement/measurement.service';

class CreateMeasurementsBody {
  @IsOptional()
  @IsDateString()
  measurementDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MeasurementSetItemInputDto)
  items!: MeasurementSetItemInputDto[];
}

@Controller('customers')
export class CustomersController {
  constructor(
    @Inject(CustomerService)
    private readonly customerService: CustomerService,
    @Inject(MeasurementService)
    private readonly measurementService: MeasurementService,
    @Inject(DependencyValidationService)
    private readonly dependencyValidationService: DependencyValidationService,
  ) {}

  @Permissions('customers.read')
  @Get()
  async search(
    @Query() query: SearchCustomersDto,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }
    if (!principal) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return this.customerService.search(tenantId, query);
  }

  @Permissions('customers.read')
  @Get(':customerId')
  async getById(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const profile = await this.customerService.getProfile(tenantId, customerId);
    const measurements = await this.measurementService.listByCustomer(tenantId, customerId);

    return {
      ...profile,
      latestMeasurements: measurements.latestByLabel,
    };
  }

  @Permissions('customers.write')
  @Post()
  async create(
    @Body() body: CreateCustomerRequestDto,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }

    return this.customerService.create({
      ...(body as CreateCustomerDto),
      tenantId,
      actorUserId: principal.userId,
    });
  }

  @Permissions('customers.write')
  @Get(':customerId/dependency-check')
  async dependencyCheck(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Query('action') action: string | undefined,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    if (action && action !== 'inactivate' && action !== 'delete') {
      throw new BadRequestException(`Unsupported dependency validation action '${action}'.`);
    }
    await this.customerService.getById(customerId, tenantId);
    return action === 'delete'
      ? this.dependencyValidationService.validateCustomerDeletion(tenantId, customerId)
      : this.dependencyValidationService.validateCustomerInactivation(tenantId, customerId);
  }

  @Permissions('customers.write')
  @Patch(':customerId')
  async update(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body() body: UpdateCustomerRequestDto,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }

    if (body.status === CustomerStatus.BLOCKED) {
      throw new BadRequestException('A gestão de cliente bloqueado ainda não está disponível nesta tela.');
    }

    return this.customerService.update(customerId, tenantId, {
      ...(body as UpdateCustomerDto),
      actorUserId: principal.userId,
    });
  }

  @Permissions('customers.write')
  @Delete(':customerId')
  async remove(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }

    await this.customerService.remove(customerId, tenantId, principal.userId);
    return { id: customerId, deleted: true };
  }

  @Permissions('measurements.read')
  @Get(':customerId/measurements')
  async listMeasurements(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    await this.customerService.getById(customerId, tenantId);
    return this.measurementService.listByCustomer(tenantId, customerId);
  }

  @Permissions('measurements.write')
  @Post(':customerId/measurements')
  async createMeasurements(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body() body: CreateMeasurementsBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    await this.customerService.getById(customerId, tenantId);

    return this.measurementService.create({
      ...(body as CreateMeasurementRecordDto),
      tenantId,
      customerId,
      actorUserId: principal.userId,
    });
  }
}
