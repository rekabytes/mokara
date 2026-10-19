CREATE TABLE support_sites (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
 name TEXT NOT NULL, origins TEXT[] NOT NULL, accent TEXT NOT NULL DEFAULT '#6366f1',
 greeting TEXT NOT NULL DEFAULT 'Report an issue or send a request.', enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL,
 UNIQUE(id,team_id), CHECK(cardinality(origins) BETWEEN 1 AND 10), CHECK(accent ~ '^#[0-9a-fA-F]{6}$')
);
CREATE INDEX support_sites_team_id_idx ON support_sites(team_id);
CREATE TABLE support_tickets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
 site_id UUID NOT NULL, owner_id UUID NOT NULL, submission_id UUID NOT NULL UNIQUE, submission_hash TEXT NOT NULL,
 reference TEXT NOT NULL UNIQUE, subject TEXT NOT NULL, details TEXT NOT NULL, request_type TEXT NOT NULL, area TEXT NOT NULL,
 customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', priority TEXT NOT NULL DEFAULT 'medium',
 assignee_id UUID REFERENCES users(id) ON DELETE SET NULL, task_id UUID UNIQUE REFERENCES tasks(id) ON DELETE SET NULL,
 access_hash TEXT NOT NULL UNIQUE, access_encrypted TEXT NOT NULL, access_expires_at TIMESTAMPTZ(3) NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL,
 UNIQUE(id,team_id), FOREIGN KEY(site_id,team_id) REFERENCES support_sites(id,team_id) ON DELETE CASCADE,
 CHECK(status IN ('open','in_progress','waiting','resolved')), CHECK(priority IN ('low','medium','high'))
);
CREATE INDEX support_tickets_team_id_created_at_id_idx ON support_tickets(team_id,created_at,id);
CREATE INDEX support_tickets_owner_id_created_at_idx ON support_tickets(owner_id,created_at);
CREATE TABLE support_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
 request_id UUID NOT NULL UNIQUE, author TEXT NOT NULL, internal BOOLEAN NOT NULL DEFAULT FALSE, body TEXT NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX support_messages_ticket_id_created_at_id_idx ON support_messages(ticket_id,created_at,id);
CREATE TABLE support_emails (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id UUID NOT NULL,
 recipient TEXT NOT NULL, subject TEXT NOT NULL, text_encrypted TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 sent_at TIMESTAMPTZ(3), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX support_emails_sent_at_next_attempt_at_idx ON support_emails(sent_at,next_attempt_at);
ALTER TABLE workspace_files ADD COLUMN support_ticket_id UUID;
ALTER TABLE workspace_files ADD CONSTRAINT workspace_files_support_ticket_fkey FOREIGN KEY(support_ticket_id,team_id) REFERENCES support_tickets(id,team_id) ON DELETE CASCADE;
CREATE INDEX workspace_files_support_ticket_id_idx ON workspace_files(support_ticket_id);
