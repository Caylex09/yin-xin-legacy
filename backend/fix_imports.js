const fs = require('fs');
let api = fs.readFileSync('src/game/PoemSnake/poemSnakeApi.ts', 'utf8');
api = api.replace('import * as matchmaking from "./gamePoemSnakeMatchMaking";', 'import { poemSnakeRoomManager as matchmaking } from "./PoemSnakeGameManager";');
api = api.replace(/\(p\)/g, '(p: any)');
fs.writeFileSync('src/game/PoemSnake/poemSnakeApi.ts', api);

let socket = fs.readFileSync('src/game/PoemSnake/poemSnakeSocket.ts', 'utf8');
socket = socket.replace(/\.find\(\(p\) =>/g, '.find((p: any) =>');
socket = socket.replace(/\.map\(\(p\) =>/g, '.map((p: any) =>');
socket = socket.replace(/\.some\(\(p\) =>/g, '.some((p: any) =>');
fs.writeFileSync('src/game/PoemSnake/poemSnakeSocket.ts', socket);

let state = fs.readFileSync('src/game/PoemSnake/poemSnakeState.ts', 'utf8');
state = state.replace('import * as matchmaking from "./gamePoemSnakeMatchMaking";', 'import { poemSnakeRoomManager as matchmaking } from "./PoemSnakeGameManager";');
state = state.replace('import { newGame } from "./gamePoemSnake";', '');
fs.writeFileSync('src/game/PoemSnake/poemSnakeState.ts', state);
console.log('done');
