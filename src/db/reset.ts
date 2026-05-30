import { Database } from "bun:sqlite";
import { dirname } from "path";

const DB_PATH = process.env.DB_PATH || "./data/serverbot.db";

const db = new Database(DB_PATH);

const result = db.run("DELETE FROM servers");
console.log(`Deleted ${result.changes} server(s) from database`);
