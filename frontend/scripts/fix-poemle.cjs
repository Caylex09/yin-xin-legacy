const fs = require('fs');

function fixApi(file) {
    let content = fs.readFileSync(file, 'utf8');
    const startIdx = content.indexOf('{gameWon ? <>');
    const endIdx = content.indexOf("中'}");
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        content = content.substring(0, startIdx) + "{gameWon ? <><a style={{ color: 'inherit' }} href={\/wiki/poets/\\}>【{currentDailyPoem.dynasty || '未知'}】{currentDailyPoem.authorName || currentDailyPoem.author}</a>《<a style={{ color: 'inherit' }} href={\/wiki/poetry/\\}>{currentDailyPoem.title}</a>》</> : '？？？出处隐藏中'}" + content.substring(endIdx + 3);
    }
    fs.writeFileSync(file, content);
}

fixApi('src/pages/game/poemle/PoemlePage.tsx');

