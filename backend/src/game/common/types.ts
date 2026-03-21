export interface BasePlayer {
    uid: number;
    username: string;
    avatar: string;
    score: number;
}

export interface VoteSession {
    type: string;             // e.g., 'skip', 'end', 'draw'
    initiator: number;        // 发起者 UID
    requests: Set<number>;    // 同意或拒绝的用户集合
    votes: Map<number, "accept" | "reject">; // 投票详情
    voteOnlineCount: number;  // 发起时的在线人数基数
}

export interface BaseRoom<TState = any> {
    id: string; // 房间号
    hostId: number;
    players: BasePlayer[];
    status: "waiting" | "playing" | "finished";
    currentRound: number;
    maxRounds: number;
    playerScores: Map<number, number>; // 通用得分系统

    // 游戏专属的数据状态
    state: TState;

    // 投票系统、在线状态等公共属性
    activeVotes: Map<string, VoteSession>;
    createdAt: number;
    lastActivity: number;
    allJoinedUsers: Set<number>;
    onlineUsers: Set<number>;
    autoStart: boolean; // 是否自动开局（匹配房=true）
}

export interface BaseSubmission {
    id: string;
    userId: number;
    username: string;
    answer: string;
    isCorrect: boolean;
    verdictText?: string;
    submittedAt: string;
    // 附加字段可以由具体游戏自行扩展或序列化
    data?: any;
}
