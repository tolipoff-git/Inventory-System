export type ToolType = 'Permanent' | 'Consumable';

export type ToolStatus =
  | 'Active'
  | 'Issued'
  | 'Backup'
  | 'Maintenance'
  | 'Overdue'
  | 'Decommissioned'
  | 'Pending Delivery'
  | 'Calibration';

export interface ToolAddress {
  zone?: string;
  rack?: string;
  shelf?: string;
  bin?: string;
}

export interface ToolAuditRecord {
  date: string;
  inspector: string;
  wear_pct: number;
  notes: string;
  result: 'PASS' | 'FAIL' | 'FLAG';
  photoId?: string;
}

export interface ToolPhoto {
  id: string;
  ts: string;
  url?: string;
  caption?: string;
}

export interface Tool {
  id: string;
  name: string;
  type: ToolType;
  category: string;
  location: string;
  status: ToolStatus;
  spec?: string;
  serialNumber?: string;
  sn?: string;
  article?: string;
  program?: string;
  assigneeId?: string | null;
  assignedAt?: string | null;
  dueReturn?: string | null;
  calDue?: string | null;
  history?: string[];
  photos?: ToolPhoto[];
  commissioned_date?: string;
  audit_history?: ToolAuditRecord[];
  photoId?: string | null;
  price?: number;
  qty?: number;
  minQty?: number;
  maxQty?: number;
  organizer?: boolean;
  address?: ToolAddress;
  updatedAt?: string;
}

export interface ToolClass {
  p: string;
  group: 'MECH' | 'EL' | 'MEAS' | 'CONS';
  en: string;
  ru: string;
  cat: string;
}

export interface ToolGroup {
  en: string;
  ru: string;
}
