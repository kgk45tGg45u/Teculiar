/**
 * High-level checkout building blocks shared by every order spec. Drives the
 * exact same endpoints the storefront UI calls (POST /orders/checkout, then
 * POST /orders/:id/pay) but with the deterministic sandbox payment method
 * (paymentMethodId="sandbox" forces synchronous success — see abstract-payment.service).
 *
 * Hosting orders register their domain for Virtualmin teardown immediately after
 * checkout, so a created account is always cleaned up even if later asserts throw.
 */
import type { ApiClient, CheckoutResult, Invoice, OrderItem } from "../helpers/api-client";
import { CustomerFactory, type Customer } from "../factories/customer.factory";
import { DomainFactory, type DomainScenario, type GeneratedDomain } from "../factories/domain.factory";
import { OrderFactory } from "../factories/order.factory";
import { pollUntil } from "../helpers/polling";
import { withHostingProvisionGate } from "../helpers/provision-gate";
import { confirmHostingProvisioned } from "./provisioning.flow";
import type { Catalog } from "./catalog.flow";

export type CheckoutDeps = {
  anonApi: ApiClient;            // no token — used for new-customer checkout/pay
  makeApi: () => ApiClient;      // fresh ApiClient (own token)
  catalog: Catalog;
  registerTeardownDomain: (domain: string) => void;
};

export type Buyer =
  | { kind: "new"; customer?: Partial<Customer> }
  | { kind: "existing"; api: ApiClient; email: string };

export type OrderResult = {
  customer: Customer;
  clientApi: ApiClient;          // authenticated as the buyer
  items: OrderItem[];
  checkout: CheckoutResult;
  paidInvoice: Invoice;
  invoiceId: string;
  orderId: string;
};

const SANDBOX = { method: "CREDIT_CARD", paymentMethodId: "sandbox" };

function buildCustomer(buyer: Buyer): Customer {
  if (buyer.kind === "existing") {
    return CustomerFactory.build({ email: buyer.email });
  }
  return CustomerFactory.build(buyer.customer);
}

function buyerApi(deps: CheckoutDeps, buyer: Buyer): ApiClient {
  return buyer.kind === "existing" ? buyer.api : deps.anonApi;
}

async function authenticate(deps: CheckoutDeps, buyer: Buyer, customer: Customer): Promise<ApiClient> {
  if (buyer.kind === "existing") return buyer.api;
  // New customer was materialised during payment — log in to get a portal session.
  const api = deps.makeApi();
  await pollUntil(
    async () => {
      try {
        await api.login(customer.email, customer.password);
        return true;
      } catch {
        return false;
      }
    },
    (ok) => ok,
    { description: `login new customer ${customer.email}`, timeoutMs: 30_000, intervalMs: 3_000 }
  );
  return api;
}

async function placeAndPay(deps: CheckoutDeps, buyer: Buyer, customer: Customer, items: OrderItem[]): Promise<OrderResult> {
  const api = buyerApi(deps, buyer);
  const checkout = await api.checkout(items, CustomerFactory.toCheckoutCustomer(customer));
  const pay = await api.payOrder(checkout.order.id, SANDBOX.method, SANDBOX.paymentMethodId);
  const clientApi = await authenticate(deps, buyer, customer);
  return {
    customer,
    clientApi,
    items,
    checkout,
    paidInvoice: pay.invoice,
    invoiceId: checkout.invoice.id,
    orderId: pay.order.id
  };
}

/** Place + pay a hosting order for one of the domain scenarios. */
export async function hostingOrder(
  deps: CheckoutDeps,
  opts: {
    buyer: Buyer;
    scenario: DomainScenario;
    hostingProduct?: Catalog["hosting"];
    billingCycle?: string;
    transferAuthCode?: string;
    /** Force a specific hosting domain (e.g. to host an already-registered domain). */
    hostingDomain?: string;
  }
): Promise<OrderResult & { hostingDomain: string; domain?: GeneratedDomain }> {
  const customer = buildCustomer(opts.buyer);
  const hostingProduct = opts.hostingProduct ?? deps.catalog.hosting;
  const generated = opts.scenario === "register" || opts.scenario === "transfer" ? DomainFactory.build(opts.scenario) : undefined;
  const hostingDomain = opts.hostingDomain ?? generated?.name ?? DomainFactory.hostingName();

  const items = OrderFactory.hosting({
    hostingProduct,
    billingCycle: opts.billingCycle,
    hostingDomain,
    scenario: opts.scenario,
    domainProduct: deps.catalog.domain,
    transferAuthCode: generated?.transferAuthCode ?? opts.transferAuthCode
  });

  // Any successful hosting payment creates a Virtualmin account for hostingDomain.
  // Register it now so teardown runs even if assertions below fail.
  deps.registerTeardownDomain(hostingDomain);

  const api = buyerApi(deps, opts.buyer);
  const checkout = await api.checkout(items, CustomerFactory.toCheckoutCustomer(customer));

  // Hold the global provisioning gate across the ENTIRE create: pay → wait until the
  // Virtualmin account is ACTIVE → settle. This guarantees the server never runs two
  // create-domain operations at once (which corrupts its Apache config), even back-to-back.
  let pay!: { invoice: Invoice; order: { id: string } };
  let clientApi!: ApiClient;
  await withHostingProvisionGate(async () => {
    pay = await api.payOrder(checkout.order.id, SANDBOX.method, SANDBOX.paymentMethodId);
    clientApi = await authenticate(deps, opts.buyer, customer);
    await confirmHostingProvisioned(clientApi, hostingDomain);
  });

  return {
    customer,
    clientApi,
    items,
    checkout,
    paidInvoice: pay.invoice,
    invoiceId: checkout.invoice.id,
    orderId: pay.order.id,
    hostingDomain,
    domain: generated
  };
}

/** Place + pay a VPS order (no domain). */
export async function vpsOrder(deps: CheckoutDeps, opts: { buyer: Buyer; billingCycle?: string }): Promise<OrderResult> {
  if (!deps.catalog.vps) throw new Error("No VPS product available in catalogue");
  const customer = buildCustomer(opts.buyer);
  const items = OrderFactory.vps({ vpsProduct: deps.catalog.vps, billingCycle: opts.billingCycle });
  return placeAndPay(deps, opts.buyer, customer, items);
}

/** Place + pay a domain-only order (register or transfer). */
export async function domainOnlyOrder(
  deps: CheckoutDeps,
  opts: { buyer: Buyer; action: Extract<DomainScenario, "register" | "transfer"> }
): Promise<OrderResult & { domain: GeneratedDomain }> {
  const customer = buildCustomer(opts.buyer);
  const domain = DomainFactory.build(opts.action);
  const items = OrderFactory.domainOnly({ domainProduct: deps.catalog.domain, domain });
  const result = await placeAndPay(deps, opts.buyer, customer, items);
  return { ...result, domain };
}
