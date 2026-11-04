// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderModal } from '../src/ui/components/Modals/OrderModal';
import { Store } from '../src/storage/store';
import { PurchaseOrder } from '../src/types/procurement';
import { exportPurchaseRows } from '../src/procure/orderExport';
import { ProcureManager } from '../src/procure/procure';
import { addOrderComment } from '../src/operations/orderOps';

vi.mock('../src/procure/orderExport', () => ({ exportPurchaseRows: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/operations/orderOps', async original => ({
  ...await original<typeof import('../src/operations/orderOps')>(),
  addOrderComment: vi.fn().mockResolvedValue(true),
}));
const order = (id: string): PurchaseOrder => ({
  orderId: id, status: 'Submitted', total: 14, requester: 'IT', workstation: 'Assembly',
  items: [{ id: 'a', name: 'Drill', qty: 2, unitCost: 3 }, { id: 'b', name: 'Bit', qty: 4, unitPrice: 2 }],
});
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();
const active = (id: string) => document.getElementById(id)?.classList.contains('active');
const input = (id: string, value: string) => { (document.getElementById(id) as HTMLInputElement).value = value; };

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  Store.procurementLog = [order('PO-A'), order('PO-B')];
  Store.workstations = ['Assembly'];
  Store.workposts = [];
  OrderModal.openList();
  // Clear preserved selection via its UI, as a user would.
  const all = document.querySelector<HTMLInputElement>('#ordersListBody [data-select-all]')!;
  if (all.checked || all.indeterminate) { all.checked = false; all.dispatchEvent(new Event('change')); }
});

describe('procurement navigation and export selection', () => {
  it('returns to the registry from details and from the new-order form', () => {
    click('[data-order-id="PO-A"]');
    expect(active('ordersModal')).toBe(false);
    click('#orderDetailFooterCloseBtn');
    expect(active('ordersModal')).toBe(true);
    expect(OrderModal.currentOrderId).toBeNull();
    click('#newOrderFromListBtn');
    click('#procureCancelBtn');
    expect(active('ordersModal')).toBe(true);
    expect(active('procureModal')).toBe(false);
  });

  it('routes external dismissals to the registry; invalid order IDs keep the list open', () => {
    OrderModal.openDetail('missing');
    expect(active('ordersModal')).toBe(true);
    expect(OrderModal.currentOrderId).toBeNull();
    OrderModal.openDetail('PO-A');
    expect(OrderModal.dismiss('orderDetailModal')).toBe(true);
    expect(active('ordersModal')).toBe(true);
    OrderModal.openProcure();
    OrderModal.dismiss('procureModal');
    expect(active('ordersModal')).toBe(true);
    expect(OrderModal.dismiss('anotherModal')).toBe(false);
  });

  it('selects orders without opening details and exports exactly those orders', async () => {
    click('[data-select-row="PO-A"]');
    expect(active('orderDetailModal')).not.toBe(true);
    expect(document.querySelector('#ordersListBody [data-select-all]')).toHaveProperty('indeterminate', true);
    click('#ordersListBody [data-export="xlsx"][data-scope="selected"]');
    await vi.waitFor(() => expect(exportPurchaseRows).toHaveBeenCalledTimes(1));
    expect(vi.mocked(exportPurchaseRows).mock.calls[0][0].map(row => row.orderId)).toEqual(['PO-A', 'PO-A']);
    click('#ordersListBody [data-export="pdf"][data-scope="all"]');
    await vi.waitFor(() => expect(exportPurchaseRows).toHaveBeenCalledTimes(2));
    expect(vi.mocked(exportPurchaseRows).mock.calls[1][0]).toHaveLength(4);
  });

  it('keeps selected lines after a detail action and exports only selected lines', async () => {
    OrderModal.openDetail('PO-A');
    click('#orderDetailBody [data-select-row="1"]');
    input('orderCommentInput', 'Check delivery');
    click('#addOrderCommentBtn');
    await vi.waitFor(() => expect(addOrderComment).toHaveBeenCalled());
    await vi.waitFor(() => expect(document.querySelector('#orderDetailBody [data-select-row="1"]')).toHaveProperty('checked', true));
    click('#orderDetailBody [data-export="pdf"][data-scope="selected"]');
    await vi.waitFor(() => expect(exportPurchaseRows).toHaveBeenCalledTimes(1));
    expect(vi.mocked(exportPurchaseRows).mock.calls[0][0]).toEqual([expect.objectContaining({ name: 'Bit', amount: 8 })]);
    OrderModal.closeDetail();
    OrderModal.openDetail('PO-B');
    expect(document.querySelector('#orderDetailBody [data-export][data-scope="selected"]')).toHaveProperty('disabled', true);
  });

  it('does not multiply export listeners as cart rows change and retains the intended selection after deletion', async () => {
    OrderModal.openProcure();
    for (const name of ['First', 'Second', 'Third']) {
      input('procureItemName', name);
      click('#procureAddItemBtn');
    }
    click('#procureCartBody [data-select-row="1"]');
    click('[data-cart-del="0"]');
    expect(document.querySelector('#procureCartBody [data-select-row="0"]')).toHaveProperty('checked', true);
    click('#cartExportToolbar [data-export="xlsx"][data-scope="selected"]');
    await vi.waitFor(() => expect(exportPurchaseRows).toHaveBeenCalledTimes(1));
    expect(vi.mocked(exportPurchaseRows).mock.calls[0][0].map(row => row.name)).toEqual(['Second']);
    click('#procureCartContainer [data-select-all]');
    click('#cartExportToolbar [data-export="pdf"][data-scope="selected"]');
    await vi.waitFor(() => expect(exportPurchaseRows).toHaveBeenCalledTimes(2));
    expect(vi.mocked(exportPurchaseRows).mock.calls[1][0]).toHaveLength(2);
    expect(ProcureManager.getCart()).toHaveLength(2);
  });

  it('shows the updated registry after submitting an order', async () => {
    vi.spyOn(Store, 'save').mockResolvedValueOnce(undefined);
    OrderModal.openProcure();
    input('procureInitials', 'IT');
    input('procureItemName', 'New tool');
    click('#procureAddItemBtn');
    click('#procureSubmitBtn');
    await vi.waitFor(() => expect(active('ordersModal')).toBe(true));
    expect(document.getElementById('ordersListBody')?.textContent).toContain('New tool');
    expect(active('procureModal')).toBe(false);
  });
});
