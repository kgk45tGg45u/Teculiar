import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { KnowledgebaseAdminController, KnowledgebaseController } from "./knowledgebase.controller";
import { KnowledgebaseRepository } from "./knowledgebase.repository";
import { KnowledgebaseService } from "./knowledgebase.service";

@Module({
  controllers: [KnowledgebaseController, KnowledgebaseAdminController],
  imports: [PrismaModule],
  providers: [KnowledgebaseRepository, KnowledgebaseService]
})
export class KnowledgebaseModule {}
