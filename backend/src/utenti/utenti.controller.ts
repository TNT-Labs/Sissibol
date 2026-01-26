import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { UtentiService } from './utenti.service';
import { CreateUtenteDto } from './dto/create-utente.dto';
import { UpdateUtenteDto } from './dto/update-utente.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('utenti')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UtentiController {
  constructor(private readonly utentiService: UtentiService) {}

  @Get()
  findAll() {
    return this.utentiService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.utentiService.findOne(id);
  }

  @Post()
  create(@Body() createUtenteDto: CreateUtenteDto) {
    return this.utentiService.create(createUtenteDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUtenteDto: UpdateUtenteDto,
  ) {
    return this.utentiService.update(id, updateUtenteDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.utentiService.remove(id, req.user.id);
  }
}
