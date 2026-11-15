// Intermediate persistence example (before): domain layer coupled to database driver.
// - Imports the adapter directly (`layer-boundary` violation).
// - Executes IO in the domain instead of delegating to a port.
// - Uses mutable objects and raw throws for error handling.

import { client } from "../adapters/persistence.ts"; // layer-boundary

const TABLE = "users";

type UserId = number;

type UserRecord = {
  id?: number; // readonly-data
  email: string; // readonly-data
  roles: string[]; // readonly-data twice: property and array
};

export async function insertUser(record: UserRecord): Promise<UserId> {
  if (!record.email.includes("@")) {
    throw new Error("Invalid email"); // no-throw
  }
  const result = await client.query(
    `INSERT INTO ${TABLE} (email, roles) VALUES ($1, $2) RETURNING id`,
    [
      record.email,
      JSON.stringify(record.roles),
    ],
  );
  if (!result.rows?.[0]) {
    throw new Error("Insert failed"); // no-throw
  }
  // This mutation is a semantic problem, but no current rule reports assignments.
  record.id = result.rows[0].id;
  return record.id;
}

export async function listAdmins(): Promise<UserRecord[]> {
  const result = await client.query(
    `SELECT * FROM ${TABLE} WHERE roles ? 'admin'`,
  );
  console.log("Loaded admins", result.rowCount); // no-ambient-effects, no-discarded-values
  return result.rows;
}
