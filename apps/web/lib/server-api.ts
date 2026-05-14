import { cookies } from "next/headers";
import { ADMIN_AUTH_COOKIE, API_BASE_URL } from "./api";

export async function apiGetAuth<T>(path: string): Promise<T | null> {
  try {
    const token = (await cookies()).get(ADMIN_AUTH_COOKIE)?.value;
    const response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}
