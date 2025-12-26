// import React from "react";
import { API_BASE } from "../layout";
import { fetchProfile, getToken, type ProfileWithRole } from "../auth";
import { useCallback, useEffect, useState } from "react";

export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [annLoading, setAnnLoading] = useState(false);
  const [annError, setAnnError] = useState("");
  const [annForm, setAnnForm] = useState<{ id?: number; title: string; content: string }>({
    title: "",
    content: "",
  });
  const [profile, setProfile] = useState<ProfileWithRole | null>(null);

  const loadAnnouncements = useCallback(async (includeDeleted = false) => {
    setAnnLoading(true);
    setAnnError("");
    try {
      const resp = await fetch(`${API_BASE}/announcements${includeDeleted ? "?includeDeleted=1" : ""}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setAnnouncements(data);
    } catch (e) {
      setAnnError((e as Error).message);
    } finally {
      setAnnLoading(false);
    }
  }, []);

  const saveAnnouncement = async () => {
    if (!profile?.role || profile.role < 1 || !profile.isAnnouncementAdmin) {
      setAnnError("没有发布权限");
      return;
    }
    if (!annForm.title.trim() || !annForm.content.trim()) {
      setAnnError("标题和内容必填");
      return;
    }
    const token = getToken();
    if (!token) {
      setAnnError("请先登录");
      return;
    }
    const isEdit = !!annForm.id;
    const url = isEdit ? `${API_BASE}/announcements/${annForm.id}` : `${API_BASE}/announcements`;
    const method = isEdit ? "PUT" : "POST";
    try {
      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: annForm.title, content: annForm.content }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setAnnForm({ title: "", content: "" });
      loadAnnouncements(true);
    } catch (e) {
      setAnnError((e as Error).message);
    }
  };

  const deleteAnnouncement = async (id: number) => {
    if (!profile?.role || profile.role < 1 || !profile.isAnnouncementAdmin) return;
    const token = getToken();
    if (!token) return;
    try {
      const resp = await fetch(`${API_BASE}/announcements/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      loadAnnouncements(true);
    } catch (e) {
      setAnnError((e as Error).message);
    }
  };

  const restoreAnnouncement = async (id: number) => {
    if (!profile?.role || profile.role < 1 || !profile.isAnnouncementAdmin) return;
    const token = getToken();
    if (!token) return;
    try {
      const resp = await fetch(`${API_BASE}/announcements/${id}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      loadAnnouncements(true);
    } catch (e) {
      setAnnError((e as Error).message);
    }
  };

  useEffect(() => {
    fetchProfile(API_BASE).then((p) => {
      setProfile(p);
      // 主页默认不加载已删除公告
      loadAnnouncements(false);
    });
  }, [loadAnnouncements]);

  return {
    announcements,
    annLoading,
    annError,
    annForm,
    setAnnForm,
    profile,
    saveAnnouncement,
    deleteAnnouncement,
    restoreAnnouncement,
    loadAnnouncements,
  };
}

