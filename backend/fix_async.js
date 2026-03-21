const fs = require('fs');
let code = fs.readFileSync('src/game/PoemSnake/poemSnakeSocket.ts', 'utf8');

const events = ['room_reject_skip', 'room_accept_skip', 'room_request_skip', 'room_reject_draw', 'room_accept_draw', 'room_request_draw', 'room_end', 'room_accept_end', 'room_reject_end', 'room_chat_message', 'room_join', 'room_leave'];

for (const event of events) {
    code = code.replace(new RegExp(`socket\\.on\\("${event}",\\s*\\((.*?)\\) =>`, 'g'), `socket.on("${event}", async ($1) =>`);
}

fs.writeFileSync('src/game/PoemSnake/poemSnakeSocket.ts', code);
