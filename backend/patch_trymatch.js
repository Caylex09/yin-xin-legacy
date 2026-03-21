const fs = require('fs');
let code = fs.readFileSync('src/game/PoemSnake/PoemSnakeGameManager.ts', 'utf8');
code = code.replace(
  'public tryMatch(playersNeeded:',
  'public tryMatchWithDetails(playersNeeded:'
);
fs.writeFileSync('src/game/PoemSnake/PoemSnakeGameManager.ts', code);

let socketCode = fs.readFileSync('src/game/PoemSnake/poemSnakeSocket.ts', 'utf8');
socketCode = socketCode.replace(/tryMatch\(/g, 'tryMatchWithDetails(');
fs.writeFileSync('src/game/PoemSnake/poemSnakeSocket.ts', socketCode);
console.log('done');
