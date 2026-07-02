"use client";

import type { CSSProperties } from "react";
import { ToastContainer, toast } from "react-toastify";

const toastColors = {
  error: "#b11226",
  info: "#2563eb",
  success: "#15803d",
  warning: "#b45309"
};

export function ToastProvider() {
  return (
    <ToastContainer
      autoClose={4500}
      closeOnClick
      newestOnTop
      pauseOnFocusLoss={false}
      position="top-right"
      toastClassName="dezhost-toast"
      style={{
        "--toastify-color-error": toastColors.error,
        "--toastify-color-info": toastColors.info,
        "--toastify-color-success": toastColors.success,
        "--toastify-color-warning": toastColors.warning
      } as CSSProperties}
    />
  );
}

export const notify = {
  error: (message: string) => toast.error(message),
  info: (message: string) => toast.info(message),
  success: (message: string) => toast.success(message),
  warning: (message: string) => toast.warning(message)
};

export async function responseMessage(response: Response, fallback: string) {
  const clone = response.clone();
  const payload = await clone.json().catch(() => null);
  if (payload && typeof payload.message === "string") {
    return payload.message;
  }
  if (typeof payload === "string" && payload) {
    return payload;
  }
  return (await response.text().catch(() => "")) || fallback;
}

export async function notifyResponse(response: Response, success: string, fallback: string) {
  const message = response.ok ? success : await responseMessage(response, fallback);
  if (response.ok) {
    notify.success(message);
  } else {
    notify.error(message);
  }
  return message;
}
