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

const taskColumns = `id, title, COALESCE(description, ''), status, priority, due_date, created_at, updated_at`

func (h *Handler) listTasks(c *gin.Context) {
	query := `SELECT ` + taskColumns + ` FROM tasks`
	args := []any{}
	if status := c.Query("status"); status != "" {
		query += ` WHERE status = $1`
		args = append(args, status)
	}
	query += ` ORDER BY created_at DESC`

	rows, err := h.DB.QueryContext(c.Request.Context(), query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	tasks := []Task{}
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		tasks = append(tasks, t)
	}
	c.JSON(http.StatusOK, tasks)
}

func (h *Handler) getTask(c *gin.Context) {
	var t Task
	err := h.DB.QueryRowContext(c.Request.Context(),
		`SELECT `+taskColumns+` FROM tasks WHERE id = $1`, c.Param("id"),
	).Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, t)
}

func (h *Handler) createTask(c *gin.Context) {
	var in CreateTaskInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	status := defaultIfEmpty(in.Status, "todo")
	priority := defaultIfEmpty(in.Priority, "medium")

	var t Task
	err := h.DB.QueryRowContext(c.Request.Context(), `
		INSERT INTO tasks (title, description, status, priority, due_date)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+taskColumns,
		in.Title, nilIfEmpty(in.Description), status, priority, in.DueDate,
	).Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, t)
}

func (h *Handler) updateTask(c *gin.Context) {
	var in UpdateTaskInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var t Task
	err := h.DB.QueryRowContext(c.Request.Context(), `
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
	).Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, t)
}

func (h *Handler) deleteTask(c *gin.Context) {
	res, err := h.DB.ExecContext(c.Request.Context(), `DELETE FROM tasks WHERE id = $1`, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	c.Status(http.StatusNoContent)
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
