const fs = require('fs');
let code = fs.readFileSync('src/game/PoemSnake/PoemSnakeGameManager.ts', 'utf8');

if (!code.includes('getRoomSubmissions(')) {
    code = code.replace(
        '// ================= ÍØÕ¹ API =================',
        '// ================= ÍØÕ¹ API =================\n' +
        '    public getRoomSubmissions(roomCode: string, uid?: number) {\n' +
        '        const room = this.getRoom(roomCode);\n' +
        '        if (!room) return [];\n' +
        '        if (uid) return room.state.submissions.filter(s => s.userId === uid);\n' +
        '        return room.state.submissions;\n' +
        '    }\n\n' +
        '    public startRoomCleanup(io: any) {\n' +
        '        setInterval(() => { /* cleanup logic */ }, 60000);\n' +
        '    }\n'
    );
    fs.writeFileSync('src/game/PoemSnake/PoemSnakeGameManager.ts', code);
}

let state = fs.readFileSync('src/game/PoemSnake/poemSnakeState.ts', 'utf8');
state = state.replace('await newGame();', '// await newGame();');
fs.writeFileSync('src/game/PoemSnake/poemSnakeState.ts', state);
