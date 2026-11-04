import { OrderItem, PurchaseOrder } from '../types/procurement';
import { ProcureCartItem } from './req003';
import { fmtDate } from '../utils/formatters';
import { orderStatusKey } from '../operations/orderOps';

export interface ProcurementExportRow {
  orderId: string;
  date: string;
  requester: string;
  station: string;
  name: string;
  qty: number;
  received: number;
  unitCost: number;
  amount: number;
  status: string;
  reason: string;
  link: string;
}

/** Shared by the detail view and both exports, including pre-line-item records. */
export function purchaseOrderItems(order: PurchaseOrder): OrderItem[] {
  if (order.items?.length) return order.items;
  return [{
    id: order.id || order.orderId,
    name: order.name || '',
    qty: order.qty ?? 1,
    unitCost: order.cost ?? 0,
    receivedQty: orderStatusKey(order.status) === 'received' ? order.qty ?? 1 : 0,
    status: orderStatusKey(order.status) === 'received' ? 'Received' : 'Pending',
  }];
}

export function unitCost(item: OrderItem): number {
  return item.unitCost ?? item.unitPrice ?? item.cost ?? 0;
}

export function lineAmount(qty: number, cost: number): number {
  const cents = qty * cost * 100;
  return Math.round(cents + Number.EPSILON * Math.abs(cents)) / 100;
}

export function purchaseOrderRows(order: PurchaseOrder, indexes?: ReadonlySet<number>): ProcurementExportRow[] {
  return purchaseOrderItems(order).flatMap((item, index) => indexes && !indexes.has(index) ? [] : [{
    orderId: order.orderId,
    date: fmtDate(order.createdAt || order.orderDate || order.date),
    requester: order.requester || '',
    station: [order.workstation, order.workpost].filter(Boolean).join(' / '),
    name: item.name,
    qty: item.qty,
    received: item.receivedQty ?? 0,
    unitCost: unitCost(item),
    amount: lineAmount(item.qty, unitCost(item)),
    status: item.status || order.status,
    reason: item.rejectReason || item.reason || '',
    link: item.link || '',
  }]);
}

export function cartRows(items: ProcureCartItem[], requester: string, station: string): ProcurementExportRow[] {
  return items.map(item => ({
    orderId: '', date: fmtDate(new Date().toISOString()), requester, station,
    name: item.name, qty: item.qty, received: 0, unitCost: item.unitCost ?? item.cost,
    amount: lineAmount(item.qty, item.unitCost ?? item.cost), status: 'Draft',
    reason: item.reason, link: item.link || '',
  }));
}

