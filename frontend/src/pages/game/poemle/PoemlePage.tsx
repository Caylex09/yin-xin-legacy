import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "../../../config";
import { getToken } from "../../../auth";
import { io, Socket } from "socket.io-client";
import { Toast } from "../../../components/Toast";
import { PoemleKeyboard } from "../../../components/game/poemle/PoemleKeyboard";
import { PoemleGrid } from "../../../components/game/poemle/PoemleGrid";
import type { PoemleCell } from "../../../components/game/poemle/PoemleGrid";

const PUNCTUATION = new Set([
    '，', '。', '？', '！', '、', '；', '：', '“', '”', '‘', '’', '（', '）', '《', '》',
    ',', '.', '?', '!', ';', ':', '"', "'", '(', ')', '<', '>', '\n', '\r', ' '
]);

export function PoemlePage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [toast, setToast] = useState<{ message: string, type: 'info' | 'error' | 'success' } | null>(null);

    const [activeView, setActiveView] = useState<string>("lobby");
    const [dailyData, setDailyData] = useState<any>(null);

    useEffect(() => {
        const path = location.pathname.replace(/\/$/, '');
        if (path.endsWith('/daily5')) setActiveView('五言');
        else if (path.endsWith('/daily7')) setActiveView('七言');
        else if (path.endsWith('/daily')) setActiveView('自由');
        else if (path.endsWith('/match')) setActiveView('multiplayer');
        else setActiveView('lobby');
    }, [location.pathname]);

    const navigateToView = (view: string) => {
        if (view === '五言') navigate('/game/poemle/daily5');
        else if (view === '七言') navigate('/game/poemle/daily7');
        else if (view === '自由') navigate('/game/poemle/daily');
        else if (view === 'multiplayer') navigate('/game/poemle/match');
        else navigate('/game/poemle');
    };

    const socketRef = useRef<Socket | null>(null);
    const [isMatching, setIsMatching] = useState(false);
    const [matchCount, setMatchCount] = useState(0);
    const [onlineCount, setOnlineCount] = useState(0);
    const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);

    const [dailyGuesses, setDailyGuesses] = useState<Record<string, PoemleCell[][]>>({});
    const [dailyStats, setDailyStats] = useState<Record<string, { first?: number, best?: number }>>({});
    const [currentGuess, setCurrentGuess] = useState("");
    const [gameWon, setGameWon] = useState(false);

    const [showCreateRoomDialog, setShowCreateRoomDialog] = useState(false);
    const [createRoomRounds, setCreateRoomRounds] = useState<string>("5");
    const [createRoomMode, setCreateRoomMode] = useState<string>("自由");

    const [showJoinRoomDialog, setShowJoinRoomDialog] = useState(false);
    const [joinRoomCode, setJoinRoomCode] = useState("");

    useEffect(() => {
        const bareApi = API_BASE.replace(/\/api$/, "");
        fetch(`${bareApi}/api/game/poemle/daily`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setDailyData(data.daily);
                    const saved = localStorage.getItem("poemle_daily_" + data.daily.date);
                    if (saved) {
                        setDailyGuesses(JSON.parse(saved));
                    }
                    const savedStats = localStorage.getItem("poemle_daily_stats_" + data.daily.date);
                    if (savedStats) {
                        setDailyStats(JSON.parse(savedStats));
                    }
                }
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        const token = getToken();
        if (!token) return;

        const wsBase = API_BASE.replace(/\/api$/, "");
        const socket = io(`${wsBase}/game/poemle`, {
            auth: { token },
            transports: ["websocket", "polling"],
        });
        socketRef.current = socket;

        socket.on("online_count", (data: { count: number }) => {
            setOnlineCount(data.count);
        });

        socket.on("matchmaking_status", (data: { count: number }) => {
            setMatchCount(data.count);
        });

        socket.on("matchmaking_matched", (data: { roomCode: string }) => {
            setIsMatching(false);
            navigate(`/game/poemle/room/${data.roomCode}`);
        });

        socket.on("room_created", (data: { roomCode: string }) => {
            navigate(`/game/poemle/room/${data.roomCode}`);
        });

        socket.on("room_redirect", (data: { roomCode: string }) => {
            setActiveRoomCode(data.roomCode);
        });

        return () => {
            socket.disconnect();
        };
    }, [navigate]);

    const handleMatch = () => {
        if (!socketRef.current?.connected) {
            setToast({ message: "尚未连接到服务器，请确保已登录", type: "error" });
            return;
        }
        if (isMatching) {
            socketRef.current.emit("matchmaking_leave");
            setIsMatching(false);
        } else {
            socketRef.current.emit("matchmaking_join");
            setIsMatching(true);
        }
    };

    const handleCreateRoom = () => {
        if (!socketRef.current?.connected) {
            setToast({ message: "尚未连接到服务器，请确保已登录", type: "error" });
            return;
        }
        setShowCreateRoomDialog(true);
    };

    const handleConfirmCreateRoom = () => {
        if (!socketRef.current?.connected) return;
        socketRef.current.emit("room_create", { maxRounds: parseInt(createRoomRounds, 10) || 5, mode: createRoomMode });
        setShowCreateRoomDialog(false);
    };

    const handleJoinRoom = () => {
        if (!socketRef.current?.connected) {
            setToast({ message: "尚未连接到服务器，请确保已登录", type: "error" });
            return;
        }
        setShowJoinRoomDialog(true);
    };

    const handleConfirmJoinRoom = () => {
        const code = joinRoomCode.trim();
        if (!code) {
            setToast({ message: "请输入房间号", type: "error" });
            return;
        }
        navigate(`/game/poemle/room/${code}`);
        setShowJoinRoomDialog(false);
        setJoinRoomCode("");
    };

    const currentDailyPoem = dailyData ? (
        activeView === '七言' ? dailyData.qiyan :
            activeView === '五言' ? dailyData.wuyan :
                activeView === '自由' ? dailyData.free : null
    ) : null;

    const lineLength = currentDailyPoem?.line ? Array.from(currentDailyPoem.line).filter((c) => !PUNCTUATION.has(c as string)).length : 0;

    const [isVerifying, setIsVerifying] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);

    useEffect(() => {
        if (!currentDailyPoem || activeView === 'lobby' || activeView === 'multiplayer') return;
        const history = dailyGuesses[activeView] || [];
        if (history.length > 0) {
            const last = history[history.length - 1];
            if (last.every((c: any) => c.verdict === 'green')) {
                setGameWon(true);

                if (activeView !== 'lobby' && activeView !== 'multiplayer' && dailyData?.date) {
                    const token = getToken();
                    if (token) {
                        const viewType = activeView === '五言' ? 'daily5' : activeView === '七言' ? 'daily7' : 'daily';
                        fetch(`${API_BASE.replace(/\/api$/, "")}/api/game/poemle/daily_complete`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${token}`
                            },
                            body: JSON.stringify({ type: viewType, date: dailyData.date })
                        }).then(r => r.json()).then(res => {
                            if (res.success && res.claimed) {
                                setTimeout(() => {
                                    setToast({ message: "每日挑战完成，积分 +50", type: "info" });
                                }, 500);
                            }
                        }).catch(console.error);
                    }
                }

                return;
            }
        }
        setGameWon(false);
        setCurrentGuess("");
    }, [activeView, dailyGuesses, currentDailyPoem]);

    const handleSubmit = async () => {
        if (gameWon || !currentDailyPoem || isVerifying || !currentGuess.trim()) return;

        setIsVerifying(true);
        let verifiedStructure: number[] | null = null;
        try {
            const res = await fetch(`${API_BASE.replace(/\/api$/, "")}/api/game/poemle/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guess: currentGuess, type: activeView })
            });
            const data = await res.json();

            if (!data.success) {
                setToast({ message: `服务器验证失败，请重试`, type: 'error' });
                setIsVerifying(false);
                return;
            }

            const isLengthValid = activeView === '自由' ? (currentGuess.length >= 2 && currentGuess.length <= 20) : currentGuess.length === lineLength;

            if (!data.valid || !isLengthValid) {
                if (data.suggestions && data.suggestions.length > 0) {
                    setSuggestions(data.suggestions);
                    setToast({ message: data.valid ? (activeView === '自由' ? '当前字数应为2-20字，你是否想猜：' : `当前长度与题目不符（应为${lineLength}字），你是否想猜：`) : `题库中未找到这句诗，请看下方猜测建议`, type: 'error' });
                } else {
                    setToast({ message: !isLengthValid ? (activeView === '自由' ? '当前字数应为2-20字，且题库无匹配' : `当前字数与题目要求（${lineLength}字）不符，且题库无匹配`) : `题库中未找到这句诗！请尝试真实的诗句`, type: 'error' });
                }
                setIsVerifying(false);
                return;
            }
            verifiedStructure = data.structure || null;
        } catch (e) {
            console.error(e);
            setToast({ message: `网络错误，验证失败`, type: 'error' });
            setIsVerifying(false);
            return;
        }
        setIsVerifying(false);

        const targetStr = Array.from(currentDailyPoem.line).filter((c) => !PUNCTUATION.has(c as string)).join('');
        const guessStr = currentGuess;

        const isLengthCorrect = guessStr.length === targetStr.length;

        const unpaddedResult: PoemleCell[] = Array.from(guessStr).map((c) => ({ char: c as string, verdict: 'gray' as any }));
        const usedTargetIndices = new Set<number>();

        let gStruct = verifiedStructure;
        if (!gStruct || !Array.isArray(gStruct) || gStruct.length === 0) {
            gStruct = [Math.ceil(guessStr.length / 2), guessStr.length - Math.ceil(guessStr.length / 2)];
        }

        const tParts = currentDailyPoem.line.split(/[，。！？；、,\.\!\?\n\r \u3000]/).map((x: string) => Array.from(x).filter(c => !PUNCTUATION.has(c as string)).join('')).filter((x: string) => x.length > 0);
        let targetStructure = tParts.map((x: string) => x.length);
        if (!targetStructure || targetStructure.length === 0) {
            targetStructure = [Math.ceil(targetStr.length / 2), targetStr.length - Math.ceil(targetStr.length / 2)];
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

        const gMapping = map1DTo2D(guessStr.length, gStruct);
        const tMapping = map1DTo2D(targetStr.length, targetStructure);

        for (let i = 0; i < guessStr.length; i++) {
            const gPos = gMapping[i];
            const j = tMapping.findIndex(pos => pos.r === gPos.r && pos.c === gPos.c);
            if (j !== -1 && j < targetStr.length && guessStr[i] === targetStr[j]) {
                unpaddedResult[i].verdict = 'green';
                usedTargetIndices.add(j);
            }
        }
        for (let i = 0; i < guessStr.length; i++) {
            if (unpaddedResult[i].verdict === 'green') continue;
            for (let j = 0; j < targetStr.length; j++) {
                if (guessStr[i] === targetStr[j] && !usedTargetIndices.has(j)) {
                    unpaddedResult[i].verdict = 'yellow';
                    usedTargetIndices.add(j);
                    break;
                }
            }
        }

        const currentGridSize = activeView === '自由' ? 20 : lineLength;

        let result: PoemleCell[];
        if (activeView === '自由' && verifiedStructure && Array.isArray(verifiedStructure)) {
            let fillVerdict: any = isLengthCorrect ? 'green' : 'gray';
            result = new Array(20).fill(null).map(() => ({ char: '', verdict: fillVerdict }));
            let rIdx = 0;
            let pIdx = 0;
            for (const gLen of verifiedStructure) {
                for (let i = 0; i < gLen; i++) {
                    if (rIdx < unpaddedResult.length) result[pIdx++] = unpaddedResult[rIdx++];
                }
                pIdx += (10 - gLen);
            }
        } else {
            const padToGrid = (chars: PoemleCell[], size: number) => {
                const halfLen = Math.ceil(chars.length / 2);
                let fillVerdict: any = isLengthCorrect ? 'green' : 'gray';
                const res: PoemleCell[] = new Array(size).fill(null).map(() => ({ char: '', verdict: fillVerdict }));
                const halfSize = Math.floor(size / 2);
                for (let i = 0; i < halfLen && i < halfSize; i++) {
                    res[i] = chars[i];
                    if (halfLen + i < chars.length) {
                        res[halfSize + i] = chars[halfLen + i];
                    }
                }
                return res;
            };
            result = padToGrid(unpaddedResult, currentGridSize);
        }

        const newHistory = [...(dailyGuesses[activeView] || []), result];
        const newGuesses = { ...dailyGuesses, [activeView]: newHistory };
        setDailyGuesses(newGuesses);
        setCurrentGuess("");

        if (dailyData?.date) {
            localStorage.setItem("poemle_daily_" + dailyData.date, JSON.stringify(newGuesses));
        }

        if (result.every(r => r.verdict === 'green')) {
            setGameWon(true);
            setToast({ message: "恭喜你猜对了！", type: "success" });

            if (activeView !== 'lobby' && activeView !== 'multiplayer' && dailyData?.date) {
                const token = getToken();
                if (token) {
                    const viewType = activeView === '五言' ? 'daily5' : activeView === '七言' ? 'daily7' : 'daily';
                    fetch(`${API_BASE.replace(/\/api$/, "")}/api/game/poemle/daily_complete`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify({ type: viewType, date: dailyData.date })
                    }).then(r => r.json()).then(res => {
                        if (res.success && res.claimed) {
                            setTimeout(() => {
                                setToast({ message: "每日挑战完成，积分 +50", type: "info" });
                            }, 1500);
                        }
                    }).catch(console.error);
                }
            }

            const currentScore = newHistory.length;
            const modeStats = dailyStats[activeView] || {};
            const newStats = {
                ...dailyStats,
                [activeView]: {
                    first: modeStats.first ?? currentScore,
                    best: Math.min(modeStats.best ?? currentScore, currentScore)
                }
            };
            setDailyStats(newStats);
            if (dailyData?.date) {
                localStorage.setItem("poemle_daily_stats_" + dailyData.date, JSON.stringify(newStats));
            }
        }
    };

    const handleShare = () => {
        if (!dailyData || !dailyData.date) return;

        const guesses = dailyGuesses[activeView] || [];
        const stats = dailyStats[activeView] || {};

        const lines = guesses.map(guess => {
            const isAllGreen = guess.every(c => c.verdict === 'green');
            const halfLen = Math.floor(guess.length / 2);

            const toEmoji = (cell: any) => {
                if (activeView === '自由') {
                    if (!cell.char || cell.char === ' ') {
                        return isAllGreen ? '🟩' : '⬜';
                    }
                }
                if (cell.verdict === 'green') return '🟩';
                if (cell.verdict === 'yellow') return '🟨';
                return '⬜';
            };

            const part1 = guess.slice(0, halfLen).map(toEmoji).join('');
            const part2 = guess.slice(halfLen).map(toEmoji).join('');

            return `${part1} ${part2}`;
        }).join('\n');

        const viewTypeMap: Record<string, string> = {
            '五言': 'daily5',
            '七言': 'daily7',
            '自由': 'daily'
        };
        const url = `https://yin-xin.fun/game/poemle/${viewTypeMap[activeView] || 'daily'}`;

        const text = `『吟心』#寻花令-每日挑战-${activeView}#\n${dailyData.date}\n${lines}\n本次记录：${guesses.length} 次\n首次记录：${stats.first ?? guesses.length} 次\n最佳记录：${stats.best ?? guesses.length} 次\n${url}`;

        navigator.clipboard.writeText(text).then(() => {
            setToast({ message: "成绩已复制到剪贴板，快去分享吧！", type: "success" });
        }).catch(() => {
            setToast({ message: "复制失败，请重试", type: "error" });
        });
    };

    const renderLobby = () => {
        return (
            <section className="results" style={{ marginTop: '0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                    <div className="result-list" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => navigateToView("五言")}>
                        <h3 style={{ color: '#b85c32', fontSize: '24px', margin: '0 0 10px 0' }}>每日五言</h3>
                        <p style={{ color: '#8f694a', margin: '0 0 10px 0' }}>找出今天隐藏的五言古诗句</p>
                        {dailyStats['五言'] && Object.keys(dailyStats['五言']).length > 0 ? (
                            <span style={{ fontSize: '14px', background: 'rgba(184, 92, 50, 0.1)', padding: '4px 8px', borderRadius: '12px', color: '#b85c32' }}>首次: {dailyStats['五言'].first} 次 | 最佳: {dailyStats['五言'].best} 次</span>
                        ) : dailyGuesses['五言']?.length > 0 ? (
                            <span style={{ fontSize: '14px', background: 'rgba(184, 92, 50, 0.1)', padding: '4px 8px', borderRadius: '12px', color: '#b85c32' }}>已尝试 {dailyGuesses['五言'].length} 次</span>
                        ) : null}
                    </div>

                    <div className="result-list" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => navigateToView("七言")}>
                        <h3 style={{ color: '#b85c32', fontSize: '24px', margin: '0 0 10px 0' }}>每日七言</h3>
                        <p style={{ color: '#8f694a', margin: '0 0 10px 0' }}>找出今天隐藏的七言古诗句</p>
                        {dailyStats['七言'] && Object.keys(dailyStats['七言']).length > 0 ? (
                            <span style={{ fontSize: '14px', background: 'rgba(184, 92, 50, 0.1)', padding: '4px 8px', borderRadius: '12px', color: '#b85c32' }}>首次: {dailyStats['七言'].first} 次 | 最佳: {dailyStats['七言'].best} 次</span>
                        ) : dailyGuesses['七言']?.length > 0 ? (
                            <span style={{ fontSize: '14px', background: 'rgba(184, 92, 50, 0.1)', padding: '4px 8px', borderRadius: '12px', color: '#b85c32' }}>已尝试 {dailyGuesses['七言'].length} 次</span>
                        ) : null}
                    </div>

                    <div className="result-list" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => navigateToView("自由")}>
                        <h3 style={{ color: '#b85c32', fontSize: '24px', margin: '0 0 10px 0' }}>每日自由</h3>
                        <p style={{ color: '#8f694a', margin: '0 0 10px 0' }}>找出今天隐藏的字数不限自由诗句</p>
                        {dailyStats['自由'] && Object.keys(dailyStats['自由']).length > 0 ? (
                            <span style={{ fontSize: '14px', background: 'rgba(184, 92, 50, 0.1)', padding: '4px 8px', borderRadius: '12px', color: '#b85c32' }}>首次: {dailyStats['自由'].first} 次 | 最佳: {dailyStats['自由'].best} 次</span>
                        ) : dailyGuesses['自由']?.length > 0 ? (
                            <span style={{ fontSize: '14px', background: 'rgba(184, 92, 50, 0.1)', padding: '4px 8px', borderRadius: '12px', color: '#b85c32' }}>已尝试 {dailyGuesses['自由'].length} 次</span>
                        ) : null}
                    </div>

                    <div className="result-list" style={{ cursor: 'pointer', textAlign: 'center', background: 'rgba(243, 210, 182, 0.5)' }} onClick={() => navigateToView("multiplayer")}>
                        <h3 style={{ color: '#b85c32', fontSize: '24px', margin: '0 0 10px 0' }}>多人联机</h3>
                        <p style={{ color: '#8f694a', margin: '0 0 10px 0' }}>实时 1v1 匹配与自定义房间</p>
                        <span style={{ fontSize: '14px', background: 'rgba(184, 92, 50, 0.1)', padding: '4px 8px', borderRadius: '12px', color: '#b85c32' }}>在线: {onlineCount}</span>
                    </div>
                </div>
            </section>
        );
    };

    const renderMultiplayer = () => {
        return (
            <section className="results" style={{ marginTop: '0' }}>
                <button className="btn ghost" style={{ marginBottom: '20px' }} onClick={() => navigateToView("lobby")}>
                    ← 返回大厅
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                    {activeRoomCode ? (
                        <div className="result-list" style={{ textAlign: 'center', gridColumn: '1 / -1' }}>
                            <h3 style={{ color: '#b85c32', fontSize: '20px', margin: '0 0 10px 0' }}>当前对战未结束</h3>
                            <p style={{ color: '#8f694a', margin: '0 0 20px 0' }}>你可以随时返回你当前的对战房间。</p>
                            <button className="btn" style={{ width: '100%', fontSize: '18px', padding: '12px' }} onClick={() => navigate(`/game/poemle/room/${activeRoomCode}`)}>返回房间</button>
                        </div>
                    ) : (
                        <>
                            <div className="result-list" style={{ textAlign: 'center', position: 'relative' }}>
                                {isMatching && (
                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: '16px' }}>
                                        <p style={{ color: '#b85c32', fontWeight: 'bold' }}>正在匹配对手...</p>
                                        <p style={{ fontSize: '14px', color: '#8f694a' }}>队列人数: {matchCount}</p>
                                        <button className="btn" style={{ marginTop: '10px' }} onClick={handleMatch}>取消匹配</button>
                                    </div>
                                )}
                                <h3 style={{ color: '#b85c32', fontSize: '20px', margin: '0 0 10px 0' }}>1v1 排位匹配</h3>
                                <p style={{ color: '#8f694a', margin: '0 0 20px 0', minHeight: '48px' }}>
                                    随机模式，双方同时破译一首诗，谁先解出谁得分！
                                    <br />
                                    当前 {matchCount} 人在匹配
                                </p>
                                <button className="btn" style={{ width: '100%', fontSize: '18px', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }} onClick={handleMatch}>
                                    开始匹配
                                </button>
                            </div>

                            <div className="result-list" style={{ textAlign: 'center' }}>
                                <h3 style={{ color: '#b85c32', fontSize: '20px', margin: '0 0 10px 0' }}>好友对战房间</h3>
                                <p style={{ color: '#8f694a', margin: '0 0 20px 0', minHeight: '48px' }}>自定义题目类型与回合数，与多名好友同场竞猜</p>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button className="btn ghost" style={{ flex: 1, fontSize: '18px', padding: '12px', background: '#fff' }} onClick={handleCreateRoom}>创建房间</button>
                                    <button className="btn" style={{ flex: 1, fontSize: '18px', padding: '12px' }} onClick={handleJoinRoom}>加入房间</button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </section >
        );
    };

    const renderDailyGame = () => {
        return (
            <section className="results" style={{ marginTop: '0', maxWidth: '800px', width: '100%' }}>
                <button className="btn ghost" style={{ marginBottom: '20px' }} onClick={() => navigateToView("lobby")}>
                    ← 返回大厅
                </button>
                <div className="result-list">
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '20px' }}>
                        <h2 style={{ margin: 0, color: '#b85c32', fontSize: '22px', textAlign: 'center' }}>
                            每日挑战 - {activeView}
                        </h2>
                    </div>

                    {dailyData && currentDailyPoem?.line ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: '14px', color: '#8f694a', background: 'rgba(255, 190, 140, 0.2)', padding: '6px 16px', borderRadius: '20px', marginBottom: '16px' }}>
                                {gameWon ? <><a style={{ color: "#3498db", textDecoration: "none" }} href={`/poet/${currentDailyPoem.author}`}>【{currentDailyPoem.dynasty || "未知"}】{currentDailyPoem.authorName || currentDailyPoem.author}</a> <a style={{ color: "#3498db", textDecoration: "none" }} href={`/poetry/${currentDailyPoem.id}`}>《{currentDailyPoem.title}》</a></> : "？？？出处隐藏中"}
                            </div>

                            {!gameWon && (
                                <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <PoemleKeyboard
                                        currentGuess={currentGuess}
                                        onGuessChange={(v) => { setCurrentGuess(v); setSuggestions([]); }}
                                        onSubmit={handleSubmit}
                                        disabled={gameWon}
                                        lineLength={activeView === "自由" ? undefined : lineLength}
                                        guesses={dailyGuesses[activeView] || []}
                                    />
                                    {suggestions.length > 0 && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            marginTop: '10px',
                                            background: '#fff',
                                            border: '1px solid #e0e0e0',
                                            borderRadius: '8px',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                            padding: '12px',
                                            zIndex: 10,
                                            minWidth: '280px',
                                            textAlign: 'left'
                                        }}>
                                            <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#888' }}>题库未找到该记录，你是否想猜：</p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {suggestions.map((sugg, idx) => (
                                                    <button
                                                        key={idx}
                                                        className="btn ghost"
                                                        style={{
                                                            justifyContent: 'flex-start',
                                                            padding: '8px 12px',
                                                            background: '#f9f9f9',
                                                        }}
                                                        onClick={() => {
                                                            const filtered = sugg.replace(/[^\u4e00-\u9fa5]/g, '');
                                                            setCurrentGuess(filtered);
                                                            setSuggestions([]);
                                                        }}
                                                    >
                                                        {sugg}
                                                    </button>
                                                ))}
                                                <button
                                                    className="btn"
                                                    style={{ marginTop: '4px', background: '#ccc', borderColor: '#ccc', color: '#333' }}
                                                    onClick={() => setSuggestions([])}
                                                >
                                                    取消
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <PoemleGrid
                                guesses={dailyGuesses[activeView] || []}
                                currentGuess={currentGuess}
                                lineLength={lineLength}
                                gridSize={activeView === '自由' ? 20 : lineLength}
                            />

                            {gameWon && (
                                <div>
                                    <h3 style={{ color: '#2e7d32', margin: '0 0 10px 0' }}>挑战成功！</h3>
                                    <p style={{ color: '#1b5e20', margin: '0 0 20px 0', lineHeight: '1.6' }}>
                                        你已经完成了今日的{activeView}挑战！<br />
                                        本次记录：{(dailyGuesses[activeView] || []).length} 次<br />
                                        首次记录：{dailyStats[activeView]?.first ?? (dailyGuesses[activeView] || []).length} 次<br />
                                        最佳记录：{dailyStats[activeView]?.best ?? (dailyGuesses[activeView] || []).length} 次
                                    </p>
                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                        <button className="btn ghost" onClick={() => navigateToView("lobby")}>回到大厅</button>
                                        <button className="btn" style={{ backgroundColor: '#5eb95e', borderColor: '#5eb95e' }} onClick={handleShare}>分享成绩</button>
                                        <button className="btn" style={{ backgroundColor: '#e67e22', borderColor: '#e67e22' }} onClick={() => {
                                            const newGuesses = { ...dailyGuesses, [activeView]: [] };
                                            setDailyGuesses(newGuesses);
                                            setGameWon(false);
                                            setCurrentGuess('');
                                            if (dailyData?.date) {
                                                localStorage.setItem('poemle_daily_' + dailyData.date, JSON.stringify(newGuesses));
                                            }
                                        }}>再来一次</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (<div style={{ padding: "60px 0", textAlign: "center", color: "#8f694a" }}><p>{dailyData ? "题库尚未存在" + activeView + "古诗啊" : "加载今日题目中..."}</p></div>)}
                </div >
            </section >
        );
    };

    return (
        <>
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            {activeView === 'lobby' && (
                <section className="hero">
                    <h1>寻花令</h1>
                    <p>
                        古诗词版 Wordle。每天打卡一首古诗，根据提示在有限次机会内猜出答案。或者与好友一较高下！
                    </p>
                </section>
            )}

            {activeView === 'lobby' && renderLobby()}
            {activeView === 'multiplayer' && renderMultiplayer()}
            {['七言', '五言', '自由'].includes(activeView) && renderDailyGame()}

            {showCreateRoomDialog && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                    }}
                    onClick={() => setShowCreateRoomDialog(false)}
                >
                    <div
                        style={{
                            background: "#faf3e8",
                            padding: 24,
                            borderRadius: 8,
                            minWidth: 320,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ marginBottom: 16, color: "#b85c32" }}>创建房间</h3>

                        <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#8f694a" }}>
                            题目模式：
                        </label>
                        <select
                            value={createRoomMode}
                            onChange={(e) => setCreateRoomMode(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "8px",
                                marginBottom: 24,
                                border: "1px solid #ccc",
                                borderRadius: 4,
                                background: "#fff",
                                color: "#3a1f12"
                            }}
                        >
                            <option value="自由">自由（长短句不限）</option>
                            <option value="五言">五言（固定五字）</option>
                            <option value="七言">七言（固定七字）</option>
                        </select>

                        <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#8f694a" }}>
                            题目数量：
                        </label>
                        <select
                            value={createRoomRounds}
                            onChange={(e) => setCreateRoomRounds(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "8px",
                                marginBottom: 24,
                                border: "1px solid #ccc",
                                borderRadius: 4,
                                background: "#fff",
                                color: "#3a1f12"
                            }}
                        >
                            <option value="1">1 题</option>
                            <option value="3">3 题</option>
                            <option value="5">5 题</option>
                            <option value="10">10 题</option>
                            <option value="20">20 题</option>
                        </select>

                        <div style={{ display: "flex", gap: "12px" }}>
                            <button className="btn" onClick={handleConfirmCreateRoom} style={{ flex: 1 }}>
                                确认创建
                            </button>
                            <button
                                className="btn ghost"
                                onClick={() => setShowCreateRoomDialog(false)}
                                style={{ flex: 1, border: "1px solid #ccc", background: "#fff" }}
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showJoinRoomDialog && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                    }}
                    onClick={() => setShowJoinRoomDialog(false)}
                >
                    <div
                        style={{
                            background: "#faf3e8",
                            padding: 24,
                            borderRadius: 8,
                            minWidth: 320,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ marginBottom: 16, color: "#b85c32" }}>加入房间</h3>

                        <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#8f694a" }}>
                            房间号：
                        </label>
                        <input
                            type="text"
                            value={joinRoomCode}
                            onChange={(e) => setJoinRoomCode(e.target.value)}
                            placeholder="请输入 6 位房间号"
                            style={{
                                width: "100%",
                                padding: "8px",
                                marginBottom: 24,
                                border: "1px solid #ccc",
                                borderRadius: 4,
                                background: "#fff",
                                color: "#3a1f12",
                                boxSizing: "border-box"
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleConfirmJoinRoom();
                                }
                            }}
                        />

                        <div style={{ display: "flex", gap: "12px" }}>
                            <button className="btn" onClick={handleConfirmJoinRoom} style={{ flex: 1 }}>
                                确认加入
                            </button>
                            <button
                                className="btn ghost"
                                onClick={() => setShowJoinRoomDialog(false)}
                                style={{ flex: 1, border: "1px solid #ccc", background: "#fff" }}
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}        </>
    );
}