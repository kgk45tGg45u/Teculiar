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
    return this.external.resellBiz.register({
      contactId: body.contactId,
      domain: body.domain,
      years: body.years
    });
  }

  @Post("domains/transfer")
  transferDomain(@Body() body: { authCode: string; contactId: string; domain: string; years: number }) {
    return this.external.resellBiz.transfer({
      authCode: body.authCode,
      contactId: body.contactId,
      domain: body.domain,
      years: body.years
    });
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
