import { RegistrationForm } from "../_components/auth-forms";
import { PublicFrame } from "../_components/public-frame";

export default function RegisterPage() {
  return <PublicFrame eyebrow="ALUMNI REGISTRATION" title="Find your place." description="Use the full name and email address on the verified alumni roster. Every request is reviewed before community access begins." footer={<>Already registered? <a href="/login">Sign in</a></>}>
    <RegistrationForm />
  </PublicFrame>;
}
