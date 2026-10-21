package main

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Error("DATABASE_URL is required")
		os.Exit(1)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Error("open db", "err", err)
		os.Exit(1)
	}
	db.SetMaxOpenConns(envInt("DB_MAX_OPEN_CONNS", 10))
	db.SetConnMaxLifetime(5 * time.Minute)

	store := NewStore(db)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	for i := 0; i < 30; i++ { // wait for Postgres on cold start
		if err = store.Migrate(ctx); err == nil {
			break
		}
		log.Warn("waiting for database", "err", err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Error("migrate", "err", err)
		os.Exit(1)
	}

	addr := ":" + envStr("PORT", "8080")
	srv := &http.Server{Addr: addr, Handler: NewServer(store, log).Handler(), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	log.Info("listening", "addr", addr)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		log.Error("server", "err", err)
		os.Exit(1)
	}
}
