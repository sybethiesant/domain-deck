process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT:', err.message);
  console.error(err.stack);
});

try {
  console.log('Loading domains.js...');
  const domains = require('./routes/domains');
  console.log('Loaded! Stack length:', domains.stack.length);

  // List all routes
  console.log('\nRoutes:');
  domains.stack.forEach((layer, i) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(',');
      console.log(i + ': ' + methods.toUpperCase() + ' ' + layer.route.path);
    }
  });
} catch (err) {
  console.error('ERROR loading domains.js:', err.message);
  console.error(err.stack);
}
