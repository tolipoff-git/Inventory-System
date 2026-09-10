import { ProcureCartItem, exportReq003Xlsx } from './req003';
import { createPurchaseOrder } from '../operations/orderOps';
import { downloadText } from '../utils/dom';
import { datedName } from '../utils/formatters';

class ProcurementCartManager {
  public currentToolId: string | null = null;
  public items: ProcureCartItem[] = [];

  public addItem(item: ProcureCartItem): void {
    this.items.push(item);
  }

  public removeItem(index: number): void {
    this.items.splice(index, 1);
  }

  public getCart(): ProcureCartItem[] {
    return this.items;
  }

  public clearCart(): void {
    this.clear();
  }

  public clear(): void {
    this.items = [];
    this.currentToolId = null;
  }

  public getGrandTotal(): number {
    return this.items.reduce((sum, item) => sum + item.total, 0);
  }

  public async submitRequest(
    ws: string,
    wp: string,
    initials: string,
    notes: string = ''
  ): Promise<string> {
    if (!this.items.length) {
      throw new Error('Cart is empty');
    }

    const order = await createPurchaseOrder(
      ws + (wp ? ` / ${wp}` : ''),
      this.items.map(it => ({
        toolId: it.toolId || undefined,
        name: it.name,
        qty: it.qty,
        unitPrice: it.cost,
        total: it.total,
        reason: it.reason,
      })),
      notes || `Requested by ${initials}`
    );

    this.clear();
    return order.orderId;
  }

  public exportCsv(ws: string, _wp: string, initials: string): void {
    const headers = ['#', 'Item Name', 'Qty', 'Unit Cost', 'Total Cost', 'Reason', 'Link'];
    const rows = this.items.map((it, idx) => [
      idx + 1,
      `"${it.name.replace(/"/g, '""')}"`,
      it.qty,
      it.cost.toFixed(2),
      it.total.toFixed(2),
      `"${it.reason.replace(/"/g, '""')}"`,
      `"${(it.link || '').replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const filename = datedName(`Procure_Order_${ws}_${initials}`, 'csv');
    downloadText(filename, csv, 'text/csv');
  }

  public async exportXlsx(ws: string, wp: string, initials: string, orderId?: string): Promise<void> {
    await exportReq003Xlsx(this.items, {
      ws,
      wp,
      initials,
      orderId,
      date: new Date().toISOString().split('T')[0],
    });
  }
}

export const Procure = new ProcurementCartManager();
export const ProcureManager = Procure;
