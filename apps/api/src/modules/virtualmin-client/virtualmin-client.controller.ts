import { Body, Controller, Get, Header, Post } from "@nestjs/common";
import { renderVirtualminPage } from "./virtualmin-page";
import { VirtualminClientService } from "./virtualmin-client.service";
import type { VirtualminCredentials, VirtualminFormState } from "./virtualmin-types";

type ClientBody = Record<string, string | undefined>;

@Controller("virtualmin-client")
export class VirtualminClientController {
  constructor(private readonly service: VirtualminClientService) {}

  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  showForm() {
    return renderVirtualminPage({
      form: {
        allowSelfSigned: true,
        endpoint: process.env.VIRTUALMIN_API_URL ?? "https://your-panel-host:10000"
      }
    });
  }

  @Post()
  @Header("Content-Type", "text/html; charset=utf-8")
  async submit(@Body() body: ClientBody) {
    const form = bodyToForm(body);
    const missing = missingFields(form);

    if (missing) {
      return renderVirtualminPage({ form, notice: `Missing: ${missing}` });
    }

    const credentials = formToCredentials(form);

    try {
      const action = await this.service.runAction(credentials, body);
      const report = await this.service.loadReport(credentials, form.domain ?? "");
      const notice = action ? `${action.program}: ${action.message ?? (action.ok ? "done" : "failed")}` : undefined;

      return renderVirtualminPage({ form, notice, report });
    } catch (error) {
      return renderVirtualminPage({
        form,
        notice: error instanceof Error ? error.message : "Virtualmin request failed"
      });
    }
  }
}

function bodyToForm(body: ClientBody): VirtualminFormState {
  return {
    allowSelfSigned: body.allowSelfSigned === "1" || body.allowSelfSigned === "on",
    domain: body.domain?.trim(),
    endpoint: body.endpoint?.trim(),
    password: body.password,
    username: body.username?.trim()
  };
}

function formToCredentials(form: VirtualminFormState): VirtualminCredentials {
  return {
    allowSelfSigned: form.allowSelfSigned,
    endpoint: form.endpoint ?? "",
    password: form.password ?? "",
    username: form.username ?? ""
  };
}

function missingFields(form: VirtualminFormState): string | undefined {
  const missing = ["endpoint", "domain", "username", "password"].filter((key) => !form[key as keyof VirtualminFormState]);
  return missing.length > 0 ? missing.join(", ") : undefined;
}
