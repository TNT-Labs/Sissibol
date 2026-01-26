import { Module } from '@nestjs/common';
import { PagamentiService } from './pagamenti.service';
import { PagamentiController } from './pagamenti.controller';
import { BolloModule } from '../bollo/bollo.module';

@Module({
  imports: [BolloModule],
  controllers: [PagamentiController],
  providers: [PagamentiService],
})
export class PagamentiModule {}
