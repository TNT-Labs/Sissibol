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
  findAll(@Query('idCliente') idCliente?: string) {
    const parsedIdCliente = idCliente ? parseInt(idCliente, 10) : undefined;
    return this.veicoliService.findAll(parsedIdCliente);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.veicoliService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateVeicoloDto: UpdateVeicoloDto,
  ) {
    return this.veicoliService.update(id, updateVeicoloDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.veicoliService.remove(id);
  }
}
