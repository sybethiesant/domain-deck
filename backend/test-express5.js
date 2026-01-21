const express = require('express');

const app = express();
const router = express.Router();

// Simple test routes
router.get('/test', (req, res) => res.json({ route: 'test' }));
router.get('/:id', (req, res) => res.json({ route: 'id', id: req.params.id }));
router.get('/:id/dns', (req, res) => res.json({ route: 'id-dns', id: req.params.id }));
router.get('/:id/url-forwarding', (req, res) => res.json({ route: 'id-url', id: req.params.id }));

app.use('/api/domains', router);

const server = app.listen(5002, () => {
  console.log('Test server on 5002');
  
  // Make test requests
  const http = require('http');
  
  const tests = [
    '/api/domains/test',
    '/api/domains/93',
    '/api/domains/93/dns',
    '/api/domains/93/url-forwarding'
  ];
  
  let completed = 0;
  tests.forEach(path => {
    http.get('http://localhost:5002' + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(path, '->', res.statusCode, data);
        completed++;
        if (completed === tests.length) {
          server.close();
          process.exit(0);
        }
      });
    }).on('error', (e) => {
      console.log(path, '-> ERROR', e.message);
      completed++;
      if (completed === tests.length) {
        server.close();
        process.exit(0);
      }
    });
  });
});
