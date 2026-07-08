import { signOut } from "@/app/actions";

export default function SignOutLink() {
  return (
    <form action={signOut} className="flex justify-end">
      <button type="submit" className="text-xs text-text3 hover:text-red">
        ออกจากระบบ
      </button>
    </form>
  );
}
