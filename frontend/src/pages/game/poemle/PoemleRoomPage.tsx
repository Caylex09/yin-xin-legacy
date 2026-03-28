import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE } from "../../../config";
import { getToken } from "../../../auth";
import { io, Socket } from "socket.io-client";
import { Toast } from "../../../components/Toast";
import { PoemleKeyboard } from "../../../components/game/poemle/PoemleKeyboard";
import { PoemleGrid } from "../../../components/game/poemle/PoemleGrid";
import type { PoemleCell } from "../../../components/game/poemle/PoemleGrid";

interface PlayerState {
    id: string;
    name: string;
    avatar: string;
    score: number;
    ready: boolean;
    guesses: PoemleCell[][];
}

interface RoomState {
    code: string;
    status: "waiting" | "playing" | "finished";
    players: Record<string, PlayerState>;
    host: string;
    round: number;
    maxRounds: number;
    mode: string;
    autoStart?: boolean;
}

interface ChatMessage {
    id: string;
    userId: string;
    username: string;
    message: string;
    timestamp: string;
}

export function PoemleRoomPage() {
    const { roomCode } = useParams<{ roomCode: string }>();
    const navigate = useNavigate();
    const socketRef = useRef<Socket | null>(null);
    const chatInputRef = useRef<HTMLInputElement>(null);
    const chatIdsRef = useRef<Set<string>>(new Set());

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

    // 投票相关状态
    const [drawRequested, setDrawRequested] = useState(false);
    const [drawRequestedBy, setDrawRequestedBy] = useState<string | undefined>(undefined);
    const [skipRequested, setSkipRequested] = useState(false);
    const [skipRequestedBy, setSkipRequestedBy] = useState<string | undefined>(undefined);

    const [toast, setToast] = useState<{ message: string, type: 'info' | 'error' | 'success' } | null>(null);
    const [room, setRoom] = useState<RoomState | null>(null);
    const [myId, setMyId] = useState<string>("");
    const myIdRef = useRef<string>("");
    useEffect(() => { myIdRef.current = myId; }, [myId]);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [roomDestroyCountdown, setRoomDestroyCountdown] = useState<number | null>(null);

    const [currentGuess, setCurrentGuess] = useState("");
    const [lineLength, setLineLength] = useState(5);
    const [roundOver, setRoundOver] = useState(false);
    const [roundWinner, setRoundWinner] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isVerifying, setIsVerifying] = useState(false);

    useEffect(() => {
        const token = getToken();
        if (!token) {
            navigate("/login");
            return;
        }

        const wsBase = API_BASE.replace(/\/api$/, "");
        const socket = io(`${wsBase}/game/poemle`, {
            auth: { token },
            transports: ["websocket", "polling"],
        });
        socketRef.current = socket;

        socket.emit("room_join", { roomCode });

        socket.on("room_joined", (state: any) => {
            // Backend sends players as an array of BasePlayer { uid, username, avatar, score }
            // We need to convert it to Record<string, PlayerState>
            const playersRecord: Record<string, PlayerState> = {};
            if (Array.isArray(state.players)) {
                state.players.forEach((p: any) => {
                    playersRecord[String(p.uid)] = {
                        id: String(p.uid),
                        name: p.username,
                        avatar: p.avatar,
                        score: p.score || 0,
                        ready: true, // Poemle auto readies or host starts
                        guesses: p.guesses || []
                    };
                });
            }

            setRoom((prev) => ({
                code: state.roomCode,
                status: state.status,
                players: playersRecord,
                host: String(state.hostId),
                round: prev ? prev.round : (state.currentRound || 1),
                maxRounds: state.maxRounds,
                mode: state.mode,
                autoStart: state.autoStart
            }));

            if (state.question?.lineLength) {
                setLineLength(state.question.lineLength);
            }
            // Get myId correctly using the authenticated token sub if we don't have socket.id right 
            socket.emit("get_my_id"); // We might need this, but let's check first
        });

        socket.on("your_id", (data: { uid: number }) => {
            setMyId(String(data.uid));
        });

        socket.on("room_draw_requested", (data: { uid: number; username?: string }) => {
            setDrawRequested(true);
            setDrawRequestedBy(String(data.uid));
        });

        socket.on("room_draw_rejected", () => {
            setDrawRequested(false);
            setDrawRequestedBy(undefined);
        });

        socket.on("room_skip_requested", (data: { uid: number; username?: string }) => {
            setSkipRequested(true);
            setSkipRequestedBy(String(data.uid));
        });

        socket.on("room_skip_rejected", () => {
            setSkipRequested(false);
            setSkipRequestedBy(undefined);
        });

        socket.on("room_state", (state: RoomState) => {
            setRoom(state);
        });

        socket.on("room_countdown_start", (data: { roomCode: string, countdown: number }) => {
            setCountdown(data.countdown);
        });

        socket.on("room_countdown_update", (data: { roomCode: string, countdown: number }) => {
            setCountdown(data.countdown);
            if (data.countdown <= 0) {
                setCountdown(null);
            }
        });

        socket.on("submission_result", (res: any) => {
            if (res.error) {
                setToast({ message: res.error, type: "error" });
                return;
            }

            setRoom(prev => {
                if (!prev) return prev;
                const myIdStr = String(myIdRef.current);
                const currentMe = prev.players[myIdStr];
                if (!currentMe) return prev;

                const newPlayers = { ...prev.players };
                newPlayers[myIdStr] = {
                    ...currentMe,
                    guesses: [...(currentMe.guesses || []), res.judgeResult]
                };
                return { ...prev, players: newPlayers };
            });

            if (res.isAllGreen) {
                setRoundOver(true);
            }
        });

        socket.on("room_player_progress", (data: any) => {
            setRoom(prev => {
                if (!prev) return prev;
                const pid = String(data.uid);
                if (prev.players[pid]) {
                    const existingGuesses = prev.players[pid].guesses || [];
                    const newGuesses = data.judgeResult ? [...existingGuesses, data.judgeResult] : existingGuesses;
                    return {
                        ...prev,
                        players: {
                            ...prev.players,
                            [pid]: {
                                ...prev.players[pid],
                                score: data.score !== undefined ? data.score : prev.players[pid].score,
                                guesses: newGuesses
                            }
                        }
                    };
                }
                return prev;
            });
        });

        socket.on("room_game_started", (data: any) => {
            setCountdown(null);
            setRoom(prev => {
                if (!prev) return prev;
                const newPlayers = { ...prev.players };
                if (data.players) {
                    data.players.forEach((p: any) => {
                        if (newPlayers[p.uid]) {
                            newPlayers[p.uid].score = p.score;
                        }
                    });
                }
                return { ...prev, players: newPlayers, status: "playing", round: data.currentRound };
            });
            if (data.question) {
                setLineLength(data.question.lineLength);
            }
            setCurrentGuess("");
            setRoundOver(false);
            setRoundWinner(null);
            setToast({ message: "体验开始！", type: "info" });
        });

        socket.on("room_question_update", (data: any) => {
            if (data.question) {
                setLineLength(data.question.lineLength);
            }
            if (data.currentRound) {
                setRoom(prev => {
                    if (!prev) return null;
                    const newPlayers = { ...prev.players };
                    // Reset everyone's guesses to [] on new question
                    for (const pid in newPlayers) {
                        newPlayers[pid] = { ...newPlayers[pid], guesses: [] };
                    }
                    return { ...prev, players: newPlayers, round: data.currentRound, status: "playing" };
                });
            }
            setCurrentGuess("");
            setSuggestions([]);
            setRoundOver(false);
            setRoundWinner(null);
            setSkipRequested(false);
            setDrawRequested(false);
            setSkipRequestedBy(undefined);
            setDrawRequestedBy(undefined);
            setToast({ message: "已更换题目，新回合开始！", type: "info" });
        });

        socket.on("room_round_end", (data: { answer: string, scores: Record<string, number> }) => {
            setRoundOver(true);
            setSkipRequested(false);
            setDrawRequested(false);
            setSkipRequestedBy(undefined);
            setDrawRequestedBy(undefined);
            setToast({ message: `本回合结束，答案是: ${data.answer}`, type: "info" });
            // update scores
            setRoom(prev => {
                if (!prev) return prev;
                const newPlayers = { ...prev.players };
                for (const pid in data.scores) {
                    if (newPlayers[pid]) {
                        newPlayers[pid].score = data.scores[pid];
                    }
                }
                return { ...prev, players: newPlayers };
            });
        });

        socket.on("room_game_finished", (data: { results: Array<{ uid: number, score: number }> }) => {
            setSkipRequested(false);
            setDrawRequested(false);
            setSkipRequestedBy(undefined);
            setDrawRequestedBy(undefined);
            setRoom(prev => prev ? { ...prev, status: "finished" } : prev);
            let countdown = 5;
            setRoomDestroyCountdown(countdown);
            const timer = setInterval(() => {
                countdown--;
                if (countdown <= 0) {
                    clearInterval(timer);
                    if (socketRef.current) socketRef.current.emit("room_leave", { roomCode });
                    navigate("/game/poemle");
                } else {
                    setRoomDestroyCountdown(countdown);
                }
            }, 1000);
            setToast({ message: `游戏结束！`, type: "success" });
        });

        socket.on("error", (err: { message: string }) => {
            setToast({ message: err.message, type: "error" });
            if (err.message.includes("未找到") || err.message.includes("已满")) {
                if (socketRef.current) socketRef.current.emit("room_leave", { roomCode });
                navigate("/game/poemle");
            }
        });

        socket.on("room_error", (err: { message: string }) => {
            setToast({ message: err.message, type: "error" });
        });

        socket.on("room_chat_message", async (data: { type: string; message: ChatMessage }) => {
            if (data.message) {
                const id = data.message.id || "";
                if (id && chatIdsRef.current.has(id)) return;
                if (id) chatIdsRef.current.add(id);
                setChatMessages((prev) => [...prev.slice(-49), data.message]);

                const text = data.message.message || "";
                // 监听投票结果自动清除投票面板
                if (id.startsWith("end_vote_result_") || text.includes("结束房间投票")) {
                    setDrawRequested(false);
                    setDrawRequestedBy(undefined);
                }
                if (text.includes("发起跳过投票")) {
                    const match = text.match(/^(.+?)\s+发起跳过投票/);
                    if (match) {
                        const initiatorName = match[1];
                        if (initiatorName !== myIdRef.current) {
                            setSkipRequested(true);
                            setSkipRequestedBy(undefined);
                        } else {
                            setSkipRequested(false);
                        }
                    }
                }
                if (id.startsWith("skip_vote_result_") || text.includes("跳过投票")) {
                    setSkipRequested(false);
                    setSkipRequestedBy(undefined);
                }
            }
        });

        socket.on("room_sync_state", (data: any) => {
            // Sync state for skipping
            if (data.status === "playing") {
                setRoundOver(false);
                setSuggestions([]);
                setCurrentGuess("");
            }
        });

        socket.on("room_sync", (data: { scores: Record<string, number> }) => {
            setRoom(prev => {
                if (!prev) return prev;
                const newPlayers = { ...prev.players };
                let mutated = false;
                for (const pid in data.scores) {
                    if (newPlayers[pid] && newPlayers[pid].score !== data.scores[pid]) {
                        newPlayers[pid] = { ...newPlayers[pid], score: data.scores[pid] };
                        mutated = true;
                    }
                }
                return mutated ? { ...prev, players: newPlayers } : prev;
            });
        });

        const syncInterval = setInterval(() => {
            socket.emit("room_sync_request", { roomCode });
        }, 1000);

        return () => {
            clearInterval(syncInterval);
            socket.disconnect();
        };
    }, [roomCode, navigate]);

    const handleLeave = () => {
        if (socketRef.current) {
            socketRef.current.emit("room_leave", { roomCode });
        }
        navigate("/game/poemle");
    };

    const sendChatMessage = (msg: string) => {
        if (!msg.trim() || !socketRef.current || !roomCode) return;

        const text = msg.trim().toLowerCase();
        if (text === 'accept' && skipRequested) {
            handleAcceptSkip();
        } else if (text === 'reject' && skipRequested) {
            handleRejectSkip();
        }

        socketRef.current.emit("room_chat_message", {
            roomCode,
            message: msg.trim(),
        });
    };

    const handleRequestDraw = () => {
        setDrawRequested(true);
        setDrawRequestedBy(myId);
        socketRef.current?.emit("room_end_request", { roomCode });
    };

    const handleAcceptDraw = () => {
        setDrawRequested(false);
        socketRef.current?.emit("room_end_vote", { vote: "accept", roomCode });
    };

    const handleRejectDraw = () => {
        setDrawRequested(false);
        socketRef.current?.emit("room_end_vote", { vote: "reject", roomCode });
    };

    const handleRequestSkip = () => {
        setSkipRequested(true);
        setSkipRequestedBy(myId);
        socketRef.current?.emit("room_skip_request", { roomCode });
    };

    const handleAcceptSkip = () => {
        setSkipRequested(false);
        socketRef.current?.emit("room_skip_vote", { vote: "accept", roomCode });
    };

    const handleRejectSkip = () => {
        setSkipRequested(false);
        socketRef.current?.emit("room_skip_vote", { vote: "reject", roomCode });
    };

    const handleSubmit = async () => {
        if (!currentGuess || isVerifying || roundOver) return;
        setIsVerifying(true);
        try {
            const res = await fetch(`${API_BASE.replace(/\/api$/, "")}/api/game/poemle/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guess: currentGuess, type: room?.mode === '自由' ? '自由' : '标准' })
            });
            const data = await res.json();

            if (data.success && data.valid) {
                const isLengthValid = room?.mode === '自由'
                    ? (currentGuess.length >= 2 && currentGuess.length <= 20)
                    : currentGuess.length === lineLength;

                if (isLengthValid) {
                    setSuggestions([]);
                    socketRef.current?.emit("room_submit_guess", { guess: currentGuess, roomCode, structure: data.structure });
                    setCurrentGuess("");
                } else {
                    setToast({ message: room?.mode === '自由' ? "自由模式要求字数在 2-20 字之间" : `长度不符合要求，应为 ${lineLength} 字`, type: "error" });
                }
            } else {
                setSuggestions(data.suggestions || []);
                setToast({ message: data.message || "未能找到该诗句", type: "error" });
            }
        } catch (e) {
            setToast({ message: "验证失败请重试", type: "error" });
        }
        setIsVerifying(false);
    };

    const handleReady = () => {
        socketRef.current?.emit("room_ready", { roomCode });
    };

    const handleStart = () => {
        if (room && room.host === myId) {
            socketRef.current?.emit("room_start", { roomCode });
        }
    };

    if (!room) {
        return (
            <section className="results" style={{ textAlign: "center", padding: "60px 0" }}>
                <h2 style={{ color: "#b85c32" }}>连接中...</h2>
            </section>
        );
    }

    const isHost = room.host === myId;
    const players = Object.values(room.players);
    const me = room.players[myId];
    const opponents = players.filter(p => p.id !== myId);

    return (
        <>
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            <section className="results" style={{ marginTop: '0', maxWidth: '1000px' }}>
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '20px', paddingBottom: '10px', borderBottom: '2px solid rgba(184, 92, 50, 0.2)' }}>
                    <div style={{ position: 'absolute', left: 0, display: 'flex', gap: '8px' }}>
                        <button className="btn ghost" onClick={handleLeave}>
                            ← 返回房间
                        </button>
                        {room.status === 'playing' && !drawRequested && (
                            <button className="btn ghost" onClick={handleRequestDraw}>
                                提前结算
                            </button>
                        )}
                        {room.status === 'playing' && drawRequested && drawRequestedBy !== myId && (
                            <>
                                <span style={{ color: '#c86d3f', alignSelf: 'center', fontWeight: 'bold', marginLeft: '8px' }}>{drawRequestedBy && room.players[drawRequestedBy] ? `${room.players[drawRequestedBy].name} ` : '对方'}请求提前结算:</span>
                                <button className="btn" onClick={handleAcceptDraw}>同意</button>
                                <button className="btn ghost" onClick={handleRejectDraw}>拒绝</button>
                            </>
                        )}
                        {room.status === 'playing' && drawRequested && drawRequestedBy === myId && (
                            <button className="btn ghost" disabled>已申请提前结算</button>
                        )}
                        {room.status === 'playing' && !skipRequested && (
                            <button className="btn ghost" onClick={handleRequestSkip}>
                                请求换题
                            </button>
                        )}
                        {room.status === 'playing' && skipRequested && skipRequestedBy !== myId && (
                            <>
                                <span style={{ color: '#c86d3f', alignSelf: 'center', fontWeight: 'bold', marginLeft: '8px' }}>{skipRequestedBy && room.players[skipRequestedBy] ? `${room.players[skipRequestedBy].name} ` : '对方'}请求换题:</span>
                                <button className="btn" onClick={handleAcceptSkip}>同意</button>
                                <button className="btn ghost" onClick={handleRejectSkip}>拒绝</button>
                            </>
                        )}
                        {room.status === 'playing' && skipRequested && skipRequestedBy === myId && (
                            <button className="btn ghost" disabled>已请求换题</button>
                        )}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <h2 style={{ margin: 0, color: '#b85c32', fontSize: '24px' }}>
                            房间号: {room.code} [{room.mode}]
                        </h2>
                        <span style={{ fontSize: '14px', color: '#8f694a' }}>
                            {room.status === 'playing' ? `第 ${room.round} / ${room.maxRounds} 回合` : '大厅准备中'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: opponents.length > 0 ? '1fr 1fr' : '1fr', gap: '40px' }}>
                    <div className="result-list" style={{ background: '#faf3e8', border: 'none', boxShadow: 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <img src={me?.avatar} alt="avatar" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#3a1f12' }}>你（{me?.name}）</span>
                            </div>
                            <span style={{ fontSize: '20px', color: '#b85c32', fontWeight: 'bold' }}>{me?.score} 分</span>
                        </div>

                        {room.status === "waiting" ? (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                <p style={{ color: me?.ready ? '#6aaa64' : '#8f694a', fontWeight: 'bold', marginBottom: '20px' }}>
                                    {me?.ready ? '已准备就绪' : '等待准备中...'}
                                </p>
                                {!me?.ready && <button className="btn" onClick={handleReady}>准备</button>}
                                {isHost && !room.autoStart && players.every(p => p.ready) && (
                                    <button className="btn" style={{ marginLeft: '10px', background: '#eab308' }} onClick={handleStart}>开始游戏</button>
                                )}
                            </div>
                        ) : (
                            <div>
                                <div style={{ marginBottom: '20px', position: 'relative' }}>
                                    <PoemleKeyboard
                                        currentGuess={currentGuess}
                                        onGuessChange={(val) => { setCurrentGuess(val); setSuggestions([]); }}
                                        onSubmit={handleSubmit}
                                        disabled={roundOver || isVerifying}
                                        lineLength={room?.mode === '自由' ? undefined : lineLength}
                                        guesses={me?.guesses || []}
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
                                            {suggestions.map((s, idx) => (
                                                <button
                                                    key={idx}
                                                    className="btn ghost"
                                                    style={{
                                                        display: 'block',
                                                        width: '100%',
                                                        textAlign: 'left',
                                                        padding: '8px 12px',
                                                        marginBottom: '4px',
                                                        fontSize: '15px'
                                                    }}
                                                    onClick={() => {
                                                        const filtered = s.replace(/[^\u4e00-\u9fa5]/g, '');
                                                        setCurrentGuess(filtered);
                                                        setSuggestions([]);
                                                    }}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                            <button
                                                className="btn ghost"
                                                style={{ width: '100%', marginTop: '8px', color: '#e74c3c' }}
                                                onClick={() => setSuggestions([])}
                                            >
                                                取消
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <PoemleGrid
                                    guesses={me?.guesses || []}
                                    currentGuess={currentGuess}
                                    lineLength={room?.mode === '自由' ? undefined : lineLength}
                                    gridSize={room?.mode === '自由' ? 20 : lineLength}
                                    mode={room?.mode}
                                />
                            </div>
                        )}
                    </div>

                    {countdown !== null && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(255,255,255,0.8)', zIndex: 100,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <div style={{ fontSize: '100px', fontWeight: 'bold', color: '#b85c32' }}>{countdown}</div>
                        </div>
                    )}

                    {opponents.map(opp => (
                        <div key={opp.id} className="result-list" style={{ background: 'rgba(255, 181, 127, 0.1)', border: 'none', boxShadow: 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <img src={opp.avatar} alt="avatar" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#3a1f12' }}>{!room.autoStart ? '成员' : '对方'}（{opp.name}）</span>
                                </div>
                                <span style={{ fontSize: '20px', color: '#b85c32', fontWeight: 'bold' }}>{opp.score} 分</span>
                            </div>
                            {room.status === "waiting" ? (
                                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                    <p style={{ color: opp.ready ? '#6aaa64' : '#8f694a', fontWeight: 'bold' }}>
                                        {opp.ready ? '已准备就绪' : '未准备'}
                                    </p>
                                </div>
                            ) : (
                                <div style={{ filter: 'grayscale(0.3) opacity(0.8)', pointerEvents: 'none' }}>
                                    <PoemleGrid
                                        guesses={opp.guesses || []}
                                        currentGuess=""
                                        lineLength={room?.mode === '自由' ? undefined : lineLength}
                                        gridSize={room?.mode === '自由' ? 20 : lineLength}
                                        mode={room?.mode}
                                    />
                                </div>
                            )}
                        </div>
                    ))}

                    {opponents.length === 0 && room.status === "waiting" && (
                        <div className="result-list" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' }}>
                            <p style={{ color: '#8f694a' }}>等待对手加入...</p>
                        </div>
                    )}
                </div>
            </section>

            <div className="right-bottom">
                <div className="chat-section">
                    <h3>聊天室</h3>
                    <div className="chat-messages">
                        {chatMessages.map((msg, i) => (
                            <div key={i} className="chat-message">
                                <span className="chat-username" style={{ color: msg.userId === myId ? '#1976d2' : undefined }}>
                                    {msg.username}:
                                </span>
                                <span className="chat-content">{msg.message}</span>
                            </div>
                        ))}
                    </div>
                    <div className="chat-input">
                        <input
                            ref={chatInputRef}
                            type="text"
                            placeholder="请输入消息..."
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && chatInputRef.current) {
                                    sendChatMessage(chatInputRef.current.value);
                                    chatInputRef.current.value = '';
                                }
                            }}
                        />
                        <button onClick={() => {
                            if (chatInputRef.current) {
                                sendChatMessage(chatInputRef.current.value);
                                chatInputRef.current.value = '';
                            }
                        }} className="chat-submit-btn">
                            提交
                        </button>
                    </div>
                </div>
            </div>

            {roomDestroyCountdown !== null && (<div
                style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 3000,
                }}
            >
                <div
                    style={{
                        background: "#fff",
                        padding: 24,
                        borderRadius: 8,
                        minWidth: 300,
                        textAlign: "center",
                    }}
                >
                    <h3 style={{ marginBottom: 16, color: "#d32f2f" }}>游戏结束</h3>
                    <div style={{ fontSize: 18, fontWeight: "bold", color: "#1976d2", marginBottom: 16 }}>
                        {roomDestroyCountdown} 秒后返回大厅
                    </div>
                    <button
                        className="btn"
                        style={{ width: "100%" }}
                        onClick={() => {
                            setRoomDestroyCountdown(null);
                            handleLeave();
                        }}
                    >
                        立即返回
                    </button>
                </div>
            </div>
            )}
        </>
    );
}
