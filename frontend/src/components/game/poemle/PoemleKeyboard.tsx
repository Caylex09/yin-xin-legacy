import React, { useState, useEffect, useMemo } from 'react';
import { API_BASE } from '../../../config';
import type { PoemleCell } from './PoemleGrid';

interface PoemleKeyboardProps {
    currentGuess: string;
    onGuessChange: (val: string) => void;
    onSubmit: () => void;
    disabled?: boolean;
    lineLength?: number;
    guesses?: PoemleCell[][];
}

export function PoemleKeyboard({ currentGuess, onGuessChange, onSubmit, disabled, lineLength, guesses = [] }: PoemleKeyboardProps) {
    const [chars, setChars] = useState<{ char: string, count: number }[]>([]);
    const [showKeyboard, setShowKeyboard] = useState(false);

    useEffect(() => {
        const bareApi = API_BASE.replace(/\/api$/, "");
        fetch(`${bareApi}/api/game/poemle/chars`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setChars(data.chars);
                }
            })
            .catch(console.error);
    }, []);

    const usedChars = useMemo(() => {
        const map: Record<string, 'green' | 'yellow' | 'gray'> = {};
        for (const row of guesses) {
            for (const cell of row) {
                if (cell.char === '' || cell.char === ' ') continue;
                const current = map[cell.char];
                if (cell.verdict === 'green') {
                    map[cell.char] = 'green';
                } else if (cell.verdict === 'yellow' && current !== 'green') {
                    map[cell.char] = 'yellow';
                } else if (cell.verdict === 'gray' && current !== 'green' && current !== 'yellow') {
                    map[cell.char] = 'gray';
                }
            }
        }
        return map;
    }, [guesses]);

    const sortedChars = useMemo(() => {
        return [...chars].sort((a, b) => {
            const statusA = usedChars[a.char];
            const statusB = usedChars[b.char];

            if (statusA && !statusB) return -1;
            if (!statusA && statusB) return 1;

            if (statusA && statusB) {
                const weight = { green: 3, yellow: 2, gray: 1 };
                if (weight[statusA] !== weight[statusB]) {
                    return weight[statusB] - weight[statusA];
                }
            }

            return b.count - a.count;
        });
    }, [chars, usedChars]);

    const getKeyStyle = (char: string): React.CSSProperties => {
        const status = usedChars[char];
        let bg = '#e2e4e6'; // 默认灰底
        let color = '#2c1a0d';
        let borderColor = 'rgba(184, 92, 50, 0.2)';

        if (status === 'green') {
            bg = '#6aaa64';
            color = '#fff';
            borderColor = '#6aaa64';
        } else if (status === 'yellow') {
            bg = '#c9b458';
            color = '#fff';
            borderColor = '#c9b458';
        } else if (status === 'gray') {
            bg = '#787c7e';
            color = '#fff';
            borderColor = '#787c7e';
        }

        return {
            padding: '6px',
            fontSize: '18px',
            border: `1px solid ${borderColor}`,
            borderRadius: '6px',
            backgroundColor: bg,
            color,
            cursor: disabled ? 'not-allowed' : 'pointer',
            minWidth: '40px',
            minHeight: '44px',
            textAlign: 'center',
            position: 'relative',
        };
    };

    const handleCharClick = (char: string) => {
        if (disabled) return;
        if (lineLength && currentGuess.length >= lineLength) return;
        onGuessChange(currentGuess + char);
    };

    return (
        <div style={{
            width: '100%',
            maxWidth: '800px',
            margin: '0 auto',
            position: 'sticky',
            top: '10px',
            zIndex: 100,
            background: '#faf3e8',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            marginBottom: '20px'
        }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
                <input
                    type="text"
                    value={currentGuess}
                    onChange={e => {
                        const val = e.target.value.replace(/[，。！？；、,\.\!\?]/g, '');
                        onGuessChange(val);
                    }}
                    disabled={disabled}
                    placeholder={lineLength ? `请输入 ${lineLength} 个字` : '请输入诗句'}
                    style={{
                        flex: 1,
                        padding: '12px',
                        fontSize: '18px',
                        borderRadius: '8px',
                        border: '2px solid rgba(184, 92, 50, 0.4)',
                        background: '#fff',
                        color: '#3a1f12',
                        outline: 'none'
                    }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            onSubmit();
                        }
                    }}
                />
                <button
                    className="btn"
                    style={{ padding: '0 32px', height: '48px', fontSize: '18px' }}
                    onClick={onSubmit}
                    disabled={disabled}
                >
                    猜
                </button>
            </div>

            <button
                className="btn ghost"
                style={{ width: '100%', padding: '8px', fontSize: '14px', marginBottom: showKeyboard ? '12px' : '0' }}
                onClick={() => setShowKeyboard(!showKeyboard)}
            >
                {showKeyboard ? '收起常用字表' : '展开常用字表 (提示)'}
            </button>

            {showKeyboard && (
                <>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
                        gap: '6px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        padding: '8px',
                        background: 'rgba(255, 255, 255, 0.4)',
                        borderRadius: '8px'
                    }}>
                        {sortedChars.map(({ char, count }) => (
                            <button
                                key={char}
                                style={getKeyStyle(char)}
                                disabled={disabled}
                                onClick={() => handleCharClick(char)}
                            >
                                {char}
                                <span style={{
                                    position: 'absolute',
                                    bottom: '2px',
                                    right: '2px',
                                    fontSize: '8px',
                                    opacity: 0.7,
                                    lineHeight: '1'
                                }}>
                                    {count}
                                </span>
                            </button>
                        ))}
                    </div>
                    <div style={{ fontSize: '12px', textAlign: 'center', opacity: 0.6, marginTop: '8px' }}>
                        按热度排序的前 500 个常用字
                    </div>
                </>
            )}
        </div>
    );
}