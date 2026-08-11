const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const generate5SRegex = /generate5S\(\) \{\s+const active = Store\.activeTools\(\);[\s\S]*?openModal\('report5sModal'\);\s+\},/;

const print5SRegex = /print5S\(\) \{\s+const active = Store\.activeTools\(\);[\s\S]*?<ul>\$\{warnHtml\}<\/ul>\\n\s+`\);\s+\}/;

const generate5SNew = `generate5S() {
        const active = Store.activeTools();
        const compliant = active.filter(t => t.status === 'Active' || t.status === 'Issued' || t.status === 'Backup').length;
        const rate = active.length ? ((compliant / active.length) * 100).toFixed(1) : '100.0';
        const count = s => active.filter(t => t.status === s).length;

        const retired = Store.tools.filter(t => t.status === 'Retired' || t.status === 'retired');
        const getRetireInfo = (t) => {
            let reason = t.retireReason || null;
            let ts = t.updatedAt || ''; 
            let evt = t.history ? t.history.find(h => h.includes('Retired on') || h.includes('Retired:') || h.includes('Decommissioned:')) : null;
            if (evt) {
                ts = evt.split('|')[0].trim();
                if (!reason) {
                    let rMatch = evt.match(/Reason:\\s*([^,)]+)/);
                    if (rMatch) reason = rMatch[1].trim();
                    else if (evt.includes('Retired:')) reason = evt.split('Retired:')[1].trim();
                    else if (evt.includes('Decommissioned:')) reason = evt.split('Decommissioned:')[1].trim();
                }
            }
            return { tool: t, reason: reason || 'Wear > 75% / Damaged', ts };
        };
        const retiredData = retired.map(getRetireInfo);
        retiredData.sort((a, b) => b.ts.localeCompare(a.ts));

        let reasonsMap = {};
        let retiredCategories = {};
        retiredData.forEach(d => { 
            reasonsMap[d.reason] = (reasonsMap[d.reason] || 0) + 1; 
            let cat = d.tool.category || 'General Tools';
            retiredCategories[cat] = (retiredCategories[cat] || 0) + 1;
        });
        let freqReason = 'N/A';
        let maxC = 0;
        for (let r in reasonsMap) { if (reasonsMap[r] > maxC) { maxC = reasonsMap[r]; freqReason = r; } }

        const recentRetiredHtml = retiredData.slice(0, 5).map(d => \`<li><strong>\${Utils.esc(d.tool.id)}</strong> (\${Utils.esc(d.tool.name)}) — \${Utils.esc(d.reason)}</li>\`).join('');
        
        let recommendBuy = [];
        for (let c in retiredCategories) {
            if (retiredCategories[c] >= 2) recommendBuy.push(\`Order replacement for \${Utils.esc(c)} due to high retirement rate.\`);
        }
        if (recommendBuy.length === 0 && retiredData.length > 0) {
            let topCat = Object.keys(retiredCategories).sort((a,b) => retiredCategories[b] - retiredCategories[a])[0];
            recommendBuy.push(\`Consider ordering replacements for \${Utils.esc(topCat)} tools.\`);
        }
        const procurementHtml = recommendBuy.length > 0 ? recommendBuy.map(r => \`<li>\${r}</li>\`).join('') : '<li>Inventory levels stable. No immediate procurement needed.</li>';

        let wsRows = '';
        Store.workstations.forEach(ws => {
            const load = active.filter(t => Ops.workstationOf(t) === ws).length;
            const overdue = active.filter(t => Ops.workstationOf(t) === ws && t.status === 'Overdue').length;
            const risk = overdue > 0 ? '<span style="color:var(--danger)">High</span>' : load > 8 ? '<span style="color:var(--warning)">Medium</span>' : 'Low';
            wsRows += \`<tr><td>\${Utils.esc(ws)}</td><td>\${load}</td><td>\${overdue}</td><td>\${risk}</td></tr>\`;
        });

        const warnings = active.filter(t => t.status === 'Overdue' || t.status === 'Maintenance');
        const warnHtml = warnings.length
            ? warnings.map(w => \`<li><strong>\${Utils.esc(w.id)}</strong> (\${Utils.esc(w.name)}) — \${Utils.esc(w.status)}</li>\`).join('')
            : '<li>No current warnings. All clear.</li>';

        document.getElementById('report5sContent').innerHTML = \`
            <div style="display:flex; justify-content:space-between; margin-bottom:20px; gap:10px;">
                <div style="flex:1; text-align:center;">
                    <div style="font-size:2rem; color:\${rate > 90 ? 'var(--success)' : 'var(--warning)'}; font-weight:bold;">\${rate}%</div>
                    <div style="color:var(--text-muted); text-transform:uppercase; font-size:0.8rem;">5S Compliance Rate</div>
                </div>
                <div style="flex:1; text-align:center; border-left:1px solid var(--border);">
                    <div style="font-size:2rem; color:var(--primary-hover); font-weight:bold;">\${active.length}</div>
                    <div style="color:var(--text-muted); text-transform:uppercase; font-size:0.8rem;">Total Audited Tools</div>
                </div>
            </div>
            <h4 style="color:var(--primary); margin-bottom:10px; border-bottom:1px dashed var(--border); padding-bottom:5px;">Status Breakdown</h4>
            <table>
                <tr><th>Status</th><th>Count</th></tr>
                <tr><td>Active</td><td>\${count('Active')}</td></tr>
                <tr><td>Issued</td><td>\${count('Issued')}</td></tr>
                <tr><td>Backup</td><td>\${count('Backup')}</td></tr>
                <tr><td>Maintenance</td><td>\${count('Maintenance')}</td></tr>
                <tr><td>Overdue</td><td>\${count('Overdue')}</td></tr>
                <tr><td>Decommissioned (Retired)</td><td>\${retired.length}</td></tr>
            </table>
            
            <h4 style="color:var(--primary); margin-top:20px; margin-bottom:10px; border-bottom:1px dashed var(--border); padding-bottom:5px;">Decommissioning Statistics & Dynamics</h4>
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <div style="flex:1; text-align:center;">
                    <div style="font-size:1.5rem; font-weight:bold;">\${retired.length}</div>
                    <div style="color:var(--text-muted); font-size:0.8rem;">Total Retired</div>
                </div>
                <div style="flex:1; text-align:center; border-left:1px solid var(--border);">
                    <div style="font-size:1.2rem; font-weight:bold;">\${Utils.esc(freqReason)}</div>
                    <div style="color:var(--text-muted); font-size:0.8rem;">Most Frequent Reason</div>
                </div>
            </div>
            <h5>Recently Decommissioned</h5>
            <ul style="font-size:0.9rem;">
                \${recentRetiredHtml || '<li>None</li>'}
            </ul>

            <h4 style="color:var(--primary); margin-top:20px; margin-bottom:10px; border-bottom:1px dashed var(--border); padding-bottom:5px;">Procurement Recommendations</h4>
            <ul style="font-size:0.9rem;">\${procurementHtml}</ul>

            <h4 style="color:var(--primary); margin-top:20px; margin-bottom:10px; border-bottom:1px dashed var(--border); padding-bottom:5px;">Workstation Tool Load &amp; Loss Risk</h4>
            <table>
                <tr><th>Workstation</th><th>Tool Load</th><th>Overdue</th><th>Risk Index</th></tr>
                \${wsRows}
            </table>
            <h4 style="color:var(--danger); margin-top:20px; margin-bottom:10px; border-bottom:1px dashed var(--border); padding-bottom:5px;">Overdue / Maintenance Warnings</h4>
            <ul style="font-size:0.9rem;">\${warnHtml}</ul>
            <h4 style="color:var(--success); margin-top:20px; margin-bottom:10px; border-bottom:1px dashed var(--border); padding-bottom:5px;">Kaizen Recommendations</h4>
            \${Kaizen.render()}\`;
        openModal('report5sModal');
    },`;

const print5SNew = `print5S() {
        const active = Store.activeTools();
        const compliant = active.filter(t => ['Active', 'Issued', 'Backup'].includes(t.status)).length;
        const rate = active.length ? ((compliant / active.length) * 100).toFixed(1) : '100.0';
        const count = s => active.filter(t => t.status === s).length;

        const retired = Store.tools.filter(t => t.status === 'Retired' || t.status === 'retired');
        const getRetireInfo = (t) => {
            let reason = t.retireReason || null;
            let ts = t.updatedAt || ''; 
            let evt = t.history ? t.history.find(h => h.includes('Retired on') || h.includes('Retired:') || h.includes('Decommissioned:')) : null;
            if (evt) {
                ts = evt.split('|')[0].trim();
                if (!reason) {
                    let rMatch = evt.match(/Reason:\\s*([^,)]+)/);
                    if (rMatch) reason = rMatch[1].trim();
                    else if (evt.includes('Retired:')) reason = evt.split('Retired:')[1].trim();
                    else if (evt.includes('Decommissioned:')) reason = evt.split('Decommissioned:')[1].trim();
                }
            }
            return { tool: t, reason: reason || 'Wear > 75% / Damaged', ts };
        };
        const retiredData = retired.map(getRetireInfo);
        retiredData.sort((a, b) => b.ts.localeCompare(a.ts));

        let reasonsMap = {};
        let retiredCategories = {};
        retiredData.forEach(d => { 
            reasonsMap[d.reason] = (reasonsMap[d.reason] || 0) + 1; 
            let cat = d.tool.category || 'General Tools';
            retiredCategories[cat] = (retiredCategories[cat] || 0) + 1;
        });
        let freqReason = 'N/A';
        let maxC = 0;
        for (let r in reasonsMap) { if (reasonsMap[r] > maxC) { maxC = reasonsMap[r]; freqReason = r; } }

        const recentRetiredHtml = retiredData.slice(0, 5).map(d => \`<li><strong>\${Utils.esc(d.tool.id)}</strong> (\${Utils.esc(d.tool.name)}) — \${Utils.esc(d.reason)}</li>\`).join('');
        
        let recommendBuy = [];
        for (let c in retiredCategories) {
            if (retiredCategories[c] >= 2) recommendBuy.push(\`Order replacement for \${Utils.esc(c)} due to high retirement rate.\`);
        }
        if (recommendBuy.length === 0 && retiredData.length > 0) {
            let topCat = Object.keys(retiredCategories).sort((a,b) => retiredCategories[b] - retiredCategories[a])[0];
            recommendBuy.push(\`Consider ordering replacements for \${Utils.esc(topCat)} tools.\`);
        }
        const procurementHtml = recommendBuy.length > 0 ? recommendBuy.map(r => \`<li>\${r}</li>\`).join('') : '<li>Inventory levels stable. No immediate procurement needed.</li>';

        // Радар 5S текстом: оценки по столпам из тех же вычислений, что и график
        const pillars = Charts.compute5S().map(p =>
            \`<tr><td>\${Utils.esc(p.pillar)}</td><td>\${p.score}/5</td><td>\${Utils.esc(p.desc)}</td></tr>\`).join('');

        // Культура станций: те же данные, что и на радаре дашборда
        const culture = Charts.computeCulture().map(c => {
            const cls = c.score >= 80 ? 'pz-ok' : c.score >= 60 ? 'pz-warn' : 'pz-bad';
            return \`<tr><td>\${c.mark || ''} \${Utils.esc(c.pillar)}</td><td>\${c.score}/100</td><td>\${Utils.esc(c.desc)}</td></tr>\`;
        }).join('');

        const wsRows = Store.workstations.map(ws => {
            const tools = active.filter(t => Ops.workstationOf(t) === ws);
            const overdue = tools.filter(t => t.status === 'Overdue').length;
            const risk = overdue > 0 ? '<span class="pz-bad">High</span>' : tools.length > 8 ? '<span class="pz-warn">Medium</span>' : 'Low';
            return \`<tr><td>\${Utils.esc(ws)}</td><td>\${tools.length}</td><td>\${overdue}</td><td>\${risk}</td></tr>\`;
        }).join('');

        const warnings = active.filter(t => t.status === 'Overdue' || t.status === 'Maintenance');
        const warnHtml = warnings.length
            ? warnings.map(w => \`<li><strong>\${Utils.esc(w.id)}</strong> (\${Utils.esc(w.name)}) — \${Utils.esc(w.status)}</li>\`).join('')
            : '<li>No current warnings. All clear.</li>';

        Utils.printHtml(\`
            <h1>5S Production Engineering Audit Report</h1>
            <div class="pz-meta">Generated: \${Utils.fmtDate(Utils.nowISO())} · By: \${Utils.esc(Auth.current.username)} (\${Utils.esc(Auth.current.role)}) · 5S Tools Inventory</div>
            <div class="pz-kpis">
                <div class="pz-kpi"><b class="\${rate > 90 ? 'pz-ok' : 'pz-warn'}">\${rate}%</b>5S Compliance Rate</div>
                <div class="pz-kpi"><b>\${active.length}</b>Total Audited Tools</div>
                <div class="pz-kpi"><b class="\${count('Overdue') ? 'pz-bad' : 'pz-ok'}">\${count('Overdue')}</b>Overdue</div>
                <div class="pz-kpi"><b class="\${count('Maintenance') ? 'pz-warn' : 'pz-ok'}">\${count('Maintenance')}</b>In Maintenance</div>
            </div>
            <h2>Status Breakdown</h2>
            <table><tr><th>Status</th><th>Count</th></tr>
                <tr><td>Active</td><td>\${count('Active')}</td></tr>
                <tr><td>Issued</td><td>\${count('Issued')}</td></tr>
                <tr><td>Backup</td><td>\${count('Backup')}</td></tr>
                <tr><td>Maintenance</td><td>\${count('Maintenance')}</td></tr>
                <tr><td>Overdue</td><td>\${count('Overdue')}</td></tr>
                <tr><td>Decommissioned (Retired)</td><td>\${retired.length}</td></tr>
            </table>

            <h2>Decommissioning Statistics & Dynamics</h2>
            <table>
                <tr><th>Total Retired</th><th>Most Frequent Reason</th></tr>
                <tr><td>\${retired.length}</td><td>\${Utils.esc(freqReason)}</td></tr>
            </table>
            <h3>Recently Decommissioned</h3>
            <ul>\${recentRetiredHtml || '<li>None</li>'}</ul>

            <h2>Procurement Recommendations</h2>
            <ul>\${procurementHtml}</ul>

            <h2>5S Pillars Assessment</h2>
            <table><tr><th>Pillar</th><th>Score</th><th>Finding</th></tr>\${pillars}</table>
            <h2>Workstation Production Culture</h2>
            <table><tr><th>Station</th><th>Score</th><th>Details</th></tr>\${culture}</table>
            <h2>Workstation Tool Load &amp; Loss Risk</h2>
            <table><tr><th>Workstation</th><th>Tool Load</th><th>Overdue</th><th>Risk Index</th></tr>\${wsRows}</table>
            <h2>Overdue / Maintenance Warnings</h2>
            <ul>\${warnHtml}</ul>
        \`);
    }`;

content = content.replace(generate5SRegex, generate5SNew);
content = content.replace(print5SRegex, print5SNew);

fs.writeFileSync('index.html', content);
