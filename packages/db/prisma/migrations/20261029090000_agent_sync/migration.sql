BEGIN;
-- Additive defaults never authorize existing work for execution.
ALTER TABLE tasks ADD COLUMN agent_ready BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN agent_sync_paused BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN agent_revision BIGINT NOT NULL DEFAULT 1 CHECK (agent_revision > 0),
 ADD COLUMN agent_content_revision BIGINT NOT NULL DEFAULT 1 CHECK (agent_content_revision > 0);
ALTER TABLE mcp_connections DROP CONSTRAINT mcp_connections_scopes_check;
ALTER TABLE mcp_connections ADD CONSTRAINT mcp_connections_scopes_check CHECK
 (cardinality(scopes) BETWEEN 1 AND 8 AND scopes @> ARRAY['mokara:read'] AND
 scopes <@ ARRAY['mokara:read','mokara:write','mokara:delete','mokara:github','mokara:drive:read','mokara:drive:upload','mokara:agent:manage','mokara:agent:execute']);
ALTER TABLE mcp_oauth_tokens DROP CONSTRAINT mcp_oauth_tokens_scopes_check;
ALTER TABLE mcp_oauth_tokens ADD CONSTRAINT mcp_oauth_tokens_scopes_check CHECK
 (cardinality(scopes) BETWEEN 1 AND 8 AND scopes @> ARRAY['mokara:read'] AND
 scopes <@ ARRAY['mokara:read','mokara:write','mokara:delete','mokara:github','mokara:drive:read','mokara:drive:upload','mokara:agent:manage','mokara:agent:execute']);

CREATE TABLE agent_sync_clocks (
 workspace_id UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
 sequence BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE agent_executions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id UUID NOT NULL, -- History survives task deletion. Reads still require a current task.
 workspace_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
 project_id UUID,
 connection_id UUID REFERENCES mcp_connections(id) ON DELETE SET NULL,
 agent_name TEXT NOT NULL,
 state TEXT NOT NULL CHECK (state IN ('claimed','running','cancel_requested','finished','failed','cancelled','unknown','abandoned')),
 accepted_revision BIGINT NOT NULL,
 accepted_content_revision BIGINT NOT NULL,
 snapshot JSONB NOT NULL,
 claimed_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
 started_at TIMESTAMPTZ(3),
 heartbeat_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
 lease_expires_at TIMESTAMPTZ(3) NOT NULL,
 finished_at TIMESTAMPTZ(3),
 progress TEXT NOT NULL DEFAULT '' CHECK (length(progress) <= 10000),
 progress_percent INTEGER CHECK (progress_percent BETWEEN 0 AND 100),
 result TEXT CHECK (length(result) <= 16000),
 failure TEXT CHECK (length(failure) <= 10000),
 task_deleted BOOLEAN NOT NULL DEFAULT false,
 CHECK (lease_expires_at > claimed_at),
 CHECK ((state IN ('finished','failed','cancelled','unknown','abandoned')) = (finished_at IS NOT NULL))
);
CREATE UNIQUE INDEX agent_execution_one_owner ON agent_executions(task_id)
 WHERE state IN ('claimed','running','cancel_requested','unknown');
CREATE INDEX agent_executions_history ON agent_executions(workspace_id,task_id,claimed_at DESC,id DESC);
CREATE INDEX agent_executions_expiry ON agent_executions(lease_expires_at) WHERE state IN ('claimed','running','cancel_requested');
CREATE TABLE agent_sync_events (
 workspace_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
 sequence BIGINT NOT NULL,
 task_id UUID NOT NULL,
 project_id UUID,
 kind TEXT NOT NULL,
 revision BIGINT NOT NULL,
 origin TEXT NOT NULL,
 connection_id UUID,
 execution_id UUID,
 occurred_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,sequence)
);
CREATE TABLE agent_sync_requests (
 actor_key TEXT NOT NULL,
 request_id UUID NOT NULL,
 workspace_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
 request_hash TEXT NOT NULL,
 result JSONB NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_key,request_id)
);
-- The row lock is retained through commit, so cursors cannot skip a later commit
-- with an earlier sequence. Sequence allocation rolls back with the domain write.
CREATE FUNCTION agent_sync_emit(w UUID,t UUID,p UUID,k TEXT,r BIGINT,e UUID DEFAULT NULL) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE n BIGINT;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM teams WHERE id=w) THEN RETURN; END IF;
 INSERT INTO agent_sync_clocks(workspace_id) VALUES(w) ON CONFLICT DO NOTHING;
 UPDATE agent_sync_clocks SET sequence=sequence+1 WHERE workspace_id=w RETURNING sequence INTO n;
 INSERT INTO agent_sync_events(workspace_id,sequence,task_id,project_id,kind,revision,origin,connection_id,execution_id)
 VALUES(w,n,t,p,k,r,coalesce(nullif(current_setting('mokara.agent_origin',true),''),'mokara'),
 nullif(current_setting('mokara.agent_connection',true),'')::uuid,
 coalesce(e,nullif(current_setting('mokara.agent_execution',true),'')::uuid));
END $$;
CREATE FUNCTION agent_task_before() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.agent_revision=OLD.agent_revision+1;
 IF NEW.agent_content_revision<>OLD.agent_content_revision OR
 (to_jsonb(NEW)-ARRAY['agent_ready','agent_sync_paused','agent_revision','agent_content_revision','updated_at'])
  IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['agent_ready','agent_sync_paused','agent_revision','agent_content_revision','updated_at']) THEN
  NEW.agent_content_revision=OLD.agent_content_revision+1;
 ELSE NEW.agent_content_revision=OLD.agent_content_revision; END IF;
 IF NEW.agent_ready AND EXISTS(SELECT 1 FROM agent_executions WHERE task_id=NEW.id AND state IN ('claimed','running','cancel_requested','unknown')) THEN
  RAISE EXCEPTION 'active execution prevents readiness' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER agent_task_revision BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION agent_task_before();
CREATE FUNCTION agent_task_after() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  PERFORM agent_sync_emit(OLD.team_id,OLD.id,OLD.project_id,'task_deleted',OLD.agent_revision+1);
  UPDATE agent_executions SET task_deleted=true,
   state=CASE WHEN state IN ('claimed','running') THEN 'cancel_requested' ELSE state END
   WHERE task_id=OLD.id;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN
  PERFORM agent_sync_emit(OLD.team_id,OLD.id,OLD.project_id,'task_removed',NEW.agent_revision);
 END IF;
 PERFORM agent_sync_emit(NEW.team_id,NEW.id,NEW.project_id,
  CASE WHEN TG_OP='INSERT' THEN 'task_created'
   WHEN OLD.agent_ready IS DISTINCT FROM NEW.agent_ready THEN 'readiness_changed'
   WHEN OLD.agent_sync_paused IS DISTINCT FROM NEW.agent_sync_paused THEN 'sync_changed'
   ELSE 'task_updated' END,NEW.agent_revision);
 RETURN NEW;
END $$;
CREATE TRIGGER agent_task_changes AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION agent_task_after();
CREATE FUNCTION agent_execution_after() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rev BIGINT;
BEGIN
 SELECT agent_revision INTO rev FROM tasks WHERE id=NEW.task_id;
 PERFORM agent_sync_emit(NEW.workspace_id,NEW.task_id,NEW.project_id,'execution_updated',coalesce(rev,NEW.accepted_revision),NEW.id);
 RETURN NEW;
END $$;
CREATE TRIGGER agent_execution_changes AFTER INSERT OR UPDATE ON agent_executions FOR EACH ROW EXECUTE FUNCTION agent_execution_after();
-- Edits to instructions or their context advance the parent task's revision.
CREATE FUNCTION agent_child_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE child JSONB; parent UUID;
BEGIN
 child=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 parent=(child->>'task_id')::uuid;
 IF parent IS NULL AND TG_TABLE_NAME='attachments' THEN
  SELECT task_id INTO parent FROM comments WHERE id=(child->>'comment_id')::uuid;
 END IF;
 IF parent IS NOT NULL THEN
  UPDATE tasks SET agent_content_revision=agent_content_revision+1,updated_at=clock_timestamp() WHERE id=parent;
 END IF;
 RETURN NULL;
END $$;
-- Explicit revision touches from child edits count as content edits too.
CREATE TRIGGER agent_step_changes AFTER INSERT OR UPDATE OR DELETE ON subtask_items FOR EACH ROW EXECUTE FUNCTION agent_child_changed();
CREATE TRIGGER agent_comment_changes AFTER INSERT OR UPDATE OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION agent_child_changed();
CREATE TRIGGER agent_attachment_changes AFTER INSERT OR UPDATE OR DELETE ON attachments FOR EACH ROW EXECUTE FUNCTION agent_child_changed();
CREATE TRIGGER agent_kpi_changes AFTER INSERT OR UPDATE OR DELETE ON task_kpis FOR EACH ROW EXECUTE FUNCTION agent_child_changed();
CREATE FUNCTION agent_project_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t RECORD;
BEGIN
 IF NEW.archived IS DISTINCT FROM OLD.archived THEN
  UPDATE tasks SET agent_ready=false,agent_sync_paused=CASE WHEN NEW.archived THEN true ELSE agent_sync_paused END,agent_content_revision=agent_content_revision+1 WHERE project_id=NEW.id;
  FOR t IN SELECT * FROM tasks WHERE project_id=NEW.id LOOP
   PERFORM agent_sync_emit(t.team_id,t.id,t.project_id,CASE WHEN NEW.archived THEN 'task_archived' ELSE 'task_restored' END,t.agent_revision);
  END LOOP;
  IF NEW.archived THEN
   UPDATE agent_executions SET state='cancel_requested' WHERE project_id=NEW.id AND state IN ('claimed','running');
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER agent_project_changes AFTER UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION agent_project_changed();
-- Initial synchronization includes existing tasks, all still not ready.
INSERT INTO agent_sync_clocks(workspace_id) SELECT id FROM teams ON CONFLICT DO NOTHING;
DO $$ DECLARE t RECORD; BEGIN
 FOR t IN SELECT id,team_id,project_id,agent_revision FROM tasks ORDER BY team_id,id LOOP
  PERFORM agent_sync_emit(t.team_id,t.id,t.project_id,'task_created',t.agent_revision);
 END LOOP;
END $$;
ALTER TABLE agent_executions ADD COLUMN client_identifier TEXT NOT NULL DEFAULT 'external-client',
 ADD COLUMN installation_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE FUNCTION agent_sync_error(c TEXT,m TEXT,s INTEGER DEFAULT 409,d JSONB DEFAULT '{}') RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('error',c,'message',m,'status',s,'details',d)
$$;
CREATE FUNCTION agent_sync_authorize(u UUID,c UUID,w UUID,required_scope TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE grant_row mcp_connections%ROWTYPE;
BEGIN
 PERFORM 1 FROM team_members WHERE team_id=w AND user_id=u FOR SHARE;
 IF NOT FOUND THEN
  RETURN agent_sync_error('agent_permission_denied','You no longer belong to this workspace.',403);
 END IF;
 IF c IS NOT NULL THEN
  SELECT * INTO grant_row FROM mcp_connections WHERE id=c FOR SHARE;
  IF NOT FOUND OR grant_row.user_id<>u OR grant_row.revoked_at IS NOT NULL OR grant_row.expires_at<=clock_timestamp()
   OR NOT w=ANY(grant_row.workspace_ids) OR NOT required_scope=ANY(grant_row.scopes) THEN
   RETURN agent_sync_error('agent_permission_denied','Approve the required workspace and agent permission for this connection.',403);
  END IF;
 ELSIF required_scope='mokara:agent:execute' THEN
  RETURN agent_sync_error('agent_permission_denied','Execution requires an authenticated external connection.',403);
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION agent_execution_public(r agent_executions) RETURNS JSONB LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',r.id,'task_id',r.task_id,'workspace_id',r.workspace_id,'project_id',r.project_id,
 'client_id',r.client_identifier,'client_name',r.agent_name,
 'state',CASE WHEN r.state IN ('claimed','running','cancel_requested') AND r.lease_expires_at<=clock_timestamp() THEN 'unknown' ELSE r.state END,
 'accepted_revision',r.accepted_revision::text,'claimed_at',r.claimed_at,'started_at',r.started_at,
 'heartbeat_at',r.heartbeat_at,'lease_expires_at',r.lease_expires_at,'finished_at',r.finished_at,
 'progress',r.progress,'progress_percent',r.progress_percent,'result',r.result,'failure',r.failure,
 'task_deleted',r.task_deleted)
$$;
CREATE FUNCTION agent_sync_snapshot(t tasks) RETURNS JSONB LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',t.id,'workspace_id',t.team_id,'project_id',t.project_id,'title',t.title,
 'description',t.description,'status',t.status,'priority',t.priority,'due_date',t.due_date,
 'assignee_id',t.assignee_id,'revision',t.agent_revision::text,
 'steps',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'done',s.done,'position',s.position) ORDER BY s.position,s.id) FROM subtask_items s WHERE s.task_id=t.id),'[]'),
 'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'filename',a.filename,'size_bytes',a.size_bytes,'content_type',a.content_type,'comment_id',a.comment_id) ORDER BY a.id)
 FROM attachments a WHERE a.task_id=t.id OR a.comment_id IN(SELECT id FROM comments WHERE task_id=t.id)),'[]'))
$$;
CREATE FUNCTION agent_sync_apply(u UUID,c UUID,op TEXT,p JSONB) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE t tasks%ROWTYPE; r agent_executions%ROWTYPE; now_at TIMESTAMPTZ; run UUID; active_run BOOLEAN;
BEGIN
 SELECT * INTO t FROM tasks WHERE id=(p->>'task_id')::uuid AND team_id=(p->>'workspace_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN
  -- A deleted task's owner may acknowledge cancellation but cannot read its contents.
  IF op<>'cancel_ack' THEN RETURN agent_sync_error('not_found','Task not found in this workspace.',404); END IF;
 END IF;
 IF t.id IS NOT NULL AND t.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM projects WHERE id=t.project_id AND team_id=t.team_id) THEN
  RETURN agent_sync_error('agent_permission_denied','Project access is unavailable.',403);
 END IF;
 IF p ? 'project_id' AND t.id IS NOT NULL AND t.project_id IS DISTINCT FROM (p->>'project_id')::uuid THEN
  RETURN agent_sync_error('agent_permission_denied','Task is not in the requested project.',403);
 END IF;
 -- Read the clock after acquiring the task lock. Waiting time cannot extend a lease.
 now_at=clock_timestamp();
 UPDATE agent_executions SET state='unknown',finished_at=now_at
 WHERE task_id=(p->>'task_id')::uuid AND state IN ('claimed','running','cancel_requested') AND lease_expires_at<=now_at;
 IF p ? 'execution_id' THEN
  SELECT * INTO r FROM agent_executions WHERE id=(p->>'execution_id')::uuid AND task_id=(p->>'task_id')::uuid
   AND workspace_id=(p->>'workspace_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN agent_sync_error('agent_lease_invalid','Execution not found.',404); END IF;
 ELSE
  SELECT * INTO r FROM agent_executions WHERE task_id=t.id AND state IN ('claimed','running','cancel_requested','unknown') FOR UPDATE;
 END IF;
 now_at=clock_timestamp();
 active_run=r.id IS NOT NULL AND r.state IN ('claimed','running','cancel_requested','unknown');
 IF op IN ('readiness','requeue','claim','pause') AND (p->>'expected_revision')::bigint<>t.agent_revision THEN
  RETURN agent_sync_error('agent_revision_conflict','The task changed. Read it again before retrying.',409,
   jsonb_build_object('current_revision',t.agent_revision::text));
 END IF;
 IF op='pause' THEN
  UPDATE tasks SET agent_sync_paused=(p->>'paused')::boolean WHERE id=t.id RETURNING * INTO t;
  RETURN jsonb_build_object('task_id',t.id,'revision',t.agent_revision::text,'ready',t.agent_ready,'paused',t.agent_sync_paused);
 ELSIF op IN ('readiness','requeue') THEN
  IF (op='requeue' OR (p->>'ready')::boolean) AND EXISTS(SELECT 1 FROM projects WHERE id=t.project_id AND archived) THEN
   RETURN agent_sync_error('agent_invalid_transition','Restore the project before making this task ready.');
  END IF;
  IF op='requeue' THEN
   IF r.state IN ('claimed','running','cancel_requested') THEN RETURN agent_sync_error('agent_already_claimed','Request cancellation and wait for confirmation or lease expiry first.'); END IF;
   IF r.state='unknown' THEN UPDATE agent_executions SET state='abandoned' WHERE id=r.id; END IF;
  ELSIF active_run AND (p->>'ready')::boolean THEN
   RETURN agent_sync_error('agent_already_claimed','This task has an execution. Use explicit recovery after an unknown outcome.');
  END IF;
  UPDATE tasks SET agent_ready=CASE WHEN op='requeue' THEN true ELSE (p->>'ready')::boolean END WHERE id=t.id RETURNING * INTO t;
  RETURN jsonb_build_object('task_id',t.id,'revision',t.agent_revision::text,'ready',t.agent_ready,'paused',t.agent_sync_paused);
 ELSIF op='claim' THEN
  IF active_run THEN RETURN agent_sync_error('agent_already_claimed','This task already has a claim or an unknown execution outcome.'); END IF;
  IF NOT t.agent_ready OR t.agent_sync_paused OR EXISTS(SELECT 1 FROM projects WHERE id=t.project_id AND archived) THEN
   RETURN agent_sync_error('agent_task_not_ready','A user must mark this task Ready for agent and enable synchronization.');
  END IF;
  run=gen_random_uuid();
  PERFORM set_config('mokara.agent_execution',run::text,true);
  UPDATE tasks SET agent_ready=false WHERE id=t.id RETURNING * INTO t;
  INSERT INTO agent_executions(id,task_id,workspace_id,project_id,connection_id,agent_name,client_identifier,installation_id,state,accepted_revision,accepted_content_revision,snapshot,claimed_at,heartbeat_at,lease_expires_at)
   VALUES(run,t.id,t.team_id,t.project_id,c,(SELECT name FROM mcp_connections WHERE id=c),p->>'client_id',(p->>'installation_id')::uuid,
    'claimed',t.agent_revision,t.agent_content_revision,agent_sync_snapshot(t),now_at,now_at,now_at+make_interval(secs=>(p->>'lease_seconds')::int)) RETURNING * INTO r;
  RETURN jsonb_build_object('execution',agent_execution_public(r),'ownership','authenticated_connection_and_installation');
 ELSIF op='cancel' THEN
  IF r.id IS NULL OR r.state NOT IN ('claimed','running','cancel_requested') THEN RETURN agent_sync_error('agent_invalid_transition','There is no live execution to cancel. Unknown outcomes need recovery.'); END IF;
  UPDATE agent_executions SET state='cancel_requested' WHERE id=r.id RETURNING * INTO r;
  RETURN jsonb_build_object('execution',agent_execution_public(r));
 END IF;
 IF r.connection_id IS DISTINCT FROM c OR c IS NULL OR r.installation_id IS DISTINCT FROM (p->>'installation_id')::uuid THEN
  RETURN agent_sync_error('agent_claim_lost','Only the claiming connection and installation may update this execution.',403);
 END IF;
 IF r.state IN ('unknown','abandoned') OR r.lease_expires_at<=now_at THEN RETURN agent_sync_error('agent_lease_expired','The lease expired. Stop work and ask the user to recover the task.'); END IF;
 IF r.state NOT IN ('claimed','running','cancel_requested') THEN RETURN agent_sync_error('agent_invalid_transition','This execution has already ended.'); END IF;
 IF op='start' THEN
  IF r.state<>'claimed' THEN RETURN agent_sync_error('agent_invalid_transition','Only a claimed execution can start.'); END IF;
  UPDATE agent_executions SET state='running',started_at=now_at WHERE id=r.id RETURNING * INTO r;
 ELSIF op='renew' THEN
  UPDATE agent_executions SET heartbeat_at=now_at,lease_expires_at=now_at+make_interval(secs=>(p->>'lease_seconds')::int) WHERE id=r.id RETURNING * INTO r;
 ELSIF op='progress' THEN
  IF r.state NOT IN ('running','cancel_requested') THEN RETURN agent_sync_error('agent_invalid_transition','Start the execution before reporting progress.'); END IF;
  UPDATE agent_executions SET progress=p->>'message',progress_percent=(p->>'percent')::int WHERE id=r.id RETURNING * INTO r;
 ELSIF op='finish' THEN
  IF r.state NOT IN ('running','cancel_requested') THEN RETURN agent_sync_error('agent_invalid_transition','Start the execution before completing it.'); END IF;
  UPDATE agent_executions SET state='finished',finished_at=now_at,result=p->>'result',progress_percent=100 WHERE id=r.id RETURNING * INTO r;
 ELSIF op='fail' THEN
  UPDATE agent_executions SET state='failed',finished_at=now_at,failure=p->>'failure' WHERE id=r.id RETURNING * INTO r;
 ELSIF op='cancel_ack' THEN
  IF r.state<>'cancel_requested' THEN RETURN agent_sync_error('agent_invalid_transition','No cancellation has been requested.'); END IF;
  UPDATE agent_executions SET state='cancelled',finished_at=now_at WHERE id=r.id RETURNING * INTO r;
 ELSIF op='release' THEN
  UPDATE agent_executions SET state=CASE WHEN state='claimed' THEN 'cancelled' ELSE 'unknown' END,finished_at=now_at WHERE id=r.id RETURNING * INTO r;
 ELSE RETURN agent_sync_error('agent_invalid_transition','Unsupported execution operation.');
 END IF;
 RETURN jsonb_build_object('execution',agent_execution_public(r));
END $$;
CREATE FUNCTION agent_sync_command(u UUID,c UUID,op TEXT,p JSONB) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE actor TEXT; fingerprint TEXT; previous agent_sync_requests%ROWTYPE; result JSONB; denied JSONB; required_scope TEXT;
BEGIN
 required_scope=CASE WHEN op IN ('readiness','pause','cancel','requeue') THEN 'mokara:agent:manage' ELSE 'mokara:agent:execute' END;
 denied=agent_sync_authorize(u,c,(p->>'workspace_id')::uuid,required_scope);
 IF denied IS NOT NULL THEN RETURN denied; END IF;
 actor=CASE WHEN c IS NULL THEN 'user:'||u::text ELSE 'connection:'||c::text END;
 fingerprint=encode(sha256(convert_to(op||p::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(actor||(p->>'request_id'),0));
 SELECT * INTO previous FROM agent_sync_requests WHERE actor_key=actor AND request_id=(p->>'request_id')::uuid;
 IF FOUND THEN
  IF previous.request_hash<>fingerprint THEN RETURN agent_sync_error('agent_idempotency_conflict','This request_id was already used with different input.'); END IF;
  -- Recheck task visibility before replay. Deleted tasks expose no cached content.
  IF NOT EXISTS(SELECT 1 FROM tasks WHERE id=(p->>'task_id')::uuid AND team_id=(p->>'workspace_id')::uuid) AND op<>'cancel_ack' THEN
   RETURN agent_sync_error('not_found','Task no longer exists.',404);
  END IF;
  RETURN previous.result;
 END IF;
 PERFORM set_config('mokara.agent_origin',CASE WHEN c IS NULL THEN 'user' ELSE 'external' END,true);
 PERFORM set_config('mokara.agent_connection',coalesce(c::text,''),true);
 PERFORM set_config('mokara.agent_execution',coalesce(p->>'execution_id',''),true);
 result=agent_sync_apply(u,c,op,p);
 INSERT INTO agent_sync_requests(actor_key,request_id,workspace_id,request_hash,result) VALUES(actor,(p->>'request_id')::uuid,(p->>'workspace_id')::uuid,fingerprint,result);
 RETURN result;
END $$;

COMMIT;
