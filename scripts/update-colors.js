const fs = require('fs');

function replaceColors(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  content = content.replace(/#0F4C81/g, 'var(--brand-navy)');
  content = content.replace(/#F9FBFD/g, 'var(--brand-off-white)');
  content = content.replace(/#2B547E/g, 'var(--brand-navy-light)');
  
  // Dashboard specific flex layout fix
  if (filePath.includes('dashboard')) {
    content = content.replace(
      'className="flex border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-[4px_4px_0px_0px_var(--brand-navy)] overflow-hidden"',
      'className="flex flex-col sm:flex-row border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-[4px_4px_0px_0px_var(--brand-navy)] overflow-hidden"'
    );
    content = content.replace(
      'border-l-4 border-[var(--brand-navy)]',
      'border-t-4 sm:border-t-0 sm:border-l-4 border-[var(--brand-navy)]'
    );
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

replaceColors('./app/admin/dashboard/page.tsx');
replaceColors('./app/admin/scanner/page.tsx');
console.log('Colors replaced and layout updated.');
