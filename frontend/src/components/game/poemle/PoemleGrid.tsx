import React from 'react';

export type Verdict = 'green' | 'yellow' | 'gray' | 'default';

export interface PoemleCell {
    char: string;
    verdict: Verdict;
}

interface PoemleGridProps {
    guesses: PoemleCell[][];
    currentGuess: string;
    lineLength?: number;
    gridSize?: number;
    mode?: string;
}

export function PoemleGrid({ guesses, currentGuess, gridSize = 20, lineLength, mode }: PoemleGridProps) {
    const padToGrid = (chars: PoemleCell[], size: number, isSubmitted: boolean = false) => {
        let padVerdict: Verdict = 'default';
        if (isSubmitted && chars.length > 0) {
            const allGreen = chars.every(c => c.verdict === 'green' || (c.verdict === 'default' && (c.char === '' || c.char === ' ')));
            if (allGreen) {
                padVerdict = 'green';
            }
        }

        const res: PoemleCell[] = new Array(size).fill(null).map(() => ({ char: '', verdict: padVerdict }));

        if (!isSubmitted || mode === '自由' || chars.length === size) {
            for (let i = 0; i < chars.length && i < size; i++) {
                res[i] = chars[i];
            }
        } else {
            const halfLen = Math.ceil(chars.length / 2);
            const halfSize = Math.floor(size / 2);

            for (let i = 0; i < halfLen && i < halfSize; i++) {
                res[i] = chars[i];
                if (halfLen + i < chars.length) {
                    res[halfSize + i] = chars[halfLen + i];
                }
            }
        }
        return res;
    };

    const displayRows = guesses.map(row => padToGrid(row, gridSize, true));

    const currentRowChars = Array.from(currentGuess);
    const activeRow = padToGrid(
        currentRowChars.map(c => ({ char: c, verdict: 'default' as Verdict })),
        gridSize,
        false
    );
    const allRows = [...displayRows, activeRow];

    const getBgStyle = (verdict: Verdict): React.CSSProperties => {
        switch (verdict) {
            case 'green':
                return { backgroundColor: '#6aaa64', color: '#fff', borderColor: '#6aaa64' };
            case 'yellow':
                return { backgroundColor: '#c9b458', color: '#fff', borderColor: '#c9b458' };
            case 'gray':
                return { backgroundColor: '#787c7e', color: '#fff', borderColor: '#787c7e' };
            default:
                return { backgroundColor: 'rgba(255,255,255,0.7)', color: '#2c1a0d', borderColor: 'rgba(184, 92, 50, 0.4)' };
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', margin: '20px 0' }}>
            {allRows.map((row, rowIndex) => {
                const half = Math.ceil(row.length / 2);
                const firstHalf = row.slice(0, half);
                const secondHalf = row.slice(half, row.length);

                const cellStyle = (cell: PoemleCell): React.CSSProperties => ({
                    width: '40px',
                    height: '40px',
                    border: '2px solid',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    borderRadius: '4px',
                    ...getBgStyle(cell.verdict),
                    ...(cell.char === ' ' && cell.verdict === 'default' ? { borderColor: 'transparent', backgroundColor: 'rgba(0,0,0,0.05)' } : {})
                });

                return (
                    <div key={rowIndex} style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {firstHalf.map((cell, cellIndex) => (
                                <div key={cellIndex} style={cellStyle(cell)}>
                                    {cell.char}
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {secondHalf.map((cell, cellIndex) => (
                                <div key={cellIndex} style={cellStyle(cell)}>
                                    {cell.char}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}