import { platformSession } from "@lib/platform/auth";
import SignInGate from "./SignInGate";

/** The platform layout's non-member branch: "sign in", or "not a member" when signed in. */
export default async function NonMemberGate() {
  return <SignInGate signedIn={Boolean(await platformSession())} />;
}
