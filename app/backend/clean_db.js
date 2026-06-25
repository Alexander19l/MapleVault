const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = process.argv[2]
  || process.env.DATABASE_PATH
  || path.resolve(__dirname, '../data/database.sqlite');

if (!fs.existsSync(dbPath)) {
  console.error(`DB not found at: ${dbPath}`);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath);

db.run('DELETE FROM chat_messages', function cleanChatMessages(err) {
  if (err) {
    console.error(err.message);
    process.exitCode = 1;
  } else {
    console.log(`Deleted ${this.changes} chat messages from ${dbPath}`);
  }
  db.close();
});
