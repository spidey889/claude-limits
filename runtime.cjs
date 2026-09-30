'use strict';
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
module.exports = {
  pipe: '\\\\.\\pipe\\claude-limits-' + crypto.createHash('sha256').update(os.userInfo().username).digest('hex').slice(0, 20),
  keyPath: path.join(__dirname, '.runtime-key'),
  snapshotPath: path.join(__dirname, '.usage-snapshot.json'),
};
