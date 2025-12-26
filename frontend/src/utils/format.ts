// 格式化工具函数

export const roleText = (role?: number) => {
  if (role === 1) return "管理员";
  if (role === -1) return "封禁";
  return "普通用户";
};

export const formatDate = (v?: string) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString("zh-CN");
};

