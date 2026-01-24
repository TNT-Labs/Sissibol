import { Module } from '@nestjs/common';
import { PagamentiService } from './pagamenti.service';
import { PagamentiController } from './pagamenti.controller';

@Module({
  controllers: [PagamentiController],
  providers: [PagamentiService],
})
export class PagamentiModule {}
