// Persistence adapter: keeps data in memory for demonstration purposes.

import type { UserRecord, UserRepositoryPort, UserRow } from "../domain/persistence.good.ts";

let nextId = 3;
const rows: UserRow[] = [
  { id: 1, email: "admin@example.com", roles: ["admin"] as readonly string[] },
  { id: 2, email: "user@example.com", roles: ["user"] as readonly string[] },
];

export const inMemoryRepo: UserRepositoryPort = {
  async insert(record: UserRecord) {
    const row: UserRow = {
      id: nextId++,
      email: record.email,
      roles: [...record.roles] as readonly string[],
    };
    rows.push(row);
    return row.id;
  },
  async findByRole(role: string) {
    return rows.filter((row) => row.roles.includes(role));
  },
};

export const reset = () => {
  nextId = 3;
  rows.splice(2);
};
