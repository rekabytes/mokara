package main

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// corsMiddleware adds permissive CORS headers for local dev. Configure a
// specific origin via CORS_ALLOWED_ORIGINS; empty / "*" allows any origin.
func corsMiddleware() gin.HandlerFunc {
	allowed := os.Getenv("CORS_ALLOWED_ORIGINS")
	return func(c *gin.Context) {
		if allowed == "" || allowed == "*" {
			if origin := c.Request.Header.Get("Origin"); origin != "" {
				c.Header("Access-Control-Allow-Origin", origin)
			} else {
				c.Header("Access-Control-Allow-Origin", "*")
			}
		} else {
			c.Header("Access-Control-Allow-Origin", allowed)
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
