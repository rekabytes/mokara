BEGIN;
CREATE TABLE kpi_goals (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
 creator_id UUID REFERENCES users(id) ON DELETE SET NULL, owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
 owner_name TEXT NOT NULL, name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
 scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal','team')),
 measurement TEXT NOT NULL CHECK (measurement IN ('number','percentage','money')), unit TEXT,
 baseline NUMERIC(20,4) NOT NULL, target NUMERIC(20,4) NOT NULL, current_value NUMERIC(20,4),
 start_date DATE NOT NULL, end_date DATE NOT NULL, last_observed_on DATE, last_check_in_at TIMESTAMPTZ(3),
 archived BOOLEAN NOT NULL DEFAULT FALSE, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 request_id UUID NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 UNIQUE(id,team_id), CHECK(target <> baseline), CHECK(end_date >= start_date),
 CHECK(last_observed_on IS NULL OR last_observed_on BETWEEN start_date AND end_date),
 CHECK(measurement <> 'money' OR (unit IS NOT NULL AND unit ~ '^[A-Z]{3}$')),
 CHECK(measurement <> 'percentage' OR (baseline BETWEEN 0 AND 100 AND target BETWEEN 0 AND 100 AND (current_value IS NULL OR current_value BETWEEN 0 AND 100)))
);
CREATE INDEX kpi_goals_team_id_created_at_id_idx ON kpi_goals(team_id,created_at,id);
CREATE TABLE kpi_goal_contributors (
 goal_id UUID NOT NULL, team_id UUID NOT NULL, user_id UUID NOT NULL, PRIMARY KEY(goal_id,user_id),
 FOREIGN KEY(goal_id,team_id) REFERENCES kpi_goals(id,team_id) ON DELETE CASCADE,
 FOREIGN KEY(team_id,user_id) REFERENCES team_members(team_id,user_id) ON DELETE CASCADE
);
CREATE TABLE kpi_goal_entries (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sequence BIGSERIAL UNIQUE NOT NULL,
 goal_id UUID NOT NULL REFERENCES kpi_goals(id) ON DELETE CASCADE,
 author_id UUID REFERENCES users(id) ON DELETE SET NULL, author_name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('created','check_in','details_changed')),
 value NUMERIC(20,4), observed_on DATE, note TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0),
 snapshot JSONB NOT NULL, request_id UUID NOT NULL, request_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(), UNIQUE(goal_id,request_id),
 CHECK((kind='check_in' AND value IS NOT NULL AND observed_on IS NOT NULL) OR (kind<>'check_in' AND value IS NULL AND observed_on IS NULL))
);
CREATE INDEX kpi_goal_entries_goal_id_sequence_idx ON kpi_goal_entries(goal_id,sequence);
COMMIT;
