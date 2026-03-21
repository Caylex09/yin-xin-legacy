// import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_BASE } from "../config";
import { register, sendCode } from "../auth";
import { usePageTitle } from "../hooks/usePageTitle";
import { useState } from "react";

export function RegisterPage() {
  usePageTitle("注册");
  const navigate = useNavigate();
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const username = (formData.get("username") as string).trim();
    const password = (formData.get("password") as string) || "";
    const email = (formData.get("email") as string).trim();
    const code = (formData.get("code") as string).trim();
    if (username.length < 3 || password.length < 6) {
      setMsg("用户名或密码太短");
      return;
    }
    if (!email || !code) {
      setMsg("邮箱和验证码必填");
      return;
    }
    setMsg("注册中...");
    try {
      await register(API_BASE, username, password, email, code);
      setMsg("注册成功，跳转中...");
      navigate("/");
      window.location.reload();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };
  return (
    <>
      <section className="hero">
        <h1>注册</h1>
        <p>创建一个新账号</p>
      </section>
      <section className="form-card">
        <form className="form" onSubmit={onSubmit}>
          <label>
            用户名
            <input name="username" type="text" required minLength={3} placeholder="用户名（至少3位）" />
          </label>
          <label>
            邮箱
            <div className="input-with-btn">
              <input name="email" type="email" required placeholder="邮箱" />
              <button
                className="btn ghost"
                type="button"
                disabled={sending}
                onClick={async () => {
                  const email = (document.querySelector<HTMLInputElement>('input[name="email"]')?.value || "").trim();
                  if (!email) {
                    setMsg("请输入邮箱");
                    return;
                  }
                  setSending(true);
                  setMsg("发送验证码...");
                  try {
                    await sendCode(API_BASE, email);
                    setMsg("验证码已发送，请查收邮箱");
                  } catch (err) {
                    setMsg((err as Error).message);
                  } finally {
                    setSending(false);
                  }
                }}
              >
                发送验证码
              </button>
            </div>
          </label>
          <label>
            验证码
            <input name="code" type="text" required placeholder="邮箱验证码" />
          </label>
          <label>
            密码
            <input name="password" type="password" required minLength={6} placeholder="密码（至少6位）" />
          </label>
          <button type="submit" className="btn">
            注册
          </button>
          <p className="muted small">
            已有账号？ <Link className="link-blue" to="/login">去登录</Link>
          </p>
          <div className="muted small">{msg}</div>
        </form>
      </section>
    </>
  );
}

