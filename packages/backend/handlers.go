package main

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	DB *sql.DB
}

const taskColumns = `id, team_id, title, COALESCE(description, ''), status, priority, due_date, created_at, updated_at`

// listTeamTasks: GET /api/teams/:id/tasks
func (h *Handler) listTeamTasks(c *gin.Context) {
	uid := currentUserID(c)
	teamID := c.Param("id")
	role, err := isMemberOf(c.Request.Context(), h.DB, uid, teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("membership_check_failed", err.Error()))
		return
	}
	if role == "" {
		c.JSON(http.StatusForbidden, errorResponse("forbidden", "not a member of this team"))
		return
	}

	query := `SELECT ` + taskColumns + ` FROM tasks WHERE team_id = $1`
	args := []any{teamID}
	if status := c.Query("status"); status != "" {
		query += ` AND status = $2`
		args = append(args, status)
	}
	query += ` ORDER BY created_at DESC`

	rows, err := h.DB.QueryContext(c.Request.Context(), query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("query_failed", err.Error()))
		return
	}
	defer rows.Close()
	c.JSON(http.StatusOK, scanTasks(rows))
}

// createTeamTask: POST /api/teams/:id/tasks
func (h *Handler) createTeamTask(c *gin.Context) {
	uid := currentUserID(c)
	teamID := c.Param("id")
	role, err := isMemberOf(c.Request.Context(), h.DB, uid, teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("membership_check_failed", err.Error()))
		return
	}
	if role == "" {
		c.JSON(http.StatusForbidden, errorResponse("forbidden", "not a member of this team"))
		return
	}

	var in CreateTaskInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid_input", err.Error()))
		return
	}
	status := defaultIfEmpty(in.Status, "todo")
	priority := defaultIfEmpty(in.Priority, "medium")

	var t Task
	err = h.DB.QueryRowContext(c.Request.Context(), `
		INSERT INTO tasks (team_id, title, description, status, priority, due_date, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())
		RETURNING `+taskColumns,
		teamID, in.Title, nilIfEmpty(in.Description), status, priority, in.DueDate,
	).Scan(&t.ID, &t.TeamID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("create_failed", err.Error()))
		return
	}
	c.JSON(http.StatusCreated, t)
}

func (h *Handler) getTask(c *gin.Context) {
	uid := currentUserID(c)
	taskID := c.Param("id")

	var t Task
	var teamID string
	err := h.DB.QueryRowContext(c.Request.Context(),
		`SELECT `+taskColumns+` FROM tasks WHERE id = $1`, taskID,
	).Scan(&t.ID, &teamID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, errorResponse("not_found", "task not found"))
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("query_failed", err.Error()))
		return
	}
	_ = teamID

	role, err := isMemberOf(c.Request.Context(), h.DB, uid, t.TeamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("membership_check_failed", err.Error()))
		return
	}
	if role == "" {
		c.JSON(http.StatusForbidden, errorResponse("forbidden", "not a member of this task's team"))
		return
	}
	c.JSON(http.StatusOK, t)
}

func (h *Handler) updateTask(c *gin.Context) {
	uid := currentUserID(c)
	var in UpdateTaskInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid_input", err.Error()))
		return
	}

	var teamID string
	err := h.DB.QueryRowContext(c.Request.Context(),
		`SELECT team_id FROM tasks WHERE id = $1`, c.Param("id"),
	).Scan(&teamID)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, errorResponse("not_found", "task not found"))
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("query_failed", err.Error()))
		return
	}

	role, err := isMemberOf(c.Request.Context(), h.DB, uid, teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("membership_check_failed", err.Error()))
		return
	}
	if role == "" {
		c.JSON(http.StatusForbidden, errorResponse("forbidden", "not a member of this task's team"))
		return
	}

	var t Task
	err = h.DB.QueryRowContext(c.Request.Context(), `
		UPDATE tasks SET
			title       = COALESCE($1, title),
			description = COALESCE($2, description),
			status      = COALESCE($3, status),
			priority    = COALESCE($4, priority),
			due_date    = COALESCE($5, due_date),
			updated_at  = now()
		WHERE id = $6
		RETURNING `+taskColumns,
		in.Title, in.Description, in.Status, in.Priority, in.DueDate, c.Param("id"),
	).Scan(&t.ID, &t.TeamID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, errorResponse("not_found", "task not found"))
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("query_failed", err.Error()))
		return
	}
	c.JSON(http.StatusOK, t)
}

func (h *Handler) deleteTask(c *gin.Context) {
	uid := currentUserID(c)
	var teamID string
	err := h.DB.QueryRowContext(c.Request.Context(),
		`SELECT team_id FROM tasks WHERE id = $1`, c.Param("id"),
	).Scan(&teamID)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, errorResponse("not_found", "task not found"))
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("query_failed", err.Error()))
		return
	}

	role, err := isMemberOf(c.Request.Context(), h.DB, uid, teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("membership_check_failed", err.Error()))
		return
	}
	if role == "" {
		c.JSON(http.StatusForbidden, errorResponse("forbidden", "not a member of this task's team"))
		return
	}

	res, err := h.DB.ExecContext(c.Request.Context(), `DELETE FROM tasks WHERE id = $1`, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("query_failed", err.Error()))
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		c.JSON(http.StatusNotFound, errorResponse("not_found", "task not found"))
		return
	}
	c.Status(http.StatusNoContent)
}

func scanTasks(rows *sql.Rows) []Task {
	tasks := []Task{}
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.TeamID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return tasks
		}
		tasks = append(tasks, t)
	}
	return tasks
}

func defaultIfEmpty(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}