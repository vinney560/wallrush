# 🎮 WallRush - Real-Time Multiplayer Strategy Game

A modern, real-time implementation of the classic Quoridor board game, built with Flask and Socket.IO. Challenge friends or play against AI in this strategic race to the opposite side of the board.

![WallRush Banner](https://img.shields.io/badge/Flask-3.x-000000?style=for-the-badge&logo=flask)
![Socket.IO](https://img.shields.io/badge/Socket.IO-5.x-010101?style=for-the-badge&logo=socket.io)
![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python)
![PostgreSQL/SQLite](https://img.shields.io/badge/Database-SQL-336791?style=for-the-badge&logo=postgresql)

## ✨ Features

### 🎯 Core Gameplay
- **9x9 Game Board**: Classic Quoridor grid with strategic depth
- **5 Walls per Player**: Block your opponent's path with carefully placed barriers
- **Real-time Multiplayer**: Matchmaking system to play against real players
- **AI Opponents**: Play against built-in AI bots when no humans are available
- **20-Second Turn Timer**: Keep games fast-paced with automatic timeouts

### 🎨 Modern Experience
- **Live Leaderboards**: Track top players globally, weekly, and daily
- **Player Profiles**: Unique usernames with animal emojis as avatars
- **Points System**: Earn points for wins, lose points for losses
- **Rematch Functionality**: Quick rematches with the same opponent
- **Emoji Reactions**: Express yourself during matches
- **Responsive Design**: Play on desktop or mobile devices

### 🔧 Technical Highlights
- **WebSocket Powered**: Real-time game state synchronization
- **Connection Pooling**: Robust database connections with SQLAlchemy
- **Auto-migration**: Automatic database schema updates
- **Production Ready**: Gunicorn configuration included
- **Scalable Architecture**: Handles multiple concurrent games

## 🎮 How to Play

### Objective
Be the first player to move your pawn to the opposite side of the board. Blue starts at the bottom and needs to reach the top row (row 0). Red starts at the top and needs to reach the bottom row (row 8).

### Movement Rules
- Move one cell in any direction (up, down, left, right)
- Jump over your opponent if they are adjacent to you
- Cannot move through walls
- Walls block movement across them

### Wall Placement
- Each player starts with 5 walls
- Place walls horizontally or vertically to block paths
- Walls cannot completely block a player's path to victory
- Must always have at least one valid path to the goal

## 🚀 Quick Start

### Prerequisites
- Python 3.12+
- pip and pip-tools
- A SQL database (SQLite, PostgreSQL, MySQL)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/wallrush.git
cd wallrush
```

2. **Install dependencies**
```bash
pip install -r requirements.txt
# Or if you want to compile from source:
pip-compile requirements.in
```

3. **Set up environment variables**
Create a `.env` file in the root directory:
```env
SECRET_KEY=your_secure_secret_key_here
DATABASE_URI=sqlite:///wallrush.db  # Or your production database URI
```

4. **Initialize the database**
The application automatically creates tables and runs migrations on startup.

5. **Run the development server**
```bash
flask run
# Or with Socket.IO support:
python app.py
```

6. **Open in your browser**
Navigate to `http://localhost:5000` to start playing!

### Production Deployment

The project includes a `gunicorn.conf.py` for production deployment:

```bash
# Install gunicorn if not already installed
pip install gunicorn eventlet

# Run with the included configuration
gunicorn -c gunicorn.conf.py app:app
```

## 🏗️ Architecture

### Backend Stack
- **Flask**: Web framework handling routes and templates
- **Flask-SocketIO**: WebSocket support for real-time communication
- **Flask-SQLAlchemy**: ORM for database operations
- **Python-decouple**: Environment configuration management

### Database Models

#### GameProfile
Stores player information and statistics:
- `token`: Unique player identifier (primary key)
- `name`: Generated username (e.g., user_abc123)
- `avatar`: Emoji avatar from a curated pool
- `points`: Elo-style points for matchmaking
- `created_at`: Account creation timestamp
- `last_seen`: Last activity timestamp

#### GameMatch
Stores historical match data:
- `code`: Unique room code (6 characters)
- `blue_token`: Blue player's token
- `red_token`: Red player's token
- `moves_json`: JSON array of all moves made
- `winner_id`: Token of the winning player
- `finished`: Whether the match has ended
- `created_at`: Match creation timestamp

### Key Configuration Constants
```python
TURN_TIMEOUT = 20        # Seconds per turn
EMOJI_COOLDOWN = 3       # Minimum seconds between emojis
DISCONNECT_GRACE = 10    # Wait time before disconnect cleanup
FINISHED_ROOM_TTL = 120  # Keep finished rooms for 2 minutes
WIN_POINTS = 10          # Points awarded for a win
LOSE_POINTS = 5          # Points deducted for a loss
```

## 🎯 Socket.IO Events

### Client → Server Events
- `join_queue`: Enter matchmaking queue
- `create_private`: Create a private game room
- `join_private`: Join an existing private room
- `make_move`: Submit a game move
- `send_emoji`: Send an emoji reaction
- `request_rematch`: Request a rematch after a game
- `abandon_room`: Leave a finished game room

### Server → Client Events
- `room_state`: Current game state update
- `match_ended`: Game has concluded with results
- `peer_left`: Opponent disconnected
- `leaders_changed`: Leaderboard data updated
- `joined_queue`: Successfully entered matchmaking

## 🎨 Customization

### Add New Avatars
Edit the `AVATAR_POOL` in `app.py` to add new emoji avatars:
```python
AVATAR_POOL = [
    '🦊', '🐺', '🦅', '🐦‍⬛', '🐆',  # Existing
    '🦄', '🐲', '🦋', '🌸', '🌈',    # Your new additions
]
```

### Adjust Game Balance
Tweak the points system or turn timers to change game dynamics:
```python
WIN_POINTS = 15    # Increase points for winning
LOSE_POINTS = 3    # Decrease penalty for losing
TURN_TIMEOUT = 30  # Give players more time
```

### Custom Board Size
Modify the game board dimensions in `static/game.js`:
```javascript
const SIZE = 11;  // Make it an 11x11 board
const WALLS = 7;  // Give each player more walls
```

## 📊 Scaling Considerations

### Database Optimization
- Connection pooling configured with 30 pool size, 60 max overflow
- Automatic pool recycling every 30 minutes
- Connection pre-ping to handle stale connections

### Horizontal Scaling
- Stateless game server architecture
- Redis adapter support for multi-server deployment (add Socket.IO Redis adapter)
- Database is the single source of truth

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Report Bugs**: Create issues for any bugs you find
2. **Feature Requests**: Suggest new features or improvements
3. **Code Contributions**: Submit pull requests with bug fixes or features
4. **Documentation**: Help improve this README and add documentation

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by the classic board game Quoridor
- Built with amazing Python ecosystem tools
- Special thanks to the Flask and Socket.IO communities

---

**Enjoy the game! 🎉 Challenge your friends and climb the leaderboards!**