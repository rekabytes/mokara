package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	db, err := NewDB(ctx)
	cancel()
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()

	if os.Getenv("AUTH_SECRET") == "" {
		log.Println("WARNING: AUTH_SECRET is not set — using insecure dev fallback. Set AUTH_SECRET in .env for any non-dev use.")
	}

	taskH := &Handler{DB: db}
	authH := &AuthHandler{DB: db}
	teamH := &TeamHandler{DB: db}

	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(corsMiddleware())
	r.Use(simpleLogger())

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	{
		// Public auth
		api.POST("/auth/signup", authH.signUp)
		api.POST("/auth/login", authH.logIn)
		api.POST("/auth/logout", authH.logOut)

		// Authenticated
		authed := api.Group("")
		authed.Use(authRequired())
		{
			authed.GET("/me", authH.me)

			// Teams
			authed.POST("/teams", teamH.createTeam)
			authed.GET("/teams", teamH.listMyTeams)
			authed.GET("/teams/:id", teamH.getTeam)
			authed.POST("/teams/:id/leave", teamH.leaveTeam)
			authed.POST("/teams/:id/invitations", teamH.inviteToTeam)

			// Team-scoped tasks
			authed.GET("/teams/:id/tasks", taskH.listTeamTasks)
			authed.POST("/teams/:id/tasks", taskH.createTeamTask)

			// Single-task routes (membership-checked)
			authed.GET("/tasks/:id", taskH.getTask)
			authed.PATCH("/tasks/:id", taskH.updateTask)
			authed.DELETE("/tasks/:id", taskH.deleteTask)

			// Invitations
			authed.GET("/invitations", teamH.listMyInvitations)
			authed.POST("/invitations/:id/respond", teamH.respondToInvitation)
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("backend listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down...")
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	if err := srv.Shutdown(shutCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

func simpleLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Printf("[DEBUG] %s %d %s %s",
			c.Request.Method,
			c.Writer.Status(),
			c.Request.URL.Path,
			time.Since(start),
		)
	}
}