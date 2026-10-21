package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Repo is the storage surface the HTTP layer needs (mockable in tests).
type Repo interface {
	Ping(ctx context.Context) error
	Create(ctx context.Context, r Resource) (Resource, error)
	List(ctx context.Context, limit int) ([]Resource, error)
}

type Server struct {
	repo Repo
	log  *slog.Logger
	reg  *prometheus.Registry
	reqs *prometheus.CounterVec
	dur  *prometheus.HistogramVec
}

func NewServer(repo Repo, log *slog.Logger) *Server {
	s := &Server{repo: repo, log: log, reg: prometheus.NewRegistry()}
	s.reqs = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total", Help: "HTTP requests by route and status code."},
		[]string{"method", "route", "code"})
	s.dur = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "http_request_duration_seconds", Help: "HTTP request latency.",
		Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5}},
		[]string{"method", "route"})
	s.reg.MustRegister(s.reqs, s.dur)
	return s
}

type statusWriter struct {
	http.ResponseWriter
	code int
}

func (w *statusWriter) WriteHeader(c int) { w.code = c; w.ResponseWriter.WriteHeader(c) }

// instrument records the SLI metrics the SLOs are built on.
func (s *Server) instrument(route string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, code: 200}
		h(sw, r)
		s.dur.WithLabelValues(r.Method, route).Observe(time.Since(start).Seconds())
		s.reqs.WithLabelValues(r.Method, route, strconv.Itoa(sw.code)).Inc()
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok")) })
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := s.repo.Ping(ctx); err != nil {
			http.Error(w, "db unavailable", http.StatusServiceUnavailable)
			return
		}
		w.Write([]byte("ready"))
	})
	mux.Handle("/metrics", promhttp.HandlerFor(s.reg, promhttp.HandlerOpts{}))
	mux.HandleFunc("/v1/resources", s.instrument("/v1/resources", s.resources))
	return mux
}

func (s *Server) resources(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	switch r.Method {
	case http.MethodGet:
		items, err := s.repo.List(ctx, 100)
		if err != nil {
			s.fail(w, err)
			return
		}
		writeJSON(w, http.StatusOK, items)
	case http.MethodPost:
		var in Resource
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in); err != nil || in.Type == "" || in.Name == "" {
			http.Error(w, "type and name are required", http.StatusBadRequest)
			return
		}
		if in.Account == "" {
			in.Account = "default"
		}
		out, err := s.repo.Create(ctx, in)
		if err != nil {
			s.fail(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, out)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) fail(w http.ResponseWriter, err error) {
	s.log.Error("request failed", "err", err)
	http.Error(w, "internal error", http.StatusInternalServerError)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
