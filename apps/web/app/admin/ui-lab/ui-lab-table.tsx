"use client";

import { Download, Trash2 } from "lucide-react";
import { Button } from "@teculiar/web-core/components/ui/button";
import { DataTable, type DataTableColumn } from "@teculiar/web-core/components/ui/data-table";
import { StatusBadge } from "@teculiar/web-core/components/ui/status-badge";

type DemoInvoice = {
  id: string;
  number: string;
  client: string;
  status: string;
  amount: string;
  created: string;
  due: string;
};

const ROWS: DemoInvoice[] = [
  { id: "1", number: "N-100244", client: "acme@example.com", status: "PAID", amount: "49,00 €", created: "01.07.2026", due: "15.07.2026" },
  { id: "2", number: "N-100245", client: "studio@example.com", status: "PENDING", amount: "129,00 €", created: "03.07.2026", due: "17.07.2026" },
  { id: "3", number: "N-100246", client: "meine@example.com", status: "OVERDUE", amount: "15,77 €", created: "09.06.2026", due: "23.06.2026" },
  { id: "4", number: "N-100247", client: "web@example.com", status: "FAILED", amount: "89,50 €", created: "12.07.2026", due: "26.07.2026" }
];

const COLUMNS: DataTableColumn<DemoInvoice>[] = [
  { key: "number", header: "Invoice", render: (r) => <strong>{r.number}</strong> },
  { key: "client", header: "Client", render: (r) => r.client, truncate: true },
  { key: "status", header: "Status", render: (r) => <StatusBadge label={r.status} status={r.status} />, priority: 2 },
  { key: "amount", header: "Amount", render: (r) => r.amount, align: "right", priority: 2 },
  { key: "created", header: "Created", render: (r) => r.created, priority: 3 },
  { key: "due", header: "Due", render: (r) => r.due, priority: 3 },
  {
    key: "actions",
    header: "",
    align: "right",
    render: () => (
      <span style={{ display: "inline-flex", gap: 6 }}>
        <Button icon={Download} iconOnly size="sm" title="PDF" variant="secondary">PDF</Button>
        <Button icon={Trash2} iconOnly size="sm" title="Delete" variant="danger">Delete</Button>
      </span>
    )
  }
];

export function UiLabDataTable() {
  return <DataTable columns={COLUMNS} rowKey={(r) => r.id} rows={ROWS} />;
}
