"use client";

import { create } from "zustand";

export type ServiceStatus = "active" | "provisioning" | "suspended" | "cancelled";

export type PortalService = {
  id: string;
  name: string;
  kind: string;
  status: ServiceStatus;
  renewsAt: string;
};

type PortalState = {
  services: PortalService[];
  restartService: (id: string) => void;
  cancelService: (id: string) => void;
};

export const usePortalStore = create<PortalState>((set) => ({
  services: [
    {
      id: "svc_vps_01",
      name: "Cloud VPS Start",
      kind: "VPS",
      status: "active",
      renewsAt: "2026-06-01"
    },
    {
      id: "svc_nc_01",
      name: "Nextcloud Team",
      kind: "Nextcloud",
      status: "provisioning",
      renewsAt: "2026-05-18"
    },
    {
      id: "svc_domain_01",
      name: "crimson-grid.de",
      kind: "Domain",
      status: "active",
      renewsAt: "2027-05-03"
    }
  ],
  restartService: (id) =>
    set((state) => ({
      services: state.services.map((service) =>
        service.id === id ? { ...service, status: "provisioning" } : service
      )
    })),
  cancelService: (id) =>
    set((state) => ({
      services: state.services.map((service) =>
        service.id === id ? { ...service, status: "cancelled" } : service
      )
    }))
}));
