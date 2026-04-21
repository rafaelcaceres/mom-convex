"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
	const { signOut } = useAuthActions();
	const router = useRouter();
	return (
		<button
			type="button"
			onClick={async () => {
				await signOut();
				router.replace("/");
			}}
			style={{
				padding: "0.4rem 0.9rem",
				background: "white",
				color: "#111",
				border: "1px solid #ddd",
				borderRadius: "0.25rem",
				cursor: "pointer",
				fontSize: "0.875rem",
			}}
		>
			Sign out
		</button>
	);
}
