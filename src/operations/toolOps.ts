import { Tool } from '../types/inventory';
import { Employee } from '../types/personnel';
import { Store } from '../storage/store';
import { CONFIG } from '../config/constants';
import { nowISO } from '../utils/formatters';

export function suggestToolId(prefix: string): string {
  let max = 0;
  const cleanPrefix = String(prefix || 'TOOL').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^' + cleanPrefix + '-(\\d+)$');
  Store.tools.forEach(t => {
    const m = t.id && t.id.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return (prefix || 'TOOL') + '-' + String(max + 1).padStart(3, '0');
}

export const isPermanentTool = (t: Tool): boolean =>
  CONFIG.PERMANENT_PREFIXES.some(p => t.id.startsWith(p));

export const isConsumableTool = (t: Tool): boolean =>
  CONFIG.CONSUMABLE_PREFIXES.some(p => t.id.startsWith(p)) || t.type === 'Consumable';

export function workstationAndPostOf(tool: Tool): { ws: string; post: string } {
  if (tool.assigneeId) {
    const emp = Store.getEmp(tool.assigneeId);
    if (emp) {
      return {
        ws: (emp as any).workstation || (emp as any).defaultWs || 'Unassigned',
        post: (emp as any).post || (emp as any).defaultPost || '',
      };
    }
  }

  const addrZone = tool.address && tool.address.zone ? tool.address.zone : null;
  const matchedWs = addrZone && Store.workstations.includes(addrZone)
    ? addrZone
    : Store.workstations.find(w => tool.location && tool.location.startsWith(w));

  if (matchedWs) {
    const matchedPost = Store.workposts.find(p => p.ws === matchedWs);
    return { ws: matchedWs, post: matchedPost ? matchedPost.name : '' };
  }

  const wsFromLoc = Store.workstations.find(w => tool.location && tool.location.includes(w));
  if (wsFromLoc) return { ws: wsFromLoc, post: '' };
  return { ws: tool.location || 'Unassigned', post: '' };
}

export function careOf(emp: Employee) {
  const hist = (emp as any).history || [];
  const cnt = (re: RegExp) => hist.filter((h: string) => re.test(h)).length;
  const good = cnt(/Returned .+ — Good/);
  const maint = cnt(/Returned .+ — Needs Maintenance/);
  const damaged = cnt(/Returned .+ — Damaged/);
  const overdueNow = Store.tools.filter(t => t.assigneeId === emp.id && t.status === 'Overdue').length;

  const score = Math.max(5, Math.min(100, 100 - damaged * 25 - maint * 10 - overdueNow * 15));
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';
  const color = score >= 90 ? 'var(--success)' : score >= 75 ? 'var(--primary)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';
  const comment =
    damaged > 0 ? 'Tool damage recorded — coaching required.' :
    overdueNow > 0 ? 'Currently holding overdue tool(s).' :
    maint > 0 ? 'Occasional wear beyond norms — remind about SOP.' :
    'Exemplary tool handling.';

  return { score, grade, color, good, maint, damaged, overdueNow, comment };
}

export async function checkoutTool(
  toolId: string,
  empIdOrName: string,
  daysOrReturnDate: number | string = 1,
  issueQty: number = 1,
  initials: string = 'OP',
  locationWs: string = 'Tool Gage',
  locationPost: string = '',
  notes: string = ''
): Promise<{ success: boolean; error?: string }> {
  let tool = Store.getTool(toolId);
  if (!tool) return { success: false, error: 'Tool not found' };

  if ((tool.status === 'Issued' || tool.status === 'Overdue') && tool.assigneeId) {
    return { success: false, error: 'Tool is already issued. Process a return first.' };
  }

  let emp = Store.getEmp(empIdOrName);
  if (!emp && empIdOrName) {
    let newEmpId;
    do {
      newEmpId = 'EMP-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    } while (Store.getEmp(newEmpId));
    emp = { id: newEmpId, name: empIdOrName, role: 'Operator', active: true };
    Store.personnel.push(emp);
  }
  if (!emp) return { success: false, error: 'Employee not found' };

  if (issueQty > (tool.qty || 1)) {
    return { success: false, error: `Cannot issue more than available quantity (${tool.qty || 1})` };
  }

  if (issueQty < (tool.qty || 1)) {
    tool.qty = (tool.qty || 1) - issueQty;
    Store.touch(tool);

    const clone: Tool = JSON.parse(JSON.stringify(tool));
    clone.id = suggestToolId(tool.id.split('-')[0]);
    clone.qty = issueQty;
    clone.serialNumber = (tool.id.includes('-') ? tool.id.split('-')[0] : 'SN') + '-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    clone.history = [];
    Store.tools.push(clone);
    tool = clone;
  }

  let dueReturnStr = '';
  if (typeof daysOrReturnDate === 'number') {
    dueReturnStr = new Date(Date.now() + daysOrReturnDate * CONFIG.DAY_MS).toISOString();
  } else if (daysOrReturnDate) {
    dueReturnStr = new Date(daysOrReturnDate).toISOString();
  } else {
    dueReturnStr = new Date(Date.now() + 1 * CONFIG.DAY_MS).toISOString();
  }

  tool.assigneeId = emp.id;
  tool.status = 'Issued';
  tool.assignedAt = nowISO();
  tool.dueReturn = dueReturnStr;
  tool.location = locationPost ? `${locationWs} / ${locationPost}` : locationWs;

  Store.touch(tool);
  const noteStr = notes ? ` [${notes}]` : '';
  Store.toolEvent(tool, `Assigned to ${emp.name} (Qty: ${issueQty}, Signed: ${initials})${noteStr}`);
  Store.empEvent(emp, `Received ${tool.id} (Qty: ${issueQty}, Signed: ${initials})${noteStr}`);
  Store.log('TOOL_ASSIGN', `${tool.id} → ${emp.id} (Qty: ${issueQty})${noteStr}`);

  await Store.save();
  return { success: true };
}

export async function returnTool(
  toolId: string,
  conditionOrScore: 'Good' | 'Needs Maintenance' | 'Damaged' | number = 'Good',
  initialsOrNotes: string = 'OP',
  returnLocation?: string
): Promise<boolean> {
  const tool = Store.getTool(toolId);
  if (!tool) return false;

  const emp = tool.assigneeId ? Store.getEmp(tool.assigneeId) : null;
  tool.assigneeId = null;
  tool.dueReturn = null;
  tool.assignedAt = null;

  let isGood = conditionOrScore === 'Good';
  if (typeof conditionOrScore === 'number') {
    isGood = conditionOrScore >= 4;
  }

  if (isGood) {
    tool.status = 'Active';
  } else {
    tool.status = 'Maintenance';
    if (!Array.isArray(tool.audit_history)) tool.audit_history = [];
    tool.audit_history.push({
      date: nowISO().split('T')[0],
      inspector: initialsOrNotes,
      wear_pct: Math.min(100, Store.wearOf(tool) + 25),
      notes: `Returned condition: ${conditionOrScore}. ${initialsOrNotes}`,
      result: 'FLAG',
    });
  }

  if (returnLocation) {
    tool.location = returnLocation;
  }

  Store.touch(tool);
  Store.toolEvent(tool, `Returned — ${conditionOrScore} (Signed: ${initialsOrNotes})`);
  if (emp) Store.empEvent(emp, `Returned ${tool.id} — ${conditionOrScore}`);
  Store.log('TOOL_RETURN', `${tool.id} (${conditionOrScore})`);

  await Store.save();
  return true;
}

export async function transferTool(
  toolId: string,
  zone: string,
  rackOrPost: string = '',
  shelfOrAddress: any = '',
  binOrNotes: string = '',
  _extraNotes?: string
): Promise<boolean> {
  const tool = Store.getTool(toolId);
  if (!tool) return false;

  if (typeof shelfOrAddress === 'object' && shelfOrAddress !== null) {
    tool.location = [zone, rackOrPost].filter(Boolean).join(' / ');
    tool.address = shelfOrAddress;
  } else {
    tool.location = [zone, rackOrPost, shelfOrAddress, binOrNotes].filter(Boolean).join(' - ');
    tool.address = { zone, rack: rackOrPost, shelf: String(shelfOrAddress), bin: binOrNotes };
  }

  Store.touch(tool);
  Store.toolEvent(tool, `Moved to ${tool.location}`);
  Store.log('TOOL_TRANSFER', `${tool.id} → ${tool.location}`);
  await Store.save();
  return true;
}

export async function sendToolToService(
  toolId: string,
  reason: string = 'Routine Service',
  serviceType: string = 'Maintenance'
): Promise<boolean> {
  const tool = Store.getTool(toolId);
  if (!tool) return false;

  if (tool.assigneeId) {
    const emp = Store.getEmp(tool.assigneeId);
    if (emp) Store.empEvent(emp, `${tool.id} sent to service`);
  }
  tool.status = 'Maintenance';
  tool.assigneeId = null;
  Store.touch(tool);
  Store.toolEvent(tool, `Sent to ${serviceType} queue: ${reason}`);
  Store.log('TOOL_SERVICE', `${tool.id} (${serviceType}: ${reason})`);
  await Store.save();
  return true;
}

export const serviceTool = sendToolToService;

export async function completeMaintenance(
  toolId: string,
  inspectorOrNotes: string = 'Tech',
  nextCalDate?: string
): Promise<boolean> {
  const tool = Store.getTool(toolId);
  if (!tool) return false;

  tool.status = 'Active';
  if (nextCalDate) {
    tool.calDue = nextCalDate;
  } else {
    tool.calDue = new Date(Date.now() + 180 * CONFIG.DAY_MS).toISOString().split('T')[0];
  }

  if (!Array.isArray(tool.audit_history)) tool.audit_history = [];
  tool.audit_history.push({
    date: nowISO().split('T')[0],
    inspector: inspectorOrNotes,
    wear_pct: Math.max(0, Store.wearOf(tool) - 10),
    notes: `Maintenance completed. ${inspectorOrNotes}`,
    result: 'PASS',
  });
  Store.touch(tool);
  Store.toolEvent(tool, `Maintenance completed: ${inspectorOrNotes}`);
  Store.log('TOOL_MAINT_DONE', tool.id);
  await Store.save();
  return true;
}

export async function decommissionTool(
  toolId: string,
  wearOrReason: number | string = 100,
  reasonOrNotes: string = 'Scrap',
  initials: string = 'N/A',
  notes: string = ''
): Promise<boolean> {
  const tool = Store.getTool(toolId);
  if (!tool) return false;

  const dateStr = nowISO().split('T')[0];
  tool.status = 'Decommissioned';
  tool.assigneeId = null;

  const wear = typeof wearOrReason === 'number' ? wearOrReason : 100;
  const reason = typeof wearOrReason === 'string' ? wearOrReason : reasonOrNotes;

  if (!Array.isArray(tool.audit_history)) tool.audit_history = [];
  tool.audit_history.push({
    date: dateStr,
    inspector: initials,
    wear_pct: wear,
    notes: `Decommissioned: ${reason}. ${notes}`,
    result: 'FAIL',
  });

  Store.touch(tool);
  Store.toolEvent(tool, `Decommissioned on ${dateStr} (Reason: ${reason}, Wear: ${wear}%, Insp: ${initials})`);
  Store.log('TOOL_RETIRE', `${tool.id} (${reason}, ${wear}%)`);
  await Store.save();
  return true;
}

export async function adjustConsumableQty(
  toolId: string,
  delta: number,
  reason: string = 'Stock adjustment'
): Promise<boolean> {
  const tool = Store.getTool(toolId);
  if (!tool || tool.type !== 'Consumable') return false;

  tool.qty = Math.max(0, (tool.qty || 0) + delta);
  Store.touch(tool);
  Store.toolEvent(tool, `Qty adjusted by ${delta > 0 ? '+' : ''}${delta} (${reason}) -> Total: ${tool.qty}`);
  Store.log('TOOL_QTY_ADJUST', `${tool.id}: ${delta} (${reason})`);
  await Store.save();
  return true;
}
