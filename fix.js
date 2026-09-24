const fs = require('fs');
['app/vendor/login/page.tsx', 'app/vendor/sell/page.tsx'].forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, content.replace(/"selection"/g, '"confirmation"'));
});
