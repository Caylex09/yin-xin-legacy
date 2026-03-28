const fs = require('fs');

function fixApi(file) {
    let content = fs.readFileSync(file, 'utf8');
    if (!content.includes('authorName: ')) {
        content = content.replace(/const chosenLine = eligible\[s % \(eligible\.length \|\| 1\)\] \|\| '';/g, 
            "const chosenLine = eligible[s % (eligible.length || 1)] || '';\n" +
            "              let authorName = doc.author || '';\n" +
            "              let dynasty = '未知';\n" +
            "              if (doc.author) {\n" +
            "                  try {\n" +
            "                      const poet = await searchClient.index('poets').getDocument(doc.author);\n" +
            "                      authorName = poet.name;\n" +
            "                      dynasty = poet.dynasty || dynasty;\n" +
            "                  } catch (e) { }\n" +
            "              }");
            
        content = content.replace(/author: doc\.author \|\| '',/g, "author: doc.author || '', authorName: authorName, dynasty: dynasty,");
        content = content.replace(/return \{ id: '', line: '', title: '', author: '' \};/g, "return { id: '', line: '', title: '', author: '', authorName: '', dynasty: '未知' };");
        content = content.replace(/return \{ id: item\.target_id, line: '', title: '', author: '' \};/g, "return { id: item.target_id, line: '', title: '', author: '', authorName: '', dynasty: '未知' };");
        
        fs.writeFileSync(file, content);
        console.log('Fixed ', file);
    }
}

fixApi('src/game/Poemle/poemleApi.ts');
fixApi('src/game/Poemle/PoemleGameManager.ts');

