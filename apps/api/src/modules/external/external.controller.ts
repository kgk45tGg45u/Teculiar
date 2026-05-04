import { Body, Controller, Post } from "@nestjs/common";
import { ExternalService } from "./external.service";

@Controller("external")
export class ExternalController {
  constructor(private readonly external: ExternalService) {}

  @Post("domains/search")
  searchDomain(@Body("domain") domain: string) {
    return this.external.resellBiz.search(domain);
  }

  @Post("domains/register")
  registerDomain(@Body() body: { domain: string; years: number; contactId: string }) {
    return this.external.resellBiz.register(body.domain, body.years, body.contactId);
  }

  @Post("hosting/provision")
  provisionHosting(@Body() body: { serviceId: string; productType: string; options: Record<string, unknown> }) {
    return this.external.hostingProvider(body.productType).provision({
      serviceId: body.serviceId,
      productType: body.productType,
      options: body.options
    });
  }

  @Post("servers/provision")
  provisionServer(@Body() body: { serviceId: string; options: Record<string, unknown> }) {
    return this.external.hetzner.provision({
      serviceId: body.serviceId,
      productType: "DEDICATED_SERVER",
      options: body.options
    });
  }
}
