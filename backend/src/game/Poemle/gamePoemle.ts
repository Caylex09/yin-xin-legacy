export const PUNCTUATION = new Set([
    '，', '。', '？', '！', '、', '；', '：', '“', '”', '‘', '’', '（', '）', '《', '》',
    ',', '.', '?', '!', ';', ':', '"', "'", '(', ')', '<', '>', '\n', '\r', ' '
]);

function removePunctuation(str: string): string {
    return str.split('').filter(c => !PUNCTUATION.has(c)).join('');
}

export type Verdict = 'green' | 'yellow' | 'gray';

export interface PoemleResult {
    char: string;
    verdict: Verdict;
}

export function judgePoemle(guess: string, target: string, guessStructure?: number[]): PoemleResult[] {
    const g = removePunctuation(guess);
    const t = removePunctuation(target);

    const result: PoemleResult[] = Array(g.length).fill(null).map((_, i) => ({ char: g[i] || '', verdict: 'gray' as Verdict }));

    if (g.length === 0) return [];

    let gStruct = guessStructure;
    if (!gStruct || !Array.isArray(gStruct) || gStruct.length === 0) {
        gStruct = [Math.ceil(g.length / 2), g.length - Math.ceil(g.length / 2)];
    }

    const tParts = target.split(/[，。！？；、,\.\!\?\n\r \u3000]/).map(x => removePunctuation(x)).filter(x => x.length > 0);
    let targetStructure = tParts.map(x => x.length);
    if (!targetStructure || targetStructure.length === 0) {
        targetStructure = [Math.ceil(t.length / 2), t.length - Math.ceil(t.length / 2)];
    }

    const map1DTo2D = (len: number, struct: number[]) => {
        const mapping = [];
        let r = 0, c = 0;
        for (let i = 0; i < len; i++) {
            while (r < struct.length && c >= struct[r]) {
                r++;
                c = 0;
            }
            if (r >= struct.length) {
                mapping.push({ r: struct.length - 1, c: c++ });
            } else {
                mapping.push({ r, c: c++ });
            }
        }
        return mapping;
    };

    const gMapping = map1DTo2D(g.length, gStruct);
    const tMapping = map1DTo2D(t.length, targetStructure);

    const targetChars = t.split('');
    const usedTargetIndices = new Set<number>();

    // First pass: mark greens
    for (let i = 0; i < g.length; i++) {
        const gPos = gMapping[i];
        const j = tMapping.findIndex(pos => pos.r === gPos.r && pos.c === gPos.c);
        if (j !== -1 && j < t.length && g[i] === t[j]) {
            result[i].verdict = 'green';
            usedTargetIndices.add(j);
        }
    }

    // Second pass: mark yellows
    for (let i = 0; i < g.length; i++) {
        if (result[i].verdict === 'green') continue;

        // Find first matching char in target that hasn't been used yet
        for (let j = 0; j < targetChars.length; j++) {
            if (g[i] === targetChars[j] && !usedTargetIndices.has(j)) {
                result[i].verdict = 'yellow';
                usedTargetIndices.add(j);
                break;
            }
        }
    }

    return result;
}
