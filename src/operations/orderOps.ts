import { PurchaseOrder, OrderItem, PurchaseOrderStatus } from '../types/procurement';
import { Tool } from '../types/inventory';
import { Store } from '../storage/store';
import { nowISO } from '../utils/formatters';

export function normalizeOrderItems(order: PurchaseOrder): void {
  if (!Array.isArray(order.items)) {
    order.items = [];
  }
  order.items.forEach((item, idx) => {
    if (!item.id) {
      item.id = `item_${idx + 1}_${Math.random().toString(36).slice(2, 6)}`;
    }
    if (item.receivedQty === undefined) {
      item.receivedQty = 0;
    }
    if (!item.status) {
      item.status = 'Pending';
    }
  });
}

export function recalcOrderStatus(orderId: string): PurchaseOrderStatus {
  const order = Store.procurementLog.find(l => l.orderId === orderId || l.id === orderId);
  if (!order || !order.items || !order.items.length) return 'Draft';

  let allReceived = true;
  let hasPartial = false;
  let allCancelled = true;

  for (const it of order.items) {
    if (it.status !== 'Cancelled') {
      allCancelled = false;
    }
    if (it.status === 'Partial' || ((it.receivedQty || 0) > 0 && (it.receivedQty || 0) < it.qty)) {
      hasPartial = true;
      allReceived = false;
    } else if (it.status !== 'Received') {
      allReceived = false;
    }
  }

  if (allCancelled) {
    order.status = 'Cancelled';
  } else if (allReceived) {
    order.status = 'Received';
  } else if (hasPartial) {
    order.status = 'Partial';
  } else {
    order.status = 'Ordered';
  }

  order.updatedAt = nowISO();
  return order.status;
}

export async function createPurchaseOrder(
  supplier: string,
  items: Omit<OrderItem, 'id' | 'status' | 'receivedQty'>[],
  notes: string = ''
): Promise<PurchaseOrder> {
  const orderNum = Math.floor(1000 + Math.random() * 9000);
  const orderId = `PO-${new Date().getFullYear()}-${orderNum}`;

  const formattedItems: OrderItem[] = items.map((it, idx) => ({
    ...it,
    id: `item_${idx + 1}_${Math.random().toString(36).slice(2, 6)}`,
    receivedQty: 0,
    status: 'Pending',
  }));

  const total = formattedItems.reduce((sum, it) => sum + (it.total ?? ((it.qty || 1) * (it.unitCost ?? it.unitPrice ?? 0))), 0);

  const newOrder: PurchaseOrder = {
    id: orderId,
    orderId,
    date: nowISO().split('T')[0],
    supplier,
    items: formattedItems,
    total,
    status: 'Submitted',
    notes,
    history: [`${nowISO().slice(0, 16)} | Order submitted for ${supplier}`],
    updatedAt: nowISO(),
  };

  Store.procurementLog.unshift(newOrder);
  Store.log('ORDER_CREATE', `${orderId} (${supplier}) - Total: $${total.toFixed(2)}`);
  await Store.save();

  return newOrder;
}

export async function receiveOrderItem(
  orderId: string,
  itemId: string,
  qtyToReceive: number,
  targetToolId?: string
): Promise<boolean> {
  const order = Store.procurementLog.find(l => l.orderId === orderId || l.id === orderId);
  if (!order) return false;
  normalizeOrderItems(order);
  const items = order.items || [];
  const item = items.find(i => i.id === itemId);
  if (!item) return false;

  const remaining = item.qty - (item.receivedQty || 0);
  const actualReceive = Math.min(qtyToReceive, remaining);
  if (actualReceive <= 0) return false;

  if (targetToolId) {
    const existingTool = Store.getTool(targetToolId);
    if (existingTool) {
      existingTool.qty = (existingTool.qty || 0) + actualReceive;
      Store.touch(existingTool);
      Store.toolEvent(existingTool, `Stock replenished +${actualReceive} from order ${orderId}`);
    } else {
      const newTool: Tool = {
        id: targetToolId,
        name: item.name,
        qty: actualReceive,
        serialNumber: 'SN-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
        status: 'Active',
        category: item.category || 'Hand Tools',
        type: 'Permanent',
        location: 'Main Store',
        history: [`${nowISO().slice(0, 16)} | Commissioned from order ${orderId}`],
      };
      Store.touch(newTool);
      Store.tools.push(newTool);
    }
  }

  item.receivedQty = (item.receivedQty || 0) + actualReceive;
  if (item.receivedQty >= item.qty) {
    item.status = 'Received';
  } else {
    item.status = 'Partial';
  }

  Store.log('ORDER_ITEM_RECEIVE', `${orderId} -> ${itemId} qty: ${actualReceive}`);
  recalcOrderStatus(orderId);
  await Store.save();

  return true;
}

export async function rejectOrderItem(
  orderId: string,
  itemId: string,
  reason: string
): Promise<boolean> {
  const order = Store.procurementLog.find(l => l.orderId === orderId || l.id === orderId);
  if (!order) return false;
  normalizeOrderItems(order);
  const items = order.items || [];
  const item = items.find(i => i.id === itemId);
  if (!item) return false;

  item.status = 'Cancelled';
  (item as any).rejectReason = reason;
  (item as any).cancelledAt = nowISO();

  Store.log('ORDER_ITEM_REJECT', `${orderId} -> ${itemId} reason: ${reason}`);
  recalcOrderStatus(orderId);
  await Store.save();

  return true;
}

export async function receiveFullOrder(orderId: string): Promise<boolean> {
  const order = Store.procurementLog.find(l => l.orderId === orderId || l.id === orderId);
  if (!order) return false;
  normalizeOrderItems(order);
  const items = order.items || [];

  for (const item of items) {
    if (item.status !== 'Received' && item.status !== 'Cancelled') {
      await receiveOrderItem(orderId, item.id, item.qty - (item.receivedQty || 0));
    }
  }

  order.status = 'Received';
  await Store.save();
  return true;
}

export async function cancelOrder(orderId: string): Promise<boolean> {
  const order = Store.procurementLog.find(l => l.orderId === orderId || l.id === orderId);
  if (!order) return false;

  order.status = 'Cancelled';
  if (Array.isArray(order.items)) {
    order.items.forEach(i => {
      if (i.status !== 'Received') i.status = 'Cancelled';
    });
  }
  Store.log('ORDER_CANCEL', `Order ${orderId} cancelled`);
  await Store.save();
  return true;
}

export async function addOrderComment(orderId: string, text: string, author: string = 'Operator'): Promise<boolean> {
  const order = Store.procurementLog.find(l => l.orderId === orderId || l.id === orderId);
  if (!order) return false;

  if (!Array.isArray(order.comments)) {
    order.comments = [];
  }

  order.comments.push({
    author,
    text,
    ts: nowISO()
  });

  await Store.save();
  return true;
}
