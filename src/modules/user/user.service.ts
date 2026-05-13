import { authClient } from "../../lib/auth.js";

// ─── Query / payload types ─────────────────────────────────────────────────

export interface ListUsersQuery {
  searchValue?: string;
  searchField?: "email" | "name";
  searchOperator?: "contains" | "starts_with" | "ends_with";
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  filterField?: string;
  filterValue?: string;
  filterOperator?: string;
}

// ─── Services ──────────────────────────────────────────────────────────────
// Every service receives the forwarded admin session headers so Better Auth
// can authenticate the caller against its own session store.

export const listUsersService = (
  query: ListUsersQuery,
  headers: globalThis.Headers,
) =>
  authClient.api.listUsers({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: query as any,
    headers,
  });

export const getUserService = (id: string, headers: globalThis.Headers) =>
  authClient.api.getUser({
    query: { id },
    headers,
  });

export const updateUserService = (
  userId: string,
  data: Record<string, unknown>,
  headers: globalThis.Headers,
) =>
  authClient.api.updateUser({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: { userId, data } as any,
    headers,
  });

export const removeUserService = (
  userId: string,
  headers: globalThis.Headers,
) =>
  authClient.api.removeUser({
    body: { userId },
    headers,
  });

// Better Auth's admin setRole only accepts its built-in "user"|"admin" roles.
// Our app uses custom roles (MEMBER, COACH, ADMIN) stored as an additionalField,
// so we update the role field via updateUser instead.
export const setUserRoleService = (
  userId: string,
  role: string,
  headers: globalThis.Headers,
) =>
  authClient.api.updateUser({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: { userId, data: { role } } as any,
    headers,
  });

export const setUserPasswordService = (
  userId: string,
  newPassword: string,
  headers: globalThis.Headers,
) =>
  authClient.api.setUserPassword({
    body: { userId, newPassword },
    headers,
  });

export const banUserService = (
  userId: string,
  banReason: string | undefined,
  banExpiresIn: number | undefined,
  headers: globalThis.Headers,
) =>
  authClient.api.banUser({
    body: { userId, banReason, banExpiresIn },
    headers,
  });

export const unbanUserService = (userId: string, headers: globalThis.Headers) =>
  authClient.api.unbanUser({
    body: { userId },
    headers,
  });

export const listUserSessionsService = (
  userId: string,
  headers: globalThis.Headers,
) =>
  authClient.api.listUserSessions({
    body: { userId },
    headers,
  });

export const revokeUserSessionService = (
  sessionToken: string,
  headers: globalThis.Headers,
) =>
  authClient.api.revokeUserSession({
    body: { sessionToken },
    headers,
  });

export const revokeAllUserSessionsService = (
  userId: string,
  headers: globalThis.Headers,
) =>
  authClient.api.revokeUserSessions({
    body: { userId },
    headers,
  });

export const impersonateUserService = (
  userId: string,
  headers: globalThis.Headers,
) =>
  authClient.api.impersonateUser({
    body: { userId },
    headers,
    returnHeaders: true,
  });

export const stopImpersonatingService = (headers: globalThis.Headers) =>
  authClient.api.stopImpersonating({
    headers,
    returnHeaders: true,
  });
