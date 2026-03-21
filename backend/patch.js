const fs = require('fs');
const file = 'src/game/PoemSnake/poemSnakeSocket.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'import { newTurn, getPublicScreenPoem, checkPoem, VERDICT, VERDICT_TEXT } from "./gamePoemSnake";',
  'import { checkPoem, VERDICT, VERDICT_TEXT } from "./gamePoemSnake";\n' +
  'import { publicRoomManager } from "./PoemSnakePublicManager";\n\n' +
  'function getPublicScreenPoem() {\n' +
  '    const q = publicRoomManager.getCurrentQuestion(publicRoomManager.PUBLIC_ROOM_ID);\n' +
  '    const room = publicRoomManager.getPublicScreenRoom();\n' +
  '    return {\n' +
  '        content: q?.content || "",\n' +
  '        origin: q?.poemTitle || "",\n' +
  '        author: q?.author || "",\n' +
  '        pos: room?.state?.currentPos || 0\n' +
  '    };\n' +
  '}\n' +
  'async function newTurn() {\n' +
  '    await publicRoomManager.applySkip(publicRoomManager.PUBLIC_ROOM_ID, 0);\n' +
  '}\n'
);

fs.writeFileSync(file, code);
console.log('Done');
