package main

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
)

type Team struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	OwnerID   string    `json:"owner_id"`
	CreatedAt time.Time `json:"created_at"`
}

type TeamMember struct {
	UserID      string    `json:"user_id"`
	Username    string    `json:"username"`
	DisplayName *string   `json:"display_name"`
	Role        string    `json:"role"`
	JoinedAt    time.Time `json:"joined_at"`
}

type TeamInvitation struct {
	ID             string     `json:"id"`
	TeamID         string     `json:"team_id"`
	TeamName       string     `json:"team_name"`
	InviterID      string     `json:"inviter_id"`
	InviterName    string     `json:"inviter_name"`
	InviteeUsername string    `json:"invitee_username"`
	Status         string     `json:"status"`
	CreatedAt      time.Time  `json:"created_at"`
	ExpiresAt      time.Time  `json:"expires_at"`
	RespondedAt    *time.Time `json:"responded_at"`
}

type TeamHandler struct {
	DB *sql.DB
}

type CreateTeamInput struct {
	Name string `json:"name" binding:"required"`
}

type InviteInput struct {
	Username string `json:"username" binding:"required"`
}

type RespondInput struct {
	Action string `json:"action" binding:"required"` // "accept" or "decline"
}

var slugForbiddenRe = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = slugForbiddenRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 50 {
		s = s[:50]
	}
	if s == "" {
		s = "team"
	}
	return s
}

func ensureUniqueSlug(ctx interface{}, db *sql.DB, base string) (string, error) {
	candidate := base
	for i := 0; i < 50; i++ {
		var exists bool
		err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM teams WHERE slug = $1)`, candidate).Scan(&exists)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
		if i == 0 {
			candidate = fmt.Sprintf("%s-%d", base, 2)
		} else {
			candidate = fmt.Sprintf("%s-%d", base, i+2)
		}
	}
	return "", fmt.Errorf("could not generate unique slug")
}

func (h *TeamHandler) createTeam(c *gin.Context) {
	var in CreateTeamInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid_input", err.Error()))
		return
	}
	name := strings.TrimSpace(in.Name)
	if name == "" || len(name) > maxTeamNameLen {
		c.JSON(http.StatusBadRequest, errorResponse("invalid_name", "team name must be 1-50 chars"))
		return
	}

	uid := currentUserID(c)
	slug, err := ensureUniqueSlug(c.Request.Context(), h.DB, slugify(name))
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("slug_error", err.Error()))
		return
	}

	tx, err := h.DB.BeginTx(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("tx_error", err.Error()))
		return
	}
	defer tx.Rollback()

	var t Team
	err = tx.QueryRowContext(c.Request.Context(), `
		INSERT INTO teams (name, slug, owner_id, updated_at)
		VALUES ($1, $2, $3, now())
		RETURNING id, name, slug, owner_id, created_at
	`, name, slug, uid).Scan(&t.ID, &t.Name, &t.Slug, &t.OwnerID, &t.CreatedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("create_failed", err.Error()))
		return
	}

	_, err = tx.ExecContext(c.Request.Context(), `
		INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')
	`, t.ID, uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("create_failed", err.Error()))
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("commit_failed", err.Error()))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"team": t})
}

func (h *TeamHandler) listMyTeams(c *gin.Context) {
	uid := currentUserID(c)
	rows, err := h.DB.QueryContext(c.Request.Context(), `
		SELECT t.id, t.name, t.slug, t.owner_id, t.created_at, tm.role
		FROM teams t
		JOIN team_members tm ON tm.team_id = t.id
		WHERE tm.user_id = $1
		ORDER BY t.created_at DESC
	`, uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("query_failed", err.Error()))
		return
	}
	defer rows.Close()

	type teamWithRole struct {
		Team
		Role string `json:"role"`
	}
	out := []teamWithRole{}
	for rows.Next() {
		var tw teamWithRole
		if err := rows.Scan(&tw.ID, &tw.Name, &tw.Slug, &tw.OwnerID, &tw.CreatedAt, &tw.Role); err != nil {
			c.JSON(http.StatusInternalServerError, errorResponse("scan_failed", err.Error()))
			return
		}
		out = append(out, tw)
	}
	c.JSON(http.StatusOK, gin.H{"teams": out})
}

func (h *TeamHandler) getTeam(c *gin.Context) {
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

	var t Team
	err = h.DB.QueryRowContext(c.Request.Context(), `
		SELECT id, name, slug, owner_id, created_at FROM teams WHERE id = $1
	`, teamID).Scan(&t.ID, &t.Name, &t.Slug, &t.OwnerID, &t.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, errorResponse("not_found", "team not found"))
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("query_failed", err.Error()))
		return
	}

	members, err := h.loadMembers(c, teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("members_failed", err.Error()))
		return
	}

	openInvites, err := h.loadOpenInvitations(c, teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("invites_failed", err.Error()))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"team":        t,
		"role":        role,
		"members":     members,
		"invitations": openInvites,
	})
}

func (h *TeamHandler) loadMembers(c *gin.Context, teamID string) ([]TeamMember, error) {
	rows, err := h.DB.QueryContext(c.Request.Context(), `
		SELECT u.id, u.username, u.display_name, tm.role, tm.joined_at
		FROM team_members tm
		JOIN users u ON u.id = tm.user_id
		WHERE tm.team_id = $1
		ORDER BY tm.joined_at ASC
	`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TeamMember{}
	for rows.Next() {
		var m TeamMember
		if err := rows.Scan(&m.UserID, &m.Username, &m.DisplayName, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

func (h *TeamHandler) loadOpenInvitations(c *gin.Context, teamID string) ([]TeamInvitation, error) {
	rows, err := h.DB.QueryContext(c.Request.Context(), `
		SELECT ti.id, ti.team_id, t.name, ti.inviter_id, u.username,
		       ti.invitee_username, ti.status, ti.created_at, ti.expires_at, ti.responded_at
		FROM team_invitations ti
		JOIN teams t ON t.id = ti.team_id
		JOIN users u ON u.id = ti.inviter_id
		WHERE ti.team_id = $1 AND ti.status = 'pending' AND ti.expires_at > now()
		ORDER BY ti.created_at DESC
	`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TeamInvitation{}
	for rows.Next() {
		var inv TeamInvitation
		if err := rows.Scan(&inv.ID, &inv.TeamID, &inv.TeamName, &inv.InviterID, &inv.InviterName,
			&inv.InviteeUsername, &inv.Status, &inv.CreatedAt, &inv.ExpiresAt, &inv.RespondedAt); err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, nil
}

func (h *TeamHandler) leaveTeam(c *gin.Context) {
	uid := currentUserID(c)
	teamID := c.Param("id")

	var ownerID string
	var role string
	err := h.DB.QueryRowContext(c.Request.Context(), `
		SELECT t.owner_id, tm.role FROM teams t
		LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
		WHERE t.id = $1
	`, teamID, uid).Scan(&ownerID, &role)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, errorResponse("not_found", "team not found"))
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("lookup_failed", err.Error()))
		return
	}
	if role == "" {
		c.JSON(http.StatusForbidden, errorResponse("not_member", "you are not a member of this team"))
		return
	}

	if role == "owner" {
		var otherCount int
		err := h.DB.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*) FROM team_members WHERE team_id = $1 AND user_id <> $2`,
			teamID, uid).Scan(&otherCount)
		if err != nil {
			c.JSON(http.StatusInternalServerError, errorResponse("lookup_failed", err.Error()))
			return
		}
		if otherCount > 0 {
			c.JSON(http.StatusConflict, errorResponse("owner_must_transfer",
				"owner cannot leave while other members exist"))
			return
		}
	}

	_, err = h.DB.ExecContext(c.Request.Context(),
		`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`,
		teamID, uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("leave_failed", err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *TeamHandler) inviteToTeam(c *gin.Context) {
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

	var in InviteInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid_input", err.Error()))
		return
	}
	username := strings.ToLower(strings.TrimSpace(in.Username))
	if err := validateUsername(username); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid_username", err.Error()))
		return
	}

	if username == currentUsername(c) {
		c.JSON(http.StatusBadRequest, errorResponse("cannot_invite_self", "cannot invite yourself"))
		return
	}

	var inviteeID string
	err = h.DB.QueryRowContext(c.Request.Context(),
		`SELECT id FROM users WHERE username = $1`, username).Scan(&inviteeID)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, errorResponse("user_not_found", "no user with that username"))
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("lookup_failed", err.Error()))
		return
	}

	var alreadyMember int
	err = h.DB.QueryRowContext(c.Request.Context(),
		`SELECT COUNT(*) FROM team_members WHERE team_id = $1 AND user_id = $2`,
		teamID, inviteeID).Scan(&alreadyMember)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("lookup_failed", err.Error()))
		return
	}
	if alreadyMember > 0 {
		c.JSON(http.StatusConflict, errorResponse("already_member", "user is already a member"))
		return
	}

	var memberCount int
	err = h.DB.QueryRowContext(c.Request.Context(),
		`SELECT COUNT(*) FROM team_members WHERE team_id = $1`, teamID).Scan(&memberCount)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("lookup_failed", err.Error()))
		return
	}
	if memberCount >= maxTeamMembers {
		c.JSON(http.StatusConflict, errorResponse("team_full", "team already has 3 members"))
		return
	}

	var inv TeamInvitation
	err = h.DB.QueryRowContext(c.Request.Context(), `
		INSERT INTO team_invitations (team_id, inviter_id, invitee_username)
		VALUES ($1, $2, $3)
		RETURNING id, team_id, inviter_id, invitee_username, status, created_at, expires_at, responded_at
	`, teamID, uid, username).Scan(&inv.ID, &inv.TeamID, &inv.InviterID, &inv.InviteeUsername,
		&inv.Status, &inv.CreatedAt, &inv.ExpiresAt, &inv.RespondedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == pgerrcode.UniqueViolation &&
			strings.Contains(pgErr.ConstraintName, "team_invitations_team_pending_unique") {
			c.JSON(http.StatusConflict, errorResponse("already_invited", "user already has a pending invitation"))
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse("invite_failed", err.Error()))
		return
	}

	c.JSON(http.StatusCreated, gin.H{"invitation": inv})
}

func (h *TeamHandler) listMyInvitations(c *gin.Context) {
	uid := currentUserID(c)
	rows, err := h.DB.QueryContext(c.Request.Context(), `
		SELECT ti.id, ti.team_id, t.name, ti.inviter_id, u.username,
		       ti.invitee_username, ti.status, ti.created_at, ti.expires_at, ti.responded_at
		FROM team_invitations ti
		JOIN teams t ON t.id = ti.team_id
		JOIN users u ON u.id = ti.inviter_id
		WHERE ti.invitee_username = (SELECT username FROM users WHERE id = $1)
		  AND ti.status = 'pending'
		  AND ti.expires_at > now()
		ORDER BY ti.created_at DESC
	`, uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("query_failed", err.Error()))
		return
	}
	defer rows.Close()
	out := []TeamInvitation{}
	for rows.Next() {
		var inv TeamInvitation
		if err := rows.Scan(&inv.ID, &inv.TeamID, &inv.TeamName, &inv.InviterID, &inv.InviterName,
			&inv.InviteeUsername, &inv.Status, &inv.CreatedAt, &inv.ExpiresAt, &inv.RespondedAt); err != nil {
			c.JSON(http.StatusInternalServerError, errorResponse("scan_failed", err.Error()))
			return
		}
		out = append(out, inv)
	}
	c.JSON(http.StatusOK, gin.H{"invitations": out})
}

func (h *TeamHandler) respondToInvitation(c *gin.Context) {
	uid := currentUserID(c)
	invID := c.Param("id")

	var in RespondInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid_input", err.Error()))
		return
	}
	if in.Action != "accept" && in.Action != "decline" {
		c.JSON(http.StatusBadRequest, errorResponse("invalid_action", "action must be accept or decline"))
		return
	}

	var (
		teamID  string
		invitee string
		status  string
		expires time.Time
	)
	err := h.DB.QueryRowContext(c.Request.Context(), `
		SELECT team_id, invitee_username, status, expires_at
		FROM team_invitations WHERE id = $1
	`, invID).Scan(&teamID, &invitee, &status, &expires)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, errorResponse("not_found", "invitation not found"))
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("lookup_failed", err.Error()))
		return
	}
	if invitee != currentUsername(c) {
		c.JSON(http.StatusForbidden, errorResponse("forbidden", "this invitation is not for you"))
		return
	}
	if status != "pending" {
		c.JSON(http.StatusConflict, errorResponse("already_responded", "invitation already responded to"))
		return
	}
	if time.Now().After(expires) {
		_, _ = h.DB.ExecContext(c.Request.Context(),
			`UPDATE team_invitations SET status = 'expired' WHERE id = $1`, invID)
		c.JSON(http.StatusConflict, errorResponse("invite_expired", "invitation has expired"))
		return
	}

	if in.Action == "decline" {
		_, err = h.DB.ExecContext(c.Request.Context(), `
			UPDATE team_invitations SET status = 'declined', responded_at = now() WHERE id = $1
		`, invID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, errorResponse("decline_failed", err.Error()))
			return
		}
		c.JSON(http.StatusOK, gin.H{"invitation_id": invID, "status": "declined"})
		return
	}

	// Accept: insert team_member (trigger enforces 3-member cap) + mark invitation accepted.
	tx, err := h.DB.BeginTx(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("tx_error", err.Error()))
		return
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(c.Request.Context(), `
		INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')
	`, teamID, uid)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && strings.Contains(pgErr.Message, "team_full") {
			c.JSON(http.StatusConflict, errorResponse("team_full", "team already has 3 members"))
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse("join_failed", err.Error()))
		return
	}

	_, err = tx.ExecContext(c.Request.Context(), `
		UPDATE team_invitations SET status = 'accepted', responded_at = now() WHERE id = $1
	`, invID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("accept_failed", err.Error()))
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("commit_failed", err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"invitation_id": invID, "status": "accepted", "team_id": teamID})
}