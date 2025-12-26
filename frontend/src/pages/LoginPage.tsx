import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_BASE } from "../layout";
import { login } from "../auth";
import { usePageTitle } from "../hooks/usePageTitle";

export function LoginPage() {
  usePageTitle("登录");
  const navigate = useNavigate();
  const [msg, setMsg] = React.useState("");
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const username = (formData.get("username") as string).trim();
    const password = (formData.get("password") as string) || "";
    setMsg("登录中...");
    try {
      await login(API_BASE, username, password);
      setMsg("登录成功，跳转中...");
      navigate("/");
      window.location.reload();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };
  return (
    <>
      <section className="hero">
        <h1>登录</h1>
        <p>输入用户名和密码登录</p>
      </section>
      <section className="form-card">
        <form className="form" onSubmit={onSubmit}>
          <label>
            用户名
            <input name="username" type="text" required minLength={3} placeholder="用户名" />
          </label>
          <label>
            密码
            <input name="password" type="password" required minLength={6} placeholder="密码" />
          </label>
          <button type="submit" className="btn">
            登录
          </button>
          <p className="muted small">
            没有账号？ <Link className="link-blue" to="/register">去注册</Link>
          </p>
          <div className="muted small">{msg}</div>
        </form>
      </section>
    </>
  );
}

