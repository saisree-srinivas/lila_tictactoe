import { useState, useEffect } from 'react'
import { nakamaService } from './NakamaService'
import { TicTacToeGame } from './components/TicTacToeGame'
import { Leaderboard } from './components/Leaderboard'
import './index.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'play' | 'rankings'>('play')
  const [nickname, setNickname] = useState('')
  const [showLogin, setShowLogin] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)

  useEffect(() => {
    const savedName = localStorage.getItem('tictactoe_nickname');
    if (savedName) {
      setNickname(savedName);
    }
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!nickname.trim()) return;
    
    setIsConnecting(true);
    try {
      await nakamaService.authenticateDevice(nickname.trim());
      await nakamaService.connectSocket();
      localStorage.setItem('tictactoe_nickname', nickname.trim());
      setIsAuthenticated(true);
      setShowLogin(false);
      setError('');
    } catch (err) {
      setError('Failed to connect to Nakama Server.');
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Tic Tac Toe</h1>
        <p className="subtitle">Real-time Multiplayer Experience</p>
        
        {isAuthenticated && (
          <div className="tab-nav">
            <button 
              className={`tab-btn ${activeTab === 'play' ? 'active' : ''}`}
              onClick={() => setActiveTab('play')}
            >
              Play
            </button>
            <button 
              className={`tab-btn ${activeTab === 'rankings' ? 'active' : ''}`}
              onClick={() => setActiveTab('rankings')}
            >
              Rankings
            </button>
          </div>
        )}
      </header>
      
      <main className="app-main">
        {error ? (
          <div className="error-box" style={{textAlign: 'center', marginBottom: '1rem', color: '#f43f5e'}}>{error}</div>
        ) : null}

        {showLogin ? (
          <div className="login-container tictactoe-container">
            <h2 style={{fontSize: '1.5rem', marginBottom: '0.5rem', color: '#f8fafc', fontWeight: 600}}>Who are you?</h2>
            <form onSubmit={handleLogin} style={{display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', alignItems: 'flex-end', marginTop: '1rem'}}>
              <input 
                type="text" 
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Nickname" 
                className="nickname-input"
                style={{
                  width: '100%', padding: '1rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px', color: 'white', fontSize: '1.1rem', fontFamily: 'inherit', outline: 'none'
                }}
                autoFocus
              />
              <button type="submit" className="primary-btn" disabled={!nickname.trim() || isConnecting} style={{minWidth: '120px', padding: '0.6rem 1.5rem', fontSize: '1rem'}}>
                {isConnecting ? 'Connecting...' : 'Continue'}
              </button>
            </form>
          </div>
        ) : !isAuthenticated ? (
          <div className="loading-box" style={{textAlign: 'center', padding: '2rem'}}>
            <span className="spinner"></span>
            Connecting to server...
          </div>
        ) : (
          activeTab === 'play' ? <TicTacToeGame /> : <Leaderboard />
        )}
      </main>
    </div>
  )
}

export default App
