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
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PagamentiService } from './pagamenti.service';
import { CreatePagamentoDto } from './dto/create-pagamento.dto';
import { UpdatePagamentoDto } from './dto/update-pagamento.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Tipo per file uploadato tramite multer
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

// =====================================================
// CONFIGURAZIONE SICUREZZA FILE UPLOAD
// =====================================================

// MIME types consentiti per le ricevute
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
];

// Estensioni consentite (devono corrispondere ai MIME types)
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif'];

// Magic bytes per verifica contenuto file (header signatures)
const FILE_SIGNATURES: Record<string, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/gif': [0x47, 0x49, 0x46, 0x38], // GIF8
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF (followed by WEBP)
  'image/tiff': [0x49, 0x49, 0x2A, 0x00], // Little-endian TIFF
};

/**
 * Valida il MIME type del file
 */
const fileFilter = (
  req: any,
  file: MulterFile,
  callback: (error: Error | null, acceptFile: boolean) => void,
) => {
  // Verifica MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return callback(
      new BadRequestException(
        `Tipo file non consentito: ${file.mimetype}. ` +
        `Formati ammessi: PDF, JPEG, PNG, GIF, WebP, TIFF`,
      ),
      false,
    );
  }

  // Verifica estensione
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return callback(
      new BadRequestException(
        `Estensione file non consentita: ${ext}. ` +
        `Estensioni ammesse: ${ALLOWED_EXTENSIONS.join(', ')}`,
      ),
      false,
    );
  }

  // Verifica coerenza MIME type ed estensione
  const mimeExtensionMap: Record<string, string[]> = {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/tiff': ['.tiff', '.tif'],
  };

  const allowedExtensions = mimeExtensionMap[file.mimetype] || [];
  if (!allowedExtensions.includes(ext)) {
    return callback(
      new BadRequestException(
        `Incoerenza tra tipo file (${file.mimetype}) ed estensione (${ext}). ` +
        `Possibile tentativo di mascheramento file.`,
      ),
      false,
    );
  }

  callback(null, true);
};

/**
 * Genera un nome file sicuro
 */
const safeFilename = (req: any, file: MulterFile, callback: (error: Error | null, filename: string) => void) => {
  // Genera nome univoco senza usare parti del nome originale (previene path traversal)
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const ext = extname(file.originalname).toLowerCase();

  // Sanitizza l'estensione (rimuovi caratteri pericolosi)
  const safeExt = ext.replace(/[^a-z0-9.]/gi, '');

  callback(null, `ricevuta-${uniqueSuffix}${safeExt}`);
};

@Controller('pagamenti')
@UseGuards(JwtAuthGuard)
export class PagamentiController {
  constructor(private readonly pagamentiService: PagamentiService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('ricevuta', {
      storage: diskStorage({
        destination: './uploads/ricevute',
        filename: safeFilename,
      }),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1, // Solo un file alla volta
      },
      fileFilter,
    }),
  )
  create(
    @Body() createPagamentoDto: CreatePagamentoDto,
    @UploadedFile() file?: MulterFile,
  ) {
    if (file) {
      // Salva solo il filename, non il path completo (sicurezza)
      createPagamentoDto.ricevutaFile = file.filename;
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
