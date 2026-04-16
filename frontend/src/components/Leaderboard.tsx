import React, { useEffect, useState } from 'react';
import type { LeaderboardRecord } from '@heroiclabs/nakama-js';
import { nakamaService } from '../NakamaService';

export const Leaderboard: React.FC = () => {
  const [records, setRecords] = useState<LeaderboardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        const result = await nakamaService.listLeaderboardRecords();
        if (result.records) {
          setRecords(result.records);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to fetch rankings.");
      } finally {
        setLoading(false);
      }
    };
    fetchRankings();
  }, []);

  if (loading) {
    return <div className="loading-box"><span className="spinner"></span> Loading rankings...</div>;
  }

  if (error) {
    return <div className="error-box">{error}</div>;
  }

  return (
    <div className="leaderboard-container">
      <h2>Global Rankings</h2>

      {records.length === 0 ? (
        <p className="status-text">No one has played yet!</p>
      ) : (
        <table className="rankings-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Wins</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, idx) => (
              <tr key={record.owner_id} className={idx === 0 ? 'rank-first' : idx === 1 ? 'rank-second' : idx === 2 ? 'rank-third' : ''}>
                <td>#{record.rank}</td>
                <td className="username-cell">{record.username || "Anonymous"}</td>
                <td>{record.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
