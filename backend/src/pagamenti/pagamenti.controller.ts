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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PagamentiService } from './pagamenti.service';
import { CreatePagamentoDto } from './dto/create-pagamento.dto';
import { UpdatePagamentoDto } from './dto/update-pagamento.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('pagamenti')
@UseGuards(JwtAuthGuard)
export class PagamentiController {
  constructor(private readonly pagamentiService: PagamentiService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('ricevuta', {
      storage: diskStorage({
        destination: './uploads/ricevute',
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `ricevuta-${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  create(
    @Body() createPagamentoDto: CreatePagamentoDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      createPagamentoDto.ricevutaFile = file.path;
    }
    return this.pagamentiService.create(createPagamentoDto);
  }

  @Get()
  findAll(@Query('idScadenza') idScadenza?: string) {
    const parsedIdScadenza = idScadenza ? parseInt(idScadenza, 10) : undefined;
    return this.pagamentiService.findAll(parsedIdScadenza);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.pagamentiService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePagamentoDto: UpdatePagamentoDto,
  ) {
    return this.pagamentiService.update(id, updatePagamentoDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.pagamentiService.remove(id);
  }
}
