import sys, re
with open('src/pages/game/poemle/PoemlePage.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = re.sub(r'\{gameWon \? <><a[^:]+:\s*\'[^\']+\'\}', r'{gameWon ? <><a style={{ color: \'inherit\' }} href={/wiki/poets/}>【{currentDailyPoem.dynasty || \'未知\'}】{currentDailyPoem.authorName || currentDailyPoem.author}</a>《<a style={{ color: \'inherit\' }} href={/wiki/poetry/}>{currentDailyPoem.title}</a>》</> : \'？？？出处隐藏中\'}', c)
with open('src/pages/game/poemle/PoemlePage.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
