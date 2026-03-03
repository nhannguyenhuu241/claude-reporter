import { StatsCards } from "@/components/StatsCards";
import { LiveFeed } from "@/components/LiveFeed";
import { SessionList } from "@/components/SessionList";
import { UserProfile } from "@/components/UserProfile";
import { TokenBreakdown } from "@/components/TokenBreakdown";

export default function Dashboard() {
  return (
    <div>
      <UserProfile />
      <StatsCards />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <LiveFeed />
        <TokenBreakdown />
      </div>

      <SessionList />
    </div>
  );
}
