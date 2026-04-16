package main

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"
)

// OpCodes for the Tic-Tac-Toe match
const (
	OpCodeMove    int64 = 1
	OpCodeUpdate  int64 = 2
	OpCodeStart   int64 = 3
	OpCodeRematch int64 = 4
)

// Mark types
const (
	MarkEmpty int = 0
	MarkX     int = 1
	MarkO     int = 2
)

// MatchState defines the game state
type MatchState struct {
	Presences       map[string]runtime.Presence
	Players         []runtime.Presence // Players[0] is X, Players[1] is O
	Board           [9]int
	Turn            int             // 0 or 1 index into Players array. -1 if not started.
	Winner          int             // -1 if tie, 0/1 for player, or -2 if ongoing
	RematchRequests map[string]bool // SessionId -> bool
	Mode            string
	TurnExpiresAt   int64
}

type TicTacToeMatch struct{}

func (m *TicTacToeMatch) MatchInit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, params map[string]interface{}) (interface{}, int, string) {
	mode := "classic"
	if m, ok := params["mode"].(string); ok {
		mode = m
	}

	state := &MatchState{
		Presences:       make(map[string]runtime.Presence),
		Players:         make([]runtime.Presence, 0, 2),
		Board:           [9]int{},
		Turn:            -1,
		Winner:          -2,
		RematchRequests: make(map[string]bool),
		Mode:            mode,
		TurnExpiresAt:   0,
	}
	// Tick rate of 10 ticks per second is more than enough for a turn-based game.
	tickRate := 10
	return state, tickRate, "tictactoe-match"
}

func (m *TicTacToeMatch) MatchJoinAttempt(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presence runtime.Presence, metadata map[string]string) (interface{}, bool, string) {
	s := state.(*MatchState)
	// Refuse join if match already has 2 players
	if len(s.Players) >= 2 {
		return s, false, "Match full"
	}
	return s, true, ""
}

func (m *TicTacToeMatch) MatchJoin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	s := state.(*MatchState)
	for _, p := range presences {
		s.Presences[p.GetSessionId()] = p
		if len(s.Players) < 2 {
			s.Players = append(s.Players, p)
		}
	}

	// Start game if we have exactly 2 players
	if len(s.Players) == 2 && s.Turn == -1 {
		s.Turn = 0 // Player 1 (X) starts
		if s.Mode == "timed" {
			s.TurnExpiresAt = tick + 300 // 30 seconds at 10 ticks/sec
		}

		msg := map[string]interface{}{
			"board": s.Board,
			"turn":  s.Players[0].GetUserId(),
		}
		if s.Mode == "timed" {
			msg["deadline"] = 30
		}
		encoded, _ := json.Marshal(msg)
		dispatcher.BroadcastMessage(OpCodeStart, encoded, nil, nil, true)
	}

	return s
}

func (m *TicTacToeMatch) MatchLeave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	s := state.(*MatchState)
	for _, p := range presences {
		delete(s.Presences, p.GetSessionId())

		// If an active player left during an ongoing game, the game terminates
		for i, player := range s.Players {
			if player.GetSessionId() == p.GetSessionId() && s.Winner == -2 {
				// The other player wins by default, or we just declare match over.
				winnerIdx := 1 - i
				if len(s.Players) > winnerIdx {
					s.Winner = winnerIdx
				} else {
					s.Winner = -1
				}

				updateMsg := map[string]interface{}{
					"board":  s.Board,
					"winner": "forfeit", // specific logic for forfeit
				}
				encoded, _ := json.Marshal(updateMsg)
				dispatcher.BroadcastMessage(OpCodeUpdate, encoded, nil, nil, true)
				break
			}
		}
	}

	// If no one is remaining in the match, end the match
	if len(s.Presences) == 0 {
		return nil
	}

	return s
}

func (m *TicTacToeMatch) MatchLoop(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, messages []runtime.MatchData) interface{} {
	s := state.(*MatchState)

	// Check timeout forfeit
	if s.Winner == -2 && s.Mode == "timed" && s.TurnExpiresAt > 0 && s.Turn >= 0 && len(s.Players) == 2 {
		if tick >= s.TurnExpiresAt {
			// The current player takes too long. They lose.
			winnerIdx := 1 - s.Turn
			s.Winner = winnerIdx
			updateMsg := map[string]interface{}{
				"board":  s.Board,
				"winner": s.Players[winnerIdx].GetUserId(),
			}
			encoded, _ := json.Marshal(updateMsg)
			dispatcher.BroadcastMessage(OpCodeUpdate, encoded, nil, nil, true)
		}
	}

	for _, message := range messages {
		if message.GetOpCode() == OpCodeRematch {
			// Only allow rematch if the game is over
			if s.Winner == -2 {
				continue
			}
			s.RematchRequests[message.GetSessionId()] = true

			// Check if both players want to rematch
			if len(s.RematchRequests) == 2 && len(s.Players) == 2 {
				s.Board = [9]int{}
				s.Winner = -2
				// Optional: swap start turn, but sticking to player 1 (X) starting or whoever's turn it wasn't
				s.Turn = 0
				s.RematchRequests = make(map[string]bool)
				if s.Mode == "timed" {
					s.TurnExpiresAt = tick + 300 // 30 sec limit
				}

				msg := map[string]interface{}{
					"board": s.Board,
					"turn":  s.Players[0].GetUserId(),
				}
				if s.Mode == "timed" {
					msg["deadline"] = 30
				}
				encoded, _ := json.Marshal(msg)
				dispatcher.BroadcastMessage(OpCodeStart, encoded, nil, nil, true)
			}
		} else if message.GetOpCode() == OpCodeMove {
			// Ignore if not started or if game is already over
			if s.Turn == -1 || len(s.Players) < 2 || s.Winner != -2 {
				continue
			}
			// We define the move payload: {"position": 0-8}
			var payload struct {
				Position int `json:"position"`
			}
			if err := json.Unmarshal(message.GetData(), &payload); err != nil {
				logger.Warn("Invalid move payload: %v", err)
				continue
			}

			// Verify it's the sender's turn
			playerTurn := s.Players[s.Turn]
			if message.GetSessionId() != playerTurn.GetSessionId() {
				// Not their turn
				continue
			}

			pos := payload.Position
			// Validate move correctness
			if pos < 0 || pos > 8 || s.Board[pos] != MarkEmpty {
				// Invalid position
				continue
			}

			// Apply the move to the board
			if s.Turn == 0 {
				s.Board[pos] = MarkX
			} else {
				s.Board[pos] = MarkO
			}

			// Validation for 3-in-a-row
			s.Winner = m.checkWinner(s.Board)
			if s.Winner == -2 {
				// It's still an ongoing match -> pass the turn to the other player
				s.Turn = 1 - s.Turn
				if s.Mode == "timed" {
					s.TurnExpiresAt = tick + 300
				}
			} else {
				// Match just finished! Calculate rewards and write stats.
				m.recordMatchResults(ctx, logger, nk, s)
			}

			updateMsg := map[string]interface{}{
				"board": s.Board,
			}

			if s.Winner == -2 {
				updateMsg["turn"] = s.Players[s.Turn].GetUserId()
				if s.Mode == "timed" {
					updateMsg["deadline"] = 30
				}
			} else {
				// We have a game over (a winner or a tie)
				if s.Winner == -1 {
					updateMsg["winner"] = "tie"
				} else {
					updateMsg["winner"] = s.Players[s.Winner].GetUserId()
				}
			}

			// Broadcast updated board state and game result
			encoded, _ := json.Marshal(updateMsg)
			dispatcher.BroadcastMessage(OpCodeUpdate, encoded, nil, nil, true)
		}
	}

	return s
}

func (m *TicTacToeMatch) MatchTerminate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, graceSeconds int) interface{} {
	return state
}

func (m *TicTacToeMatch) recordMatchResults(ctx context.Context, logger runtime.Logger, nk runtime.NakamaModule, s *MatchState) {
	if s.Winner == -2 || len(s.Players) != 2 {
		return
	}

	for i, player := range s.Players {
		points := int64(0)
		stats := map[string]int{"wins": 0, "losses": 0, "draws": 0}

		if s.Winner == -1 {
			points = 50
			stats["draws"] = 1
		} else if s.Winner == i {
			points = 200
			stats["wins"] = 1
		} else {
			points = 10
			stats["losses"] = 1
		}

		// Fetch existing Storage
		objects, err := nk.StorageRead(ctx, []*runtime.StorageRead{
			{Collection: "stats", Key: "wld", UserID: player.GetUserId()},
		})
		if err == nil && len(objects) > 0 {
			var existingStats map[string]int
			if json.Unmarshal([]byte(objects[0].Value), &existingStats) == nil {
				stats["wins"] += existingStats["wins"]
				stats["losses"] += existingStats["losses"]
				stats["draws"] += existingStats["draws"]
			}
		}

		// FIX: Prepare metadata as map[string]interface{} for LeaderboardRecordWrite
		leaderboardMeta := make(map[string]interface{})
		for k, v := range stats {
			leaderboardMeta[k] = v
		}

		// Write to Leaderboard using the map instead of a string
		_, err = nk.LeaderboardRecordWrite(ctx, "tictactoe_global", player.GetUserId(), player.GetUsername(), points, 0, leaderboardMeta, nil)
		if err != nil {
			logger.Error("Failed to write leaderboard for %s: %v", player.GetUsername(), err)
		}

		// Save updated Storage (StorageWrite still accepts a JSON string in the Value field)
		encodedStats, _ := json.Marshal(stats)
		_, err = nk.StorageWrite(ctx, []*runtime.StorageWrite{
			{
				Collection:      "stats",
				Key:             "wld",
				UserID:          player.GetUserId(),
				Value:           string(encodedStats),
				PermissionRead:  2,
				PermissionWrite: 1,
			},
		})
		if err != nil {
			logger.Error("Failed to write storage for %s: %v", player.GetUsername(), err)
		}
	}
}

func (m *TicTacToeMatch) MatchSignal(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, data string) (interface{}, string) {
	return state, ""
}

func (m *TicTacToeMatch) checkWinner(board [9]int) int {
	winningLines := [][]int{
		{0, 1, 2}, {3, 4, 5}, {6, 7, 8}, // Runs along rows
		{0, 3, 6}, {1, 4, 7}, {2, 5, 8}, // Runs along columns
		{0, 4, 8}, {2, 4, 6}, // Diagonals
	}

	for _, line := range winningLines {
		if board[line[0]] != MarkEmpty && board[line[0]] == board[line[1]] && board[line[1]] == board[line[2]] {
			if board[line[0]] == MarkX {
				return 0 // Maps to Players[0]
			}
			return 1 // Maps to Players[1]
		}
	}

	// Tie game
	for _, cell := range board {
		if cell == MarkEmpty {
			return -2 // Ongoing match
		}
	}

	return -1 // Tie match!
}
