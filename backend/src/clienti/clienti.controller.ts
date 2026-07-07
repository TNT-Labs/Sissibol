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
  Request,
} from '@nestjs/common';
import { ClientiService } from './clienti.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('clienti')
@UseGuards(JwtAuthGuard)
export class ClientiController {
  constructor(private readonly clientiService: ClientiService) {}

  @Post()
  create(@Body() createClienteDto: CreateClienteDto) {
    return this.clientiService.create(createClienteDto);
  }

  @Get()
  findAll(@Query('search') search?: string) {
    return this.clientiService.findAll(search);
  }

  @Get('paginated')
  findAllPaginated(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('attivo') attivo?: string,
  ) {
    return this.clientiService.findAllPaginated(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 50,
      search,
      attivo === undefined ? undefined : attivo === 'true',
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientiService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateClienteDto: UpdateClienteDto,
  ) {
    return this.clientiService.update(id, updateClienteDto);
  }

  /**
   * DELETE /clienti/:id        → soft-delete (disattiva il cliente)
   * DELETE /clienti/:id?hard=true → eliminazione definitiva (solo ADMIN)
   */
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('hard') hard: string | undefined,
    @Request() req: any,
  ) {
    if (hard === 'true') {
      return this.clientiService.removeHard(id, req.user?.ruolo === 'ADMIN');
    }
    return this.clientiService.remove(id);
  }
}
