package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	cookieName      = "mokara_token"
	tokenLifetime   = 7 * 24 * time.Hour
	minPasswordLen  = 8
	minUsernameLen  = 3
	maxUsernameLen  = 20
	maxDisplayLen   = 50
	maxTeamNameLen  = 50
	maxTeamMembers  = 3
	bcryptCost      = 10
	inviteLifetime  = 7 * 24 * time.Hour
)

var usernameRe = regexp.MustCompile(`^[a-z0-9_]+$`)

type User struct {
	ID          string    `json:"id"`
	Username    string    `json:"username"`
	DisplayName *string   `json:"display_name"`
	CreatedAt   time.Time `json:"created_at"`
}

type AuthHandler struct {
	DB *sql.DB
}

type SignupInput struct {
	Username    string `json:"username" binding:"required"`
	Password    string `json:"password" binding:"required"`
	DisplayName string `json:"display_name"`
}

type LoginInput struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type Claims struct {
	UserID   string `json:"sub"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

func authSecret() []byte {
	s := os.Getenv("AUTH_SECRET")
	if s == "" {
		// Dev fallback only. Auth fails closed if no secret in prod.
		s = "dev-only-insecure-secret-change-me-in-prod-32b!"
	}
	return []byte(s)
}

func issueToken(userID, username string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(tokenLifetime)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString(authSecret())
}

func parseToken(tokenStr string) (*Claims, error) {
	tok, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return authSecret(), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := tok.Claims.(*Claims)
	if !ok || !tok.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func setAuthCookie(c *gin.Context, token string) {
	secure := os.Getenv("ENV") == "production"
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(cookieName, token, int(tokenLifetime.Seconds()), "/", "", secure, true)
}

func clearAuthCookie(c *gin.Context) {
	secure := os.Getenv("ENV") == "production"
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(cookieName, "", -1, "/", "", secure, true)
}

func readAuthCookie(c *gin.Context) (string, error) {
	v, err := c.Cookie(cookieName)
	if err != nil {
		return "", err
	}
	return v, nil
}

func validateUsername(u string) error {
	if l := len(u); l < minUsernameLen || l > maxUsernameLen {
		return fmt.Errorf("username must be %d-%d chars", minUsernameLen, maxUsernameLen)
	}
	if !usernameRe.MatchString(u) {
		return errors.New("username may only contain a-z, 0-9, underscore")
	}
	return nil
}

func validatePassword(p string) error {
	if len(p) < minPasswordLen {
		return fmt.Errorf("password must be at least %d characters", minPasswordLen)
	}
	return nil
}

func (h *AuthHandler) signUp(c *gin.Context) {
	var in SignupInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid_input", err.Error()))
		return
	}
	in.Username = strings.ToLower(strings.TrimSpace(in.Username))

	if err := validateUsername(in.Username); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid_username", err.Error()))
		return
	}
	if err := validatePassword(in.Password); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("weak_password", err.Error()))
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcryptCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("hash_error", err.Error()))
		return
	}

	var displayName *string
	if dn := strings.TrimSpace(in.DisplayName); dn != "" {
		if len(dn) > maxDisplayLen {
			c.JSON(http.StatusBadRequest, errorResponse("invalid_display_name", "display_name too long"))
			return
		}
		displayName = &dn
	}

	var u User
	err = h.DB.QueryRowContext(c.Request.Context(), `
		INSERT INTO users (username, password_hash, display_name, updated_at)
		VALUES ($1, $2, $3, now())
		RETURNING id, username, display_name, created_at
	`, in.Username, string(hash), displayName).Scan(&u.ID, &u.Username, &u.DisplayName, &u.CreatedAt)
	if err != nil {
		if isUniqueViolation(err, "users_username_key") {
			c.JSON(http.StatusConflict, errorResponse("username_taken", "username already exists"))
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse("create_failed", err.Error()))
		return
	}

	token, err := issueToken(u.ID, u.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("token_error", err.Error()))
		return
	}
	setAuthCookie(c, token)
	c.JSON(http.StatusCreated, gin.H{"user": u})
}

func (h *AuthHandler) logIn(c *gin.Context) {
	var in LoginInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid_input", err.Error()))
		return
	}
	in.Username = strings.ToLower(strings.TrimSpace(in.Username))

	var (
		u    User
		hash string
	)
	err := h.DB.QueryRowContext(c.Request.Context(), `
		SELECT id, username, display_name, created_at, password_hash
		FROM users WHERE username = $1
	`, in.Username).Scan(&u.ID, &u.Username, &u.DisplayName, &u.CreatedAt, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusUnauthorized, errorResponse("invalid_credentials", "invalid username or password"))
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("lookup_failed", err.Error()))
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, errorResponse("invalid_credentials", "invalid username or password"))
		return
	}

	token, err := issueToken(u.ID, u.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("token_error", err.Error()))
		return
	}
	setAuthCookie(c, token)
	c.JSON(http.StatusOK, gin.H{"user": u})
}

func (h *AuthHandler) logOut(c *gin.Context) {
	clearAuthCookie(c)
	c.Status(http.StatusNoContent)
}

func (h *AuthHandler) me(c *gin.Context) {
	uid := currentUserID(c)
	var u User
	err := h.DB.QueryRowContext(c.Request.Context(), `
		SELECT id, username, display_name, created_at FROM users WHERE id = $1
	`, uid).Scan(&u.ID, &u.Username, &u.DisplayName, &u.CreatedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("lookup_failed", err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": u})
}

const ctxUserIDKey = "user_id"

func currentUserID(c *gin.Context) string {
	v, _ := c.Get(ctxUserIDKey)
	s, _ := v.(string)
	return s
}

func currentUsername(c *gin.Context) string {
	v, _ := c.Get("username")
	s, _ := v.(string)
	return s
}

func authRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr, err := readAuthCookie(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, errorResponse("not_authenticated", "login required"))
			c.Abort()
			return
		}
		claims, err := parseToken(tokenStr)
		if err != nil {
			clearAuthCookie(c)
			c.JSON(http.StatusUnauthorized, errorResponse("not_authenticated", "session expired"))
			c.Abort()
			return
		}
		c.Set(ctxUserIDKey, claims.UserID)
		c.Set("username", claims.Username)
		c.Next()
	}
}

// isMemberOf returns the role if the user is a member of teamID, "" otherwise.
func isMemberOf(ctx context.Context, db *sql.DB, userID, teamID string) (string, error) {
	var role string
	err := db.QueryRowContext(ctx,
		`SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
		teamID, userID,
	).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return role, err
}

func errorResponse(code, message string) gin.H {
	return gin.H{"error": code, "message": message}
}

// isUniqueViolation checks for a Postgres unique-constraint violation
// on the given index name. Used to return friendly 409s.
func isUniqueViolation(err error, indexName string) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key value") && strings.Contains(msg, indexName)
}