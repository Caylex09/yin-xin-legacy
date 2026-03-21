const fs = require('fs');
const file = 'src/game/PoemSnake/poemSnakeSocket.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
  'import * as matchmaking from "./gamePoemSnakeMatchMaking";',
  'import { poemSnakeRoomManager as matchmaking } from "./PoemSnakeGameManager";'
);
fs.writeFileSync(file, code);
console.log('done');
