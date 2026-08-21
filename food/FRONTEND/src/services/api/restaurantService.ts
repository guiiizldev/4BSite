import { apiRequest } from "./apiClient";

const RESTAURANT_API_URL = import.meta.env.VITE_RESTAURANT_API_URL ?? "/api/restaurant";

export type RestaurantTable = {
  id: string;
  name: string;
  capacity: number;
  status: "available" | "occupied" | "reserved" | "inactive";
  openTabId?: string | null;
  openTabNumber?: number | null;
  customerName?: string | null;
  guestCount?: number | null;
  openedAt?: string | null;
  total: number;
};

export type RestaurantTabItem = {
  id: string;
  productId?: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  status: "pending" | "preparing" | "ready" | "delivered" | "cancelled";
  notes: string;
  createdAt: string;
};

export type RestaurantTab = {
  id: string;
  number: number;
  tableId?: string | null;
  tableName: string;
  customerName: string;
  guestCount: number;
  status: string;
  notes: string;
  openedByName: string;
  openedAt: string;
  closedAt?: string | null;
  total: number;
  items: RestaurantTabItem[];
};

export const restaurantService = {
  async listTables() {
    const response = await apiRequest<RestaurantTable[]>(`${RESTAURANT_API_URL}/tables`);
    return response.data ?? [];
  },
  async createTable(name: string, capacity: number) {
    const response = await apiRequest<RestaurantTable>(`${RESTAURANT_API_URL}/tables`, {
      method: "POST",
      body: JSON.stringify({ name, capacity }),
    });
    return response.data;
  },
  async openTab(tableId: string, customerName: string, guestCount: number, notes: string) {
    const response = await apiRequest<RestaurantTab>(`${RESTAURANT_API_URL}/tabs/open`, {
      method: "POST",
      body: JSON.stringify({ tableId, customerName, guestCount, notes }),
    });
    return response.data;
  },
  async getTab(tabId: string) {
    const response = await apiRequest<RestaurantTab>(`${RESTAURANT_API_URL}/tabs/${tabId}`);
    return response.data;
  },
  async addItem(tabId: string, productId: string, quantity: number, notes: string) {
    const response = await apiRequest<RestaurantTab>(`${RESTAURANT_API_URL}/tabs/${tabId}/items`, {
      method: "POST",
      body: JSON.stringify({ productId, quantity, notes }),
    });
    return response.data;
  },
  async updateItemStatus(tabId: string, itemId: string, status: RestaurantTabItem["status"]) {
    const response = await apiRequest<RestaurantTab>(`${RESTAURANT_API_URL}/tabs/${tabId}/items/${itemId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    return response.data;
  },
  async closeTab(tabId: string) {
    const response = await apiRequest<RestaurantTab>(`${RESTAURANT_API_URL}/tabs/${tabId}/close`, { method: "POST" });
    return response.data;
  },
};
