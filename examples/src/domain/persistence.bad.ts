// Intermediate persistence example (before): domain layer coupled to database driver.
// - Imports the adapter directly (`importsBoundary` violation).
// - Executes IO in the domain instead of delegating to a port.
// - Uses mutable objects and raw throws for error handling.

import { client } from "../adapters/persistence.ts"; // Rule violation: adapters must depend on domain, not the other way around.

const TABLE = "users";

type UserRecord = {
  id?: number;
  email: string;
  roles: string[];
};

export async function insertUser(record: UserRecord): Promise<number> {
  if (!record.email.includes("@")) {
    throw new Error("Invalid email"); // Result rule violation.
  }
  const result = await client.query(
    `INSERT INTO ${TABLE} (email, roles) VALUES ($1, $2) RETURNING id`,
    [
      record.email,
      JSON.stringify(record.roles),
    ],
  );
  if (!result.rows?.[0]) {
    throw new Error("Insert failed"); // Hidden coupling to driver.
  }
  record.id = result.rows[0].id; // Mutation of argument.
  return record.id;
}

export async function listAdmins(): Promise<UserRecord[]> {
  const result = await client.query(
    `SELECT * FROM ${TABLE} WHERE roles ? 'admin'`,
  );
  console.log("Loaded admins", result.rowCount); // Side effect in domain.
  return result.rows;
}
