const fs = require('fs');
let html = fs.readFileSync('../index.html', 'utf8');

// 1 & 2. Modify procureName input
html = html.replace(
    '<input type="text" id="procureName" class="form-control" placeholder="e.g. 18V Impact Driver">',
    '<input type="text" id="procureName" class="form-control" list="procureNameList" oninput="Procure.onNameChange()" placeholder="e.g. 18V Impact Driver">\n                    <datalist id="procureNameList"></datalist>'
);

// 3. Procure.openProcureModal
html = html.replace(
    /openModal\('procureModal'\);/,
    `const dl = document.getElementById('procureNameList');
        const names = new Set();
        Store.tools.forEach(t => names.add(t.name));
        Store.procurementLog.forEach(l => names.add(l.name));
        dl.innerHTML = Array.from(names).map(n => \`<option value="\${Utils.esc(n)}"></option>\`).join('');
        openModal('procureModal');`
);

// 4. Procure.onNameChange()
html = html.replace(
    /resetItemForm\(\) \{/,
    `onNameChange() {
        const val = document.getElementById('procureName').value.trim().toLowerCase();
        if (!val) return;
        // Search in procurementLog first for exact order match, then tools
        const logMatch = Store.procurementLog.find(l => l.name.toLowerCase() === val);
        const toolMatch = Store.tools.find(t => t.name.toLowerCase() === val);
        
        if (logMatch) {
            document.getElementById('procureCost').value = logMatch.cost.toFixed(2);
            document.getElementById('procureLink').value = logMatch.link || '';
        } else if (toolMatch) {
            if (toolMatch.cost) document.getElementById('procureCost').value = toolMatch.cost.toFixed(2);
            document.getElementById('procureLink').value = toolMatch.purchase_url || '';
        }
    },
    resetItemForm() {`
);

// 5. submitProcurement
const submitProcurementTarget = /if \(item\.toolId\) \{[\s\S]*?Store\.procurementLog\.push\(req\);\n        \}\);/;
const submitProcurementReplacement = `const orderId = 'ORD-' + Math.random().toString(36).substr(2, 6).toUpperCase();
            const orderTool = {
                id: orderId,
                name: item.name,
                category: 'Consumables',
                status: 'Pending Delivery',
                qty: item.qty,
                cost: item.cost,
                purchase_url: item.link,
                location: \`\${ws} / \${wp}\`,
                history: [\`Ordered by \${initials}. Reason: \${item.reason}\`],
                targetToolId: item.toolId || null
            };
            
            if (item.toolId) {
                const tool = Store.getTool(item.toolId);
                if (tool) {
                    orderTool.category = tool.category;
                    orderTool.class = tool.class;
                    orderTool.type = tool.type;
                    tool.purchase_url = item.link;
                    Store.toolEvent(tool, \`Procurement requested (Qty: \${item.qty}, Reason: \${item.reason}, By: \${initials})\`);
                }
            } else {
                // If it matches an existing tool by name, use its category
                const existing = Store.tools.find(t => t.name.toLowerCase() === item.name.toLowerCase());
                if (existing) {
                    orderTool.category = existing.category;
                    orderTool.class = existing.class;
                    orderTool.type = existing.type;
                    orderTool.targetToolId = existing.id;
                }
            }
            Store.tools.push(orderTool);
            Store.procurementLog.push(req);
        });`;
html = html.replace(submitProcurementTarget, submitProcurementReplacement);

// 6. tool-actions HTML
const toolActionsTarget = /<div class="tool-actions">[\s\S]*?<\/div>/;
const toolActionsReplacement = `<div class="tool-actions">
                \${tool.status === 'Pending Delivery' ? \`
                    <button class="btn btn-success wide" data-action="receive-order" data-id="\${Utils.esc(tool.id)}">\${T('Mark as Received')}</button>
                    <button class="btn btn-muted wide" data-action="cancel-order" data-id="\${Utils.esc(tool.id)}">\${T('Cancel Order')}</button>
                \` : \`
                    <button class="btn" data-action="assign" data-id="\${Utils.esc(tool.id)}">\${T('[Assign Person]')}</button>
                    <button class="btn" data-action="transfer" data-id="\${Utils.esc(tool.id)}">\${getBtnHtml('Administrator', T('[Transfer / Move]'))}</button>
                    \${maintBtn}
                    <button class="btn btn-warning wide" data-action="procure" data-id="\${Utils.esc(tool.id)}">\${T('[Procure / Order]')}</button>
                    <button class="btn wide" data-action="print-label" data-id="\${Utils.esc(tool.id)}">\${getBtnHtml('Tool Crib Manager', T('Print Sticker / Label'))}</button>
                    <button class="btn btn-danger wide" data-action="retire" data-id="\${Utils.esc(tool.id)}">\${getBtnHtml('Administrator', T('[Decommission / Retire]'))}</button>
                \`}
            </div>`;
html = html.replace(toolActionsTarget, toolActionsReplacement);

// 7. Actions map & receive/cancel logic
const actionsMapTarget = /'retire':        id => doAction\('Administrator', \(\) => Ops.openRetireModal\(id\)\),/;
const actionsMapReplacement = `'retire':        id => doAction('Administrator', () => Ops.openRetireModal(id)),
    'receive-order': id => doAction('Tool Crib Manager', () => Ops.receiveOrder(id)),
    'cancel-order':  id => doAction('Tool Crib Manager', () => Ops.cancelOrder(id)),`;
html = html.replace(actionsMapTarget, actionsMapReplacement);

const opsEndTarget = /checkCalibrations\(\) \{/;
const opsEndReplacement = `receiveOrder(orderId) {
        const order = Store.getTool(orderId);
        if (!order || order.status !== 'Pending Delivery') return;
        
        const target = order.targetToolId ? Store.getTool(order.targetToolId) : Store.tools.find(t => t.name === order.name && t.status !== 'Pending Delivery' && t.status !== 'Retired');
        
        if (target) {
            target.qty = (target.qty || 1) + order.qty;
            if (order.cost) target.cost = order.cost;
            if (order.purchase_url) target.purchase_url = order.purchase_url;
            Store.toolEvent(target, \`Received order \${order.id} (Qty: +\${order.qty})\`);
            // Remove the order card
            const idx = Store.tools.findIndex(t => t.id === orderId);
            if (idx >= 0) Store.tools.splice(idx, 1);
        } else {
            // New tool
            order.status = 'Active';
            order.id = Ops.suggestId(order.class ? order.class.split(' -')[0] : 'TOOL');
            Store.toolEvent(order, \`Received order \${orderId}, assigned ID \${order.id}\`);
        }
        
        Store.save();
        init();
    },

    cancelOrder(orderId) {
        if (!confirm('Cancel this order?')) return;
        const idx = Store.tools.findIndex(t => t.id === orderId);
        if (idx >= 0) {
            Store.tools.splice(idx, 1);
            Store.save();
            init();
        }
    },

    checkCalibrations() {`;
html = html.replace(opsEndTarget, opsEndReplacement);

// 8. Translations
html = html.replace(/'Storage \/ Crib': 'Storage \/ Crib',/, "'Storage / Crib': 'Storage / Crib',\n        'Pending Delivery': 'Pending Delivery',\n        'Mark as Received': 'Mark as Received',\n        'Cancel Order': 'Cancel Order',");
html = html.replace(/'Storage \/ Crib': 'Склад \/ Кладовая',/, "'Storage / Crib': 'Склад / Кладовая',\n        'Pending Delivery': 'Ожидание поставки',\n        'Mark as Received': 'Отметить как полученное',\n        'Cancel Order': 'Отменить заказ',");

fs.writeFileSync('../index.html', html);
console.log('Successfully patched orders logic');
