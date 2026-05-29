import db from "./index";

console.log("✅ Database initialized successfully");
console.log(`📁 Database path: ${process.env.DB_PATH || "./data/serverbot.db"}`);

// Verify tables exist
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(`📋 Tables: ${tables.map((t: any) => t.name).join(", ")}`);
