import { PurchaseOrder, OrderItem, PurchaseOrderStatus } from '../types/procurement';
import { Tool } from '../types/inventory';
import { Store } from '../storage/store';
import { nowISO } from '../utils/formatters';

export function orderStatusKey(status?: string): 'open' | 'partial' | 'received' | 'cancelled' {
  const value = String(status || '').toLowerCase();
  return value === 'received' || value === 'partial' || value === 'cancelled' ? value : 'open';
}

export function normalizeOrderItems(order: PurchaseOrder): void {
  if (!order.items?.length && order.name) {
    order.items = [{ id: order.id || order.orderId, name: order.name, qty: order.qty ?? 1,
      unitCost: order.cost ?? 0, status: orderStatusKey(order.status) === 'received' ? 'Received' : orderStatusKey(order.status) === 'cancelled' ? 'Cancelled' : 'Pending',
      receivedQty: orderStatusKey(order.status) === 'received' ? order.qty ?? 1 : 0 }];
  }
  order.items ??= [];
  order.items.forEach((item, index) => {
    item.id ||= `${order.orderId}-${index + 1}`;
    item.receivedQty ??= 0;
    item.status ??= 'Pending';
  });
}

export function recalcOrderStatus(orderId: string): PurchaseOrderStatus {
  const order = Store.procurementLog.find(o => o.orderId === orderId || o.id === orderId);
  if (!order?.items?.length) return order?.status || 'Draft';
  const active = order.items.filter(item => orderStatusKey(item.status) !== 'cancelled');
  order.status = active.length === 0 ? 'Cancelled'
    : active.every(item => (item.receivedQty ?? 0) >= item.qty) ? 'Received'
    : order.items.some(item => (item.receivedQty ?? 0) > 0) ? 'Partial' : 'Ordered';
  order.updatedAt = nowISO();
  return order.status;
}

let pendingMutation: Promise<unknown> = Promise.resolve();
/** Serialize order changes and roll memory back when the single IndexedDB commit fails. */
function mutate<T>(work: () => T | Promise<T>): Promise<T> {
  const next = pendingMutation.then(async () => {
    const before = structuredClone({ orders: Store.procurementLog, tools: Store.tools, audit: Store.auditLog });
    try { return await work(); }
    catch (error) {
      Store.procurementLog = before.orders;
      Store.tools = before.tools;
      Store.auditLog = before.audit;
      throw error;
    }
  });
  pendingMutation = next.catch(() => undefined);
  return next;
}

export function createPurchaseOrder(supplier: string,
  items: Omit<OrderItem, 'id' | 'status' | 'receivedQty'>[], notes = ''): Promise<PurchaseOrder> {
  return mutate(async () => {
    if (!items.length || items.some(item => !Number.isInteger(item.qty) || item.qty <= 0
      || !Number.isFinite(item.unitCost ?? item.unitPrice ?? item.cost ?? 0)
      || (item.unitCost ?? item.unitPrice ?? item.cost ?? 0) < 0)) throw new Error('Invalid order items');
    const orderId = `PO-${crypto.randomUUID()}`;
    const formattedItems: OrderItem[] = items.map((item, index) => ({ ...item, id: `${orderId}-${index + 1}`, receivedQty: 0, status: 'Pending' }));
    const order: PurchaseOrder = { id: orderId, orderId, date: nowISO().slice(0, 10), supplier,
      items: formattedItems, total: formattedItems.reduce((sum, item) => sum + Math.round(item.qty * (item.unitCost ?? item.unitPrice ?? item.cost ?? 0) * 100), 0) / 100,
      status: 'Submitted', notes, history: [`${nowISO().slice(0, 16)} | Order submitted for ${supplier}`], updatedAt: nowISO() };
    Store.procurementLog.push(order);
    Store.log('ORDER_CREATE', `${orderId} (${supplier}) - Total: $${order.total.toFixed(2)}`);
    await Store.save();
    return order;
  });
}

function applyReceive(order: PurchaseOrder, item: OrderItem, amount: number, targetToolId?: string): boolean {
  if (orderStatusKey(order.status) === 'cancelled' || orderStatusKey(item.status) === 'cancelled'
    || !Number.isInteger(amount) || amount <= 0 || !Number.isInteger(item.qty) || item.qty <= 0) return false;
  const remaining = item.qty - (item.receivedQty ?? 0);
  const actual = Math.min(amount, remaining);
  if (!Number.isInteger(actual) || actual <= 0) return false;
  if (targetToolId) {
    const existing = Store.getTool(targetToolId);
    if (existing) {
      if (['Retired', 'Decommissioned'].includes(existing.status) || !Number.isFinite(existing.qty ?? 0)) return false;
      existing.qty = (existing.qty ?? 0) + actual;
      Store.toolEvent(existing, `Stock replenished +${actual} from order ${order.orderId}`);
    } else {
      const tool: Tool = { id: targetToolId, name: item.name, qty: actual,
        serialNumber: `SN-${crypto.randomUUID().slice(0, 8)}`, status: 'Active', category: item.category || 'Hand Tools', type: 'Permanent', location: 'Main Store',
        history: [`${nowISO().slice(0, 16)} | Commissioned from order ${order.orderId}`] };
      Store.touch(tool);
      Store.tools.push(tool);
    }
  }
  item.receivedQty = (item.receivedQty ?? 0) + actual;
  item.status = item.receivedQty >= item.qty ? 'Received' : 'Partial';
  Store.log('ORDER_ITEM_RECEIVE', `${order.orderId} -> ${item.id} qty: ${actual}`);
  return true;
}

export function receiveOrderItem(orderId: string, itemId: string, qtyToReceive: number, targetToolId?: string): Promise<boolean> {
  return mutate(async () => {
    const order = Store.procurementLog.find(o => o.orderId === orderId || o.id === orderId);
    if (!order || !Number.isInteger(qtyToReceive) || qtyToReceive <= 0 || orderStatusKey(order.status) === 'cancelled') return false;
    normalizeOrderItems(order);
    const item = order.items!.find(value => value.id === itemId);
    if (!item || !applyReceive(order, item, qtyToReceive, targetToolId ?? item.toolId)) return false;
    recalcOrderStatus(order.orderId);
    await Store.save();
    return true;
  });
}

export function rejectOrderItem(orderId: string, itemId: string, reason: string): Promise<boolean> {
  return mutate(async () => {
    const order = Store.procurementLog.find(o => o.orderId === orderId || o.id === orderId);
    if (!order || !reason.trim() || orderStatusKey(order.status) === 'cancelled') return false;
    normalizeOrderItems(order);
    const item = order.items!.find(value => value.id === itemId);
    if (!item || orderStatusKey(item.status) === 'cancelled' || (item.receivedQty ?? 0) >= item.qty) return false;
    item.status = 'Cancelled'; item.rejectReason = reason.trim(); item.cancelledAt = nowISO();
    Store.log('ORDER_ITEM_REJECT', `${orderId} -> ${itemId} reason: ${reason}`);
    recalcOrderStatus(order.orderId);
    await Store.save();
    return true;
  });
}

export function receiveFullOrder(orderId: string): Promise<boolean> {
  return mutate(async () => {
    const order = Store.procurementLog.find(o => o.orderId === orderId || o.id === orderId);
    if (!order || orderStatusKey(order.status) === 'cancelled') return false;
    normalizeOrderItems(order);
    const remaining = order.items!.filter(item => orderStatusKey(item.status) !== 'cancelled' && (item.receivedQty ?? 0) < item.qty);
    if (remaining.some(item => !Number.isInteger(item.qty) || item.qty <= 0)) return false;
    for (const item of remaining) {
      if (!applyReceive(order, item, item.qty - (item.receivedQty ?? 0), item.toolId)) throw new Error('Could not receive complete order');
    }
    recalcOrderStatus(order.orderId);
    await Store.save();
    return true;
  });
}

export function cancelOrder(orderId: string): Promise<boolean> {
  return mutate(async () => {
    const order = Store.procurementLog.find(o => o.orderId === orderId || o.id === orderId);
    if (!order || orderStatusKey(order.status) === 'received' || orderStatusKey(order.status) === 'cancelled') return false;
    normalizeOrderItems(order);
    order.status = 'Cancelled'; order.updatedAt = nowISO();
    order.items!.forEach(item => { if (orderStatusKey(item.status) !== 'received') { item.status = 'Cancelled'; item.cancelledAt = nowISO(); } });
    Store.log('ORDER_CANCEL', `Order ${orderId} cancelled`);
    await Store.save();
    return true;
  });
}

export function addOrderComment(orderId: string, text: string, author = Store.actor.username): Promise<boolean> {
  return mutate(async () => {
    const order = Store.procurementLog.find(o => o.orderId === orderId || o.id === orderId);
    if (!order || !text.trim()) return false;
    (order.comments ??= []).push({ author, text: text.trim(), ts: nowISO() });
    order.updatedAt = nowISO();
    await Store.save();
    return true;
  });
}
