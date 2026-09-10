export type OrderItemStatus =
  | 'Pending'
  | 'Partial'
  | 'Received'
  | 'Cancelled'
  | 'pending'
  | 'partial'
  | 'received'
  | 'cancelled';

export type PurchaseOrderStatus =
  | 'Draft'
  | 'Submitted'
  | 'Ordered'
  | 'Partial'
  | 'Received'
  | 'Cancelled'
  | 'open'
  | 'received'
  | 'cancelled'
  | 'partial'
  | 'pending';

export interface OrderItem {
  id: string;
  toolId?: string;
  name: string;
  category?: string;
  qty: number;
  receivedQty?: number;
  unitPrice?: number;
  unitCost?: number;
  cost?: number;
  total?: number;
  reason?: string;
  link?: string;
  status?: OrderItemStatus;
}

export interface OrderComment {
  author: string;
  text: string;
  ts: string;
}

export interface PurchaseOrder {
  id?: string;
  orderId: string;
  date?: string;
  orderDate?: string;
  createdAt?: string;
  supplier?: string;
  requester?: string;
  workstation?: string;
  workpost?: string;
  name?: string;
  qty?: number;
  cost?: number;
  items?: OrderItem[];
  total: number;
  status: PurchaseOrderStatus;
  notes?: string;
  comments?: OrderComment[];
  history?: string[];
  updatedAt?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
}
