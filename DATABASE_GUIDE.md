# 数据库操作指南

## 基本流程

### 1. 获取数据库连接

```typescript
import { getDb } from "./db";

const db = getDb(); // 获取数据库实例
```

### 2. 准备 SQL 语句（Prepare Statement）

使用 `db.prepare()` 准备 SQL 语句，这是推荐的做法，可以防止 SQL 注入：

```typescript
const stmt = db.prepare("INSERT INTO table_name (column1, column2) VALUES (?, ?)");
```

### 3. 执行 SQL 语句

使用 `.run()` 执行插入、更新或删除操作：

```typescript
stmt.run(value1, value2);
```

## 插入新数据（INSERT）

### 基本插入

```typescript
import { getDb } from "./db";

const db = getDb();

// 准备插入语句
const stmt = db.prepare(
  "INSERT INTO users (username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)"
);

// 执行插入
const info = stmt.run(
  "新用户名",
  "user@example.com",
  "hashed_password",
  0,
  new Date().toISOString()
);

// info.lastInsertRowid 是插入的新行的 ID
console.log("新用户 ID:", info.lastInsertRowid);
```

### 插入并获取结果

```typescript
// 插入数据
const info = db.prepare(
  "INSERT INTO announcements (title, content, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
).run(
  "标题",
  "内容",
  userId,
  now,
  now
);

// 获取刚插入的数据
const newRecord = db.prepare("SELECT * FROM announcements WHERE id = ?").get(info.lastInsertRowid);
```

## 更新数据（UPDATE）

```typescript
const db = getDb();

// 更新单条记录
const info = db.prepare("UPDATE users SET username = ? WHERE uid = ?").run("新用户名", userId);

// info.changes 表示受影响的行数
if (info.changes === 0) {
  console.log("没有找到要更新的记录");
}
```

## 查询数据（SELECT）

```typescript
const db = getDb();

// 查询单条记录
const user = db.prepare("SELECT * FROM users WHERE uid = ?").get(userId);

// 查询多条记录
const users = db.prepare("SELECT * FROM users WHERE role = ?").all(1);

// 查询特定字段
const username = db.prepare("SELECT username FROM users WHERE uid = ?").get(userId) as { username: string } | undefined;
```

## 删除数据（DELETE）

```typescript
const db = getDb();

// 删除记录
const info = db.prepare("DELETE FROM users WHERE uid = ?").run(userId);

// 软删除（标记为已删除）
db.prepare("UPDATE announcements SET deleted = 1 WHERE id = ?").run(announcementId);
```

## 事务（Transaction）

当需要执行多个操作时，使用事务确保数据一致性：

```typescript
const db = getDb();

db.transaction(() => {
  // 在事务中执行多个操作
  db.prepare("INSERT INTO table1 (col1) VALUES (?)").run(value1);
  db.prepare("INSERT INTO table2 (col2) VALUES (?)").run(value2);
  db.prepare("UPDATE table3 SET col3 = ? WHERE id = ?").run(value3, id);
})(); // 注意：需要调用这个函数
```

## 实际例子

### 例子 1：创建新公告

```typescript
// 在 index.ts 中
app.post("/api/announcements", requireLogin, (req, res) => {
  try {
    const { title, content } = req.body;
    const db = getDb();
    const now = new Date().toISOString();
    
    const info = db.prepare(
      "INSERT INTO announcements (title, content, created_by, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)"
    ).run(title, content, (req as any).uid, now, now);
    
    // 获取刚创建的公告
    const newAnnouncement = db.prepare(
      "SELECT * FROM announcements WHERE id = ?"
    ).get(info.lastInsertRowid);
    
    res.json(newAnnouncement);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
```

### 例子 2：创建新表并插入数据

```typescript
// 在 db.ts 的 getDb() 函数中添加新表
db.exec(`
  CREATE TABLE IF NOT EXISTS my_new_table (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

// 插入数据
const stmt = db.prepare("INSERT INTO my_new_table (name, value, created_at) VALUES (?, ?, ?)");
stmt.run("测试", 100, new Date().toISOString());
```

### 例子 3：批量插入

```typescript
const db = getDb();
const stmt = db.prepare("INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)");

db.transaction(() => {
  for (const user of userList) {
    stmt.run(user.username, user.email, user.passwordHash, new Date().toISOString());
  }
})();
```

## 注意事项

1. **使用参数化查询**：始终使用 `?` 占位符，不要直接拼接字符串，防止 SQL 注入
2. **处理错误**：使用 try-catch 包裹数据库操作
3. **检查结果**：使用 `info.changes` 检查操作是否成功
4. **日期格式**：使用 ISO 8601 格式（`new Date().toISOString()`）
5. **事务**：多个相关操作使用事务确保原子性
6. **索引**：对于经常查询的字段，考虑创建索引提高性能

## 查看现有表结构

```typescript
// 查看表的所有列
const columns = db.prepare("PRAGMA table_info(users)").all();
console.log(columns);

// 查看所有表
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables);
```

## 常见错误处理

```typescript
try {
  const stmt = db.prepare("INSERT INTO users (username, email) VALUES (?, ?)");
  stmt.run(username, email);
} catch (e) {
  if ((e as any).code === 'SQLITE_CONSTRAINT_UNIQUE') {
    // 唯一约束冲突（例如用户名或邮箱已存在）
    console.error("用户名或邮箱已存在");
  } else {
    console.error("数据库错误:", e);
  }
}
```

