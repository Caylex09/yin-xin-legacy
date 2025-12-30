import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";
import { API_BASE } from "../../layout";
import { getToken, fetchProfile } from "../../auth";
import { io, Socket } from "socket.io-client";

interface GameQuestion {
  content: string;
  highlightedChar: string;
  author: string;
  poemTitle: string;
  round: number;
}

interface RoomPlayer {
  uid: number;
  username: string;
  avatar: string;
}

interface RoomJoinedData {
  roomCode: string;
  players: RoomPlayer[];
  hostId?: number;
  gameStarted?: boolean;
  question?: GameQuestion;
  scores?: Array<{ uid: number; score: number }>;
  currentRound?: number;
  publicOnline?: number;
  roomOnline?: number;
  maxRounds?: number;
  autoStart?: boolean;
}

interface CorrectAnswerInfo {
  username: string;
  answer: string;
  author: string;
  poemTitle: string;
  avatar: string;
  mode: "correct" | "skip";
  isSkip?: boolean; // 标记是否是跳过
}

interface Submission {
  id: string;
  userId: number;
  username: string;
  answer: string;
  author?: string;
  poemTitle?: string;
  isCorrect: boolean;
  verdictText?: string;
  submittedAt: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: string;
}

interface PlayerStats {
  score: number;
  rank: number;
  totalPlayers: number;
}

export function PoemSnakeRoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [allPlayers, setAllPlayers] = useState<Array<RoomPlayer & { active: boolean }>>([]);
  const [isHost, setIsHost] = useState(false);
  const [inGame, setInGame] = useState(false);
  const [gameQuestion, setGameQuestion] = useState<GameQuestion | null>(null);
  const [scores, setScores] = useState<Array<{ uid: number; score: number }>>([]);
  const [gameFinished, setGameFinished] = useState(false);
  const [gameResults, setGameResults] = useState<Array<{ uid: number; username: string; score: number; bonusScore: number; newTotalScore: number }>>([]);
  const [skipRequested, setSkipRequested] = useState(false);
  const [skipRequestedBy, setSkipRequestedBy] = useState<number | undefined>();
  const [drawRequested, setDrawRequested] = useState(false);
  const [drawRequestedBy, setDrawRequestedBy] = useState<number | undefined>();

  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isInputLocked, setIsInputLocked] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [correctAnswerInfo, setCorrectAnswerInfo] = useState<CorrectAnswerInfo | null>(null);

  // 房间内的提交历史
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [publicOnline, setPublicOnline] = useState(0);
  const [roomOnline, setRoomOnline] = useState(0);
  const [playerStats, setPlayerStats] = useState<PlayerStats>({ score: 0, rank: 0, totalPlayers: 0 });
  const [countdown, setCountdown] = useState<number | null>(null);
  const [maxRounds, setMaxRounds] = useState<number>(5);
  const [autoStart, setAutoStart] = useState<boolean | null>(null);
  const pageTitle = autoStart === true ? "1v1 对战" : "房间对战";
  usePageTitle(pageTitle);
  const isMatchRoom = autoStart === true;
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showEndVotePrompt, setShowEndVotePrompt] = useState(false);
  const [endVoteActive, setEndVoteActive] = useState(false);
  const [endRequester, setEndRequester] = useState<string>("");
  const [myUsername, setMyUsername] = useState<string>("");
  const [roomDestroyCountdown, setRoomDestroyCountdown] = useState<number | null>(null);
  const [roomDestroyReason, setRoomDestroyReason] = useState<string>("");

  const socketRef = useRef<Socket | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const showCorrectAnswerRef = useRef(false);
  const endVoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatIdsRef = useRef<Set<string>>(new Set());

  // 加载房间提交历史
  const loadRoomSubmissions = async () => {
    if (!roomCode) return;
    const token = getToken();
    if (!token) return;
    try {
      // 加载个人提交
      const myResp = await fetch(`${API_BASE}/game/poem-snake/room/${roomCode}/submissions?mine=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (myResp.ok) {
        const myData = await myResp.json();
        setMySubmissions(
          (myData || [])
            // 个人历史需显示所有提交，保留正确/错误状态
            .map((s: Submission) => ({
              ...s,
              verdictText: s.verdictText || (s.isCorrect ? "回答正确！" : "回答错误"),
            }))
            .sort((a: Submission, b: Submission) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
        );
      }

      // 加载所有提交
      const allResp = await fetch(`${API_BASE}/game/poem-snake/room/${roomCode}/submissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (allResp.ok) {
        const allData = await allResp.json();
        setAllSubmissions(
          (allData || [])
            .filter((s: Submission) => s.isCorrect) // 过滤不合法/错误提交
            .sort((a: Submission, b: Submission) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
        );
      }
    } catch (e) {
      console.error("加载房间提交历史失败:", e);
    }
  };

  // 加载个人统计
  const loadPlayerStats = async () => {
    try {
      const profile = await fetchProfile(API_BASE);
      if (profile) {
        const resp = await fetch(`${API_BASE}/rankings/${profile.uid}`);
        const rankData = await resp.json();
        if (resp.ok) {
          setPlayerStats({
            score: profile.score || 0,
            rank: rankData.rank || 0,
            totalPlayers: rankData.total || 0,
          });
        } else {
          setPlayerStats({
            score: profile.score || 0,
            rank: 0,
            totalPlayers: 0,
          });
        }
      }
    } catch (e) {
      console.error("加载个人统计失败:", e);
    }
  };

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate("/login");
      return;
    }

    if (!roomCode) {
      navigate("/game/poem-snake");
      return;
    }

    const wsUrl = API_BASE.replace(/^http/, "ws").replace(/\/api$/, "");
    const socket = io(wsUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setLoading(false);
      // 保存房间码到 localStorage，以便刷新后能重新加入
      if (roomCode) {
        localStorage.setItem("lastRoomCode", roomCode);
      }
      // 加入房间
      socket.emit("room_join", { roomCode });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("room_joined", async (data: RoomJoinedData) => {
      try {
        const profile = await fetchProfile(API_BASE);
        const userId = profile?.uid ? Number(profile.uid) : 0;
        if (profile?.username) setMyUsername(profile.username);
        console.log("[RoomPage] room_joined event:", data, "current userId:", userId);
        if (data.maxRounds) {
          setMaxRounds(data.maxRounds);
        }
        if (data.autoStart !== undefined) {
          setAutoStart(data.autoStart);
        }
        if (data.players && Array.isArray(data.players)) {
          setPlayers(data.players);
          // 未开始/已开始都用当前在房玩家快照，准备期离开的人不会被保留
          setAllPlayers(data.players.map((p) => ({ ...p, active: true })));
          // 优先使用 hostId，如果没有则使用第一个玩家的 uid
          const hostUid = data.hostId !== undefined ? data.hostId : data.players[0]?.uid;
          const isHostUser = hostUid === userId;
          setIsHost(isHostUser);
          console.log("[RoomPage] players set:", data.players.length, "isHost:", isHostUser, "hostUid:", hostUid, "userId:", userId, "hostId from data:", data.hostId, "players:", data.players.map(p => ({ uid: p.uid, username: p.username })));
        } else {
          console.warn("[RoomPage] room_joined with empty players array");
        }

        // 更新在线人数
        if (data.publicOnline !== undefined) {
          setPublicOnline(data.publicOnline);
        }
        if (data.roomOnline !== undefined) {
          setRoomOnline(data.roomOnline);
        }

        // 如果游戏已开始，恢复游戏状态
        if (data.gameStarted && data.question) {
          setInGame(true);
          setGameQuestion(data.question);
          if (data.scores) {
            setScores(data.scores);
          } else {
            setScores(data.players?.map((p) => ({ uid: p.uid, score: 0 })) || []);
          }
          setGameFinished(false);
          setCountdown(null);
          console.log("[RoomPage] Game state restored:", { question: data.question, scores: data.scores, round: data.currentRound });
        }

        // 加载房间提交历史
        loadRoomSubmissions();
      } catch (e) {
        console.error("[RoomPage] Failed to get user profile:", e);
      }
    });

    // 监听玩家列表更新（直接以服务器推送为准）
    socket.on("room_players_update", (data: { roomCode: string; players: RoomPlayer[]; onlineUids?: number[] }) => {
      setPlayers(data.players);
      const onlineSet = new Set(data.onlineUids || data.players.map((p) => p.uid));
      setAllPlayers(data.players.map((p) => ({ ...p, active: onlineSet.has(p.uid) })));
    });

    // 监听在线人数更新
    socket.on("room_online_update", (data: { roomCode: string; publicOnline: number; roomOnline: number }) => {
      setPublicOnline(data.publicOnline);
      setRoomOnline(data.roomOnline);
    });

    socket.on("room_error", (data: { error: string; existingRoomCode?: string }) => {
      // alert(data.error);
      if (data.error.includes("不存在") || data.error.includes("已满")) {
        navigate("/game/poem-snake");
      }
      // 如果有 existingRoomCode，说明需要跳转到已有房间
      if (data.existingRoomCode) {
        navigate(`/game/poem-snake/room/${data.existingRoomCode}`);
      }
    });

    socket.on("room_redirect", (data: { roomCode: string }) => {
      // 后端强制要求返回已有房间
      if (data.roomCode) {
        navigate(`/game/poem-snake/room/${data.roomCode}`);
      }
    });

    socket.on("room_destroyed", (data: { roomCode: string; reason: string }) => {
      localStorage.removeItem("lastRoomCode");
      setShowEndVotePrompt(false);
      if (endVoteTimerRef.current) {
        clearTimeout(endVoteTimerRef.current);
        endVoteTimerRef.current = null;
      }
      // 开始5秒倒计时
      let countdown = 5;
      setRoomDestroyCountdown(countdown);
      setRoomDestroyReason(data.reason);
      const countdownInterval = setInterval(() => {
        countdown--;
        setRoomDestroyCountdown(countdown);
        if (countdown <= 0) {
          clearInterval(countdownInterval);
          navigate("/game/poem-snake");
        }
      }, 1000);
    });

    socket.on("room_countdown_start", (data: { roomCode: string; countdown: number }) => {
      setCountdown(data.countdown);
    });

    socket.on("room_countdown_update", (data: { roomCode: string; countdown: number }) => {
      setCountdown(data.countdown);
    });

    socket.on("room_countdown_cancel", () => {
      setCountdown(null);
    });

    socket.on("room_game_started", (data: { roomCode: string; question: GameQuestion; players: RoomPlayer[]; maxRounds?: number; autoStart?: boolean }) => {
      console.log("[RoomPage] room_game_started event received:", data);
      setCountdown(null);
      setInGame(true);
      if (data.maxRounds) setMaxRounds(data.maxRounds);
      if (data.autoStart !== undefined) setAutoStart(data.autoStart);
      setGameQuestion(data.question);
      setPlayers(data.players);
      setAllPlayers(data.players.map((p) => ({ ...p, active: true })));
      setScores(data.players.map((p) => ({ uid: p.uid, score: 0 })));
      setGameFinished(false);
      setSkipRequested(false);
    });

    socket.on("room_answer_result", (data: { correct: boolean; verdict: number; data: string[]; currentScore: number }) => {
      if (data.correct) {
        const currentToken = getToken();
        const userId = currentToken?.sub ? Number(currentToken.sub) : 0;
        setScores((prev) =>
          prev.map((s) => {
            if (s.uid === userId) {
              return { ...s, score: data.currentScore };
            }
            return s;
          })
        );
      }
    });

    socket.on("room_correct_answer", (data: { uid: number; username: string; avatar: string; answer: string; author: string; poemTitle: string; scores: Array<{ uid: number; score: number }>; isSkip?: boolean }) => {
      setScores(data.scores);
      setCorrectAnswerInfo({
        username: data.username,
        answer: data.answer,
        author: data.author,
        poemTitle: data.poemTitle,
        avatar: data.avatar,
        mode: data.isSkip ? "skip" : "correct",
        isSkip: data.isSkip,
      });
      setShowCorrectAnswer(true);
      showCorrectAnswerRef.current = true;
      setIsInputLocked(true);
      setTimeout(() => {
        setShowCorrectAnswer(false);
        showCorrectAnswerRef.current = false;
        setIsInputLocked(false);
        setCorrectAnswerInfo(null);
      }, 3000);
    });

    socket.on("room_question_update", (data: { question: GameQuestion; scores: Array<{ uid: number; score: number }> }) => {
      setGameQuestion(data.question);
      setScores(data.scores);
      setSkipRequested(false);
      setIsInputLocked(false);
    });

    socket.on("room_skip_requested", async (data: { uid: number; username?: string; avatar?: string; bothSkipped: boolean }) => {
      // 如果 bothSkipped 为 true 且 uid 为 0，表示清除提示
      if (data.bothSkipped && data.uid === 0) {
        setSkipRequested(false);
        setSkipRequestedBy(undefined);
        return;
      }

      const profile = await fetchProfile(API_BASE);
      const userId = profile?.uid ? Number(profile.uid) : 0;
      if (data.bothSkipped) {
        setSkipRequested(false);
        setSkipRequestedBy(undefined);
      } else {
        // 只有对方请求跳过时才显示提示（不显示给请求者自己）
        setSkipRequested(data.uid !== userId);
        setSkipRequestedBy(data.uid);
      }
    });

    socket.on("room_draw_requested", async (data: { uid: number; username?: string }) => {
      // 如果 uid 为 0，表示清除提示
      if (data.uid === 0) {
        setDrawRequested(false);
        setDrawRequestedBy(undefined);
        return;
      }

      const profile = await fetchProfile(API_BASE);
      const userId = profile?.uid ? Number(profile.uid) : 0;
      // 只有对方请求平局时才显示提示（不显示给请求者自己）
      setDrawRequested(data.uid !== userId);
      setDrawRequestedBy(data.uid);
    });

    socket.on("room_game_finished", (data: { results: Array<{ uid: number; username: string; score: number; bonusScore: number; newTotalScore: number }> }) => {
      setInGame(false);
      setGameFinished(true);
      setGameResults(data.results);
      loadPlayerStats();
      // 清除平局请求提示
      setDrawRequested(false);
      setDrawRequestedBy(undefined);
    });

    socket.on("room_submissions_update", () => {
      loadRoomSubmissions();
    });

    // 房间内聊天
    socket.on("room_chat_message", async (data: { type: string; message: ChatMessage }) => {
      if (data.message) {
        const id = data.message.id || "";
        if (id && chatIdsRef.current.has(id)) return;
        if (id) chatIdsRef.current.add(id);
        setChatMessages((prev) => [...prev.slice(-49), data.message]);
        const text = data.message.message || "";
        if (id.startsWith("end_vote_result_") || text.includes("结束房间投票")) {
          setShowEndVotePrompt(false);
          setEndVoteActive(false);
          setEndRequester("");
          if (endVoteTimerRef.current) {
            clearTimeout(endVoteTimerRef.current);
            endVoteTimerRef.current = null;
          }
        }
        // 处理跳过投票消息
        if (text.includes("发起跳过投票")) {
          // 从消息中提取发起者用户名（格式：xxx 发起跳过投票）
          const match = text.match(/^(.+?)\s+发起跳过投票/);
          if (match) {
            const initiatorName = match[1];
            // 如果不是发起者，设置投票状态
            if (initiatorName !== myUsername) {
              setSkipRequested(true);
              setSkipRequestedBy(undefined); // 可以设置为发起者UID，但这里不需要
            } else {
              // 发起者不需要投票，保持 skipRequested 为 false
              setSkipRequested(false);
            }
          }
        } else if (id.startsWith("skip_vote_result_") || (text.includes("跳过投票") && (text.includes("通过") || text.includes("失败")))) {
          // 清除跳过投票状态（投票结果）
          setSkipRequested(false);
          setSkipRequestedBy(undefined);
        }
      }
    });

    socket.on("room_end_vote_pending", (data: { roomCode: string; accept?: number; reject?: number; needed?: number; by?: string; expiresIn?: number }) => {
      // 收到投票开始，全部玩家弹窗；发起者默认同意，不弹窗
      setEndVoteActive(true);
      setEndRequester(data.by || "");
      if (data.by && data.by === myUsername) {
        return;
      }
      setShowEndVotePrompt(true);
      if (endVoteTimerRef.current) {
        clearTimeout(endVoteTimerRef.current);
      }
      endVoteTimerRef.current = setTimeout(() => {
        handleEndVoteAutoReject();
      }, (data.expiresIn ?? 10) * 1000);
    });

    socket.on("online_count", (data: { count: number }) => {
      setOnlineCount(data.count);
    });

    // 加载初始数据
    loadPlayerStats();

    return () => {
      socket.disconnect();
      if (endVoteTimerRef.current) {
        clearTimeout(endVoteTimerRef.current);
      }
      setEndRequester("");
    };
  }, [roomCode, navigate]);

  const handleStartGame = () => {
    if (!socketRef.current || !roomCode || !isHost) return;
    socketRef.current.emit("room_start", { roomCode });
  };

  const handleLeaveRoom = () => {
    if (!socketRef.current || !roomCode) return;
    // 游戏未开始时，匹配房保留，非匹配房且非房主才清除
    if (!inGame) {
      if (!isMatchRoom && !isHost) {
        localStorage.removeItem("lastRoomCode");
      }
    }
    socketRef.current.emit("room_leave", { roomCode });
    navigate("/game/poem-snake");
  };

  const handleRequestEnd = () => {
    if (!roomCode || !socketRef.current) return;
    setShowEndConfirm(true);
  };

  const handleConfirmEnd = () => {
    if (!roomCode || !socketRef.current) return;
    socketRef.current.emit("room_end", { roomCode });
    setShowEndConfirm(false);
  };

  const handleCancelEnd = () => setShowEndConfirm(false);
  const handleEndVoteAutoReject = () => {
    if (endVoteTimerRef.current) {
      clearTimeout(endVoteTimerRef.current);
      endVoteTimerRef.current = null;
    }
    setShowEndVotePrompt(false);
    setEndRequester("");
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit("room_reject_end", { roomCode });
  };

  const handleEndVoteAccept = () => {
    if (endVoteTimerRef.current) {
      clearTimeout(endVoteTimerRef.current);
      endVoteTimerRef.current = null;
    }
    setShowEndVotePrompt(false);
    setEndVoteActive(false);
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit("room_accept_end", { roomCode });
  };

  const handleEndVoteReject = () => {
    if (endVoteTimerRef.current) {
      clearTimeout(endVoteTimerRef.current);
      endVoteTimerRef.current = null;
    }
    setShowEndVotePrompt(false);
    setEndVoteActive(false);
    setEndRequester("");
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit("room_reject_end", { roomCode });
  };

  const handleRequestDraw = () => {
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit("room_request_draw", { roomCode });
  };

  const handleAcceptDraw = () => {
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit("room_accept_draw", { roomCode });
    setDrawRequested(false);
    setDrawRequestedBy(undefined);
  };

  const handleRejectDraw = () => {
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit("room_reject_draw", { roomCode });
    setDrawRequested(false);
    setDrawRequestedBy(undefined);
  };

  const submitAnswer = () => {
    if (!currentAnswer.trim() || !socketRef.current || !isConnected || !roomCode) return;

    const answer = currentAnswer.trim().toLowerCase();

    // 检查是否是跳过相关操作
    if (answer === "skip") {
      // 如果有投票在进行中，参与投票；否则发起投票
      if (skipRequested) {
        socketRef.current.emit("room_accept_skip", { roomCode });
      } else {
        socketRef.current.emit("room_request_skip", { roomCode });
      }
      setCurrentAnswer("");
      return;
    }

    // 检查是否是拒绝跳过投票
    if (answer === "reject") {
      socketRef.current.emit("room_reject_skip", { roomCode });
      setCurrentAnswer("");
      return;
    }

    socketRef.current.emit("room_submit_answer", {
      roomCode,
      answer: currentAnswer.trim(),
    });
    setCurrentAnswer("");
  };

  const sendChatMessage = () => {
    if (!chatInputRef.current?.value.trim() || !socketRef.current || !isConnected || !roomCode) return;
    socketRef.current.emit("room_chat_message", {
      roomCode,
      message: chatInputRef.current.value.trim(),
    });
    chatInputRef.current.value = "";
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      submitAnswer();
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  if (loading) {
    return (
      <div className="game-container">
        <div className="loading">连接中...</div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="game-container">
        <div className="error">无法连接到游戏服务器，请刷新页面重试</div>
      </div>
    );
  }

  return (
    <>
      <div className="poem-snake-game">
        {/* 左侧游戏区域 */}
        <div className="game-left">
          {/* 游戏屏幕 */}
          <div className="game-screen">
            <h1 className="screen-title">{autoStart === true ? "1v1 对战" : "房间对战"}</h1>
            <div className="poem-container">
              {showCorrectAnswer && correctAnswerInfo ? (
                <div className="correct-answer-display">
                  {correctAnswerInfo.mode === "correct" ? (
                    <>
                      <div className="correct-answer-header">
                        <img
                          src={correctAnswerInfo.avatar || "/avatar/yinxin.png"}
                          alt={correctAnswerInfo.username}
                          className="correct-answer-avatar"
                        />
                        <div className="correct-answer-username">{correctAnswerInfo.username}</div>
                      </div>
                      <div className="correct-answer-text">答出</div>
                      <div className="correct-answer-poem">{correctAnswerInfo.answer}</div>
                      <div className="correct-answer-meta">
                        ——{correctAnswerInfo.author}《{correctAnswerInfo.poemTitle}》
                      </div>
                    </>
                  ) : (
                    <div className="correct-answer-text">跳过</div>
                  )}
                </div>
              ) : inGame && gameQuestion ? (
                <div className="poem-display">
                  {(() => {
                    const content = gameQuestion.content;
                    const highlightedChar = gameQuestion.highlightedChar;
                    const charIndex = content.indexOf(highlightedChar);
                    if (charIndex === -1) return null;
                    const beforeChar = content.substring(0, charIndex).trim();
                    const afterChar = content.substring(charIndex + 1).trim();
                    return (
                      <>
                        <div className="screen-sentence">
                          {beforeChar}
                          <span className="highlighted-char">{highlightedChar}</span>
                          {afterChar}
                        </div>
                        <div className="screen-info">
                          【{gameQuestion.author}】《{gameQuestion.poemTitle}》
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="waiting">
                  {countdown !== null && countdown > 0 ? (
                    <div style={{ fontSize: "48px", fontWeight: "bold", color: "#c86d3f" }}>
                      {countdown}
                    </div>
                  ) : inGame ? (gameQuestion ? `第 ${gameQuestion.round} / ${maxRounds} 题` : "游戏进行中...") : gameFinished ? "游戏结束" : autoStart ? (players.length >= 2 ? "游戏即将开始..." : players.length > 0 ? "等待其他玩家加入..." : "连接房间中...") : isHost ? "请点击开始游戏" : "等待房主开始游戏..."}
                </div>
              )}
            </div>
          </div>

          {/* 输入区域 */}
          <div className="input-area">
            <div className="input-title">输入你的诗句</div>
            <div className="input-wrapper">
              <textarea
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="请输入诗句..."
                disabled={!inGame || isInputLocked}
                className="poem-textarea"
                rows={3}
              />
              <div className="input-actions">
                <button
                  onClick={submitAnswer}
                  disabled={!currentAnswer.trim() || !inGame || isInputLocked}
                  className="submit-btn"
                >
                  提交 (Ctrl+Enter)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧信息区域 */}
        <div className="game-right">
          {/* 右上角区域：个人历史记录和全体记录 */}
          <div className="right-top">
            {/* 个人历史提交 */}
            <div className="personal-history">
              <h3>个人历史提交</h3>
              <div className="history-list">
                {mySubmissions.slice(0, 10).map((submission) => (
                  <div key={submission.id} className="history-item">
                    <span className="history-username">{submission.username}</span>
                    <span className="history-separator">|</span>
                    <span className="history-time">{formatDateTime(submission.submittedAt)}</span>
                    <span
                      className="history-result"
                      style={{ color: submission.isCorrect ? "#4caf50" : "#f44336" }}
                    >
                      {submission.isCorrect ? "回答正确！" : submission.verdictText || "回答错误"}
                    </span>
                  </div>
                ))}
                {mySubmissions.length === 0 && (
                  <div className="muted" style={{ padding: 8 }}>暂无提交记录</div>
                )}
              </div>
            </div>

            {/* 历史提交榜 */}
            <div className="all-submissions">
              <h3>历史提交榜</h3>
              <div className="submissions-list">
                {allSubmissions.map((submission) => (
                  <div key={submission.id} className="submission-item">
                    <div className="submission-header">
                      <span className="submission-username">{submission.username}</span>
                      <span className="submission-separator">|</span>
                      <span className="submission-time">{formatDateTime(submission.submittedAt)}</span>
                    </div>
                    <div className="submission-content">
                      {submission.answer}
                      {submission.author && submission.poemTitle && (
                        <span className="submission-meta">
                          ————【{submission.author}】《{submission.poemTitle}》
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {allSubmissions.length === 0 && (
                  <div className="muted" style={{ padding: 8 }}>暂无提交记录</div>
                )}
              </div>
            </div>
          </div>

          {/* 右下角区域：聊天 + 我的统计 */}
          <div className="right-bottom">
            {/* 聊天框 */}
            <div className="chat-section">
              <h3>聊天框 (公屏 {publicOnline} 人 / 房间 {roomOnline} 人在线)</h3>
              <div className="chat-messages">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className="chat-message">
                    <span className="chat-username">{msg.username}:</span>
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
                    if (e.key === 'Enter') sendChatMessage();
                  }}
                />
                <button onClick={sendChatMessage} className="chat-submit-btn">提交</button>
              </div>
            </div>

            {/* 个人统计 */}
            <div className="stats-section">
              {drawRequested && (
                <div style={{ marginBottom: 8, padding: 8, background: "rgba(200, 109, 63, 0.1)", borderRadius: 4 }}>
                  <div style={{ marginBottom: 4, fontSize: "14px", fontWeight: "bold", color: "#c86d3f" }}>
                    对方请求平局
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={handleAcceptDraw} style={{ flex: 1, fontSize: "12px", padding: "4px 8px" }}>
                      同意
                    </button>
                    <button className="btn ghost" onClick={handleRejectDraw} style={{ flex: 1, fontSize: "12px", padding: "4px 8px" }}>
                      拒绝
                    </button>
                  </div>
                </div>
              )}
              {!isMatchRoom && showEndVotePrompt && (
                <div style={{ marginBottom: 8, padding: 8, background: "rgba(200, 109, 63, 0.1)", borderRadius: 4 }}>
                  <div style={{ marginBottom: 4, fontSize: "14px", fontWeight: "bold", color: "#c86d3f" }}>
                    {endRequester ? `${endRequester} 请求结束房间` : "有人请求结束房间"}
                  </div>
                  <div style={{ fontSize: "12px", color: "#999", marginBottom: 6 }}>10 秒内未选择视为拒绝</div>
                  {endRequester !== myUsername && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn" onClick={handleEndVoteAccept} style={{ flex: 1, fontSize: "12px", padding: "4px 8px" }}>
                        同意
                      </button>
                      <button className="btn ghost" onClick={handleEndVoteReject} style={{ flex: 1, fontSize: "12px", padding: "4px 8px" }}>
                        拒绝
                      </button>
                    </div>
                  )}
                </div>
              )}
              <h3>我的统计</h3>
              <div className="stats-info">
                <div className="stat-item">
                  <span className="label">当前积分：</span>
                  <span className="value">{playerStats.score}</span>
                </div>
                <div className="stat-item">
                  <span className="label">全站排名：</span>
                  <span className="value">
                    {playerStats.rank > 0 ? `${playerStats.rank} / ${playerStats.totalPlayers}` : "暂未上榜"}
                  </span>
                </div>
              </div>

              {/* 房间信息和操作 */}
              <div style={{ marginTop: 16 }}>
                <div style={{ marginBottom: 12, fontSize: "14px", color: "#666" }}>
                  <div style={{ fontWeight: "bold", marginBottom: 4 }}>房间码：{roomCode}</div>
                  <div>玩家：{allPlayers.map((p, idx) => (
                    <span key={p.uid} style={{ textDecoration: p.active ? "none" : "line-through", color: p.active ? undefined : "#999" }}>
                      {p.username}
                      {idx < allPlayers.length - 1 ? "、" : ""}
                    </span>
                  ))}</div>
                </div>

                {!inGame && !gameFinished && (
                  <>
                    {countdown !== null && countdown > 0 ? (
                      <div style={{ marginBottom: 8, fontSize: "16px", fontWeight: "bold", color: "#c86d3f", textAlign: "center" }}>
                        {countdown} 秒后开始
                      </div>
                    ) : autoStart ? (
                      players.length >= 2 ? (
                        <div style={{ marginBottom: 8, fontSize: "14px", color: "#999" }}>
                          准备开始...
                        </div>
                      ) : (
                        <div style={{ marginBottom: 8, fontSize: "14px", color: "#999" }}>
                          等待其他玩家加入... ({players.length}/2)
                        </div>
                      )
                    ) : (
                      <div style={{ marginBottom: 8, fontSize: "14px", color: "#999" }}>
                        {isHost ? "房主点击下方开始游戏" : "等待房主开始游戏"} ({players.length}/50)
                      </div>
                    )}
                    {!autoStart && isHost && !inGame && (
                      <button className="btn ghost" onClick={handleRequestEnd} style={{ width: "100%", marginBottom: 8 }}>
                        发起结束投票
                      </button>
                    )}
                    {inGame && (isMatchRoom ? roomOnline <= 1 : true) && (
                      <button
                        className="btn ghost"
                        onClick={handleRequestEnd}
                        style={{ width: "100%", marginBottom: 8 }}
                      >
                        {isMatchRoom ? "结束房间" : "发起结束投票"}
                      </button>
                    )}
                    {!autoStart && isHost && (
                      <button className="btn" onClick={handleStartGame} style={{ width: "100%", marginBottom: 8 }}>
                        开始游戏
                      </button>
                    )}
                    <button className="btn ghost" onClick={handleLeaveRoom} style={{ width: "100%" }}>
                      离开房间
                    </button>
                  </>
                )}

                {inGame && !gameFinished && (
                  <>
                    {isMatchRoom && roomOnline >= 2 && (
                      <button className="btn ghost" onClick={handleRequestDraw} style={{ width: "100%", marginTop: 8 }}>
                        请求平局
                      </button>
                    )}
                    {inGame && (isMatchRoom ? roomOnline <= 1 : true) && (
                      <button
                        className="btn ghost"
                        onClick={handleRequestEnd}
                        style={{ width: "100%", marginTop: 8 }}
                      >
                        {isMatchRoom ? "结束房间" : "发起结束投票"}
                      </button>
                    )}
                    <button className="btn ghost" onClick={handleLeaveRoom} style={{ width: "100%", marginTop: 8 }}>
                      离开房间
                    </button>
                  </>
                )}

                {inGame && gameQuestion && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 8, fontWeight: "bold" }}>
                      第 {gameQuestion.round} / {maxRounds} 题
                    </div>
                    <div style={{ marginBottom: 8, fontSize: "14px" }}>
                      {allPlayers.map((p) => {
                        const score = scores.find((s) => s.uid === p.uid)?.score ?? 0;
                        return (
                          <div key={p.uid} style={{ textDecoration: p.active ? "none" : "line-through", color: p.active ? undefined : "#999" }}>
                            {p.username}: {score} 分
                          </div>
                        );
                      })}
                    </div>
                    {skipRequested && (
                      <div style={{ marginBottom: 8, fontSize: "14px", color: "#c86d3f" }}>
                        <div style={{ marginBottom: 4 }}>有跳过投票在进行中</div>
                        <div style={{ fontSize: "12px", color: "#999" }}>
                          输入 skip 同意，输入 reject 拒绝
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {gameFinished && gameResults && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 8, fontWeight: "bold" }}>游戏结束</div>
                    {gameResults.map((r) => (
                      <div key={r.uid} style={{ marginBottom: 4, fontSize: "14px" }}>
                        {r.username}: {r.score} 分 + {r.bonusScore} 分奖励 = {r.score + r.bonusScore} 分
                      </div>
                    ))}
                    <button className="btn ghost" onClick={handleLeaveRoom} style={{ width: "100%", marginTop: 8 }}>
                      离开房间
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {showEndConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={handleCancelEnd}
        >
          <div
            style={{ background: "#fff", padding: 24, borderRadius: 8, minWidth: 280 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 12 }}>确认发起结束投票？</h3>
            <div style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
              发起后需要等待其他玩家投票，超过 50% 同意才能结束房间。
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={handleConfirmEnd}>
                确认
              </button>
              <button className="btn ghost" style={{ flex: 1 }} onClick={handleCancelEnd}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {roomDestroyCountdown !== null && (
        <div
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
            <h3 style={{ marginBottom: 16, color: "#d32f2f" }}>房间已被销毁</h3>
            <div style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
              {roomDestroyReason}
            </div>
            <div style={{ fontSize: 18, fontWeight: "bold", color: "#1976d2", marginBottom: 16 }}>
              {roomDestroyCountdown} 秒后返回
            </div>
            <button
              className="btn"
              style={{ width: "100%" }}
              onClick={() => {
                setRoomDestroyCountdown(null);
                navigate("/game/poem-snake");
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
