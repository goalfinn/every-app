import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./auth.schema";
/** Explicit rollout membership; absence is denied, never inferred from an email domain. */
export const officeIdentityMembers = sqliteTable("office_identity_members", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  sessionVersion: integer("session_version").notNull().default(1),
  mailClientsAllowed: integer("mail_clients_allowed").notNull().default(0),
});
