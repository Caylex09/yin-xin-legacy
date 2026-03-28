const fs = require('fs');
const lines = fs.readFileSync('src/pages/game/poemle/PoemlePage.tsx', 'utf8').split('\n');
lines[268] = '                                {gameWon ? <><a style={{ color: "inherit", textDecoration: "none" }} href={`/wiki/poets/${currentDailyPoem.author}`}>【{currentDailyPoem.dynasty || "未知"}】{currentDailyPoem.authorName || currentDailyPoem.author}</a>《<a style={{ color: "inherit", textDecoration: "none" }} href={`/wiki/poetry/${currentDailyPoem.id}`}>{currentDailyPoem.title}</a>》</> : "？？？出处隐藏中"}';
fs.writeFileSync('src/pages/game/poemle/PoemlePage.tsx', lines.join('\n'));
