const fs = require('fs');

function fixApi(file) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace("author: string;", "author: string; authorName: string; dynasty: string;");
    fs.writeFileSync(file, content);
}

fixApi('src/game/Poemle/PoemleGameManager.ts');

