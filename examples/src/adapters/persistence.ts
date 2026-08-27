// Persistence adapter: keeps data in memory for demonstration purposes.
//
// Mutable state and in-place updates live here on purpose. This is the layer
// that owns them, which is what lets the domain modules that use this port stay
// pure. Nothing awaits, because there is no driver to await, so the port's
// promise is returned directly rather than through an empty `async`.

import type {
  UserRecord,
  UserRepositoryPort,
  UserRow,
} from "../domain/persistence.good.ts";

let nextId = 3;
const rows: UserRow[] = [
  { id: 1, email: "admin@example.com", roles: ["admin"] as readonly string[] },
  { id: 2, email: "user@example.com", roles: ["user"] as readonly string[] },
];

export const inMemoryRepo: UserRepositoryPort = {
  insert(record: UserRecord) {
    const row: UserRow = {
      id: nextId++,
      email: record.email,
      roles: [...record.roles] as readonly string[],
    };
    rows.push(row);
    return Promise.resolve(row.id);
  },
  findByRole(role: string) {
    return Promise.resolve(rows.filter((row) => row.roles.includes(role)));
  },
};

export const reset = () => {
  nextId = 3;
  rows.splice(2);
};
