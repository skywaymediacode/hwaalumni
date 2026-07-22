import { LoginForm } from "../_components/auth-forms";
import { PublicFrame } from "../_components/public-frame";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string; status?: string }> }) {
  const query = await searchParams;
  return <PublicFrame eyebrow="MEMBER SIGN IN" title="Welcome back." description="Sign in to continue to your private alumni community." footer={<>New to HWA Connect? <a href="/register">Request access</a></>}>
    <LoginForm next={query.next ?? ""} resetComplete={query.reset === "complete"} />
    {query.status === "unavailable" && <p className="form-notice error">This account cannot access the community right now.</p>}
  </PublicFrame>;
}
