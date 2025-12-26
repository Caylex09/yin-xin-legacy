import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";
import { API_BASE } from "../../layout";
import { getToken, fetchProfile } from "../../auth";
import { io, Socket } from "socket.io-client";

interface GameState {
  currentPoem: string;
  highlightedChar: string;
  author: string;
  authorName: string;
  poemTitle: string;
  timeLeft: number;
  round: number;
  isActive: boolean;
}

interface Submission {
  id: string;
  userId: string;
  username: string;
  answer: string;
  author?: string;
  authorName?: string;
  poemTitle?: string;
  isCorrect: boolean;
  score: number;
  submittedAt: string;
  verdictText?: string;
}

// interface RankingPlayer {
//   id: string;
//   username: string;
//   avatar: string;
//   score: number;
// }

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


export function PoemSnakePage() {
  usePageTitle("古诗（）谜");
  const navigate = useNavigate();

  const [gameState, setGameState] = useState<GameState>({
    currentPoem: "草色全经细雨湿,花枝欲动春风寒。",
    highlightedChar: "动",
    author: "wangwei",
    authorName: "王维",
    poemTitle: "酌酒与裴迪",
    timeLeft: 45,
    round: 1,
    isActive: true,
  });

  const [mySubmissions, setMySubmissions] = useState<Submission[]>([
    {
      id: "1",
      userId: "1",
      username: "cyx",
      answer: "春眠不觉晓",
      isCorrect: true,
      score: 5,
      submittedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    },
    {
      id: "2",
      userId: "1",
      username: "cyx",
      answer: "夜来风雨声",
      isCorrect: true,
      score: 5,
      submittedAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    },
    {
      id: "3",
      userId: "1",
      username: "cyx",
      answer: "花落知多少",
      isCorrect: true,
      score: 5,
      submittedAt: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
    }
  ]);

  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([
    {
      id: "1",
      userId: "2",
      username: "yobai",
      answer: "林寒正下叶,钓晚欲收纶。",
      author: "yinkeng",
      authorName: "阴铿",
      poemTitle: "江津送刘光禄不及",
      isCorrect: true,
      score: 5,
      submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    },
    {
      id: "2",
      userId: "2",
      username: "yobai",
      answer: "日啖荔枝三百颗,不辞长作岭南人。",
      author: "sushi",
      authorName: "苏轼",
      poemTitle: "惠州一绝",
      isCorrect: true,
      score: 5,
      submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    }
  ]);

  // 全站排行榜数据目前未在页面中展示，先保留加载逻辑，隐藏具体数据

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      userId: "1",
      username: "系统",
      message: "欢迎来到古诗（）谜游戏！",
      timestamp: new Date().toISOString(),
    }
  ]);

  const [onlineCount, setOnlineCount] = useState(0);
  const [playerStats, setPlayerStats] = useState<PlayerStats>({ score: 0, rank: 0, totalPlayers: 0 });
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);

  // 匹配状态
  const [matchState, setMatchState] = useState<{
    inQueue: boolean;
    queueSize: number;
  }>({
    inQueue: false,
    queueSize: 0,
  });

  const [hasValidRoom, setHasValidRoom] = useState(false);

  const [showJoinRoomDialog, setShowJoinRoomDialog] = useState(false);
  const [showCreateRoomDialog, setShowCreateRoomDialog] = useState(false);
  // 用字符串存储以允许输入框清空，确认时再做数值校验
  const [createRoomRounds, setCreateRoomRounds] = useState<string>("5");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [roomError, setRoomError] = useState<string>("");
  const [correctAnswerInfo, setCorrectAnswerInfo] = useState<{ username: string; avatar?: string; answer: string; author: string; poemTitle: string; mode: "correct" | "skip" } | null>(null);
  const [isInputLocked, setIsInputLocked] = useState(false);
  const [submissionsOffset, setSubmissionsOffset] = useState(0); // 已加载的提交数量
  const [loadingMore, setLoadingMore] = useState(false); // 是否正在加载更多
  const [hasMoreSubmissions, setHasMoreSubmissions] = useState(true); // 是否还有更多提交

  const socketRef = useRef<Socket | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const showCorrectAnswerRef = useRef(false);
  const pendingGameStateRef = useRef<GameState | null>(null);

  // 连接WebSocket
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoggedIn(false);
      setLoading(false);
      return;
    }
    setIsLoggedIn(true);

    const wsUrl = API_BASE.replace(/^http/, "ws").replace(/\/api$/, "");
    const socket = io(wsUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setLoading(false);
      // 请求当前匹配队列人数
      socket.emit("matchmaking_get_queue_size");
      // 检查是否有有效的房间
      checkValidRoom();
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("game_state", (data: { type: string; gameState: GameState }) => {
      if (data.gameState) {
        setGameState({
          ...data.gameState,
          timeLeft: 45,
        });
      }
    });

    socket.on("game_state_update", (data: any) => {
      if (data.type === "correct_answer") {
        // 显示答出提示
        setCorrectAnswerInfo({
          username: data.username,
          avatar: data.avatar,
          answer: data.answer,
          author: data.author,
          poemTitle: data.poemTitle,
          mode: "correct",
        });
        setShowCorrectAnswer(true);
        showCorrectAnswerRef.current = true;
        setIsInputLocked(true);

        // 3秒后隐藏提示
        setTimeout(() => {
          setShowCorrectAnswer(false);
          showCorrectAnswerRef.current = false;

          // 如果有待处理的游戏状态，现在应用它
          if (pendingGameStateRef.current) {
            setGameState({
              ...pendingGameStateRef.current,
              timeLeft: 45,
            });
            setIsInputLocked(false);
            setCorrectAnswerInfo(null);
            pendingGameStateRef.current = null;
          }
        }, 3000);
      } else if (data.type === "skip_turn") {
        // 显示跳过提示
        setCorrectAnswerInfo({
          username: data.username,
          answer: "",
          author: "",
          poemTitle: "",
          mode: "skip",
        });
        setShowCorrectAnswer(true);
        showCorrectAnswerRef.current = true;
        setIsInputLocked(true);

        // 3秒后隐藏提示
        setTimeout(() => {
          setShowCorrectAnswer(false);
          showCorrectAnswerRef.current = false;

          // 如果有待处理的游戏状态，现在应用它
          if (pendingGameStateRef.current) {
            setGameState({
              ...pendingGameStateRef.current,
              timeLeft: 45,
            });
            setIsInputLocked(false);
            setCorrectAnswerInfo(null);
            pendingGameStateRef.current = null;
          }
        }, 3000);
      } else if (data.type === "poem_update" && data.gameState) {
        // 新题目到来
        if (showCorrectAnswerRef.current) {
          // 如果正在显示提示，保存新状态，等待提示结束后再应用
          pendingGameStateRef.current = data.gameState;
        } else {
          // 如果提示已经隐藏，立即更新
          setGameState({
            ...data.gameState,
            timeLeft: 45,
          });
          setIsInputLocked(false);
          setCorrectAnswerInfo(null);
        }
      }
    });

    socket.on("submission_result", (data: { isCorrect: boolean; verdict: number; verdictText: string; score: number }) => {
      // 处理提交结果：如果回答正确，刷新个人积分和全站排名
      if (data.isCorrect) {
        loadPlayerStats();
      }
    });

    socket.on("skip_result", (data: { success: boolean; error?: string; cost?: number; remainingScore?: number }) => {
      if (data.success) {
        // 跳过成功后，同步刷新个人积分和全站排名
        loadPlayerStats();
      }
      // skip 失败的情况已经通过聊天消息显示，这里不再处理
    });

    socket.on("score_update", () => {
      // 后端主动推送积分变动时，也刷新一次完整统计（包括全站排名）
      loadPlayerStats();
    });

    socket.on("submissions_update", () => {
      // 刷新提交历史（重置为第一页）
      loadSubmissions(true);
      loadMySubmissions();
    });

    socket.on("chat_message", (data: { type: string; message: ChatMessage }) => {
      if (data.message) {
        setChatMessages((prev) => [...prev.slice(-49), data.message]);
      }
    });

    socket.on("online_count", (data: { count: number }) => {
      setOnlineCount(data.count);
    });

    // 匹配和房间相关事件
    socket.on("matchmaking_status", (data: { inQueue: boolean; queueSize?: number }) => {
      setMatchState((prev) => ({ ...prev, inQueue: data.inQueue, queueSize: data.queueSize || 0 }));
    });

    socket.on("matchmaking_queue_update", (data: { queueSize: number }) => {
      // 无论是否在队列中，都更新队列人数显示
      setMatchState((prev) => ({ ...prev, queueSize: data.queueSize }));
    });

    socket.on("room_redirect", (data: { roomCode: string }) => {
      // 后端强制要求返回已有房间
      setMatchState((prev) => ({ ...prev, inQueue: false }));
      setShowJoinRoomDialog(false);
      if (data.roomCode) {
        localStorage.setItem("lastRoomCode", data.roomCode);
        setHasValidRoom(true);
        navigate(`/game/poem-snake/room/${data.roomCode}`);
      }
    });

    socket.on("matchmaking_matched", (data: { roomCode: string; players: Array<{ uid: number; username: string; avatar: string }> }) => {
      setMatchState((prev) => ({ ...prev, inQueue: false }));
      // 保存房间码
      localStorage.setItem("lastRoomCode", data.roomCode);
      // 检查房间有效性
      checkValidRoom();
      navigate(`/game/poem-snake/room/${data.roomCode}`);
    });

    socket.on("room_created", (data: { roomCode: string; players: Array<{ uid: number; username: string; avatar: string }> }) => {
      // 保存房间码
      localStorage.setItem("lastRoomCode", data.roomCode);
      checkValidRoom();
      navigate(`/game/poem-snake/room/${data.roomCode}`);
    });

    socket.on("room_joined", (data: { roomCode: string; players: Array<{ uid: number; username: string; avatar: string }> }) => {
      setShowJoinRoomDialog(false);
      setJoinRoomCode("");
      // 保存房间码
      localStorage.setItem("lastRoomCode", data.roomCode);
      checkValidRoom();
      navigate(`/game/poem-snake/room/${data.roomCode}`);
    });

    socket.on("room_left", (data: { roomCode: string; playing?: boolean; keepRoom?: boolean }) => {
      if (!data.roomCode) return;
      const current = localStorage.getItem("lastRoomCode");
      if (current !== data.roomCode) return;
      // 在等待/倒计时阶段，所有玩家允许返回
      if (!data.playing && data.keepRoom) {
        setHasValidRoom(true);
        return;
      }
      // 游戏已开始离开，不允许返回
      if (data.playing) {
        localStorage.removeItem("lastRoomCode");
        setHasValidRoom(false);
        return;
      }
      // 未开始且不允许保留
      if (!data.keepRoom) {
        localStorage.removeItem("lastRoomCode");
        setHasValidRoom(false);
      }
    });

    socket.on("room_error", (data: { error: string }) => {
      if (data.error.includes("不存在")) {
        localStorage.removeItem("lastRoomCode");
        setHasValidRoom(false);
        setRoomError(data.error);
      } else {
        // alert(data.error);
      }
    });

    socket.on("room_destroyed", (data: { roomCode: string; reason: string }) => {
      if (localStorage.getItem("lastRoomCode") === data.roomCode) {
        localStorage.removeItem("lastRoomCode");
      }
      setHasValidRoom(false);
      setShowJoinRoomDialog(false);
    });

    // 加载初始数据
    loadSubmissions(true); // 初始加载时重置
    loadMySubmissions();
    loadRanking();
    loadPlayerStats();

    return () => {
      socket.disconnect();
    };
  }, []);

  // 加载提交历史
  const loadSubmissions = async (reset: boolean = false) => {
    try {
      const offset = reset ? 0 : submissionsOffset;
      const limit = 20;
      const resp = await fetch(`${API_BASE}/game/poem-snake/submissions?limit=${limit}&offset=${offset}`);
      const data = await resp.json();
      if (resp.ok && Array.isArray(data)) {
        if (reset) {
          setAllSubmissions(data);
          setSubmissionsOffset(data.length);
        } else {
          setAllSubmissions((prev) => [...prev, ...data]);
          setSubmissionsOffset((prev) => prev + data.length);
        }
        // 如果返回的数据少于 limit，说明没有更多了
        setHasMoreSubmissions(data.length === limit);
      }
    } catch (e) {
      console.error("加载提交历史失败:", e);
    }
  };

  // 加载更多提交
  const loadMoreSubmissions = async () => {
    if (loadingMore || !hasMoreSubmissions) return;
    setLoadingMore(true);
    try {
      await loadSubmissions(false);
    } finally {
      setLoadingMore(false);
    }
  };

  // 加载个人提交历史
  const loadMySubmissions = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const resp = await fetch(`${API_BASE}/game/poem-snake/my-submissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data)) {
        setMySubmissions(
          data.map((item: any) => ({
            ...item,
            verdictText: item.verdictText || item.verdictCN || (item.isCorrect ? "回答正确！" : "回答错误"),
          }))
        );
      }
    } catch (e) {
      console.error("加载个人提交历史失败:", e);
    }
  };

  // 加载排行榜
  const loadRanking = async () => {
    try {
      const resp = await fetch(`${API_BASE}/rankings?limit=5&offset=0`);
      // 目前排行榜数据未在页面展示，这里仅确保接口可用
      await resp.json();
    } catch (e) {
      console.error("加载排行榜失败:", e);
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

  const submitAnswer = () => {
    if (!currentAnswer.trim() || !socketRef.current || !isConnected) return;

    const answer = currentAnswer.trim();

    // 检查是否是跳过请求
    if (answer.toLowerCase() === "skip") {
      socketRef.current.emit("skip_turn", {});
      setCurrentAnswer("");
      return;
    }

    socketRef.current.emit("submit_answer", {
      answer: answer,
    });

    setCurrentAnswer("");
  };

  const sendChatMessage = () => {
    if (!chatInputRef.current?.value.trim() || !socketRef.current || !isConnected) return;

    socketRef.current.emit("chat_message", {
      message: chatInputRef.current.value.trim(),
    });

    chatInputRef.current.value = "";
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.ctrlKey) {
        submitAnswer();
      }
    }
  };

  // 匹配和房间处理函数
  const handleMatchmakingJoin = () => {
    if (hasValidRoom) {
      const lastRoomCode = localStorage.getItem("lastRoomCode");
      if (lastRoomCode) {
        navigate(`/game/poem-snake/room/${lastRoomCode}`);
      }
      return;
    }
    if (!socketRef.current) return;
    socketRef.current.emit("matchmaking_join");
    setMatchState((prev) => ({ ...prev, inQueue: true }));
  };

  const handleMatchmakingLeave = () => {
    if (!socketRef.current) return;
    socketRef.current.emit("matchmaking_leave");
    setMatchState((prev) => ({ ...prev, inQueue: false }));
  };

  // 检查是否有有效的房间
  const checkValidRoom = async () => {
    try {
      const lastRoomCode = localStorage.getItem("lastRoomCode");
      if (!lastRoomCode) {
        setHasValidRoom(false);
        return;
      }

      const token = getToken();
      if (!token) {
        setHasValidRoom(false);
        return;
      }

      const resp = await fetch(`${API_BASE}/game/poem-snake/room/${lastRoomCode}/check`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (resp.ok) {
        const data = await resp.json();
        // 只要房间存在且可以加入（用户在房间中，或者房间状态为waiting且未满员），就显示返回房间按钮
        setHasValidRoom(data.exists && data.canJoin);
      } else {
        setHasValidRoom(false);
      }
    } catch (e) {
      console.error("检查房间失败:", e);
      setHasValidRoom(false);
    }
  };

  const handleCreateRoom = () => {
    if (hasValidRoom) {
      const lastRoomCode = localStorage.getItem("lastRoomCode");
      if (lastRoomCode) navigate(`/game/poem-snake/room/${lastRoomCode}`);
      return;
    }
    setShowCreateRoomDialog(true);
  };

  const handleConfirmCreateRoom = () => {
    if (hasValidRoom) {
      const lastRoomCode = localStorage.getItem("lastRoomCode");
      if (lastRoomCode) navigate(`/game/poem-snake/room/${lastRoomCode}`);
      return;
    }
    if (!socketRef.current) return;
    const parsed = Number(createRoomRounds);
    const clamped = Number.isFinite(parsed) ? Math.min(100, Math.max(5, Math.round(parsed))) : 5;
    setCreateRoomRounds(String(clamped));
    socketRef.current.emit("room_create", { maxRounds: clamped });
    setShowCreateRoomDialog(false);
  };

  const handleJoinRoom = () => {
    if (hasValidRoom) {
      const lastRoomCode = localStorage.getItem("lastRoomCode");
      if (lastRoomCode) navigate(`/game/poem-snake/room/${lastRoomCode}`);
      return;
    }
    if (!socketRef.current || !joinRoomCode.trim()) return;
    socketRef.current.emit("room_join", { roomCode: joinRoomCode.trim().toUpperCase() });
  };


  const renderHighlightedPoem = () => {
    if (!gameState.currentPoem || !gameState.highlightedChar) return null;

    // 找到高亮字符的位置
    const charIndex = gameState.currentPoem.indexOf(gameState.highlightedChar);
    if (charIndex === -1) return null;

    const beforeChar = gameState.currentPoem.substring(0, charIndex).trim();
    const highlightedChar = gameState.currentPoem[charIndex];
    const afterChar = gameState.currentPoem.substring(charIndex + 1).trim();

    return (
      <div className="poem-display">
        <div className="screen-sentence">
          {beforeChar}
          <span className="highlighted-char">{highlightedChar}</span>
          {afterChar}
        </div>
        <div className="screen-info">
          【{gameState.authorName}】《{gameState.poemTitle}》
        </div>
      </div>
    );
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
        <div className="loading">连接游戏中...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="game-container">
        <div className="error">
          请先<a href="/login" style={{ color: "#c86d3f", textDecoration: "underline" }}>登录</a>后再进入游戏
        </div>
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
    <div className="poem-snake-game">
      {/* 左侧游戏区域 */}
      <div className="game-left">
        {/* 公屏 */}
        <div className="game-screen">
          <h1 className="screen-title">公屏</h1>
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
                    <div className="correct-answer-meta">——{correctAnswerInfo.author}《{correctAnswerInfo.poemTitle}》</div>
                  </>
                ) : (
                  <>
                    <div className="correct-answer-text">被 {correctAnswerInfo.username} 跳过</div>
                  </>
                )}
              </div>
            ) : gameState.isActive ? (
              renderHighlightedPoem()
            ) : (
              <div className="waiting">等待下一轮开始...</div>
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
              disabled={!gameState.isActive || isInputLocked}
              className="poem-textarea"
              rows={3}
            />
            <div className="input-actions">
              <button
                onClick={submitAnswer}
                disabled={!currentAnswer.trim() || !gameState.isActive || isInputLocked}
                className="submit-skip-btn"
              >
                提交 / 跳过
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
                    {submission.authorName && submission.poemTitle && (
                      <span className="submission-meta">
                        ————【{submission.authorName}】《{submission.poemTitle}》
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {hasMoreSubmissions && (
              <button
                className="load-more-btn"
                onClick={loadMoreSubmissions}
                disabled={loadingMore}
              >
                {loadingMore ? "加载中..." : "加载更多"}
              </button>
            )}
          </div>
        </div>

        {/* 右下角区域：聊天 + 我的统计 */}
        <div className="right-bottom">
          {/* 聊天框 */}
          <div className="chat-section">
            <h3>聊天框 (当前共 {onlineCount} 人在线)</h3>
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

            {/* 匹配和房间按钮 */}
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {!matchState.inQueue && (
                <>
                  {/* 如果有有效的房间，仅显示返回房间按钮，禁用其他入口 */}
                  {hasValidRoom ? (
                    <button
                      className="btn"
                      onClick={() => {
                        const lastRoomCode = localStorage.getItem("lastRoomCode");
                        if (lastRoomCode) {
                          navigate(`/game/poem-snake/room/${lastRoomCode}`);
                        }
                      }}
                      style={{ width: "100%" }}
                    >
                      返回房间
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn"
                        onClick={handleMatchmakingJoin}
                        style={{ width: "100%" }}
                      >
                        1v1 匹配 {` (当前 ${matchState.queueSize} 人在匹配中)`}
                      </button>
                      <button
                        className="btn ghost"
                        onClick={handleCreateRoom}
                        style={{ width: "100%" }}
                      >
                        创建房间
                      </button>
                      <button
                        className="btn ghost"
                        onClick={() => setShowJoinRoomDialog(true)}
                        style={{ width: "100%" }}
                      >
                        加入房间
                      </button>
                    </>
                  )}
                </>
              )}

              {matchState.inQueue && (
                <div style={{ padding: 12, background: "#fffaf5", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ marginBottom: 8 }}>匹配中...</div>
                  <div style={{ marginBottom: 8, fontSize: "12px", color: "#666" }}>
                    当前 {matchState.queueSize} 人在匹配中
                  </div>
                  <button className="btn ghost" onClick={handleMatchmakingLeave} style={{ width: "100%" }}>
                    取消匹配
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 加入房间对话框 */}
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
              background: "white",
              padding: 24,
              borderRadius: 8,
              minWidth: 320,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 16 }}>创建房间</h3>
            <div style={{ marginBottom: 12, color: "#666", fontSize: 12 }}>
              允许最多 50 人；题目数量 5-100（默认 5），房主手动开始。
            </div>
            <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
              本局题目数量（5-100）
            </label>
            <input
              type="number"
              min={5}
              max={100}
              value={createRoomRounds}
              onChange={(e) => setCreateRoomRounds(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                marginBottom: 16,
                borderRadius: 4,
                border: "1px solid #ddd",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleConfirmCreateRoom();
                }
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={handleConfirmCreateRoom} style={{ flex: 1 }}>
                确认创建
              </button>
              <button
                className="btn ghost"
                onClick={() => setShowCreateRoomDialog(false)}
                style={{ flex: 1 }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 加入房间对话框 */}
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
              background: "white",
              padding: 24,
              borderRadius: 8,
              minWidth: 300,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 16 }}>加入房间</h3>
            <input
              type="text"
              placeholder="输入房间邀请码"
              value={joinRoomCode}
              onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
              style={{
                width: "100%",
                padding: 8,
                marginBottom: 16,
                borderRadius: 4,
                border: "1px solid #ddd",
              }}
              maxLength={6}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleJoinRoom();
                }
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={handleJoinRoom} style={{ flex: 1 }}>
                加入
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  setShowJoinRoomDialog(false);
                  setJoinRoomCode("");
                }}
                style={{ flex: 1 }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {roomError && (
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
          onClick={() => setRoomError("")}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 8,
              minWidth: 300,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 16 }}>提示</h3>
            <div style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
              {roomError}
            </div>
            <button
              className="btn"
              style={{ width: "100%" }}
              onClick={() => setRoomError("")}
            >
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
