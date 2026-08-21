import { apiRequest } from "./apiClient";

const LICENSE_API_URL =
  import.meta.env.VITE_LICENSE_API_URL ?? "http://localhost:5260/api/License";

export type LicenseDto = {
  licenseId: number;
  product: string;
  plan: string;
  status: "active" | "suspended" | "expired" | "revoked" | string;
  maxDevices: number;
  expiresAt?: string | null;
  lastValidatedAt: string;
  graceUntil: string;
};

export const licenseService = {
  async get() {
    const response = await apiRequest<LicenseDto>(LICENSE_API_URL);
    return response.data;
  },
};
