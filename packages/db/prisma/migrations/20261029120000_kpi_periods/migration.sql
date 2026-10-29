ALTER TABLE kpi_goals ADD COLUMN previous_goal_id UUID;
CREATE UNIQUE INDEX kpi_goals_previous_goal_id_team_id_key ON kpi_goals(previous_goal_id, team_id);
ALTER TABLE kpi_goals ADD CONSTRAINT kpi_goals_previous_goal_id_team_id_fkey
  FOREIGN KEY (previous_goal_id, team_id) REFERENCES kpi_goals(id, team_id)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE kpi_goals ADD CONSTRAINT kpi_goals_not_own_previous CHECK(previous_goal_id IS NULL OR previous_goal_id <> id);
