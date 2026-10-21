package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fakeRepo struct{ err error }

func (f fakeRepo) Ping(context.Context) error { return f.err }
func (f fakeRepo) Create(_ context.Context, r Resource) (Resource, error) {
	r.ID, r.CreatedAt = 1, time.Now()
	return r, f.err
}
func (f fakeRepo) List(context.Context, int) ([]Resource, error) { return []Resource{}, f.err }

func srv(err error) http.Handler {
	return NewServer(fakeRepo{err}, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler()
}

func do(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader(body)))
	return rec
}

func TestCreateAndList(t *testing.T) {
	h := srv(nil)
	if c := do(h, "POST", "/v1/resources", `{"type":"aws_vpc","name":"main"}`).Code; c != 201 {
		t.Fatalf("create = %d", c)
	}
	if c := do(h, "GET", "/v1/resources", "").Code; c != 200 {
		t.Fatalf("list = %d", c)
	}
}

func TestValidation(t *testing.T) {
	if c := do(srv(nil), "POST", "/v1/resources", `{"name":"x"}`).Code; c != 400 {
		t.Fatalf("want 400, got %d", c)
	}
}

func TestReadyzReflectsDB(t *testing.T) {
	if c := do(srv(errors.New("down")), "GET", "/readyz", "").Code; c != 503 {
		t.Fatalf("want 503, got %d", c)
	}
	if c := do(srv(nil), "GET", "/readyz", "").Code; c != 200 {
		t.Fatalf("want 200, got %d", c)
	}
}

func TestMetricsExposed(t *testing.T) {
	h := srv(nil)
	do(h, "GET", "/v1/resources", "")
	body := do(h, "GET", "/metrics", "").Body.String()
	if !strings.Contains(body, `http_requests_total{code="200",method="GET",route="/v1/resources"} 1`) {
		t.Fatalf("metric missing:\n%s", body)
	}
}
