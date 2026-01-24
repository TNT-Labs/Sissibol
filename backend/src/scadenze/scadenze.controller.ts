import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ScadenzeService } from './scadenze.service';
import { CreateScadenzaDto } from './dto/create-scadenza.dto';
import { UpdateScadenzaDto } from './dto/update-scadenza.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StatoScadenza } from '@prisma/client';

@Controller('scadenze')
@UseGuards(JwtAuthGuard)
export class ScadenzeController {
  constructor(private readonly scadenzeService: ScadenzeService) {}

  @Post()
  create(@Body() createScadenzaDto: CreateScadenzaDto) {
    return this.scadenzeService.create(createScadenzaDto);
  }

  @Get()
  findAll(
    @Query('stato') stato?: StatoScadenza,
    @Query('idCliente', ParseIntPipe) idCliente?: number,
  ) {
    return this.scadenzeService.findAll(stato, idCliente);
  }

  @Get('in-scadenza')
  getScadenzeInScadenza(@Query('giorni', ParseIntPipe) giorni?: number) {
    return this.scadenzeService.getScadenzeInScadenza(giorni);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.scadenzeService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateScadenzaDto: UpdateScadenzaDto,
  ) {
    return this.scadenzeService.update(id, updateScadenzaDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.scadenzeService.remove(id);
  }
}
