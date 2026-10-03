import { redirect } from "next/navigation";

export default async function AnalyticsAlias({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) for (const item of value) params.append(key, item);
  }
  redirect(`/admin/analytics${params.size ? `?${params.toString()}` : ""}`);
}
