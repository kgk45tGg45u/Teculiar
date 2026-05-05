import { Module } from "@nestjs/common";
import { VirtualminClientController } from "./virtualmin-client.controller";
import { VirtualminClientService } from "./virtualmin-client.service";

@Module({
  controllers: [VirtualminClientController],
  providers: [VirtualminClientService]
})
export class VirtualminClientModule {}
