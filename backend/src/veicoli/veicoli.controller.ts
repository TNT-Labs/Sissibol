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
import { VeicoliService } from './veicoli.service';
import { CreateVeicoloDto } from './dto/create-veicolo.dto';
import { UpdateVeicoloDto } from './dto/update-veicolo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('veicoli')
@UseGuards(JwtAuthGuard)
export class VeicoliController {
  constructor(private readonly veicoliService: VeicoliService) {}

  @Post()
  create(@Body() createVeicoloDto: CreateVeicoloDto) {
    return this.veicoliService.create(createVeicoloDto);
  }

  @Get()
  findAll(
    @Query('idCliente') idCliente?: string,
    @Query('search') search?: string,
  ) {
    const parsedIdCliente = idCliente ? parseInt(idCliente, 10) : undefined;
    return this.veicoliService.findAll(parsedIdCliente, search);
  }

  @Get('paginated')
  findAllPaginated(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('idCliente') idCliente?: string,
    @Query('search') search?: string,
  ) {
    return this.veicoliService.findAllPaginated(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 50,
      idCliente ? parseInt(idCliente, 10) : undefined,
      search,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.veicoliService.findOne(id);
  }

  /**
   * Recupera lo storico modifiche di un veicolo (targa/proprietario)
   */
  @Get(':id/storico')
  getStorico(@Param('id', ParseIntPipe) id: number) {
    return this.veicoliService.getStorico(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateVeicoloDto: UpdateVeicoloDto,
    @Query('motivazione') motivazione: string | undefined,
    @Request() req: any,
  ) {
    const utenteEmail = req.user?.email;
    return this.veicoliService.update(id, updateVeicoloDto, utenteEmail, motivazione);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.veicoliService.remove(id);
  }
}
