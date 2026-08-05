const fs = require('fs');
const html = fs.readFileSync('/home/admin/Documents/Inventory-System/index.html', 'utf8');
const scripts = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi) || [];
scripts.forEach((s, i) => {
    const code = s.replace(/<script[\s\S]*?>/, '').replace(/<\/script>/, '');
    try {
        new Function(code);
    } catch(e) {
        console.error('Error in script ' + i, e.message);
    }
});
console.log('Scripts checked.');
