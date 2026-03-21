const fs = require('fs');
let code = fs.readFileSync('src/game/PoemSnake/poemSnakeSocket.ts', 'utf8');

// The functions accepting data
code = code.replace(/socket\.on\("room_skip_vote", \s*\((.*?)\) =>/g, 'socket.on("room_skip_vote", async ($1) =>');
code = code.replace(/socket\.on\("room_skip_vote_response", \s*\((.*?)\) =>/g, 'socket.on("room_skip_vote_response", async ($1) =>');
code = code.replace(/socket\.on\("room_end_vote_response", \s*\((.*?)\) =>/g, 'socket.on("room_end_vote_response", async ($1) =>');
code = code.replace(/socket\.on\("room_end_vote", \s*\((.*?)\) =>/g, 'socket.on("room_end_vote", async ($1) =>');


code = code.replace(/result\.error/g, '(result as any).error');
code = code.replace(/result\.skipChar/g, '(result as any).skipChar');
code = code.replace(/result\.finished/g, '(result as any).finished');
code = code.replace(/rejectVote\.error/g, '(rejectVote as any).error');

code = code.replace(/result as \{ state: /g, '(result as any) as { state: ');
code = code.replace(/vote\.state ===/g, '(vote as any).state ===');

code = code.replace(/matchmaking\.resolveEndVote\(data\.roomCode, false\)/g, 'await matchmaking.resolveEndVote(data.roomCode)');
// if not replaced by above, add await and remove false if it exists
code = code.replace(/const res = matchmaking\.resolveEndVote\(data\.roomCode\)/g, 'const res = await matchmaking.resolveEndVote(data.roomCode)');

fs.writeFileSync('src/game/PoemSnake/poemSnakeSocket.ts', code);
