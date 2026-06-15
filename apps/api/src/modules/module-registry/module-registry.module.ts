import { Global, Module } from "@nestjs/common";
import { ModuleRegistryService } from "./module-registry.service";

// Global so providers, billing, cron and orders can all inject the registry without import churn.
@Global()
@Module({
  providers: [ModuleRegistryService],
  exports: [ModuleRegistryService]
})
export class ModuleRegistryModule {}
