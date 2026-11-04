// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../src/storage/store';
import { Auth } from '../src/auth/authManager';
import { GateModal } from '../src/ui/components/Modals/GateModal';
import { OrderModal } from '../src/ui/components/Modals/OrderModal';
import { ToolModal } from '../src/ui/components/Modals/ToolModal';
import { receiveOrderItem, receiveFullOrder, cancelOrder, addOrderComment } from '../src/operations/orderOps';
import { checkoutTool } from '../src/operations/toolOps';
import { windowConfirm, windowPrompt } from '../src/utils/dialogCompat';
import { exportInventoryCSV } from '../src/reports/reportExports';
import { downloadText } from '../src/utils/dom';
import { calculateKPIs } from '../src/reports/kpiCalculator';
import { mergeProcurement } from '../src/sync/conflictResolver';

vi.mock('../src/utils/dom', async original => ({ ...await original<typeof import('../src/utils/dom')>(), downloadText: vi.fn() }));
beforeEach(() => {
  document.body.innerHTML = '<div id="appMainContainer"></div>';
  Store.tools = [{ id: 'CN-001', name: 'Bit', type: 'Consumable', status: 'Active', location: 'Crib', category: 'Bits', qty: 0, cost: 8, serialNumber: 'ACTUAL' }];
  Store.personnel = [{ id: 'EMP-1', name: 'Alice', role: 'Operator' }];
  Store.workstations = ['Crib']; Store.workposts = []; Store.auditLog = [];
  Store.procurementLog = [{ orderId: 'PO-X', status: 'Submitted', total: 10, updatedAt: '2026-11-01T00:00:00Z', items: [
    { id: 'a', name: 'Bit', qty: 5, unitCost: 1, status: 'Pending', receivedQty: 0 },
    { id: 'b', name: 'Drill', qty: 5, unitCost: 1, status: 'Pending', receivedQty: 0 },
  ] }];
  Auth.current = { username: 'manager', role: 'Tool Crib Manager' };
  vi.spyOn(Store, 'save').mockResolvedValue(undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
describe('audit: order and inventory invariants', () => {
  it('cancellation in either receiving prompt makes no change', async () => {
    window.prompt = vi.fn().mockReturnValue(null);
    OrderModal.openDetail('PO-X');
    (document.querySelector('[data-action="recv-item"]') as HTMLElement).click();
    await Promise.resolve();
    expect(Store.procurementLog[0].items![0].receivedQty).toBe(0);
    expect(Store.save).not.toHaveBeenCalled();
  });
  it('native prompt cancellation is distinct from its supplied default', () => {
    window.prompt = vi.fn().mockReturnValue(null);
    expect(windowPrompt('Quantity', '5')).toBeNull();
  });
  it('confirmation without a native dialog fails closed', () => {
    vi.stubGlobal('window', {});
    expect(windowConfirm('Delete?')).toBe(false);
    vi.unstubAllGlobals();
  });
  it('does not receive a cancelled item or order', async () => {
    Store.procurementLog[0].items![0].status = 'Cancelled';
    expect(await receiveOrderItem('PO-X', 'a', 1)).toBe(false);
    Store.procurementLog[0].status = 'Cancelled';
    expect(await receiveFullOrder('PO-X')).toBe(false);
    expect(Store.procurementLog[0].status).toBe('Cancelled');
  });
  it.each([NaN, Infinity, 0, -1, 1.5])('rejects invalid receipt quantity %s', async amount => {
    expect(await receiveOrderItem('PO-X', 'a', amount)).toBe(false);
    expect(Store.procurementLog[0].items![0].receivedQty).toBe(0);
  });
  it('receives a batch in one persistent commit', async () => {
    expect(await receiveFullOrder('PO-X')).toBe(true);
    expect(Store.save).toHaveBeenCalledTimes(1);
    expect(Store.procurementLog[0].items!.map(i => i.receivedQty)).toEqual([5, 5]);
  });
  it('rolls order/stock changes back if persistence fails', async () => {
    vi.mocked(Store.save).mockRejectedValueOnce(new Error('quota'));
    const before = structuredClone(Store.procurementLog);
    await expect(receiveOrderItem('PO-X', 'a', 1, 'CN-001')).rejects.toThrow('quota');
    expect(Store.procurementLog).toEqual(before);
    expect(Store.tools[0].qty).toBe(0);
  });
  it('advances revisions on comments and cancellation so stale peers lose', async () => {
    const stale = structuredClone(Store.procurementLog[0]);
    await addOrderComment('PO-X', 'Check delivery');
    expect(Store.procurementLog[0].updatedAt! > stale.updatedAt!).toBe(true);
    expect(mergeProcurement(Store.procurementLog, [stale])[0].comments).toHaveLength(1);
    expect(await cancelOrder('PO-X')).toBe(true);
    expect(mergeProcurement(Store.procurementLog, [stale])[0].status).toBe('Cancelled');
  });
  it('does not issue zero stock or a tool under maintenance', async () => {
    expect((await checkoutTool('CN-001', 'EMP-1')).success).toBe(false);
    Store.tools[0].qty = 1; Store.tools[0].status = 'Maintenance';
    expect((await checkoutTool('CN-001', 'EMP-1')).success).toBe(false);
  });
  it('keeps zero in edit/display/export and reads the actual serial number', () => {
    ToolModal.openEdit('CN-001');
    expect((document.getElementById('editToolQty') as HTMLInputElement).value).toBe('0');
    expect((document.getElementById('editToolSn') as HTMLInputElement).value).toBe('ACTUAL');
    expect(calculateKPIs().totalValuation).toBe(0);
    exportInventoryCSV();
    expect(vi.mocked(downloadText).mock.calls[0][1]).toContain('"CN-001","Bit",0,');
  });
  it('resumes the original action after successful role elevation', async () => {
    GateModal.initGate(); Auth.current = { username: 'operator', role: 'Operator' };
    const action = vi.fn();
    vi.spyOn(Auth, 'login').mockImplementation(async () => { Auth.current = { username: 'admin', role: 'Administrator' }; return true; });
    Auth.doAction('Administrator', action);
    document.getElementById('promptLoginSubmitBtn')!.click();
    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());
  });
});
