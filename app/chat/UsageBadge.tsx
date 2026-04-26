"use client";

type CostSum = {
	tokensIn: number;
	tokensOut: number;
	cacheRead: number;
	cacheWrite: number;
	costUsd: number;
	count: number;
};

type Props = {
	cost:
		| {
				sum: CostSum;
				byTool: Array<{ toolName: string; sum: CostSum }>;
				truncated: boolean;
		  }
		| undefined;
};

const numberFmt = new Intl.NumberFormat("en-US");

function formatUsd(n: number): string {
	if (n === 0) return "$0.0000";
	if (n < 0.0001) return "<$0.0001";
	return `$${n.toFixed(4)}`;
}

export function UsageBadge({ cost }: Props) {
	if (cost === undefined) {
		return (
			<aside
				data-testid="usage-badge"
				style={{
					padding: "0.75rem 1rem",
					border: "1px solid #e5e7eb",
					borderRadius: "0.5rem",
					background: "#fafafa",
					color: "#6b7280",
					fontSize: "0.8125rem",
				}}
			>
				Loading usage…
			</aside>
		);
	}

	const { sum, byTool, truncated } = cost;

	return (
		<aside
			data-testid="usage-badge"
			style={{
				padding: "0.75rem 1rem",
				border: "1px solid #e5e7eb",
				borderRadius: "0.5rem",
				background: "#fafafa",
				display: "grid",
				gap: "0.5rem",
				fontSize: "0.8125rem",
			}}
		>
			<div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "baseline" }}>
				<strong style={{ fontSize: "0.9375rem" }} data-testid="usage-cost">
					{formatUsd(sum.costUsd)}
				</strong>
				<span data-testid="usage-tokens-in">in {numberFmt.format(sum.tokensIn)}</span>
				<span data-testid="usage-tokens-out">out {numberFmt.format(sum.tokensOut)}</span>
				<span data-testid="usage-cache" style={{ color: "#6b7280" }}>
					cache r/w {numberFmt.format(sum.cacheRead)}/{numberFmt.format(sum.cacheWrite)}
				</span>
				<span style={{ marginLeft: "auto", color: "#6b7280" }}>
					{sum.count} {sum.count === 1 ? "step" : "steps"}
				</span>
			</div>
			{byTool.length > 0 ? (
				<div
					data-testid="usage-by-tool"
					style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
				>
					{byTool.map((b) => (
						<span
							key={b.toolName}
							data-testid={`usage-tool-${b.toolName}`}
							style={{
								padding: "0.125rem 0.5rem",
								borderRadius: "0.75rem",
								background: "#eef2ff",
								color: "#3730a3",
								fontSize: "0.75rem",
							}}
						>
							{b.toolName} · {b.sum.count}× · {formatUsd(b.sum.costUsd)}
						</span>
					))}
				</div>
			) : null}
			{truncated ? (
				<p style={{ margin: 0, color: "#92400e", fontSize: "0.75rem" }}>
					Showing partial usage — narrow the time range to see all rows.
				</p>
			) : null}
		</aside>
	);
}
