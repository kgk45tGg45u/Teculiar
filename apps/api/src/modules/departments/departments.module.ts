import { Module } from "@nestjs/common";
import { DepartmentsController } from "./departments.controller";
import { DepartmentsRepository } from "./departments.repository";
import { DepartmentsService } from "./departments.service";

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsService, DepartmentsRepository],
  exports: [DepartmentsService, DepartmentsRepository]
})
export class DepartmentsModule {}
