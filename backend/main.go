package main

import (
	"context"
	"database/sql"

	"github.com/heroiclabs/nakama-common/runtime"
)

func InitModule(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	logger.Info("Nakama module loaded")

	if err := initializer.RegisterMatch("tictactoe", func(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule) (runtime.Match, error) {
		return &TicTacToeMatch{}, nil
	}); err != nil {
		logger.Error("Unable to register match: %v", err)
		return err
	}

	if err := initializer.RegisterMatchmakerMatched(MakeMatch); err != nil {
		logger.Error("Unable to register matchmaker matched hook: %v", err)
		return err
	}

	// Initialize the tictactoe_global leaderboard
	id := "tictactoe_global"
	authoritative := true
	sortOrder := "desc"
	operator := "incr"
	resetSchedule := "" // Never reset
	metadata := make(map[string]interface{})
	if err := nk.LeaderboardCreate(ctx, id, authoritative, sortOrder, operator, resetSchedule, metadata); err != nil {
		logger.Error("Unable to create leaderboard %q: %v", id, err)
		return err
	}

	return nil
}

func MakeMatch(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, entries []runtime.MatchmakerEntry) (string, error) {
	// Extract the Presence of the matched players
	for _, e := range entries {
		p := e.GetPresence()
		logger.Info("Matched user '%s' named '%s'", p.GetUserId(), p.GetUsername())
	}

	// Determine mode from the first entry if available
	mode := "classic"
	if len(entries) > 0 {
		props := entries[0].GetProperties() // Correct method for v1.31.0
		if val, exists := props["mode"]; exists {
			if strVal, ok := val.(string); ok {
				mode = strVal
			}
		}
	}

	// Call nk.MatchCreate using the module name of our Tic-Tac-Toe match handler
	matchId, err := nk.MatchCreate(ctx, "tictactoe", map[string]interface{}{
		"mode": mode,
	})
	if err != nil {
		logger.Error("Error creating match: %v", err)
		return "", err
	}

	// Return the MatchID so both clients are automatically moved into the game room
	return matchId, nil
}
