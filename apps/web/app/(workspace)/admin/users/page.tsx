import { ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { listProfiles } from "@/lib/users";
import { CreateUserForm } from "./create-user-form";
import { updateUser } from "./actions";

export default async function UsersPage() {
  const [viewer, users] = await Promise.all([requireRole(["administrator"]), listProfiles()]);
  return <div className="content">
    <div className="title-row"><div><p className="kicker">Administration</p><h1>User access</h1><p>Provision accounts, assign roles, and suspend access centrally.</p></div><span className="role-summary"><ShieldCheck />{users.length} managed accounts</span></div>
    <CreateUserForm />
    <section className="table-card"><div className="table-head"><div><h2>Workspace users</h2><p>Role changes are enforced by server checks and database policies.</p></div></div><div className="table-scroll"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Created</th><th>Save</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><b>{user.displayName}</b><small>{user.email}</small></td><td colSpan={4}><form action={updateUser} className="inline-user-form"><input type="hidden" name="userId" value={user.id} /><input aria-label={`Display name for ${user.displayName}`} name="displayName" defaultValue={user.displayName} />{user.id === viewer.id && <><input type="hidden" name="role" value={user.role} /><input type="hidden" name="status" value={user.status} /></>}<select aria-label={`Role for ${user.displayName}`} name="role" defaultValue={user.role} disabled={user.id === viewer.id}>{Object.entries(ROLE_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label={`Status for ${user.displayName}`} name="status" defaultValue={user.status} disabled={user.id === viewer.id}><option value="active">Active</option><option value="inactive">Inactive</option></select><span>{new Intl.DateTimeFormat("en-MU", { dateStyle: "medium" }).format(new Date(user.createdAt))}</span><button className="secondary" type="submit">Save</button></form></td></tr>)}</tbody></table></div></section>
  </div>;
}
