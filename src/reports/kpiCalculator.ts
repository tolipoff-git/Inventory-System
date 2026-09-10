import { Store } from '../storage/store';

export interface InventoryKPIs {
  totalTools: number;
  activeTools: number;
  issuedTools: number;
  backupTools: number;
  maintenanceTools: number;
  overdueTools: number;
  availabilityRate: number;
  averageWear: number;
  totalValuation: number;
  lowStockCount: number;
  ordersPending: number;
  statusCounts: Record<string, number>;
  categoryBreakdown: Record<string, number>;
  workstationLoad: Record<string, number>;
}

export function calculateKPIs(): InventoryKPIs {
  const tools = Store.activeTools();
  const statusCounts: Record<string, number> = {
    Active: 0,
    Issued: 0,
    Backup: 0,
    Maintenance: 0,
    Overdue: 0,
  };

  const categoryBreakdown: Record<string, number> = {};
  const workstationLoad: Record<string, number> = {};
  Store.workstations.forEach(ws => {
    workstationLoad[ws] = 0;
  });

  let totalWear = 0;
  let totalValuation = 0;
  let lowStockCount = 0;

  tools.forEach(tool => {
    const status = tool.status || 'Active';
    if (statusCounts[status] !== undefined) {
      statusCounts[status]++;
    } else {
      statusCounts.Backup++;
    }

    // Category
    const cat = tool.category || 'Uncategorized';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;

    // Location / Workstation load
    const loc = tool.location || '';
    const matchedWs = Store.workstations.find(ws => loc.includes(ws)) || 'Other';
    workstationLoad[matchedWs] = (workstationLoad[matchedWs] || 0) + 1;

    // Wear
    totalWear += Store.wearOf(tool);

    // Valuation
    const unitPrice = tool.price || (tool as any).cost || 0;
    const qty = tool.qty || 1;
    totalValuation += unitPrice * qty;

    // Consumables low stock
    if (tool.type === 'Consumable' && tool.minQty && (tool.qty || 0) <= tool.minQty) {
      lowStockCount++;
    }
  });

  const totalTools = tools.length;
  const activeTools = statusCounts.Active || 0;
  const issuedTools = statusCounts.Issued || 0;
  const backupTools = statusCounts.Backup || 0;
  const maintenanceTools = statusCounts.Maintenance || 0;
  const overdueTools = statusCounts.Overdue || 0;

  const availabilityRate = totalTools > 0
    ? Math.round(((activeTools + backupTools) / totalTools) * 100)
    : 100;

  const averageWear = totalTools > 0
    ? Math.round(totalWear / totalTools)
    : 0;

  const ordersPending = (Store.procurementLog || []).filter(
    o => o.status === 'Submitted' || o.status === 'Ordered' || o.status === 'Partial'
  ).length;

  return {
    totalTools,
    activeTools,
    issuedTools,
    backupTools,
    maintenanceTools,
    overdueTools,
    availabilityRate,
    averageWear,
    totalValuation,
    lowStockCount,
    ordersPending,
    statusCounts,
    categoryBreakdown,
    workstationLoad,
  };
}
