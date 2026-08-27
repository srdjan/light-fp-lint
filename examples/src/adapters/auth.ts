// Adapter implementation for the auth example.
// Demonstrates how adapters can own the side effects while the domain stays pure.

import type { LoginPorts, UserRecord } from "../domain/auth_flow.good.ts";

type StoredUser = {
  readonly id: number;
  readonly email: string;
  readonly passwordHash: string;
  readonly roles: readonly string[];
  readonly isLocked: boolean;
};

const USERS: StoredUser[] = [
  {
    id: 1,
    email: "admin@example.com",
    passwordHash: "hash:SuperSecurePass12",
    roles: ["admin"],
    isLocked: false,
  },
  {
    id: 2,
    email: "user@example.com",
    passwordHash: "hash:UserPassword987",
    roles: ["user"],
    isLocked: false,
  },
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const authPorts: LoginPorts = {
  clock: () => Date.now(),
  async hashPassword(plain) {
    await delay(5); // Simulate async hashing.
    return `hash:${plain}`;
  },
  async verifyPassword({ plain, hash }) {
    await delay(5);
    return hash === `hash:${plain}`;
  },
  async lookupUser(email) {
    await delay(5);
    const stored = USERS.find((user) => user.email === email);
    if (!stored) return null;
    return {
      id: stored.id,
      email: stored.email as UserRecord["email"],
      passwordHash: stored.passwordHash,
      roles: stored.roles,
      isLocked: stored.isLocked,
    };
  },
  async issueToken({ userId, roles, issuedAt }) {
    await delay(5);
    return `token:${userId}:${roles.join(",")}:${issuedAt}`;
  },
};
