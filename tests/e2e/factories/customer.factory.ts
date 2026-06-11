/**
 * CustomerFactory — produces valid checkout customer payloads (new accounts) and
 * the matching UI form field map. Every field a domain registrant needs is
 * populated so the same customer works for hosting AND domain orders.
 */
import { uniqueEmail, token } from "../helpers/unique";

export type Customer = {
  name: string;
  email: string;
  password: string;
  customerType: "INDIVIDUAL" | "BUSINESS";
  companyName?: string;
  countryCode: string;
  vatId?: string;
  phone: string;
  phoneCountryCode: string;
  address: { line1: string; city: string; postalCode: string; state: string };
};

export const CustomerFactory = {
  /** A strong password (9–16 chars: upper, lower, digit, special) per platform rules. */
  password(): string {
    return `E2e!${token(5)}9Az`.slice(0, 16);
  },

  build(overrides: Partial<Customer> = {}): Customer {
    const business = overrides.customerType === "BUSINESS";
    return {
      name: "E2E Tester",
      email: uniqueEmail("e2e-customer"),
      password: CustomerFactory.password(),
      customerType: business ? "BUSINESS" : "INDIVIDUAL",
      companyName: business ? "E2E Test GmbH" : undefined,
      countryCode: "DE",
      vatId: business ? "DE123456789" : undefined,
      phone: "30 1234567",
      phoneCountryCode: "+49",
      address: { line1: "Teststraße 1", city: "Berlin", postalCode: "10115", state: "Berlin" },
      ...overrides
    };
  },

  /** Shape consumed by POST /orders/checkout (customer object). */
  toCheckoutCustomer(c: Customer): Record<string, unknown> & { email: string; name: string } {
    return {
      name: c.name,
      email: c.email,
      password: c.password,
      customerType: c.customerType,
      companyName: c.companyName,
      countryCode: c.countryCode,
      vatId: c.vatId,
      phone: `${c.phoneCountryCode} ${c.phone}`.trim(),
      address: { line1: c.address.line1, city: c.address.city, postalCode: c.address.postalCode, state: c.address.state }
    };
  },

  /** Field map for the storefront checkout form (input name -> value). */
  toFormFields(c: Customer): Record<string, string> {
    return {
      name: c.name,
      email: c.email,
      password: c.password,
      phoneCountryCode: c.phoneCountryCode,
      phone: c.phone,
      address: c.address.line1,
      postalCode: c.address.postalCode,
      city: c.address.city,
      state: c.address.state,
      ...(c.companyName ? { companyName: c.companyName } : {}),
      ...(c.vatId ? { vatId: c.vatId } : {})
    };
  }
};
