CREATE TABLE `jwkss` (
	`id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`alg` text,
	`crv` text
);
--> statement-breakpoint
CREATE TABLE `office_oidc_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`refresh_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `office_oidc_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refresh_id`) REFERENCES `office_oidc_refresh_tokens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_oidc_access_tokens_token_unique` ON `office_oidc_access_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `officeOidcAccessTokens_clientId_idx` ON `office_oidc_access_tokens` (`client_id`);--> statement-breakpoint
CREATE INDEX `officeOidcAccessTokens_sessionId_idx` ON `office_oidc_access_tokens` (`session_id`);--> statement-breakpoint
CREATE INDEX `officeOidcAccessTokens_userId_idx` ON `office_oidc_access_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `officeOidcAccessTokens_authorizationCodeId_idx` ON `office_oidc_access_tokens` (`authorization_code_id`);--> statement-breakpoint
CREATE INDEX `officeOidcAccessTokens_refreshId_idx` ON `office_oidc_access_tokens` (`refresh_id`);--> statement-breakpoint
CREATE TABLE `office_oidc_client_assertions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `office_oidc_client_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata` text,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `office_oidc_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `office_oidc_resources`(`identifier`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `officeOidcClientResources_clientId_resourceId_uidx` ON `office_oidc_client_resources` (`client_id`,`resource_id`);--> statement-breakpoint
CREATE INDEX `officeOidcClientResources_clientId_idx` ON `office_oidc_client_resources` (`client_id`);--> statement-breakpoint
CREATE INDEX `officeOidcClientResources_resourceId_idx` ON `office_oidc_client_resources` (`resource_id`);--> statement-breakpoint
CREATE TABLE `office_oidc_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text,
	`client_discovery_id` text,
	`disabled` integer DEFAULT false,
	`skip_consent` integer,
	`enable_end_session` integer,
	`subject_type` text,
	`scopes` text,
	`client_credentials_scopes` text DEFAULT '[]',
	`user_id` text,
	`created_at` integer,
	`updated_at` integer,
	`name` text,
	`uri` text,
	`icon` text,
	`contacts` text,
	`tos` text,
	`policy` text,
	`software_id` text,
	`software_version` text,
	`software_statement` text,
	`redirect_uris` text NOT NULL,
	`post_logout_redirect_uris` text,
	`backchannel_logout_uri` text,
	`backchannel_logout_session_required` integer,
	`token_endpoint_auth_method` text,
	`application_type` text,
	`jwks` text,
	`jwks_uri` text,
	`grant_types` text,
	`response_types` text,
	`require_pkce` integer,
	`dpop_bound_access_tokens` integer DEFAULT false,
	`reference_id` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_oidc_clients_client_id_unique` ON `office_oidc_clients` (`client_id`);--> statement-breakpoint
CREATE INDEX `officeOidcClients_userId_idx` ON `office_oidc_clients` (`user_id`);--> statement-breakpoint
CREATE TABLE `office_oidc_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text,
	`reference_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `office_oidc_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `officeOidcConsents_clientId_idx` ON `office_oidc_consents` (`client_id`);--> statement-breakpoint
CREATE INDEX `officeOidcConsents_userId_idx` ON `office_oidc_consents` (`user_id`);--> statement-breakpoint
CREATE TABLE `office_oidc_refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`rotated_at` integer,
	`rotation_replay_response` text,
	`rotation_replay_expires_at` integer,
	`auth_time` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `office_oidc_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_oidc_refresh_tokens_token_unique` ON `office_oidc_refresh_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `officeOidcRefreshTokens_clientId_idx` ON `office_oidc_refresh_tokens` (`client_id`);--> statement-breakpoint
CREATE INDEX `officeOidcRefreshTokens_sessionId_idx` ON `office_oidc_refresh_tokens` (`session_id`);--> statement-breakpoint
CREATE INDEX `officeOidcRefreshTokens_userId_idx` ON `office_oidc_refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `officeOidcRefreshTokens_authorizationCodeId_idx` ON `office_oidc_refresh_tokens` (`authorization_code_id`);--> statement-breakpoint
CREATE TABLE `office_oidc_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`access_token_ttl` integer,
	`refresh_token_ttl` integer,
	`signing_algorithm` text,
	`signing_key_id` text,
	`allowed_scopes` text,
	`custom_claims` text,
	`dpop_bound_access_tokens_required` integer DEFAULT false,
	`disabled` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer,
	`policy_version` integer DEFAULT 1,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_oidc_resources_identifier_unique` ON `office_oidc_resources` (`identifier`);--> statement-breakpoint
CREATE TABLE `office_identity_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`session_version` integer DEFAULT 1 NOT NULL,
	`mail_clients_allowed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE TRIGGER identity_password_update AFTER UPDATE OF password ON accounts WHEN OLD.password IS NOT NEW.password AND NEW.provider_id='credential' BEGIN
 UPDATE office_identity_members SET session_version=session_version+1 WHERE user_id=NEW.user_id;
END;

--> statement-breakpoint
CREATE TRIGGER identity_password_insert AFTER INSERT ON accounts WHEN NEW.provider_id='credential' BEGIN
 UPDATE office_identity_members SET session_version=session_version+1 WHERE user_id=NEW.user_id;
END;

--> statement-breakpoint
CREATE TRIGGER identity_password_delete AFTER DELETE ON accounts WHEN OLD.provider_id='credential' BEGIN
 UPDATE office_identity_members SET session_version=session_version+1 WHERE user_id=OLD.user_id;
END;

--> statement-breakpoint
CREATE TRIGGER identity_user_status AFTER UPDATE OF status,banned ON users WHEN OLD.status IS NOT NEW.status OR OLD.banned IS NOT NEW.banned BEGIN
 UPDATE office_identity_members SET session_version=session_version+1 WHERE user_id=NEW.id;
END;

--> statement-breakpoint
CREATE TRIGGER identity_membership_delete AFTER DELETE ON members WHEN 1 BEGIN
 UPDATE office_identity_members SET session_version=session_version+1 WHERE user_id=OLD.user_id;
END;

--> statement-breakpoint
CREATE TRIGGER identity_membership_update AFTER UPDATE OF user_id,organization_id ON members WHEN 1 BEGIN
 UPDATE office_identity_members SET session_version=session_version+1 WHERE user_id=OLD.user_id;
END;

--> statement-breakpoint
CREATE TRIGGER identity_client_policy AFTER UPDATE OF kind,mail_clients_allowed ON office_identity_members WHEN OLD.kind IS NOT NEW.kind OR OLD.mail_clients_allowed IS NOT NEW.mail_clients_allowed BEGIN
 UPDATE office_identity_members SET session_version=session_version+1 WHERE user_id=NEW.user_id;
END;

--> statement-breakpoint
CREATE TRIGGER identity_org_status AFTER UPDATE OF status ON organizations WHEN OLD.status IS NOT NEW.status BEGIN
 UPDATE office_identity_members SET session_version=session_version+1 WHERE user_id IN (SELECT user_id FROM members WHERE organization_id=NEW.id);
END;

--> statement-breakpoint
CREATE TRIGGER identity_active_session_delete AFTER DELETE ON sessions WHEN OLD.expires_at > unixepoch()*1000 BEGIN
 UPDATE office_identity_members SET session_version=session_version+1 WHERE user_id=OLD.user_id;
END;
