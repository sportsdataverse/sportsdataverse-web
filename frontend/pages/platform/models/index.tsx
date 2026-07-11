import Link from "next/link";
import type { GetServerSidePropsContext } from "next";
import PlatformShell, { StatusBadge, timeAgo } from "@components/platform/PlatformShell";
import type { PlatformSessionProps } from "@lib/platform/auth";
import { getPlatformSessionProps } from "@lib/platform/auth";
import { listModels } from "@lib/platform/runs";
import type { ModelSummary } from "@lib/platform/schemas";

type ModelsProps = {
  platformSession: PlatformSessionProps;
  models: ModelSummary[];
};

export default function PlatformModels({ platformSession: session, models }: ModelsProps) {
  return (
    <PlatformShell session={session} title="Models">
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        One row per tracked model — grouped from ingested training runs. Gate counts
        reflect the latest run.
      </p>
      {models.length === 0 ? (
        <p className="font-inter text-sm text-muted-foreground">
          Nothing tracked yet. POST a run to <code>/api/platform/runs</code> — recipe in
          SETUP-platform.md.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-left font-inter text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-muted-foreground dark:bg-gray-800/60">
              <tr>
                <th className="px-4 py-2">Model</th>
                <th className="px-4 py-2">Sport</th>
                <th className="px-4 py-2">Runs</th>
                <th className="px-4 py-2">Latest run</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Gates</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.model_id} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="px-4 py-2 font-medium">
                    <Link
                      href={`/platform/models/${model.model_id}`}
                      className="hover:text-primary"
                    >
                      {model.model_id}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{model.sport}</td>
                  <td className="px-4 py-2">{model.run_count}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {timeAgo(model.latest_run_at)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={model.latest_status} />
                  </td>
                  <td className="px-4 py-2">
                    {model.gates_total === 0 ? (
                      <span className="text-muted-foreground">–</span>
                    ) : (
                      <StatusBadge
                        status={model.gates_passed === model.gates_total ? "passed" : "failed"}
                      />
                    )}
                    {model.gates_total > 0 ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {model.gates_passed}/{model.gates_total}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PlatformShell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getPlatformSessionProps(ctx);
  if (!session.authorized) {
    return { props: { platformSession: session, models: [] } };
  }
  const models = await listModels().catch(() => []);
  return { props: { platformSession: session, models } };
}
