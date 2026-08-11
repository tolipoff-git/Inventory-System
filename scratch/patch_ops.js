const fs = require('fs');
let html = fs.readFileSync('../index.html', 'utf8');

const target = `    exportAuditLogCSV() {`;
const replacement = `    receiveOrder(orderId) {
        const order = Store.getTool(orderId);
        if (!order || order.status !== 'Pending Delivery') return;
        
        const target = order.targetToolId ? Store.getTool(order.targetToolId) : Store.tools.find(t => t.name === order.name && t.status !== 'Pending Delivery' && t.status !== 'Retired');
        
        if (target) {
            target.qty = (target.qty || 1) + order.qty;
            if (order.cost) target.cost = order.cost;
            if (order.purchase_url) target.purchase_url = order.purchase_url;
            Store.toolEvent(target, \`Received order \${order.id} (Qty: +\${order.qty})\`);
            const idx = Store.tools.findIndex(t => t.id === orderId);
            if (idx >= 0) Store.tools.splice(idx, 1);
        } else {
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

    exportAuditLogCSV() {`;

html = html.replace(target, replacement);
fs.writeFileSync('../index.html', html);
console.log('Successfully patched Ops object');
