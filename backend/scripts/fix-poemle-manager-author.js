const fs = require('fs');

function fixApi(file) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/const line = eligible\[Math\.floor\(Math\.random\(\) \* eligible\.length\)\];/g, 
        "const line = eligible[Math.floor(Math.random() * eligible.length)];\n" +
        "              let authorName = doc.author || '';\n" +
        "              let dynasty = '未知';\n" +
        "              if (doc.author) {\n" +
        "                  try {\n" +
        "                      const poet = await searchClient.index('poets').getDocument(doc.author);\n" +
        "                      authorName = poet.name;\n" +
        "                      dynasty = poet.dynasty || dynasty;\n" +
        "                  } catch (e) { }\n" +
        "              }");
    fs.writeFileSync(file, content);
}

fixApi('src/game/Poemle/PoemleGameManager.ts');

