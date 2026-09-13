// ============================================================================
// 5S Tool Command Center — OrderModal Component (Procurement & Receiving Dock)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { esc, fmtDate } from '../../../utils/formatters';
import { toast } from '../../../utils/dom';
import { windowConfirm, windowPrompt } from '../../../utils/dialogCompat';
import { receiveOrderItem, rejectOrderItem, receiveFullOrder, cancelOrder, addOrderComment } from '../../../operations/orderOps';
import { ProcureManager } from '../../../procure/procure';
import { exportReq003Workbook } from '../../../procure/req003';
import { PurchaseOrder } from '../../../types/procurement';

export class OrderModal {
    private static listModalId = 'ordersModal';
    private static detailModalId = 'orderDetailModal';
    private static procureModalId = 'procureModal';
    public static currentOrderId: string | null = null;

    // Open Orders Registry
    public static openList(): void {
        let modal = document.getElementById(this.listModalId);
        if (!modal) {
            this.createListModalDOM();
            modal = document.getElementById(this.listModalId);
        }
        this.renderOrdersList();
        if (modal) modal.classList.add('active');
    }

    public static closeList(): void {
        const modal = document.getElementById(this.listModalId);
        if (modal) modal.classList.remove('active');
    }

    // Open Order Detail & Receiving Dock
    public static openDetail(orderId: string): void {
        this.currentOrderId = orderId;
        const order = Store.procurementLog.find(p => p.orderId === orderId);
        if (!order) return;

        let modal = document.getElementById(this.detailModalId);
        if (!modal) {
            this.createDetailModalDOM();
            modal = document.getElementById(this.detailModalId);
        }
        this.renderOrderDetail(order);
        if (modal) modal.classList.add('active');
    }

    public static closeDetail(): void {
        const modal = document.getElementById(this.detailModalId);
        if (modal) modal.classList.remove('active');
        this.currentOrderId = null;
    }

    // Open Procure / Create Order
    public static openProcure(toolId?: string): void {
        let modal = document.getElementById(this.procureModalId);
        if (!modal) {
            this.createProcureModalDOM();
            modal = document.getElementById(this.procureModalId);
        }
        this.resetProcureForm(toolId);
        if (modal) modal.classList.add('active');
    }

    public static closeProcure(): void {
        const modal = document.getElementById(this.procureModalId);
        if (modal) modal.classList.remove('active');
    }

    private static createListModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.listModalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:850px;">
                <div class="modal-header">
                    <h3 class="modal-title">📦 ${T('Purchase Orders')}</h3>
                    <button class="close-btn" id="ordersListCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;" id="ordersListBody"></div>
                <div class="modal-footer">
                    <button class="btn btn-warning" id="newOrderFromListBtn">+ ${T('New Purchase Order')}</button>
                    <button class="btn btn-muted" id="ordersListFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#ordersListCloseBtn')?.addEventListener('click', () => this.closeList());
        overlay.querySelector('#ordersListFooterCloseBtn')?.addEventListener('click', () => this.closeList());
        overlay.querySelector('#newOrderFromListBtn')?.addEventListener('click', () => {
            this.closeList();
            this.openProcure();
        });
    }

    private static renderOrdersList(): void {
        const body = document.getElementById('ordersListBody');
        if (!body) return;

        const orders = Store.procurementLog;
        if (!orders.length) {
            body.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">${T('No order history yet.')}</div>`;
            return;
        }

        const getStatusBadge = (st: string) => {
            if (st === 'received') return `<span style="background:var(--success); color:#000; padding:2px 8px; border-radius:4px; font-weight:bold;">RECEIVED</span>`;
            if (st === 'cancelled') return `<span style="background:var(--danger); color:#fff; padding:2px 8px; border-radius:4px; font-weight:bold;">CANCELLED</span>`;
            if (st === 'partial') return `<span style="background:var(--warning); color:#000; padding:2px 8px; border-radius:4px; font-weight:bold;">PARTIAL</span>`;
            return `<span style="background:var(--primary); color:#000; padding:2px 8px; border-radius:4px; font-weight:bold;">OPEN</span>`;
        };

        const rows = [...orders].reverse().map(o => `
            <tr style="cursor:pointer;" data-order-id="${esc(o.orderId)}">
                <td><strong>${esc(o.orderId)}</strong></td>
                <td>${fmtDate(o.createdAt || o.orderDate)}</td>
                <td>${esc(o.name || (o.items && o.items[0]?.name) || 'Order')}</td>
                <td>${esc(o.workstation || 'N/A')}</td>
                <td>${esc(o.requester || 'N/A')}</td>
                <td>$${Number(o.total || 0).toFixed(2)}</td>
                <td>${getStatusBadge(o.status || 'open')}</td>
            </tr>
        `).join('');

        body.innerHTML = `
            <div class="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>${T('PO #')}</th>
                            <th>${T('Date')}</th>
                            <th>${T('Description')}</th>
                            <th>${T('Workstation')}</th>
                            <th>${T('Requester')}</th>
                            <th>${T('Total')}</th>
                            <th>${T('Status')}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;

        body.querySelectorAll('[data-order-id]').forEach(row => {
            row.addEventListener('click', (e) => {
                const oid = (e.currentTarget as HTMLElement).dataset.orderId;
                if (oid) {
                    this.closeList();
                    this.openDetail(oid);
                }
            });
        });
    }

    private static createDetailModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.detailModalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:800px;">
                <div class="modal-header">
                    <h3 class="modal-title" id="orderDetailTitle">📦 Purchase Order</h3>
                    <button class="close-btn" id="orderDetailCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;" id="orderDetailBody"></div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="orderDetailFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#orderDetailCloseBtn')?.addEventListener('click', () => this.closeDetail());
        overlay.querySelector('#orderDetailFooterCloseBtn')?.addEventListener('click', () => this.closeDetail());
    }

    private static renderOrderDetail(order: PurchaseOrder): void {
        const titleEl = document.getElementById('orderDetailTitle');
        const body = document.getElementById('orderDetailBody');
        if (!body) return;

        if (titleEl) titleEl.textContent = `📦 PO ${order.orderId} — ${order.name || 'Order'}`;

        const items = order.items || [{
            id: order.id || '1',
            name: order.name,
            qty: order.qty || 1,
            unitCost: order.cost || 0,
            receivedQty: order.status === 'received' ? order.qty || 1 : 0,
            status: order.status === 'received' ? 'received' : 'pending'
        }];

        const itemRows = items.map((item, idx) => {
            const isReceived = (item.receivedQty || 0) >= (item.qty || 1);
            return `
            <tr>
                <td>${idx + 1}</td>
                <td><strong>${esc(item.name)}</strong></td>
                <td>${item.qty}</td>
                <td>${item.receivedQty || 0}</td>
                <td>$${Number(item.unitCost || 0).toFixed(2)}</td>
                <td>$${((item.qty || 1) * (item.unitCost || 0)).toFixed(2)}</td>
                <td>
                    ${isReceived
                        ? `<span style="color:var(--success); font-weight:bold;">✔ Received</span>`
                        : `<button class="btn btn-success" style="padding:3px 8px; font-size:0.8rem;" data-action="recv-item" data-item-id="${esc(item.id)}">Receive</button>
                           <button class="btn btn-danger" style="padding:3px 8px; font-size:0.8rem;" data-action="reject-item" data-item-id="${esc(item.id)}">Reject</button>`
                    }
                </td>
            </tr>
            `;
        }).join('');

        const comments = order.comments || [];
        const commentRows = comments.map(c => `
            <div style="font-size:0.85rem; padding:4px 0; border-bottom:1px dashed var(--border);">
                <strong>${esc(c.author)}</strong> <span style="color:var(--text-muted);">(${fmtDate(c.ts)}):</span> ${esc(c.text)}
            </div>
        `).join('') || `<div style="color:var(--text-muted); font-size:0.85rem;">No comments yet.</div>`;

        body.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
                <div>
                    <div><strong>${T('Requester:')}</strong> ${esc(order.requester || 'N/A')}</div>
                    <div><strong>${T('Workstation:')}</strong> ${esc(order.workstation || 'N/A')}</div>
                </div>
                <div>
                    <div><strong>${T('Created Date:')}</strong> ${fmtDate(order.createdAt || order.orderDate)}</div>
                    <div><strong>${T('Grand Total:')}</strong> $${Number(order.total || 0).toFixed(2)}</div>
                </div>
            </div>

            <h4 style="margin:12px 0 6px; color:var(--primary-hover);">${T('Line Items & Receiving Dock')}</h4>
            <div class="table-scroll" style="margin-bottom:15px;">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>${T('Item')}</th>
                            <th>${T('Qty')}</th>
                            <th>${T('Recv')}</th>
                            <th>${T('Unit $')}</th>
                            <th>${T('Total $')}</th>
                            <th>${T('Action')}</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows}</tbody>
                </table>
            </div>

            ${order.status !== 'received' ? `
                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <button class="btn btn-success" id="receiveAllOrderBtn">${T('Receive All Remaining Items')}</button>
                    <button class="btn btn-danger" id="cancelOrderBtn">${T('Cancel Entire Order')}</button>
                </div>
            ` : ''}

            <h4 style="margin:12px 0 6px; color:var(--primary-hover);">${T('Comments & Activity')}</h4>
            <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:4px; margin-bottom:10px;">
                ${commentRows}
            </div>
            <div style="display:flex; gap:8px;">
                <input type="text" id="orderCommentInput" class="form-control" placeholder="${T('Add a comment…')}">
                <button class="btn" id="addOrderCommentBtn">${T('Post')}</button>
            </div>
        `;

        body.querySelectorAll('[data-action="recv-item"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = (e.currentTarget as HTMLElement).dataset.itemId!;
                await receiveOrderItem(order.orderId, itemId, 1);
                toast('Item received into inventory!', 'success');
                const updated = Store.procurementLog.find(p => p.orderId === order.orderId);
                if (updated) this.renderOrderDetail(updated);
            });
        });

        body.querySelectorAll('[data-action="reject-item"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = (e.currentTarget as HTMLElement).dataset.itemId!;
                const reason = windowPrompt('Rejection reason:');
                if (reason) {
                    await rejectOrderItem(order.orderId, itemId, reason);
                    toast('Item rejected.', 'warning');
                    const updated = Store.procurementLog.find(p => p.orderId === order.orderId);
                    if (updated) this.renderOrderDetail(updated);
                }
            });
        });

        body.querySelector('#receiveAllOrderBtn')?.addEventListener('click', async () => {
            await receiveFullOrder(order.orderId);
            toast('Full order marked as received!', 'success');
            const updated = Store.procurementLog.find(p => p.orderId === order.orderId);
            if (updated) this.renderOrderDetail(updated);
        });

        body.querySelector('#cancelOrderBtn')?.addEventListener('click', async () => {
            if (windowConfirm('Cancel this purchase order?')) {
                await cancelOrder(order.orderId);
                toast('Order cancelled.', 'danger');
                const updated = Store.procurementLog.find(p => p.orderId === order.orderId);
                if (updated) this.renderOrderDetail(updated);
            }
        });

        body.querySelector('#addOrderCommentBtn')?.addEventListener('click', async () => {
            const input = body.querySelector<HTMLInputElement>('#orderCommentInput');
            if (input && input.value.trim()) {
                await addOrderComment(order.orderId, input.value.trim());
                input.value = '';
                const updated = Store.procurementLog.find(p => p.orderId === order.orderId);
                if (updated) this.renderOrderDetail(updated);
            }
        });
    }

    private static createProcureModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.procureModalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:750px;">
                <div class="modal-header">
                    <h3 class="modal-title">${T('Procure / Order Tool')}</h3>
                    <button class="close-btn" id="procureCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Requester Initials:')} *</label>
                            <input type="text" id="procureInitials" class="form-control" placeholder="Initials">
                        </div>
                        <div class="form-group">
                            <label>${T('Workstation:')} *</label>
                            <select id="procureWs" class="form-control"></select>
                        </div>
                        <div class="form-group">
                            <label>${T('Workpost:')}</label>
                            <select id="procureWp" class="form-control"></select>
                        </div>
                    </div>

                    <fieldset style="border:1px solid var(--border); border-radius:6px; padding:12px; margin-bottom:12px;">
                        <legend style="color:var(--primary-hover); font-weight:bold; padding:0 6px;">+ ${T('Add Line Item')}</legend>
                        <div class="form-group">
                            <label>${T('Tool/Part Name & Model:')} *</label>
                            <input type="text" id="procureItemName" class="form-control" placeholder="e.g. 18V Brushless Impact Driver">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>${T('Quantity:')}</label>
                                <input type="number" id="procureItemQty" class="form-control" value="1" min="1">
                            </div>
                            <div class="form-group">
                                <label>${T('Unit Cost ($):')}</label>
                                <input type="number" id="procureItemCost" class="form-control" value="0.00" step="0.01" min="0">
                            </div>
                            <div class="form-group">
                                <label>${T('Reason:')}</label>
                                <select id="procureItemReason" class="form-control">
                                    <option>Tool Scrapped/Retired</option>
                                    <option>Capacity Expansion</option>
                                    <option>Damaged/Broken</option>
                                    <option>Low Stock</option>
                                    <option>New Project</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>${T('Supplier Purchase Link:')}</label>
                            <input type="text" id="procureItemLink" class="form-control" placeholder="https://…">
                        </div>
                        <button class="btn" type="button" id="procureAddItemBtn">+ ${T('Add to Request')}</button>
                    </fieldset>

                    <div id="procureCartContainer" style="display:none; margin-bottom:15px;">
                        <h4 style="margin:10px 0 6px; color:var(--primary-hover);">${T('Order Items Cart')}</h4>
                        <div class="table-scroll">
                            <table>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>${T('Item')}</th>
                                        <th>${T('Qty')}</th>
                                        <th>${T('Unit $')}</th>
                                        <th>${T('Total $')}</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody id="procureCartBody"></tbody>
                            </table>
                        </div>
                        <div style="text-align:right; font-weight:bold; font-size:1.1rem; margin-top:8px;">
                            Grand Total: $<span id="procureGrandTotal">0.00</span>
                        </div>
                    </div>

                    <div style="display:flex; gap:10px; margin-top:10px;">
                        <button class="btn btn-success" id="procureExcelBtn">📊 ${T('Download Expense Request (.xlsx)')}</button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="procureCancelBtn">${T('Cancel')}</button>
                    <button class="btn btn-primary" id="procureSubmitBtn">${T('Submit Request')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#procureCloseBtn')?.addEventListener('click', () => this.closeProcure());
        overlay.querySelector('#procureCancelBtn')?.addEventListener('click', () => this.closeProcure());
        overlay.querySelector('#procureAddItemBtn')?.addEventListener('click', () => this.addCartItem());
        overlay.querySelector('#procureExcelBtn')?.addEventListener('click', () => this.exportExcel());
        overlay.querySelector('#procureSubmitBtn')?.addEventListener('click', () => this.submitOrder());

        const wsSelect = overlay.querySelector<HTMLSelectElement>('#procureWs');
        const wpSelect = overlay.querySelector<HTMLSelectElement>('#procureWp');
        if (wsSelect && wpSelect) {
            wsSelect.addEventListener('change', () => {
                wpSelect.innerHTML = Store.postsForZone(wsSelect.value).map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
            });
        }
    }

    private static resetProcureForm(toolId?: string): void {
        const wsSelect = document.getElementById('procureWs') as HTMLSelectElement;
        const wpSelect = document.getElementById('procureWp') as HTMLSelectElement;
        if (wsSelect) {
            wsSelect.innerHTML = Store.workstations.map(ws => `<option value="${esc(ws)}">${esc(ws)}</option>`).join('');
            if (wpSelect) {
                wpSelect.innerHTML = Store.postsForZone(wsSelect.value).map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
            }
        }

        ProcureManager.clearCart();
        this.renderCart();

        if (toolId) {
            const tool = Store.getTool(toolId);
            if (tool) {
                (document.getElementById('procureItemName') as HTMLInputElement).value = tool.name;
                (document.getElementById('procureItemQty') as HTMLInputElement).value = '1';
            }
        } else {
            (document.getElementById('procureItemName') as HTMLInputElement).value = '';
        }
    }

    private static addCartItem(): void {
        const name = (document.getElementById('procureItemName') as HTMLInputElement).value.trim();
        const qty = parseInt((document.getElementById('procureItemQty') as HTMLInputElement).value) || 1;
        const cost = parseFloat((document.getElementById('procureItemCost') as HTMLInputElement).value) || 0;
        const reason = (document.getElementById('procureItemReason') as HTMLSelectElement).value;
        const link = (document.getElementById('procureItemLink') as HTMLInputElement).value.trim();

        if (!name) {
            toast('Please enter the tool/part name.', 'warning');
            return;
        }

        ProcureManager.addItem({
            name,
            qty,
            cost,
            total: qty * cost,
            reason,
            link
        });

        (document.getElementById('procureItemName') as HTMLInputElement).value = '';
        (document.getElementById('procureItemLink') as HTMLInputElement).value = '';
        this.renderCart();
    }

    private static renderCart(): void {
        const container = document.getElementById('procureCartContainer');
        const tbody = document.getElementById('procureCartBody');
        const grandTotalEl = document.getElementById('procureGrandTotal');
        if (!container || !tbody || !grandTotalEl) return;

        const cart = ProcureManager.getCart();
        if (!cart.length) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        tbody.innerHTML = cart.map((item: any, idx: number) => `
            <tr>
                <td>${idx + 1}</td>
                <td><strong>${esc(item.name)}</strong></td>
                <td>${item.qty}</td>
                <td>$${Number(item.unitCost || item.cost || 0).toFixed(2)}</td>
                <td>$${Number((item.qty || 1) * (item.unitCost || item.cost || 0)).toFixed(2)}</td>
                <td>
                    <button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" data-cart-del="${idx}">✖</button>
                </td>
            </tr>
        `).join('');

        grandTotalEl.textContent = ProcureManager.getGrandTotal().toFixed(2);

        tbody.querySelectorAll('[data-cart-del]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = +(e.currentTarget as HTMLElement).dataset.cartDel!;
                ProcureManager.removeItem(idx);
                this.renderCart();
            });
        });
    }

    private static async exportExcel(): Promise<void> {
        const initials = (document.getElementById('procureInitials') as HTMLInputElement).value.trim() || 'EMP';
        const ws = (document.getElementById('procureWs') as HTMLSelectElement).value || 'Main';
        const items = ProcureManager.getCart();

        if (!items.length) {
            toast('Cart is empty. Add items first.', 'warning');
            return;
        }

        await exportReq003Workbook(items as any, {
            ws,
            wp: '',
            initials,
            date: new Date().toISOString().split('T')[0]
        });
    }

    private static async submitOrder(): Promise<void> {
        const initials = (document.getElementById('procureInitials') as HTMLInputElement).value.trim();
        const ws = (document.getElementById('procureWs') as HTMLSelectElement).value;
        const wp = (document.getElementById('procureWp') as HTMLSelectElement).value;
        const cart = ProcureManager.getCart();

        if (!initials) {
            toast('Please enter Requester Initials.', 'warning');
            return;
        }
        if (!cart.length) {
            toast('Cart is empty. Please add items.', 'warning');
            return;
        }

        const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
        const newOrder: PurchaseOrder = {
            orderId: poNumber,
            requester: initials,
            workstation: ws,
            workpost: wp || undefined,
            name: cart.map((i: any) => i.name).join(', '),
            items: cart.map((item: any, idx: number) => ({
                id: `${poNumber}-${idx + 1}`,
                name: item.name,
                qty: item.qty,
                unitCost: item.unitCost || item.cost || 0,
                reason: item.reason,
                link: item.link,
                receivedQty: 0,
                status: 'pending'
            })),
            total: ProcureManager.getGrandTotal(),
            status: 'open',
            createdAt: new Date().toISOString()
        };

        await Store.addPurchaseOrder(newOrder);
        toast(`Purchase Order ${poNumber} submitted!`, 'success');
        ProcureManager.clearCart();
        this.closeProcure();
    }
}
