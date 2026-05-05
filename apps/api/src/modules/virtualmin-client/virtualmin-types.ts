export type VirtualminFields = Record<string, string>;

export interface VirtualminEntry {
  name: string;
  fields: VirtualminFields;
}

export interface VirtualminCredentials {
  endpoint: string;
  username: string;
  password: string;
  allowSelfSigned?: boolean;
}

export interface VirtualminCommandResult {
  entries: VirtualminEntry[];
  json?: unknown;
  message?: string;
  ok: boolean;
  program: string;
  text: string;
}

export interface VirtualminFormState {
  allowSelfSigned?: boolean;
  domain?: string;
  endpoint?: string;
  password?: string;
  username?: string;
}

export interface VirtualminReport {
  bandwidth: VirtualminEntry[];
  databases: VirtualminEntry[];
  domain: string;
  domainFields: VirtualminFields;
  errors: string[];
  mailboxes: VirtualminEntry[];
  webmailUrl: string;
}
