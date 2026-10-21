package main

import (
	"context"
	"database/sql"
	"strconv"
	"os"
	"time"
)

type Resource struct {
	ID        int64     `json:"id"`
	Type      string    `json:"type"`
	Name      string    `json:"name"`
	Account   string    `json:"account"`
	CreatedAt time.Time `json:"created_at"`
}

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func (s *Store) Migrate(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS resources (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  account TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`)
	return err
}

func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

func (s *Store) Create(ctx context.Context, r Resource) (Resource, error) {
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO resources (type, name, account) VALUES ($1,$2,$3) RETURNING id, created_at`,
		r.Type, r.Name, r.Account).Scan(&r.ID, &r.CreatedAt)
	return r, err
}

func (s *Store) List(ctx context.Context, limit int) ([]Resource, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, type, name, account, created_at FROM resources ORDER BY id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Resource{}
	for rows.Next() {
		var r Resource
		if err := rows.Scan(&r.ID, &r.Type, &r.Name, &r.Account, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func envStr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil {
		return v
	}
	return def
}
