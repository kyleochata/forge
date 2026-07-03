const http = require('http');
const { spawn } = require('child_process');
const { deepStrictEqual } = require('assert');

(async () => {
  let child = null;
  try {
    // Spawn the server with PORT=0 (ephemeral)
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0' }
    });

    // Wait for server to start and extract port
    const port = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout waiting for server to start'));
      }, 5000);

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
        const match = output.match(/listening (\d+)/);
        if (match) {
          clearTimeout(timeoutId);
          resolve(match[1]);
        }
      });

      child.on('error', reject);
    });

    // Test /health endpoint
    const healthResponse = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/health`, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        });
      }).on('error', reject);
    });

    // Validate health response
    if (healthResponse.statusCode !== 200) {
      throw new Error(`Expected status 200, got ${healthResponse.statusCode}`);
    }
    if (!healthResponse.headers['content-type']?.includes('application/json')) {
      throw new Error(`Expected content-type to include 'application/json', got ${healthResponse.headers['content-type']}`);
    }
    const healthBody = JSON.parse(healthResponse.body);
    deepStrictEqual(healthBody, { status: 'ok' });

    // Test / endpoint still works
    const rootResponse = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve(body);
        });
      }).on('error', reject);
    });

    if (rootResponse !== 'hello') {
      throw new Error(`Expected / to return 'hello', got '${rootResponse}'`);
    }

    console.log('PASS');
    process.exit(0);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  } finally {
    if (child) {
      child.kill();
    }
  }
})();
