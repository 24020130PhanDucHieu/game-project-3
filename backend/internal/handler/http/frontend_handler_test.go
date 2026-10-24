package http

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestNextExportWithoutLegacyAssets(t *testing.T) {
	root := t.TempDir()
	for name, content := range map[string]string{
		"index.html": "<html>Next portal</html>",
		"icon.svg":   "<svg></svg>",
	} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Join(root, "_next", "static"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "_next", "static", "app.js"), []byte("ok"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.MkdirAll(filepath.Join(root, "offline", "engine"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"worker.js", "engine/board.py"} {
		if err := os.WriteFile(filepath.Join(root, "offline", name), []byte("ok"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	router := gin.New()
	registerStaticPortal(router, root)
	for _, path := range []string{"/", "/icon.svg", "/_next/static/app.js", "/offline/worker.js", "/offline/engine/board.py"} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Code != 200 {
			t.Errorf("GET %s: got %d, want 200", path, response.Code)
		}
	}
}
